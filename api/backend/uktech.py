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


def state_key(serial: str) -> str:
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
        "weight_g": None,       # processor applies EMA from raw
        "feed_bin_kg": None,    # weighing station: no feed bin
        "feed_delta_g": None,
        "temp_c": None,
        "humidity": None,
        "rssi": None,
    }
    return event, external_id(serial, rec.get("id")), ts


def fetch_records(serial: str, token: str, limit: int = 100, offset: int = 0,
                  base: str = None, timeout: int = None):
    """Fetch one page (newest first). Returns (records, has_more)."""
    if not token:
        raise UktechError("uktech API token is not configured on the server")
    base = base or UKTECH_API_BASE
    qs = urllib.parse.urlencode({
        "serial": serial, "limit": limit, "offset": offset, "ttoken": token,
    })
    url = f"{base}?{qs}"
    req = urllib.request.Request(url, headers={"Accept": "application/json",
                                               "User-Agent": "ArianBackend/1.0"})
    ctx = None
    if not UKTECH_VERIFY_SSL:
        import logging
        import ssl
        ctx = ssl._create_unverified_context()
        if not globals().get("_warned_insecure"):
            globals()["_warned_insecure"] = True
            logging.getLogger(__name__).warning(
                "UKTECH_VERIFY_SSL=false: TLS certs NOT verified (use only behind firewall)")
    try:
        with urllib.request.urlopen(req, timeout=timeout or UKTECH_TIMEOUT_S,
                                    context=ctx) as r:
            payload = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise UktechError(f"uktech API HTTP {e.code}")
    except urllib.error.URLError as e:
        raise UktechError(f"uktech API unreachable: {getattr(e, 'reason', e)}")
    except (ValueError, TimeoutError) as e:
        raise UktechError(f"uktech API bad response: {e}")
    if str(payload.get("status", "")).lower() != "success":
        raise UktechError(f"uktech API error: {payload.get('message', payload.get('code', '?'))}")
    meta = payload.get("meta") or {}
    return payload.get("data") or [], bool(meta.get("has_more"))


def get_cursor(serial: str) -> int:
    with SessionLocal() as s:
        row = s.get(SyncState, state_key(serial))
        return row.last_id if row else 0


def sync_status(serial: str = None) -> dict:
    serial = (serial or UKTECH_SERIAL).strip() or UKTECH_SERIAL
    with SessionLocal() as s:
        row = s.get(SyncState, state_key(serial))
        return {
            "configured": bool(UKTECH_TOKEN),
            "serial": serial,
            "last_id": row.last_id if row else 0,
            "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
            "note": row.note if row else None,
        }


def sync_serial_to_cycle(cycle_id: int, serial: str = None, limit: int = None,
                         max_pages: int = None) -> dict:
    """Pull new uktech rows into a cycle. Oldest-first so visit aggregation
    sees events in chronological order. Returns a summary dict."""
    from processor import get_processor  # local import: avoids import cycles
    import hub

    serial = (serial or UKTECH_SERIAL).strip() or UKTECH_SERIAL
    page_size = max(1, min(int(limit or UKTECH_PAGE_SIZE), 500))
    max_pages = int(max_pages or UKTECH_MAX_PAGES)

    with SessionLocal() as s:
        cycle = s.get(Cycle, cycle_id)
        if not cycle:
            raise UktechError(f"cycle {cycle_id} not found")
        try:
            start_day = cycle.start_date.date() if cycle.start_date else None
        except Exception:
            start_day = None

    last_id = get_cursor(serial)
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

    proc = get_processor(cycle_id)
    inserted, skipped, max_seen = 0, 0, last_id
    if fresh:
        ext_ids = [external_id(serial, rid) for rid, _ in fresh]
        with SessionLocal() as s:
            have = {r[0] for r in s.query(DeviceLog.external_id).filter(
                DeviceLog.cycle_id == cycle_id,
                DeviceLog.external_id.in_(ext_ids)).all()}
        for rid, rec in fresh:
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
            log_d = proc.ingest(event)
            with SessionLocal() as s:
                s.query(DeviceLog).filter(DeviceLog.id == log_d["id"]).update(
                    {"external_id": ext})
                s.commit()
            try:
                hub.publish(log_d)  # live UI update; never breaks the sync
            except Exception:
                pass
            inserted += 1

    with SessionLocal() as s:
        row = s.get(SyncState, state_key(serial))
        if row is None:
            row = SyncState(key=state_key(serial), last_id=max_seen,
                            updated_at=utcnow(),
                            note=f"cycle {cycle_id}: +{inserted}")
            s.add(row)
        else:
            row.last_id = max_seen
            row.updated_at = utcnow()
            row.note = f"cycle {cycle_id}: +{inserted}"
        s.commit()

    return {"cycle_id": cycle_id, "serial": serial, "fetched": len(fresh),
            "inserted": inserted, "skipped": skipped, "last_id": max_seen,
            "complete": complete}
