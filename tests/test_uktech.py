"""Online device ingest (uktech weight API) — mapping + pagination contract.

Pure-function pins (no DB, no network): Tehran wall-clock -> UTC, float
artefact rounding, RFID fallback, idempotency key format. The live sync is
covered by a manual runbook (POST /api/uktech/sync) plus the sqlite E2E
below, which stubs only the HTTP page fetch.
"""
import os
import sys
from datetime import timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
for p in (str(BACKEND), str(ROOT / "api")):
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ.setdefault("BROILER_DATABASE_URL", "sqlite:///" + str(ROOT / "local-test.db"))
os.environ.setdefault("BROILER_JWT_SECRET", "test-secret-" + "0" * 24)

import uktech  # noqa: E402

REC = {"id": 1039, "device_id": "ESP32-S3-001", "rfid1": "4800F4CF9EED",
       "rfid2": "", "weight_1": 219.81, "weight_2": 0, "weight_3": 0,
       "weight_4": 0, "total_weight": 219.81, "status1": "VALID",
       "status2": "INVALID", "device_status": "online", "total_seconds": 0,
       "created_at": "2026-09-17 19:53:29", "updated_at": "2026-09-17 19:53:29"}


def test_tehran_wall_clock_to_utc():
    ts = uktech.parse_tehran_utc("2026-09-17 19:53:29")
    assert (ts.year, ts.month, ts.day, ts.hour, ts.minute) == (2026, 9, 17, 16, 23)
    assert ts.tzinfo == timezone.utc


def test_record_mapping():
    ev, ext, ts = uktech.record_to_event(dict(REC), 5, "ESP800")
    assert ev["bird_id"] == "4800F4CF9EED"
    assert ev["sensor_id"] == "ESP32-S3-001"
    assert ev["raw_weight_g"] == 219.8  # round(219.81, 1)
    assert ev["weight_g"] == 219.8  # table display + visit init weight
    assert ev["age_day"] == 5
    assert ev["flock_id"] == "UKTECH-ESP800"
    assert ev["feed_bin_kg"] is None and ev["feed_delta_g"] is None
    assert ext == "ESP800:1039"
    assert ev["timestamp"] == ts.isoformat()


def test_float_artefact_rounding_and_rfid_fallback():
    rec = dict(REC, total_weight=216.74000000000001, rfid1="", rfid2="  7F2B  ")
    ev, _ext, _ts = uktech.record_to_event(rec, 0, "ESP800")
    assert ev["raw_weight_g"] == 216.7
    assert ev["bird_id"] == "7F2B"


def test_empty_tags_give_weight_only_row():
    ev, _ext, _ts = uktech.record_to_event(dict(REC, rfid1="", rfid2=""), 0, "ESP800")
    assert ev["bird_id"] is None


def test_external_id_format():
    assert uktech.external_id("ESP800", 1039) == "ESP800:1039"
    assert uktech.state_key("ESP800") == "uktech:ESP800"


def test_fetch_requires_token():
    try:
        uktech.fetch_records("ESP800", "", limit=1)
    except uktech.UktechError as e:
        assert "token" in str(e).lower()
    else:  # pragma: no cover
        raise AssertionError("fetch without token must fail closed")


def _fake_page_ok(*a, **k):
    import io
    import json as _json

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *e):
            return False

        def read(self):
            return _json.dumps({"status": "success", "meta": {"has_more": False},
                                "data": [dict(REC, id=2001)]}).encode("utf-8")
    return _Resp()


def test_tls_auto_fallback_on_self_signed(monkeypatch):
    """Auto mode: strict attempt hits a self-signed chain -> one unverified
    retry, flagged so the UI can warn. Strict mode must fail instead."""
    import importlib
    import ssl as _ssl
    import urllib.error
    import urllib.request
    import config
    monkeypatch.setenv("UKTECH_VERIFY_SSL", "auto")
    importlib.reload(config)
    importlib.reload(uktech)
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None, context=None):
        calls["n"] += 1
        if context is None:
            raise urllib.error.URLError(
                _ssl.SSLCertVerificationError(1, "self-signed certificate"))
        return _fake_page_ok()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    recs, more = uktech.fetch_records("ESP800", "TOK", limit=1)
    assert [r["id"] for r in recs] == [2001] and more is False
    assert calls["n"] == 2 and uktech._TLS_FALLBACK_USED is True

    importlib.reload(uktech)  # reset the flag for the strict check below
    monkeypatch.setenv("UKTECH_VERIFY_SSL", "true")
    importlib.reload(config)
    importlib.reload(uktech)
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    try:
        uktech.fetch_records("ESP800", "TOK", limit=1)
    except uktech.UktechError as e:
        assert "unreachable" in str(e).lower()
    else:  # pragma: no cover
        raise AssertionError("strict mode must not downgrade")


def test_sync_is_idempotent_sqlite(tmp_path, monkeypatch):
    """Two syncs of the same stubbed page insert once (external_id dedupe)."""
    db = tmp_path / "uk.db"
    monkeypatch.setenv("BROILER_DATABASE_URL", f"sqlite:///{db.as_posix()}")
    import config
    import models
    import processor
    import importlib
    # Rebind engine/SessionLocal to the scratch DB. config holds the URL, so
    # it must be reloaded FIRST; then every module that did `from ... import`
    # off it (models off config; uktech/processor off models).
    importlib.reload(config)
    importlib.reload(models)
    importlib.reload(uktech)
    importlib.reload(processor)
    models.Base.metadata.create_all(models.engine)
    from models import Cycle, DeviceLog, SessionLocal, SyncState

    page = [dict(REC, id=1001), dict(REC, id=1002, total_weight=221.5)]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(page), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="UKT", label="uktech test", strain="ross308", bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r1["inserted"] == 2 and r1["last_id"] == 1002
        assert r1["complete"] is True
        # wipe the cursor -> the same page is fetched again and must be
        # deduped by external_id (no duplicate rows)
        with SessionLocal() as s:
            s.query(SyncState).filter(
                SyncState.key == uktech.state_key("ESP800")).delete()
            s.commit()
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["inserted"] == 0 and r2["skipped"] == 2
        # cursor restored -> third sync fetches nothing
        r3 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r3["fetched"] == 0 and r3["inserted"] == 0
    finally:
        processor._processors.pop(cid, None)
    assert r1["inserted"] == 2 and r1["last_id"] == 1002
    assert r2["inserted"] == 0 and r2["skipped"] == 2
    with SessionLocal() as s:
        assert s.query(DeviceLog).filter(DeviceLog.cycle_id == cid).count() == 2
        assert uktech.get_cursor("ESP800") == 1002
