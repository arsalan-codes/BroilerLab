"""Direct ESP32 ingestion — device credentials, isolation, idempotency.

Unit pins (no DB): key lifecycle + header extraction + external_id mapping.
E2E (sqlite subprocess, isolated interpreter like test_device_table.py):
  create/list/detail/status/rotate (JWT) + ingest/batch (X-Device-Key) +
  auth, timestamp, isolation, idempotency, rotation, cycle-delete, rate
  limit and health behaviors from the task contract.
"""
import importlib.util
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
for p in (str(BACKEND),):
    if p not in sys.path:
        sys.path.insert(0, p)

import device_auth as devauth  # noqa: E402  (stdlib-only, no backend deps)


def _has_deps():
    return (importlib.util.find_spec("sqlalchemy") is not None
            and importlib.util.find_spec("fastapi") is not None
            and importlib.util.find_spec("jose") is not None)


# ---------------- unit pins: credential mechanics ----------------

def test_key_generation_unique_and_prefixed():
    keys = {devauth.generate_api_key() for _ in range(100)}
    assert len(keys) == 100
    assert all(k.startswith("BLD_") and len(k) > 20 for k in keys)


def test_hash_verify_roundtrip():
    raw = devauth.generate_api_key()
    h = devauth.hash_api_key(raw)
    assert devauth.verify_api_key(raw, h) is True
    assert devauth.verify_api_key(raw + "x", h) is False
    assert devauth.verify_api_key("", h) is False
    assert len(h) == 64  # sha256 hex, fixed width column


def test_key_prefix_lookup_shard():
    raw = devauth.generate_api_key()
    assert devauth.key_prefix_of(raw) == raw[:12]
    assert len(devauth.key_prefix_of(raw)) == 12


