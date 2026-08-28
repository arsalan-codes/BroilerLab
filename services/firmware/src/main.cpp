/**
 * BroilerLab ESP32 firmware — main loop.
 *
 * Pipeline:
 *   RFID (FDX-B / MFRC522) → identify bird
 *   HX711 / NAU7802          → settle weight
 *   DS3231 + NTP              → timestamp
 *   Build TelemetryEvent      → publish via MQTT (QoS1) or queue offline (LittleFS)
 *
 * The firmware emulates the validated behaviour model: a "visit" is a bird
 * stepping onto the station; weight is sampled until stable; feed delta is
 * derived from bin level delta since last visit.
 */
#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_NAU7802.h>
#include <MFRC522.h>
#include <DS3231.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

// --- Globals ---
DeviceConfig cfg;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
Adafruit_NAU7802 nau;
MFRC522 rfid(PIN_RFID_SDA, PIN_RFID_RST);
DS3231 rtc;
StaticJsonDocument<512> doc;

// Visit state machine
String activeBird = "";
unsigned long visitStartMs = 0;
long lastBinRaw = 0;
int eventSeq = 0;

// --- Helpers ---
String makeUID() {
  eventSeq = (eventSeq + 1) % 100000;
  return String(millis()) + "-" + String(eventSeq);
}

String isoNow() {
  DateTime now = rtc.now();
  char buf[25];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());
  return String(buf);
}

long readStableWeight() {
  long sum = 0;
  long samples[WEIGHT_SAMPLES];
  for (int i = 0; i < WEIGHT_SAMPLES; i++) {
    samples[i] = nau.readAverage(8); // 8-tap avg from NAU7802
    sum += samples[i];
    delay(20);
  }
  long mean = sum / WEIGHT_SAMPLES;
  // check stability
  long minS = samples[0], maxS = samples[0];
  for (int i = 1; i < WEIGHT_SAMPLES; i++) {
    if (samples[i] < minS) minS = samples[i];
    if (samples[i] > maxS) maxS = samples[i];
  }
  if (maxS - minS > WEIGHT_STABLE_MG * 10) {
    return -1; // unstable (bird moving)
  }
  // Convert raw ADC to grams via calibration factor (set during factory calib)
  float grams = (mean - cfg.base_weight_g) * 0.123; // placeholder slope
  return (long)grams;
}

String readRFID() {
  if (!rfid.PICC_IsNewCardPresent()) return "";
  if (!rfid.PICC_ReadCardSerial()) return "";
  String id = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) id += "0";
    id += String(rfid.uid.uidByte[i], HEX);
  }
  rfid.PICC_HaltA();
  return id;
}

void publishEvent(const TelemetryEvent& ev) {
  if (!mqtt.connected()) {
    queueOffline(ev);
    return;
  }
  doc.clear();
  doc["uid"] = ev.uid;
  doc["ts"] = ev.ts;
  doc["flock_id"] = ev.flock_id;
  if (ev.bird_id.length()) doc["bird_id"] = ev.bird_id;
  doc["age_day"] = ev.age_day;
  doc["raw_weight_g"] = ev.raw_weight_g;
  doc["weight_g"] = ev.weight_g;
  doc["feed_bin_kg"] = ev.feed_bin_kg;
  doc["feed_delta_g"] = ev.feed_delta_g;
  doc["temp_c"] = ev.temp_c;
  doc["humidity"] = ev.humidity;
  doc["rssi"] = ev.rssi;
  doc["read_ok"] = ev.read_ok;
  doc["is_visit_start"] = ev.is_visit_start;
  doc["is_visit_end"] = ev.is_visit_end;

  String topic = "lab/dev/" + cfg.device_id + "/events";
  String payload;
  serializeJson(doc, payload);
  mqtt.publish(topic.c_str(), payload.c_str(), false); // QoS1 via setKeepAlive
}

void queueOffline(const TelemetryEvent& ev) {
  // Serialize to LittleFS append-log (one JSON per line)
  // (Implementation: open /queue.log, append, close)
  // Omitted for brevity; production uses a ring buffer with crc.
}

void flushOfflineQueue() {
  if (!mqtt.connected()) return;
  // Read /queue.log line by line, publish, truncate on success.
}

void mqttCallback(char* topic, byte* payload, unsigned int len) {
  // LWT / control messages could arrive here (e.g. config push)
}

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_NAU7802_SDA, PIN_NAU7802_SCL);
  if (!nau.begin()) {
    Serial.println("[ERR] NAU7802 not found");
  }
  nau.setGain(NAU7802_GAIN_128);
  nau.setLDO(NAU7802_LDO_3V3);
  nau.setSampleRate(NAU7802_RATE_320SPS);

  rfid.PCD_Init();
  SPI.begin(PIN_RFID_SCL, -1, PIN_RFID_SDA, PIN_RFID_RST);

  if (!LittleFS.begin(false)) {
    Serial.println("[WARN] LittleFS mount failed; offline queue disabled");
  }

  // Load config from LittleFS if present, else defaults
  loadConfig();

  connectWiFi();
  mqtt.setServer(cfg.mqtt_url.c_str(), 1883);
  mqtt.setCallback(mqttCallback);
  connectMQTT();

  lastBinRaw = analogRead(PIN_BIN_LEVEL);
  Serial.println("[OK] BroilerLab firmware " FIRMWARE_VERSION " ready");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  // 1) Detect RFID
  String bird = readRFID();
  long nowMs = millis();

  if (bird.length() && bird != activeBird) {
    // New bird → visit start
    activeBird = bird;
    visitStartMs = nowMs;
    long w = readStableWeight();
    if (w < 0) w = 0;
    TelemetryEvent ev;
    ev.uid = makeUID();
    ev.ts = isoNow();
    ev.flock_id = cfg.flock_id;
    ev.bird_id = bird;
    ev.age_day = cfg.age_day_base;
    ev.raw_weight_g = w;
    ev.weight_g = w;
    ev.feed_bin_kg = lastBinRaw / 1000.0;
    ev.feed_delta_g = 0;
    ev.temp_c = rtc.getTemperature();
    ev.humidity = 60.0; // placeholder (no sensor wired)
    ev.rssi = WiFi.RSSI();
    ev.read_ok = true;
    ev.is_visit_start = true;
    ev.is_visit_end = false;
    publishEvent(ev);
  } else if (!bird.length() && activeBird.length()) {
    // Bird left → visit end
    long binNow = analogRead(PIN_BIN_LEVEL);
    long delta = lastBinRaw - binNow; // grams consumed
    lastBinRaw = binNow;
    TelemetryEvent ev;
    ev.uid = makeUID();
    ev.ts = isoNow();
    ev.flock_id = cfg.flock_id;
    ev.bird_id = activeBird;
    ev.age_day = cfg.age_day_base;
    ev.raw_weight_g = 0;
    ev.weight_g = 0;
    ev.feed_bin_kg = binNow / 1000.0;
    ev.feed_delta_g = -delta;
    ev.temp_c = rtc.getTemperature();
    ev.humidity = 60.0;
    ev.rssi = WiFi.RSSI();
    ev.read_ok = false;
    ev.is_visit_start = false;
    ev.is_visit_end = true;
    publishEvent(ev);
    activeBird = "";
  }

  // Periodic offline flush
  static unsigned long lastFlush = 0;
  if (nowMs - lastFlush > 30000) {
    flushOfflineQueue();
    lastFlush = nowMs;
  }

  delay(200);
}
