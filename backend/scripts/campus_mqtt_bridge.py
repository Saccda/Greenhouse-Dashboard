"""
Campus MQTT -> InfluxDB bridge — bypasses Node-RED for the PP Campus rig only.

Kampot/Kep keep streaming through Node-RED completely unchanged; this is a
separate, additive process that subscribes to the campus controller's own
MQTT topic and writes straight to InfluxDB Cloud. Run as its own always-on
service (see WINDOWS_SERVICE.md for the NSSM pattern already used for the
backend and the Cloudflare tunnel) so a crash or restart here can never
affect the GreenhouseBackend API serving live Kampot/Kep dashboards.

    cd backend
    python scripts/campus_mqtt_bridge.py

Expects one MQTT message per campus topic publish, shaped like:
    {"ID": "Device01", "CH1": 1, "CH2": 0, ..., "CH8": 0,
     "Temperature": 35.2, "Humidity": 60.5}

Writes one InfluxDB point per message to config.FARMS["campus"]["measurement"]:
  - "ID" becomes a tag (indexed identifier), not a field — it isn't a
    measured value, and tagging it is what makes filtering by device
    possible later if a second campus device ever gets added.
  - "Temperature"/"Humidity" are written lowercase ("temperature"/
    "humidity") to match the field names Kampot/Kep already use — the rest
    of the backend (get_history's field filter, alert_checker, the frontend's
    `readings.temperature`) all key off that existing lowercase convention.
  - "CH1".."CH8" are written literally as-is (config.FARM_CHANNELS["campus"]
    keys) since there's no prior convention for these — brand new fields.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import paho.mqtt.client as mqtt  # noqa: E402
from influxdb_client import InfluxDBClient, Point  # noqa: E402
from influxdb_client.client.write_api import SYNCHRONOUS  # noqa: E402

import config  # noqa: E402

MEASUREMENT     = config.FARMS["campus"]["measurement"]
CHANNEL_FIELDS  = list(config.FARM_CHANNELS["campus"].keys())  # CH1..CH8, literal
# (payload key, InfluxDB field name) — temp/humidity are renamed to match the
# lowercase convention Kampot/Kep already use; channels keep their literal name.
RENAMED_FIELDS  = [("Temperature", "temperature"), ("Humidity", "humidity")]
LITERAL_FIELDS  = [(k, k) for k in CHANNEL_FIELDS]


def _write_point(payload: dict) -> None:
    point = Point(MEASUREMENT)

    device_id = payload.get("ID")
    if device_id is not None:
        point = point.tag("device_id", str(device_id))

    written_any = False
    for payload_key, influx_field in [*RENAMED_FIELDS, *LITERAL_FIELDS]:
        value = payload.get(payload_key)
        if value is not None:
            point = point.field(influx_field, value)
            written_any = True

    if not written_any:
        print(f"[campus-mqtt-bridge] payload had none of the expected fields, skipped: {payload}")
        return

    with InfluxDBClient(url=config.INFLUXDB_URL, token=config.INFLUXDB_TOKEN, org=config.INFLUXDB_ORG) as client:
        client.write_api(write_options=SYNCHRONOUS).write(bucket=config.INFLUXDB_BUCKET, record=point)


def _on_connect(client: mqtt.Client, userdata, flags, reason_code, properties=None) -> None:
    if reason_code == 0:
        print(f"[campus-mqtt-bridge] connected to {config.MQTT_BROKER_HOST}, subscribing to {config.CAMPUS_MQTT_TOPIC}")
        client.subscribe(config.CAMPUS_MQTT_TOPIC)
    else:
        print(f"[campus-mqtt-bridge] connect failed: {reason_code}")


def _on_disconnect(client: mqtt.Client, userdata, flags, reason_code, properties=None) -> None:
    print(f"[campus-mqtt-bridge] disconnected: {reason_code} — paho will auto-reconnect")


def _on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage) -> None:
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f"[campus-mqtt-bridge] bad payload on {msg.topic}: {e}")
        return

    try:
        _write_point(payload)
    except Exception as e:
        print(f"[campus-mqtt-bridge] InfluxDB write failed: {e}")


def main() -> None:
    if not config.MQTT_BROKER_HOST:
        raise SystemExit("MQTT_BROKER_HOST is not set — fill in backend/.env first (see .env.example)")

    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    if config.MQTT_USERNAME:
        client.username_pw_set(config.MQTT_USERNAME, config.MQTT_PASSWORD)
    client.tls_set()  # HiveMQ Cloud requires TLS on the 8883 port

    client.on_connect    = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message    = _on_message

    client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT, keepalive=60)
    client.loop_forever(retry_first_connection=True)


if __name__ == "__main__":
    main()
