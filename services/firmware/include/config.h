/**
 * BroilerLab firmware — shared data structures & MQTT topic schema.
 * Mirrors the backend IngestEventDto (12-col device schema).
 *
 * Topic: lab/dev/{deviceId}/events
 * QoS: 1, Retained: false, LWT: lab/dev/{deviceId}/status "offline"
 */
#pragma once

#include <Arduino.h>

// Device identity (set via LittleFS config or compile-time)
#define DEVICE_ID_DEFAULT "F01"
#define FLOCK_ID_DEFAULT  "S1"
#define FIRMWARE_VERSION  "0.1.0"

// Pin mapping (adjust per wiring harness)
#define PIN_HX711_DT   4
#define PIN_HX711_SCK  5
#define PIN_NAU7802_SDA 21
#define PIN_NAU7802_SCL 22
#define PIN_RFID_SDA   16
#define PIN_RFID_SCL   17
#define PIN_RFID_RST   15
#define PIN_DS3231_SDA 21
#define PIN_DS3231_SCL 22
#define PIN_BIN_LEVEL  34   // analog feed-bin level sensor (0-4095)

// Sampling / behaviour
#define WEIGHT_SAMPLES   10
#define WEIGHT_STABLE_MG 50   // g variation to consider "settled"
#define VISIT_TIMEOUT_MS 90000 // co-feeding window
#define OFFLINE_QUEUE_MAX 256

struct TelemetryEvent {
  String uid;          // idempotency key (device-generated, e.g. millis+seq)
  String ts;          // ISO8601 UTC
  String flock_id;
  String bird_id;     // "" if RFID miss
  int    age_day;
  long   raw_weight_g;
  long   weight_g;
  float  feed_bin_kg;
  long   feed_delta_g;
  float  temp_c;
  float  humidity;
  int    rssi;        // WiFi RSSI (placeholder for LoRa/RFID signal)
  bool   read_ok;     // RFID read succeeded
  bool   is_visit_start;
  bool   is_visit_end;
};

struct DeviceConfig {
  String device_id = DEVICE_ID_DEFAULT;
  String flock_id = FLOCK_ID_DEFAULT;
  String mqtt_url = "mqtt://127.0.0.1:1883";
  String mqtt_user = "";
  String mqtt_pass = "";
  String wifi_ssid = "";
  String wifi_pass = "";
  int    age_day_base = 1;
  long   base_weight_g = 45; // expected day-1 weight for age calc
};

// Forward decls
void loadConfig();
void saveConfig();
bool connectWiFi();
bool connectMQTT();
void publishEvent(const TelemetryEvent& ev);
void queueOffline(const TelemetryEvent& ev);
void flushOfflineQueue();
