# BroilerLab Firmware (ESP32)

ESP32 firmware for the BroilerLab feeding-station device.

## Hardware
- **MCU**: ESP32-WROOM-32 / ESP32-S3
- **Load cell**: HX711 (primary) or NAU7802 (I²C, higher precision)
- **RFID**: MFRC522 (ISO14443) or FDX-B animal tag reader
- **RTC**: DS3231 (battery-backed) + NTP sync
- **Storage**: LittleFS on onboard SPI flash (offline queue)
- **Bin level**: analog level sensor on GPIO34

## Architecture (FreeRTOS / Arduino core)
```
┌─────────┐  ┌─────────┐  ┌────────┐  ┌────────┐
│  RFID   │  │ LoadCell│  │  RTC   │  │  WiFi  │
└────┬────┘  └────┬────┘  └───┬────┘  └───┬────┘
     │            │           │           │
     └───────────►├─── main.cpp (visit FSM) ◄┘
                    │
            ┌───────┴────────┐
            │  TelemetryEvent │
            └───────┬────────┘
              MQTT QoS1 │  LittleFS offline queue
                   ┌────┴────┐
                   │  EMQX   │ ──► NestJS backend
                   └─────────┘
```

## Topic schema
- Publish: `lab/dev/{deviceId}/events` (JSON, QoS1, retained=false)
- LWT: `lab/dev/{deviceId}/status` → `"offline"` (retained)
- Control: `lab/dev/{deviceId}/cmd` (future: remote config push)

## Build & Flash
```bash
pio run -t upload            # build + flash
pio device monitor           # serial logs
pio test -e native           # host GoogleTest
```

## Config (LittleFS `/config.json`)
```json
{
  "device_id": "F01",
  "flock_id": "S1",
  "mqtt_url": "mqtts://broker.local:8883",
  "wifi_ssid": "...",
  "wifi_pass": "...",
  "age_day_base": 1
}
```

## Security
- MQTT over TLS (8883) with device certificate in production.
- Per-device credentials; backend enforces owner-scoping (Anti-IDOR).
- Idempotency: each event carries a unique `uid`; backend deduplicates.
