"""Repro: feed saved upstream rows 1..76 through the REAL sync path,
then dump visits + what recent_registrations would return."""
import json, os, sys
sys.path.insert(0, "backend")
os.environ["BROILER_DATABASE_URL"] = "sqlite:///./repro76.db"
os.environ["BROILER_JWT_SECRET"] = "x" * 32
try:
    os.remove("./repro76.db")
except OSError:
    pass
from models import Base, engine, Cycle, SessionLocal, Visit, DeviceLog
import uktech

rows = json.load(open(r"C:\tmp\up.json"))
rows = sorted(rows, key=lambda r: r["id"])
by_id = {r["id"]: r for r in rows}
# upstream serves newest-first pages; emulate offset paging like real API
uktech.fetch_records = lambda serial, token, limit=100, offset=0, **k: (
    [by_id[i] for i in sorted(by_id, reverse=True)[offset:offset + limit]],
    len(by_id) > offset + limit,
)
Base.metadata.create_all(engine)
with SessionLocal() as s:
    s.add(Cycle(id=1, cycle_code="R76", label="r", strain="ross308",
                bird_count=10))
    s.commit()
guard = 0
while True:
    guard += 1
    r = uktech.sync_serial_to_cycle(1, serial="ESP800", batch=25)
    print("CHUNK", {k: r[k] for k in ("complete", "remaining", "fetched",
                                      "inserted", "last_id") if k in r})
    if not (((r.get("inserted") or 0) > 0) or ((r.get("remaining") or 0) > 0)) or guard > 10:
        break
with SessionLocal() as s:
    vs = s.query(Visit).filter(Visit.cycle_id == 1).order_by(Visit.id).all()
    print(f"VISITS n={len(vs)}")
    for v in vs:
        print(f"  id={v.id} bird={v.bird_id} u={v.unit} init={v.initial_weight_g} "
              f"final={v.final_weight_g} feed={v.feed_intake_g} "
              f"pres={v.presence_s} start={v.visit_start} end={v.visit_end}")
    # what recent_registrations would return (bird NOT NULL filter)
    vis = [v for v in vs if v.bird_id is not None]
    print(f"VISIBLE (bird not null): {len(vis)}")
    starts = s.query(DeviceLog.visit_id, DeviceLog.feed_bin_kg).filter(
        DeviceLog.cycle_id == 1, DeviceLog.is_visit_start.is_(True)).all()
    print("START-LOG bin_kg:", {vid: fb for vid, fb in starts})
