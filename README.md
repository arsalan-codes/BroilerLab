# BroilerLab (Next-Gen Architecture)

Laboratory poultry feeding behaviour simulator + real hardware telemetry pipeline.

This is a ground-up re-implementation of the original BroilerLab webapp
(`/home/arsalan/poultry_sim`) with the production-grade architecture requested:

- **Firmware:** ESP32 (ESP-IDF / FreeRTOS, PlatformIO) — HX711/NAU7802 load cells,
  MFRC522/FDX-B RFID, LittleFS offline queue, DS3231 RTC + NTP, MQTT v5 over TLS.
- **Broker:** EMQX (Mosquitto-compatible, scalable) — `lab/dev/{deviceId}/events`.
- **Backend:** NestJS (TypeScript), Clean/Hexagonal architecture, JWT, Socket.io,
  BullMQ + Redis, MQTT ingestion via mqtt.js.
- **Database:** PostgreSQL 16 + TimescaleDB (hypertable + continuous aggregates),
  UUIDv7, dbmate migrations, RBAC + Anti-IDOR.
- **API:** REST + OpenAPI 3.1, versioned `/api/v1`, cursor pagination, CSV export.
- **Frontend:** React 18 + TypeScript + Vite, TanStack Query, Zustand, socket.io-client,
  Recharts, TanStack Table, React Hook Form + Zod, shadcn/ui.
- **Infra:** Docker Compose, GitHub Actions, Nginx reverse proxy, Testcontainers.

## Repository layout (monorepo)

```
poultry_sim_new/
├── docker-compose.yml          # pg16+timescaledb, redis, emqx, nginx
├── db/                         # dbmate migrations + seeds
│   ├── dbmate.yml
│   └── migrations/
├── services/
│   ├── backend/                # NestJS API + MQTT ingestion + WS gateway
│   └── frontend/               # React + Vite SPA
├── firmware/                   # ESP32 PlatformIO project
├── nginx/                      # reverse proxy config
├── .github/workflows/          # CI/CD
└── docs/                       # architecture, ADRs, runbook
```

## Feature parity (must not regress vs original)

- Cycle CRUD (create/delete, owns isolated dataset)
- Real-time device event stream (WS) into DB
- Live registrations panel (tag, initial weight, datetime) — Shamsi date in fa mode
- Dashboard: weight/FI/FCR vs Ross308 PO, MAE, strain comparison
- Live runner: single-pen streaming animation
- Scenarios: paired-seed comparison (heat / station)
- Farm map: interactive animated barn
- Bio stats: ANOVA / treatment comparison
- Export Center: CSV + xlsx
- Topbar live clock (fa: `۱۴۰۵/۰۶/۰۵ · HH:MM:SS`, en: `1405/06/05 · HH:MM:SS`)
- Full numeric localization per language (fa digits / en digits)
- v-dev hardware panel (cycle manager + live device feed + stats + registrations)

## Status

- [x] Phase 1 — Infra + DB schema
- [x] Phase 2 — Backend NestJS (auth/cycles/telemetry/devices/ws-gateway/MQTT; JWT + RBAC/Anti-IDOR)
- [x] Phase 3 — Sim engine port (TS) — unit-tested both sides
- [x] Phase 4 — Frontend React 18 + Vite + TS (9 views, i18n fa/en, export, code-split)
- [x] Phase 5 — Firmware ESP32 (PlatformIO project, CI-built)
- [x] Phase 6 — CI/CD + docs
- [x] MQTT E2E — EMQX 5.8 via Docker Compose → device batch → telemetry_raw → stats verified

## Run it
```bash
docker compose up -d db redis emqx      # infra (PG :5433, Redis :6379, EMQX :1883/:18083)
cd services/backend  && npm ci && npm run build && node dist/main.js   # API :3001
cd services/frontend && npm ci && npm run dev                          # UI  :5173
```
Dev broker users: `broiler`/`broiler_dev` (backend superuser), `device-f01`/`device_dev` (devices).
