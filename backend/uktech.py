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
)
from models import (Cycle, DeviceLog, SessionLocal, SyncState, Visit,
                    WeighingSession, utcnow)
import weighing as _weighing

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
        bin_kg = round(bin_g / 1000.0, 3) if bin_g is not None else None
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


def sync_serial_to_cycle(cycle_id: int, serial: str = None, limit: int = None,
                         max_pages: int = None, batch: int | None = None) -> dict:
    """Pull new uktech rows into a cycle. Oldest-first so visit aggregation
    sees events in chronological order. Returns a summary dict.

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

    last_id = get_cursor(serial, cycle_id)
    global _LAST_META
    _LAST_META = None
    fresh = []  # (remote_id, record) with id > last_id
    seen_ids = set()  # every upstream id observed (for reset detection)
    offset = 0
    complete = True
    exhausted = True  # False if we stopped early (cursor hit or page cap)
    for _ in range(max_pages):
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
    stalled = False
    stalled_reason = ""
    upstream_max = max(seen_ids) if seen_ids else None
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
            did_reset = True
            last_id = 0
            with SessionLocal() as s:
                prefix = f"{serial}:"
                s.query(DeviceLog).filter(
                    DeviceLog.cycle_id == cycle_id,
                    DeviceLog.external_id.like(prefix + "%")).delete(
                        synchronize_session=False)
                # drop visits left with zero logs in this cycle (they only
                # aggregated the wiped generation); visits still holding other
                # rows (e.g. manual ingest) are kept.
                alive = {r[0] for r in
                         s.query(DeviceLog.visit_id)
                         .filter(DeviceLog.cycle_id == cycle_id,
                                 DeviceLog.visit_id.isnot(None)).all()}
                orphans = s.query(Visit).filter(Visit.cycle_id == cycle_id)
                if alive:
                    orphans = orphans.filter(~Visit.id.in_(alive))
                orphans.delete(synchronize_session=False)
                # sessions reference the wiped generation: drop them too, or the
                # old WAITING states would suppress the fresh rows below.
                s.query(WeighingSession).filter(
                    WeighingSession.serial == serial,
                    WeighingSession.cycle_id == cycle_id).delete(
                        synchronize_session=False)
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
    from processor import (  # local import: avoids import cycles
        _aware_utc, _intake_increment, _log_to_dict)

    inserted, skipped, max_seen = 0, 0, last_id
    published = []
    events_count = 0
    if todo:
        # external ids are per-unit ("<serial>:<id>:u1"); legacy bare ids
        # can never collide with them, so old rows are never "already have".
        ext_ids = [f"{external_id(serial, rid)}:u{u}" for rid, _ in todo
                   for u in (1, 2)]
        with SessionLocal() as s:
            have = {r[0] for r in s.query(DeviceLog.external_id).filter(
                DeviceLog.cycle_id == cycle_id,
                DeviceLog.external_id.in_(ext_ids)).all()}
        # ---- pass 1: guards + shaping (no DB writes) ----
        # planned rows: (rid, unit, ext, event, ts, presence)
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
            try:
                units = record_to_unit_events(rec, age_day, serial)
            except UktechError:
                skipped += 1
                continue
            for unit, event, ext, _ts, presence in units:
                if ext in have:
                    skipped += 1
                    continue
                planned.append((rid, unit, ext, event, _ts, presence))
        # ---- pass 2: session classification + visit planning ----
        # Every planned row runs through the weighing session machine
        # (weighing.classify). Only REGISTERED events open visits; residuals,
        # duplicates and unloading rows are stored as visitless raw logs, so
        # the dashboard table shows one row per physical weighing instead of
        # one row per API record. Visit/bin semantics mirror processor.ingest
        # (feed attribution, close writes, elapsed) — only the open/close
        # DECISIONS now come from sessions instead of time gaps.
        cfg = _weighing.load_config()
        now_dt = max((_ts for _, _, _, _, _ts, _ in planned),
                     default=utcnow())
        now_ts = now_dt.timestamp()
        # Session lanes are per unit: the lane device is suffixed (#u1/#u2)
        # so two units never share a session even with identical rfids,
        # while the stored sensor_id stays the plain device id.
        lane_of = {}
        for _, unit, _, event, _, _ in planned:
            dev = (event["sensor_id"] or "").strip() or "-"
            k = _weighing.session_key(serial, cycle_id, f"{dev}#u{unit}",
                                      event["bird_id"])
            lane_of.setdefault(k, (event["sensor_id"], event["bird_id"]))
        with SessionLocal() as s:
            srows = (s.query(WeighingSession)
                     .filter(WeighingSession.key.in_(lane_of)).all()
                     if lane_of else [])
        sess = {}
        for r in srows:
            sess[r.key] = {
                "state": r.state or _weighing.EMPTY,
                "candidate": r.candidate, "count": r.stable_count or 0,
                "zero_count": r.zero_count or 0, "registered": r.registered,
                "visit_id": r.visit_id,
                "first_ts": (_aware_utc(r.first_ts).timestamp()
                             if r.first_ts else None),
                "updated_at": (_aware_utc(r.updated_at).timestamp()
                               if r.updated_at else None),
                "last_seen": (_aware_utc(r.last_seen_ts).timestamp()
                              if r.last_seen_ts else None)}
        # open-visit context (authoritative DB state): bin baseline, elapsed
        # start, accumulated feed base. Session.visit_id is only a hint and
        # is revalidated against this set before any close/ratchet.
        birds = sorted({e["bird_id"] for _, _, _, e, _, _ in planned
                        if e["bird_id"]})
        with SessionLocal() as s:
            orows = (s.query(Visit.id, Visit.bird_id, Visit.visit_start,
                             Visit.initial_weight_g, Visit.feed_intake_g,
                             Visit.unit, Visit.presence_s, Visit.sensor_id)
                     .filter(Visit.cycle_id == cycle_id,
                             Visit.bird_id.in_(birds),
                             Visit.visit_end.is_(None)).all()) if birds else []
        # open visits keyed by (bird, unit): the two hopper lanes never share
        # bin baselines or elapsed clocks, even for the same RFID. The time
        # clock seeds from the lane session (last validated row seen), so
        # presence stays exact across chunk boundaries.
        openv = {}
        for _vid, _bird, _start, _initw, _feed, _unit, _pres, _sens in orows:
            _lane = _weighing.session_key(
                serial, cycle_id,
                f"{(_sens or '').strip() or '-'}#u{_unit or 1}", _bird)
            _lsess = sess.get(_lane, {})
            openv[(_bird, _unit or 1)] = {
                "vid": _vid, "db": True,
                "start": _aware_utc(_start),
                "base": _feed, "acc": 0.0, "bin_prev": None,
                "registered": _initw, "touched": False,
                "pbase": _pres, "tacc": 0.0,
                "last_valid": _lsess.get("last_seen"),
                "db_unit": _unit,
                "is_new": False, "new_idx": None}
        new_visits = []
        visit_updates = []  # bulk mappings for closes/ratchets/touches
        dirty_sess = set()
        log_specs = []  # (event, ts, ext, is_start, is_end, visit_ref, elapsed, feed)

        def _close_ov(ov, end_dt, binkg, lane_unit=None):
            """Close one open-visit entry (new or adopted). Returns
            (visit_ref, feed) for the closing row's live payload.

            presence_s lands here as validated-accumulated seconds
            ((base or 0) + tacc) — the only moment its final value is known.
            Unit is backfilled on adopted rows that predate the lane column.
            """
            end_inc = _intake_increment({"bin_prev": ov["bin_prev"]},
                                        binkg, None)
            ov["acc"] += end_inc
            if binkg is not None:
                ov["bin_prev"] = binkg
            feed = (ov["base"] or 0) + ov["acc"]
            pres = (ov["pbase"] or 0) + ov["tacc"]
            if ov.get("is_new"):
                nv_old = new_visits[ov["new_idx"]]
                nv_old.visit_end = end_dt
                nv_old.feed_intake_g = feed
                nv_old.final_weight_g = ov["registered"]
                nv_old.presence_s = pres
                return ("new", ov["new_idx"]), feed, pres
            close_map = {
                "id": ov["vid"], "visit_end": end_dt,
                "feed_intake_g": feed,
                "final_weight_g": ov["registered"],
                "presence_s": pres,
                "temp_c": None, "humidity": None}
            if ov.get("db_unit") is None and lane_unit is not None:
                close_map["unit"] = lane_unit
            visit_updates.append(close_map)
            return ("old", ov["vid"]), feed, pres
        for rid, unit, ext, event, ts, presence in planned:
            bird = event["bird_id"]
            w = event["weight_g"]
            binkg = event["feed_bin_kg"]
            dev = (event["sensor_id"] or "").strip() or "-"
            key = _weighing.session_key(serial, cycle_id, f"{dev}#u{unit}",
                                        bird)
            is_start = is_end = False
            visit_ref = None
            elapsed, feed_now = 0.0, 0.0
            st = sess.get(key)
            if st is None:
                st = _weighing.fresh_state()
                sess[key] = st
            ts_ep = ts.timestamp()
            new_st, actions = _weighing.classify(st, w, ts_ep, now_ts, cfg)
            sess[key] = new_st
            dirty_sess.add(key)
            closed_this_row = registered_this_row = False
            for act in actions:
                kind = act[0]
                if kind == "register":
                    _, rw, first_ep = act
                    events_count += 1
                    lane = (bird, unit)
                    if bird:
                        # quick-swap: a previous visit may still be open
                        # (no zero seen between loads) — close it first so no
                        # orphan open visit leaks with ever-growing elapsed.
                        prev = openv.get(lane)
                        if prev is not None:
                            _close_ov(prev, ts, binkg, lane_unit=unit)
                            del openv[lane]
                            # elapsed for a pre-close is covered by the new
                            # visit below; nothing to display here.
                    if bird:
                        first_dt = datetime.fromtimestamp(
                            first_ep, tz=timezone.utc)
                        nv = Visit(
                            cycle_id=cycle_id, bird_id=bird,
                            visit_start=first_dt,
                            sensor_id=event["sensor_id"],
                            initial_weight_g=rw, age_day=event["age_day"],
                            rssi=event["rssi"], read_ok=True, unit=unit)
                        new_visits.append(nv)
                        openv[lane] = {"vid": None, "db": False,
                                       "start": first_dt, "base": None,
                                       "acc": 0.0, "bin_prev": binkg,
                                       "registered": rw, "touched": False,
                                       "pbase": None, "tacc": 0.0,
                                       "last_valid": ts_ep,
                                       "is_new": True,
                                       "new_idx": len(new_visits) - 1}
                        new_st["visit_id"] = ("new", len(new_visits) - 1)
                        is_start = True
                        visit_ref = ("new", len(new_visits) - 1)
                    registered_this_row = True
                elif kind == "ratchet":
                    _, rw = act
                    ov = openv.get((bird, unit)) if bird else None
                    if ov is not None:
                        ov["registered"] = rw
                        if ov.get("is_new"):
                            new_visits[ov["new_idx"]].initial_weight_g = rw
                            new_visits[ov["new_idx"]].final_weight_g = rw
                        else:
                            visit_updates.append({
                                "id": ov["vid"], "initial_weight_g": rw,
                                "final_weight_g": rw})
                elif kind in ("close", "timeout_close"):
                    end_dt = (datetime.fromtimestamp(now_ts, tz=timezone.utc)
                              if kind == "timeout_close" else ts)
                    ov = openv.get((bird, unit)) if bird else None
                    if ov is not None:
                        # the closing row itself is a validated observation
                        # (unless INVALID-flagged): accrue its span first.
                        if kind == "close" and _weighing.is_status_valid(
                                event.get("status")):
                            if ov.get("last_valid") is not None:
                                try:
                                    ov["tacc"] += max(
                                        0.0, ts_ep - ov["last_valid"])
                                except Exception:
                                    pass
                            ov["last_valid"] = ts_ep
                        visit_ref, feed_now, close_pres = _close_ov(
                            ov, end_dt, binkg, lane_unit=unit)
                        elapsed = round(close_pres, 1)
                        del openv[(bird, unit)]
                        is_end = True
                    new_st["visit_id"] = None
                    closed_this_row = True
            # track the lane clock on every row (any validity) so the next
            # VALID row accrues exactly the span since this one.
            new_st["last_seen"] = ts_ep
            if not registered_this_row and not closed_this_row:
                ov = openv.get((bird, unit)) if bird else None
                if ov is not None:
                    if binkg is not None:
                        inc = _intake_increment({"bin_prev": ov["bin_prev"]},
                                                binkg, None)
                        ov["acc"] += inc
                        ov["bin_prev"] = binkg
                    # presence accrues ONLY over VALID spans: the span ending
                    # here counts iff this row is valid AND we know the
                    # previous row time (adopted visits seed it from the
                    # lane session, new visits from their register row).
                    if _weighing.is_status_valid(event.get("status")):
                        if ov.get("last_valid") is not None:
                            try:
                                ov["tacc"] += max(
                                    0.0, ts_ep - ov["last_valid"])
                            except Exception:
                                pass
                        ov["last_valid"] = ts_ep
                    ov["touched"] = True
            # elapsed + live feed context: validated-accumulated presence so
            # far ((pbase or 0) + tacc). Close rows set elapsed above to the
            # final presence.
            if not closed_this_row:
                ov_now = openv.get((bird, unit)) if bird else None
                if ov_now and ov_now.get("start"):
                    elapsed = round((ov_now.get("pbase") or 0)
                                    + ov_now.get("tacc", 0.0), 1)
                    feed_now = (ov_now["base"] or 0) + ov_now["acc"]
            log_specs.append((event, ts, ext, is_start, is_end, visit_ref,
                              round(elapsed, 1), round(feed_now, 1)))
            inserted += 1
        # ---- pass 3: persist (one txn: visits + logs + sessions) ----
        with SessionLocal() as s:
            # finalize still-OPEN new visits: touched -> feed/final values
            # (mirrors per-step writes), untouched -> NULLs. presence is the
            # validated-accumulated clock ((pbase or 0) + tacc).
            for ov in openv.values():
                if ov.get("is_new") and ov.get("touched"):
                    nv = new_visits[ov["new_idx"]]
                    nv.feed_intake_g = ov["acc"]
                    nv.final_weight_g = ov["registered"]
                    nv.presence_s = ov["tacc"]
            # touches on adopted open visits (mirror per-step writes). Unit
            # is backfilled when missing (pre-migration rows); never clobbered
            # otherwise — a visit belongs to exactly one lane.
            for (_bird, _lane_unit), ov in openv.items():
                if not ov.get("is_new") and ov.get("touched"):
                    upd = {
                        "id": ov["vid"],
                        "feed_intake_g": (ov["base"] or 0) + ov["acc"],
                        "final_weight_g": ov["registered"],
                        "presence_s": (ov["pbase"] or 0) + ov["tacc"],
                        "temp_c": None, "humidity": None}
                    if ov.get("db_unit") is None:
                        upd["unit"] = _lane_unit
                    visit_updates.append(upd)
            if new_visits:
                s.add_all(new_visits)
                s.flush()  # PKs assigned, still one txn
                new_ids = [v.id for v in new_visits]
            else:
                new_ids = []
            # resolve ("new", idx) visit markers held by sessions
            for st in sess.values():
                vmk = st.get("visit_id")
                if isinstance(vmk, tuple) and vmk[0] == "new":
                    st["visit_id"] = new_ids[vmk[1]]
            log_objs = []
            for (event, ts, ext, is_start, is_end, visit_ref,
                 elapsed, feed) in log_specs:
                if visit_ref is None:
                    vid = None
                elif visit_ref[0] == "new":
                    vid = new_ids[visit_ref[1]]
                else:
                    vid = visit_ref[1]
                log_objs.append(DeviceLog(
                    cycle_id=cycle_id, timestamp=ts,
                    flock_id=event["flock_id"], bird_id=event["bird_id"],
                    sensor_id=event["sensor_id"], age_day=event["age_day"],
                    raw_weight_g=event["raw_weight_g"],
                    weight_g=event["weight_g"],
                    feed_bin_kg=event["feed_bin_kg"],
                    feed_delta_g=event["feed_delta_g"],
                    temp_c=event["temp_c"], humidity=event["humidity"],
                    rssi=event["rssi"], visit_id=vid,
                    is_visit_start=is_start, is_visit_end=is_end,
                    external_id=ext, status=event.get("status")))
            if log_objs:
                s.add_all(log_objs)
                s.flush()
            if visit_updates:
                s.bulk_update_mappings(Visit, visit_updates)
            # sessions (same txn: state can never diverge from data)
            sess_rows = []
            for key in dirty_sess:
                st = sess[key]
                dev, tag = lane_of.get(key, ("-", "-"))
                fts = st.get("first_ts")
                sess_rows.append({
                    "key": key, "serial": serial, "cycle_id": cycle_id,
                    "device_id": None if dev == "-" else dev,
                    "rfid": None if tag == "-" else tag,
                    "state": st["state"], "candidate": st.get("candidate"),
                    "stable_count": st.get("count", 0),
                    "zero_count": st.get("zero_count", 0),
                    "registered": st.get("registered"),
                    "visit_id": st.get("visit_id"),
                    "first_ts": (datetime.fromtimestamp(
                        fts, tz=timezone.utc) if fts else None),
                    "last_seen_ts": (datetime.fromtimestamp(
                        st.get("last_seen"), tz=timezone.utc)
                        if st.get("last_seen") else None),
                    "updated_at": now_dt})
            if sess_rows:
                have_keys = {r.key for r in srows}
                new_srows = [r for r in sess_rows if r["key"] not in have_keys]
                upd_srows = [r for r in sess_rows if r["key"] in have_keys]
                if new_srows:
                    s.bulk_insert_mappings(WeighingSession, new_srows)
                if upd_srows:
                    s.bulk_update_mappings(WeighingSession, upd_srows)
            s.commit()
            # rebuild publish payloads with per-row elapsed/feed saved above.
            # unit lane parsed from the external id suffix; hopper level in
            # grams for the per-unit live tables.
            for (event, ts, ext, is_start, is_end, visit_ref,
                 elapsed, feed), _lo in zip(log_specs, log_objs):
                unit = 2 if ext.endswith(":u2") else 1
                binkg = event.get("feed_bin_kg")
                published.append(_log_to_dict(_lo, {
                    "elapsed_s": elapsed, "visit_feed_g": feed,
                    "unit": unit,
                    "bin_weight_g": round(binkg * 1000.0, 2)
                    if binkg is not None else None}))
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
            "reset": did_reset, "events": events_count,
            "stalled": stalled, "stalled_reason": stalled_reason,
            "tls_insecure": _TLS_FALLBACK_USED}