def test_header_extraction():
    assert devauth.extract_device_key({"x-device-key": "BLD_abc"}) == "BLD_abc"
    assert devauth.extract_device_key(
        {"authorization": "Bearer BLD_abc"}) == "BLD_abc"
    assert devauth.extract_device_key({}) is None
    # human JWTs (never BLD_-prefixed) must not enter the device path
    assert devauth.extract_device_key(
        {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.x.y"}) is None


def test_external_id_mapping():
    a = devauth.external_id_for("esp32-a", "ev1")
    assert a == devauth.external_id_for("esp32-a", "ev1")  # deterministic
    assert a.startswith("dev:") and len(a) <= 64
    assert a != devauth.external_id_for("esp32-a", "ev2")
    assert a != devauth.external_id_for("esp32-b", "ev1")
    assert "ESP800" not in a  # cannot collide with uktech "<serial>:<id>" rows


def test_id_shapes():
    assert devauth.valid_device_id("esp32-feedstation-01")
    assert not devauth.valid_device_id("")
    assert not devauth.valid_device_id("x" * 65)
    assert not devauth.valid_device_id("has space")
    assert devauth.valid_event_id("esp32-feedstation-01:8F21A4:10492")
    assert not devauth.valid_event_id("bad event!")
    assert not devauth.valid_event_id("")


# ---------------- E2E: full contract over HTTP ----------------

E2E = textwrap.dedent('''
    import sys
    sys.path.insert(0, "@BACKEND@")
    from datetime import datetime, timezone
    from fastapi.testclient import TestClient
    import main as app_main
    from models import Base, engine, SessionLocal, Device, DeviceLog
    # No TestClient context manager here (lifespan/startup never runs), so
    # create the schema explicitly like a fresh dev boot would.
    Base.metadata.create_all(engine)

    NOW = datetime.now(timezone.utc).isoformat()
    c = TestClient(app_main.app)

    def register(email):
        r = c.post("/api/auth/register", json={"email": email, "password": "Secret123!_x"})
        assert r.status_code in (200, 201), r.text
        tok = r.json()["access_token"]
        return {"Authorization": "Bearer " + tok}

    ha = register("deva@test.local")
    hb = register("devb@test.local")
    ca = c.post("/api/cycles", headers=ha, json={"cycle_code": "DA", "label": "a", "strain": "ross308"}).json()["id"]
    cb = c.post("/api/cycles", headers=hb, json={"cycle_code": "DB", "label": "b", "strain": "ross308"}).json()["id"]

    # source selector: default api, exactly one active (409 both ways)
    assert c.get(f"/api/cycles/{ca}/source", headers=ha).json() == {"cycle_id": ca, "source": "api"}
    assert c.patch(f"/api/cycles/{ca}/source", headers=ha, json={"source": "bogus"}).status_code == 400
    assert c.patch(f"/api/cycles/{ca}/source", headers=hb, json={"source": "direct"}).status_code == 404
    r = c.patch(f"/api/cycles/{ca}/source", headers=ha, json={"source": "direct"})
    assert r.json() == {"cycle_id": ca, "source": "direct"}, r.text
    r = c.post("/api/uktech/sync", headers=ha, json={"cycle_id": ca})
    assert r.status_code == 409, r.text  # API polling disabled on direct
    dvb = c.post("/api/devices", headers=hb, json={"device_id": "esp32-b", "cycle_id": cb}).json()

    # create: raw key once, never the hash
    dv = c.post("/api/devices", headers=ha, json={"device_id": "esp32-a", "name": "A", "cycle_id": ca}).json()
    assert dv["device_id"] == "esp32-a" and dv["cycle_id"] == ca, dv
    assert dv["api_key"].startswith("BLD_"), dv
    assert "api_key_hash" not in dv
    key = dv["api_key"]
    # cross-tenant attach rejected (fail-closed 404, no existence leak)
    r = c.post("/api/devices", headers=ha, json={"device_id": "esp32-x", "cycle_id": cb})
    assert r.status_code == 404, r.text
    assert c.post("/api/devices", headers=ha, json={"device_id": "bad id!", "cycle_id": ca}).status_code == 400
    assert c.post("/api/devices", headers=ha, json={"device_id": "esp32-a", "cycle_id": ca}).status_code == 409
    dh = {"X-Device-Key": key}

    def ev(eid, **kw):
        d = {"event_id": eid, "timestamp": NOW, "event": "entry",
             "bird_id": "RFID-001", "weight_g": 1820.4, "feed_bin_kg": 22.4,
             "temp_c": 24.5, "humidity": 58.0, "firmware": "1.2.3"}
        d.update(kw)
        return d

    # ingest: exact success contract, processor pipeline intact
    r1 = c.post("/api/device/ingest", headers=dh, json=ev("e1"))
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"success": True, "accepted": True, "event_id": "e1",
                         "device_id": "esp32-a", "cycle_id": ca}, r1.json()
    regs = c.get(f"/api/cycles/{ca}/registrations", headers=ha).json()
    assert any(r["bird_id"] == "RFID-001" for r in regs), regs
    stats = c.get(f"/api/cycles/{ca}/stats", headers=ha).json()
    assert stats["visits"] >= 1, stats
    with SessionLocal() as s:
        n1 = s.query(DeviceLog).filter(DeviceLog.cycle_id == ca).count()
    assert n1 >= 1

    # idempotency: retry -> duplicate:true, zero new rows
    r2 = c.post("/api/device/ingest", headers=dh, json=ev("e1"))
    assert r2.status_code == 200 and r2.json() == {
        "success": True, "accepted": False, "duplicate": True, "event_id": "e1"}, r2.json()
    with SessionLocal() as s:
        n2 = s.query(DeviceLog).filter(DeviceLog.cycle_id == ca).count()
    assert n2 == n1, (n1, n2)

    # auth matrix
    assert c.post("/api/device/ingest", json=ev("e2")).status_code == 401
    bad = c.post("/api/device/ingest", headers={"X-Device-Key": "BLD_nope"}, json=ev("e2"))
    assert bad.status_code == 401 and bad.json()["error"] == "invalid_device_credentials", bad.json()

    # payload matrix -> 400 with embedded shape
    def must400(payload, code=None):
        r = c.post("/api/device/ingest", headers=dh, json=payload)
        assert r.status_code == 400, (payload, r.status_code, r.text)
        assert r.json()["success"] is False, r.json()
        if code:
            assert r.json()["error"] == code, r.json()
    must400(ev("e3", timestamp="2026-09-19 12:00:00"), "invalid_timestamp")  # naive
    must400(ev("e3", timestamp="someday"), "invalid_timestamp")              # malformed
    must400(ev("e3", timestamp="1999-01-01T00:00:00Z"), "invalid_timestamp") # ancient
    must400(ev("e3", timestamp="2999-01-01T00:00:00Z"), "invalid_timestamp") # far future
    d = ev("e3"); d.pop("event_id"); must400(d, "missing_event_id")
    must400(ev("bad event!"), "invalid_event_id")
    must400(ev("e3", cycle_id=cb), "device_cycle_forbidden")  # tenant escape
    must400(ev("e3", user_id=999), "device_cycle_forbidden")
    # device pushes on an api-source cycle are rejected (switch to direct)
    rb = c.post("/api/device/ingest", headers={"X-Device-Key": dvb["api_key"]}, json=ev("cb1"))
    assert rb.status_code == 409 and rb.json()["error"] == "device_source_inactive", rb.text
    raw_h = dict(dh); raw_h["Content-Type"] = "application/json"
    r = c.post("/api/device/ingest", headers=raw_h, content=b"not json")
    assert r.status_code == 400 and r.json()["success"] is False, (r.status_code, r.text)

    # isolation: B sees only its own device, touches nothing of A's
    blist = c.get("/api/devices", headers=hb).json()
    assert [d["device_id"] for d in blist] == ["esp32-b"], blist
    assert c.get("/api/devices/esp32-a", headers=hb).status_code == 404
    assert c.patch("/api/devices/esp32-a/status", headers=hb, json={"active": False}).status_code == 404
    assert c.post("/api/devices/esp32-a/rotate-key", headers=hb).status_code == 404

    # management shapes: health + no key material, ever
    mine = c.get("/api/devices", headers=ha).json()
    assert len(mine) == 1 and mine[0]["device_id"] == "esp32-a", mine
    assert mine[0]["online"] is True and mine[0]["firmware"] == "1.2.3", mine
    assert mine[0]["last_seen_at"] and mine[0]["last_ip"], mine
    assert "api_key" not in mine[0] and "api_key_hash" not in mine[0]
    det = c.get("/api/devices/esp32-a", headers=ha).json()
    assert "api_key" not in det and "api_key_hash" not in det, det

    # batch: accepted + duplicate + failed in one call
    b = c.post("/api/device/ingest/batch", headers=dh, json={"events": [
        ev("m1"), ev("m1"), ev("m2", timestamp="junk")]})
    assert b.status_code == 200, b.text
    bj = b.json()
    assert (bj["accepted_count"], bj["duplicate_count"], bj["failed_count"]) == (1, 1, 1), bj
    assert bj["results"][0] == {"event_id": "m1", "accepted": True}, bj
    assert bj["results"][1]["duplicate"] is True, bj
    assert bj["results"][2]["error"] == "invalid_timestamp", bj
    big = c.post("/api/device/ingest/batch", headers=dh,
                 json={"events": [ev(f"z{i}") for i in range(51)]})
    assert big.status_code == 400 and big.json()["error"] == "batch_too_large", big.text

    # disable -> 403 immediately, re-enable recovers
    c.patch("/api/devices/esp32-a/status", headers=ha, json={"active": False})
    r = c.post("/api/device/ingest", headers=dh, json=ev("e9"))
    assert r.status_code == 403 and r.json()["error"] == "device_disabled", (r.status_code, r.text)
    c.patch("/api/devices/esp32-a/status", headers=ha, json={"active": True})

    # rotation: old key dies at once, new key works
    rk = c.post("/api/devices/esp32-a/rotate-key", headers=ha).json()
    assert rk["api_key"].startswith("BLD_") and rk["api_key"] != key
    assert c.post("/api/device/ingest", headers=dh, json=ev("e10")).status_code == 401
    dh2 = {"X-Device-Key": rk["api_key"]}
    assert c.post("/api/device/ingest", headers=dh2, json=ev("e10")).status_code == 200

    # rate limit (DEVICE_INGEST_RATE_LIMIT=5 in this process): fresh device
    rl = c.post("/api/devices", headers=ha, json={"device_id": "esp32-rl", "cycle_id": ca}).json()
    rh = {"X-Device-Key": rl["api_key"]}
    codes = [c.post("/api/device/ingest", headers=rh, json=ev(f"rl{i}")).status_code for i in range(7)]
    assert codes[:5] == [200] * 5, codes
    assert codes[5] == 429, codes
    r = c.post("/api/device/ingest", headers=rh, json=ev("rl99"))
    assert r.status_code == 429 and r.json()["error"] == "rate_limited", (r.status_code, r.text)

    # cycle deletion orphans nothing: device row gone, key dead
    assert c.delete(f"/api/cycles/{ca}", headers=ha).status_code in (200, 204)
    assert c.get("/api/devices/esp32-a", headers=ha).status_code == 404
    assert c.post("/api/device/ingest", headers=dh2, json=ev("e11")).status_code == 401
    with SessionLocal() as s:
        assert s.query(Device).filter(Device.device_id == "esp32-a").count() == 0
    print("ESP32-DEVICE E2E OK")
''')


def test_migration_012_chain():
    src = (ROOT / "migrations" / "versions" / "012_devices.py").read_text(encoding="utf-8")
    assert 'down_revision = "011_session_last_seen"' in src
    assert 'revision = "012_devices"' in src
    assert "create_table" in src and '"devices"' in src
    assert "uq_devices_device_id" in src and "uq_devices_key_hash" in src
    assert "ix_devices_key_prefix" in src and "ix_devices_cycle_id" in src
    assert "ondelete=\"CASCADE\"" in src or "ondelete='CASCADE'" in src


def test_esp32_device_e2e_sqlite(tmp_path):
    if not _has_deps():
        pytest.skip("backend deps (sqlalchemy/fastapi/jose) unavailable")
    db = tmp_path / "esp32dev.db"
    # as_posix: a Windows path with backslashes would break the -c string
    # (\U... unicode escapes) — forward slashes are valid everywhere.
    script = E2E.replace("@BACKEND@", BACKEND.as_posix())
    env = {"BROILER_DATABASE_URL": f"sqlite:///{db.as_posix()}",
           "BROILER_JWT_SECRET": "test-secret-" + "0" * 24,
           "DEVICE_INGEST_RATE_LIMIT": "5",
           # Same Windows encoding fix as test_device_table.py.
           "PYTHONIOENCODING": "utf-8",
           "PATH": os.environ.get("PATH", ""),
           "SYSTEMROOT": os.environ.get("SYSTEMROOT", "")}
    r = subprocess.run([sys.executable, "-c", script], capture_output=True,
                       text=True, encoding="utf-8", errors="replace",
                       timeout=180, env=env)
    assert r.returncode == 0, f"E2E failed:\n{r.stdout}\n{r.stderr[-3000:]}"
    assert "ESP32-DEVICE E2E OK" in r.stdout
