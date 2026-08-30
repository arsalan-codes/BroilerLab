"""
BroilerLab Device Backend — MQTT consumer.

Subscribes to broilerlab/device/# and feeds raw events into the per-cycle
processor. Payload is JSON matching the 12-col schema, plus a "cycle" field
(or topic path broilerlab/device/<cycle_code>).
"""
import json
import threading

import paho.mqtt.client as mqtt

from config import MQTT_BROKER, MQTT_PORT, MQTT_TOPIC_PREFIX
from models import SessionLocal, Cycle
from processor import get_processor

_active = {"client": None, "running": False}


def _resolve_cycle_id(payload: dict):
    """Find cycle_id from payload['cycle'] code or topic."""
    code = (payload.get("cycle") or payload.get("flock_id") or "").strip()
    if not code:
        return None
    with SessionLocal() as s:
        c = s.query(Cycle).filter(Cycle.cycle_code == code).first()
        return c.id if c else None


def _on_connect(client, userdata, flags, rc, props=None):
    client.subscribe(f"{MQTT_TOPIC_PREFIX}/#")


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return
    cycle_id = _resolve_cycle_id(payload)
    if cycle_id is None:
        return
    proc = get_processor(cycle_id)
    proc.ingest(payload)


def start_mqtt():
    if _active["running"]:
        return _active["client"]
    cli = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    cli.on_connect = _on_connect
    cli.on_message = _on_message
    try:
        cli.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    except Exception as e:  # broker may be down in dev
        print(f"[mqtt] connect failed: {e}")
        return None
    t = threading.Thread(target=cli.loop_forever, daemon=True)
    t.start()
    _active["client"] = cli
    _active["running"] = True
    return cli


def stop_mqtt():
    if _active["client"]:
        _active["client"].disconnect()
    _active["running"] = False
