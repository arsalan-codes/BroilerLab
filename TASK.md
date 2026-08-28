# TASK.md — BroilerLab (New Architecture)

## Current Objective
Re-implement poultry_sim (BroilerLab) to a new stack:
**ESP32 → MQTT v5 TLS → EMQX → NestJS (Clean/Hexagonal, JWT, Socket.io, BullMQ+Redis) → PostgreSQL16+TimescaleDB → React 18 + Vite + TypeScript frontend.**

Frontend UI built with **pixel-accurate fidelity to the legacy HTML** (per master prompt directive #99):
custom design-token CSS (dark/light), NOT MUI/Material 3 — to preserve exact visual identity
(same colors `--bg:#0b0f17`, teal accent `#19c39a`, Vazirmatn font, Shamsi ۱۴۰۵/۰۶/۰۵, locale digits, FA-style icons).

## Stack Decision (2026-08-27/28)
- Backend: NestJS + PostgreSQL/Redis
- Frontend: **React 18 + Vite + TypeScript + custom CSS tokens** (fidelity to HTML, not MUI)
- Architecture: ESP32 → MQTT → NestJS → PG/Redis → React+Vite

## Last Updated: 2026-08-28

## Active Checklist
- [x] Phase 1: Infra — monorepo, Docker Compose, dbmate migrations (UUIDv7, hypertable, CAGGs, RBAC) — verified
- [x] Phase 2: Backend NestJS — auth/cycles/telemetry/devices/ws-gateway/mqtt + JWT + RBAC/Anti-IDOR — E2E verified
- [x] Phase 3: Sim engine port (engine.ts + strains.ts) — unit-tested (MAE 2.43%)
- [x] Phase 4: Frontend — **React 18 + Vite + TS + custom design tokens** (fidelity to legacy HTML per directive #99); 9 tabs; deterministic engine (MAE 14.1g ≈ 0.4%); 12 vitest unit tests PASS; connected to backend API (cycles/stats/registrations); i18n fa/en; Shamsi clock; Vazirmatn; export xlsx/csv; settings menu; mobile drawer; guided tour; toasts. **Build passes, engine deterministic, 12/12 tests green.**
- [x] Phase 4b: Frontend ↔ Backend integration verified (auth → list cycles → stats → registrations via API client)
- [x] Phase 5: Firmware — ESP32 PlatformIO scaffold + main loop + config (LittleFS) + host tests + README
- [x] Phase 6: CI/CD — GitHub Actions + integration smoke test + architecture docs

## Blocked — Waiting on Project Manager
- EMQX/MQTT broker not running locally (Docker Hub blocked) → MQTT ingest untested E2E (REST path verified).
- Browser E2E verification of React UI not possible (browser tool blocks localhost); verified via build + engine unit tests + dev server 200.

## Latest Status
- Backend proc_98757a9c7ce6 on http://127.0.0.1:3001 (global prefix /api/v1)
- Frontend dev server proc_0555a51245bf on http://127.0.0.1:5173 (Vite 8, stable)
- DB broilerlab_ng on :5433 (user broiler, pass [REDACTED]).
- Integration smoke test PASSED (login → cycle → ingest → stats → visits).
- Engine validate(): MAE 14.1g vs catalog (~0.4% error), finalBw 3562g (Ross308 d42), deterministic for seed=308.

## Next Action
- Commit + push to GitHub (SSH was denied earlier; use HTTPS token or fix SSH)
- Optional: code-split frontend bundle (currently 957KB, warning only)
- Optional: download socket.io locally for offline (currently CDN in LiveSimulation mock)
- Optional: wire real backend stats/registrations to Device&Data view (currently uses local sim state)

## Summary History
- 2026-08-28: Frontend REBUILT as React18+Vite+TS with custom design tokens (fidelity to legacy HTML per directive #99). MUI discarded. 9 views, engine layer, i18n, export.
- 2026-08-28: Fixed engine bugs (mPen/cv centering, growth formula) → MAE 14.1g, deterministic.
- 2026-08-28: Fixed integration test (unique cycle_code + uid) → PASSED.
- 2026-08-27: Fixed stats.visits + nginx config.
