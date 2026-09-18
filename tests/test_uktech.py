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
       "rfid2": "", "weight_1": 5200.0, "weight_2": 219.81, "weight_3": 0,
       "weight_4": 0, "total_weight": 5419.81, "status1": "VALID",
       "status2": "INVALID", "device_status": "online", "total_seconds": 0,
       "created_at": "2026-09-17 19:53:29", "updated_at": "2026-09-17 19:53:29"}


def test_tehran_wall_clock_to_utc():
    ts = uktech.parse_tehran_utc("2026-09-17 19:53:29")
    assert (ts.year, ts.month, ts.day, ts.hour, ts.minute) == (2026, 9, 17, 16, 23)
    assert ts.tzinfo == timezone.utc


def _units(rec, age=5):
    return uktech.record_to_unit_events(dict(rec), age, "ESP800")


def test_record_mapping_unit1():
    units = _units(REC)
    assert len(units) == 2
    unit, ev, ext, ts, valid, presence = units[0]
    assert unit == 1 and valid is True
    assert ev["bird_id"] == "4800F4CF9EED"
    assert ev["sensor_id"] == "ESP32-S3-001"
    assert ev["raw_weight_g"] == 219.8  # round(weight_2, 1), bird cell
    assert ev["weight_g"] == 219.8  # table display + visit init weight
    assert ev["feed_bin_kg"] == 5.2  # weight_1 hopper grams -> kg
    assert ev["age_day"] == 5
    assert ev["flock_id"] == "UKTECH-ESP800"
    assert ev["feed_delta_g"] is None
    assert ext == "ESP800:1039:u1"
    assert ev["timestamp"] == ts.isoformat()
    assert presence == 0  # total_seconds rides along


def test_record_mapping_unit2():
    rec = dict(REC, rfid2="TAG2", weight_3=1800.0, weight_4=350.25,
               status2="VALID", total_seconds=42.5)
    units = _units(rec)
    assert len(units) == 2
    unit, ev, ext, ts, valid, presence = units[1]
    assert unit == 2 and valid is True
    assert ev["bird_id"] == "TAG2"
    assert ev["raw_weight_g"] == 350.2  # round(weight_4, 1)
    assert ev["feed_bin_kg"] == 1.8  # weight_3 hopper grams -> kg
    assert ext == "ESP800:1039:u2"
    assert presence == 42.5


def test_invalid_status_skips_session_but_keeps_log():
    # status2 INVALID (like the fixture): unit 2 maps but is flagged invalid
    units = _units(REC)
    _u1, _e1, _x1, _t1, valid1, _p1 = units[0]
    _u2, _e2, _x2, _t2, valid2, _p2 = units[1]
    assert valid1 is True
    assert valid2 is False
    # missing flags (legacy rows) fail open to VALID
    rec = dict(REC)
    rec.pop("status1")
    rec.pop("status2")
    units = _units(rec)
    assert all(u[4] is True for u in units)


def test_float_artefact_rounding_and_rfid_fallback():
    rec = dict(REC, weight_2=216.74000000000001, rfid1="", rfid2="  7F2B  ")
    units = _units(rec, age=0)
    ev = units[0][1]
    assert ev["raw_weight_g"] == 216.7
    assert ev["bird_id"] is None  # rfid1 empty -> unit-1 bird None
    ev2 = units[1][1]
    assert ev2["bird_id"] == "7F2B"  # rfid2 fallback lives on unit 2


def test_total_weight_legacy_fallback():
    rec = dict(REC, weight_2=None)
    units = _units(rec, age=0)
    assert units[0][1]["raw_weight_g"] == 5419.8  # falls back to total_weight


def test_empty_tags_give_weight_only_row():
    units = _units(dict(REC, rfid1="", rfid2=""), age=0)
    assert units[0][1]["bird_id"] is None
    assert units[1][1]["bird_id"] is None


def test_external_id_format():
    assert uktech.external_id("ESP800", 1039) == "ESP800:1039"
    assert uktech.state_key("ESP800") == "uktech:ESP800"
    assert uktech.state_key("ESP800", 5) == "uktech:ESP800:cycle:5"


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
    """Two syncs of the same stubbed page insert once (external_id dedupe).

    Each record fans out to 2 unit lanes (u1 valid bird, u2 INVALID status
    in the fixture), so 2 records -> 4 raw logs but a single weighing event.
    """
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
    from models import Cycle, DeviceLog, SessionLocal, SyncState, Visit

    page = [dict(REC, id=1001), dict(REC, id=1002, weight_2=221.5)]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(page), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="UKT", label="uktech test", strain="ross308", bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r1["inserted"] == 4 and r1["last_id"] == 1002
        assert r1["complete"] is True
        assert r1["events"] == 1  # 219.81 -> 221.5 confirms one weighing
        # wipe the per-cycle cursor -> the same page is fetched again and must be
        # deduped by external_id (no duplicate rows). Per-cycle isolation means
        # we delete the cycle-specific key, not the legacy global one.
        with SessionLocal() as s:
            s.query(SyncState).filter(
                SyncState.key == uktech.state_key("ESP800", cid)).delete()
            s.commit()
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["inserted"] == 0 and r2["skipped"] == 4
        # cursor restored -> third sync fetches nothing
        r3 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r3["fetched"] == 0 and r3["inserted"] == 0
    finally:
        processor._processors.pop(cid, None)
    assert r1["inserted"] == 4 and r1["last_id"] == 1002
    assert r2["inserted"] == 0 and r2["skipped"] == 4
    with SessionLocal() as s:
        assert s.query(DeviceLog).filter(DeviceLog.cycle_id == cid).count() == 4
        assert s.query(Visit).filter(Visit.cycle_id == cid).count() == 1
        # INVALID-flagged unit-2 rows are stored raw but never open visits
        bad = s.query(DeviceLog).filter(
            DeviceLog.cycle_id == cid,
            DeviceLog.external_id.like("%:u2")).all()
        assert len(bad) == 2 and all(r.visit_id is None for r in bad)
        assert uktech.get_cursor("ESP800", cid) == 1002


