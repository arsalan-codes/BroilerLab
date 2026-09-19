"""Live per-unit core (unit_core.process_unit_sample) — spec § ALGORITHM."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
for p in (str(BACKEND),):
    if p not in sys.path:
        sys.path.insert(0, p)

import unit_core as core  # noqa: E402

CFG = {"EMPTY_THRESHOLD_G": 15.0, "EMPTY_DEBOUNCE": 2,
       "FEED_NOISE_G": 0.5, "REFILL_JUMP_G": 50.0,
       "RFID_SWAP_POLICY": "keep-open"}
CFG_CLOSE = {**CFG, "RFID_SWAP_POLICY": "close-open"}

def sample(ts, bird, rfid="TAG-A", valid=True, bin_g=340.0, counter=0.0,
           bin_cal=889, stale=False, status_raw=None):
    return {"unit": 1, "ts": float(ts), "rfid": rfid, "bird": bird,
            "bin": bin_g, "valid": valid, "bird_cal": 435,
            "bin_cal": bin_cal, "stale": stale, "counter": float(counter),
            "record_id": int(ts), "status_raw": status_raw or ("VALID" if valid else "INVALID")}

def test_weight_tracks_every_record_up_and_down():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 218.5), v, up, CFG)
    assert r0["visit"]["current"] == 218.5 and r0["outcome"] == "opened"
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 219.1), v, up, CFG)
    assert r1["visit"]["current"] == 219.1
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 215.0), v, up, CFG)
    assert r2["visit"]["current"] == 215.0
    v, up = r2["visit"], r2["uprev"]
    r3 = core.process_unit_sample(sample(1030, 219.3), v, up, CFG)
    assert r3["visit"]["current"] == 219.3

def test_confirmation_annotation_not_a_gate():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 218.5), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    assert v["confirmed"] is None
    r1 = core.process_unit_sample(sample(1010, 219.1), v, up, CFG)
    v, up = r1["visit"], r1["uprev"]
    assert v["confirmed"] == 219.1
    r2 = core.process_unit_sample(sample(1020, 230.0), v, up, CFG)
    assert r2["visit"]["current"] == 230.0

def test_bin_feed_accumulates_per_record():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, bin_g=340.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, bin_g=338.5), v, up, CFG)
    assert r1["visit"]["feed"] == 1.5
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 220.0, bin_g=337.0), v, up, CFG)
    assert r2["visit"]["feed"] == 3.0

def test_bin_noise_ignored():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, bin_g=340.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, bin_g=339.8), v, up, CFG)
    assert r1["visit"]["feed"] == 0.0
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, bin_g=340.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, bin_g=339.4), v, up, CFG)
    assert abs(r1["visit"]["feed"] - 0.6) < 0.01

def test_bin_refill_rebaselines():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, bin_g=300.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, bin_g=350.0), v, up, CFG)
    assert r1["visit"]["feed"] == 0.0
    assert "refill" in r1["events"]
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 220.0, bin_g=348.0), v, up, CFG)
    assert abs(r2["visit"]["feed"] - 2.0) < 0.01

def test_bin_calibration_rebaselines():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, bin_g=340.0, bin_cal=889), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, bin_g=200.0, bin_cal=450), v, up, CFG)
    assert r1["visit"]["feed"] == 0.0
    assert "bin-calibration" in r1["events"]
    assert r1["visit"]["bin_base"] == 200.0

def test_elapsed_counter_valid_prev_pairs():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, counter=10), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    assert v["elapsed"] == 10.0
    r1 = core.process_unit_sample(sample(1010, 220.0, counter=15), v, up, CFG)
    assert r1["visit"]["elapsed"] == 15.0
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 220.0, counter=20), v, up, CFG)
    assert r2["visit"]["elapsed"] == 20.0

def test_elapsed_freezes_on_invalid_burst():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, counter=10), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, counter=20), v, up, CFG)
    v, up = r1["visit"], r1["uprev"]
    assert v["elapsed"] == 20.0
    r2 = core.process_unit_sample(sample(1020, 220.0, valid=False, counter=30), v, up, CFG)
    assert r2["outcome"] == "paused"
    v2 = r2["visit"]
    # frozen
    assert v2["elapsed"] == 20.0
    # still paused second invalid
    r3 = core.process_unit_sample(sample(1030, 220.0, valid=False, counter=40), v2, r2["uprev"], CFG)
    assert r3["visit"]["elapsed"] == 20.0
    r4 = core.process_unit_sample(sample(1040, 220.0, counter=50), r3["visit"], r3["uprev"], CFG)
    assert r4["visit"]["elapsed"] == 20.0  # re-baselined
    v, up = r4["visit"], r4["uprev"]
    r5 = core.process_unit_sample(sample(1050, 220.0, counter=55), v, up, CFG)
    assert r5["visit"]["elapsed"] == 25.0

def test_elapsed_multiple_invalid_episodes():
    v, up = None, None
    seq = [(0, True, 0), (10, True, 10), (99, False, 0), (11, True, 0), (16, True, 0), (50, False, 0), (17, True, 0), (20, True, 0)]
    # (counter, valid, ts offset) but we use counter as wall proxy too
    ts = 1000
    for c, valid, _ in seq:
        r = core.process_unit_sample(sample(ts, 220.0, counter=c, valid=valid), v, up, CFG)
        v, up = r["visit"] or v, r["uprev"]
        ts += 10
    # start 0, +10, paused, +5, paused, +3 = 18 (counter mode when moving, fallback else)
    # Actually with valid fallback, need to check: with counter 0->10 (+10), 10->rebaseline, 11->16 (+5), 16->rebaseline, 17->20 (+3) = 18
    assert v["elapsed"] == 18.0

def test_elapsed_invalid_at_entry_no_effect():
    r0 = core.process_unit_sample(sample(1000, 220.0, valid=False), None, None, CFG)
    assert r0["outcome"] == "invalid-idle"
    r1 = core.process_unit_sample(sample(1010, 220.0), None, r0["uprev"], CFG)
    assert r1["outcome"] == "opened"
    assert r1["visit"]["elapsed"] == 0.0

def test_elapsed_counter_reset_rebaselines():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, counter=100), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, counter=110), v, up, CFG)
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 220.0, counter=5), v, up, CFG)
    assert "counter-reset" in r2["events"]
    assert r2["visit"]["elapsed"] == 110.0

def test_elapsed_fallback_when_counter_flat():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, counter=0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, counter=0), v, up, CFG)
    assert r1["visit"]["elapsed"] == 10.0
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1025, 220.0, counter=0), v, up, CFG)
    assert r2["visit"]["elapsed"] == 25.0

def test_two_units_independent():
    cfg = CFG
    s1 = {"unit": 1, "ts": 1000, "rfid": "A", "bird": 220.0, "bin": 340.0,
          "valid": True, "stale": False, "counter": 0, "record_id": 1, "status_raw": "VALID", "bird_cal": 435, "bin_cal": 889}
    s2 = {"unit": 2, "ts": 1000, "rfid": None, "bird": 0, "bin": 0,
          "valid": False, "stale": False, "counter": 0, "record_id": 1, "status_raw": "INVALID", "bird_cal": 435, "bin_cal": 889}
    v1 = core.process_unit_sample(s1, None, None, cfg)
    v2 = core.process_unit_sample(s2, None, None, cfg)
    assert v1["opened"] is True
    assert v2["outcome"] == "invalid-idle"
    s1b = {**s1, "ts": 1010, "bird": 215.0}
    r = core.process_unit_sample(s1b, v1["visit"], v1["uprev"], cfg)
    assert r["visit"]["current"] == 215.0
    s2b = {"unit": 2, "ts": 1010, "rfid": "B", "bird": 300.0, "bin": 200.0,
           "valid": True, "stale": False, "counter": 0, "record_id": 2, "status_raw": "VALID", "bird_cal": 435, "bin_cal": 889}
    r2 = core.process_unit_sample(s2b, None, None, cfg)
    assert r2["opened"] is True
    assert r2["visit"]["bird_id"] == "B"

def test_empty_debounce_two_consecutive_closes_same_row():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0), v, up, CFG)
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 0), v, up, CFG)
    assert r2["outcome"] == "empty-streak"
    assert r2["visit"] is not None
    r3 = core.process_unit_sample(sample(1030, 6.77), v, r2["uprev"], CFG)
    assert r3["outcome"] == "closed"
    assert r3["closed"]["reason"] == "exit"
    assert r3["closed"]["final"] == 220.0

def test_single_flicker_does_not_close():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 0), v, up, CFG)
    assert r1["outcome"] == "empty-streak"
    assert r1["visit"] is not None
    r2 = core.process_unit_sample(sample(1020, 220.0), r1["visit"], r1["uprev"], CFG)
    assert r2["outcome"] == "updated"
    assert r2["visit"]["streak"] == 0

def test_rfid_with_zero_weight_no_visit():
    res = core.process_unit_sample(sample(1000, 0, rfid="TAG"), None, None, CFG)
    assert res["outcome"] == "empty-idle"
    assert res["visit"] is None

def test_unidentified_weight_without_tag_no_visit():
    res = core.process_unit_sample(sample(1000, 220.0, rfid=None), None, None, CFG)
    assert res["outcome"] == "unidentified"
    assert res["visit"] is None

def test_tag_swap_keep_open_vs_close_open():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, rfid="A"), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, rfid="B"), v, up, CFG)
    assert r1["outcome"] == "updated"
    assert "swap-kept" in r1["events"]
    assert r1["visit"]["last_tag"] == "B"
    assert r1["closed"] is None
    # close-open
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, rfid="A"), v, up, CFG_CLOSE)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, rfid="B"), v, up, CFG_CLOSE)
    assert r1["outcome"] == "swap-reopened"
    assert r1["closed"] is not None
    assert r1["closed"]["reason"] == "swap"
    assert r1["visit"]["bird_id"] == "B"

def test_reentry_after_exit_new_row():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 0), v, up, CFG)
    v2, up2 = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 0), v2, up2, CFG)
    assert r2["outcome"] == "closed"
    r3 = core.process_unit_sample(sample(1030, 221.0), None, r2["uprev"], CFG)
    assert r3["outcome"] == "opened"
    assert r3["visit"]["initial"] == 221.0

def test_identical_heartbeat_no_double_feed():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, bin_g=340.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, bin_g=340.0), v, up, CFG)
    assert r1["visit"]["feed"] == 0.0
    v, up = r1["visit"], r1["uprev"]
    r2 = core.process_unit_sample(sample(1020, 220.0, bin_g=340.0), v, up, CFG)
    assert r2["visit"]["feed"] == 0.0
    assert r2["visit"]["elapsed"] == 20.0

def test_stale_keeps_visit_open_no_accrual():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, stale=True), v, up, CFG)
    assert r1["outcome"] == "stale-hold"
    assert r1["visit"]["elapsed"] == 0.0
    r2 = core.process_unit_sample(sample(1020, 220.0), r1["visit"], r1["uprev"], CFG)
    assert r2["visit"]["stale"] is False

def test_invalid_right_before_exit_freezes():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0, counter=10), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, valid=False, counter=99), v, up, CFG)
    assert r1["visit"]["elapsed"] == 10.0
    r2 = core.process_unit_sample(sample(1020, 0), r1["visit"], r1["uprev"], CFG)
    r3 = core.process_unit_sample(sample(1030, 0), r2["visit"], r2["uprev"], CFG)
    assert r3["closed"]["elapsed"] == 10.0

def test_exit_while_paused():
    v, up = None, None
    r0 = core.process_unit_sample(sample(1000, 220.0), v, up, CFG)
    v, up = r0["visit"], r0["uprev"]
    r1 = core.process_unit_sample(sample(1010, 220.0, valid=False), v, up, CFG)
    r2 = core.process_unit_sample(sample(1020, 0), r1["visit"], r1["uprev"], CFG)
    r3 = core.process_unit_sample(sample(1030, 0), r2["visit"], r2["uprev"], CFG)
    assert r3["outcome"] == "closed"
    assert r3["closed"]["reason"] == "exit"

def test_build_samples_splits_record():
    rec = {"id": 99, "device_id": "ESP32-S3-001",
           "rfid1": "TAG1", "rfid2": "", "weight_1": 340.0, "weight_2": 220.5,
           "weight_3": 0, "weight_4": 0, "status1": "VALID", "status2": "INVALID",
           "total_seconds": 42.0, "device_status": "online",
           "calibration_1": 889, "calibration_2": 435}
    samples = core.build_samples(rec, 1000.0)
    assert len(samples) == 2
    assert samples[0]["rfid"] == "TAG1" and samples[0]["bird"] == 220.5
    assert samples[0]["bin"] == 340.0 and samples[0]["counter"] == 42.0
    assert samples[1]["rfid"] is None and samples[1]["valid"] is False
