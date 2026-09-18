"""
Arian — online device ingest from the uktech weight API.

Upstream: GET <UKTECH_API_BASE>?serial=<serial>&limit=<n>&offset=<o>&ttoken=<token>
  -> {"status": "success", "meta": {..., "has_more": bool},
        "data": [{id, device_id, rfid1, rfid2, weight_1..4, total_weight,
                  status1, status2, device_status, created_at, ...}]}

Mapping onto the 12-col device schema (processor.ingest):
  timestamp     <- created_at, Asia/Tehran wall clock -> UTC
  bird_id       <- rfid1 or rfid2 (None when both empty: weight-only row)
  sensor_id     <- device_id
  raw_weight_g  <- total_weight (rounded; float artefacts like 216.74..01)
  weight_g      <- same rounded raw (table display + visit init weight)
  flock_id      <- "UKTECH-<serial>" (traceability)
  age_day       <- days since the target cycle's start_date
  feed/temp/humidity/rssi <- absent upstream -> None (visits carry weights,
                             intake stays 0: this station weighs birds)

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
from models import Cycle, DeviceLog, SessionLocal, SyncState, utcnow

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
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def record_to_event(rec: dict, age_day, serial: str):
    """Map one uktech row -> (12-col event dict, external_id, utc datetime)."""
    ts = parse_tehran_utc(rec.get("created_at"))
    bird = (rec.get("rfid1") or "").strip() or (rec.get("rfid2") or "").strip() or None
    raw = _to_float(rec.get("total_weight"))
    if raw is not None:
        raw = round(raw, 1)
    sensor = (rec.get("device_id") or "").strip() or None
    event = {
        "timestamp": ts.isoformat(),
        "flock_id": f"UKTECH-{serial}",
        "bird_id": bird,
        "sensor_id": sensor,
        "age_day": age_day,
        "raw_weight_g": raw,
        # weight_g mirrors raw: the table + visit aggregates need a display
        # weight (processor still smooths per-visit EMA on top of it).
        "weight_g": raw,
        "feed_bin_kg": None,    # weighing station: no feed bin
        "feed_delta_g": None,
        "temp_c": None,
        "humidity": None,
        "rssi": None,
    }
    return event, external_id(serial, rec.get("id")), ts


def _fetch_once(url: str, timeout: int, verify: bool):
    """Single GET attempt. Raises UktechError on any transport/payload fault."""
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
    fresh = []  # (remote_id, record) with id > last_id
    offset = 0
    complete = True
    for _ in range(max_pages):
        records, has_more = fetch_records(serial, UKTECH_TOKEN, page_size, offset)
        if not records:
            break
        for rec in records:
            try:
                rid = int(rec.get("id"))
            except (TypeError, ValueError):
                continue
            if rid > last_id:
                fresh.append((rid, rec))
        offset += len(records)
        if not has_more:
            break
        # pages arrive newest-first: stop once a page reaches already-synced rows
        try:
            if min(int(r.get("id")) for r in records) <= last_id:
                break
        except (TypeError, ValueError):
            break
    else:
        complete = False  # page cap hit while upstream still has more
    fresh.sort(key=lambda t: t[0])  # oldest first for the visit state machine

    # Chunk: write only the first `batch` rows this call so a serverless
    # invocation finishes well inside its time limit; the cursor below lands
    # on the last WRITTEN row, so the next call continues where we stopped.
    todo = fresh[:batch]
    remaining = len(fresh) - len(todo)
    if not complete:
        remaining += 1  # upstream still has more pages beyond this fetch
    proc = get_processor(cycle_id)
    inserted, skipped, max_seen = 0, 0, last_id
    if todo:
        ext_ids = [external_id(serial, rid) for rid, _ in todo]
        with SessionLocal() as s:
            have = {r[0] for r in s.query(DeviceLog.external_id).filter(
                DeviceLog.cycle_id == cycle_id,
                DeviceLog.external_id.in_(ext_ids)).all()}
        # One shared session + a single commit for the whole chunk: with
        # autoflush off, flush per row so each row sees the previous rows'
        # state (open-visit checks). A mid-chunk DB error rolls the chunk
        # back; the endpoint 502s, the client retries, and the have-check
        # above dedupes — progress is never lost, just redone.
        with SessionLocal() as s:
            published = []
            for rid, rec in todo:
                max_seen = max(max_seen, rid)
                ext = external_id(serial, rid)
                if ext in have:
                    skipped += 1
                    continue
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
                event, _ext, _ts = record_to_event(rec, age_day, serial)
                event["external_id"] = ext  # stored at insert, no extra UPDATE
                log_d = proc.ingest(event, s=s)
                s.flush()
                published.append(log_d)
                inserted += 1
            s.commit()
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
        s.commit()

    chunk_complete = complete and remaining <= 0
    return {"cycle_id": cycle_id, "serial": serial, "fetched": len(todo),
            "inserted": inserted, "skipped": skipped, "last_id": max_seen,
            "complete": chunk_complete, "remaining": max(0, remaining),
            "tls_insecure": _TLS_FALLBACK_USED}
