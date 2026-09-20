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
import os
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
        assert logs[2]["is_visit_end"] is True, logs[2]  # closing row ends, no ghost visit
        assert logs[1]["elapsed_s"] == 11.0, logs[1]
        assert logs[1]["visit_feed_g"] == 40.0, logs[1]  # 0.04kg bin drop -> g
        assert logs[1]["unit"] == 1 and logs[1]["bin_weight_g"] == 16660.0, logs[1]
        regs = c.get(f"/api/cycles/{cid}/registrations", headers=h).json()
        mine = [r for r in regs if r["bird_id"] == "B7" and r["feed_intake_g"] > 0][0]
        assert mine["feed_intake_g"] == 44.0, mine      # 40 bin + 4 closing delta
        assert mine["elapsed_s"] >= 20, mine
        assert mine["sensor_id"] == "S1" and mine["initial_weight_g"] == 642
        assert mine["unit"] == 1, mine  # single-unit HTTP devices are lane 1
        assert mine["bin_weight_g"] == 16620.0, mine  # hopper: LATEST log wins (16.62), not frozen at start
        # id-76 shape: visit opens while hopper reads 0, refill to 345.44g
        # arrives mid-visit — the open row must track it live.
        b8 = [
          {"timestamp": "2026-09-03T09:00:00", "bird_id": "B8", "sensor_id": "S1",
            "age_day": 18, "weight_g": 220.19, "feed_bin_kg": 0.0, "temp_c": 23.9},
          {"timestamp": "2026-09-03T09:00:40", "bird_id": "B8", "sensor_id": "S1",
            "age_day": 18, "weight_g": 220.19, "feed_bin_kg": 0.34544, "temp_c": 23.9},
        ]
        [c.post(f"/api/cycles/{cid}/ingest", headers=h, json=r).json() for r in b8]
        regs2 = c.get(f"/api/cycles/{cid}/registrations", headers=h).json()
        open8 = [r for r in regs2 if r["bird_id"] == "B8"][0]
        assert open8["visit_end"] is None, open8
        assert open8["bin_weight_g"] == 345.44, open8
        assert open8["initial_weight_g"] == 220.19, open8
        # live device endpoints must never serve stale caches
        for _p in ("/api/uktech/status", "/api/uktech/sessions?cycle_id=" + str(cid)):
            _rh = c.get(_p, headers=h).headers.get("cache-control", "")
            assert "no-store" in _rh, _p
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
                  "registered_at", "sensor_id", "bird_id", "initial_weight_g",
                  "presence_s", "unit", "bin_weight_g"):
        assert field in body, f"registrations response missing {field}"
    # no fabricated zeros: NULL measurements must serialize as null so the
    # UI renders "—" instead of a fake 0.00.
    assert "feed_intake_g or 0" not in body, "fake-0 feed serialization"


def test_intake_single_rule_with_unit_fix():
    src = (BACKEND / "processor.py").read_text(encoding="utf-8")
    assert "def _intake_increment(ctx, bin_kg, feed_delta)" in src
    assert src.count("_intake_increment(ctx, bin_kg, feed_delta)") >= 3, \
        "intake rule must be shared by _step, close branch (and definition)"
    assert "drop * 1000" in src, "bin kg->g conversion missing"
    assert '"bin_prev": bin_kg' in src or "'bin_prev': bin_kg" in src, \
        "start rows must seed the bin baseline"