def test_two_units_independent_lanes(tmp_path, monkeypatch):
    """Both units VALID: each bird gets its own visit fed by its own hopper,
    and presence_s lands on the visit at close."""
    db = tmp_path / "uk2u.db"
    monkeypatch.setenv("BROILER_DATABASE_URL", f"sqlite:///{db.as_posix()}")
    import config
    import models
    import processor
    import importlib
    importlib.reload(config)
    importlib.reload(models)
    importlib.reload(uktech)
    importlib.reload(processor)
    models.Base.metadata.create_all(models.engine)
    from models import Cycle, DeviceLog, SessionLocal, Visit

    def rec(rid, rfid1, w2, rfid2, w4, ts, bin1=5000.0, bin3=3000.0,
            s1="VALID", s2="VALID", tsec=0):
        return {"id": rid, "device_id": "ESP32-S3-001",
                "rfid1": rfid1, "rfid2": rfid2,
                "weight_1": bin1, "weight_2": w2,
                "weight_3": bin3, "weight_4": w4,
                "total_weight": (w2 or 0) + (w4 or 0),
                "status1": s1, "status2": s2, "total_seconds": tsec,
                "created_at": ts}
    page = [
        rec(1, "B1", 200.0, "B2", 300.0, "2026-09-18 12:00:00", tsec=10),
        rec(2, "B1", 201.0, "B2", 301.0, "2026-09-18 12:01:00", tsec=70),
        rec(3, "B1", 0.0, "B2", 0.0, "2026-09-18 12:02:00", tsec=130),
    ]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(page), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="UK2", label="two units", strain="ross308",
                  bird_count=2)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r["inserted"] == 6 and r["events"] == 2, r  # 3 recs x 2 units
        with SessionLocal() as s:
            visits = (s.query(Visit).filter(Visit.cycle_id == cid)
                      .order_by(Visit.id).all())
            assert len(visits) == 2
            by_bird = {v.bird_id: v for v in visits}
            # each bird weighed on its own unit lane
            assert by_bird["B1"].initial_weight_g == 201.0
            assert by_bird["B2"].initial_weight_g == 301.0
            assert by_bird["B1"].unit == 1 and by_bird["B2"].unit == 2
            # both closed by the zero row, presence stored from device
            assert all(v.visit_end is not None for v in visits)
            assert all(v.presence_s == 130 for v in visits)
            # each lane's hopper level stored on its own rows (g, not mixed)
            bins = {(l.bird_id, l.sensor_id): l.feed_bin_kg for l in
                    s.query(DeviceLog).filter(DeviceLog.cycle_id == cid).all()
                    if l.external_id and l.external_id.endswith(":u1")}
            assert set(bins.values()) == {5.0}
            # raw tier keeps all six unit rows
            assert s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid).count() == 6
    finally:
        processor._processors.pop(cid, None)


def test_upstream_reset_restarts_cleanly(tmp_path, monkeypatch):
    """Device DB wiped upstream (ids restart): stale rows for the serial are
    dropped, cursor restarts, fresh rows ingest with reset=True."""
    db = tmp_path / "ukreset.db"
    monkeypatch.setenv("BROILER_DATABASE_URL", f"sqlite:///{db.as_posix()}")
    import config
    import models
    import processor
    import importlib
    importlib.reload(config)
    importlib.reload(models)
    importlib.reload(uktech)
    importlib.reload(processor)
    models.Base.metadata.create_all(models.engine)
    from models import Cycle, DeviceLog, SessionLocal, Visit

    old = [dict(REC, id=100 + i,
                created_at=f"2026-09-10 10:0{i}:00") for i in range(3)]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(old), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="UKR", label="reset test", strain="ross308",
                  bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r1["inserted"] == 6 and r1["reset"] is False  # 3 recs x 2 units
        assert uktech.get_cursor("ESP800", cid) == 102
        # upstream wiped: only 2 fresh rows, ids restarted at 1.
        # Stub meta the way _fetch_once would set it on a real page.
        new = [dict(REC, id=1, created_at="2026-09-18 12:00:00"),
               dict(REC, id=2, created_at="2026-09-18 12:01:00")]

        def fetch_with_meta(*a, **k):
            uktech._LAST_META = {"total_records": 2}
            return list(new), False
        monkeypatch.setattr(uktech, "fetch_records", fetch_with_meta)
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["reset"] is True, r2
        assert r2["inserted"] == 4 and r2["last_id"] == 2
        with SessionLocal() as s:
            rows = s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid).all()
            assert len(rows) == 4
            assert sorted(r.external_id for r in rows) == [
                "ESP800:1:u1", "ESP800:1:u2",
                "ESP800:2:u1", "ESP800:2:u2"]
            # stale visits (only aggregated wiped rows) are gone
            assert s.query(Visit).filter(Visit.cycle_id == cid).count() >= 1
            assert uktech.get_cursor("ESP800", cid) == 2
    finally:
        processor._processors.pop(cid, None)
