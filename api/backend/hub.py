"""
BroilerLab Device Backend — live event hub (WebSocket broadcast registry).

Decouples the device processor / MQTT consumer from the FastAPI app so either
can publish a processed device event to all subscribed websockets without a
circular import.
"""
import asyncio
import json

# registries
_ws_all = set()          # every device event subscriber (/ws/device)
_ws_cycle = {}           # cycle_id -> set of websockets (/ws/cycle/{id})
_loop = {"ref": None}


def register_loop(loop):
    _loop["ref"] = loop


def subscribe_all(ws):
    _ws_all.add(ws)


def unsubscribe_all(ws):
    _ws_all.discard(ws)


def subscribe_cycle(cycle_id, ws):
    _ws_cycle.setdefault(cycle_id, set()).add(ws)


def unsubscribe_cycle(cycle_id, ws):
    _ws_cycle.get(cycle_id, set()).discard(ws)


def publish(event_dict: dict):
    """Push a processed device event to all relevant WS clients."""
    msg = json.dumps(event_dict, default=str)
    loop = _loop["ref"]
    if loop is None:
        return
    dead = set()
    targets = set(_ws_all)
    cid = event_dict.get("cycle_id")
    if cid is not None:
        targets |= _ws_cycle.get(cid, set())
    for ws in targets:
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(msg), loop)
        except Exception:
            dead.add(ws)
    for ws in dead:
        _ws_all.discard(ws)
        for s in _ws_cycle.values():
            s.discard(ws)
