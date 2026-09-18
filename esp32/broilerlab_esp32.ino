/*
 * BroilerLab ESP32 — direct HTTPS ingestion test firmware.
 *
 * Path: ESP32 -> HTTPS -> Vercel FastAPI -> X-Device-Key auth ->
 *       device's assigned cycle -> existing processor -> Neon -> dashboard.
 *
 * Setup: copy config.example.h to config.h, fill in Wi-Fi + API URL +
 * device key (shown once at POST /api/devices), flash, open Serial @115200.
 *
 * Expected serial output on a healthy boot:
 *   WiFi connected
 *   Time synchronized
 *   Sending event...
 *   HTTP 200
 *   Event accepted
 *
 * Design notes (see esp32/README.md for the full guide):
 * - No ArduinoJson dependency: one flat payload built with snprintf, so RAM
 *   use is deterministic and there is nothing version-sensitive to install.
 * - TLS is validated with an embedded root CA (never setInsecure()).
 * - event_id = <device_id>:<boot_id>:<seq>; boot_id + seq live in NVS, so a
 *   reboot never reuses an id and a retried POST is idempotent server-side.
 * - Unsent events wait in a RAM ring + LittleFS spillover file and are
 *   retried with bounded exponential backoff + jitter. HTTP 400 drops the
 *   event (poison — retrying cannot help); 401/403 halt for re-provisioning.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <time.h>
#include "config.h"

#ifndef SIMULATE_SENSORS
#define SIMULATE_SENSORS 1
#endif
#ifndef SEND_INTERVAL_MS
#define SEND_INTERVAL_MS 15000
#endif
#ifndef QUEUE_MAX
#define QUEUE_MAX 64
#endif

static Preferences prefs;
static char bootId[9] = {0};
static uint32_t seq = 0;
static bool provisionHalted = false;  // 401/403: needs human attention
static unsigned long backoffMs = 2000;
static const unsigned long BACKOFF_MAX_MS = 5UL * 60UL * 1000UL;

// ---------- tiny queue: RAM ring, LittleFS spillover ----------
#define RAMQ 16
static String ramQ[RAMQ];
static int ramHead = 0, ramCount = 0;

static void spillAppend(const String &line) {
  File f = LittleFS.open("/queue.txt", "a");
  if (!f) return;
  f.println(line);
  f.close();
}

static int spillCount() {
  File f = LittleFS.open("/queue.txt", "r");
  if (!f) return 0;
  int n = 0;
  while (f.available()) { if (f.read() == '\n') n++; }
  f.close();
  return n;
}

// Drop oldest until total (ram + spill) fits QUEUE_MAX.
static void queueTrim() {
  while (ramCount + spillCount() > QUEUE_MAX) {
    if (ramCount > 0) { ramHead = (ramHead + 1) % RAMQ; ramCount--; }
    else {
      File f = LittleFS.open("/queue.txt", "r");
      if (!f) return;
      f.readStringUntil('\n');  // skip oldest line
      String rest = f.readString();
      f.close();
      LittleFS.remove("/queue.txt");
      File w = LittleFS.open("/queue.txt", "w");
      if (w) { w.print(rest); w.close(); }
    }
  }
}

static void queuePush(const String &line) {
  if (ramCount < RAMQ) { ramQ[(ramHead + ramCount) % RAMQ] = line; ramCount++; }
  else spillAppend(line);
  queueTrim();
}

// Oldest-first pop into `out`. Returns false when empty.
static bool queuePop(String &out) {
  if (ramCount > 0) { out = ramQ[ramHead]; ramHead = (ramHead + 1) % RAMQ; ramCount--; return true; }
  File f = LittleFS.open("/queue.txt", "r");
  if (!f) return false;
  out = f.readStringUntil('\n');
  out.trim();
  String rest = f.readString();
  f.close();
  LittleFS.remove("/queue.txt");
  if (rest.length() > 0) {
    File w = LittleFS.open("/queue.txt", "w");
    if (w) { w.print(rest); w.close(); }
  }
  return out.length() > 0;
}

// ---------- helpers ----------
static void blink(int times, int msOn = 120) {
#if defined(LED_BUILTIN)
  pinMode(LED_BUILTIN, OUTPUT);
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_BUILTIN, HIGH); delay(msOn);
    digitalWrite(LED_BUILTIN, LOW); delay(msOn);
  }
#endif
}

static unsigned long backoffWithJitter() {
  unsigned long capped = backoffMs > BACKOFF_MAX_MS ? BACKOFF_MAX_MS : backoffMs;
  unsigned long jitter = (unsigned long)(esp_random() % 1000);
  return capped + jitter;
}

static void backoffGrow() {
  backoffMs = backoffMs * 2;
  if (backoffMs > BACKOFF_MAX_MS) backoffMs = BACKOFF_MAX_MS;
}

static void backoffReset() { backoffMs = 2000; }

// ISO-8601 UTC for an epoch: 2026-09-19T12:30:00Z
static void isoUtc(time_t t, char *out, size_t n) {
  struct tm tmv;
  gmtime_r(&t, &tmv);
  snprintf(out, n, "%04d-%02d-%02dT%02d:%02d:%02dZ",
           tmv.tm_year + 1900, tmv.tm_mon + 1, tmv.tm_mday,
           tmv.tm_hour, tmv.tm_min, tmv.tm_sec);
}

// Minimal JSON string escaper (RFIDs are alnum, but stay correct anyway).
static String jesc(const char *s) {
  String o;
  for (const char *p = s; *p; p++) {
    if (*p == '"' || *p == '\\') o += '\\';
    o += *p;
  }
  return o;
}

static bool wifiUp() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.println("WiFi reconnecting...");
  WiFi.reconnect();
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(250);
  return WiFi.status() == WL_CONNECTED;
}

static bool timeSynced() {
  struct tm tmv;
  if (!getLocalTime(&tmv, 2000)) return false;
  return tmv.tm_year + 1900 >= 2024;  // obviously-unsynced clocks read 1970
}

// ---------- sensors (test values until hardware is wired) ----------
struct Reading { float weight_g; float feed_delta_g; float temp_c; float humidity; int rssi; };

static Reading readSensors() {
  Reading r;
#if SIMULATE_SENSORS
  // Plausible walk-around values so the whole path is testable today.
  static float w = 1820.0;
  w += (float)(esp_random() % 60) / 10.0f - 3.0f;  // gentle drift
  r.weight_g = w;
  r.feed_delta_g = 3.2f;
  r.temp_c = 24.5f;
  r.humidity = 58.2f;
#else
  // TODO: replace with real HX711 / DHT22 / load-cell reads.
  r.weight_g = 0; r.feed_delta_g = 0; r.temp_c = 0; r.humidity = 0;
#endif
  r.rssi = WiFi.RSSI();
  return r;
}

// ---------- HTTP ----------
static int postEvent(const String &payload, String &respOut) {
  WiFiClientSecure client;
  client.setCACert(BROILERLAB_ROOT_CA);
  client.setTimeout(15000);
  HTTPClient http;
  String url = String(BROILERLAB_API_URL) + "/api/device/ingest";
  if (!http.begin(client, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", BROILERLAB_DEVICE_KEY);
  http.setTimeout(15000);
  int code = http.POST(payload);
  if (code > 0) respOut = http.getString();
  http.end();
  return code;
}

// Returns: 0 sent (accepted or duplicate), 1 retry later, -1 drop, -2 halt.
static int handleOne(const String &payload) {
  String resp;
  int code = postEvent(payload, resp);
  if (code == 200) {
    bool dup = resp.indexOf("\"duplicate\":true") >= 0;
    Serial.println(dup ? "Event duplicate (already stored)" : "Event accepted");
    backoffReset();
    blink(1);
    return 0;
  }
  if (code == 400) { Serial.println("HTTP 400 (poison event, dropping): " + resp); return -1; }
  if (code == 401) { Serial.println("HTTP 401 (bad key — re-provision, halting)"); return -2; }
  if (code == 403) { Serial.println("HTTP 403 (device disabled — halting)"); return -2; }
  if (code == 429 || (code >= 500 && code < 600) || code < 0) {
    Serial.printf("Transient failure (HTTP %d), will retry\n", code);
    return 1;
  }
  Serial.printf("Unexpected HTTP %d: %s\n", code, resp.c_str());
  return 1;
}

static void flushQueue() {
  String line;
  int guard = 0;
  while (guard++ < QUEUE_MAX && queuePop(line)) {
    int r = handleOne(line);
    if (r == 0 || r == -1) continue;       // sent or poison: keep draining
    if (r == -2) { provisionHalted = true; queuePush(line); return; }
    queuePush(line);                        // transient: requeue + back off
    backoffGrow();
    return;
  }
}

// ---------- Arduino entry points ----------
void setup() {
  Serial.begin(115200);
  delay(500);
  prefs.begin("broiler", false);
  seq = prefs.getUInt("seq", 0);
  String b = prefs.getString("boot", "");
  if (b.length() == 0) {
    uint32_t r = esp_random();
    b = String(r, HEX);
    b.toUpperCase();
    prefs.putString("boot", b);
  }
  b.toCharArray(bootId, sizeof(bootId));
  if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed (RAM queue only)");

  Serial.printf("BroilerLab ESP32 %s boot=%s seq=%lu\n", FIRMWARE_VERSION, bootId, (unsigned long)seq);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi connecting");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) { delay(400); Serial.print("."); }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) { Serial.println("WiFi failed at boot (will retry in loop)"); return; }
  Serial.println("WiFi connected");

  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);
  t0 = millis();
  while (!timeSynced() && millis() - t0 < 20000) delay(400);
  if (!timeSynced()) Serial.println("NTP failed at boot (events held until time syncs)");
  else Serial.println("Time synchronized");
}

void loop() {
  if (provisionHalted) { blink(3, 400); delay(5000); return; }  // needs a human
  if (!wifiUp()) { delay(5000); return; }
  if (!timeSynced()) { Serial.println("Waiting for NTP..."); delay(5000); return; }

  // 1) drain anything queued during an outage, oldest first
  flushQueue();
  if (provisionHalted) return;

  // 2) take a fresh reading and queue it (queue-then-send keeps exactly
  //    one ordering rule: oldest first, even across reboots)
  Reading r = readSensors();
  char ts[24];
  isoUtc(time(nullptr), ts, sizeof(ts));
  char eid[96];
  snprintf(eid, sizeof(eid), "%s:%s:%lu", DEVICE_ID, bootId, (unsigned long)seq);

  char body[512];
  snprintf(body, sizeof(body),
           "{\"event_id\":\"%s\",\"timestamp\":\"%s\",\"event\":\"entry\","
           "\"bird_id\":\"RFID-001\",\"sensor_id\":\"%s\",\"flock_id\":\"%s\","
           "\"weight_g\":%.1f,\"feed_delta_g\":%.1f,\"temp_c\":%.1f,"
           "\"humidity\":%.1f,\"rssi\":%d,\"firmware\":\"%s\"}",
           eid, ts, jesc(SENSOR_ID).c_str(), jesc(FLOCK_ID).c_str(),
           r.weight_g, r.feed_delta_g, r.temp_c, r.humidity, r.rssi,
           FIRMWARE_VERSION);
  queuePush(String(body));
  seq++;
  prefs.putUInt("seq", seq);

  // 3) send (retries keep the same event_id -> server idempotent)
  Serial.println("Sending event...");
  flushQueue();

  unsigned long wait = SEND_INTERVAL_MS;
  if (backoffMs > 2000) wait = backoffWithJitter() > wait ? backoffWithJitter() : wait;
  delay(wait);
}
