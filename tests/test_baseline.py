"""Regression baseline — boots the FastAPI app against a real local Postgres when available.

Scope: route surface + auth contract + tenant isolation. No mocking of the ORM:
uses the app's real engine; skips cleanly when no DB is reachable so CI without
services still validates imports and route wiring.
"""
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
for p in (str(BACKEND), str(ROOT / "api")):
    if p not in sys.path:
        sys.path.insert(0, p)

# No usable defaults in repo config — point at a scratch DB for the test process.
os.environ.setdefault("BROILER_DATABASE_URL", "postgresql+psycopg://u:p@localhost:9/unit_test")
os.environ.setdefault("BROILER_JWT_SECRET", "test-secret-" + "0" * 24)

from main import app, _db_state  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # runs lifespan (init_db); tolerates DB failure
        yield c


EXPECTED_ROUTES = {
    ("GET", "/"), ("GET", "/api/health"),
    ("POST", "/api/auth/register"), ("POST", "/api/auth/login"),
    ("GET", "/api/auth/me"), ("POST", "/api/auth/change-password"),
    ("GET", "/api/cycles"), ("POST", "/api/cycles"),
    ("DELETE", "/api/cycles/{cycle_id}"), ("GET", "/api/cycles/{cycle_id}/stats"),
    ("GET", "/api/cycles/{cycle_id}/visits"), ("GET", "/api/cycles/{cycle_id}/registrations"),
    ("POST", "/api/cycles/{cycle_id}/ingest"),
    ("WS", "/ws/device"), ("WS", "/ws/cycle/{cycle_id}"),
}


def test_route_surface_unchanged():
    seen = set()
    for r in app.routes:
        methods = getattr(r, "methods", None)
        path = getattr(r, "path", "")
        if methods:
            for m in methods - {"HEAD", "OPTIONS"}:
                seen.add((m, path))
        elif path:
            seen.add(("WS", path))
    missing = EXPECTED_ROUTES - seen
    assert not missing, f"routes vanished: {missing}"


def test_health_contract(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("ok", "degraded")
    assert isinstance(body.get("db"), bool)
    if not body["db"]:
        assert "db_error" in body  # surfaced, never swallowed


def test_auth_and_isolation_contract(client):
    if not _db_state["ok"]:
        pytest.skip("no database reachable in this environment")
    import uuid
    a = f"a-{uuid.uuid4().hex[:8]}@t.local"
    b = f"b-{uuid.uuid4().hex[:8]}@t.local"

    ra = client.post("/api/auth/register", json={"email": a, "password": "secret1"})
    rb = client.post("/api/auth/register", json={"email": b, "password": "secret1"})
    assert ra.status_code == 200 and rb.status_code == 200
    ta, tb = ra.json()["access_token"], rb.json()["access_token"]

    rc = client.post("/api/cycles", headers={"Authorization": f"Bearer {ta}"},
                     json={"cycle_code": "C-" + uuid.uuid4().hex[:6], "label": "c1",
                           "strain": "ross308", "bird_count": 10})
    assert rc.status_code == 200
    cycle_id = rc.json().get("id") or rc.json().get("cycle", {}).get("id")

    # owner sees it
    r = client.get("/api/cycles", headers={"Authorization": f"Bearer {ta}"})
    assert r.status_code == 200 and any(c["id"] == cycle_id for c in _iter(r.json()))
    # other user must NOT see it (404 or empty list — never data)
    r2 = client.get("/api/cycles", headers={"Authorization": f"Bearer {tb}"})
    assert cycle_id not in [c["id"] for c in _iter(r2.json())]
    # anonymous must get 401
    assert client.get("/api/cycles").status_code == 401


def test_missing_endpoints_now_exist(client):
    """Phase-3 contract: /api/scenarios + /api/device/records answered (no silent 404)."""
    assert client.get("/api/scenarios").status_code == 401
    assert client.get("/api/device/records").status_code == 401
    if not _db_state["ok"]:
        pytest.skip("no database reachable in this environment")
    import uuid
    em = f"e-{uuid.uuid4().hex[:8]}@t.local"
    r = client.post("/api/auth/register", json={"email": em, "password": "secret1"})
    tok = r.json()["access_token"]; H = {"Authorization": f"Bearer {tok}"}
    rs = client.get("/api/scenarios", headers=H)
    assert rs.status_code == 200 and rs.json() == []
    rd = client.get("/api/device/records?limit=5", headers=H)
    assert rd.status_code == 200
    body = rd.json()
    assert isinstance(body.get("total"), int) and isinstance(body.get("items"), list)


def _iter(js):
    if isinstance(js, list):
        return js
    return js.get("cycles") or js.get("items") or []
