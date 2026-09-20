"""
Arian — online device ingest from the uktech weight API.

Upstream: GET <UKTECH_API_BASE>?serial=<serial>&limit=<n>&offset=<o>&ttoken=<token>
  -> {"status": "success", "meta": {..., "has_more": bool},
        "data": [{id, device_id, rfid1, rfid2, weight_1..4, total_weight,
                  status1, status2, device_status, created_at, ...}]}

Each record carries TWO units; mapping per unit (1: rfid1/w2/w1/status1,
2: rfid2/w4/w3/status2) onto the 12-col device schema:
  timestamp     <- created_at, Asia/Tehran wall clock -> UTC
  bird_id       <- unit rfid (None when empty: weight-only row)
  sensor_id     <- device_id
  raw_weight_g  <- unit bird cell, rounded (float artefacts like 216.74..01;
                   falls back to total_weight for legacy single-unit rows)
  weight_g      <- same rounded raw (table display + visit init weight)
  feed_bin_kg   <- unit hopper cell, grams -> kg (per-bin intake is then
                   derived by the standard bin-drop rule)
  flock_id      <- "UKTECH-<serial>" (traceability)
  age_day       <- days since the target cycle's start_date
  feed/temp/humidity/rssi <- absent upstream -> None
  presence_s    <- total_seconds, device-accumulated presence until exit
                    (stored on the visit at close)

Idempotency: every row is tagged DeviceLog.external_id = "<serial>:<id>"
(unique per cycle) and the highest ingested id is kept in SyncState
("uktech:<serial>"), so re-syncs only fetch newer rows and can never
duplicate.

Only stdlib is used (urllib / json / zoneinfo) — no new dependencies.
The API token never leaves the server: it is read from env (UKTECH_API_TOKEN
or BROILER_UKTECH_TOKEN) and never logged or sent to browsers.
"""
import json
import logging
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from config import (
    UKTECH_API_BASE, UKTECH_SERIAL, UKTECH_TOKEN,
    UKTECH_TIMEOUT_S, UKTECH_PAGE_SIZE, UKTECH_MAX_PAGES, UKTECH_VERIFY_SSL,
    UKTECH_PAGES_PER_TICK,
)
from models import (Cycle, DeviceLog, SessionLocal, SyncState, Visit,
                    UnitState, utcnow)
import weighing as _weighing  # record_to_unit_events mapping contract
import unit_core as _core

try:
    from zoneinfo import ZoneInfo
    _TEHRAN = ZoneInfo("Asia/Tehran")
except Exception:  # pragma: no cover - hosts without IANA tzdata
    _TEHRAN = None
_TEHRAN_FIXED = timedelta(hours=3, minutes=30)  # Iran: +3:30 year-round (no DST since 2022)


class UktechError(Exception):
    """Upstream unreachable, misconfigured, or target cycle missing."""


if not UKTECH_TOKEN:
    # Visible in Vercel Runtime Logs on every cold start — the #1 reason
    # /api/uktech/sync 400s is a missing env var, and this makes it obvious.
    logging.getLogger(__name__).warning(
        "UKTECH_API_TOKEN/BROILER_UKTECH_TOKEN is not set — "
        "/api/uktech/sync will 400 until it is configured")


def _tls_mode() -> str:
    m = (UKTECH_VERIFY_SSL or "auto").strip().lower()
    return m if m in ("true", "false", "auto") else "auto"


# Set when auto mode downgrades to unverified TLS (surfaced per-sync so the
# admin knows the channel was not authenticated).
_TLS_FALLBACK_USED = False
# Remembered per process: once the host proves self-signed, later calls skip
# the doomed strict attempt (halves fetch latency on every chunk).
_TLS_KNOWN_SELF_SIGNED = False
# Meta of the most recent fetched page (total_records etc.). Reset per sync;
# used for upstream-reset detection. Stays None when fetch is stubbed.
_LAST_META = None


def state_key(serial: str, cycle_id: int | None = None) -> str:
    """Per-cycle cursor: each cycle owns its sync progress (tenant-isolated).

    Legacy global key ``uktech:<serial>`` is kept as fallback for continuity
    until the per-cycle key is created.
    """
    if cycle_id is not None:
        return f"uktech:{serial}:cycle:{cycle_id}"
    return f"uktech:{serial}"


def external_id(serial: str, remote_id) -> str:
    return f"{serial}:{remote_id}"


def parse_tehran_utc(val) -> datetime:
    """'2026-09-17 19:53:29' (Tehran wall clock) -> aware UTC datetime."""
    if isinstance(val, datetime):
        base = val.replace(tzinfo=None) if val.tzinfo else val
    else:
        s = str(val).strip().replace("T", " ")
        base = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
            try:
                base = datetime.strptime(s, fmt)
                break
            except ValueError:
                continue
        if base is None:
            try:
                base = datetime.fromisoformat(s).replace(tzinfo=None)
            except ValueError:
                raise UktechError(f"unparseable timestamp: {val!r}")
    if _TEHRAN is not None:
        return base.replace(tzinfo=_TEHRAN).astimezone(timezone.utc)
    return (base - _TEHRAN_FIXED).replace(tzinfo=timezone.utc)


def _to_float(v):
    """Strict numeric coercion: None/""/"N/A"/NaN/inf and friends all become
    None (never a fake 0 or a NaN that would poison comparisons downstream).
    """
    import math
    try:
        if v is None:
            return None
        if isinstance(v, str):
            if not v.strip() or v.strip().lower() in ("n/a", "na", "nan",
                                                      "none", "null", "-"):
                return None
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def record_to_unit_events(rec: dict, age_day, serial: str):
    """Map one uktech row -> list of per-unit tuples.

    Each API record carries TWO weighing units (see module docstring):
      unit 1: rfid1 / bird-channel / bin-channel / status1
      unit 2: rfid2 / weight_4     / weight_3     / status2
    Unit-1 channels honor UKTECH_BIRD_CHANNEL / UKTECH_BIN_CHANNEL (defaults
    weight_2 / weight_1); unit 2 follows the fixed device contract.
    The raw status flag rides along on the event for storage only — it is
    flaky upstream (identical payloads arrive VALID and INVALID) and never
    gates session/visit decisions; the weighing session machine is the
    filter. total_seconds rides along as presence_s (stored on visit close).
    Returns [(unit, event, external_id, ts, presence), ...] with external
    ids namespaced per unit ("<serial>:<id>:u1") so lanes collide neither
    with each other nor with legacy "<serial>:<id>" rows.
    """
    cfg = _weighing.load_config()
    ts = parse_tehran_utc(rec.get("created_at"))
    sensor = (rec.get("device_id") or "").strip() or None
    # Sibling-emptiness decides the legacy total_weight fallback: only when
    # the record carries no unit-2 data at all is it a legacy single-unit row.
    sibling_empty = not (rec.get("rfid2") or "").strip() \
        and _to_float(rec.get("weight_4")) is None \
        and _to_float(rec.get("weight_3")) is None
    lanes = [
        (1, "rfid1", cfg["BIRD_CHANNEL"], cfg["BIN_CHANNEL"], "status1"),
        (2, "rfid2", "weight_4", "weight_3", "status2"),
    ]
    out = []
    for unit, rfid_f, bird_f, bin_f, status_f in lanes:
        bird = (rec.get(rfid_f) or "").strip() or None
        raw = _to_float(rec.get(bird_f))
        if raw is None and (unit == 1 or sibling_empty):
            raw = _to_float(rec.get("total_weight"))
        if raw is not None:
            raw = round(raw, 1)
        bin_g = _to_float(rec.get(bin_f))
        # full precision (no kg rounding): 345.44g must survive the trip
        # (0.345kg would display as 345.0). Display rounds to 2 decimals
        # at read time; intake diffs are sub-gram exact instead of 1g steps.
        bin_kg = bin_g / 1000.0 if bin_g is not None else None
        status_raw = rec.get(status_f)
        status = str(status_raw).strip() or None \
            if status_raw is not None else None
        presence = _to_float(rec.get("total_seconds"))
        event = {
            "timestamp": ts.isoformat(),
            "flock_id": f"UKTECH-{serial}",
            "bird_id": bird,
            "sensor_id": sensor,
            "age_day": age_day,
            "raw_weight_g": raw,
            # weight_g mirrors raw: the table + visit aggregates need a
            # display weight.
            "weight_g": raw,
            "feed_bin_kg": bin_kg,
            "feed_delta_g": None,
            "temp_c": None,
            "humidity": None,
            "rssi": None,
            "status": status,
        }
        out.append((unit, event,
                    f"{external_id(serial, rec.get('id'))}:u{unit}", ts,
                    presence))
    return out


