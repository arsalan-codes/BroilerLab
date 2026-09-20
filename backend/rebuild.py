"""
BroilerLab — idempotent rebuild of visits from raw device_logs.

The old session filter (migration 007) gated which rows became table rows;
open visits left before the cutover may be incomplete or mis-channelled.
This tool replays the COMPLETE device_logs history for one cycle through
the live core (unit_core.process_unit_sample), chronologically, in a
single transaction — pure dry-run by default.

Usage:
  python -m backend.rebuild --cycle 12            # dry-run, prints diff
  python -m backend.rebuild --cycle 12 --apply    # rebuild for real
  python -m backend.rebuild --cycle 12 --json     # machine-readable diff

Output: before/after visit counts, per-visit field diffs (bird/weights/
feed/elapsed/position/reason), and the dry-run banner.
The rebuild is idempotent: replaying again produces zero diff.
"""
from __future__ import annotations
import argparse
import json
import sys
from datetime import timezone

from config import (
    UKTECH_EMPTY_THRESHOLD_G, UKTECH_EMPTY_DEBOUNCE,
    UKTECH_FEED_NOISE_G, UKTECH_REFILL_JUMP_G, UKTECH_RFID_SWAP_POLICY,
)
from models import SessionLocal, Visit, DeviceLog, UnitState, Cycle
import unit_core as core


def _cfg():
    return {"EMPTY_THRESHOLD_G": UKTECH_EMPTY_THRESHOLD_G,
            "EMPTY_DEBOUNCE": UKTECH_EMPTY_DEBOUNCE,
            "FEED_NOISE_G": UKTECH_FEED_NOISE_G,
            "REFILL_JUMP_G": UKTECH_REFILL_JUMP_G,
            "RFID_SWAP_POLICY": UKTECH_RFID_SWAP_POLICY}


def _iso(dt):
    return dt.isoformat() if dt else None


def _visit_dict(v):
    return {"id": v.id, "bird_id": v.bird_id, "unit": v.unit,
            "visit_start": _iso(v.visit_start), "visit_end": _iso(v.visit_end),
            "initial_weight_g": v.initial_weight_g,
            "final_weight_g": v.final_weight_g,
            "feed_intake_g": v.feed_intake_g,
            "elapsed_s": v.elapsed_s, "presence_s": v.presence_s,
            "bird_position": v.bird_position, "close_reason": v.close_reason,
            "stale": bool(v.stale)}


def diff_visits(before, after):
    """Human-readable diff between two visit snapshots (lists of dicts)."""
    before_by = {(v["bird_id"], v["visit_start"]): v for v in before}
    after_by = {(v["bird_id"], v["visit_start"]): v for v in after}
    lines = []
    for key in sorted(set(before_by) | set(after_by)):
        b, a = before_by.get(key), after_by.get(key)
        if b and not a:
            lines.append(f"- visit {b['id']} {b['bird_id']} u{b['unit']} {b['visit_start']}: REMOVED")
        elif a and not b:
            lines.append(f"+ visit {a['id']} {a['bird_id']} u{a['unit']} {a['visit_start']}: NEW init={a['initial_weight_g']} final={a['final_weight_g']} feed={a['feed_intake_g']} elapsed={a['elapsed_s']} pos={a['bird_position']}")
        elif b != a:
            changes = [f"{k}: {b[k]!r} -> {a[k]!r}" for k in b if b[k] != a[k]]
            lines.append(f"~ visit {a['id']} {a['bird_id']} u{a['unit']} {a['visit_start']}: " + "; ".join(changes))
    return lines


