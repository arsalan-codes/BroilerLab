"""
Arian — weighing-session filter for sparse cloud scale data.

Problem: the uktech cloud API returns periodic snapshots (minutes apart),
not a live stream. Feeding every snapshot into the visit aggregator mints
one table row per record — including unloading residuals (6.77 after 219.35)
and zeros — instead of one row per physical weighing.

Solution: a small state machine per (serial, cycle, device, rfid) session:

    EMPTY --weight--> DETECTING --stable--> REGISTERED --present--> STABLE
        ^                  |                     |                      |
        |                  v                     v                      v
        +---- zero ---- WAITING_FOR_EMPTY <-- out-of-tolerance ---------+
                (unloading / residual readings ignored here)

    * EMPTY: scale idle. Only a reading >= MIN_VALID_WEIGHT starts a session.
    * DETECTING: candidate load observed; needs REQUIRED_STABLE_READINGS
      consecutive in-tolerance readings to confirm (rising edge re-anchors
      the candidate so gradual loads like 15 -> 218.5 -> 219.3 confirm on
      the stable cluster, not on the first touch).
    * REGISTERED: confirmation reading; exactly one weighing event is
      emitted here (duplicate prevention: later readings never re-emit).
    * STABLE: load still present; readings within tolerance are ignored,
      except upward refinement (ratchet): a higher in-tolerance reading
      updates the registered weight, so 219.3 -> 219.35 displays 219.35.
    * WAITING_FOR_EMPTY: load left (or never confirmed). Everything is
      ignored until ZERO_CONFIRMATIONS consecutive sub-zero readings
      re-arm to EMPTY. This is what swallows 120 -> 45 -> 12 -> 6.77.

The machine itself is pure (no DB, no clock): `classify(state, weight, ts)`
takes a state dict and returns (new_state, actions). Persistence lives in
the WeighingSession table (see models.py); uktech.sync loads/saves it.

Display normalization (219.34999999999999 -> 219.35) is presentation-only:
`normalize_weight` rounds for display; the state logic always compares raw
floats against the tolerance so rounding never changes decisions.

All thresholds come from env (UKTECH_* below) with documented defaults.
"""
import logging
import os

log = logging.getLogger(__name__)

# States (also surfaced in the UI badge + /api/uktech/sessions).
EMPTY = "EMPTY"
DETECTING = "DETECTING"
REGISTERED = "REGISTERED"
STABLE = "STABLE"
WAITING_FOR_EMPTY = "WAITING_FOR_EMPTY"


