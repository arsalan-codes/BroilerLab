"""
BroilerLab Device Backend — device data processing algorithm.

Hardware produces raw events (the 12-col schema, ~3 rows per visit:
start / mid / end). This module turns those raw events into:
  - DeviceLog rows (raw, persisted verbatim)
  - Visit aggregations (RFID entry -> initial weight + exact timestamp;
    feed intake from bin load-cell delta; visit timing; per-bird visit count)

Design mirrors the documented device model:
  load cell 1 -> platform scale: raw sigma~4g -> EMA -> weight_g
  load cell 2 -> 25kg bin: mass drop = intake; auto-refill @3kg
  RFID wing   -> identity on entry; 0.4% missed -> read_ok=False
  queue logic -> single head-hole, wait <=90s else co-feeding event
"""
import json
import math
from datetime import datetime, timezone

from config import (
    RAW_WEIGHT_SIGMA, EMA_ALPHA,
    BIN_CAPACITY_KG, VISIT_QUEUE_TIMEOUT_S,
)
from models import SessionLocal, Cycle, Visit, DeviceLog


def _now():
    return datetime.now(timezone.utc)


def _ema(prev, cur, alpha=EMA_ALPHA):
    if prev is None:
        return cur
    return prev + alpha * (cur - prev)


class CycleProcessor:
    """Stateful per-cycle processor. Tracks open visits by bird_id.

    In production this lives in memory keyed by cycle_id (one per device
    stream). On restart, open visits are reconstructed from the DB.
    """

    def __init__(self, cycle_id):
        self.cycle_id = cycle_id
        # bird_id -> open visit context
        self.open = {}
        self._load_open()

    def _load_open(self):
        """Reconstruct any visits that started but never closed (crash recovery)."""
        with SessionLocal() as s:
            rows = (s.query(Visit)
                    .filter(Visit.cycle_id == self.cycle_id,
                            Visit.visit_end.is_(None))
                    .all())
            for v in rows:
                self.open[v.bird_id] = {
                    "visit_id": v.id,
                    "start": v.visit_start,
                    "init_w": v.initial_weight_g,
                    "sensor": v.sensor_id,
                    "rssi": v.rssi,
                    "read_ok": v.read_ok,
                    "last_ts": v.visit_start,
                    "intake": 0.0,
                    "bin_prev": None,
                    "last_raw": None,
                    "ema_w": v.initial_weight_g,
                }

    # ---- public: feed one raw device event ----
    def ingest(self, event: dict):
        """event: dict with the 12-col fields (+ optional 'kind').
        Returns the persisted DeviceLog row (as dict) for live push.
        """
        ts = self._parse_ts(event.get("timestamp"))
        bird_id = (event.get("bird_id") or "").strip() or None
        sensor_id = (event.get("sensor_id") or "").strip() or None
        age_day = _to_int(event.get("age_day"))
        raw = _to_float(event.get("raw_weight_g"))
        weight_g = _to_float(event.get("weight_g"))
        bin_kg = _to_float(event.get("feed_bin_kg"))
        feed_delta = _to_float(event.get("feed_delta_g"))
        temp_c = _to_float(event.get("temp_c"))
        humidity = _to_float(event.get("humidity"))
        rssi = _to_float(event.get("rssi"))
        flock_id = (event.get("flock_id") or "").strip() or None

        # If weight_g missing but raw present, apply EMA smoothing.
        if weight_g is None and raw is not None:
            weight_g = raw  # caller-level smoothing applied in _step

        ctx = self.open.get(bird_id) if bird_id else None

        # ---- determine event role ----
        # A visit STARTS when an RFID read occurs with no open visit for this bird.
        # We treat the first row of a bird with no open context as the start.
        is_start = False
        is_end = False
        if bird_id and ctx is None:
            is_start = True
            ctx = self._open_visit(bird_id, ts, sensor_id, rssi, weight_g,
                                   age_day, bin_kg)
        elif ctx is not None:
            # continuation or end
            dt_last = ctx["last_ts"]
            gap = (ts - dt_last).total_seconds() if dt_last else 0
            # End marker: device sends explicit exit event, OR a row with no
            # weight but with a feed delta (the closing row of a visit).
            explicit_end = (event.get("event") == "exit")
            closing_row = (weight_g is None and raw is None
                           and feed_delta is not None)
            if gap > VISIT_QUEUE_TIMEOUT_S or explicit_end or closing_row:
                # The closing row belongs to the ENDING visit: credit its intake
                # before closing so the last delta is never lost.
                end_inc = _intake_increment(ctx, bin_kg, feed_delta)
                ctx["intake"] += end_inc
                if bin_kg is not None:
                    ctx["bin_prev"] = bin_kg
                self._close_visit(ctx, ts, weight_g, temp_c, humidity,
                                  final_inc=end_inc)
                is_start = True
                ctx = self._open_visit(bird_id, ts, sensor_id, rssi,
                                       weight_g, age_day, bin_kg)
            else:
                # mid or end: update bin intake + weight EMA
                self._step(ctx, ts, raw, weight_g, bin_kg, feed_delta,
                           temp_c, humidity)

        # ---- persist raw log ----
        with SessionLocal() as s:
            log = DeviceLog(
                cycle_id=self.cycle_id,
                timestamp=ts, flock_id=flock_id, bird_id=bird_id,
                sensor_id=sensor_id, age_day=age_day,
                raw_weight_g=raw, weight_g=weight_g,
                feed_bin_kg=bin_kg, feed_delta_g=feed_delta,
                temp_c=temp_c, humidity=humidity, rssi=rssi,
                visit_id=ctx["visit_id"] if ctx else None,
                is_visit_start=is_start, is_visit_end=False,
            )
            s.add(log)
            s.commit()
            # realtime-table context: elapsed seconds since visit start and
            # feed consumed so far in this visit (0 for fresh start rows).
            if ctx and ctx.get("start"):
                try:
                    elapsed = max(0.0, (ts - ctx["start"]).total_seconds())
                except Exception:
                    elapsed = 0.0
            else:
                elapsed = 0.0
            log_d = _log_to_dict(log, {
                "elapsed_s": round(elapsed, 1),
                "visit_feed_g": round(ctx["intake"] if ctx else 0.0, 1),
            })
        return log_d

    # ---- internal state machine ----
    def _open_visit(self, bird_id, ts, sensor, rssi, weight_g, age_day,
                    bin_kg=None):
        ema_w = weight_g
        with SessionLocal() as s:
            v = Visit(
                cycle_id=self.cycle_id, bird_id=bird_id,
                visit_start=ts, sensor_id=sensor,
                initial_weight_g=weight_g, age_day=age_day,
                rssi=rssi, read_ok=(bird_id is not None),
            )
            s.add(v); s.commit()
            vid = v.id
        ctx = {
            "visit_id": vid, "start": ts, "init_w": weight_g,
            "sensor": sensor, "rssi": rssi, "read_ok": bird_id is not None,
            "last_ts": ts, "intake": 0.0, "bin_prev": bin_kg,
            "last_raw": weight_g, "ema_w": ema_w, "age_day": age_day,
        }
        self.open[bird_id] = ctx
        return ctx

    def _step(self, ctx, ts, raw, weight_g, bin_kg, feed_delta, temp_c, humidity):
        ctx["last_ts"] = ts
        # weight EMA
        if weight_g is not None:
            ctx["ema_w"] = _ema(ctx["ema_w"], weight_g)
            ctx["last_raw"] = weight_g
        # feed intake increment for THIS row — one rule shared by the in-memory
        # ctx and the DB persist below, so the two can never diverge.
        # Prefer explicit positive feed_delta (already computed by device);
        # else derive from bin mass drop when bin_kg is present.
        inc = _intake_increment(ctx, bin_kg, feed_delta)
        ctx["intake"] += inc
        if bin_kg is not None:
            ctx["bin_prev"] = bin_kg
        # persist incremental intake on the visit
        with SessionLocal() as s:
            v = s.get(Visit, ctx["visit_id"])
            if v:
                v.feed_intake_g = (v.feed_intake_g or 0) + inc
                v.final_weight_g = ctx["ema_w"]
                v.temp_c = temp_c
                v.humidity = humidity
                s.commit()
        return inc

    def _close_visit(self, ctx, end_ts, weight_g, temp_c, humidity,
                     final_inc=0.0):
        with SessionLocal() as s:
            v = s.get(Visit, ctx["visit_id"])
            if v:
                v.visit_end = end_ts
                v.feed_intake_g = (v.feed_intake_g or 0) + (final_inc or 0)
                v.final_weight_g = ctx["ema_w"] if weight_g is None else weight_g
                v.temp_c = temp_c
                v.humidity = humidity
                s.commit()
        bird = ctx.get("bird_id")
        if bird and bird in self.open:
            del self.open[bird]

    # ---- utils ----
    def _parse_ts(self, val):
        if val is None:
            return _now()
        if isinstance(val, datetime):
            return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
        # ISO string or "YYYY-MM-DD HH:MM:SS"
        s = str(val).strip().replace("T", " ").replace("Z", "")
        try:
            return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
                try:
                    return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
        return _now()


