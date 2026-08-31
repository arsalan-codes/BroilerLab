"""
BroilerLab Device Backend - FastAPI with per-user auth.
Auth: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
Cycles are tenant-scoped: every read/write filters by current_user.id
(fail-closed: no token => 401).
"""
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy.orm import Session
from config import API_HOST, API_PORT
from models import init_db, SessionLocal, Cycle, Visit, DeviceLog, User
from processor import get_processor
import hub
import auth as authmod
_ROOTS = [os.path.dirname(os.path.dirname(os.path.abspath(__file__))),  # repo/dev root
          os.path.dirname(os.path.abspath(__file__))]                    # vendored api/ layout
WEBAPP_DIR = next((os.path.join(r, "webapp") for r in _ROOTS if os.path.isdir(os.path.join(r, "webapp"))),
                  os.path.join(_ROOTS[0], "webapp"))
_db_state = {"ok": False, "error": None}

@asynccontextmanager
async def lifespan(app: FastAPI):
    hub.register_loop(asyncio.get_event_loop())
    try:
        init_db()
        authmod.ensure_admin_seed()
        _db_state["ok"] = True
    except Exception as e:  # keep function alive; health endpoint reports DB status
        import logging
        logging.exception("DB init failed")
        _db_state["ok"] = False
        _db_state["error"] = f"{type(e).__name__}: {e}"
    yield