def test_frontend_renders_nine_columns():
    # WHY renamed: the live core adds "Unit" + "Bird Position" columns
    # (inside/outside badge, spec deliverable) to both per-unit tables.
    html = (WEBAPP / "index.html").read_text(encoding="utf-8")
    heads = re.findall(r'<div class="reg-thead">(.*?)</div>', html, re.S)
    assert len(heads) == 2, f"two per-unit tables expected, got {len(heads)}"
    for head in heads:
        cells = re.findall(r"reg-cell--(\w+)", head)
        assert cells == ["feed", "w", "bin", "elapsed", "dt", "tag",
                         "sensor", "unit", "pos"], \
            f"thead must end with unit/position columns, got {cells}"
    assert 'id="reg-body-u1"' in html and 'id="reg-body-u2"' in html, \
        "per-unit table bodies missing"
    assert 'id="cy-source"' in html, "data-source selector missing"
    js = (WEBAPP / "device-panel.js").read_text(encoding="utf-8")
    assert "visit_feed_g" in js and "elapsed_s" in js and "feed_intake_g" in js, \
        "device-panel must render the new live + history fields"
    assert "bin_weight_g" in js, "device-panel must render the hopper column"
    assert "bird_position" in js and "regPosHtml" in js, \
        "device-panel must render the position badge"
    assert "reg-pos ejecting" not in js  # class is built, not hardcoded
    assert "business_state" in js and "eject_in" in js, \
        "device-panel must render the server-authoritative state badge + countdown"
    assert "reg-pos.ejecting" in html or ".reg-pos.ejecting" in html, \
        "ejecting badge style missing"
    assert "tickElapsed" not in js, \
        "elapsed must come from the latest record, never ticked locally"
    assert "cycleSource" in js and "/source" in js, \
        "device-panel must switch API poll vs direct refresh per cycle"


def test_frontend_patches_rows_from_change_analysis():
    js = (WEBAPP / "device-panel.js").read_text(encoding="utf-8")
    assert "function patchRegChanges" in js, \
        "smart patch path missing (sync changes -> in-place row updates)"
    assert "function fillRegRow" in js, \
        "shared row renderer missing (patch + reload must render identically)"
    assert "changes" in js, "auto-poll must consume the sync change analysis"


def test_locales_have_device_headers():
    for loc, feed, elapsed, dt, hop in (("fa.js", "غذای مصرف‌شده", "زمان سپری‌شده", "تاریخ و ساعت", "وزن مخزن"),
                                        ("en.js", "Feed consumed", "Elapsed", "Date & time", "Hopper weight")):
        src = (ROOT / "webapp" / "locales" / loc).read_text(encoding="utf-8")
        for key in ("dev.reg.feed", "dev.reg.elapsed", "dev.reg.datetime", "dev.reg.sec",
                    "dev.reg.bin", "dev.reg.unit", "dev.reg.position",
                    "dev.pos.inside", "dev.pos.outside", "dev.pos.ejecting",
                    "dev.source", "dev.srcApi", "dev.srcDirect",
                    "dev.srcDirectNote", "dev.srcSwitched",
                    "dev.unit1", "dev.unit2",
                    "dev.online", "dev.stale", "dev.offline", "dev.lastFetch"):
            assert key in src, f"{loc} missing {key}"
        assert feed in src and elapsed in src and dt in src and hop in src, f"{loc} header text wrong"


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
    # as_posix: a Windows path with backslashes would break the -c string
    # (\U... unicode escapes) — forward slashes are valid everywhere.
    script = E2E.replace("@BACKEND@", BACKEND.as_posix())
    env = {"BROILER_DATABASE_URL": f"sqlite:///{db.as_posix()}",
           "BROILER_JWT_SECRET": "test-secret-" + "0" * 24,
           # Child stdout must be UTF-8 on Windows: the backend prints
           # em-dashes/degree signs; with the default ANSI code page the
           # parent's UTF-8 decode fails and r.stdout comes back None.
           "PYTHONIOENCODING": "utf-8",
           "PATH": os.environ.get("PATH", ""),
           "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")}
    r = subprocess.run([sys.executable, "-c", script], capture_output=True,
                       text=True, encoding="utf-8", errors="replace",
                       timeout=180, env=env)
    assert r.returncode == 0, f"E2E failed:\n{r.stdout}\n{r.stderr[-2000:]}"
    assert "DEVICE-TABLE E2E OK" in r.stdout
