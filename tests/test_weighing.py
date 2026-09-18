"""Weighing-session filter — pure state machine + sync integration.

Covers the acceptance sequences: residuals (6.77) must never become table
rows, stable clusters register exactly once (~219.35), and the lane
re-arms only after a near-zero reading.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
for p in (str(BACKEND), str(ROOT / "api")):
    if p not in sys.path:
        sys.path.insert(0, p)

import weighing  # noqa: E402

CFG = weighing.load_config()
T0 = 1_000_000.0


def run(seq, cfg=None, start=None):
    """Feed weights (one per poll) through a fresh session. Returns
    (events, closes, final_state) where events are registered weights.

    Mirrors the uktech layer: a register attaches a visit id, and every
    step refreshes updated_at (persistence does this on save).
    """
    cfg = cfg or CFG
    st = dict(start) if start else weighing.fresh_state()
    events, closes = [], []
    for i, w in enumerate(seq):
        t = T0 + i * 60.0
        st["updated_at"] = t
        st, actions = weighing.classify(st, w, t, t, cfg)
        for act in actions:
            if act[0] == "register":
                events.append(act[1])
                st["visit_id"] = 99  # sync layer links the created visit
            elif act[0] in ("close", "timeout_close"):
                closes.append(True)
    return events, closes, st


def test_acceptance_unloading_residuals_ignored():
    seq = [0, 0.3, 15, 218.5, 219.1, 219.3, 219.35, 218.9,
           120, 45, 12, 6.77, 3.2, 0.8, 0]
    events, closes, st = run(seq)
    assert len(events) == 1, events
    assert abs(events[0] - 219.35) <= 2.0, events
    assert st["state"] == weighing.EMPTY
    assert len(closes) == 1  # visit closed on re-arm


def test_acceptance_gradual_load_one_event():
    seq = [0, 15, 40, 100, 150, 180, 219.3, 219.4, 218.9, 50, 8, 0]
    events, closes, st = run(seq)
    assert len(events) == 1, events
    assert abs(events[0] - 219.3) <= 2.0, events
    assert st["state"] == weighing.EMPTY


def test_duplicate_stable_readings_single_event():
    seq = [0, 219.1, 219.2, 219.3, 219.35, 219.3, 219.4, 0, 0]
    events, closes, st = run(seq)
    assert len(events) == 1, events  # emitted once at confirmation
    assert st["state"] == weighing.EMPTY
    # ratchet refined the cluster max before unload (not a second event)
    st2 = weighing.fresh_state()
    for i, w in enumerate(seq[:7]):
        t = T0 + i * 60.0
        st2["updated_at"] = t
        st2, _ = weighing.classify(st2, w, t, t, CFG)
    assert st2["registered"] == 219.4, st2


def test_single_touch_then_empty_registers_nothing():
    # stability gating: one touch that vanishes is noise, not a weighing
    events, _, st = run([0, 219.3, 0])
    assert events == []
    assert st["state"] == weighing.EMPTY


def test_edge_trigger_mode_registers_first_touch():
    cfg = dict(CFG, REQUIRED_STABLE_READINGS=1)
    events, _, _ = run([0, 219.3, 0], cfg=cfg)
    assert events == [219.3]


def test_empty_scale_never_registers():
    events, _, st = run([0, 0.0, 0.3, 1.2, 0])
    assert events == []
    assert st["state"] == weighing.EMPTY


def test_residual_alone_in_empty_ignored():
    # 6.77 with no session: below MIN_VALID_WEIGHT, no event (session is
    # the main mechanism, not just the threshold).
    events, _, _ = run([0, 6.77, 3.2, 0])
    assert events == []


def test_malformed_and_none_hold_state():
    st = weighing.fresh_state()
    st, a1 = weighing.classify(st, 219.3, T0, T0, CFG)
    assert st["state"] == weighing.DETECTING
    st2, a2 = weighing.classify(dict(st), None, T0 + 60, T0 + 60, CFG)
    assert a2 == [] and st2["state"] == weighing.DETECTING
    st3, a3 = weighing.classify(dict(st), "junk", T0 + 60, T0 + 60, CFG)
    assert a3 == [] and st3["state"] == weighing.DETECTING


def test_brief_dip_rise_no_duplicate():
    # dip that never reaches zero: no second event (still one session)
    events, _, st = run([0, 219.1, 219.3, 200.0, 219.2, 219.3, 0, 0])
    assert len(events) == 1, events


def test_quick_reweigh_after_unload_registers_again():
    events, _, st = run([0, 219.0, 219.2, 50, 0, 0, 180.0, 180.5, 0, 0])
    assert len(events) == 2, events
    assert st["state"] == weighing.EMPTY


def test_stuck_load_timeout_rearms():
    cfg = dict(CFG, SESSION_TIMEOUT_S=3600.0)
    st = weighing.fresh_state()
    st["updated_at"] = T0
    st, _ = weighing.classify(st, 219.0, T0, T0, cfg)
    st["updated_at"] = T0 + 60
    st, _ = weighing.classify(st, 219.1, T0 + 60, T0 + 60, cfg)
    assert st["state"] in (weighing.REGISTERED, weighing.STABLE)
    # 5h later with load still on: timeout forces EMPTY (+close). The sync
    # layer refreshes updated_at on every save; pure classify does not.
    st["updated_at"] = T0 + 60
    st["visit_id"] = 7  # as the sync layer would link on register
    st2, actions = weighing.classify(dict(st), 219.1, T0 + 5 * 3600,
                                     T0 + 5 * 3600, cfg)
    # old visit force-closed, stale state dropped; the fresh reading starts
    # a new detection lane instead of resuming the dead session.
    assert any(a[0] == "timeout_close" for a in actions)
    assert st2["state"] == weighing.DETECTING
    assert st2["visit_id"] is None


def test_config_defaults_sane():
    assert CFG["MIN_VALID_WEIGHT"] == 20.0
    assert CFG["STABLE_TOLERANCE"] == 2.0
    assert CFG["REQUIRED_STABLE_READINGS"] == 2
    assert CFG["ZERO_THRESHOLD"] == 5.0
    assert CFG["ZERO_CONFIRMATIONS"] == 1
    assert CFG["BIRD_CHANNEL"] == "weight_2"
    assert CFG["BIN_CHANNEL"] == "weight_1"


def test_normalize_display_rounding():
    assert weighing.normalize_weight(219.34999999999999) == 219.35
    assert weighing.normalize_weight(6.7699999999999996) == 6.77
    assert weighing.normalize_weight(None) is None
    assert weighing.normalize_weight("") is None
    # logic inputs untouched: a DISTINCT raw float still rounds for display
    # while the session logic keeps comparing raw values.
    assert 219.3499999 != 219.35
    assert weighing.normalize_weight(219.3499999) == 219.35


def test_session_key_scoping():
    assert (weighing.session_key("ESP800", 7, "ESP32-S3-001", "TAG1")
            != weighing.session_key("ESP800", 7, "ESP32-S3-001", "TAG2"))
    assert (weighing.session_key("ESP800", 7, "ESP32-S3-001", "TAG1")
            != weighing.session_key("ESP800", 8, "ESP32-S3-001", "TAG1"))
    assert (weighing.session_key("ESP800", 7, "", "") ==
            "ESP800|7|-|-")


def test_unknown_state_fails_safe():
    st = {"state": "BOGUS", "candidate": 1.0, "count": 9, "zero_count": 0,
          "registered": 1.0, "visit_id": 3, "first_ts": T0, "updated_at": T0}
    new_st, actions = weighing.classify(st, 500.0, T0 + 10, T0 + 10, CFG)
    assert new_st["state"] == weighing.EMPTY
    assert actions == []


def _mk_rec(rid, bird, w, ts):
    return {"id": rid, "device_id": "ESP32-S3-001",
            "rfid1": bird or "", "rfid2": "",
            "weight_1": 0.0, "weight_2": w, "weight_3": 0, "weight_4": 0,
            "total_weight": w if w is not None else 0.0,
            "created_at": ts}


def test_sync_registers_one_visit_for_acceptance_sequence(tmp_path, monkeypatch):
    """End-to-end: the task's example sequence yields exactly ONE visit
    (≈219.35, closed on empty) while every record is kept as a raw log."""
    db = tmp_path / "weigh.db"
    monkeypatch.setenv("BROILER_DATABASE_URL", f"sqlite:///{db.as_posix()}")
    import config
    import models
    import processor
    import uktech
    import importlib
    importlib.reload(config)
    importlib.reload(models)
    importlib.reload(uktech)
    importlib.reload(processor)
    models.Base.metadata.create_all(models.engine)
    from models import Cycle, DeviceLog, SessionLocal, Visit, WeighingSession

    seq = [0, 0.3, 15, 218.5, 219.1, 219.3, 219.35, 218.9,
           120, 45, 12, 6.77, 3.2, 0.8, 0]
    page = [_mk_rec(500 + i, "B1",
                    (None if v is None else float(v)),
                    f"2026-09-18 12:{i:02d}:00") for i, v in enumerate(seq)]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(page), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="WG", label="weighing", strain="ross308",
                  bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r["inserted"] == len(seq) and r["events"] == 1, r
        assert r["complete"] is True
        with SessionLocal() as s:
            # raw tier: every record stored (debugging/monitoring intact)
            assert s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid).count() == len(seq)
            # valid tier: exactly ONE visit, closed, ≈219.35
            visits = s.query(Visit).filter(Visit.cycle_id == cid).all()
            assert len(visits) == 1, [(v.bird_id, v.initial_weight_g) for v in visits]
            v = visits[0]
            assert v.bird_id == "B1"
            assert abs(v.initial_weight_g - 219.35) <= 2.0
            assert v.visit_end is not None
            # only the register row (is_start) and the closing zero row
            # (is_end) link to the visit; every residual stays visitless
            # raw data, never a table row of its own.
            assert s.query(DeviceLog).filter(
                DeviceLog.cycle_id == cid,
                DeviceLog.visit_id.is_(None)).count() == len(seq) - 2
            # session persisted EMPTY (re-armed for the next weighing)
            sess = s.query(WeighingSession).all()
            assert len(sess) == 1 and sess[0].state == weighing.EMPTY
    finally:
        processor._processors.pop(cid, None)


def test_sync_second_weighing_registers_again(tmp_path, monkeypatch):
    """After EMPTY, a fresh load registers a second independent event."""
    db = tmp_path / "weigh2.db"
    monkeypatch.setenv("BROILER_DATABASE_URL", f"sqlite:///{db.as_posix()}")
    import config
    import models
    import processor
    import uktech
    import importlib
    importlib.reload(config)
    importlib.reload(models)
    importlib.reload(uktech)
    importlib.reload(processor)
    models.Base.metadata.create_all(models.engine)
    from models import Cycle, SessionLocal, Visit

    seq = [0, 219.0, 219.2, 0, 0, 180.0, 180.5, 0, 0]
    page = [_mk_rec(900 + i, "B9", float(v),
                    f"2026-09-18 13:{i:02d}:00") for i, v in enumerate(seq)]
    monkeypatch.setattr(uktech, "fetch_records", lambda *a, **k: (list(page), False))
    with SessionLocal() as s:
        c = Cycle(cycle_code="WG2", label="weighing2", strain="ross308",
                  bird_count=1)
        s.add(c)
        s.commit()
        cid = c.id
    try:
        r = uktech.sync_serial_to_cycle(cid, serial="ESP800")
        assert r["events"] == 2, r
        with SessionLocal() as s:
            visits = s.query(Visit).filter(Visit.cycle_id == cid).all()
            assert len(visits) == 2
            assert all(v.visit_end is not None for v in visits)
    finally:
        processor._processors.pop(cid, None)
