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


def _ingest_env(payload: dict, house_hint=None):
    """Fast path for climate telemetry (topic .../env/<house>).

    One message = one narrow insert into env_samples; no per-row session
    churn. Values are optional — the hardware may send partial snapshots.
    """
    from models import EnvSample, utcnow
    try:
        house = int(payload.get("house") or house_hint or 1)
    except (TypeError, ValueError):
        return
    row = EnvSample(
        house_id=house,
        ts=utcnow(),
        temp_c=_f(payload.get("temp")),
        rh=_f(payload.get("rh")),
        bed_rh=_f(payload.get("bed_rh")),
        feed_kg=_f(payload.get("feed_kg")),
        water_l=_f(payload.get("water_l")),
        nh3_ppm=_f(payload.get("nh3")),
        o2_pct=_f(payload.get("o2")),
        fan_pct=_f(payload.get("fan")),
        light_lux=_f(payload.get("light")),
        rssi=_f(payload.get("rssi")),
        health_json=json.dumps(payload["health"]) if isinstance(payload.get("health"), dict) else None,
    )
    with SessionLocal() as s:
        s.add(row)
        s.commit()


def _f(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None



def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return
    # climate topic: broilerlab/env/<house> → fast single-insert path
    parts = msg.topic.rstrip("/").split("/")
    if len(parts) >= 2 and parts[-2] == "env":
        _ingest_env(payload, parts[-1])
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
