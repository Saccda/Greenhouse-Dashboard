"""
One-shot MQTT publish helper — connect, publish, disconnect.

Used for sending direct control commands to devices that take MQTT commands
straight from the backend (currently just the PP Campus rig's relay channels)
rather than being proxied through Node-RED like Kampot/Kep's threshold
setpoints (see routes/setpoint.py). A short-lived connection per call is
deliberate: this only runs on-demand from an HTTP request, unlike
scripts/campus_mqtt_bridge.py's always-on subscriber, so there's no
persistent connection to manage here.
"""
import json

import paho.mqtt.client as mqtt

import config


def publish(topic: str, payload: dict, timeout: float = 5.0) -> None:
    """Connect, publish one message (QoS 1, not retained), wait for delivery, disconnect."""
    if not config.MQTT_BROKER_HOST:
        raise RuntimeError("MQTT_BROKER_HOST is not configured — fill in backend/.env")

    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    if config.MQTT_USERNAME:
        client.username_pw_set(config.MQTT_USERNAME, config.MQTT_PASSWORD)
    client.tls_set()

    client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT, keepalive=int(timeout * 2))
    client.loop_start()
    try:
        info = client.publish(topic, json.dumps(payload), qos=1)
        info.wait_for_publish(timeout=timeout)
        if not info.is_published():
            raise RuntimeError(f"publish to {topic} did not complete within {timeout}s")
    finally:
        client.loop_stop()
        client.disconnect()
