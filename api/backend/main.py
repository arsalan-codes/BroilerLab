"""
BroilerLab Device Backend - FastAPI with per-user auth.
Auth: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
Cycles are tenant-scoped: every read/write filters by current_user.id
(fail-closed: no token => 401).
"""
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Body, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from config import (
    API_HOST, API_PORT, JWT_SECRET_EXPLICIT,
    DEVICE_INGEST_RATE_LIMIT, DEVICE_INGEST_RATE_WINDOW,
    DEVICE_ONLINE_SECONDS, DEVICE_MAX_CLOCK_SKEW_S, DEVICE_MAX_BATCH,
    DEVICE_KEY_PREFIX,
)
from models import (init_db, SessionLocal, Cycle, Visit, DeviceLog, User,
                    EnvSample, Device, UnitState, SyncState)
from processor import get_processor, _log_to_dict
import unit_core as _unitcore
import hub
import auth as authmod
import device_auth as devauth
from logging_config import setup_logging, get_logger, redact, new_request_id
_ROOTS = [os.path.dirname(os.path.dirname(os.path.abspath(__file__))),  # repo/dev root
          os.path.dirname(os.path.abspath(__file__))]                    # vendored api/ layout
def _resolve_webapp_dir() -> str:
    """webapp/ subdir (dev) or flat layout (Vercel includeFiles copies assets
    next to index.py). Fall back to the first root that actually has index.html."""
    for r in _ROOTS:
        w = os.path.join(r, "webapp")
        if os.path.isdir(w) and os.path.isfile(os.path.join(w, "index.html")):
            return w
    for r in _ROOTS:
        if os.path.isfile(os.path.join(r, "index.html")):
            return r
    return os.path.join(_ROOTS[0], "webapp")
WEBAPP_DIR = _resolve_webapp_dir()
_db_state = {"ok": False, "error": None}

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    # Fail fast on missing JWT secret where it matters: production (Vercel or
    # BROILER_REQUIRE_JWT_SECRET=1) refuses to boot with an ephemeral dev key,
    # because every restart would silently invalidate all sessions.
    _log = get_logger(__name__)
    _strict_jwt = (os.getenv("BROILER_REQUIRE_JWT_SECRET", "") == "1") or bool(os.getenv("VERCEL"))
    if not JWT_SECRET_EXPLICIT:
        if _strict_jwt:
            raise RuntimeError("Missing BROILER_JWT_SECRET — refusing to boot with an ephemeral dev key")
        _log.warning("Missing env BROILER_JWT_SECRET (JWT signing key) — using local dev-only fallback")
    hub.register_loop(asyncio.get_running_loop())
    _uk_task = _maybe_start_uktech_poll()
    try:
        init_db()
        authmod.ensure_admin_seed()
        _db_state["ok"] = True
    except Exception as e:  # keep function alive; health endpoint reports DB status
        get_logger(__name__).exception("DB init failed")
        _db_state["ok"] = False
        _db_state["error"] = f"{type(e).__name__}: {e}"
    yield
    if _uk_task is not None:
        _uk_task.cancel()
app = FastAPI(title="BroilerLab Device Backend", version="1.8.58", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=400)


def _maybe_start_uktech_poll():
    """Local-dev auto poll of the online weight API (opt-in).

    Gated by UKTECH_AUTO_POLL=true + token + UKTECH_CYCLE_ID. Always off on
    Vercel/serverless (env simply not set there): Online sync there happens
    via POST /api/uktech/sync (UI button or cron).
    """
    from config import (UKTECH_AUTO_POLL, UKTECH_CYCLE_ID, UKTECH_POLL_SECONDS,
                        UKTECH_SERIAL, UKTECH_TOKEN)
    if not (UKTECH_AUTO_POLL and UKTECH_TOKEN and UKTECH_CYCLE_ID):
        return None

    async def _loop():
        import uktech as _uk
        log = get_logger(__name__)
        log.info("uktech auto-poll on: serial=%s cycle=%s every=%ss",
                 UKTECH_SERIAL, UKTECH_CYCLE_ID, UKTECH_POLL_SECONDS)
        while True:
            await asyncio.sleep(UKTECH_POLL_SECONDS)
            try:
                res = await asyncio.to_thread(
                    _uk.sync_serial_to_cycle, UKTECH_CYCLE_ID, UKTECH_SERIAL)
                log.info("uktech auto-poll: +%s rows (last_id=%s)",
                         res.get("inserted"), res.get("last_id"))
            except asyncio.CancelledError:
                break
            except Exception as e:  # never kill the server on a sync failure
                log.warning("uktech auto-poll failed: %s: %s", type(e).__name__, e)

    return asyncio.create_task(_loop())


# Simple in-memory rate limiter for auth endpoints (no external deps, works for single-process)
import time as _rtime
_RATE_LIMIT = {}  # ip -> (count, window_start)


def _check_rate_limit(ip: str, max_requests: int = 10, window_s: int = 60) -> bool:
    # NOTE: per-process only — each serverless invocation / worker has its own
    # table, so this is a best-effort brake, not a global guarantee.
    now = _rtime.monotonic()
    # purge expired windows so the table cannot grow without bound (DoS-safe)
    for _ip, (_cnt, _start) in list(_RATE_LIMIT.items()):
        if now - _start > window_s:
            del _RATE_LIMIT[_ip]
    if len(_RATE_LIMIT) > 10000:  # hard cap: evict oldest windows first
        for _ip, (_cnt, _start) in sorted(_RATE_LIMIT.items(), key=lambda kv: kv[1][1])[:1000]:
            del _RATE_LIMIT[_ip]
    entry = _RATE_LIMIT.get(ip)
    if entry is None or now - entry[1] > window_s:
        _RATE_LIMIT[ip] = (1, now)
        return True
    if entry[0] >= max_requests:
        return False
    _RATE_LIMIT[ip] = (entry[0] + 1, entry[1])
    return True


@app.middleware("http")
async def _security_headers(request, call_next):
    # Rate-limit auth endpoints (per IP, 10 req/min)
    _RL_PATHS = ("/api/auth/login", "/api/auth/register", "/api/auth/change-password")
    if request.url.path in _RL_PATHS or request.url.path.startswith("/api/auth/login") or request.url.path.startswith("/api/auth/register") or request.url.path.startswith("/api/auth/change-password"):
        client_ip = request.client.host if request.client else "unknown"
        if not _check_rate_limit(client_ip):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=429, content={"detail": "Too many requests", "code": "rate_limited"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.middleware("http")
async def _log_requests(request, call_next):
    import time as _time
    rid = new_request_id()
    t0 = _time.monotonic()
    response = await call_next(request)
    dt = int((_time.monotonic() - t0) * 1000)
    get_logger("http").info(
        "%s %s %s %sms",
        request.method, request.url.path, response.status_code, dt,
        extra={"request_id": rid, "method": request.method, "path": str(request.url.path),
               "status": response.status_code, "duration_ms": dt},
    )
    response.headers["X-Request-Id"] = rid
    return response
_CORS_ORIGINS = [o.strip() for o in os.getenv("BROILER_CORS_ORIGINS", "").split(",") if o.strip()] or ["*"]
@app.exception_handler(Exception)
async def _global_exception_handler(request, exc):
    get_logger(__name__).exception("Unhandled exception: %s %s", request.method, request.url.path)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "code": "internal_error"})


