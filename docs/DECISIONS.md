# Decisions — BroilerLab (Next-Gen)

## ADR-001: Backend framework = NestJS (TypeScript)
**Date**: 2026-08-27
**Context**: User required re-architecture to a modern stack. Options: FastAPI (Python) vs NestJS (TS).
**Decision**: NestJS — full-stack TS consistency with frontend, built-in DI/modular architecture, class-validator for DTOs.
**Trade-off**: Simulation/aggregation logic had to be re-written from Python to TS (faithful port, validated MAE < 5%).

## ADR-002: Frontend component lib = shadcn/ui
**Date**: 2026-08-27
**Context**: MUI vs shadcn/ui.
**Decision**: shadcn/ui — Tailwind-based, fully customizable, keeps the legacy visual identity without fighting MUI defaults.
**Trade-off**: More manual component code, but pixel-control over the required UI replica.

## ADR-003: Chart lib = Recharts
**Date**: 2026-08-27
**Context**: ECharts vs Recharts.
**Decision**: Recharts — simpler React integration, sufficient for growth/FCR/scenario charts.

## ADR-004: TimescaleDB optional (plain-PG fallback)
**Date**: 2026-08-27
**Context**: Docker Hub unreachable in dev env → could not pull timescaledb image.
**Decision**: Migrations guard `CREATE EXTENSION timescaledb`; hypertable + CAGGs wrapped so they run on plain PostgreSQL 16 (CAGGs as regular VIEWs). Prod still uses TimescaleDB.
**Trade-off**: Dev runs on plain PG; CI must test against real TimescaleDB when available.

## ADR-005: UUID v7 (not v4/serial)
**Date**: 2026-08-27
**Decision**: Time-ordered UUIDv7 via PL/pgSQL `uuid_generate_v7()` (no client lib). Sortable, index-friendly for time-series.

## ADR-006: Idempotent ingest via UNIQUE(uid)
**Date**: 2026-08-27
**Decision**: Device-generated `uid` per event; backend `INSERT ... ON CONFLICT (uid) DO NOTHING`. Survives MQTT redelivery / network retries.

## ADR-007: Anti-IDOR enforcement
**Date**: 2026-08-27
**Decision**: Every cycle/telemetry/visit query filters `owner_id` from JWT. URL `:id` re-checked. Cross-user access returns 401/404.

## ADR-008: Ingest route = POST /cycles/:id/ingest
**Date**: 2026-08-27
**Decision**: Match legacy contract (`/api/cycles/{id}/ingest`). `cycle_id` in body is forced to URL param (Anti-IDOR). DTO field optional.

## ADR-009: Simulation engine as shared TS module
**Date**: 2026-08-27
**Decision**: `engine.ts` lives in backend `src/simulation/` and is copied to frontend `src/lib/sim/` for the Scenarios page. Single source of truth validated against PO tables.
