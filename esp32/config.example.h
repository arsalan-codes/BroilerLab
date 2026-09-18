// BroilerLab ESP32 — COPY this file to config.h and fill in YOUR values.
// config.h is git-ignored: real Wi-Fi credentials and device keys must
// never be committed. See esp32/README.md for the full setup guide.
#pragma once

// ---- Wi-Fi ----
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// ---- BroilerLab server (HTTPS only, never plain http in production) ----
#define BROILERLAB_API_URL  "https://YOUR_PROJECT.vercel.app"

// Device credential: shown ONCE when the device is registered via
// POST /api/devices (or rotated via .../rotate-key). This is the ONLY
// secret on the device — no DB passwords, no JWT secrets, ever.
#define BROILERLAB_DEVICE_KEY "BLD_esp32_PASTE_YOUR_KEY_HERE"

// Stable identity of this unit (must equal the device_id registered
// server-side; used in event_id generation and as sensor fallback).
#define DEVICE_ID "esp32-feedstation-01"

// Optional static metadata sent with every event (may be overridden by
// live sensor reads below).
#define SENSOR_ID "ESP32-01"
#define FLOCK_ID  "FLOCK-01"

// ---- behavior ----
#define SEND_INTERVAL_MS   15000   // simulated/test cadence
#define SIMULATE_SENSORS   1       // 1 = test values, 0 = read real sensors
#define FIRMWARE_VERSION   "1.0.0"

// NTP (UTC): the server rejects ancient/far-future timestamps, so the
// device must synchronize time before its first event.
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"

// Queue: unsent events wait here during outages (RAM ring + LittleFS
// spillover, oldest dropped past QUEUE_MAX).
#define QUEUE_MAX 64

// ---- TLS trust ----
// Production MUST validate the server certificate. Paste the PEM of the
// root CA that signs YOUR_PROJECT.vercel.app (currently the Let's Encrypt
// ISRG Root X1 — fetch it, do not invent it):
//
//   openssl s_client -connect YOUR_PROJECT.vercel.app:443 -showcerts
//
// ...and paste the LAST (self-signed root) certificate below, replacing
// this placeholder. NEVER ship with setInsecure() in production.
#define BROILERLAB_ROOT_CA \
  "-----BEGIN CERTIFICATE-----\n" \
  "PASTE_ISRG_ROOT_X1_PEM_HERE\n" \
  "-----END CERTIFICATE-----\n"
