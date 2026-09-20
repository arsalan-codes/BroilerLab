# BroilerLab live monitoring — architecture & operations

One function holds ALL weighing logic: `backend/unit_core.py`
`process_unit_sample(sample)`. Both sources (UKTech API poll = Source A,
direct device-key push = Source B) normalize into the same sample shape
and run the same core. The browser never computes business values.

## State machine (explicit `business_state`, never the raw flag)

```
EMPTY ──VALID+rfid+w>thr──▶ FEEDING ──VALID──▶ FEEDING (live update)
  │                          │  ▲
  │                     INVALID│  │ VALID before deadline (cancel)
  │                          ▼  │
  │                       EJECTING ──INVALID ≥30s──▶ EXITED (ejected)
  │                          │
  │                     w≤thr ×2──▶ EXITED (exit, same row)
  └─ w>thr, no rfid ──▶ UNIDENTIFIED (no visit, raw only)
device offline + open visit ──▶ STALE (kept open, marked)
```

Raw hardware signal: `VALID`/`INVALID` (`DeviceLog.status`, stored
verbatim, never gates). Business state: `VALID → FEEDING`,
`INVALID → EJECTING` (still inside, motor runs ~30s), exit only at the
persisted deadline or the empty debounce. Weight trumps the flag: a
zero/residual reading (≤ `UKTECH_EMPTY_THRESHOLD_G`) counts as empty on
ANY flag — the device itself flags zero rows both VALID and INVALID.

## Layers (raw / unit / visit / derived — never mixed)

| Layer | Table / place | Content |
|---|---|---|
| Raw device data | `device_logs` (every record, idempotent by `(cycle_id, external_id)`) | exactly what ESP32/UKTech sent |
| Unit state | `unit_states` per (cycle, device, unit) | pair clock (prev ts/valid/bird), business_state, active_visit_id, eject countdown, last source id |
| Visit/session | `visits` (one row per bird presence) | entry snapshot (initial_* once), live fields (live/last_valid), frozen finals, `invalid_deadline`, `close_reason` |
| Derived metrics | computed at close | `feed_intake_g` (bin drops > noise), `weight_gain_g` (final − initial), `elapsed_s` (counter deltas / wall fallback), `presence_s` cross-check |

## Ejection countdown (restart-proof)

`invalid_since` + `invalid_deadline` (= since + `EJECTION_TIMEOUT_SECONDS`,
default 30) are persisted on the visit row. No `sleep(30)` anywhere, no
frontend timer as authority. A lazy sweep (`sweep_overdue_ejections`)
runs at the start of every sync AND every device ingest: any EJECTING
visit whose deadline passed finalizes now — even with zero new records.
A restart keeps the same stored deadline (remaining seconds preserved).

## Concurrency

- `uq_log_cycle_external` (cycle_id, external_id): duplicate deliveries
  dedupe before business processing (`SKIP BUSINESS PROCESSING`).
- `uq_visit_open_lane` (cycle_id, device, unit) WHERE visit_end IS NULL:
  two workers can never both hold an open visit per lane (DB-enforced;
  legacy duplicates closed as `superseded` in migration 015).
- One txn per sync chunk / device event (raw + cursor + unit + visit).
- Out-of-order: uktech pages walk newest-first, process oldest-first;
  any sample older than the unit's last ts is held (raw kept, state
  untouched).

## Failure behavior

- API outage (fetch/parse error): state untouched, bird NOT finalized,
  exponential backoff, resume on recovery. One malformed record is
  skipped with context; the poller never dies on it.
- `device_status != "online"`: visit kept open, marked STALE; never an exit.
- Upstream table reset (ids restart, corroborated by
  `total_records`): open visits finalize as `interrupted` (history
  preserved), id generation bumps (`g<gen>` external ids), re-ingest by
  id. Uncorroborated rewinds report `stalled` instead of touching data.

## Idempotency keys

- UKTech: `<serial>:g<gen>:<id>:u<unit>` (generation-namespaced).
- Direct: `dev:sha256(device_id:event_id)[:48]`.

## Environment (see DEPLOY.md table for full list)

`UKTECH_API_URL`, `UKTECH_API_TOKEN` (server-only, never logged),
`UKTECH_SERIAL`, `UKTECH_PAGES_PER_TICK`, `EJECTION_TIMEOUT_SECONDS`
(alias `UKTECH_INVALID_EJECT_S`), `UKTECH_FEED_NOISE_THRESHOLD_G` (alias
`UKTECH_FEED_NOISE_G`), `UKTECH_EMPTY_THRESHOLD_G`,
`UKTECH_EMPTY_DEBOUNCE`, `UKTECH_BIRD_JUMP_G`, `UKTECH_REFILL_JUMP_G`,
`UKTECH_RFID_SWAP_POLICY`, `UKTECH_PRESENCE_TOL_S`, `UKTECH_AUTO_POLL`
(dev only — Vercel uses the 3s client tick + lazy sweep),
`DEVICE_INGEST_RATE_LIMIT/WINDOW`, `DEVICE_ONLINE_SECONDS`.

## Testing

`tests/test_live_core.py` (state machine: weight track, feed/noise/
refill/calibration, counter/fallback/invalid episodes, 2 units, empty
debounce, residual, flicker, tag swap, re-entry, heartbeat, stale,
exit-while-paused, eject/flap/zero, split mapper),
`tests/test_uktech.py` (sync: idempotency, delta, reset, stalled,
probe, sweep, immutability), `tests/test_esp32_devices.py` (auth,
isolation, batch, rotation, rate limit), `tests/test_rebuild.py`
(dry-run diff + idempotent apply), `tests/test_device_table.py`
(registrations shape, 9-column thead, locales).

## Known limitations

- `total_seconds` reads 0.0 in every upstream row observed to date:
  elapsed runs on the wall fallback until the firmware emits the counter.
- `status2`/`rfid2`/`weight_4` have never carried data on ESP32-S3-001:
  unit 2 stays idle (INVALID with no open visit creates nothing).
- `calibration_1/2` never changed in the observed history; `cal_3/4`
  drift on the idle unit's empty cells only.
- Rate limiting is per-process best-effort (documented, not global).
- The browser tick is 3s (single-flight); serverless hosts cannot run a
  persistent poller — the lazy sweep + deadline make this exact.

## Troubleshooting

| Symptom | Check |
|---|---|
| Table not updating | `uk-lastfetch` time; `/api/uktech/status` cursor; `stalled` note; cycle `ingest_source` (409 = wrong source active) |
| Visit stuck FEEDING for hours | reader flapping tags? weight never empties? (keep-open policy) — check raw logs |
| Visit closed as `ejected` unexpectedly | flag flapped INVALID ≥30s consecutively (check `invalid_since` vs record ts) |
| `final_weight` looks like a residual | pre-BIRD_JUMP rows; run `python -m backend.rebuild --cycle <id>` (dry-run first) |
| 401 on device ingest | wrong/rotated key (`rotate-key` kills the old one instantly) |
| 403 on device ingest | device disabled or cycle deleted |
| 409 on device ingest | cycle source is `api` — flip to `direct` |
| 429 | over `DEVICE_INGEST_RATE_LIMIT`; batch counts per event |
