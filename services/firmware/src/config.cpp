/**
 * BroilerLab firmware — config persistence (LittleFS) + WiFi/MQTT connect.
 */
#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

extern WiFiClient wifiClient;
extern PubSubClient mqtt;

void loadConfig() {
  // Defaults already set in DeviceConfig ctor. Override from /config.json.
  if (!LittleFS.exists("/config.json")) return;
  File f = LittleFS.open("/config.json", "r");
  if (!f) return;
  StaticJsonDocument<512> d;
  if (deserializeJson(d, f)) {
    f.close();
    return;
  }
  if (d["device_id"]) cfg.device_id = d["device_id"].as<String>();
  if (d["flock_id"]) cfg.flock_id = d["flock_id"].as<String>();
  if (d["mqtt_url"]) cfg.mqtt_url = d["mqtt_url"].as<String>();
  if (d["mqtt_user"]) cfg.mqtt_user = d["mqtt_user"].as<String>();
  if (d["mqtt_pass"]) cfg.mqtt_pass = d["mqtt_pass"].as<String>();
  if (d["wifi_ssid"]) cfg.wifi_ssid = d["wifi_ssid"].as<String>();
  if (d["wifi_pass"]) cfg.wifi_pass = d["wifi_pass"].as<String>();
  if (d["age_day_base"]) cfg.age_day_base = d["age_day_base"].as<int>();
  f.close();
}

void saveConfig() {
  File f = LittleFS.open("/config.json", "w");
  if (!f) return;
  StaticJsonDocument<512> d;
  d["device_id"] = cfg.device_id;
  d["flock_id"] = cfg.flock_id;
  d["mqtt_url"] = cfg.mqtt_url;
  d["mqtt_user"] = cfg.mqtt_user;
  d["mqtt_pass"] = cfg.mqtt_pass;
  d["wifi_ssid"] = cfg.wifi_ssid;
  d["wifi_pass"] = cfg.wifi_pass;
  d["age_day_base"] = cfg.age_day_base;
  serializeJson(d, f);
  f.close();
}

bool connectWiFi() {
  if (cfg.wifi_ssid.length() == 0) return false;
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin(cfg.wifi_ssid.c_str(), cfg.wifi_pass.c_str());
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    tries++;
  }
  return WiFi.status() == WL_CONNECTED;
}

bool connectMQTT() {
  if (!connectWiFi()) return false;
  String lwtTopic = "lab/dev/" + cfg.device_id + "/status";
  if (mqtt.connect(cfg.device_id.c_str(), cfg.mqtt_user.c_str(), cfg.mqtt_pass.c_str(),
                   lwtTopic.c_str(), 1, true, "offline")) {
    mqtt.publish(lwtTopic.c_str(), "online", true);
    return true;
  }
  return false;
}