def _f(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except (TypeError, ValueError):
        return default


def _i(name: str, default: int) -> int:
    try:
        return max(1, int(float(os.getenv(name, ""))))
    except (TypeError, ValueError):
        return default


def load_config() -> dict:
    """Centralized, env-overridable weighing parameters (read per call so
    tests can monkeypatch env + reload)."""
    return {
        # Minimum load that can start a session (g). Below this in EMPTY the
        # reading is ignored (noise / crumb), NOT a weighing.
        "MIN_VALID_WEIGHT": _f("UKTECH_MIN_WEIGHT", 20.0),
        # Band (g) inside which consecutive readings count as "the same load".
        "STABLE_TOLERANCE": _f("UKTECH_STABLE_TOL", 2.0),
        # Consecutive in-tolerance readings required to confirm a weighing.
        # 1 = edge-triggered (every touch registers); 2+ = stability-gated.
        "REQUIRED_STABLE_READINGS": _i("UKTECH_STABLE_READINGS", 2),
        # Below this (g) the scale counts as empty.
        "ZERO_THRESHOLD": _f("UKTECH_ZERO_THRESHOLD", 5.0),
        # Consecutive sub-zero readings required to re-arm to EMPTY.
        # Default 2: a lone zero (sensor dropout while the bird stands
        # there) must not fragment one physical presence into two visits.
        "ZERO_CONFIRMATIONS": _i("UKTECH_ZERO_CONFIRMATIONS", 2),
        # Non-EMPTY sessions older than this (s) reset to EMPTY (stuck-load
        # guard: a drifted load must not suppress new weighings forever).
        "SESSION_TIMEOUT_S": _f("UKTECH_SESSION_TIMEOUT_S", 4 * 3600.0),
        # Upstream channels (wiring changes need no code change).
        "BIRD_CHANNEL": (os.getenv("UKTECH_BIRD_CHANNEL", "") or "weight_2").strip(),
        "BIN_CHANNEL": (os.getenv("UKTECH_BIN_CHANNEL", "") or "weight_1").strip(),
    }


def normalize_weight(v):
    """Display normalization only: 219.34999999999999 -> 219.35.

    Returns None for missing values. Never feeds back into session logic.
    """
    try:
        if v is None or v == "":
            return None
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def is_status_valid(flag) -> bool:
    """Upstream per-unit validation flag for TIME accounting only.

    Missing/empty (legacy rows) counts as valid; only an explicit non-VALID
    marker is invalid. Session transitions never consult the flag — the
    weight pattern alone drives the machine.
    """
    if flag is None:
        return True
    s = str(flag).strip()
    return (not s) or s.upper() == "VALID"


def session_key(serial: str, cycle_id, device_id, rfid) -> str:
    """One session per physical weighing context.

    The cycle is part of the key: pointing the same device at another cycle
    starts independent sessions (per-tenant isolation, like SyncState).
    Missing device/rfid collapse to "-" (weight-only rows share one lane).
    """
    dev = (device_id or "").strip() or "-"
    tag = (rfid or "").strip() or "-"
    return f"{serial}|{cycle_id}|{dev}|{tag}"


def fresh_state() -> dict:
    return {"state": EMPTY, "candidate": None, "count": 0, "zero_count": 0,
            "registered": None, "visit_id": None, "first_ts": None,
            "updated_at": None}


def _is_timed_out(st: dict, now_ts: float, cfg: dict) -> bool:
    if st["state"] == EMPTY or not st.get("updated_at"):
        return False
    try:
        return (now_ts - float(st["updated_at"])) > cfg["SESSION_TIMEOUT_S"]
    except (TypeError, ValueError):
        return False


def classify(st: dict, weight, ts, now_ts: float, cfg: dict):
    """One step of the session machine.

    st: mutable state dict (fresh_state() for new sessions). weight may be
      None (missing reading: hold state, ignore). ts: event epoch seconds
      (stored as first_ts / returned for visit close rows). now_ts: epoch
      seconds used only for the stuck-session timeout.
    Returns (state, actions). Actions are small tuples consumed by the sync
    layer; at most one of register/ratchet/close fires per call:
      ("register", weight, first_ts)  — exactly one weighing event
      ("ratchet", weight)             — refine the registered weight upward
      ("close", end_ts)               — session ended, close its visit
      ("timeout_close",)              — stale session force-closed (visit
                                        closed by caller with end=now)
    """
    actions = []
    w = None
    if weight is not None:
        try:
            w = float(weight)
        except (TypeError, ValueError):
            w = None
    if w is None:
        return st, actions  # malformed/missing reading: hold, ignore

    MIN = cfg["MIN_VALID_WEIGHT"]
    TOL = cfg["STABLE_TOLERANCE"]
    REQ = cfg["REQUIRED_STABLE_READINGS"]
    ZERO = cfg["ZERO_THRESHOLD"]
    ZCONF = cfg["ZERO_CONFIRMATIONS"]

    if _is_timed_out(st, now_ts, cfg):
        if st.get("visit_id") is not None:
            actions.append(("timeout_close",))
        st = fresh_state()
        log.info("[WEIGHT] session timeout %.0fs — reset to EMPTY",
                 cfg["SESSION_TIMEOUT_S"])

    s = st["state"]
    log.debug("[WEIGHT] raw=%s state=%s candidate=%s count=%s",
              w, s, st.get("candidate"), st.get("count"))

    if s == EMPTY:
        st["zero_count"] = 0
        if w < ZERO:
            return st, actions
        if w >= MIN:
            st.update(state=DETECTING, candidate=w, count=1,
                      zero_count=0, first_ts=ts)
            log.debug("[WEIGHT] EMPTY -> DETECTING candidate=%s", w)
            if st["count"] >= REQ:
                # REQ == 1 (edge-triggered mode): confirm immediately.
                st.update(state=REGISTERED, registered=w)
                actions.append(("register", w, st.get("first_ts")))
                log.info("[WEIGHT] edge-trigger: REGISTER event %.2f", w)
        # ZERO <= w < MIN: too small to start a session, ignore.
        return st, actions

    if s == DETECTING:
        if w < ZERO:
            # Dropout tolerance like every other state: a single sub-zero
            # reading does not abandon an unconfirmed candidate; only
            # ZERO_CONFIRMATIONS consecutive ones do.
            st["zero_count"] = st.get("zero_count", 0) + 1
            if st["zero_count"] >= ZCONF:
                st.update(fresh_state())
                st["zero_count"] = 0
                log.debug("[WEIGHT] DETECTING -> EMPTY (vanished before confirm)")
            return st, actions
        st["zero_count"] = 0
        if w < MIN:
            st.update(state=WAITING_FOR_EMPTY, zero_count=0)
            log.debug("[WEIGHT] DETECTING -> WAITING_FOR_EMPTY (unconfirmed load left)")
            return st, actions
        if abs(w - st["candidate"]) <= TOL:
            st["count"] += 1
            if st["count"] >= REQ:
                st.update(state=REGISTERED, registered=w)
                actions.append(("register", w, st.get("first_ts")))
                log.info("[WEIGHT] stable: %s in-tol x%s -> REGISTER event %.2f",
                         w, st["count"], w)
            return st, actions
        if w > st["candidate"] + TOL:
            # rising edge (gradual load): re-anchor, keep detecting.
            st.update(candidate=w, count=1)
            log.debug("[WEIGHT] DETECTING rising, candidate=%s", w)
            return st, actions
        # significant fall while detecting: load left unconfirmed.
        st.update(state=WAITING_FOR_EMPTY, zero_count=0)
        log.debug("[WEIGHT] DETECTING -> WAITING_FOR_EMPTY (fall, no event)")
        return st, actions

    if s == REGISTERED:
        if w < ZERO:
            st["zero_count"] = st.get("zero_count", 0) + 1
            if st["zero_count"] >= ZCONF:
                if st.get("visit_id") is not None:
                    actions.append(("close", ts))
                st.update(fresh_state())
                st["zero_count"] = 0
                log.debug("[WEIGHT] REGISTERED -> EMPTY")
            return st, actions
        st["zero_count"] = 0
        if w < MIN:
            st["state"] = WAITING_FOR_EMPTY
            return st, actions
        if abs(w - st["registered"]) <= TOL:
            st["state"] = STABLE
            return st, actions
        st["state"] = WAITING_FOR_EMPTY
        return st, actions

    if s == STABLE:
        if w < ZERO:
            st["zero_count"] = st.get("zero_count", 0) + 1
            if st["zero_count"] >= ZCONF:
                if st.get("visit_id") is not None:
                    actions.append(("close", ts))
                st.update(fresh_state())
                st["zero_count"] = 0
                log.debug("[WEIGHT] STABLE -> EMPTY")
            return st, actions
        st["zero_count"] = 0
        if w < MIN:
            st["state"] = WAITING_FOR_EMPTY
            return st, actions
        if abs(w - st["registered"]) <= TOL:
            if w > st["registered"]:
                st["registered"] = w
                actions.append(("ratchet", w))
                log.debug("[WEIGHT] STABLE ratchet -> %.2f", w)
            return st, actions
        st["state"] = WAITING_FOR_EMPTY
        log.debug("[WEIGHT] STABLE -> WAITING_FOR_EMPTY (w=%s)", w)
        return st, actions

    if s == WAITING_FOR_EMPTY:
        if w < ZERO:
            st["zero_count"] = st.get("zero_count", 0) + 1
            if st["zero_count"] >= ZCONF:
                if st.get("visit_id") is not None:
                    actions.append(("close", ts))
                st.update(fresh_state())
                st["zero_count"] = 0
                log.debug("[WEIGHT] WAITING_FOR_EMPTY -> EMPTY")
            return st, actions
        st["zero_count"] = 0
        reg = st.get("registered")
        if reg is not None and abs(w - reg) <= TOL:
            # brief dip and rise (bird shifted, foot lifted): same load back,
            # resume the session instead of minting a duplicate event.
            st["state"] = STABLE
            log.debug("[WEIGHT] WAITING -> STABLE (resumed %.2f)", w)
            return st, actions
        if w >= MIN:
            # genuinely different load before a clean empty: fresh lane.
            st.update(state=DETECTING, candidate=w, count=1,
                      zero_count=0, first_ts=ts)
            log.debug("[WEIGHT] WAITING -> DETECTING candidate=%s", w)
            if st["count"] >= REQ:
                st.update(state=REGISTERED, registered=w)
                actions.append(("register", w, st.get("first_ts")))
                log.info("[WEIGHT] edge-trigger: REGISTER event %.2f", w)
        return st, actions

    # unknown state: fail safe to EMPTY (never trap a session forever).
    log.warning("[WEIGHT] unknown state %r — resetting to EMPTY", s)
    return fresh_state(), actions


# Short human labels for the UI badge (fa/en resolved by the frontend via
# dev.sess.* keys; kept here for logs/debugging too).
STATE_LABELS = {
    EMPTY: "empty",
    DETECTING: "weighing",
    REGISTERED: "registered",
    STABLE: "stable",
    WAITING_FOR_EMPTY: "waiting for empty",
}
