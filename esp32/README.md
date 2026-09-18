# BroilerLab ESP32 — direct HTTPS ingestion

```
ESP32
  │  HTTPS + X-Device-Key
  ▼
Vercel (FastAPI /api/device/ingest)
  │  device -> cycle -> user resolution
  ▼
existing CycleProcessor -> DeviceLog + Visit -> Neon -> dashboard
```

## 1. What you need

* ESP32 dev board, Arduino IDE (ESP32 core ≥ 2.0), USB cable
* Libraries (all stock with the ESP32 core — **nothing to install**):
  `WiFi.h`, `WiFiClientSecure.h`, `HTTPClient.h`, `Preferences.h`,
  `LittleFS.h`. The payload is built with `snprintf` on purpose: zero
  third-party JSON dependencies, deterministic RAM use.
* A BroilerLab account + one cycle (create it in the dashboard).

## 2. Register the device, get its key (shown ONCE)

```bash
# login, create a cycle if needed, then register the device:
curl -X POST "https://YOUR_PROJECT.vercel.app/api/devices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"device_id":"esp32-feedstation-01","name":"Feed Station 01","cycle_id":12}'
# -> {"id":1,"device_id":"esp32-feedstation-01",...,"api_key":"BLD_..."}
```

Copy `api_key` now — it is SHA256-stored and can never be read back
(only rotated). The server binds this device to cycle 12; the firmware
can never select another cycle.

## 3. Configure + flash

```bash
cp config.example.h config.h   # config.h is git-ignored, never commit it
# edit config.h: Wi-Fi, BROILERLAB_API_URL, BROILERLAB_DEVICE_KEY,
# DEVICE_ID (must match registration), root CA (below)
```

Flash `broilerlab_esp32.ino`, open Serial Monitor @ 115200. Healthy boot:

```
WiFi connected
Time synchronized
Sending event...
HTTP 200
Event accepted
```

## 4. TLS trust (production)

1. Export the root CA that signs your domain:
   `openssl s_client -connect YOUR_PROJECT.vercel.app:443 -showcerts`
   (paste the **last**, self-signed block — currently Let's Encrypt ISRG Root X1).
2. Paste it into `BROILERLAB_ROOT_CA` in `config.h`.
3. Never use `client.setInsecure()` in production.
4. Rotation: if the CA changes, update `config.h` and re-flash. The
   firmware fails closed (no send) rather than skipping verification.

## 5. Event IDs + idempotency

`event_id = <device_id>:<boot_id>:<seq>`. `boot_id` is random per first
boot, `seq` increments per reading; both live in NVS, so a reboot never
reuses an id and any retried POST maps to the same server row
(`duplicate:true`, HTTP 200, no second row).

## 6. Offline buffering

Unsent events wait in a 16-slot RAM ring + LittleFS `/queue.txt`
spillover (total capped at `QUEUE_MAX`, oldest dropped). On reconnect
the queue drains oldest-first with the **same** event_ids, so a network
outage costs delay, not data (RAM-only events are lost on power loss —
documented tradeoff; NVS-backed ids still prevent duplicates).

## 7. Failure handling

| condition | behavior |
|---|---|
| no Wi-Fi / DNS / TLS / timeout | queue + bounded exp backoff + jitter (2s → 5min max) |
| HTTP 200 | accepted / duplicate (both fine, counter advances) |
| HTTP 400 | poison event — dropped, never retried |
| HTTP 401 / 403 | halted (slow LED blink) until re-provision / re-enable |
| HTTP 429 / 5xx | queue + backoff + jitter, same event_id |

## 8. Simulation vs real sensors

`SIMULATE_SENSORS 1` (default) sends plausible drift values so the whole
path is testable with no hardware. Set to `0` and fill `readSensors()`
(HX711 load cell, DHT22, RFID reader) for production.

## 9. Verify in the dashboard

Device page → your cycle → the new rows appear (bird RFID-001 in test
mode). Device health: `GET /api/devices` shows `last_seen_at` / `online`.

## 10. Troubleshooting

* `Time ... 1970` / HTTP 400 `invalid_timestamp` → NTP blocked; check UDP 123.
* HTTP 401 → wrong key or wrong `DEVICE_ID`; rotate a fresh key.
* HTTP 403 → device disabled in `/api/devices`, or its cycle was deleted.
* HTTP 429 → sending faster than `DEVICE_INGEST_RATE_LIMIT`; raise the
  env var or slow `SEND_INTERVAL_MS`.
* `HTTP -1` → TLS (wrong root CA pasted) or no route to the host.