def record_to_event(rec: dict, age_day, serial: str):
    """Backward-compat wrapper: unit-1 view of record_to_unit_events."""
    for unit, event, ext, ts, _presence in record_to_unit_events(rec, age_day, serial):
        if unit == 1:
            return event, ext.rsplit(":u1", 1)[0], ts
    raise UktechError("record has no unit-1 data")


def _fetch_once(url: str, timeout: int, verify: bool):
    """Single GET attempt. Raises UktechError on any transport/payload fault."""
    global _LAST_META
    ctx = None
    if not verify:
        ctx = ssl._create_unverified_context()
    req = urllib.request.Request(url, headers={"Accept": "application/json",
                                               "User-Agent": "ArianBackend/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            payload = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise UktechError(f"uktech API HTTP {e.code}")
    except urllib.error.URLError as e:
        err = UktechError(f"uktech API unreachable: {getattr(e, 'reason', e)}")
        err.reason = getattr(e, "reason", None)
        raise err
    except (ValueError, TimeoutError) as e:
        raise UktechError(f"uktech API bad response: {e}")
    if str(payload.get("status", "")).lower() != "success":
        raise UktechError(f"uktech API error: {payload.get('message', payload.get('code', '?'))}")
    meta = payload.get("meta") or {}
    _LAST_META = meta
    return payload.get("data") or [], bool(meta.get("has_more"))


def _is_cert_failure(err: UktechError) -> bool:
    return isinstance(getattr(err, "reason", None), ssl.SSLCertVerificationError)


def fetch_records(serial: str, token: str, limit: int = 100, offset: int = 0,
                   base: str = None, timeout: int = None):
    """Fetch one page (newest first). Returns (records, has_more).

    TLS mode comes from UKTECH_VERIFY_SSL: strict / skip / auto-fallback
    (strict first, then one unverified retry flagged via _TLS_FALLBACK_USED).
    """
    if not token:
        raise UktechError("uktech API token is not configured on the server")
    base = base or UKTECH_API_BASE
    qs = urllib.parse.urlencode({
        "serial": serial, "limit": limit, "offset": offset, "ttoken": token,
    })
    url = f"{base}?{qs}"
    global _TLS_FALLBACK_USED, _TLS_KNOWN_SELF_SIGNED
    mode = _tls_mode()
    timeout = timeout or UKTECH_TIMEOUT_S
    if _TLS_KNOWN_SELF_SIGNED and mode == "auto":
        # Host already proved self-signed in this process: skip straight to
        # unverified (the summary still flags tls_insecure for this call).
        _TLS_FALLBACK_USED = True
        return _fetch_once(url, timeout, verify=False)
    if mode == "false":
        if not globals().get("_warned_insecure"):
            globals()["_warned_insecure"] = True
            logging.getLogger(__name__).warning(
                "UKTECH_VERIFY_SSL=false: TLS certs NOT verified (use only behind firewall)")
        return _fetch_once(url, timeout, verify=False)
    try:
        return _fetch_once(url, timeout, verify=True)
    except UktechError as e:
        if mode == "auto" and _is_cert_failure(e):
            _TLS_KNOWN_SELF_SIGNED = True
            _TLS_FALLBACK_USED = True
            logging.getLogger(__name__).warning(
                "uktech TLS verify failed (%s) — retrying UNVERIFIED "
                "(self-signed host?). Set UKTECH_VERIFY_SSL=true to forbid this.",
                e)
            return _fetch_once(url, timeout, verify=False)
        raise


def get_cursor(serial: str, cycle_id: int | None = None) -> int:
    """Per-cycle cursor with fallback to legacy global cursor for migration."""
    with SessionLocal() as s:
        if cycle_id is not None:
            row = s.get(SyncState, state_key(serial, cycle_id))
            if row:
                return row.last_id
            # Fallback: existing DBs have only the global key
            row = s.get(SyncState, state_key(serial))
            if row:
                return row.last_id
        else:
            row = s.get(SyncState, state_key(serial))
            if row:
                return row.last_id
        return 0


def sync_status(serial: str = None, cycle_id: int | None = None) -> dict:
    serial = (serial or UKTECH_SERIAL).strip() or UKTECH_SERIAL
    with SessionLocal() as s:
        row = None
        if cycle_id is not None:
            row = s.get(SyncState, state_key(serial, cycle_id))
            if not row:
                # Fallback to global for pre-migration DBs
                row = s.get(SyncState, state_key(serial))
        else:
            row = s.get(SyncState, state_key(serial))
        return {
            "configured": bool(UKTECH_TOKEN),
            "serial": serial,
            "cycle_id": cycle_id,
            "last_id": row.last_id if row else 0,
            "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
            "note": row.note if row else None,
        }


def _probe_latest_id(serial: str, token: str):
    """Cheapest possible upstream check: the newest single record.

    Live polls (every few seconds) usually find nothing new — one 1-row
    probe answers that for ~1KB instead of downloading + parsing a full
    page. Returns (probe_max, probe_total): the highest upstream id seen
    (None when upstream is empty or the probe row carries no usable id)
    and the probe page's total_records meta (None when unknown).
    Transport/auth faults propagate exactly like a normal page fetch.
    """
    records, _has_more = fetch_records(serial, token, 1, 0)
    try:
        total = (_LAST_META or {}).get("total_records")
        total = int(total) if total is not None else None
    except (TypeError, ValueError):
        total = None
    probe_max = None
    for rec in records or []:
        try:
            rid = int((rec or {}).get("id"))
        except (TypeError, ValueError):
            continue
        probe_max = rid if probe_max is None else max(probe_max, rid)
    return probe_max, total


def _core_cfg() -> dict:
    """Live-core thresholds (UKTECH_* env, documented defaults in config)."""
    from config import (UKTECH_EMPTY_THRESHOLD_G, UKTECH_EMPTY_DEBOUNCE,
                        UKTECH_FEED_NOISE_G, UKTECH_REFILL_JUMP_G,
                        UKTECH_RFID_SWAP_POLICY, UKTECH_BIRD_JUMP_G,
                        UKTECH_INVALID_EJECT_S)
    return {"EMPTY_THRESHOLD_G": UKTECH_EMPTY_THRESHOLD_G,
            "EMPTY_DEBOUNCE": UKTECH_EMPTY_DEBOUNCE,
            "FEED_NOISE_G": UKTECH_FEED_NOISE_G,
            "REFILL_JUMP_G": UKTECH_REFILL_JUMP_G,
            "RFID_SWAP_POLICY": UKTECH_RFID_SWAP_POLICY,
            "BIRD_JUMP_G": UKTECH_BIRD_JUMP_G,
            "INVALID_EJECT_S": UKTECH_INVALID_EJECT_S}


def _gen_key(serial: str, cycle_id: int) -> str:
    return state_key(serial, cycle_id) + ":gen"


def _get_gen(s, serial: str, cycle_id: int) -> int:
    """Id generation of the upstream table contents (bumps on device-table
    reset so the new generation's external ids never shadow the old one)."""
    try:
        row = s.get(SyncState, _gen_key(serial, cycle_id))
        return max(0, int(row.last_id)) if row else 0
    except (TypeError, ValueError):
        return 0


def _set_gen(s, serial: str, cycle_id: int, gen: int) -> None:
    row = s.get(SyncState, _gen_key(serial, cycle_id))
    if row is None:
        s.add(SyncState(key=_gen_key(serial, cycle_id), last_id=gen,
                        updated_at=utcnow(),
                        note=f"cycle {cycle_id} id generation"))
    else:
        row.last_id = gen
        row.updated_at = utcnow()


def _live_ext(serial: str, gen: int, rid, unit: int) -> str:
    """Per-unit idempotency key with generation namespace:
    "<serial>:g<gen>:<id>:u<unit>". Legacy rows lack the generation
    segment and can never collide with namespaced ones."""
    return f"{serial}:g{gen}:{rid}:u{unit}"


def _visit_to_state(v) -> dict:
    """Persisted Visit row -> live-core visit state (Nones = legacy rows:
    elapsed/feed restart at 0, bin baseline reseeds, position inside)."""
    from processor import _aware_utc

    def _ep(dt):
        try:
            return _aware_utc(dt).timestamp() if dt else None
        except Exception:
            return None

    return {
        "bird_id": v.bird_id,
        "initial": v.initial_weight_g,
        "confirmed": v.initial_confirmed_g,
        "current": (v.live_weight_g if v.live_weight_g is not None
                    else v.final_weight_g),
        "last_valid": v.last_valid_weight_g,
        "initial_bin": v.initial_bin_weight_g,
        "last_valid_bin": v.last_valid_bin_weight_g,
        "feed": v.feed_intake_g or 0.0,
        "elapsed": v.elapsed_s or 0.0,
        "presence_acc": v.presence_acc or 0.0,
        "counter_last": v.counter_last,
        "counter_live": bool(v.counter_live),
        "bin_base": v.bin_baseline,
        "bin_cal": v.bin_calib,
        "streak": v.empty_streak or 0,
        "empty_since": _ep(v.empty_since),
        "invalid_since": _ep(v.invalid_since),
        "invalid_deadline": _ep(v.invalid_deadline),
        "business_state": v.business_state or "FEEDING",
        "position": v.bird_position or "inside",
        "last_tag": v.last_tag or v.bird_id,
        "close_reason": v.close_reason,
        "stale": bool(v.stale),
        "last_source_ts": _ep(v.last_source_timestamp),
    }


def _dt_of(epoch):
    try:
        return datetime.fromtimestamp(float(epoch), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def sweep_overdue_ejections(cycle_id: int, now=None) -> int:
    """Lazy finalization sweep: any EJECTING visit whose persisted
    invalid_deadline has passed is finalized NOW — no new record needed.

    This is what makes the 30s ejection deadline authoritative on hosts
    without a persistent worker (serverless): every sync (client tick,
    Source B ingest, cron) sweeps first, so an overdue visit closes on
    the next poll even if the device sends nothing more. The frozen
    values (final weight/feed/elapsed from the last VALID record) are
    already on the row; only the close fields are written, so finalized
    visits stay immutable afterwards. Returns the count finalized."""
    from processor import _aware_utc
    now = now or utcnow()
    n = 0
    with SessionLocal() as s:
        rows = (s.query(Visit)
                .filter(Visit.cycle_id == cycle_id,
                        Visit.visit_end.is_(None),
                        Visit.business_state == "EJECTING",
                        Visit.invalid_deadline.isnot(None),
                        Visit.invalid_deadline <= now)
                .all())
        for v in rows:
            try:
                exit_dt = _aware_utc(v.invalid_deadline)
            except Exception:
                exit_dt = now
            v.visit_end = exit_dt
            v.bird_position = "outside"
            v.close_reason = "ejected"
            v.business_state = "EXITED"
            v.empty_streak = 0
            v.empty_since = None
            v.invalid_since = None
            v.invalid_deadline = None
            try:
                if (v.final_weight_g is not None
                        and v.initial_weight_g is not None):
                    v.weight_gain_g = round(
                        v.final_weight_g - v.initial_weight_g, 1)
            except (TypeError, ValueError):
                pass
            try:
                urow = (s.query(UnitState)
                        .filter(UnitState.cycle_id == cycle_id,
                                UnitState.device_id == (v.sensor_id or "-"),
                                UnitState.unit == (v.unit or 1))
                        .first())
                if urow is not None:
                    urow.business_state = "EMPTY"
                    urow.active_visit_id = None
                    urow.invalid_since = None
                    urow.invalid_deadline = None
                    urow.updated_at = utcnow()
            except Exception:
                pass
            n += 1
            logging.getLogger(__name__).info(
                "[UNIT %s] RFID=%s Visit=%s FINALIZED(sweep) weight=%s feed=%s",
                v.unit or 1, v.bird_id, v.id, v.final_weight_g,
                v.feed_intake_g)
        if n:
            s.commit()
    return n


def sync_serial_to_cycle(cycle_id: int, serial: str = None, limit: int = None,
                         max_pages: int = None, batch: int | None = None) -> dict:
    """Pull new uktech rows into a cycle. Oldest-first so visit aggregation
    sees events in chronological order. Returns a summary dict.

    Latest-id first: a 1-row probe finds the upstream max id, and pages are
    walked only for the delta past the cursor — a caught-up live poll costs
    one tiny request and zero writes. An unreadable probe falls back to the
    legacy full walk rather than trusting a blind probe.
    The summary carries the probe (`upstream_max`, `upstream_delta`) plus a
    `changes` array: one registrations-shaped entry per visit this call
    created or touched (new weighings, weight/hopper/feed updates, closes),
    newest first, so the UI can patch exactly those rows.

    Chunked for serverless time limits: at most ``batch`` rows are written
    per call (default UKTECH_SYNC_BATCH=60); the cursor advances to the last
    written row and ``complete`` is False while rows remain, so the caller
    simply repeats the call until complete. ``limit`` is kept only for
    backward compat but ignored — page size is fixed at UKTECH_PAGE_SIZE and
    pages are walked until ``has_more`` is false. ``max_pages`` is a safety
    cap (default 200) to avoid a runaway loop if upstream misbehaves; normal
    syncs stop after 1-2 pages via the ``min_id <= last_id`` early break.
    """
    from processor import get_processor  # local import: avoids import cycles
    import hub

    serial = (serial or UKTECH_SERIAL).strip() or UKTECH_SERIAL
    # Ignore caller limit — always fetch all new records standardly
    page_size = UKTECH_PAGE_SIZE
    max_pages = int(max_pages or 200)
    try:
        batch = max(1, int(os.getenv("UKTECH_SYNC_BATCH", "50")
                           if batch is None else batch))
    except (TypeError, ValueError):
        batch = 50
    global _TLS_FALLBACK_USED
    _TLS_FALLBACK_USED = False

    with SessionLocal() as s:
        cycle = s.get(Cycle, cycle_id)
        if not cycle:
            raise UktechError(f"cycle {cycle_id} not found")
        try:
            start_day = cycle.start_date.date() if cycle.start_date else None
        except Exception:
            start_day = None

    # Lazy finalization sweep FIRST: any EJECTING visit whose persisted
    # deadline already passed finalizes now — even with zero new records
    # upstream. The deadline (not a new record) is authoritative, so the
    # visit cannot leak open when the device goes quiet after INVALID.
    try:
        swept = sweep_overdue_ejections(cycle_id)
    except Exception:
        swept = 0
    last_id = get_cursor(serial, cycle_id)
    entry_last_id = last_id
    global _LAST_META
    _LAST_META = None
    fresh = []  # (remote_id, record) with id > last_id
    seen_ids = set()  # every upstream id observed (for reset detection)
    offset = 0
    complete = True
    exhausted = True  # False if we stopped early (cursor hit or page cap)
    # ---- latest-id probe: walk pages only for the delta past the cursor.
    # A caught-up poll downloads nothing further; the probe id still seeds
    # seen_ids so the cursor-ahead (reset/stalled) check below keeps working.
    probe_max, _probe_total = _probe_latest_id(serial, UKTECH_TOKEN)
    upstream_max = probe_max
    if probe_max is None or probe_max > last_id:
        # new data upstream (or an unreadable probe: fall back to the
        # legacy walk instead of trusting it). Pages per call are capped
        # so one serverless tick stays inside its time limit with >100
        # new records pending; the caller repeats until complete.
        pages_per_tick = max(1, int(UKTECH_PAGES_PER_TICK or 4))
        for _ in range(min(max_pages, pages_per_tick)):
            records, has_more = fetch_records(serial, UKTECH_TOKEN, page_size, offset)
            if not records:
                break
            for rec in records:
                try:
                    rid = int(rec.get("id"))
                except (TypeError, ValueError):
                    continue
                seen_ids.add(rid)
                if rid > last_id:
                    fresh.append((rid, rec))
            offset += len(records)
            if not has_more:
                break
            # pages arrive newest-first: stop once a page reaches already-synced rows
            try:
                if min(int(r.get("id")) for r in records) <= last_id:
                    exhausted = False
                    break
            except (TypeError, ValueError):
                exhausted = False
                break
        else:
            complete = False  # page cap hit while upstream still has more
            exhausted = False
        fresh.sort(key=lambda t: t[0])  # oldest first for the visit state machine
        if seen_ids:
            top_seen = max(seen_ids)
            upstream_max = top_seen if upstream_max is None else max(upstream_max, top_seen)
    elif probe_max is not None:
        seen_ids.add(probe_max)
    try:
        upstream_delta = max(0, int(upstream_max) - int(entry_last_id)) \
            if upstream_max is not None else 0
    except (TypeError, ValueError):
        upstream_delta = 0

    # ---- upstream-reset detection ----
    # If the device DB was wiped (ids restart), our cursor points past all
    # upstream data and every previously synced id would collide with NEW
    # rows under the same external_id. Mirror the source of truth: drop this
    # cycle's stale rows for the serial and start over.
    #
    # Robustness notes (a frozen table with a cursor ahead of upstream is
    # otherwise silent forever, so this rule favors recovery while refusing
    # to wipe on ambiguous evidence):
    #  - rewind must exceed RESET_MARGIN (50): minor prunes/overlaps stay
    #    silent instead of churning a full re-ingest;
    #  - the meta must corroborate (upstream_max <= total < cursor): a single
    #    stale/glitch row carrying a big total never triggers a wipe;
    #  - anything else cursor-ahead-shaped is reported as `stalled` with a
    #    reason instead of wiping (operator can see it in the UI status).
    RESET_MARGIN = 50
    did_reset = False
    interrupted = 0
    stalled = False
    stalled_reason = ""
    try:
        total_up = (_LAST_META or {}).get("total_records")
        total_up = int(total_up) if total_up is not None else None
    except (TypeError, ValueError):
        total_up = None
    if (last_id > 0 and not fresh and upstream_max is not None
            and upstream_max < last_id):
        gap = last_id - upstream_max
        meta_ok = (total_up is not None and upstream_max <= total_up
                   and total_up < last_id)
        if gap > RESET_MARGIN and meta_ok:
            # Non-destructive reset policy (replaces the old wipe): the
            # device table restarted, so the previous generation's open
            # visits can never close cleanly — finalize them as
            # "interrupted" (history preserved), drop the pair clock, bump
            # the id generation (new rows get "g<gen>" external ids, so
            # they never collide with / shadow the old generation), and
            # re-ingest the current upstream content by id.
            did_reset = True
            last_id = 0
            with SessionLocal() as s:
                now_r = utcnow()
                opens = s.query(Visit).filter(
                    Visit.cycle_id == cycle_id,
                    Visit.visit_end.is_(None)).all()
                for v in opens:
                    v.visit_end = now_r
                    v.bird_position = "outside"
                    v.close_reason = "interrupted"
                    interrupted += 1
                s.query(UnitState).filter(
                    UnitState.cycle_id == cycle_id).delete(
                        synchronize_session=False)
                gen = _get_gen(s, serial, cycle_id) + 1
                _set_gen(s, serial, cycle_id, gen)
                s.commit()
            # re-collect: everything upstream is new now. The page bodies were
            # already downloaded above but filtered by the old cursor; re-fetch
            # (1 page in the reset case — total is small by construction).
            fresh = []
            offset = 0
            complete = True
            for _ in range(max_pages):
                records, has_more = fetch_records(serial, UKTECH_TOKEN,
                                                  page_size, offset)
                if not records:
                    break
                for rec in records:
                    try:
                        rid = int(rec.get("id"))
                    except (TypeError, ValueError):
                        continue
                    fresh.append((rid, rec))
                offset += len(records)
                if not has_more:
                    break
            else:
                complete = False
            fresh.sort(key=lambda t: t[0])
        if not did_reset and gap > RESET_MARGIN:
            # Big rewind but the evidence does not corroborate a wipe
            # (inconsistent/stale meta): refuse to delete, but say so loudly
            # instead of freezing silently like before.
            stalled = True
            stalled_reason = (
                f"cursor {last_id} ahead of upstream max {upstream_max} "
                f"(total_records={total_up})")
            logging.getLogger(__name__).warning(
                "uktech sync stalled for cycle %s serial %s: %s",
                cycle_id, serial, stalled_reason)

    # Chunk: write only the first `batch` rows this call so a serverless
    # invocation finishes well inside its time limit; the cursor below lands
    # on the last WRITTEN row, so the next call continues where we stopped.
    todo = fresh[:batch]
    remaining = len(fresh) - len(todo)
    if not complete:
        remaining += 1  # upstream still has more pages beyond this fetch
    from processor import _aware_utc, _log_to_dict  # local import: avoids import cycles

    inserted, skipped, max_seen = 0, 0, last_id
    published = []
    events_count = 0
    changes = []  # registrations-shaped entries per affected visit (built after commit)
    live_cfg = _core_cfg()
    if todo:
        with SessionLocal() as s:
            gen = _get_gen(s, serial, cycle_id)
        # generation-namespaced per-unit keys ("<serial>:g<gen>:<id>:u1"):
        # legacy bare ids and older generations can never collide with
        # them, so old rows are never "already have".
        ext_ids = [_live_ext(serial, gen, rid, u) for rid, _ in todo
                   for u in (1, 2)]
        with SessionLocal() as s:
            have = {r[0] for r in s.query(DeviceLog.external_id).filter(
                DeviceLog.cycle_id == cycle_id,
                DeviceLog.external_id.in_(ext_ids)).all()}
        # ---- shape: timestamps + age (no DB writes) ----
        # planned rows: (rid, rec, ts_dt, ts_ep, age_day). Unit samples are
        # built per record in the core loop below (exact values, no
        # rounding); dedupe by namespaced ext id happens per unit there.
        planned = []
        for rid, rec in todo:
            max_seen = max(max_seen, rid)
            try:
                _event_ts = parse_tehran_utc(rec.get("created_at"))
            except UktechError:
                skipped += 1
                continue
            age_day = None
            if start_day is not None:
                try:
                    age_day = max(0, (_event_ts.date() - start_day).days)
                except Exception:
                    age_day = None
            planned.append((rid, rec, _event_ts,
                            _event_ts.timestamp(), age_day))
        # ---- live core: ONE open visit row per (device, unit), updated in
        # place on EVERY record. No DETECTING/STABLE/WAITING gate: the first
        # touch opens immediately, VALID bird readings overwrite the live
        # weight up AND down, bin/elapsed/feed accrue per record, and
        # residuals/zeros close via the empty debounce — in the SAME row.
        slog = logging.getLogger(__name__)
        with SessionLocal() as s:
            orows = (s.query(Visit)
                     .filter(Visit.cycle_id == cycle_id,
                             Visit.visit_end.is_(None)).all())
        # lane -> Visit row (latest start wins if legacy data holds several)
        # or ("new", idx) for visits opened earlier in this same chunk.
        openv = {}
        for _v in orows:
            _lane = ((_v.sensor_id or "").strip() or "-", _v.unit or 1)
            _old = openv.get(_lane)
            if _old is None or (not isinstance(_old, tuple)
                                and _v.visit_start > _old.visit_start):
                openv[_lane] = _v
        with SessionLocal() as s:
            urows = (s.query(UnitState)
                     .filter(UnitState.cycle_id == cycle_id).all())
        ustate = {}  # (dev, unit) -> {"ts", "valid", "bird"}
        had_unit = set()
        for _u in urows:
            _lane = (_u.device_id, _u.unit)
            had_unit.add(_lane)
            try:
                _pts = _aware_utc(_u.prev_ts).timestamp() \
                    if _u.prev_ts else None
            except Exception:
                _pts = None
            ustate[_lane] = {"ts": _pts, "valid": _u.prev_valid,
                             "bird": _u.prev_bird}
        new_visits = []
        visit_updates = []  # bulk mappings for closes/updates
        working = {}  # lane -> live visit-state dict carried across rows
        unit_writes = {}  # (dev, unit) -> True when the pair clock advanced
        lane_state = {}  # (dev, unit) -> (visit_ref|None, state|None, rid)
        log_specs = []  # (rid, unit, ext, sample, ts_dt, age, vid|("new",i)|None, is_start, is_end, elapsed, feed)
        affected = []  # visit refs ("new", idx) / ("old", vid) this call created or changed

        def _finalize_row(nv_dict_setter, st, exit_dt, reason, snap):
            """Shared finalization write: the SAME row freezes every
            business-critical value once (final weights, feed, elapsed,
            end, reason, state, source trace). Later samples never touch
            these columns again (the lane pops from openv)."""
            nv_dict_setter("visit_end", exit_dt)
            nv_dict_setter("bird_position", "outside")
            nv_dict_setter("close_reason", reason)
            nv_dict_setter("business_state", "EXITED")
            nv_dict_setter("empty_streak", 0)
            nv_dict_setter("empty_since", None)
            nv_dict_setter("invalid_since", None)
            nv_dict_setter("invalid_deadline", None)
            if snap is not None:
                nv_dict_setter("final_weight_g", snap.get("final"))
                nv_dict_setter("live_weight_g", snap.get("final"))
                nv_dict_setter("last_valid_weight_g", snap.get("final"))
                nv_dict_setter("final_bin_weight_g", snap.get("final_bin"))
                nv_dict_setter("last_valid_bin_weight_g", snap.get("final_bin"))
                nv_dict_setter("weight_gain_g", snap.get("weight_gain"))
                nv_dict_setter("feed_intake_g", snap.get("feed"))
                nv_dict_setter("elapsed_s", snap.get("elapsed"))
                nv_dict_setter("presence_s", snap.get("presence"))
            if st is not None:
                nv_dict_setter("presence_acc", st.get("presence_acc") or 0.0)
                nv_dict_setter("counter_last", st.get("counter_last"))
                nv_dict_setter("counter_live", bool(st.get("counter_live")))
                nv_dict_setter("bin_baseline", st.get("bin_base"))
                nv_dict_setter("bin_calib", st.get("bin_cal"))
                nv_dict_setter("last_tag", st.get("last_tag"))
                nv_dict_setter("initial_confirmed_g", st.get("confirmed"))
                nv_dict_setter("stale", bool(st.get("stale")))

        def _close_lane(lane, exit_dt, reason, snap=None):
            """Finalize a lane's open visit (adopted row or chunk-new).

            Returns the visit ref for linking/affected lists."""
            cur = openv.get(lane)
            if cur is None:
                return None
            if isinstance(cur, tuple):
                nv = new_visits[cur[1]]
                _finalize_row(lambda k, v: setattr(nv, k, v),
                              working.get(lane), exit_dt, reason, snap)
                return ("new", cur[1])
            st = working.get(lane)
            upd = {}
            _finalize_row(upd.__setitem__, st, exit_dt, reason, snap)
            upd["id"] = cur.id
            visit_updates.append(upd)
            return ("old", cur.id)

        def _push_live(lane, st, live_rid=None, live_ts=None):
            """Write a live (still-open) state back: chunk-new rows mutate
            in place, adopted rows get an ordered bulk mapping (last wins).
            Finalized columns (final_weight_g etc.) are NOT touched here —
            only the live/separated fields move until close."""
            cur = openv.get(lane)
            if cur is None:
                return

            def _apply(nv_dict_setter):
                nv_dict_setter("live_weight_g", st.get("current"))
                nv_dict_setter("last_valid_weight_g", st.get("last_valid"))
                nv_dict_setter("last_valid_bin_weight_g",
                               st.get("last_valid_bin"))
                nv_dict_setter("feed_intake_g",
                               round(st.get("feed") or 0.0, 1))
                nv_dict_setter("elapsed_s", round(st.get("elapsed") or 0.0, 1))
                nv_dict_setter("presence_s",
                               round(st.get("presence_acc") or 0.0, 1))
                nv_dict_setter("presence_acc", st.get("presence_acc") or 0.0)
                nv_dict_setter("counter_last", st.get("counter_last"))
                nv_dict_setter("counter_live", bool(st.get("counter_live")))
                nv_dict_setter("bin_baseline", st.get("bin_base"))
                nv_dict_setter("bin_calib", st.get("bin_cal"))
                nv_dict_setter("empty_streak", st.get("streak") or 0)
                nv_dict_setter("empty_since", _dt_of(st.get("empty_since")))
                nv_dict_setter("invalid_since", _dt_of(st.get("invalid_since")))
                nv_dict_setter("invalid_deadline",
                               _dt_of(st.get("invalid_deadline")))
                nv_dict_setter("business_state",
                               st.get("business_state") or "FEEDING")
                nv_dict_setter("bird_position", st.get("position") or "inside")
                nv_dict_setter("last_tag", st.get("last_tag"))
                nv_dict_setter("initial_confirmed_g", st.get("confirmed"))
                nv_dict_setter("stale", bool(st.get("stale")))
                if live_rid is not None:
                    nv_dict_setter("last_source_id", str(live_rid))
                if live_ts is not None:
                    nv_dict_setter("last_source_timestamp", live_ts)

            if isinstance(cur, tuple):
                _apply(lambda k, v: setattr(new_visits[cur[1]], k, v))
                return
            upd = {"id": cur.id}
            _apply(upd.__setitem__)
            visit_updates.append(upd)

        for rid, rec, ts_dt, ts_ep, age_day in planned:
            dev = (rec.get("device_id") or "").strip() or "-"
            try:
                samples = _core.build_samples(rec, ts_ep)
            except Exception:
                skipped += 2
                continue
            for sample in samples:
                unit = sample["unit"]
                ext = _live_ext(serial, gen, rid, unit)
                if ext in have:
                    skipped += 1
                    continue
                lane = (dev, unit)
                cur = openv.get(lane)
                if isinstance(cur, tuple):
                    vstate = working.get(lane)
                elif cur is not None:
                    vstate = working.get(lane) or _visit_to_state(cur)
                    working[lane] = vstate
                else:
                    vstate = None
                uprev = None
                if lane in ustate and ustate[lane].get("ts") is not None:
                    uprev = {"ts": ustate[lane]["ts"],
                             "valid": bool(ustate[lane].get("valid")),
                             "bird": ustate[lane].get("bird")}
                res = _core.process_unit_sample(sample, vstate, uprev,
                                                live_cfg)
                if res.get("uprev") is not None:
                    ustate[lane] = res["uprev"]
                    unit_writes[lane] = True
                # Structured lifecycle logs (unit-tagged; never the API
                # token): opened/closed/unidentified/refill/ejection
                # transitions at info, routine touches at debug.
                for _ev in res.get("events") or []:
                    _tag = {"opened": "CREATED",
                            "ejection-started": "EJECTING",
                            "ejection-cancelled": "EJECTION_CANCELLED",
                            "refill": "REFILL",
                            "closed": "CLOSED"}.get(_ev, _ev)
                    if _ev in ("opened", "closed", "unidentified",
                               "counter-reset", "ejection-started",
                               "ejection-cancelled", "refill", "swap-kept"):
                        slog.info("[UNIT %s] RFID=%s %s cycle=%s dev=%s rid=%s",
                                  unit, sample.get("rfid"), _tag, cycle_id,
                                  dev, rid)
                    else:
                        slog.debug("[uktech] %s cycle=%s dev=%s u%s rid=%s",
                                   _ev, cycle_id, dev, unit, rid)
                out = res.get("visit")
                snap = res.get("closed")
                is_start = is_end = False
                visit_ref = None
                def _new_live_visit(out):
                    return Visit(
                        cycle_id=cycle_id, bird_id=out["bird_id"],
                        visit_start=ts_dt,
                        sensor_id=None if dev == "-" else dev,
                        initial_weight_g=out["initial"],
                        final_weight_g=out["current"],
                        live_weight_g=out["current"],
                        last_valid_weight_g=out.get("last_valid"),
                        initial_bin_weight_g=out.get("initial_bin"),
                        last_valid_bin_weight_g=out.get("last_valid_bin"),
                        age_day=age_day, read_ok=True, unit=unit,
                        feed_intake_g=round(out["feed"] or 0.0, 1),
                        elapsed_s=round(out["elapsed"] or 0.0, 1),
                        presence_s=round(out["presence_acc"] or 0.0, 1),
                        presence_acc=out["presence_acc"] or 0.0,
                        counter_last=out["counter_last"],
                        counter_live=bool(out["counter_live"]),
                        bin_baseline=out["bin_base"],
                        bin_calib=out["bin_cal"],
                        empty_streak=0, empty_since=None,
                        invalid_since=_dt_of(out.get("invalid_since")),
                        invalid_deadline=_dt_of(out.get("invalid_deadline")),
                        business_state=out.get("business_state") or "FEEDING",
                        bird_position="inside", last_tag=out["last_tag"],
                        initial_confirmed_g=out["confirmed"],
                        close_reason=None, stale=bool(out["stale"]),
                        last_source_id=(str(rid) if rid is not None else None),
                        last_source_timestamp=ts_dt)

                if res.get("outcome") == "swap-reopened":
                    # This record closed the old visit AND opened a new one:
                    # finalize the old lane row, register the new visit, and
                    # link the log row to the new visit as its start.
                    old_ref = _close_lane(lane, ts_dt, "swap",
                                          res.get("closed"))
                    if old_ref is not None:
                        affected.append(old_ref)
                        events_count += 1
                if res.get("outcome") == "swap-reopened":
                    # This record closed the old visit AND opened a new one:
                    # finalize the old lane row, register the new visit, and
                    # link the log row to the new visit as its start.
                    old_ref = _close_lane(lane, ts_dt, "swap",
                                          res.get("closed"))
                    if old_ref is not None:
                        affected.append(old_ref)
                        events_count += 1
                    nv = _new_live_visit(out)
                    new_visits.append(nv)
                    openv[lane] = ("new", len(new_visits) - 1)
                    working[lane] = out
                    visit_ref = ("new", len(new_visits) - 1)
                    affected.append(visit_ref)
                    events_count += 1
                    is_start = True
                    elapsed = round(out["elapsed"] or 0.0, 1)
                    feed_now = round(out["feed"] or 0.0, 1)
                    lane_state[lane] = (visit_ref, out, rid)
                elif res.get("opened"):
                    nv = _new_live_visit(out)
                    new_visits.append(nv)
                    openv[lane] = ("new", len(new_visits) - 1)
                    working[lane] = out
                    visit_ref = ("new", len(new_visits) - 1)
                    affected.append(visit_ref)
                    events_count += 1
                    is_start = True
                    elapsed = round(out["elapsed"] or 0.0, 1)
                    feed_now = round(out["feed"] or 0.0, 1)
                    lane_state[lane] = (visit_ref, out, rid)
                elif snap is not None:
                    if res.get("state") is not None:
                        working[lane] = res["state"]
                    exit_dt = _dt_of(snap["exit_ts"]) or ts_dt
                    visit_ref = _close_lane(lane, exit_dt, snap["reason"],
                                            snap)
                    if isinstance(openv.get(lane), tuple):
                        pass  # _close_lane mutated the chunk-new row already
                    openv.pop(lane, None)
                    working.pop(lane, None)
                    if visit_ref is not None:
                        affected.append(visit_ref)
                    events_count += 1
                    is_end = True
                    elapsed = snap["elapsed"]
                    feed_now = snap["feed"]
                    lane_state[lane] = (None, None, rid)
                    slog.info("[UNIT %s] RFID=%s FINALIZED weight=%s "
                              "feed=%s reason=%s",
                              unit, sample.get("rfid"),
                              snap.get("final"), snap.get("feed"),
                              snap.get("reason"))
                elif out is not None:
                    working[lane] = out
                    _push_live(lane, out, live_rid=rid, live_ts=ts_dt)
                    cur2 = openv.get(lane)
                    visit_ref = cur2 if isinstance(cur2, tuple) \
                        else ("old", cur2.id)
                    affected.append(visit_ref)
                    elapsed = round(out["elapsed"] or 0.0, 1)
                    feed_now = round(out["feed"] or 0.0, 1)
                    lane_state[lane] = (visit_ref, out, rid)
                else:
                    elapsed, feed_now = 0.0, 0.0
                    lane_state[lane] = (None, None, rid)
                log_specs.append((rid, unit, dev, ext, sample, ts_dt,
                                  age_day, visit_ref, is_start, is_end,
                                  round(elapsed, 1), round(feed_now, 1)))
                inserted += 1
        # ---- persist (one txn: visits + logs + pair clocks) ----
        with SessionLocal() as s:
            if new_visits:
                s.add_all(new_visits)
                s.flush()  # PKs assigned, still one txn
                new_ids = [v.id for v in new_visits]
            else:
                new_ids = []
            log_objs = []
            pub_vids = []
            for (rid, unit, dev, ext, sample, ts_dt, age_day, visit_ref,
                 is_start, is_end, elapsed, feed) in log_specs:
                if visit_ref is None:
                    vid = None
                elif visit_ref[0] == "new":
                    vid = new_ids[visit_ref[1]]
                else:
                    vid = visit_ref[1]
                pub_vids.append(vid)
                bin_g = sample.get("bin")
                log_objs.append(DeviceLog(
                    cycle_id=cycle_id, timestamp=ts_dt,
                    flock_id=f"UKTECH-{serial}", bird_id=sample.get("rfid"),
                    sensor_id=None if dev == "-" else dev,
                    age_day=age_day,
                    # stored exactly as received (spec rule 4); display
                    # rounds to 0.01, logic never rounds.
                    raw_weight_g=sample.get("bird"),
                    weight_g=sample.get("bird"),
                    feed_bin_kg=(bin_g / 1000.0
                                 if bin_g is not None else None),
                    feed_delta_g=None,
                    temp_c=None, humidity=None, rssi=None, visit_id=vid,
                    is_visit_start=is_start, is_visit_end=is_end,
                    external_id=ext, status=sample.get("status_raw")))
            if log_objs:
                s.add_all(log_objs)
                s.flush()
            if visit_updates:
                s.bulk_update_mappings(Visit, visit_updates)
            # pair clocks + unit state (same txn: clock/state can never
            # diverge from data). The unit row is the restart-proof view of
            # the lane: current business state, active visit, eject
            # countdown, and source trace.
            for (_dev, _unit), _w in unit_writes.items():
                _st = ustate.get((_dev, _unit)) or {}
                _vref, _vst, _rid = lane_state.get((_dev, _unit),
                                                   (None, None, None))
                if _vref is not None and _vref[0] == "new":
                    _vid = (new_ids[_vref[1]]
                            if _vref[1] < len(new_ids) else None)
                elif _vref is not None:
                    _vid = _vref[1]
                else:
                    _vid = None
                _row = s.get(UnitState, (cycle_id, _dev, _unit))
                _dt = _dt_of(_st.get("ts"))
                _vv = _st.get("valid")
                _vv = bool(_vv) if _vv is not None else None
                _bb = _st.get("bird")
                _bb = bool(_bb) if _bb is not None else None
                _bs = (_vst or {}).get("business_state")
                _inv = (_vst or {}).get("invalid_since")
                _dead = (_vst or {}).get("invalid_deadline")
                if _row is None:
                    s.add(UnitState(
                        cycle_id=cycle_id, device_id=_dev, unit=_unit,
                        prev_ts=_dt, prev_valid=_vv, prev_bird=_bb,
                        business_state=_bs or "EMPTY",
                        active_visit_id=_vid,
                        invalid_since=_dt_of(_inv),
                        invalid_deadline=_dt_of(_dead),
                        last_source_id=(str(_rid) if _rid is not None
                                        else None),
                        updated_at=utcnow()))
                else:
                    _row.prev_ts = _dt
                    _row.prev_valid = _vv
                    _row.prev_bird = _bb
                    if _bs is not None or _vid is None:
                        # closed lanes report EMPTY with no active visit
                        _row.business_state = _bs or "EMPTY"
                    if _vid is not None or _bs is None:
                        _row.active_visit_id = _vid
                    _row.invalid_since = _dt_of(_inv)
                    _row.invalid_deadline = _dt_of(_dead)
                    if _rid is not None:
                        _row.last_source_id = str(_rid)
                    _row.updated_at = utcnow()
            s.commit()
            # ---- change analysis: one registrations-shaped entry per visit
            # this call created or changed (newest first), so the UI patches
            # exactly those rows instead of re-rendering the whole table.
            aff_vids, opened_vids = [], set()
            for ref in affected:
                if ref[0] == "new" and ref[1] < len(new_ids):
                    aff_vids.append(new_ids[ref[1]])
                    opened_vids.add(new_ids[ref[1]])
                elif ref[0] == "old":
                    aff_vids.append(ref[1])
            aff_vids = list(dict.fromkeys(aff_vids))  # dedupe, keep order
            if aff_vids and len(aff_vids) <= 200:
                vrows = s.query(Visit).filter(Visit.id.in_(aff_vids)).all()
                binlast, pausemap = {}, {}
                for _vid2, _fb2, _fst in (s.query(DeviceLog.visit_id,
                                                 DeviceLog.feed_bin_kg,
                                                 DeviceLog.status)
                                          .filter(DeviceLog.visit_id.in_(aff_vids))
                                          .order_by(DeviceLog.id.desc()).all()):
                    if _fb2 is not None:
                        binlast.setdefault(_vid2, _fb2)
                    if _vid2 not in pausemap:
                        pausemap[_vid2] = bool(_fst and str(_fst).strip()
                                               and str(_fst).strip().upper() != "VALID")
                now_ck = utcnow()
                tmp = []
                for _v in vrows:
                    # elapsed_s is the effective clock (counter/fallback);
                    # presence_s the informational cross-check; wall clock
                    # only for legacy rows that predate both.
                    if _v.elapsed_s is not None:
                        _el = _v.elapsed_s
                    elif _v.presence_s is not None:
                        try:
                            _el = max(0.0, float(_v.presence_s))
                        except (TypeError, ValueError):
                            _el = 0.0
                    else:
                        try:
                            _end = _v.visit_end or now_ck
                            _el = max(0.0, (_aware_utc(_end) - _aware_utc(
                                _v.visit_start)).total_seconds()) \
                                if _v.visit_start else 0.0
                        except Exception:
                            _el = 0.0
                    _bk = binlast.get(_v.id)
                    _eject = None
                    try:
                        if (_v.business_state == "EJECTING"
                                and _v.visit_end is None
                                and _v.invalid_deadline is not None):
                            _dl = _v.invalid_deadline
                            _eject = max(0.0, (_aware_utc(_dl) - now_ck)
                                         .total_seconds())
                    except Exception:
                        _eject = None
                    tmp.append((_v.visit_start,
                                {"id": _v.id, "bird_id": _v.bird_id,
                                 "initial_weight_g": _v.initial_weight_g,
                                 "final_weight_g": _v.final_weight_g,
                                 "live_weight_g": _v.live_weight_g,
                                 "last_valid_weight_g":
                                 _v.last_valid_weight_g,
                                 "initial_bin_weight_g":
                                 _v.initial_bin_weight_g,
                                 "last_valid_bin_weight_g":
                                 _v.last_valid_bin_weight_g,
                                 "final_bin_weight_g": _v.final_bin_weight_g,
                                 "weight_gain_g": _v.weight_gain_g,
                                 "feed_intake_g": (round(_v.feed_intake_g, 1)
                                                   if _v.feed_intake_g is not None
                                                   else None),
                                 "elapsed_s": round(_el, 1),
                                 "presence_s": _v.presence_s,
                                 "unit": _v.unit if _v.unit in (1, 2) else 1,
                                 "bin_weight_g": (round(_bk * 1000.0, 2)
                                                  if _bk is not None else None),
                                 "business_state": (_v.business_state
                                                    or "EMPTY"),
                                 "eject_in_s": (round(_eject, 0)
                                                if _eject is not None
                                                else None),
                                 "bird_position": (_v.bird_position
                                                   or "inside"),
                                 "stale": bool(_v.stale),
                                 "paused": bool(pausemap.get(_v.id))
                                 and _v.visit_end is None,
                                 "registered_at": (_v.visit_start.isoformat()
                                                   if _v.visit_start else None),
                                 "visit_end": (_v.visit_end.isoformat()
                                               if _v.visit_end else None),
                                 "sensor_id": _v.sensor_id,
                                 "is_new": _v.id in opened_vids,
                                 "is_closed": _v.visit_end is not None}))
                try:
                    tmp.sort(key=lambda t: (t[0] is None, t[0]),
                             reverse=True)
                except TypeError:
                    pass  # mixed tz-aware/naive starts: keep commit order
                changes = [c for _, c in tmp]
            # publish payloads with per-row elapsed/feed saved above.
            for (spec, _lo, _vid) in zip(log_specs, log_objs, pub_vids):
                (_rid, _unit, _dev, _ext, _sample, _ts, _age, _ref,
                 _is_start, _is_end, _el, _feed) = spec
                _bg = _sample.get("bin")
                published.append(_log_to_dict(_lo, {
                    "elapsed_s": _el, "visit_feed_g": _feed,
                    "unit": _unit,
                    "business_state": ("EXITED" if _is_end
                                       else ("FEEDING" if _vid else "EMPTY")),
                    "bird_position": ("outside" if _is_end
                                      else ("inside" if _vid else None)),
                    "bin_weight_g": round(_bg, 2)
                    if _bg is not None else None}))
        # Drop any cached in-memory visit state for this cycle: the bulk write
        # went straight to the DB, so a cached processor would hold stale ctx.
        # Clearing forces a DB rebuild on next use (existing-check converges).
        get_processor(cycle_id).open.clear()
        # publish only after commit — never show rows that rolled back
        for log_d in published:
            try:
                hub.publish(log_d)  # live UI update; never breaks the sync
            except Exception:
                pass

    # Per-cycle cursor for tenant isolation
    ck = state_key(serial, cycle_id)
    with SessionLocal() as s:
        row = s.get(SyncState, ck)
        if row is None:
            # Check if we should migrate from global key
            global_row = s.get(SyncState, state_key(serial))
            # Always create per-cycle key; don't delete global for backward compat
            row = SyncState(key=ck, last_id=max_seen,
                            updated_at=utcnow(),
                            note=f"cycle {cycle_id}: +{inserted}")
            s.add(row)
        else:
            row.last_id = max_seen
            row.updated_at = utcnow()
            row.note = f"cycle {cycle_id}: +{inserted}"
            if did_reset:
                row.note += " (upstream reset)"
            elif stalled:
                row.note += f" (STALLED: {stalled_reason})"
        s.commit()

    chunk_complete = complete and remaining <= 0
    return {"cycle_id": cycle_id, "serial": serial, "fetched": len(fresh),
            "inserted": inserted, "skipped": skipped, "last_id": max_seen,
            "complete": chunk_complete, "remaining": max(0, remaining),
            "reset": did_reset, "interrupted": interrupted,
            "swept": swept,
            "events": events_count,
            "stalled": stalled, "stalled_reason": stalled_reason,
            "tls_insecure": _TLS_FALLBACK_USED,
            "probed": True, "upstream_max": upstream_max,
            "upstream_delta": upstream_delta, "changes": changes}
