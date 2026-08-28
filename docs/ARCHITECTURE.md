# Architecture — BroilerLab (Next-Gen)

BroilerLab is a full-stack poultry feeding-behaviour research platform. It
collects per-bird weight and feed-intake events from ESP32 feeding stations,
streams them over MQTT, persists them in PostgreSQL+TimescaleDB, and visualises
them in a React dashboard.

## High-level flow

```
ESP32 feeding station
  │  (HX711/NAU7802 weight, MFRC522/FDX-B RFID, DS3231 RTC)
  │  JSON over MQTT v5 (TLS 8883, QoS1, Retained+LWT)
  ▼
EMQX broker  (lab/dev/{deviceId}/events)
  │
  ▼
NestJS backend (Clean/Hexagonal)
  ├─ MQTT ingestion client  → TelemetryService
  ├─ VisitProcessor         → derives visits from raw stream
  ├─ JWT auth + RBAC/Anti-IDOR
  ├─ REST API (/api/v1) + OpenAPI 3.1
  ├─ Socket.io gateway (live push)
  └─ BullMQ + Redis (queue/lock — future)
  │
  ▼
PostgreSQL 16 + TimescaleDB
  ├─ telemetry_raw (hypertable)
  ├─ visits (derived)
  ├─ registrations (manual)
  ├─ cycles, devices, users
  └─ CAGGs: bird_daily, flock_daily
  │
  ▼
  React 18 + Vite + TypeScript + MUI (Material 3) frontend
    ├─ React Router (pages: Dashboard/Live/Scenarios/Farm/VDev/Bio)
    ├─ Zustand (cycle/UI state)
    ├─ socket.io-client (live updates from ws-gateway)
    ├─ Recharts (growth / FCR charts)
    ├─ Axios + JWT interceptor (auth bridge, auto-login seeded researcher)
    ├─ i18n (fa/en) + Shamsi date utils + Vazirmatn font
    └─ lib/sim/engine.ts (simulation, shared with backend)
    │  (dev: Vite :5173 → proxies /api + /socket.io to backend; prod: Nginx + Docker)
  ```


## Module map (backend)

| Module | Responsibility |
|--------|----------------|
| `auth` | JWT access+refresh, bcrypt password, register/login |
| `cycles` | CRUD, owner-scoped stats, visits, registrations, ingest entry |
| `telemetry` | Ingest batch (idempotent), VisitProcessor, persistence |
| `devices` | Device registration / upsert per owner |
| `ws-gateway` | Socket.io broadcast on `telemetry:new` |
| `mqtt` (infra) | Subscribes `lab/dev/+/events`, routes to TelemetryService |

## Key design decisions

- **UUID v7** everywhere (time-ordered, index-friendly).
- **Idempotency** via `UNIQUE(uid)` on `telemetry_raw`; duplicate inserts are
  ignored (`ON CONFLICT DO NOTHING`).
- **Anti-IDOR**: every cycle/telemetry/visit query filters by `owner_id` from
  the JWT. URL `:id` is re-validated against ownership before write.
- **TimescaleDB-optional**: migrations guard `CREATE EXTENSION timescaledb`;
  CAGGs fall back to regular VIEWs on plain PostgreSQL (dev).
- **Simulation engine** (`src/simulation/engine.ts`) is a faithful port of the
  legacy `webapp/engine.js`; validated MAE vs PO < 5%.

## Security

- JWT access TTL 900s, refresh 7d.
- MQTT TLS in production; per-device credentials.
- Secrets via env (`.env`), never committed.

## State / data model

See `db/migrations/2026-08-27.001.init.sql` for the authoritative schema.
