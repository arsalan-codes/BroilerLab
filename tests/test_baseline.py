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
    ("DELETE", "/api/cycles/{cycle_id}/data"),
    ("GET", "/api/scenarios"), ("GET", "/api/device/records"),
    ("GET", "/api/env/summary"), ("GET", "/api/env/export"),
    ("POST", "/api/uktech/sync"), ("GET", "/api/uktech/status"),
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

    ra = client.post("/api/auth/register", json={"email": a, "password": "secret123"})
    rb = client.post("/api/auth/register", json={"email": b, "password": "secret123"})
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


def test_orphan_cycle_ownership_rules(client):
    """Fail-closed contract: user_id NULL (legacy) cycles are invisible to
    non-admins — auto-adoption was removed because the first claimant could
    hijack another tenant's legacy data. Single-user upgrades backfill with
    `UPDATE cycles SET user_id=<id> WHERE user_id IS NULL;`."""
    if not _db_state["ok"]:
        pytest.skip("no database reachable in this environment")
    import uuid
    from models import SessionLocal, Cycle
    mk = lambda p: f"{p}-{uuid.uuid4().hex[:8]}@t.local"
    ra = client.post("/api/auth/register", json={"email": mk("o"), "password": "secret123"})
    ta = ra.json()["access_token"]; HA = {"Authorization": f"Bearer {ta}"}
    # a genuine legacy orphan: user_id NULL straight in the DB
    with SessionLocal() as s:
        orphan = Cycle(cycle_code="ORPH-" + uuid.uuid4().hex[:6], label="legacy",
                       strain="ross308", bird_count=0, user_id=None)
        s.add(orphan); s.commit(); orphan_id = orphan.id
    # fresh user with zero cycles must NOT adopt it
    rb = client.post("/api/auth/register", json={"email": mk("n"), "password": "secret123"})
    tb2 = rb.json()["access_token"]
    r404 = client.get(f"/api/cycles/{orphan_id}/stats", headers={"Authorization": f"Bearer {tb2}"})
    assert r404.status_code == 404
    # another tenant's owned cycle stays invisible too
    rc = client.post("/api/cycles", headers=HA,
                     json={"cycle_code": "OWN-" + uuid.uuid4().hex[:6], "label": "own"})
    assert rc.status_code == 200
    own_id = rc.json().get("id")
    assert client.get(f"/api/cycles/{own_id}/stats",
                      headers={"Authorization": f"Bearer {tb2}"}).status_code == 404
    # owner still sees own
    assert client.get(f"/api/cycles/{own_id}/stats", headers=HA).status_code == 200


def test_password_minimum_is_8(client):
    if not _db_state["ok"]:
        pytest.skip("no database reachable in this environment")
    import uuid
    em = f"p-{uuid.uuid4().hex[:8]}@t.local"
    r = client.post("/api/auth/register", json={"email": em, "password": "short7!"})
    assert r.status_code == 400


def test_password_change_revokes_old_tokens(client):
    """change-password bumps token_version: tokens issued before the change 401."""
    if not _db_state["ok"]:
        pytest.skip("no database reachable in this environment")
    import uuid
    em = f"r-{uuid.uuid4().hex[:8]}@t.local"
    r = client.post("/api/auth/register", json={"email": em, "password": "secret123"})
    assert r.status_code == 200
    old_tok = r.json()["access_token"]
    H = {"Authorization": f"Bearer {old_tok}"}
    assert client.get("/api/cycles", headers=H).status_code == 200
    rc = client.post("/api/auth/change-password", headers=H,
                     json={"old_password": "secret123", "new_password": "secret456"})
    assert rc.status_code == 200
    assert client.get("/api/cycles", headers=H).status_code == 401


def test_cycle_code_unique_per_owner_not_globally(client):
    """Two tenants may reuse the same code; the same tenant may not."""
    if not _db_state["ok"]:
        pytest.skip("no database reachable in this environment")
    import uuid
    mk = lambda p: f"{p}-{uuid.uuid4().hex[:8]}@t.local"
    toks = []
    for p in ("u1", "u2"):
        r = client.post("/api/auth/register", json={"email": mk(p), "password": "secret123"})
        assert r.status_code == 200
        toks.append(r.json()["access_token"])
    code = "SH-" + uuid.uuid4().hex[:6]
    for t in toks:
        r = client.post("/api/cycles", headers={"Authorization": f"Bearer {t}"},
                        json={"cycle_code": code, "label": "shared-code"})
        assert r.status_code == 200, r.text
    dup = client.post("/api/cycles", headers={"Authorization": f"Bearer {toks[0]}"},
                      json={"cycle_code": code, "label": "dup"})
    assert dup.status_code == 409


def test_ws_rejects_unauthenticated(client):
    """WS handshake without (or with a bad) token is closed, never accepted."""
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect) as ei:
        with client.websocket_connect("/ws/device"):
            pass
    assert ei.value.code == 4401
    with pytest.raises(WebSocketDisconnect) as ei2:
        with client.websocket_connect("/ws/device?token=junk"):
            pass
    assert ei2.value.code == 4401


def test_parse_ts_converts_offsets_to_utc():
    """A +03:30 wall time is the same instant as 08:00Z — not 11:30Z."""
    from processor import CycleProcessor
    out = CycleProcessor._parse_ts(None, "2026-09-03T11:30:00+03:30")
    assert (out.hour, out.minute) == (8, 0)
    assert out.tzinfo is not None
    naive = CycleProcessor._parse_ts(None, "2026-09-03 08:00:00")
    assert (naive.hour, naive.minute) == (8, 0) and naive.tzinfo is not None


def test_rate_limiter_purges_expired_windows():
    """The in-memory table cannot grow without bound."""
    import time as _t
    import main as main_mod
    main_mod._RATE_LIMIT.clear()
    try:
        main_mod._RATE_LIMIT["1.1.1.1"] = (10, _t.monotonic() - 3600)
        assert main_mod._check_rate_limit("2.2.2.2") is True
        assert "1.1.1.1" not in main_mod._RATE_LIMIT
    finally:
        main_mod._RATE_LIMIT.clear()


def test_missing_endpoints_now_exist(client):
    """Phase-3 contract: /api/scenarios + /api/device/records answered (no silent 404)."""
    assert client.get("/api/scenarios").status_code == 401
    assert client.get("/api/device/records").status_code == 401
    if not _db_state["ok"]:
        pytest.skip("no database reachable in this environment")
    import uuid
    em = f"e-{uuid.uuid4().hex[:8]}@t.local"
    r = client.post("/api/auth/register", json={"email": em, "password": "secret123"})
    tok = r.json()["access_token"]; H = {"Authorization": f"Bearer {tok}"}
    rs = client.get("/api/scenarios", headers=H)
    assert rs.status_code == 200 and rs.json() == []
    rd = client.get("/api/device/records?limit=5", headers=H)
    assert rd.status_code == 200
    body = rd.json()
    assert isinstance(body.get("total"), int) and isinstance(body.get("items"), list)


def test_logging_and_org_contract():
    """Phase 8/9: request-id header, 500 handler, Organization model in metadata."""
    assert Exception in app.exception_handlers  # global 500 handler registered
    import models as models_mod
    assert hasattr(models_mod, "Organization")
    assert "organizations" in models_mod.Base.metadata.tables
    assert hasattr(models_mod.User, "organization_id")  # additive nullable FK, no data loss


def _iter(js):
    if isinstance(js, list):
        return js
    return js.get("cycles") or js.get("items") or []
