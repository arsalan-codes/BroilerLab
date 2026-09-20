"""Rebuild tool: dry-run diff + idempotent apply (sqlite subprocess)."""
import importlib.util
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def _has_deps():
    return (importlib.util.find_spec("sqlalchemy") is not None
            and importlib.util.find_spec("fastapi") is not None)


RB = textwrap.dedent('''
    import sys
    sys.path.insert(0, "@BACKEND@")
    from models import Base, engine, Cycle, SessionLocal, Visit
    import uktech
    from rebuild import rebuild_cycle
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        s.add(Cycle(id=1, cycle_code="RB", label="r", strain="ross308",
                    bird_count=1))
        s.commit()
    REC = {"device_id": "ESP32-S3-001", "rfid1": "B1", "rfid2": "",
           "weight_1": 340.0, "weight_3": 0, "weight_4": 0,
           "status1": "VALID", "status2": "INVALID", "device_status": "online",
           "total_seconds": 0}
    seq = [(1, 220.0, "2026-09-19 10:00:00"), (2, 220.5, "2026-09-19 10:00:10"),
           (3, 0, "2026-09-19 10:00:20"), (4, 0, "2026-09-19 10:00:30")]
    uktech.fetch_records = lambda *a, **k: (
        [dict(REC, id=i, weight_2=w, total_weight=340.0 + w, created_at=t)
         for i, w, t in seq], False)
    r = uktech.sync_serial_to_cycle(1, serial="ESP800", batch=50)
    assert r["inserted"] == 8, r
    assert rebuild_cycle(1, dry_run=True, verbose=True) == 0
    assert rebuild_cycle(1, dry_run=True, verbose=False) == 0
    assert rebuild_cycle(1, dry_run=False, verbose=True) == 0
    with SessionLocal() as s:
        assert s.query(Visit).filter(Visit.cycle_id == 1).count() == 1
    assert rebuild_cycle(1, dry_run=True, verbose=False) == 0
    print("REBUILD-TOOL OK")
''')


def test_rebuild_dry_run_and_apply(tmp_path):
    if not _has_deps():
        pytest.skip("backend deps (sqlalchemy/fastapi) unavailable")
    db = tmp_path / "rebuild.db"
    script = RB.replace("@BACKEND@", BACKEND.as_posix())
    env = {"BROILER_DATABASE_URL": f"sqlite:///{db.as_posix()}",
           "BROILER_JWT_SECRET": "test-secret-" + "0" * 24,
           "PYTHONIOENCODING": "utf-8",
           "PATH": os.environ.get("PATH", ""),
           "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")}
    r = subprocess.run([sys.executable, "-c", script], capture_output=True,
                       text=True, encoding="utf-8", errors="replace",
                       timeout=180, env=env)
    assert r.returncode == 0, f"E2E failed:\n{r.stdout}\n{r.stderr[-3000:]}"
    assert "before=1 after=1" in r.stdout, r.stdout
    assert "applied" in r.stdout, r.stdout
    assert "REBUILD-TOOL OK" in r.stdout
