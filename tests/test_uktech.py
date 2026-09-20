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
    unit, ev, ext, ts, presence = units[0]
    assert unit == 1
    assert ev["bird_id"] == "4800F4CF9EED"
    assert ev["sensor_id"] == "ESP32-S3-001"
    assert ev["raw_weight_g"] == 219.8  # round(weight_2, 1), bird cell
    assert ev["weight_g"] == 219.8  # table display + visit init weight
    assert ev["feed_bin_kg"] == 5.2  # weight_1 hopper grams -> kg
    assert ev["age_day"] == 5
    assert ev["flock_id"] == "UKTECH-ESP800"
    assert ev["feed_delta_g"] is None
    assert ev["status"] == "VALID"  # raw flag stored for debugging
    assert ext == "ESP800:1039:u1"
    assert ev["timestamp"] == ts.isoformat()
    assert presence == 0  # total_seconds rides along


def test_record_mapping_unit2():
    rec = dict(REC, rfid2="TAG2", weight_3=1800.0, weight_4=350.25,
               status2="VALID", total_seconds=42.5)
    units = _units(rec)
    assert len(units) == 2
    unit, ev, ext, ts, presence = units[1]
    assert unit == 2
    assert ev["bird_id"] == "TAG2"
    assert ev["raw_weight_g"] == 350.2  # round(weight_4, 1)
    assert ev["feed_bin_kg"] == 1.8  # weight_3 hopper grams -> kg
    assert ev["status"] == "VALID"
    assert ext == "ESP800:1039:u2"
    assert presence == 42.5


def test_status_flag_stored_never_gates():
    # The flag is flaky upstream (identical payloads arrive VALID and
    # INVALID), so it is stored verbatim but never suppresses sessions:
    # an INVALID row with a real weight still classifies normally.
    units = _units(REC)
    assert units[0][1]["status"] == "VALID"
    assert units[1][1]["status"] == "INVALID"
    rec = dict(REC, status1="INVALID", weight_2=455.97)
    units = _units(rec)
    assert units[0][1]["status"] == "INVALID"
    assert units[0][1]["weight_g"] == 456.0  # round(455.97, 1)


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


def test_strict_float_parsing_rejects_junk():
    # NaN / Infinity / "N/A" / "" must become None — never a fake 0 that
    # would poison session comparisons or get stored as a measurement.
    import math
    for bad in ("N/A", "n/a", "nan", "None", "null", "-", "", "  ",
                float("nan"), float("inf"), float("-inf"), None):
        assert uktech._to_float(bad) is None, repr(bad)
    assert uktech._to_float(0) == 0 and uktech._to_float("0") == 0
    assert uktech._to_float("219.35") == 219.35
    assert uktech._to_float(219.34999999999999) == 219.34999999999999
    assert math.isfinite(uktech._to_float("1e3"))
    import processor
    for bad in ("N/A", "nan", float("nan"), None, ""):
        assert processor._to_float(bad) is None, repr(bad)


def test_env_aliases_for_token_and_url(monkeypatch):
    # Canonical WEIGHT_API_TOKEN/URL work; legacy UKTECH_* names are fallback.
    import importlib
    import config
    monkeypatch.setenv("WEIGHT_API_TOKEN", "tok-new")
    monkeypatch.setenv("WEIGHT_API_URL", "https://example.invalid/w.php")
    monkeypatch.delenv("UKTECH_API_TOKEN", raising=False)
    monkeypatch.delenv("BROILER_UKTECH_TOKEN", raising=False)
    monkeypatch.delenv("UKTECH_API_BASE", raising=False)
    importlib.reload(config)
    try:
        assert config.UKTECH_TOKEN == "tok-new"
        assert config.UKTECH_API_BASE == "https://example.invalid/w.php"
    finally:
        importlib.reload(config)


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


