# Changelog — BroilerLab (Next-Gen)

## [0.1.0] — 2026-08-27 (Phase 1–4 baseline)
### Added
- Monorepo: `services/{backend,firmware,frontend}`, `db/`, `docs/`, `nginx/`.
- PostgreSQL 16 schema (dbmate): users, cycles, devices, telemetry_raw, visits, registrations; UUIDv7; RBAC owner_id; partial indexes; CAGG guards.
- NestJS backend:
  - JWT auth (access 900s / refresh 7d) + bcrypt.
  - Cycles CRUD (owner-scoped) + stats + visits + registrations.
  - Telemetry ingest (idempotent, ON CONFLICT DO NOTHING) + VisitProcessor.
  - Devices module, Socket.io gateway, MQTT ingestion client.
  - CORS enabled for Vite dev origin.
- Simulation engine ported to TS (`engine.ts`); validated MAE 2.43% vs PO.
- React frontend (Vite + TS):
  - Topbar + Shamsi clock (۱۴۰۵/۰۶/۰۵ format) + lang toggle.
  - Pages: Dashboard (Recharts), Live (registrations + WS), Scenarios (engine UI), Farm (visit table), VDev (manual ingest), Bio.
  - Zustand auth/cycle stores, TanStack-free fetch wrapper, socket.io-client.
  - fa/en i18n with locale-aware digits.
- ESP32 firmware scaffold (PlatformIO): main loop, config (LittleFS), host GoogleTest.
- Architecture / Roadmap / Decisions docs.

### Notes
- TimescaleDB CAGGs run as regular VIEWs on plain PG in dev (Docker Hub blocked).
- EMQX broker not running locally; MQTT ingestion untested E2E (code complete).
- Secrets in `.env` (gitignored); `.env.example` committed.