_processors = {}  # cycle_id -> CycleProcessor


def get_processor(cycle_id):
    if cycle_id not in _processors:
        _processors[cycle_id] = CycleProcessor(cycle_id)
    return _processors[cycle_id]


def _to_float(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _to_int(v):
    try:
        if v is None or v == "":
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _intake_increment(ctx, bin_kg, feed_delta):
    """Single intake rule shared by the in-memory ctx and the DB persist.

    Prefer explicit positive feed_delta (already computed by device, in grams);
    else derive from bin mass drop when bin_kg is present (bin readings are in
    kilograms, so the drop is converted to grams). A refill (large negative
    drop) contributes 0 — it only resets the baseline.
    """
    if feed_delta is not None and feed_delta > 0:
        return feed_delta
    if bin_kg is not None and ctx.get("bin_prev") is not None:
        drop = ctx["bin_prev"] - bin_kg
        if drop > 0:
            return drop * 1000.0
    return 0.0


def _log_to_dict(log, extra=None):
    d = {
        "id": log.id, "cycle_id": log.cycle_id, "timestamp": _iso(log.timestamp),
        "flock_id": log.flock_id, "bird_id": log.bird_id,
        "sensor_id": log.sensor_id, "age_day": log.age_day,
        "raw_weight_g": log.raw_weight_g, "weight_g": log.weight_g,
        "feed_bin_kg": log.feed_bin_kg, "feed_delta_g": log.feed_delta_g,
        "temp_c": log.temp_c, "humidity": log.humidity, "rssi": log.rssi,
        "visit_id": log.visit_id, "is_visit_start": log.is_visit_start,
        "is_visit_end": log.is_visit_end,
    }
    if extra:
        d.update(extra)
    return d


def _iso(dt):
    return dt.isoformat() if dt else None
