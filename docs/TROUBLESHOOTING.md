# Troubleshooting — BroilerLab (Next-Gen)

## Backend won't start
- **`connect ECONNREFUSED 127.0.0.1:1883`** — MQTT broker (EMQX/Mosquitto) not running.
  Expected in dev without broker. Set `MQTT_URL=` empty in `.env` to silence, or run a local broker.
- **`role "broiler" does not exist` / DB connection refused** — check `DATABASE_URL` in `.env`.
  Default dev DB: `postgres://broiler:***@127.0.0.1:5433/broilerlab_ng`.
- **UUIDv7 function error** — re-run the migration or execute the fixed `uuid_generate_v7()`
  (uses `gen_random_bytes` + `encode(...)'hex')::uuid`).

## Ingest returns 400
- `cycle_id must be a string` → you sent body to `/cycles/:id/ingest` but omitted `device_id`.
  The endpoint reads `cycle_id` from URL; body needs `device_id` + `events[]`.
- `events is not iterable` → `events` array missing or wrong shape. See `IngestEventDto`.

## Ingest returns 500 on duplicate uid
- Fixed: backend now uses `ON CONFLICT (uid) DO NOTHING`. Re-posting same `uid` is a no-op.

## Frontend can't reach backend (CORS)
- Ensure backend `CORS_ORIGINS` includes the Vite dev URL (`http://127.0.0.1:5173`).
- Or serve frontend behind the same Nginx origin in prod.

## Shamsi date shows wrong format
- Required format: `۱۴۰۵/۰۶/۰۵` (YYYY/MM/DD, zero-padded, Persian digits).
  `toShamsi(date, { longMonth: false })` produces this. `{ longMonth: true }` gives `۱۴۰۵ شهریور ۵`.

## Digits not localized
- `lnum()` / `fx()` use `getLang()` from `lib/i18n`. Ensure `data-lang` attribute is set on `<html>`
  (done in `App.tsx` toggle). fa → Persian digits, en → Latin.

## Simulation engine MAE too high
- Check `STRAINS` data matches the official breeder PO tables. MAE vs PO should be < 5%.
- Seed sensitivity: same `seed` + `ageStart` + `strain` → reproducible run.

## Firmware won't compile (PlatformIO)
- Ensure `lib_deps` installed: `pio run` triggers download.
- NAU7802 / MFRC522 libs need I²C/SPI correctly wired per `config.h` pin map.
- GoogleTest host build: `pio test -e native` (needs `platformio.ini` `[env:native]` — add if missing).
