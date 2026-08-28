# Roadmap — BroilerLab (Next-Gen)

## Status: Phase 4 complete (frontend scaffold + all pages wired to backend)

## Completed
- [x] **Phase 1** — Monorepo, Docker Compose, dbmate migration (UUIDv7, hypertable, CAGGs, RBAC)
- [x] **Phase 2** — NestJS backend: auth, cycles, telemetry, devices, ws-gateway, mqtt client; JWT + Anti-IDOR; E2E verified
- [x] **Phase 3** — Simulation engine ported to TS (`engine.ts`); unit-tested (MAE 2.43%)
- [x] **Phase 4** — Frontend: **verbatim copy of legacy webapp** (vanilla JS + same CSS/HTML/FontAwesome), API bridged to NestJS via `auth.js` (JWT) + `device-panel.js` (Socket.io live). 100% UI preserved. Served static by Nginx.

## In progress
- [ ] **Phase 5** — ESP32 firmware structure + main loop + config + host tests (code written; needs hardware/CI to flash)
- [ ] **Phase 6** — CI/CD + Testcontainers + architecture docs

## Planned (next)
- [ ] **BullMQ + Redis** integration for async ingest/aggregation jobs
- [x] **CSV export** endpoint (`/cycles/:id/export.csv`) with formula-injection guard (2026-08-28)
- [x] **EMQX** broker in docker-compose — running; MQTT ingest verified E2E (2026-08-28)
- [x] **GitHub Actions** matrix: backend (node+pg: unit+e2e+smoke), frontend (typecheck+build+tests), firmware (PlatformIO build) (2026-08-28)
- [ ] **TimescaleDB CAGGs** refreshed in CI against real TimescaleDB image
- [x] **EMQX** broker in docker-compose — running; MQTT ingest verified E2E (2026-08-28)
- [ ] **Nginx** reverse proxy + TLS termination (prod)
- [ ] **GitHub Actions** matrix: backend (node+pg), frontend (node), firmware (pio native test)
- [ ] **Testcontainers** integration test: spin PG + backend, run ingest→stats assertion
- [ ] **Multi-language** i18n complete (fa/en) across all UI strings
- [ ] **Theming**: 4-theme support (currently dark default)

## Deferred
- [ ] Real FDX-B animal-tag reader driver (MFRC522 ISO14443 assumed)
- [ ] On-device OTA updates
- [ ] Grafana dashboards on CAGGs
- [ ] Anomaly detection (behaviour biostatistics module)
