"""
BroilerLab — per-unit live core: ONE function holds all weighing logic.

Every API record carries TWO independent weighing units (owner-confirmed
CHANNEL_MAP below); each record is split into two unit samples and both
are processed independently through process_unit_sample(), oldest first.
The direct-ESP source normalizes into the same sample shape, so both
sources run identical logic (single core, two sources).

Design (NO filter-as-gate): there is no DETECTING/STABLE/WAITING machine
here. Every VALID bird reading overwrites the live weight (up AND down);
every record updates bin/elapsed/feed in place on the ONE open visit row
per (device, unit). The old session filter survives only as the
`confirmed` annotation (second in-tolerance reading) — it never delays
row creation or hides an update.

State model (all persisted, restart-safe):
  visit-scoped  -> Visit columns (bird_position, last_tag, elapsed_s,
                   presence_acc, counter_last, counter_live, bin_baseline,
                   bin_calib, empty_streak, empty_since, initial_confirmed_g,
                   close_reason, stale; feed_intake_g / final_weight_g reused
                   as live feed / live weight, frozen at close).
  unit-scoped   -> unit_states per (cycle, device, unit): prev_ts/prev_valid
                   (the consecutive-pair rule needs the previous record).

Elapsed-time rule (device counter `total_seconds` = seconds inside WHILE
CONSUMING, per spec): for each consecutive pair (prev, cur) of this unit
within one visit, if prev was VALID -> elapsed += max(0, cur.counter -
prev.counter); if prev was INVALID -> add nothing (the whole INVALID
stretch through the first VALID record after it is excluded). Counter
decrease -> re-baseline + log, add nothing. Counter flat everywhere
(as in ALL 145 rows ever observed: always 0.0) -> FALLBACK adds the
record-timestamp span for VALID-prev pairs (yesterday's presence
behavior) until the firmware emits a live counter. Each pair uses
exactly one rule, so the modes can never double-count.
presence_acc (informational cross-check) accrues VALID-prev wall spans
while the bird is inside; a discrepancy beyond tolerance is logged.
"""
from __future__ import annotations

# Owner-confirmed channel map: unit -> record fields. total_weight is
# always the exact sum (profiled) and is ignored for logic.
UNIT_CHANNELS = {
    1: {"rfid": "rfid1", "bird": "weight_2", "bin": "weight_1",
        "status": "status1", "bird_cal": "calibration_2",
        "bin_cal": "calibration_1"},
    2: {"rfid": "rfid2", "bird": "weight_4", "bin": "weight_3",
        "status": "status2", "bird_cal": "calibration_4",
        "bin_cal": "calibration_3"},
}

INSIDE = "inside"
OUTSIDE = "outside"

# Second-reading confirmation band for the `confirmed` annotation only
# (mirrors the old STABLE_TOLERANCE; never gates anything).
CONFIRM_TOL_G = 2.0


def new_visit_state(sample: dict, cfg: dict) -> dict:
    """Open-visit state from an entry sample."""
    c = sample.get("counter") or 0.0
    return {
        "bird_id": sample["rfid"],
        "initial": sample["bird"],
        "confirmed": None,
        "current": sample["bird"],
        "feed": 0.0,
        # Spec: elapsed starts at the record's counter value (0 when the
        # counter is dead, as in all data observed to date).
        "elapsed": max(0.0, c),
        "presence_acc": 0.0,
        "counter_last": c,
        "counter_live": False,
        "bin_base": sample.get("bin"),
        "bin_cal": sample.get("bin_cal"),
        "streak": 0,
        "empty_since": None,
        "position": INSIDE,
        "last_tag": sample["rfid"],
        "close_reason": None,
        "stale": bool(sample.get("stale")),
    }


def _is_valid_flag(flag) -> bool:
    """Same leniency as the old pipeline: missing/empty counts as valid;
    only an explicit non-VALID marker is invalid."""
    if flag is None:
        return True
    s = str(flag).strip()
    return (not s) or s.upper() == "VALID"