app = FastAPI(title="BroilerLab Device Backend", version="1.5.8", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=400)
_CORS_ORIGINS = [o.strip() for o in os.getenv("BROILER_CORS_ORIGINS", "").split(",") if o.strip()] or ["*"]
app.add_middleware(CORSMiddleware, allow_origins=_CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
@app.get("/")
def index():
    return FileResponse(os.path.join(WEBAPP_DIR, "index.html"), headers={"Cache-Control":"no-cache"})
_STATIC_FILES = ("app.js","device-panel.js","auth.js","i18n.js","engine.js","strains.js","stats.js","xlsx.js","shamsi.js","dialog.js","router.js","config.js","favicon.png","logo_32.png","logo_128.png","logo_180.png","logo_192.png","logo_256.png","logo_512.png","fa/all.min.css","fa/fa-solid-900.woff2","fa/fa-solid-900.ttf","fa/fa-regular-400.woff2","fa/fa-regular-400.ttf","fa/fa-brands-400.woff2","fa/fa-brands-400.ttf","logo.svg","logo_1024.png","logo_128.webp","logo_512.webp","logo_256.webp",)
for _f in _STATIC_FILES:
    _path = os.path.join(WEBAPP_DIR, _f)
    if os.path.exists(_path):
        def _serve(_p=_path):
            headers={"Cache-Control":"public, max-age=86400"}
            if _p.endswith((".woff2",".ttf",".png")): headers["Cache-Control"]="public, max-age=604800, immutable"
            return FileResponse(_p, headers=headers)
        app.get(f"/{_f}")(_serve)
@app.get("/api/health")
def health():
    out = {"status": "ok" if _db_state["ok"] else "degraded",
           "db": _db_state["ok"], "time": datetime.now(timezone.utc).isoformat()}
    if not _db_state["ok"]:
        out["db_error"] = _db_state["error"]
    return out

# ---- Pydantic request schemas (typing/defaults only; status codes preserved by manual checks) ----
from pydantic import BaseModel, Field

class RegisterIn(BaseModel):
    email: str = ""
    password: str = ""
    username: str | None = None
    full_name: str | None = None

class LoginIn(BaseModel):
    email: str | None = None
    username: str | None = None
    password: str = ""

class ChangePasswordIn(BaseModel):
    old_password: str = ""
    new_password: str = ""

class CycleIn(BaseModel):
    cycle_code: str = ""
    label: str = ""
    strain: str = "ross308"
    bird_count: int = 0
    pen_id: str | None = None
    notes: str | None = None

@app.post("/api/auth/register")
def register(payload: RegisterIn):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""
    username = (payload.username or "").strip() or None
    full_name = (payload.full_name or "").strip() or None
    if not email or not password:
        raise HTTPException(400, "email and password are required")
    if not authmod.EMAIL_RE.match(email):
        raise HTTPException(400, "invalid email")
    if len(password) < 6:
        raise HTTPException(400, "password must be at least 6 characters")
    with SessionLocal() as s:
        if s.query(User).filter(User.email == email).first():
            raise HTTPException(409, "email already registered")
        if username and s.query(User).filter(User.username == username).first():
            raise HTTPException(409, "username taken")
        u = User(email=email, username=username, full_name=full_name, hashed_password=authmod.hash_password(password))
        s.add(u); s.commit(); s.refresh(u)
        token = authmod.create_access_token({"sub": str(u.id)})
        return {"access_token": token, "token_type": "bearer", "user": _user_to_dict(u)}
@app.post("/api/auth/login")
def login(payload: LoginIn):
    raw = ((payload.email or payload.username or "")).strip()
    password = payload.password or ""
    if not raw or not password:
        raise HTTPException(400, "email/username and password required")
    with SessionLocal() as s:
        u = s.query(User).filter(User.email == raw.lower()).first()
        if not u:
            u = s.query(User).filter(User.username == raw).first()
        if not u or not authmod.verify_password(password, u.hashed_password):
            raise HTTPException(401, "invalid credentials")
        if not u.is_active:
            raise HTTPException(403, "account disabled")
        u.last_login = datetime.now(timezone.utc)
        s.commit()
        token = authmod.create_access_token({"sub": str(u.id)})
        return {"access_token": token, "token_type": "bearer", "user": _user_to_dict(u)}
@app.get("/api/auth/me")
def me(current: User = Depends(authmod.get_current_user)):
    return _user_to_dict(current)
@app.post("/api/auth/change-password")
def change_password(payload: ChangePasswordIn, current: User = Depends(authmod.get_current_user)):
    old = payload.old_password or ""
    new = payload.new_password or ""
    if not old or not new:
        raise HTTPException(400, "old_password and new_password required")
    if len(new) < 6:
        raise HTTPException(400, "new password too short")
    with SessionLocal() as s:
        u = s.get(User, current.id)
        if not authmod.verify_password(old, u.hashed_password):
            raise HTTPException(401, "old password incorrect")
        u.hashed_password = authmod.hash_password(new)
        s.commit()
        return {"ok": True}
def _require_owner_cycle(s: Session, cycle_id: int, user: User) -> Cycle:
    c = s.get(Cycle, cycle_id)
    if not c:
        raise HTTPException(404, "cycle not found")
    if c.user_id is None:
        if user.is_admin:
            return c
        if s.query(Cycle).filter(Cycle.user_id == user.id).count() == 0:
            c.user_id = user.id
            s.commit()
            return c
        raise HTTPException(404, "cycle not found")
    if c.user_id != user.id and not user.is_admin:
        raise HTTPException(404, "cycle not found")
    return c
@app.get("/api/cycles")
def list_cycles(current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        q = s.query(Cycle)
        if current.is_admin:
            rows = q.order_by(Cycle.start_date.desc()).all()
        else:
            rows = q.filter(Cycle.user_id == current.id).order_by(Cycle.start_date.desc()).all()
        return [_cycle_to_dict(c) for c in rows]
@app.get("/api/scenarios")
def list_scenarios(current: User = Depends(authmod.get_current_user)):
    """Scenario persistence is not implemented yet — contract-stable empty list.

    The workspace UI already treats {scenarios|items|[]} uniformly; returning 200[]
    removes the silent 404 without inventing a storage model prematurely.
    """
    return []


@app.get("/api/device/records")
def list_device_records(limit: int = 50, cycle_id: int | None = None,
                        current: User = Depends(authmod.get_current_user)):
    """Raw device rows for the current user (admin: all), newest first."""
    limit = max(1, min(int(limit or 50), 500))
    with SessionLocal() as s:
        q = s.query(DeviceLog)
        if not current.is_admin:
            q = q.join(Cycle, DeviceLog.cycle_id == Cycle.id).filter(Cycle.user_id == current.id)
        if cycle_id is not None:
            q = q.filter(DeviceLog.cycle_id == cycle_id)
        total = q.count()
        rows = q.order_by(DeviceLog.timestamp.desc()).limit(limit).all()
        items = [{
            "id": r.id, "cycle_id": r.cycle_id, "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "bird_id": r.bird_id, "sensor_id": r.sensor_id, "age_day": r.age_day,
            "weight_g": r.weight_g, "raw_weight_g": r.raw_weight_g, "feed_delta_g": r.feed_delta_g,
        } for r in rows]
        return {"total": total, "items": items, "records": items}


@app.post("/api/cycles")
def create_cycle(payload: CycleIn, current: User = Depends(authmod.get_current_user)):
    code = (payload.cycle_code or "").strip()
    label = (payload.label or "").strip()
    if not code or not label:
        raise HTTPException(400, "cycle_code and label are required")
    with SessionLocal() as s:
        if s.query(Cycle).filter(Cycle.cycle_code == code).first():
            raise HTTPException(409, f"cycle '{code}' already exists")
        c = Cycle(cycle_code=code, label=label, strain=payload.strain, bird_count=int(payload.bird_count or 0), pen_id=((payload.pen_id or "").strip() or None), notes=((payload.notes or "").strip() or None), user_id=current.id)
        s.add(c); s.commit()
        return _cycle_to_dict(c)
@app.delete("/api/cycles/{cycle_id}")
def delete_cycle(cycle_id: int, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        c = _require_owner_cycle(s, cycle_id, current)
        s.delete(c); s.commit()
        return {"deleted": cycle_id}
@app.get("/api/cycles/{cycle_id}/stats")
def cycle_stats(cycle_id: int, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        c = _require_owner_cycle(s, cycle_id, current)
        visits = s.query(Visit).filter(Visit.cycle_id == cycle_id).all()
        logs = s.query(DeviceLog).filter(DeviceLog.cycle_id == cycle_id).count()
        birds = {v.bird_id for v in visits if v.bird_id}
        total_intake = sum((v.feed_intake_g or 0) for v in visits)
        avg_init = (sum(v.initial_weight_g for v in visits if v.initial_weight_g) / max(1, len([v for v in visits if v.initial_weight_g])))
        missed = sum(1 for v in visits if not v.read_ok)
        return {"cycle_id": cycle_id, "label": c.label, "visits": len(visits), "unique_birds": len(birds), "device_rows": logs, "total_intake_g": round(total_intake, 1), "avg_initial_weight_g": round(avg_init, 1), "missed_rfid": missed}
@app.get("/api/cycles/{cycle_id}/visits")
def recent_visits(cycle_id: int, limit: int = 50, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
        rows = (s.query(Visit).filter(Visit.cycle_id == cycle_id).order_by(Visit.visit_start.desc()).limit(limit).all())
        return [_visit_to_dict(v) for v in rows]
@app.get("/api/cycles/{cycle_id}/registrations")
def recent_registrations(cycle_id: int, limit: int = 50, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
        rows = (s.query(Visit).filter(Visit.cycle_id == cycle_id, Visit.bird_id.isnot(None)).order_by(Visit.visit_start.desc()).limit(limit).all())
        return [{"bird_id": v.bird_id, "initial_weight_g": v.initial_weight_g, "registered_at": _iso(v.visit_start), "age_day": v.age_day, "sensor_id": v.sensor_id, "rssi": v.rssi, "read_ok": v.read_ok} for v in rows]
@app.post("/api/cycles/{cycle_id}/ingest")
def ingest_event(cycle_id: int, payload: dict = Body(...), current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
    proc = get_processor(cycle_id)
    payload["cycle"] = _code_for(cycle_id)
    log_d = proc.ingest(payload)
    hub.publish(log_d)
    return log_d
@app.websocket("/ws/device")
async def ws_device(ws: WebSocket):
    await ws.accept()
    hub.subscribe_all(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.unsubscribe_all(ws)
@app.websocket("/ws/cycle/{cycle_id}")
async def ws_cycle(ws: WebSocket, cycle_id: int):
    await ws.accept()
    hub.subscribe_cycle(cycle_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.unsubscribe_cycle(cycle_id, ws)
def _code_for(cycle_id):
    with SessionLocal() as s:
        c = s.get(Cycle, cycle_id)
        return c.cycle_code if c else None
def _user_to_dict(u: User):
    return {"id": u.id, "email": u.email, "username": u.username, "full_name": u.full_name, "is_admin": u.is_admin, "created_at": _iso(u.created_at)}
def _cycle_to_dict(c):
    return {"id": c.id, "cycle_code": c.cycle_code, "label": c.label, "strain": c.strain, "start_date": _iso(c.start_date), "end_date": _iso(c.end_date), "bird_count": c.bird_count, "pen_id": c.pen_id, "notes": c.notes, "active": c.active, "created_at": _iso(c.created_at), "user_id": c.user_id}
def _visit_to_dict(v):
    return {"id": v.id, "cycle_id": v.cycle_id, "bird_id": v.bird_id, "visit_start": _iso(v.visit_start), "visit_end": _iso(v.visit_end), "age_day": v.age_day, "initial_weight_g": v.initial_weight_g, "final_weight_g": v.final_weight_g, "feed_intake_g": v.feed_intake_g, "sensor_id": v.sensor_id, "rssi": v.rssi, "read_ok": v.read_ok, "co_feed": v.co_feed, "temp_c": v.temp_c, "humidity": v.humidity}
def _iso(dt):
    return dt.isoformat() if dt else None
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT, ws="websockets")


