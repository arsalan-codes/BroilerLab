"""
BroilerLab Device Backend — device simulator + seeder.

Generates realistic raw device events (12-col schema, ~3 rows/visit) for one
or more cycles and pushes them via the REST /ingest endpoint (or directly to
the processor for fast local testing).

Usage:
  python seed.py            # create demo cycle F01 + 200 visits
  python seed.py --cycles F01 F02 --visits 100
"""
import argparse
import json
import random
import time
from datetime import datetime, timezone, timedelta

from config import API_HOST, API_PORT
from models import init_db, SessionLocal, Cycle
from processor import get_processor

STRAINS = {"ross308": 42.0, "cobb500": 40.0, "aaplus": 44.0, "hubbardep": 41.0}


def make_cycle(code, label, strain, birds):
    with SessionLocal() as s:
        if s.query(Cycle).filter(Cycle.cycle_code == code).first():
            return s.query(Cycle).filter(Cycle.cycle_code == code).first().id
        c = Cycle(cycle_code=code, label=label, strain=strain,
                  bird_count=birds, start_date=datetime.now(timezone.utc))
        s.add(c); s.commit()
        return c.id


def gen_visit(cycle_id, cycle_code, bird_id, start, strain, start_date, sensor="ST-A1"):
    """Produce raw event rows for one visit (start/mid/end)."""
    base = STRAINS.get(strain, 42.0)
    age = (start.date() - start_date.date()).days + 1
    age = max(1, age)
    w = base * (1 + age * 0.018) + random.gauss(0, 4)
    bin_start = random.uniform(18, 24)
    intake = random.uniform(20, 70)  # grams this visit
    rows = []
    # START: RFID read + initial weight
    rows.append({
        "cycle": cycle_code, "timestamp": start.isoformat(),
        "flock_id": cycle_code, "bird_id": bird_id, "sensor_id": sensor,
        "age_day": age, "raw_weight_g": round(w + random.gauss(0, 4), 1),
        "weight_g": round(w, 1), "feed_bin_kg": round(bin_start, 3),
        "feed_delta_g": None, "temp_c": round(random.uniform(21, 26), 1),
        "humidity": round(random.uniform(55, 75), 0),
        "rssi": round(random.uniform(-80, -55), 1),
    })
    # MID: weight shift + bin drop
    t_mid = start + timedelta(seconds=random.randint(8, 25))
    rows.append({
        "cycle": cycle_code, "timestamp": t_mid.isoformat(),
        "flock_id": cycle_code, "bird_id": bird_id, "sensor_id": sensor,
        "age_day": age, "raw_weight_g": round(w + random.gauss(0, 3), 1),
        "weight_g": round(w + 1, 1),
        "feed_bin_kg": round(bin_start - intake / 1000, 3),
        "feed_delta_g": round(intake / 2, 1),
        "temp_c": round(random.uniform(21, 26), 1),
        "humidity": round(random.uniform(55, 75), 0),
        "rssi": round(random.uniform(-80, -55), 1),
    })
    # END: departure
    t_end = t_mid + timedelta(seconds=random.randint(20, 60))
    rows.append({
        "cycle": cycle_code, "timestamp": t_end.isoformat(),
        "flock_id": cycle_code, "bird_id": bird_id, "sensor_id": sensor,
        "age_day": age, "raw_weight_g": None, "weight_g": None,
        "feed_bin_kg": round(bin_start - intake / 1000, 3),
        "feed_delta_g": round(intake / 2, 1),
        "temp_c": None, "humidity": None, "rssi": None,
    })
    return rows


def seed_rest(cycle_id, cycle_code, strain, n_visits):
    import requests
    # cycle start date for age calc
    with SessionLocal() as s:
        c = s.get(Cycle, cycle_id)
        start_date = c.start_date if c else datetime.now(timezone.utc)
    url = f"http://{API_HOST}:{API_PORT}/api/cycles/{cycle_id}/ingest"
    base_t = start_date
    birds = [f"E{1000+i}" for i in range(40)]
    count = 0
    for _ in range(n_visits):
        b = random.choice(birds)
        t0 = base_t + timedelta(minutes=random.randint(0, 28000))
        for row in gen_visit(cycle_id, cycle_code, b, t0, strain, start_date):
            r = requests.post(url, json=row, timeout=5)
            if r.status_code == 200:
                count += 1
    return count


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cycles", nargs="+", default=["F01"])
    ap.add_argument("--visits", type=int, default=200)
    ap.add_argument("--direct", action="store_true",
                    help="use processor directly (no HTTP)")
    args = ap.parse_args()

    init_db()
    total = 0
    for code in args.cycles:
        cid = make_cycle(code, f"Demo Flock {code}", "ross308", 40)
        if args.direct:
            from models import Cycle as _C
            with SessionLocal() as s:
                sd = s.get(_C, cid).start_date
            proc = get_processor(cid)
            base_t = sd
            birds = [f"E{1000+i}" for i in range(40)]
            for _ in range(args.visits):
                b = random.choice(birds)
                t0 = base_t + timedelta(minutes=random.randint(0, 28000))
                for row in gen_visit(cid, code, b, t0, "ross308", sd):
                    proc.ingest(row)
            total += args.visits
        else:
            total += seed_rest(cid, code, "ross308", args.visits)
        print(f"  cycle {code} (id={cid}): {args.visits} visits seeded")
    print(f"done: {total} visits")


if __name__ == "__main__":
    main()
