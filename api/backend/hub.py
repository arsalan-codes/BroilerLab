"""
BroilerLab Device Backend — live event hub (WebSocket broadcast registry).

Decouples the device processor / MQTT consumer from the FastAPI app so either
can publish a processed device event to all subscribed websockets without a
circular import.

Tenant isolation: every socket is tagged with its owner's (user_id, is_admin)
at subscribe time (see set_owner). publish() delivers an event only to the
owning tenant (admins receive everything). Sockets without an owner never
receive anything — the WS endpoints reject unauthenticated clients first.
"""
import asyncio
import json
import time

# registries
_ws_all = set()          # every device event subscriber (/ws/device)
_ws_cycle = {}           # cycle_id -> set of websockets (/ws/cycle/{id})
_ws_owner = {}           # ws -> (user_id, is_admin)
_loop = {"ref": None}

# cycle_id -> (owner_user_id, cached_at); ownership changes are rare, so a
# short TTL avoids a DB hit per subscriber per event.
_owner_cache = {}
_OWNER_TTL_S = 60.0


def register_loop(loop):
    _loop["ref"] = loop


def set_owner(ws, user_id, is_admin=False):
    _ws_owner[ws] = (user_id, bool(is_admin))


def _drop(ws):
    _ws_all.discard(ws)
    _ws_owner.pop(ws, None)
    for s in _ws_cycle.values():
        s.discard(ws)


def subscribe_all(ws):
    _ws_all.add(ws)


def unsubscribe_all(ws):
    _drop(ws)


def subscribe_cycle(cycle_id, ws):
    _ws_cycle.setdefault(cycle_id, set()).add(ws)


def unsubscribe_cycle(cycle_id, ws):
    _ws_cycle.get(cycle_id, set()).discard(ws)
    if ws not in _ws_all:
        _ws_owner.pop(ws, None)


def _cycle_owner(cycle_id):
    """Owner user_id of a cycle (None if missing). Cached briefly."""
    if cycle_id is None:
        return None
    now = time.monotonic()
    hit = _owner_cache.get(cycle_id)
    if hit and now - hit[1] < _OWNER_TTL_S:
        return hit[0]
    owner = None
    try:
        from models import SessionLocal, Cycle
        with SessionLocal() as s:
            c = s.get(Cycle, int(cycle_id))
            owner = c.user_id if c else None
    except Exception:
        owner = None
    _owner_cache[cycle_id] = (owner, now)
    return owner


def _may_receive(ws, owner_id):
    o = _ws_owner.get(ws)
    if o is None:
        return False  # fail-closed: untagged sockets get nothing
    _uid, is_admin = o
    if is_admin:
        return True
    return owner_id is not None and _uid == owner_id


def publish(event_dict: dict):
    """Push a processed device event to the owning tenant's WS clients."""
    msg = json.dumps(event_dict, default=str)
    loop = _loop["ref"]
    if loop is None:
        return
    targets = set(_ws_all)
    cid = event_dict.get("cycle_id")
    if cid is not None:
        targets |= _ws_cycle.get(cid, set())
    if not targets:
        return
    owner_id = _cycle_owner(cid)
    for ws in targets:
        if not _may_receive(ws, owner_id):
            continue
        try:
            fut = asyncio.run_coroutine_threadsafe(ws.send_text(msg), loop)
            fut.add_done_callback(lambda f, _ws=ws: _drop(_ws) if f.exception() else None)
        except Exception:
            _drop(ws)