def test_backlog_reports_remaining_with_complete(tmp_path, monkeypatch):
    """A fetch larger than one batch reports remaining>0 even with
    complete=true, so the frontend loop keeps draining instead of stopping
    early (the manual-sync stall)."""
    db = tmp_path / "ukbig.db"
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
    from models import Cycle, SessionLocal
    big = [dict(REC, id=2000 + i,
                created_at=f"2026-09-18 12:{i // 60:02d}:{i % 60:02d}")
           for i in range(120)]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(big), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="UKB", label="big", strain="ross308", bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r = uktech.sync_serial_to_cycle(cid, serial="ESP800", batch=50)
        assert r["complete"] is False  # backlog remains: keep draining
        assert r["remaining"] == 120 - 50, r
        assert r["inserted"] == 100, r  # 50 recs x 2 units
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800", batch=50)
        assert r2["inserted"] == 100, r2
        r3 = uktech.sync_serial_to_cycle(cid, serial="ESP800", batch=50)
        assert r3["inserted"] == 40 and r3["remaining"] == 0, r3
        assert r3["complete"] is True  # fully caught up only now
    finally:
        processor._processors.pop(cid, None)


def test_sync_is_idempotent_sqlite(tmp_path, monkeypatch):
    """Two syncs of the same stubbed page insert once (external_id dedupe).

    Each record fans out to 2 unit lanes (u1 bird, u2 empty in the fixture),
    so 2 records -> 4 raw logs but a single weighing event.
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
        # empty unit-2 rows are stored raw but never open visits; the
        # upstream flag rides along verbatim for debugging
        bad = s.query(DeviceLog).filter(
            DeviceLog.cycle_id == cid,
            DeviceLog.external_id.like("%:u2")).all()
        assert len(bad) == 2 and all(r.visit_id is None for r in bad)
        assert {r.status for r in bad} == {"INVALID"}
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
        # zeros arrive in runs on the real stream; the second one closes
        rec(4, "B1", 0.0, "B2", 0.0, "2026-09-18 12:03:00", tsec=190),
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
        # WHY changed (live core, no session gate): events now count every
        # surfacing transition (2 opens + 2 closes), not just REGISTERs.
        assert r["inserted"] == 8 and r["events"] == 4, r  # 4 recs x 2 units
        with SessionLocal() as s:
            visits = (s.query(Visit).filter(Visit.cycle_id == cid)
                      .order_by(Visit.id).all())
            assert len(visits) == 2
            by_bird = {v.bird_id: v for v in visits}
            # each bird weighed on its own unit lane. WHY changed: the first
            # touch opens immediately (no DETECTING delay), so initial is the
            # entry weight (200.0), not the confirmed one (201.0 lives on as
            # the initial_confirmed_g annotation).
            assert by_bird["B1"].initial_weight_g == 200.0
            assert by_bird["B2"].initial_weight_g == 300.0
            assert by_bird["B1"].unit == 1 and by_bird["B2"].unit == 2
            # both closed by the second zero row; presence = validated span:
            # 12:00 -> 12:02 = 120s. elapsed runs on the device counter here
            # (tsec 10 -> 70 across the one VALID-prev pair): 10 + 60 = 70,
            # diverging from presence exactly as designed.
            assert all(v.visit_end is not None for v in visits)
            assert all(v.presence_s == 120.0 for v in visits)
            assert all(v.elapsed_s == 70.0 for v in visits)
            # each lane's hopper level stored on its own rows (g, not mixed)
            bins = {(l.bird_id, l.sensor_id): l.feed_bin_kg for l in
                    s.query(DeviceLog).filter(DeviceLog.cycle_id == cid).all()
                    if l.external_id and l.external_id.endswith(":u1")}
            assert set(bins.values()) == {5.0}
            # raw tier keeps all eight unit rows
            assert s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid).count() == 8
    finally:
        processor._processors.pop(cid, None)


def test_invalid_flag_with_real_weight_still_registers(tmp_path, monkeypatch):
    """Regression: the device flags empty-hopper rows INVALID while the bird
    weight is real (live id 24: w1=0, w2=455.97, status INVALID). The flaky
    flag must not suppress the weighing — the session machine decides."""
    db = tmp_path / "ukinv.db"
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

    def rec(rid, w1, w2, st, ts):
        return {"id": rid, "device_id": "ESP32-S3-001",
                "rfid1": "B1", "rfid2": "",
                "weight_1": w1, "weight_2": w2,
                "weight_3": 0, "weight_4": 0,
                "total_weight": (w1 or 0) + (w2 or 0),
                "status1": st, "status2": "INVALID", "total_seconds": 0,
                "created_at": ts}
    page = [
        rec(20, 38.47, 448.30, "VALID", "2026-09-18 19:25:47"),
        rec(21, 38.47, 453.82, "VALID", "2026-09-18 19:25:50"),
        rec(22, 38.47, 455.43, "VALID", "2026-09-18 19:25:56"),
        # hopper emptied, device flags INVALID — bird weight is still real
        rec(23, 0.0, 455.98, "INVALID", "2026-09-18 19:30:41"),
        rec(24, 0.0, 455.97, "INVALID", "2026-09-18 19:34:49"),
    ]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(page), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="UKI", label="invalid flag", strain="ross308",
                  bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r["inserted"] == 10 and r["events"] >= 1, r  # 5 recs x 2 units
        with SessionLocal() as s:
            visits = (s.query(Visit).filter(Visit.cycle_id == cid).all())
            assert len(visits) >= 1
            # the INVALID-flagged rows refined the same visit, not new ones;
            # latest bird weight visible despite the flag
            latest = max(visits, key=lambda v: v.id)
            assert abs(latest.initial_weight_g - 455.97) <= 2.0 or \
                abs(latest.final_weight_g - 455.97) <= 2.0 + 1e-9, \
                [(v.initial_weight_g, v.final_weight_g) for v in visits]
            inv = s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid, DeviceLog.status == "INVALID").all()
            assert len(inv) >= 2  # flags preserved for debugging
    finally:
        processor._processors.pop(cid, None)


def test_upstream_reset_restarts_cleanly(tmp_path, monkeypatch):
    """Device DB wiped upstream (ids restart): NON-DESTRUCTIVE policy (replaces
    the old wipe — working rule: no destructive op without confirmation).
    Open visits finalize as "interrupted" (history preserved), the id
    generation bumps so new rows ("g1") never shadow old ones ("g0"), the
    pair clock drops, and the new generation ingests by id with reset=True."""
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
        assert r2["interrupted"] == 1, r2  # the still-open 219.81 visit
        assert r2["inserted"] == 4 and r2["last_id"] == 2
        with SessionLocal() as s:
            rows = s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid).all()
            # old generation intact (6) + new generation (4): nothing wiped
            assert len(rows) == 10, [r.external_id for r in rows]
            exts = sorted(r.external_id for r in rows)
            assert "ESP800:g0:100:u1" in exts  # old generation preserved
            assert "ESP800:g1:1:u1" in exts and "ESP800:g1:2:u2" in exts
            visits = s.query(Visit).filter(Visit.cycle_id == cid).all()
            assert len(visits) == 2, [(v.bird_id, v.close_reason) for v in visits]
            old_v = [v for v in visits if v.close_reason == "interrupted"]
            assert len(old_v) == 1 and old_v[0].visit_end is not None
            assert old_v[0].bird_position == "outside"
            new_v = [v for v in visits if v.close_reason is None]
            assert len(new_v) == 1 and new_v[0].visit_end is None
            assert uktech.get_cursor("ESP800", cid) == 2
    finally:
        processor._processors.pop(cid, None)


def _reset_harness(tmp_path, monkeypatch):
    """Scratch DB + one cycle, returns (cid, helpers). Caller drives syncs."""
    db = tmp_path / "ukstall.db"
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
    with SessionLocal() as s:
        c = Cycle(cycle_code="UKS", label="stall test", strain="ross308",
                  bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    return cid, (Cycle, DeviceLog, SessionLocal, Visit)


def test_stalled_reports_instead_of_wiping(tmp_path, monkeypatch):
    """Cursor ahead of upstream but meta inconsistent (glitch row carrying a
    huge total): must NOT wipe — report stalled with the reason instead."""
    cid, (Cycle, DeviceLog, SessionLocal, Visit) = _reset_harness(
        tmp_path, monkeypatch)
    try:
        old = [dict(REC, id=1000 + i,
                    created_at=f"2026-09-10 10:0{i}:00") for i in range(3)]
        monkeypatch.setattr(uktech, "fetch_records",
                            lambda *a, **k: (list(old), False))
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert uktech.get_cursor("ESP800", cid) == 1002
        # glitch: one stale row, meta claims the old big total
        new = [dict(REC, id=5, created_at="2026-09-18 12:00:00")]

        def fetch_glitch(*a, **k):
            uktech._LAST_META = {"total_records": 1002}
            return list(new), False
        monkeypatch.setattr(uktech, "fetch_records", fetch_glitch)
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["reset"] is False, r2
        assert r2["stalled"] is True, r2
        assert "1002" in r2["stalled_reason"] and "5" in r2["stalled_reason"]
        with SessionLocal() as s:
            # nothing deleted: old rows intact, cursor untouched
            assert s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid).count() == 6
            assert uktech.get_cursor("ESP800", cid) == 1002
    finally:
        import processor
        processor._processors.pop(cid, None)


def test_small_rewind_stays_silent(tmp_path, monkeypatch):
    """A minor prune (gap within margin) is steady-state: no wipe, no alarm."""
    cid, (Cycle, DeviceLog, SessionLocal, Visit) = _reset_harness(
        tmp_path, monkeypatch)
    try:
        old = [dict(REC, id=1000 + i,
                    created_at=f"2026-09-10 10:0{i}:00") for i in range(3)]
        monkeypatch.setattr(uktech, "fetch_records",
                            lambda *a, **k: (list(old), False))
        uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert uktech.get_cursor("ESP800", cid) == 1002
        # upstream pruned a few rows (max 990 < 1002, gap 12 <= margin)
        pruned = [dict(REC, id=900 + i,
                       created_at="2026-09-18 12:00:00") for i in range(91)]

        def fetch_pruned(*a, **k):
            uktech._LAST_META = {"total_records": 91}
            return list(pruned), False
        monkeypatch.setattr(uktech, "fetch_records", fetch_pruned)
        r = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r["reset"] is False and r["stalled"] is False, r
        assert r["inserted"] == 0
        with SessionLocal() as s:
            assert s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid).count() == 6
            assert uktech.get_cursor("ESP800", cid) == 1002
    finally:
        import processor
        processor._processors.pop(cid, None)


def _probe_harness(tmp_path, monkeypatch, name="uksmart.db", code="UKP"):
    db = tmp_path / name
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
    from models import Cycle, SessionLocal
    with SessionLocal() as s:
        c = Cycle(cycle_code=code, label="probe test", strain="ross308",
                  bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    return cid


def test_sweep_finalizes_overdue_ejecting_without_new_records(tmp_path, monkeypatch):
    """Lazy finalization: an EJECTING visit whose persisted deadline passed
    finalizes on the next poll EVEN WHEN upstream sends nothing new. The
    deadline (invalid_since + 30s, stored on the row) is authoritative —
    no persistent worker needed. A simulated restart (fresh call = fresh
    process state, DB only) must NOT reset the remaining countdown: the
    same stored deadline still fires."""
    cid = _probe_harness(tmp_path, monkeypatch, "uksweep.db", "UKS")
    page = [dict(REC, id=10 + i, weight_2=w, total_weight=(w or 0) + 340.0,
                 created_at=f"2026-09-18 12:0{i}:00")
            for i, w in enumerate([220.0, 220.5, 220.5])]
    monkeypatch.setattr(uktech, "fetch_records",
                        lambda *a, **k: (list(page), False))
    try:
        from models import SessionLocal, Visit
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r1["inserted"] == 6, r1
        # flip the open visit to EJECTING with an overdue deadline (as if
        # an INVALID record arrived and the worker "restarted" right after:
        # the row alone must carry the countdown — nothing in memory).
        with SessionLocal() as s:
            v = s.query(Visit).filter(Visit.cycle_id == cid,
                                      Visit.visit_end.is_(None)).one()
            assert v.business_state == "FEEDING", v.business_state
            from datetime import datetime, timezone, timedelta
            v.business_state = "EJECTING"
            v.invalid_since = datetime(2026, 9, 18, 12, 0, 0,
                                       tzinfo=timezone.utc)
            v.invalid_deadline = v.invalid_since + timedelta(seconds=30)
            v.final_weight_g = 220.5
            v.feed_intake_g = 1.0
            v.elapsed_s = 20.0
            s.commit()
            vid, deadline = v.id, v.invalid_deadline
        import processor
        processor._processors.pop(cid, None)  # cold process: DB state only
        # upstream sends nothing new (same stubbed page, probe caught up)
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["inserted"] == 0 and r2["fetched"] == 0, r2
        assert r2["swept"] == 1, r2  # the deadline fired, no record needed
        with SessionLocal() as s:
            v = s.get(Visit, vid)
            assert v.visit_end is not None, "overdue EJECTING must close"
            assert v.business_state == "EXITED", v.business_state
            assert v.close_reason == "ejected", v.close_reason
            assert v.visit_end.replace(tzinfo=timezone.utc) == deadline, \
                (v.visit_end, deadline)  # exact persisted deadline, no reset
            assert v.final_weight_g == 220.5  # frozen, not overwritten
            assert v.feed_intake_g == 1.0
        # a third poll finalizes nothing twice (idempotent sweep)
        r3 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r3["swept"] == 0, r3
        with SessionLocal() as s:
            assert s.query(Visit).filter(Visit.cycle_id == cid).count() == 1
    finally:
        import processor
        processor._processors.pop(cid, None)


def test_finalized_visit_immutable_under_later_samples(tmp_path, monkeypatch):
    """After close, later sensor samples open a NEW visit — the old row's
    final_weight_g / final_bin_weight_g / feed_intake_g / visit_end /
    close_reason never move (no silent history rewrite)."""
    cid = _probe_harness(tmp_path, monkeypatch, "ukimm.db", "UKI")
    first = [dict(REC, id=1 + i, weight_2=w, total_weight=(w or 0) + 340.0,
                  created_at=f"2026-09-18 12:0{i}:00")
             for i, w in enumerate([220.0, 220.5, 0, 0])]
    monkeypatch.setattr(uktech, "fetch_records",
                        lambda *a, **k: (list(first), False))
    try:
        from models import SessionLocal, Visit
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        with SessionLocal() as s:
            old = s.query(Visit).filter(Visit.cycle_id == cid).one()
            assert old.visit_end is not None, "setup must close visit 1"
            frozen = (old.final_weight_g, old.feed_intake_g, old.visit_end,
                      old.close_reason, old.final_bin_weight_g)
            old_id = old.id
        more = [dict(REC, id=5 + i, weight_2=w, total_weight=(w or 0) + 340.0,
                     created_at=f"2026-09-18 12:1{i}:00")
                for i, w in enumerate([221.0, 221.5, 0, 0])]

        def fetch_more(*a, **k):
            uktech._LAST_META = {"total_records": 8}
            return list(first + more), False

        monkeypatch.setattr(uktech, "fetch_records", fetch_more)
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["inserted"] == 8, r2  # 4 new recs x 2 units
        with SessionLocal() as s:
            assert s.query(Visit).filter(Visit.cycle_id == cid).count() == 2
            again = s.get(Visit, old_id)
            assert (again.final_weight_g, again.feed_intake_g,
                    again.visit_end, again.close_reason,
                    again.final_bin_weight_g) == frozen, \
                "finalized visit must not move under later samples"
    finally:
        import processor
        processor._processors.pop(cid, None)


def test_probe_skips_page_walk_when_caught_up(tmp_path, monkeypatch):
    """Latest-id probe: a caught-up poll costs exactly one 1-row probe —
    no page walk, zero writes, empty changes."""
    cid = _probe_harness(tmp_path, monkeypatch)
    page = [dict(REC, id=50 + i,
                 created_at=f"2026-09-18 12:0{i}:00") for i in range(3)]
    calls = []

    def counting(*a, **k):
        calls.append(a[2] if len(a) > 2 else k.get("limit"))
        return list(page), False

    monkeypatch.setattr(uktech, "fetch_records", counting)
    try:
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r1["inserted"] == 6, r1  # 3 recs x 2 units
        n1 = len(calls)
        assert n1 >= 2 and calls[0] == 1, calls  # probe first, limit=1
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["inserted"] == 0 and r2["fetched"] == 0, r2
        assert len(calls) == n1 + 1, calls  # probe only, no walk
        assert calls[-1] == 1, calls
        assert r2["probed"] is True and r2["upstream_max"] == 52, r2
        assert r2["upstream_delta"] == 0 and r2["changes"] == [], r2
    finally:
        import processor
        processor._processors.pop(cid, None)


def test_probe_fetches_only_the_delta(tmp_path, monkeypatch):
    """Probe max past the cursor walks pages but writes only the delta."""
    cid = _probe_harness(tmp_path, monkeypatch, "ukdelta.db", "UKD")
    first = [dict(REC, id=1 + i,
                  created_at=f"2026-09-18 12:0{i}:00") for i in range(5)]
    monkeypatch.setattr(uktech, "fetch_records",
                        lambda *a, **k: (list(first), False))
    try:
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert uktech.get_cursor("ESP800", cid) == 5, r1
        grown = [dict(REC, id=1 + i,
                      created_at=f"2026-09-18 12:{i // 60:02d}:{i % 60:02d}")
                 for i in range(8)]

        def fetch_grown(*a, **k):
            uktech._LAST_META = {"total_records": 8}
            return list(grown), False

        monkeypatch.setattr(uktech, "fetch_records", fetch_grown)
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["fetched"] == 3, r2  # only ids 6,7,8 are new
        assert r2["inserted"] == 6, r2  # 3 recs x 2 units
        assert r2["upstream_max"] == 8 and r2["upstream_delta"] == 3, r2
        assert uktech.get_cursor("ESP800", cid) == 8, r2
    finally:
        import processor
        processor._processors.pop(cid, None)


def test_changes_track_new_visit_then_hopper_refill(tmp_path, monkeypatch):
    """Change analysis over the id-74..76 shape: the register call reports
    the new visit (hopper 0 at open); the refill call patches the SAME
    visit with the live hopper instead of a full reload."""
    cid = _probe_harness(tmp_path, monkeypatch, "ukchg.db", "UKC")
    seq1 = [dict(REC, id=69 + i, weight_1=0,
                 weight_2=w, total_weight=w,
                 created_at=f"2026-09-18 22:20:{i:02d}")
            for i, w in enumerate([0, 0, 0, 212.44, 218.06, 219.62])]
    monkeypatch.setattr(uktech, "fetch_records",
                        lambda *a, **k: (list(seq1), False))
    try:
        r1 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r1["inserted"] == 12, r1  # 6 recs x 2 units
        assert len(r1["changes"]) >= 1, r1
        opened = [c for c in r1["changes"] if c.get("is_new")]
        assert len(opened) == 1, r1["changes"]
        # WHY changed (live core): the FIRST touch (212.44) opens the visit
        # immediately — initial is the entry weight, not the confirmed 219.6.
        assert abs(opened[0]["initial_weight_g"] - 212.44) < 0.01, opened
        assert opened[0]["bin_weight_g"] == 0.0, opened  # hopper 0 at open
        assert opened[0]["is_closed"] is False, opened
        assert opened[0]["bird_position"] == "inside", opened
        vid = opened[0]["id"]
        seq2 = [dict(REC, id=75 + i, weight_1=b, weight_2=220.19,
                     total_weight=b + 220.19,
                     created_at=f"2026-09-18 22:21:{30 + i * 6:02d}")
                for i, b in enumerate([343.74, 345.44])]
        monkeypatch.setattr(uktech, "fetch_records",
                            lambda *a, **k: (list(seq2), False))
        r2 = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r2["inserted"] == 4, r2
        assert len(r2["changes"]) >= 1, r2
        same = [c for c in r2["changes"] if c["id"] == vid]
        assert len(same) == 1, r2["changes"]
        assert same[0]["bin_weight_g"] == 345.44, same  # live refill patched
        assert same[0]["is_closed"] is False, same
    finally:
        import processor
        processor._processors.pop(cid, None)