def build_samples(rec: dict, ts_epoch: float) -> list:
    """Split one API record into its two independent unit samples.

    Sample: {unit, ts, rfid|None, bird|None, bin|None, valid, bird_cal,
    bin_cal, stale, counter, record_id}. Missing numerics stay None (the
    core holds state on those). device_status != online (when present)
    marks the sample stale: the visit stays open, nothing accumulates.
    """
    out = []
    dev_status = (rec.get("device_status") or "").strip()
    stale = bool(dev_status) and dev_status.upper() != "ONLINE"
    try:
        counter = float(rec.get("total_seconds") or 0.0)
    except (TypeError, ValueError):
        counter = 0.0
    for unit, ch in UNIT_CHANNELS.items():
        rfid = (rec.get(ch["rfid"]) or "").strip() or None
        out.append({
            "unit": unit,
            "ts": ts_epoch,
            "rfid": rfid,
            "bird": _num(rec.get(ch["bird"])),
            "bin": _num(rec.get(ch["bin"])),
            "valid": _is_valid_flag(rec.get(ch["status"])),
            "bird_cal": _num(rec.get(ch["bird_cal"])),
            "bin_cal": _num(rec.get(ch["bin_cal"])),
            "stale": stale,
            "counter": counter,
            "record_id": rec.get("id"),
            "status_raw": rec.get(ch["status"]),
        })
    return out


def _num(v):
    try:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        f = float(v)
        return f if f == f and abs(f) != float("inf") else None
    except (TypeError, ValueError):
        return None


