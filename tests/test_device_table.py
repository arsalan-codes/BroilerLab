"""Device realtime table — six parameters per visit (feed/weight/elapsed/datetime/bird/device).

Covers the 2026-09-03 device-table upgrade:
  - registrations API returns feed_intake_g + elapsed_s (+ visit_end/final_weight_g)
  - intake uses ONE rule for memory ctx and DB (no divergence), bin kg -> g (x1000),
    start rows seed the bin baseline, closing rows credit the ending visit
  - frontend renders the six columns live (WS) and from history (REST)
  - locales carry the new headers in FA + EN
  - migration 003 speeds the registration lookup

Static pins run everywhere; the sqlite E2E runs in a subprocess (isolated
interpreter, no import interference with the postgres-bound test modules)
and skips cleanly when the backend deps are unavailable.
"""
import importlib.util
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
WEBAPP = ROOT / "webapp"

E2E = textwrap.dedent('''
    import sys
    sys.path.insert(0, "@BACKEND@")
    from fastapi.testclient import TestClient
    import main as app_main
    from models import SessionLocal, Visit

    with TestClient(app_main.app) as c:
        assert c.post("/api/auth/register", json={
            "email": "devtable@test.local", "password": "Secret123!_x",
            "username": "devtable"}).status_code in (200, 201)
        tok = c.post("/api/auth/login", json={
            "email": "devtable@test.local", "password": "Secret123!_x"}).json()["access_token"]
        h = {"Authorization": "Bearer " + tok}
        cyc = c.post("/api/cycles", headers=h, json={
            "cycle_code": "TBL", "label": "table", "strain": "ross308",
            "bird_count": 10}).json()
        cid = cyc["id"]
        rows = [
          {"timestamp": "2026-09-03T08:00:00", "bird_id": "B7", "sensor_id": "S1",
            "age_day": 18, "weight_g": 642, "feed_bin_kg": 16.70, "temp_c": 23.9},
          {"timestamp": "2026-09-03T08:00:11", "bird_id": "B7", "sensor_id": "S1",
            "age_day": 18, "weight_g": 641, "feed_bin_kg": 16.66, "temp_c": 23.9},
          {"timestamp": "2026-09-03T08:00:21", "bird_id": "B7", "sensor_id": "S1",
            "age_day": 18, "feed_bin_kg": 16.62, "feed_delta_g": 4.0, "temp_c": 23.9},
        ]
        logs = [c.post(f"/api/cycles/{cid}/ingest", headers=h, json=r).json() for r in rows]
        assert logs[1]["elapsed_s"] == 11.0, logs[1]
        assert logs[1]["visit_feed_g"] == 40.0, logs[1]  # 0.04kg bin drop -> g
        regs = c.get(f"/api/cycles/{cid}/registrations", headers=h).json()
        mine = [r for r in regs if r["bird_id"] == "B7" and r["feed_intake_g"] > 0][0]
        assert mine["feed_intake_g"] == 44.0, mine      # 40 bin + 4 closing delta
        assert mine["elapsed_s"] >= 20, mine
        assert mine["sensor_id"] == "S1" and mine["initial_weight_g"] == 642
        # ownership isolation still holds on the new shape
        assert c.get(f"/api/cycles/{cid}/registrations").status_code == 401
    print("DEVICE-TABLE E2E OK")
''')


def _has_deps():
    return (importlib.util.find_spec("sqlalchemy") is not None
            and importlib.util.find_spec("fastapi") is not None
            and importlib.util.find_spec("jose") is not None)


def test_registrations_returns_six_params():
    src = (BACKEND / "main.py").read_text(encoding="utf-8")
    m = re.search(r"def recent_registrations\(.*?\):(.*?)(?=\n@app|\ndef |\nif __name__)", src, re.S)
    assert m, "recent_registrations not found in backend/main.py"
    body = m.group(1)
    for field in ("feed_intake_g", "elapsed_s", "visit_end", "final_weight_g",
                  "registered_at", "sensor_id", "bird_id", "initial_weight_g"):
        assert field in body, f"registrations response missing {field}"


def test_intake_single_rule_with_unit_fix():
    src = (BACKEND / "processor.py").read_text(encoding="utf-8")
    assert "def _intake_increment(ctx, bin_kg, feed_delta)" in src
    assert src.count("_intake_increment(ctx, bin_kg, feed_delta)") >= 3, \
        "intake rule must be shared by _step, close branch (and definition)"
    assert "drop * 1000" in src, "bin kg->g conversion missing"
    assert '"bin_prev": bin_kg' in src or "'bin_prev': bin_kg" in src, \
        "start rows must seed the bin baseline"


def test_frontend_renders_six_columns():
    html = (WEBAPP / "index.html").read_text(encoding="utf-8")
    m = re.search(r'<div class="reg-thead">(.*?)</div>', html, re.S)
    assert m, "reg-thead not found"
    cells = re.findall(r"reg-cell--(\w+)", m.group(1))
    assert cells == ["feed", "w", "elapsed", "dt", "tag", "sensor"], \
        f"thead must be feed/weight/elapsed/datetime/bird/device, got {cells}"
    js = (WEBAPP / "device-panel.js").read_text(encoding="utf-8")
    assert "visit_feed_g" in js and "elapsed_s" in js and "feed_intake_g" in js, \
        "device-panel must render the new live + history fields"


def test_locales_have_device_headers():
    for loc, feed, elapsed, dt in (("fa.js", "غذای مصرف‌شده", "زمان سپری‌شده", "تاریخ و ساعت"),
                                   ("en.js", "Feed consumed", "Elapsed", "Date & time")):
        src = (ROOT / "webapp" / "locales" / loc).read_text(encoding="utf-8")
        for key in ("dev.reg.feed", "dev.reg.elapsed", "dev.reg.datetime", "dev.reg.sec"):
            assert key in src, f"{loc} missing {key}"
        assert feed in src and elapsed in src and dt in src, f"{loc} header text wrong"


def test_migration_003_chain():
    mig = ROOT / "migrations" / "versions" / "003_visit_reg_lookup.py"
    assert mig.exists(), "003_visit_reg_lookup.py missing"
    src = mig.read_text(encoding="utf-8")
    assert 'down_revision = "002_organization"' in src
    assert "ix_visit_cycle_bird_start" in src


def test_device_table_e2e_sqlite(tmp_path):
    if not _has_deps():
        pytest.skip("backend deps (sqlalchemy/fastapi/jose) unavailable")
    db = tmp_path / "devtable.db"
    script = E2E.replace("@BACKEND@", str(BACKEND))
    env = {"BROILER_DATABASE_URL": f"sqlite:///{db}",
           "BROILER_JWT_SECRET": "test-secret-" + "0" * 24,
           "PATH": "/usr/bin:/bin"}
    r = subprocess.run([sys.executable, "-c", script], capture_output=True,
                       text=True, timeout=180, env=env)
    assert r.returncode == 0, f"E2E failed:\n{r.stdout}\n{r.stderr[-2000:]}"
    assert "DEVICE-TABLE E2E OK" in r.stdout
