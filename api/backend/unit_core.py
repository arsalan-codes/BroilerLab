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


def _norm_tag(t):
    """RFID readers sometimes emit the same tag multiple times concatenated
    in one read (e.g. 5300285E1E3B5300285E1E3B, or a tripled variant):
    collapse it to the single tag, so one physical bird stays one identity
    everywhere (table, stats, swap detection). Guards: total length >= 16
    and the repeated unit >= 8 chars, so no legit short tag can ever be
    touched.
    """
    if not t:
        return t
    s = str(t).strip().upper()
    n = len(s)
    for k in (4, 3, 2):  # longest repeat first
        if n >= 16 and n % k == 0:
            unit = s[:n // k]
            if len(unit) >= 8 and unit * k == s:
                s = unit
                break
    return s


# Second-reading confirmation band for the `confirmed` annotation only
# (mirrors the old STABLE_TOLERANCE; never gates anything).
CONFIRM_TOL_G = 2.0


def new_visit_state(sample: dict, cfg: dict) -> dict:
    """Open-visit state from an entry sample."""
    c = sample.get("counter") or 0.0
    eject = cfg.get("INVALID_EJECT_S", 30.0)
    # Explicit business state (never confuse the raw VALID/INVALID flag
    # with it): VALID -> FEEDING, INVALID -> EJECTING (the motor runs its
    # ~30s countdown; the deadline is persisted, not slept).
    st = "FEEDING"
    inv_since = None
    inv_deadline = None
    if not sample.get("valid"):
        st = "EJECTING"
        inv_since = sample["ts"]
        inv_deadline = sample["ts"] + eject
    return {
        "bird_id": _norm_tag(sample["rfid"]),
        "initial": sample["bird"],
        "confirmed": None,
        "current": sample["bird"],
        # last valid/stable bird weight (frozen the moment INVALID begins;
        # the exit slope must never overwrite it).
        "last_valid": sample["bird"],
        "last_valid_bin": sample.get("bin"),
        # hopper at entry, captured once and never overwritten this visit.
        "initial_bin": sample.get("bin"),
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
        "invalid_since": inv_since,
        "invalid_deadline": inv_deadline,
        "business_state": st,
        "position": INSIDE,
        "last_tag": _norm_tag(sample["rfid"]),
        "close_reason": None,
        "stale": bool(sample.get("stale")),
        "last_source_ts": sample["ts"],
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
        rfid = _norm_tag((rec.get(ch["rfid"]) or "").strip() or None)
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
    # Max silence (s) the wall-clock fallback may bridge: the record stream
    # is the only truth — a gap larger than this is unobserved time, never
    # presence/elapsed (a 3-hour reporting hole must not become 3 hours of
    # "elapsed"). 0 disables the cap.
    GAP = max(0.0, float(cfg.get("FALLBACK_MAX_GAP_S", 120.0)))
    swap_policy = str(cfg.get("RFID_SWAP_POLICY", "keep-open")).lower()

    ts = sample["ts"]
    w = sample.get("bird")
    events: list = []

    if w is None:
        # Missing reading: hold everything, including the unit clock.
        return {"visit": visit, "closed": None, "opened": False,
                "uprev": uprev, "events": events,
                "outcome": "held", "touched": False}

    # Out-of-order guard (state mutation is monotonic): a late old record
    # must never roll the unit state backward. Raw data is still stored by
    # the caller for audit; only the business processing is skipped. The
    # uktech path is sorted ascending + cursor-guarded, so this only ever
    # fires on the direct-ESP source (device retries/reordered pushes).
    if uprev is not None and ts < uprev.get("ts", ts):
        return {"visit": visit, "closed": None, "opened": False,
                "uprev": uprev, "events": ["out-of-order"],
                "outcome": "stale-sample", "touched": False}

    has_bird = w > EMPTY_T
    uprev_new = {"ts": ts, "valid": bool(sample.get("valid"))
                 and not sample.get("stale"), "bird": has_bird}
    is_empty = not has_bird  # zero AND residuals (<= threshold) count as empty

    if visit is None:
        if sample.get("stale"):
            return {"visit": None, "closed": None, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "stale-idle", "touched": False}
        if not has_bird:
            # WEIGHT TRUMPS STATUS (owner rule): w2/w4 zero (or residual
            # <= threshold) with no open visit = bird out / idle, any flag
            # (the device itself flags zero rows both VALID and INVALID).
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
        if not sample.get("valid"):
            # Owner rule: INVALID at entry = the bird IS inside but not
            # eating (the electronic motor ejects it within ~30s). Open the
            # visit EJECTING with the deadline persisted (invalid_since +
            # EJECTION_TIMEOUT_S): elapsed stays 0 until a VALID pair, feed
            # 0; it resumes on VALID (deadline cancelled) and finalizes at
            # the deadline. The countdown starts HERE (the entry is the
            # first INVALID of the stretch).
            events.append("opened-paused")
        return {"visit": v, "closed": None, "opened": True,
                "uprev": uprev_new, "events": events,
                "outcome": "opened", "touched": True}

    # ---- open visit below ----
    v = visit
    v["last_source_ts"] = ts  # monotonic anchor for stale-sample rejection
    if sample.get("stale"):
        # Device offline (device_status != online): a connection problem,
        # NOT an exit — the visit stays open, marked STALE; the state
        # reverts to its pre-stale value when data flows again.
        v["stale"] = True
        if v.get("business_state") not in ("EJECTING",):
            v["business_state"] = "STALE"
        return {"visit": v, "closed": None, "opened": False,
                "uprev": uprev_new, "events": events,
                "outcome": "stale-hold", "touched": True}
    v["stale"] = False  # device is back online: clear on every path below

    if is_empty:
        # WEIGHT TRUMPS STATUS (owner rule): w2/w4 zero (or residual <=
        # threshold) = the bird is out, regardless of the flaky flag (the
        # device itself flags zero rows both VALID and INVALID). Any-status
        # empty readings grow the debounce streak; a lone flicker never
        # closes. Presence still takes the closing span (bird was there
        # until this record) when the previous record was VALID; later
        # empties add nothing — the bird is already gone. The span is
        # gap-capped like the elapsed fallback below.
        if uprev is not None and uprev.get("valid") and uprev.get("bird"):
            _span = max(0.0, ts - uprev["ts"])
            if not (GAP > 0 and _span > GAP):
                v["presence_acc"] = (v.get("presence_acc") or 0.0) + _span
        v["streak"] = (v.get("streak") or 0) + 1
        if v["streak"] == 1:
            v["empty_since"] = ts
        v["invalid_since"] = None
        v["invalid_deadline"] = None
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

    if not sample.get("valid"):
        # INVALID (owner rule) -> EJECTING, never an immediate exit: the
        # physical machine runs its ejection motor for ~30s. The deadline
        # (invalid_since + EJECTION_TIMEOUT_S) is PERSISTED so a restart
        # never resets the remaining seconds and the lazy sweep finalizes
        # an overdue visit even without a new record. The visit's row
        # (SAME row, never a new one) is finalized with the precise values
        # frozen at the last VALID record. Data keeps flowing from the API
        # regardless. The stretch is measured across CONSECUTIVE INVALID
        # records only (a lone flaky glitch + an irregular gap never
        # ejects a feeding bird); empty readings never reach here (weight
        # runs first).
        EJECT = cfg.get("INVALID_EJECT_S", 30.0)
        inv = v.get("invalid_since")
        if inv is None:
            # EJECTION_STARTED: freeze the last valid measurements (they
            # are already in last_valid_*), start the persisted countdown.
            v["invalid_since"] = ts
            v["invalid_deadline"] = ts + EJECT
            v["business_state"] = "EJECTING"
            events.append("ejection-started")
            return {"visit": v, "closed": None, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "paused", "touched": True}
        if ts >= (v.get("invalid_deadline") or (inv + EJECT)):
            # INVALID for the full 30 seconds: FINALIZE the visit.
            snap = finalize_visit(v, inv + EJECT, "ejected")
            events.append("finalized")
            return {"visit": None, "closed": snap, "opened": False,
                    "uprev": uprev_new, "events": events,
                    "outcome": "closed", "touched": True,
                    "state": v}
        v["business_state"] = "EJECTING"
        return {"visit": v, "closed": None, "opened": False,
                "uprev": uprev_new, "events": events,
                "outcome": "paused", "touched": True}

    # ---- live bird record: everything updates, every cycle ----
    touched = True
    v["streak"] = 0
    v["empty_since"] = None
    if v.get("invalid_since") is not None or v.get("invalid_deadline") is not None:
        # INVALID -> VALID before the deadline: the bird did not exit.
        # EJECTION_CANCELLED -> FEEDING: same RFID, same Visit continues.
        events.append("ejection-cancelled")
    v["invalid_since"] = None
    v["invalid_deadline"] = None
    v["business_state"] = "FEEDING"

    # 1) bird weight overwrites live, up AND down — no ratchet. BUT a
    # single-step change larger than BIRD_JUMP_G is the unloading slope
    # (motor ejecting the bird: 219.9 -> 45 in seconds) or a sensor
    # glitch, not real weight change (birds gain/lose grams per sample):
    # freeze the live weight at the last plausible value; the empty
    # streak closes the visit so the final weight stays the real one.
    JUMP = cfg.get("BIRD_JUMP_G", 30.0)
    if abs(w - (v.get("current") or 0.0)) > JUMP:
        events.append("unloading")
    else:
        # accepted VALID reading: live + last-valid tracking (frozen later
        # when INVALID begins — the exit slope never overwrites these).
        v["current"] = w
        v["last_valid"] = w
        if v.get("confirmed") is None and abs(w - (v.get("initial") or w)) <= CONFIRM_TOL_G:
            v["confirmed"] = w
            events.append("confirmed")

    # 2) tag swap with continuous weight (no empty between).
    rfid = _norm_tag(sample.get("rfid"))
    if rfid and rfid != _norm_tag(v.get("bird_id")):
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

    # 3) feed from bin drops, every record. Unobserved stretches never
    # feed: after an INVALID span or a silent reporting hole bigger than
    # FALLBACK_MAX_GAP_S, the hopper drift inside it cannot be attributed
    # to this visit — re-baseline only (section 4 owns the rebaseline
    # event + counter for the same spans).
    b = sample.get("bin")
    prev_valid = bool(uprev and uprev.get("valid"))
    gap_hold = bool(uprev is not None and (not prev_valid
                     or (GAP > 0 and (ts - uprev.get("ts", ts)) > GAP)))
    if b is not None and gap_hold:
        v["bin_base"] = b
        if sample.get("bin_cal") is not None:
            v["bin_cal"] = sample.get("bin_cal")
    elif b is not None:
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
        if b is not None:
            v["last_valid_bin"] = b  # last VALID hopper (frozen at INVALID)

    # 4) elapsed: counter deltas across VALID-prev pairs, else fallback.
    c = sample.get("counter") or 0.0
    _span = (ts - uprev["ts"]) if uprev else 0.0
    _gap = bool(GAP > 0 and _span > GAP)
    if uprev is not None and (not prev_valid or _gap):
        # First VALID after INVALID/stale, or a silent gap larger than
        # FALLBACK_MAX_GAP_S: re-baseline, add nothing; the unobserved
        # stretch (incl. any hopper drift inside it) stays excluded, like
        # the INVALID re-baseline above.
        v["counter_last"] = c
        if b is not None:
            v["bin_base"] = b
        events.append("gap-rebaselined"
                      if (prev_valid and _gap) else "rebaselined")
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
    finalized value (never a new row): final weight = the last valid/
    stable bird weight (empty/unloading records never overwrite it),
    elapsed/feed/presence frozen at their maximum effective values
    (INVALID spans excluded), even if the exit record's counter reads 0.
    Once finalized the row is immutable for business-critical values.
    exit_ts: the first empty record for "exit" (the physical exit), the
    ejection moment (invalid_since + 30s) for "ejected", the record ts
    for "swap"."""
    v["position"] = OUTSIDE
    v["close_reason"] = reason
    v["business_state"] = "EXITED"
    v["streak"] = 0
    final = (v.get("last_valid") if v.get("last_valid") is not None
             else v.get("current"))
    return {
        "bird_id": v.get("bird_id"),
        "initial": v.get("initial"),
        "confirmed": v.get("confirmed"),
        "final": final,
        "final_bin": v.get("last_valid_bin") if v.get("last_valid_bin") is not None else v.get("bin_base"),
        "weight_gain": (round((final or 0.0) - (v.get("initial") or 0.0), 1)
                        if final is not None else None),
        "feed": round(v.get("feed") or 0.0, 1),
        "elapsed": round(v.get("elapsed") or 0.0, 1),
        "presence": round(v.get("presence_acc") or 0.0, 1),
        "exit_ts": v.get("empty_since") if reason == "exit" else ts,
        "reason": reason,
    }