def process_unit_sample(sample: dict, visit: dict | None,
                        uprev: dict | None, cfg: dict) -> dict:
    """One unit sample through the live core. Pure (no DB, no clock).

    visit: None (no open visit) or the persisted per-visit state dict.
    uprev: None or {"ts": epoch, "valid": bool} of this unit's previous
      record (any visit). cfg: EMPTY_THRESHOLD_G, EMPTY_DEBOUNCE,
      FEED_NOISE_G, REFILL_JUMP_G, RFID_SWAP_POLICY ("keep-open" default).
    Returns {"visit": state|None, "closed": snapshot|None, "opened": bool,
      "uprev": {...}, "events": [...], "outcome": str, "touched": bool}.
    `touched` marks visit-row changes for the UI patch path; `closed`
    carries the finalized snapshot when this record ends the visit.
    """
    EMPTY_T = cfg["EMPTY_THRESHOLD_G"]
    DEB = max(1, int(cfg.get("EMPTY_DEBOUNCE", 2)))
    NOISE = cfg["FEED_NOISE_G"]
    REFILL = cfg["REFILL_JUMP_G"]
    swap_policy = str(cfg.get("RFID_SWAP_POLICY", "keep-open")).lower()

    ts = sample["ts"]
    w = sample.get("bird")
    events: list = []

    if w is None:
        # Missing reading: hold everything, including the unit clock.
        return {"visit": visit, "closed": None, "opened": False,
                "uprev": uprev, "events": events,
                "outcome": "held", "touched": False}

    has_bird = w > EMPTY_T
    uprev_new = {"ts": ts, "valid": bool(sample.get("valid"))
                 and not sample.get("stale"), "bird": has_bird}
    is_empty = not has_bird  # zero AND residuals (<= threshold) count as empty

    if visit is None:
        if sample.get("stale"):
            return {"visit": None, "closed": None, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "stale-idle", "touched": False}
        if not sample.get("valid"):
            # INVALID with no open visit is idle: no pause, no visit.
            return {"visit": None, "closed": None, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "invalid-idle", "touched": False}
        if not has_bird:
            if w > 0 and not sample.get("rfid"):
                pass  # weightless/empty rows below: same unidentified rule
            return {"visit": None, "closed": None, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "empty-idle", "touched": False}
        if not sample.get("rfid"):
            events.append("unidentified")
            return {"visit": None, "closed": None, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "unidentified", "touched": False}
        v = new_visit_state(sample, cfg)
        events.append("opened")
        return {"visit": v, "closed": None, "opened": True,
                "uprev": uprev_new, "events": events,
                "outcome": "opened", "touched": True}

    # ---- open visit below ----
    v = visit
    if sample.get("stale"):
        v["stale"] = True
        return {"visit": v, "closed": None, "opened": False,
                "uprev": uprev_new, "events": events,
                "outcome": "stale-hold", "touched": True}

    if not sample.get("valid"):
        # Paused: freeze everything; the pair rule excludes this stretch
        # via uprev.valid=False on the NEXT record automatically.
        v["stale"] = False
        return {"visit": v, "closed": None, "opened": False,
                "uprev": uprev_new, "events": events,
                "outcome": "paused", "touched": False}

    v["stale"] = False
    if is_empty:
        # Empty VALID reading (zero or residual): freeze accumulation,
        # grow the debounce streak. A lone flicker never closes.
        # Presence still takes the closing span (bird was there until this
        # record) when the previous record had the bird; later empties add
        # nothing — the bird is already gone.
        if uprev is not None and uprev.get("valid") and uprev.get("bird"):
            v["presence_acc"] = (v.get("presence_acc") or 0.0) + max(
                0.0, ts - uprev["ts"])
        v["streak"] = (v.get("streak") or 0) + 1
        if v["streak"] == 1:
            v["empty_since"] = ts
        c = sample.get("counter") or 0.0
        v["counter_last"] = c
        if v["streak"] >= DEB:
            snap = finalize_visit(v, ts, "exit")
            events.append("closed")
            return {"visit": None, "closed": snap, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "closed", "touched": True,
                    "state": v}
        return {"visit": v, "closed": None, "opened": False,
                "uprev": uprev_new, "events": events,
                "outcome": "empty-streak", "touched": True}

    # ---- live bird record: everything updates, every cycle ----
    touched = True
    v["streak"] = 0
    v["empty_since"] = None

    # 1) bird weight overwrites live, up AND down — no ratchet.
    v["current"] = w
    if v.get("confirmed") is None and abs(w - (v.get("initial") or w)) <= CONFIRM_TOL_G:
        v["confirmed"] = w
        events.append("confirmed")

    # 2) tag swap with continuous weight (no empty between).
    rfid = sample.get("rfid")
    if rfid and rfid != v.get("bird_id"):
        if swap_policy == "close-open":
            snap = finalize_visit(v, ts, "swap")
            events.append("swap-close")
            v2 = new_visit_state({**sample, "rfid": rfid}, cfg)
            events.append("swap-open")
            # Re-run the live-record updates onto the fresh visit so this
            # record's bin/counter work is not lost (recursion depth 1:
            # same tag now, no second swap).
            res = process_unit_sample(sample, v2,
                                      {"ts": ts, "valid": False}, cfg)
            res["closed"] = snap
            res["events"] = events + res["events"]
            res["outcome"] = "swap-reopened"
            res["uprev"] = uprev_new
            return res
        v["last_tag"] = rfid
        events.append("swap-kept")

    # 3) feed from bin drops, every record.
    b = sample.get("bin")
    if b is not None:
        bcal = sample.get("bin_cal")
        if (v.get("bin_cal") is not None and bcal is not None
                and bcal != v.get("bin_cal")):
            v["bin_base"] = b
            v["bin_cal"] = bcal
            events.append("bin-calibration")
        else:
            base = v.get("bin_base")
            if base is None:
                v["bin_base"] = b
            else:
                drop = base - b
                if b - base >= REFILL:
                    v["bin_base"] = b  # refill: re-baseline only
                    events.append("refill")
                elif drop > NOISE:
                    v["feed"] = (v.get("feed") or 0.0) + drop
                    v["bin_base"] = b
                # |delta| <= noise: add nothing, never subtract.
            if bcal is not None:
                v["bin_cal"] = bcal

    # 4) elapsed: counter deltas across VALID-prev pairs, else fallback.
    c = sample.get("counter") or 0.0
    prev_valid = bool(uprev and uprev.get("valid"))
    if uprev is not None and not prev_valid:
        # First VALID after INVALID (or stale): re-baseline, add nothing;
        # the whole gap through this record stays excluded.
        v["counter_last"] = c
        if b is not None:
            v["bin_base"] = b
        events.append("rebaselined")
    else:
        wall = max(0.0, ts - uprev["ts"]) if uprev else 0.0
        if c > (v.get("counter_last") or 0.0):
            v["elapsed"] = (v.get("elapsed") or 0.0) + (c - v["counter_last"])
            v["counter_live"] = True
        elif c < (v.get("counter_last") or 0.0):
            events.append("counter-reset")
        else:
            v["elapsed"] = (v.get("elapsed") or 0.0) + wall  # fallback
        v["counter_last"] = c
        v["presence_acc"] = (v.get("presence_acc") or 0.0) + wall

    return {"visit": v, "closed": None, "opened": False,
            "uprev": uprev_new, "events": events,
            "outcome": "updated", "touched": touched}


def finalize_visit(v: dict, ts: float, reason: str) -> dict:
    """Freeze a visit into its closing snapshot. The SAME row keeps every
    finalized value (never a new row): final weight = last live weight
    (empty records never overwrite it), elapsed/feed/presence frozen at
    their maximum effective values, even if the exit record's counter
    reads 0."""
    v["position"] = OUTSIDE
    v["close_reason"] = reason
    v["streak"] = 0
    return {
        "bird_id": v.get("bird_id"),
        "initial": v.get("initial"),
        "confirmed": v.get("confirmed"),
        "final": v.get("current"),
        "feed": round(v.get("feed") or 0.0, 1),
        "elapsed": round(v.get("elapsed") or 0.0, 1),
        "presence": round(v.get("presence_acc") or 0.0, 1),
        "exit_ts": v.get("empty_since") if reason == "exit" else ts,
        "reason": reason,
    }