app.add_middleware(CORSMiddleware, allow_origins=_CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
@app.get("/")
def index():
    return FileResponse(os.path.join(WEBAPP_DIR, "index.html"), headers={"Cache-Control":"no-cache"})
_STATIC_FILES = ("app.js","device-panel.js","auth.js","i18n.js","engine.js","strains.js","stats.js","xlsx.js","shamsi.js","dialog.js","router.js","config.js","version.js","favicon.png","logo_32.png","logo_128.png","logo_180.png","logo_192.png","logo_256.png","logo_512.png","fa/all.min.css","fa/fa-solid-900.woff2","fa/fa-solid-900.ttf","fa/fa-regular-400.woff2","fa/fa-regular-400.ttf","fa/fa-brands-400.woff2","fa/fa-brands-400.ttf","logo.svg","logo_1024.png","logo_128.webp","logo_512.webp","logo_256.webp","locales/fa.js","locales/en.js","env-control.js",)
for _f in _STATIC_FILES:
    _path = os.path.join(WEBAPP_DIR, _f)
    if os.path.exists(_path):
        def _serve(_p=_path):
            headers={"Cache-Control":"public, max-age=86400"}
            if _p.endswith((".woff2",".ttf",".png")): headers["Cache-Control"]="public, max-age=604800, immutable"
            # Explicit charset: some clients must not guess. Starlette only
            # appends charset for text/*, so application/javascript (+json/svg)
            # would otherwise go out with no declared encoding.
            import mimetypes as _mt
            _ct, _ = _mt.guess_type(_p)
            if _ct and (_ct.startswith("text/") or _ct in ("application/javascript", "application/json", "image/svg+xml")):
                headers["Content-Type"] = _ct + "; charset=utf-8"
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


class UktechSyncIn(BaseModel):
    """Pull online device rows into one owned cycle.

    serial overrides the UKTECH_SERIAL env default. Sync is chunked: each
    call writes at most `batch` rows (default UKTECH_SYNC_BATCH=60) and the
    client repeats until `complete` is true. The API token always comes from
    server env — never from the client.
    """
    cycle_id: int = 0
    serial: str | None = None
    limit: int | None = None
    batch: int | None = None

class IngestIn(BaseModel):
    """Device ingest payload — permissive on purpose: firmware may add fields.

    extra='allow' preserves the current dict passthrough behavior while giving
    OpenAPI typed documentation for the 12-col schema fields.
    """
    model_config = {"extra": "allow"}
    timestamp: str | None = None
    kind: str | None = None
    event: str | None = None
    bird_id: str | None = None
    sensor_id: str | None = None
    flock_id: str | None = None
    age_day: int | None = None
    raw_weight_g: float | None = None
    weight_g: float | None = None
    feed_bin_kg: float | None = None
    feed_delta_g: float | None = None
    temp_c: float | None = None
    humidity: float | None = None
    rssi: float | None = None


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
    if len(password) < 8:
        raise HTTPException(400, "password must be at least 8 characters")
    with SessionLocal() as s:
        if s.query(User).filter(User.email == email).first():
            raise HTTPException(409, "email already registered")
        if username and s.query(User).filter(User.username == username).first():
            raise HTTPException(409, "username taken")
        u = User(email=email, username=username, full_name=full_name, hashed_password=authmod.hash_password(password))
        s.add(u)
        try:
            s.commit()
        except IntegrityError:
            s.rollback()
            raise HTTPException(409, "email already registered")
        s.refresh(u)
        token = authmod.create_access_token({"sub": str(u.id), "tv": u.token_version or 0})
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
        token = authmod.create_access_token({"sub": str(u.id), "tv": u.token_version or 0})
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
    if len(new) < 8:
        raise HTTPException(400, "new password must be at least 8 characters")
    with SessionLocal() as s:
        u = s.get(User, current.id)
        if not authmod.verify_password(old, u.hashed_password):
            raise HTTPException(401, "old password incorrect")
        u.hashed_password = authmod.hash_password(new)
        # invalidate every outstanding token (they carry the old tv)
        u.token_version = (u.token_version or 0) + 1
        s.commit()
        return {"ok": True}
def _require_owner_cycle(s: Session, cycle_id: int, user: User) -> Cycle:
    """Fail-closed ownership: legacy user_id NULL cycles are visible to admins
    only — they are never auto-adopted (first-claimer-wins let any fresh
    account hijack another tenant's legacy data). Single-user upgrades: run
    `UPDATE cycles SET user_id=<id> WHERE user_id IS NULL;` once."""
    c = s.get(Cycle, cycle_id)
    if not c:
        raise HTTPException(404, "cycle not found")
    if c.user_id is None:
        if user.is_admin:
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
        # uniqueness is per-owner (uq_cycle_user_code): never probe or squat
        # another tenant's codes — duplicates inside your own account get 409.
        if s.query(Cycle).filter(Cycle.cycle_code == code, Cycle.user_id == current.id).first():
            raise HTTPException(409, f"cycle '{code}' already exists")
        c = Cycle(cycle_code=code, label=label, strain=payload.strain, bird_count=int(payload.bird_count or 0), pen_id=((payload.pen_id or "").strip() or None), notes=((payload.notes or "").strip() or None), user_id=current.id)
        s.add(c)
        try:
            s.commit()
        except IntegrityError:
            s.rollback()
            raise HTTPException(409, f"cycle '{code}' already exists")
        return _cycle_to_dict(c)
@app.delete("/api/cycles/{cycle_id}")
def delete_cycle(cycle_id: int, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        c = _require_owner_cycle(s, cycle_id, current)
        s.delete(c); s.commit()
        return {"deleted": cycle_id}
@app.delete("/api/cycles/{cycle_id}/data")
def reset_cycle_data(cycle_id: int, current: User = Depends(authmod.get_current_user)):
    """Clear ONE cycle's device data (visits + device logs) but keep the cycle.

    Fail-closed like every other cycle route: auth required, non-owners get
    404 via _require_owner_cycle (never leaks existence across tenants).
    """
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
        v = s.query(Visit).filter(Visit.cycle_id == cycle_id).delete(synchronize_session=False)
        l = s.query(DeviceLog).filter(DeviceLog.cycle_id == cycle_id).delete(synchronize_session=False)
        # live-core state + sync cursors reference the deleted data: without
        # this cleanup the next ingest resurrects a phantom lane and the
        # sync reports STALLED forever (cursor points past the wiped table).
        u = s.query(UnitState).filter(
            UnitState.cycle_id == cycle_id).delete(synchronize_session=False)
        cursors = s.query(SyncState).filter(
            SyncState.key.like(f"uktech:%:cycle:{cycle_id}")).all()
        for cur in cursors:
            cur.last_id = 0
            cur.updated_at = datetime.now(timezone.utc)
            cur.note = f"cycle {cycle_id}: data reset"
        s.commit()
        return {"cycle_id": cycle_id, "visits_deleted": v,
                "logs_deleted": l, "unit_states_deleted": u,
                "cursors_reset": len(cursors)}
@app.get("/api/cycles/{cycle_id}/stats")
def cycle_stats(cycle_id: int, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        c = _require_owner_cycle(s, cycle_id, current)
        # aggregate in the DB: never materialize the whole visit history
        vf = Visit.cycle_id == cycle_id
        visits_n = s.query(func.count(Visit.id)).filter(vf).scalar() or 0
        birds_n = s.query(func.count(func.distinct(Visit.bird_id))).filter(vf, Visit.bird_id.isnot(None)).scalar() or 0
        logs = s.query(func.count(DeviceLog.id)).filter(DeviceLog.cycle_id == cycle_id).scalar() or 0
        total_intake = s.query(func.coalesce(func.sum(Visit.feed_intake_g), 0)).filter(vf).scalar() or 0
        avg_init = s.query(func.avg(Visit.initial_weight_g)).filter(vf, Visit.initial_weight_g.isnot(None)).scalar() or 0
        missed = s.query(func.count(Visit.id)).filter(vf, or_(Visit.read_ok.is_(False), Visit.read_ok.is_(None))).scalar() or 0
        return {"cycle_id": cycle_id, "label": c.label, "visits": visits_n, "unique_birds": birds_n, "device_rows": logs, "total_intake_g": round(float(total_intake), 1), "avg_initial_weight_g": round(float(avg_init), 1), "missed_rfid": missed}
@app.get("/api/cycles/{cycle_id}/visits")
def recent_visits(cycle_id: int, limit: int = 50, current: User = Depends(authmod.get_current_user)):
    limit = max(1, min(int(limit or 50), 500))
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
        rows = (s.query(Visit).filter(Visit.cycle_id == cycle_id).order_by(Visit.visit_start.desc()).limit(limit).all())
        return [_visit_to_dict(v) for v in rows]
@app.get("/api/cycles/{cycle_id}/registrations")
def recent_registrations(cycle_id: int, limit: int = 50, current: User = Depends(authmod.get_current_user)):
    """Realtime registration table: one row per bird visit.

    Covers the six device-table parameters: feed consumed (g), bird weight (g),
    elapsed time (s), datetime, bird id, device id. For still-open visits
    (visit_end NULL) elapsed is measured up to now.
    """
    limit = max(1, min(int(limit or 50), 500))
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
        rows = (s.query(Visit).filter(Visit.cycle_id == cycle_id, Visit.bird_id.isnot(None)).order_by(Visit.visit_start.desc()).limit(limit).all())
        # hopper level (g) + lane fallback per visit, batched from the
        # visit's logs: the LATEST log wins (an open visit must track live
        # refills — e.g. opened while the hopper read 0, refilled to 345g
        # mid-visit — instead of freezing at the opening snapshot), falling
        # back to older logs when the newest carries no bin reading. Unit
        # column first, else the external_id suffix (:u1/:u2), else lane 1
        # for legacy rows.
        vids = [v.id for v in rows]
        binmap, unitmap, pausemap = {}, {}, {}
        if vids:
            for vid, fb, ext, fst in (s.query(DeviceLog.visit_id,
                                             DeviceLog.feed_bin_kg,
                                             DeviceLog.external_id,
                                             DeviceLog.status)
                                      .filter(DeviceLog.visit_id.in_(vids))
                                      .order_by(DeviceLog.id.desc()).all()):
                if fb is not None:
                    binmap.setdefault(vid, fb)
                # paused indicator: the visit's LATEST row carries an
                # explicit non-VALID flag while the visit is still open
                # (missing/legacy flags count as valid, as everywhere).
                if vid not in pausemap:
                    pausemap[vid] = bool(fst and str(fst).strip()
                                         and str(fst).strip().upper() != "VALID")
                if ext and ext.endswith(":u2"):
                    unitmap[vid] = 2
                elif ext:
                    unitmap.setdefault(vid, 1)
        now = datetime.now(timezone.utc)
        out = []
        for v in rows:
            # Displayed elapsed = the live core's effective clock (device
            # counter / fallback) when known; the informational presence
            # cross-check next; wall-clock duration otherwise (legacy rows
            # predating both).
            if v.elapsed_s is not None:
                try:
                    elapsed = max(0.0, float(v.elapsed_s))
                except (TypeError, ValueError):
                    elapsed = 0.0
            elif v.presence_s is not None:
                try:
                    elapsed = max(0.0, float(v.presence_s))
                except (TypeError, ValueError):
                    elapsed = 0.0
            else:
                end = v.visit_end or now
                try:
                    elapsed = max(0.0, (end - v.visit_start).total_seconds()) if v.visit_start else 0.0
                except Exception:
                    elapsed = 0.0
            binkg = binmap.get(v.id)
            # ejection countdown: persisted deadline minus server now,
            # for EJECTING visits only (server-authoritative; the browser
            # only renders this value, never computes finalization).
            eject_in = None
            try:
                if (v.business_state == "EJECTING"
                        and v.visit_end is None
                        and v.invalid_deadline is not None):
                    _dl = v.invalid_deadline
                    _dl = _dl.replace(tzinfo=timezone.utc) \
                        if _dl.tzinfo is None else _dl
                    eject_in = max(0.0, (_dl - now).total_seconds())
            except Exception:
                eject_in = None
            out.append({"id": v.id, "bird_id": _unitcore._norm_tag(v.bird_id),
                        "initial_weight_g": v.initial_weight_g,
                        "final_weight_g": v.final_weight_g,
                        "live_weight_g": v.live_weight_g,
                        "last_valid_weight_g": v.last_valid_weight_g,
                        "initial_bin_weight_g": v.initial_bin_weight_g,
                        "last_valid_bin_weight_g": v.last_valid_bin_weight_g,
                        "final_bin_weight_g": v.final_bin_weight_g,
                        "weight_gain_g": v.weight_gain_g,
                        # NULL stays NULL (frontend renders "—"): a missing
                        # measurement must never be fabricated as 0.0.
                        "feed_intake_g": (round(v.feed_intake_g, 1)
                                          if v.feed_intake_g is not None
                                          else None),
                        "elapsed_s": round(elapsed, 1),
                        "presence_s": v.presence_s,
                        "unit": v.unit if v.unit in (1, 2) else unitmap.get(v.id, 1),
                        "business_state": v.business_state or "EMPTY",
                        "eject_in_s": (round(eject_in, 0)
                                       if eject_in is not None else None),
                        "bird_position": v.bird_position or "inside",
                        "stale": bool(v.stale),
                        "paused": bool(pausemap.get(v.id))
                        and v.visit_end is None,
                        "bin_weight_g": round(binkg * 1000.0, 2)
                        if binkg is not None else None,
                        "registered_at": _iso(v.visit_start), "visit_end": _iso(v.visit_end),
                        "age_day": v.age_day, "sensor_id": v.sensor_id,
                        "rssi": v.rssi, "read_ok": v.read_ok})
        return out
@app.get("/api/env/summary")
def env_summary(current: User = Depends(authmod.get_current_user)):
    """Latest per-house climate snapshot + last 10 temperature samples.

    Climate telemetry carries no tenant key, so houses are shared,
    read-only operational data for every authenticated user: the list comes
    from distinct house_ids actually present in env_samples (never from an
    arbitrary cycle.id mapping). Falls back to an empty (not demo) payload
    when no rows exist yet — the frontend renders offline placeholders.
    """
    out = {"houses": [], "series": {"temps": []}}
    with SessionLocal() as s:
        present = s.query(EnvSample.house_id).distinct().limit(100).all()
        house_ids = sorted({h for (h,) in present if h is not None}) or [1]
        latest = {}
        for hid in house_ids:
            row = (s.query(EnvSample)
                    .filter(EnvSample.house_id == hid)
                    .order_by(EnvSample.ts.desc())
                    .first())
            if row:
                latest[hid] = row
        series = (s.query(EnvSample)
                    .filter(EnvSample.house_id == house_ids[0])
                    .order_by(EnvSample.ts.desc())
                    .limit(10)
                    .all())
        out["series"]["temps"] = [r.temp_c for r in reversed(series) if r.temp_c is not None]
        for hid in house_ids:
            r = latest.get(hid)
            health = {"activity": 0, "distribution": 0, "respiratory": 0, "alert": 0}
            if r and r.health_json:
                try:
                    import json as _json
                    health = _json.loads(r.health_json)
                except Exception:
                    pass
            out["houses"].append({
                "id": hid, "name": f"House {hid}",
                # _aware_dt: SQLite returns naive timestamps; subtracting a
                # naive dt from an aware now() raises TypeError (500).
                "online": bool(r) and (_aware_dt(datetime.now(timezone.utc))
                                       - _aware_dt(r.ts)).total_seconds() < 60,
                "tiles": {
                    "temp": r.temp_c if r else None, "rh": r.rh if r else None,
                    "bed": r.bed_rh if r else None, "feed": r.feed_kg if r else None,
                    "water": r.water_l if r else None, "nh3": r.nh3_ppm if r else None,
                    "o2": r.o2_pct if r else None, "fan": r.fan_pct if r else None,
                    "light": r.light_lux if r else None,
                } if r else {},
                "health": health,
                "devices": [{
                    "id": f"ENV-{hid}01", "metric": "temp",
                    "rssi": r.rssi if r else -100, "last": "1s",
                    "state": "ok" if r else "offline",
                }],
            })
    return out

@app.get("/api/env/export")
def env_export(scope: str = "day", house: int = 1, current: User = Depends(authmod.get_current_user)):
    """Excel export for one house present in telemetry (404 otherwise).

    Climate rows are shared operational data (see env_summary), so any
    authenticated user may export houses that exist — never other tenants'
    per-bird data, which stays behind _require_owner_cycle."""
    from fastapi.responses import StreamingResponse
    import io
    try:
        import openpyxl
    except Exception:
        raise HTTPException(status_code=501, detail="xlsx module missing")
    with SessionLocal() as s:
        q = s.query(EnvSample).filter(EnvSample.house_id == house).order_by(EnvSample.ts.asc())
        rows = q.limit(20000).all()
    if not rows:
        raise HTTPException(status_code=404, detail="no env data")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"house_{house}"
    ws.append(["ts", "temp_c", "rh", "bed_rh", "feed_kg", "water_l", "nh3_ppm", "o2_pct", "fan_pct", "light_lux", "rssi"])
    for r in rows:
        ws.append([r.ts.isoformat(), r.temp_c, r.rh, r.bed_rh, r.feed_kg, r.water_l, r.nh3_ppm, r.o2_pct, r.fan_pct, r.light_lux, r.rssi])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Arian_env_{scope}.xlsx"'})

@app.post("/api/cycles/{cycle_id}/ingest")
def ingest_event(cycle_id: int, payload: IngestIn, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
    proc = get_processor(cycle_id)
    data = payload.model_dump()
    data["cycle"] = _code_for(cycle_id)
    log_d = proc.ingest(data)
    # single-unit HTTP devices live on lane 1 with their hopper level (g)
    log_d["unit"] = 1
    try:
        _fb = data.get("feed_bin_kg")
        log_d["bin_weight_g"] = round(float(_fb) * 1000.0, 2) \
            if _fb is not None else None
    except (TypeError, ValueError):
        log_d["bin_weight_g"] = None
    hub.publish(log_d)
    return log_d


@app.post("/api/uktech/sync")
def uktech_sync(payload: UktechSyncIn, current: User = Depends(authmod.get_current_user)):
    """Pull new rows from the online weight API into one owned cycle.

    Fail-closed like every other cycle route: auth required, non-owners get
    404 via _require_owner_cycle. 400 = misconfigured/missing target,
    502 = upstream device API unreachable.
    """
    if not payload.cycle_id:
        raise HTTPException(400, "cycle_id is required")
    with SessionLocal() as s:
        cyc = _require_owner_cycle(s, payload.cycle_id, current)
        if (cyc.ingest_source or "api") != "api":
            raise HTTPException(
                409, "cycle ingest source is 'direct': API polling is "
                     "disabled for this cycle (switch it back to 'api' to poll)")
    import uktech
    try:
        # Standard: fetch all new records, chunked per call (batch) so each
        # serverless invocation finishes inside its time limit.
        return _no_store(uktech.sync_serial_to_cycle(payload.cycle_id,
                                                     serial=payload.serial,
                                                     batch=payload.batch))
    except uktech.UktechError as e:
        msg = str(e)
        low = msg.lower()
        if "token" in low or "cycle" in low:
            raise HTTPException(400, msg)
        raise HTTPException(502, msg)


@app.get("/api/uktech/status")
def uktech_status(serial: str | None = None,
                  cycle_id: int | None = None,
                  current: User = Depends(authmod.get_current_user)):
    """Sync cursor for a device serial (per-cycle when cycle_id given).

    Cursor is per-cycle for tenant isolation; without cycle_id it falls back
    to the legacy global cursor. The token is never exposed.
    """
    import uktech
    # If a cycle is specified, enforce ownership (fail-closed 404)
    if cycle_id is not None:
        with SessionLocal() as s:
            _require_owner_cycle(s, cycle_id, current)
    return _no_store(uktech.sync_status(serial, cycle_id))


@app.get("/api/uktech/sessions")
def uktech_sessions(cycle_id: int,
                    serial: str | None = None,
                    current: User = Depends(authmod.get_current_user)):
    """Weighing-session states for a cycle ( powers the UI state badge).

    One entry per (device, rfid) lane: current machine state, registered
    weight, last update. Owner-scoped like every other cycle route.
    """
    from models import WeighingSession
    with SessionLocal() as s:
        _require_owner_cycle(s, cycle_id, current)
        import uktech
        ser = ((serial or uktech.UKTECH_SERIAL).strip()
               or uktech.UKTECH_SERIAL)
        rows = (s.query(WeighingSession)
                .filter(WeighingSession.cycle_id == cycle_id,
                        WeighingSession.serial == ser)
                .order_by(WeighingSession.updated_at.desc())
                .limit(200).all())
        out = []
        for r in rows:
            unit = 1
            try:
                # key: "<serial>|<cycle>|<dev>#u<unit>|<rfid>"
                devpart = (r.key or "").rsplit("|", 2)[-2]
                if "#u" in devpart:
                    unit = int(devpart.rsplit("#u", 1)[1])
            except (TypeError, ValueError, IndexError):
                pass
            out.append({"device": r.device_id, "unit": unit, "rfid": r.rfid,
                        "state": r.state, "registered": r.registered,
                        "updated_at": _iso(r.updated_at)})
        return _no_store(out)


@app.exception_handler(RequestValidationError)
async def _device_validation_400(request: Request, exc: RequestValidationError):
    # Embedded clients get a stable contract: the device API always answers
    # 400 {"success": false, ...} on malformed bodies — never HTML, never
    # 422. Browser paths keep stock FastAPI behavior.
    if request.url.path.startswith("/api/device/"):
        return JSONResponse(status_code=400,
                            content={"success": False, "error": "invalid_payload"})
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# ---------- ESP32 direct ingestion: device credentials (no human JWT) ----
# Design (see device_auth.py): per-device BLD_ keys, SHA256-stored, bound to
# one cycle each. The device authenticates with X-Device-Key; the server
# resolves Device -> Cycle -> User and NEVER trusts a client cycle_id.
_DEVICE_RATE = {}  # device_id -> (count, window_start); per-process only

# Payload keys that would let firmware pick/escape its tenant: rejected
# outright (fail-closed) instead of silently ignored.
_DEVICE_FORBIDDEN_KEYS = ("cycle_id", "user_id", "owner")


def _device_rate_ok(device_id: str) -> bool:
    """Per-device ingest brake. NOTE: per-process only — every serverless
    instance keeps its own table, so this limits accidental flooding, it
    does not globally cap a determined sender (documented, not claimed)."""
    import time as _t
    now, window = _t.monotonic(), DEVICE_INGEST_RATE_WINDOW
    for _k, (_c, _s) in list(_DEVICE_RATE.items()):
        if now - _s > window:
            del _DEVICE_RATE[_k]
    if len(_DEVICE_RATE) > 10000:
        for _k, (_c, _s) in sorted(_DEVICE_RATE.items(),
                                   key=lambda kv: kv[1][1])[:1000]:
            del _DEVICE_RATE[_k]
    entry = _DEVICE_RATE.get(device_id)
    if entry is None or now - entry[1] > window:
        _DEVICE_RATE[device_id] = (1, now)
        return entry is None or DEVICE_INGEST_RATE_LIMIT >= 1
    count, start = entry
    if count >= DEVICE_INGEST_RATE_LIMIT:
        return False
    _DEVICE_RATE[device_id] = (count + 1, start)
    return True


def _dev_err(code: str, status: int):
    """Compact embedded-device error shape (never leaks key material)."""
    return JSONResponse(status_code=status,
                        content={"success": False, "error": code})


def _aware_dt(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _client_ip(request: Request) -> str | None:
    xff = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if xff:
        return xff[:64]
    try:
        return (request.client.host if request.client else None)[:64]
    except Exception:
        return None


def _require_device(request: Request):
    """Authenticate one ESP32 call. Returns (Device detached, None) or
    (None, error_response). Same fail-closed shape for missing/unknown
    keys (no oracle); disabled devices get a distinct 403."""
    raw = devauth.extract_device_key(request.headers)
    if not raw or not raw.startswith(DEVICE_KEY_PREFIX):
        return None, _dev_err("invalid_device_credentials", 401)
    with SessionLocal() as s:
        cands = s.query(Device).filter(
            Device.key_prefix == devauth.key_prefix_of(raw)).all()
        dev = next((d for d in cands
                    if devauth.verify_api_key(raw, d.api_key_hash)), None)
        if dev is None:
            return None, _dev_err("invalid_device_credentials", 401)
        s.expunge(dev)
        if not dev.active:
            return None, _dev_err("device_disabled", 403)
        return dev, None


def _device_cycle_or_err(dev: Device):
    """Resolve the device's assigned cycle (fail-closed if it vanished)."""
    with SessionLocal() as s:
        cyc = s.get(Cycle, dev.cycle_id)
        if cyc is None:
            return None, _dev_err("device_cycle_missing", 403)
        return {"id": cyc.id, "code": cyc.cycle_code,
                "source": getattr(cyc, "ingest_source", None) or "api",
                "start": cyc.start_date}, None


def _device_source_or_err(cyc: dict):
    """Exactly one source is active per cycle: device pushes require the
    cycle switched to 'direct' (409 otherwise, with a clear code)."""
    if (cyc.get("source") or "api") != "direct":
        return _dev_err("device_source_inactive", 409)
    return None


def _device_ts(value, now):
    """Strict ESP32 timestamp: missing -> server receipt time (documented);
    present -> ISO-8601 with EXPLICIT tz (naive rejected, never guessed),
    sane range (since 2020, not beyond now+skew). Returns (dt, source, err).
    """
    if value is None or (isinstance(value, str) and not value.strip()):
        return now, "server", None
    s = str(value).strip()
    if s.endswith(("Z", "z")):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None, None, "invalid_timestamp"
    if dt.tzinfo is None:
        return None, None, "invalid_timestamp"
    dt = dt.astimezone(timezone.utc)
    if dt < datetime(2020, 1, 1, tzinfo=timezone.utc):
        return None, None, "invalid_timestamp"
    if dt > now + timedelta(seconds=DEVICE_MAX_CLOCK_SKEW_S):
        return None, None, "invalid_timestamp"
    return dt, "device", None


def _touch_device(dev_id: int, request: Request, payload: dict,
                  now: datetime):
    """last_seen_at / last_ip (+ firmware) on every authenticated call —
    duplicates included (the device is alive even when it retries)."""
    fw = payload.get("firmware") if isinstance(payload, dict) else None
    fw = (str(fw).strip()[:64] or None) if fw is not None else None
    try:
        with SessionLocal() as s:
            d = s.get(Device, dev_id)
            if d is None:
                return
            d.last_seen_at = now
            d.last_ip = _client_ip(request)
            if fw:
                d.firmware = fw
            s.commit()
    except Exception:
        pass  # telemetry must never break ingestion


def _dev_num(v):
    try:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        f = float(v)
        return f if f == f and abs(f) != float("inf") else None
    except (TypeError, ValueError):
        return None


def _ingest_one(dev: Device, cyc: dict, ev: dict, now: datetime):
    """Validate + ingest ONE device event through the shared live core
    (same process_unit_sample as the API poller — single core, two
    sources). Returns (kind, body) where kind is accepted/duplicate/error
    and body is the per-event result dict."""
    if not isinstance(ev, dict):
        return "error", {"event_id": None, "accepted": False,
                         "error": "invalid_payload"}
    for f in _DEVICE_FORBIDDEN_KEYS:
        if f in ev:
            return "error", {"event_id": ev.get("event_id"),
                             "accepted": False,
                             "error": "device_cycle_forbidden"}
    eid = ev.get("event_id")
    if eid is None or (isinstance(eid, str) and not eid.strip()):
        return "error", {"event_id": None, "accepted": False,
                         "error": "missing_event_id"}
    if not devauth.valid_event_id(eid):
        return "error", {"event_id": str(eid)[:128], "accepted": False,
                         "error": "invalid_event_id"}
    eid = eid.strip()
    ts, _src, terr = _device_ts(ev.get("timestamp"), now)
    if terr:
        return "error", {"event_id": eid, "accepted": False, "error": terr}
    if not _device_rate_ok(dev.device_id):
        return "error", {"event_id": eid, "accepted": False,
                         "error": "rate_limited"}
    ext = devauth.external_id_for(dev.device_id, eid)
    with SessionLocal() as s:
        hit = s.query(DeviceLog.id).filter(
            DeviceLog.cycle_id == dev.cycle_id,
            DeviceLog.external_id == ext).first()
        if hit:
            return "duplicate", {"event_id": eid, "accepted": False,
                                 "duplicate": True}
    import uktech as _uk
    sensor = ev.get("sensor_id")
    sensor = (str(sensor).strip() if sensor is not None else "") or dev.device_id
    try:
        unit = int(ev.get("unit") or 1)
    except (TypeError, ValueError):
        unit = 1
    unit = unit if unit in (1, 2) else 1
    raw = _dev_num(ev.get("raw_weight_g"))
    bird = _dev_num(ev.get("weight_g"))
    if bird is None:
        bird = raw
    binkg = _dev_num(ev.get("feed_bin_kg"))
    bin_g = binkg * 1000.0 if binkg is not None else None
    _st = ev.get("status")
    valid = True if _st is None or not str(_st).strip() \
        else str(_st).strip().upper() == "VALID"
    _ds = ev.get("device_status")
    stale = bool(_ds and str(_ds).strip()) and \
        str(_ds).strip().upper() != "ONLINE"
    rfid = ev.get("bird_id")
    rfid = (str(rfid).strip() if rfid is not None else "") or None
    # normalize double-read tags (same tag concatenated twice) at the door:
    # one bird = one identity in the log, the visit and the table
    if rfid:
        rfid = _unitcore._norm_tag(rfid)
    flock = ev.get("flock_id")
    flock = (str(flock).strip() if flock is not None else "") or None
    age_day = None
    try:
        if cyc.get("start") is not None:
            age_day = max(0, (ts.date() - cyc["start"].date()).days)
    except Exception:
        age_day = None
    sample = {"unit": unit, "ts": ts.timestamp(), "rfid": rfid,
              "bird": bird, "bin": bin_g, "valid": valid,
              "bird_cal": _dev_num(ev.get("bird_calibration")),
              "bin_cal": _dev_num(ev.get("bin_calibration")),
              "stale": stale,
              "counter": _dev_num(ev.get("total_seconds")) or 0.0,
              "record_id": eid,
              "status_raw": _st if isinstance(_st, str) else None}
    try:
        with SessionLocal() as s:
            orow = (s.query(Visit)
                    .filter(Visit.cycle_id == dev.cycle_id,
                            Visit.visit_end.is_(None),
                            Visit.sensor_id == sensor,
                            Visit.unit == unit)
                    .order_by(Visit.visit_start.desc()).first())
            vstate = _uk._visit_to_state(orow) if orow is not None else None
            urow = s.get(UnitState, (dev.cycle_id, sensor, unit))
            uprev = None
            if urow is not None and urow.prev_ts is not None:
                try:
                    _pts = urow.prev_ts
                    _pts = _pts.replace(tzinfo=timezone.utc) \
                        if _pts.tzinfo is None else _pts
                    uprev = {"ts": _pts.timestamp(),
                             "valid": bool(urow.prev_valid),
                             "bird": urow.prev_bird}
                except Exception:
                    uprev = None
            res = _unitcore.process_unit_sample(
                sample, vstate, uprev, _uk._core_cfg())
            out, snap = res.get("visit"), res.get("closed")
            is_start = is_end = False
            if res.get("outcome") == "swap-reopened":
                if orow is not None:
                    orow.visit_end = ts
                    orow.bird_position = "outside"
                    orow.close_reason = "swap"
                    orow.business_state = "EXITED"
                    orow.empty_streak = 0
                    orow.empty_since = None
                    orow.invalid_since = None
                    orow.invalid_deadline = None
                nv = _new_live_visit(dev.cycle_id, out, sensor, unit, ts,
                                     age_day, source_id=eid)
                s.add(nv)
                s.flush()
                vid, is_start = nv.id, True
            elif res.get("opened"):
                nv = _new_live_visit(dev.cycle_id, out, sensor, unit, ts,
                                     age_day, source_id=eid)
                s.add(nv)
                s.flush()
                vid, is_start = nv.id, True
            elif snap is not None:
                if orow is not None:
                    orow.visit_end = _uk._dt_of(snap["exit_ts"]) or ts
                    orow.final_weight_g = snap["final"]
                    orow.live_weight_g = snap["final"]
                    orow.last_valid_weight_g = snap["final"]
                    orow.final_bin_weight_g = snap.get("final_bin")
                    orow.last_valid_bin_weight_g = snap.get("final_bin")
                    orow.weight_gain_g = snap.get("weight_gain")
                    orow.feed_intake_g = snap["feed"]
                    orow.elapsed_s = snap["elapsed"]
                    orow.presence_s = snap["presence"]
                    orow.bird_position = "outside"
                    orow.close_reason = snap["reason"]
                    orow.business_state = "EXITED"
                    orow.empty_streak = 0
                    orow.empty_since = None
                    orow.invalid_since = None
                    orow.invalid_deadline = None
                    vid = orow.id
                else:
                    vid = None
                is_end = True
            elif out is not None and orow is not None:
                orow.final_weight_g = out.get("current")
                orow.live_weight_g = out.get("current")
                orow.last_valid_weight_g = out.get("last_valid")
                orow.last_valid_bin_weight_g = out.get("last_valid_bin")
                orow.feed_intake_g = round(out.get("feed") or 0.0, 1)
                orow.elapsed_s = round(out.get("elapsed") or 0.0, 1)
                orow.presence_s = round(out.get("presence_acc") or 0.0, 1)
                orow.presence_acc = out.get("presence_acc") or 0.0
                orow.counter_last = out.get("counter_last")
                orow.counter_live = bool(out.get("counter_live"))
                orow.bin_baseline = out.get("bin_base")
                orow.bin_calib = out.get("bin_cal")
                orow.empty_streak = out.get("streak") or 0
                try:
                    orow.empty_since = _uk._dt_of(out.get("empty_since"))
                except Exception:
                    orow.empty_since = None
                try:
                    orow.invalid_since = _uk._dt_of(out.get("invalid_since"))
                except Exception:
                    orow.invalid_since = None
                try:
                    orow.invalid_deadline = _uk._dt_of(
                        out.get("invalid_deadline"))
                except Exception:
                    orow.invalid_deadline = None
                orow.business_state = out.get("business_state") or "FEEDING"
                orow.bird_position = out.get("position") or "inside"
                orow.last_tag = out.get("last_tag")
                orow.initial_confirmed_g = out.get("confirmed")
                orow.stale = bool(out.get("stale"))
                orow.last_source_id = str(eid)
                orow.last_source_timestamp = ts
                vid = orow.id
            else:
                vid = None
            if res.get("uprev") is not None:
                _pu = res["uprev"]
                _dt = _uk._dt_of(_pu.get("ts"))
                _vv = _pu.get("valid")
                _vv = bool(_vv) if _vv is not None else None
                _bb = _pu.get("bird")
                _bb = bool(_bb) if _bb is not None else None
                if snap is not None:
                    # lane freed by a close: unit back to EMPTY, no visit
                    _bs, _avid = "EMPTY", None
                    _inv = _dead = None
                else:
                    _vo = out if out is not None else None
                    _bs = (_vo or {}).get("business_state") if _vo else None
                    _avid = vid if _vo is not None else None
                    _inv = (_vo or {}).get("invalid_since") if _vo else None
                    _dead = (_vo or {}).get("invalid_deadline") \
                        if _vo else None
                if urow is None:
                    s.add(UnitState(cycle_id=dev.cycle_id, device_id=sensor,
                                    unit=unit, prev_ts=_dt, prev_valid=_vv,
                                    prev_bird=_bb,
                                    business_state=_bs or "EMPTY",
                                    active_visit_id=_avid,
                                    invalid_since=_uk._dt_of(_inv),
                                    invalid_deadline=_uk._dt_of(_dead),
                                    last_source_id=str(eid),
                                    updated_at=now))
                else:
                    urow.prev_ts, urow.prev_valid, urow.prev_bird = \
                        _dt, _vv, _bb
                    urow.business_state = _bs or "EMPTY"
                    urow.active_visit_id = _avid
                    urow.invalid_since = _uk._dt_of(_inv)
                    urow.invalid_deadline = _uk._dt_of(_dead)
                    urow.last_source_id = str(eid)
                    urow.updated_at = now
            log = DeviceLog(
                cycle_id=dev.cycle_id, timestamp=ts,
                flock_id=flock, bird_id=rfid, sensor_id=sensor,
                age_day=age_day, raw_weight_g=raw, weight_g=bird,
                feed_bin_kg=binkg, feed_delta_g=_dev_num(ev.get("feed_delta_g")),
                temp_c=_dev_num(ev.get("temp_c")),
                humidity=_dev_num(ev.get("humidity")),
                rssi=_dev_num(ev.get("rssi")), visit_id=vid,
                is_visit_start=is_start, is_visit_end=is_end,
                external_id=ext, status=sample["status_raw"])
            s.add(log)
            s.flush()
            if out is not None:
                _el, _fd = round(out["elapsed"] or 0.0, 1), round(out["feed"] or 0.0, 1)
            elif snap is not None:
                _el, _fd = snap["elapsed"], snap["feed"]
            else:
                _el, _fd = 0.0, 0.0
            log_d = _log_to_dict(log, {
                "elapsed_s": _el, "visit_feed_g": _fd, "unit": unit,
                "bird_position": ("outside" if is_end
                                  else ("inside" if vid else None)),
                "bin_weight_g": round(bin_g, 2)
                if bin_g is not None else None})
            s.commit()
    except IntegrityError as _ie:
        # Only a genuine duplicate (same cycle+external_id log already
        # persisted by a lost write race) may report "duplicate" — any other
        # integrity failure (e.g. uq_visit_open_lane) must NOT swallow the
        # event: report a retryable error so the device re-sends it.
        _msg = str(_ie).lower()
        if "uq_log_cycle_external" in _msg or "external_id" in _msg:
            return "duplicate", {"event_id": eid, "accepted": False,
                                 "duplicate": True}
        return "error", {"error": "conflict",
                         "detail": "write conflict, retry the event"}
    except Exception:
        get_logger(__name__).exception("device ingest failed device=%s cycle=%s",
                                       dev.device_id, dev.cycle_id)
        return "error", {"event_id": eid, "accepted": False,
                         "error": "ingest_failed"}
    try:
        get_processor(dev.cycle_id).open.clear()
    except Exception:
        pass
    try:
        hub.publish(log_d)
    except Exception:
        pass
    return "accepted", {"event_id": eid, "accepted": True}


def _new_live_visit(cycle_id, out, sensor, unit, ts_dt, age_day,
                    source_id=None):
    """Visit row from a live-core open state (shared shape, Source B)."""
    import uktech as _uk
    return Visit(
        cycle_id=cycle_id, bird_id=out["bird_id"], visit_start=ts_dt,
        sensor_id=sensor, initial_weight_g=out["initial"],
        final_weight_g=out["current"],
        live_weight_g=out["current"],
        last_valid_weight_g=out.get("last_valid"),
        initial_bin_weight_g=out.get("initial_bin"),
        last_valid_bin_weight_g=out.get("last_valid_bin"),
        age_day=age_day, read_ok=True,
        unit=unit, feed_intake_g=round(out["feed"] or 0.0, 1),
        elapsed_s=round(out["elapsed"] or 0.0, 1),
        presence_s=round(out["presence_acc"] or 0.0, 1),
        presence_acc=out["presence_acc"] or 0.0,
        counter_last=out["counter_last"],
        counter_live=bool(out["counter_live"]),
        bin_baseline=out["bin_base"], bin_calib=out["bin_cal"],
        empty_streak=0, empty_since=None,
        invalid_since=_uk._dt_of(out.get("invalid_since")),
        invalid_deadline=_uk._dt_of(out.get("invalid_deadline")),
        business_state=out.get("business_state") or "FEEDING",
        bird_position="inside",
        last_tag=out["last_tag"], initial_confirmed_g=out["confirmed"],
        close_reason=None, stale=bool(out["stale"]),
        last_source_id=(str(source_id) if source_id is not None else None),
        last_source_timestamp=ts_dt)


@app.post("/api/device/ingest")
def device_ingest(payload: dict = Body(...), request: Request = None):
    """Single ESP32 event (X-Device-Key, no human JWT). See module contract
    in device_auth.py. Compact JSON for embedded clients."""
    dev, err = _require_device(request)
    if err:
        return err
    cyc, cerr = _device_cycle_or_err(dev)
    if cerr:
        return cerr
    serr = _device_source_or_err(cyc)
    if serr:
        return serr
    now = datetime.now(timezone.utc)
    # Shared lazy sweep: overdue EJECTING visits finalize by their
    # persisted deadline even when the device sends nothing new.
    try:
        import uktech as _uksweep
        _uksweep.sweep_overdue_ejections(dev.cycle_id, now)
    except Exception:
        pass
    _touch_device(dev.id, request, payload if isinstance(payload, dict) else {},
                  now)
    kind, res = _ingest_one(dev, cyc, payload, now)
    if kind == "accepted":
        return {"success": True, "accepted": True,
                "event_id": res["event_id"], "device_id": dev.device_id,
                "cycle_id": dev.cycle_id}
    if kind == "duplicate":
        return {"success": True, "accepted": False, "duplicate": True,
                "event_id": res["event_id"]}
    code = res.get("error", "invalid_payload")
    return _dev_err(code, 429 if code == "rate_limited"
                    else 503 if code == "conflict" else 400)


class DeviceBatchIn(BaseModel):
    model_config = {"extra": "allow"}
    events: list = []


@app.post("/api/device/ingest/batch")
def device_ingest_batch(payload: DeviceBatchIn, request: Request):
    """Batch ESP32 events: one auth + one cycle resolution, sequential
    processing in the given order (send chronological), per-event results.
    One event's failure never aborts the batch."""
    dev, err = _require_device(request)
    if err:
        return err
    cyc, cerr = _device_cycle_or_err(dev)
    if cerr:
        return cerr
    serr = _device_source_or_err(cyc)
    if serr:
        return serr
    events = payload.events
    if not isinstance(events, list) or not events:
        return _dev_err("invalid_payload", 400)
    if len(events) > DEVICE_MAX_BATCH:
        return _dev_err("batch_too_large", 400)
    now = datetime.now(timezone.utc)
    try:
        import uktech as _uksweep
        _uksweep.sweep_overdue_ejections(dev.cycle_id, now)
    except Exception:
        pass
    _touch_device(dev.id, request, {}, now)
    results, acc, dup, failed = [], 0, 0, 0
    for ev in events:
        kind, res = _ingest_one(dev, cyc, ev, now)
        results.append(res)
        if kind == "accepted":
            acc += 1
        elif kind == "duplicate":
            dup += 1
        else:
            failed += 1
    return {"success": True, "device_id": dev.device_id,
            "cycle_id": dev.cycle_id, "accepted_count": acc,
            "duplicate_count": dup, "failed_count": failed,
            "results": results}


class SourceIn(BaseModel):
    source: str = ""


@app.get("/api/cycles/{cycle_id}/source")
def get_cycle_source(cycle_id: int,
                     current: User = Depends(authmod.get_current_user)):
    """Active ingestion source for a cycle ("api" or "direct"). Exactly one
    source is active: API polling 409s when the cycle is on "direct", and
    device pushes 409 when it is on "api". Default "api" (legacy behavior)."""
    with SessionLocal() as s:
        cyc = _require_owner_cycle(s, cycle_id, current)
        return {"cycle_id": cycle_id,
                "source": getattr(cyc, "ingest_source", None) or "api"}


@app.patch("/api/cycles/{cycle_id}/source")
def set_cycle_source(cycle_id: int, payload: SourceIn,
                     current: User = Depends(authmod.get_current_user)):
    """Switch a cycle's ingestion source. Switching never touches visits:
    open rows keep their persisted state and continue under the new
    source's next record (same core, same columns)."""
    want = (payload.source or "").strip().lower()
    if want not in ("api", "direct"):
        raise HTTPException(400, "source must be 'api' or 'direct'")
    with SessionLocal() as s:
        cyc = _require_owner_cycle(s, cycle_id, current)
        cyc.ingest_source = want
        s.commit()
        return {"cycle_id": cycle_id, "source": want}


def _owner_device(s: Session, device_id: str, user: User) -> Device:
    """Fail-closed device lookup: unknown ids and cross-tenant ids both 404
    (no probing another tenant's device inventory)."""
    d = s.query(Device).filter(Device.device_id == device_id).first()
    if not d:
        raise HTTPException(404, "device not found")
    cyc = s.get(Cycle, d.cycle_id)
    if not cyc:
        raise HTTPException(404, "device not found")
    if cyc.user_id is None:
        if not user.is_admin:
            raise HTTPException(404, "device not found")
    elif cyc.user_id != user.id and not user.is_admin:
        raise HTTPException(404, "device not found")
    return d


def _device_to_dict(d: Device):
    """Public device shape — NEVER the key hash or raw key."""
    now = datetime.now(timezone.utc)
    online = False
    try:
        if d.last_seen_at:
            online = (now - _aware_dt(d.last_seen_at)).total_seconds() <= DEVICE_ONLINE_SECONDS
    except Exception:
        online = False
    return {"id": d.id, "device_id": d.device_id, "name": d.name,
            "cycle_id": d.cycle_id, "active": bool(d.active),
            "firmware": d.firmware, "last_seen_at": _iso(d.last_seen_at),
            "last_ip": d.last_ip, "online": online,
            "created_at": _iso(d.created_at)}


class DeviceCreateIn(BaseModel):
    device_id: str = ""
    name: str | None = None
    cycle_id: int = 0


@app.post("/api/devices")
def create_device(payload: DeviceCreateIn, current: User = Depends(authmod.get_current_user)):
    """Register one ESP32 on an owned cycle. The raw API key is returned
    ONCE here — afterwards it is unrecoverable (SHA256-stored)."""
    device_id = (payload.device_id or "").strip()
    if not devauth.valid_device_id(device_id):
        raise HTTPException(400, "invalid device_id (1-64 chars: A-Z a-z 0-9 _ -)")
    if not payload.cycle_id:
        raise HTTPException(400, "cycle_id is required")
    with SessionLocal() as s:
        _require_owner_cycle(s, payload.cycle_id, current)
        if s.query(Device).filter(Device.device_id == device_id).first():
            raise HTTPException(409, "device_id already registered")
        raw = devauth.generate_api_key(DEVICE_KEY_PREFIX)
        d = Device(device_id=device_id,
                   name=(payload.name or "").strip() or None,
                   key_prefix=devauth.key_prefix_of(raw),
                   api_key_hash=devauth.hash_api_key(raw),
                   cycle_id=payload.cycle_id, active=True)
        s.add(d)
        try:
            s.commit()
        except IntegrityError:
            s.rollback()
            raise HTTPException(409, "device_id already registered")
        s.refresh(d)
        out = _device_to_dict(d)
        out["api_key"] = raw
        return out


@app.get("/api/devices")
def list_devices(current: User = Depends(authmod.get_current_user)):
    """Own devices (admins: all), with online/last-seen health. Key hashes
    are never serialized."""
    with SessionLocal() as s:
        q = s.query(Device)
        if not current.is_admin:
            q = q.join(Cycle, Cycle.id == Device.cycle_id).filter(
                Cycle.user_id == current.id)
        rows = q.order_by(Device.id.desc()).all()
        return [_device_to_dict(d) for d in rows]


@app.get("/api/devices/{device_id}")
def get_device(device_id: str, current: User = Depends(authmod.get_current_user)):
    with SessionLocal() as s:
        return _device_to_dict(_owner_device(s, device_id, current))


class DeviceStatusIn(BaseModel):
    active: bool | None = None


@app.patch("/api/devices/{device_id}/status")
def set_device_status(device_id: str, payload: DeviceStatusIn,
                      current: User = Depends(authmod.get_current_user)):
    """Enable/disable a device (disabled -> 403 on ingest, immediately)."""
    with SessionLocal() as s:
        d = _owner_device(s, device_id, current)
        if payload.active is not None:
            d.active = bool(payload.active)
        s.commit()
        return _device_to_dict(d)


@app.post("/api/devices/{device_id}/rotate-key")
def rotate_device_key(device_id: str,
                      current: User = Depends(authmod.get_current_user)):
    """Issue a fresh API key; the old one stops working immediately."""
    with SessionLocal() as s:
        d = _owner_device(s, device_id, current)
        raw = devauth.generate_api_key(DEVICE_KEY_PREFIX)
        d.key_prefix = devauth.key_prefix_of(raw)
        d.api_key_hash = devauth.hash_api_key(raw)
        try:
            s.commit()
        except IntegrityError:
            s.rollback()
            raise HTTPException(500, "key rotation failed, try again")
        return {"id": d.id, "device_id": d.device_id, "api_key": raw}


def _no_store(payload):
    """Live device endpoints must never serve stale caches: browsers, CDNs
    and proxies may otherwise replay an old sync/status snapshot."""
    from fastapi.responses import JSONResponse
    return JSONResponse(content=payload, headers={
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
    })


def _ws_auth_or_close(ws: WebSocket):
    """Browsers cannot set headers on a WS handshake, so the JWT travels as
    ?token=. Returns the authenticated User or None (caller must close)."""
    return authmod.authenticate_token(ws.query_params.get("token", ""))


@app.websocket("/ws/device")
async def ws_device(ws: WebSocket):
    user = _ws_auth_or_close(ws)
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    hub.set_owner(ws, user.id, user.is_admin)
    hub.subscribe_all(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.unsubscribe_all(ws)


@app.websocket("/ws/cycle/{cycle_id}")
async def ws_cycle(ws: WebSocket, cycle_id: int):
    user = _ws_auth_or_close(ws)
    if not user:
        await ws.close(code=4401)
        return
    with SessionLocal() as s:
        c = s.get(Cycle, cycle_id)
        if not c:
            await ws.close(code=4404)
            return
        if c.user_id != user.id and not user.is_admin:
            await ws.close(code=4403)  # fail-closed, same as the REST routes
            return
    await ws.accept()
    hub.set_owner(ws, user.id, user.is_admin)
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