def rebuild_cycle(cycle_id: int, dry_run: bool = True, verbose: bool = True):
    cfg = _cfg()
    with SessionLocal() as s:
        cycle = s.get(Cycle, cycle_id)
        if not cycle:
            print(f"cycle {cycle_id} not found", file=sys.stderr)
            return 1
        logs = (s.query(DeviceLog)
                .filter(DeviceLog.cycle_id == cycle_id)
                .order_by(DeviceLog.timestamp, DeviceLog.id).all())
        before = [_visit_dict(v) for v in
                  s.query(Visit).filter(Visit.cycle_id == cycle_id)
                  .order_by(Visit.visit_start, Visit.id).all()]
        if verbose:
            print(f"cycle {cycle_id} ({cycle.cycle_code}): {len(logs)} device_logs, {len(before)} visits before")

        if not logs:
            if verbose:
                print("nothing to replay")
            return 0

        # Simulate the live core over the log stream. Samples carry the same
        # shape as uktech/device sync: per-unit with bin as stored grams.
        openv = {}   # (sensor, unit) -> visit idx in after_visits
        ustate = {}  # (sensor, unit) -> {"ts": epoch, "valid": bool, "bird": bool}
        state_by_lane = {}  # (sensor, unit) -> live-core state dict (carries streak/invalid_since across records)
        after_visits = []

        def _new_visit(sample, ts_dt, age_day, sensor, unit, out):
            return {"bird_id": out["bird_id"], "unit": unit,
                    "visit_start": ts_dt, "visit_end": None,
                    "initial_weight_g": out["initial"],
                    "final_weight_g": out["current"],
                    "live_weight_g": out["current"],
                    "last_valid_weight_g": out.get("last_valid"),
                    "initial_bin_weight_g": out.get("initial_bin"),
                    "last_valid_bin_weight_g": out.get("last_valid_bin"),
                    "feed_intake_g": round(out["feed"] or 0.0, 1),
                    "elapsed_s": round(out["elapsed"] or 0.0, 1),
                    "presence_s": round(out["presence_acc"] or 0.0, 1),
                    "counter_last": out["counter_last"], "counter_live": bool(out["counter_live"]),
                    "bin_baseline": out["bin_base"], "bin_calib": out["bin_cal"],
                    "empty_streak": 0, "empty_since": None,
                    "invalid_since": out.get("invalid_since"),
                    "invalid_deadline": out.get("invalid_deadline"),
                    "business_state": out.get("business_state") or "FEEDING",
                    "bird_position": "inside", "last_tag": out["last_tag"],
                    "initial_confirmed_g": out["confirmed"], "close_reason": None,
                    "stale": bool(out["stale"]),
                    "sensor_id": sensor, "age_day": age_day}

        for log in logs:
            ts_ep = log.timestamp.timestamp() if log.timestamp else 0.0
            # Reconstruct sample(s) from stored log + visit link. Each log is
            # single-unit (device ingest) or uktech split; replay per log row
            # as one sample to preserve the stored bin/bird/status exactly.
            bird = log.raw_weight_g if log.raw_weight_g is not None else log.weight_g
            binkg = log.feed_bin_kg
            bin_g = binkg * 1000.0 if binkg is not None else None
            valid = True if not log.status or not str(log.status).strip() \
                else str(log.status).strip().upper() == "VALID"
            sensor = (log.sensor_id or "").strip() or "-"
            unit = 1  # stored visits know unit; resolved below when linked
            try:
                if log.visit_id:
                    with SessionLocal() as _s:
                        _v = _s.get(Visit, log.visit_id)
                        if _v and _v.unit in (1, 2):
                            unit = _v.unit
            except Exception:
                pass
            sample = {"unit": unit, "ts": ts_ep, "rfid": log.bird_id,
                      "bird": bird, "bin": bin_g, "valid": valid,
                      "bird_cal": None, "bin_cal": None,
                      "stale": False, "counter": 0.0,
                      "record_id": log.external_id, "status_raw": log.status}
            lane = (sensor, unit)
            cur_idx = openv.get(lane)
            # The live-core state dict is carried across records in memory
            # (streak/invalid_since/counter survive), NOT re-derived from
            # the display list — otherwise debounced closes would never fire.
            vstate = state_by_lane.get(lane)
            uprev = ustate.get(lane)
            if uprev and uprev.get("ts") is None:
                uprev = None
            res = core.process_unit_sample(sample, vstate, uprev, cfg)
            if res.get("uprev") is not None:
                ustate[lane] = res["uprev"]
            out, snap = res.get("visit"), res.get("closed")
            if res.get("outcome") == "swap-reopened":
                if cur_idx is not None:
                    after_visits[cur_idx]["visit_end"] = log.timestamp
                    after_visits[cur_idx]["bird_position"] = "outside"
                    after_visits[cur_idx]["close_reason"] = "swap"
                    del openv[lane]
                state_by_lane.pop(lane, None)
                nv = _new_visit(sample, log.timestamp, log.age_day, sensor, unit, out)
                after_visits.append(nv)
                openv[lane] = len(after_visits) - 1
                state_by_lane[lane] = out
            elif res.get("opened"):
                state_by_lane.pop(lane, None)
                nv = _new_visit(sample, log.timestamp, log.age_day, sensor, unit, out)
                after_visits.append(nv)
                openv[lane] = len(after_visits) - 1
                state_by_lane[lane] = out
            elif snap is not None:
                if cur_idx is not None:
                    exit_dt = snap.get("exit_ts")
                    after_visits[cur_idx]["visit_end"] = (
                        log.timestamp if not exit_dt else exit_dt
                        if hasattr(exit_dt, "year") else log.timestamp)
                    after_visits[cur_idx]["final_weight_g"] = snap["final"]
                    after_visits[cur_idx]["feed_intake_g"] = snap["feed"]
                    after_visits[cur_idx]["elapsed_s"] = snap["elapsed"]
                    after_visits[cur_idx]["presence_s"] = snap["presence"]
                    after_visits[cur_idx]["bird_position"] = "outside"
                    after_visits[cur_idx]["close_reason"] = snap["reason"]
                    del openv[lane]
                state_by_lane.pop(lane, None)
            elif out is not None:
                state_by_lane[lane] = out
                if cur_idx is not None:
                    after_visits[cur_idx]["final_weight_g"] = out.get("current")
                    after_visits[cur_idx]["feed_intake_g"] = round(out.get("feed") or 0.0, 1)
                    after_visits[cur_idx]["elapsed_s"] = round(out.get("elapsed") or 0.0, 1)
                    after_visits[cur_idx]["presence_s"] = round(out.get("presence_acc") or 0.0, 1)
                    after_visits[cur_idx]["bird_position"] = out.get("position") or "inside"

        # still-open lanes: finalize the display entries from the live state
        for lane, idx in openv.items():
            st = state_by_lane.get(lane)
            if st is not None and idx < len(after_visits):
                after_visits[idx]["final_weight_g"] = st.get("current")
                after_visits[idx]["feed_intake_g"] = round(st.get("feed") or 0.0, 1)
                after_visits[idx]["elapsed_s"] = round(st.get("elapsed") or 0.0, 1)
                after_visits[idx]["presence_s"] = round(st.get("presence_acc") or 0.0, 1)
                after_visits[idx]["bird_position"] = st.get("position") or "inside"

        after = []
        for i, v in enumerate(sorted(after_visits, key=lambda x: x["visit_start"] or "")):
            after.append({"id": f"new:{i}", "bird_id": v["bird_id"], "unit": v["unit"],
                          "visit_start": v["visit_start"].isoformat() if v["visit_start"] else None,
                          "visit_end": v["visit_end"].isoformat() if v["visit_end"] else None,
                          "initial_weight_g": v["initial_weight_g"],
                          "final_weight_g": v["final_weight_g"],
                          "feed_intake_g": v["feed_intake_g"],
                          "elapsed_s": v["elapsed_s"], "presence_s": v["presence_s"],
                          "bird_position": v["bird_position"], "close_reason": v["close_reason"],
                          "stale": bool(v["stale"])})

        lines = diff_visits(before, after)
        if verbose:
            if not lines:
                print("no diff (idempotent)")
            else:
                print(f"diff ({len(lines)} visits changed):")
                for ln in lines:
                    print(" ", ln)
            print(f"before={len(before)} after={len(after)}")

        if not dry_run:
            with SessionLocal() as s2:
                s2.query(Visit).filter(Visit.cycle_id == cycle_id).delete(synchronize_session=False)
                s2.query(UnitState).filter(UnitState.cycle_id == cycle_id).delete(synchronize_session=False)
                for v in after_visits:
                    s2.add(Visit(
                        cycle_id=cycle_id, bird_id=v["bird_id"], unit=v["unit"],
                        visit_start=v["visit_start"], visit_end=v["visit_end"],
                        initial_weight_g=v["initial_weight_g"],
                        final_weight_g=v["final_weight_g"],
                        live_weight_g=v.get("final_weight_g"),
                        last_valid_weight_g=v.get("final_weight_g"),
                        initial_bin_weight_g=v.get("initial_bin_weight_g"),
                        feed_intake_g=v["feed_intake_g"],
                        elapsed_s=v["elapsed_s"], presence_s=v["presence_s"],
                        business_state=("EXITED" if v["visit_end"]
                                        else "FEEDING"),
                        bird_position=v["bird_position"],
                        close_reason=v["close_reason"],
                        sensor_id=v["sensor_id"], age_day=v["age_day"],
                        read_ok=True, stale=bool(v["stale"])))
                s2.commit()
            if verbose:
                print("applied")
        return 0


def main():
    p = argparse.ArgumentParser(description="Rebuild visits from device_logs via the live core")
    p.add_argument("--cycle", type=int, required=True, help="cycle id to rebuild")
    p.add_argument("--apply", action="store_true", help="apply (default: dry-run)")
    p.add_argument("--json", action="store_true", help="emit JSON diff to stdout")
    args = p.parse_args()
    return rebuild_cycle(args.cycle, dry_run=not args.apply, verbose=not args.json)


if __name__ == "__main__":
    raise SystemExit(main())
