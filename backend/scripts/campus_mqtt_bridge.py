"""
Campus MQTT -> InfluxDB + Postgres bridge — bypasses Node-RED for PP Campus.

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

Postgres archive
----------------
Kampot reaches Postgres through Node-RED; campus has no such wiring, so campus
had no archive at all — only InfluxDB Cloud, which is a rolling ~30-day window,
not a historical store. Without this, campus can never accumulate the multi-month
history the ML work needs (ML_METHODOLOGY.md 0.4).

No network change is required for this. Postgres runs on this same machine and
is reached over loopback; this process already dials OUT to HiveMQ and InfluxDB.
Nothing in this architecture accepts an inbound connection.

The archive is strictly secondary to the live feed:

  - It is optional. No POSTGRES_URL means the bridge logs once and carries on
    exactly as before.
  - InfluxDB is written FIRST. The dashboard depends on it; the archive does not.
  - A Postgres failure is caught, logged and swallowed. A database that is down,
    full, or mid-restart must never cost us live campus telemetry or stall the
    MQTT loop — the archive can miss rows, the dashboard cannot.
"""
import json
import os
import sys
from datetime import datetime

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


# ── Postgres archive ────────────────────────────────────────────────────────
#
# Long format: one row per (time, farm, field, value) rather than a column per
# channel. Three reasons:
#   1. Kampot has relay1-3 and campus has CH1-8, so no single wide table fits
#      both; long format lets one table hold every farm.
#   2. CH5-CH8 are still "Not yet assigned". Renaming one later is a data change
#      here, not a schema migration.
#   3. It is the shape InfluxDB itself uses, so the two stores stay comparable.

_pg_conn = None          # lazily opened, reopened on failure
_pg_disabled = False     # set once if unconfigured or structurally unusable

_REQUIRED_COLUMNS = {"time", "farm", "device_id", "field", "value"}


def _pg_table() -> str:
    return config.POSTGRES_CAMPUS_TABLE


def _pg_connect():
    """Open a connection and ensure the archive table exists. None on failure."""
    global _pg_disabled
    if _pg_disabled or not config.POSTGRES_URL:
        return None
    try:
        import psycopg2
    except ImportError:
        print("[campus-mqtt-bridge] psycopg2 not installed - archive disabled, "
              "live feed unaffected. Fix: pip install -r requirements.txt")
        _pg_disabled = True
        return None

    conn = psycopg2.connect(config.POSTGRES_URL)
    conn.autocommit = True
    table = _pg_table()
    with conn.cursor() as cur:
        cur.execute(
            'CREATE TABLE IF NOT EXISTS "' + table + '" ('
            '  time      timestamptz      NOT NULL,'
            '  farm      text             NOT NULL,'
            '  device_id text,'
            '  field     text             NOT NULL,'
            '  value     double precision NOT NULL'
            ')'
        )
        cur.execute(
            'CREATE INDEX IF NOT EXISTS "' + table + '_farm_field_time_idx" '
            'ON "' + table + '" (farm, field, time DESC)'
        )
        # CREATE TABLE IF NOT EXISTS is silent when a table of that name already
        # exists with a DIFFERENT shape - e.g. if the name collides with one the
        # Node-RED flow owns. Every insert would then fail, one log line per
        # message, forever. Check the shape once and disable instead.
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = %s",
            (table,),
        )
        missing = _REQUIRED_COLUMNS - {r[0] for r in cur.fetchall()}
        if missing:
            print("[campus-mqtt-bridge] table '" + table + "' exists but is "
                  "missing " + str(sorted(missing)) + " - archive disabled, live "
                  "feed unaffected. Set POSTGRES_CAMPUS_TABLE to a free name.")
            _pg_disabled = True
            conn.close()
            return None
    return conn


def _write_postgres(payload: dict, ts: datetime) -> None:
    """Archive one message. Raises on failure; the caller swallows it."""
    global _pg_conn
    if _pg_disabled or not config.POSTGRES_URL:
        return

    device_id = payload.get("ID")
    device_id = str(device_id) if device_id is not None else None

    rows = []
    for payload_key, field in RENAMED_FIELDS + LITERAL_FIELDS:
        value = payload.get(payload_key)
        if value is not None:
            # double precision throughout, channels included. Postgres does not
            # lock a column's type from its first write the way InfluxDB does,
            # so one numeric type for everything keeps the table uniform and
            # costs nothing.
            rows.append((ts, "campus", device_id, field, float(value)))
    if not rows:
        return

    if _pg_conn is None or _pg_conn.closed:
        _pg_conn = _pg_connect()
        if _pg_conn is None:
            return
    try:
        with _pg_conn.cursor() as cur:
            cur.executemany(
                'INSERT INTO "' + _pg_table() + '" '
                "(time, farm, device_id, field, value) VALUES (%s, %s, %s, %s, %s)",
                rows,
            )
    except Exception:
        # Most likely the connection died between messages. Drop it so the next
        # message reconnects rather than reusing a broken handle.
        try:
            _pg_conn.close()
        except Exception:
            pass
        _pg_conn = None
        raise


def _write_point(payload: dict) -> None:
    point = Point(MEASUREMENT)

    device_id = payload.get("ID")
    if device_id is not None:
        point = point.tag("device_id", str(device_id))

    written_any = False
    # Explicit type casts matter: InfluxDB locks a field's type from its first-
    # ever write and rejects any later write where the same field arrives as a
    # different type. json.loads() gives an int for a whole-number JSON literal
    # (e.g. the ESP32 sending "Humidity": 72) and a float for "72.3" — without
    # forcing a consistent type here, the very next reading that happens to
    # round to a whole number silently poisons the schema for every future
    # decimal reading (this is exactly what happened the first time this ran).
    for payload_key, influx_field in RENAMED_FIELDS:
        value = payload.get(payload_key)
        if value is not None:
            point = point.field(influx_field, float(value))
            written_any = True
    for payload_key, influx_field in LITERAL_FIELDS:
        value = payload.get(payload_key)
        if value is not None:
            point = point.field(influx_field, int(value))
            written_any = True

    if not written_any:
        print(f"[campus-mqtt-bridge] payload had none of the expected fields, skipped: {payload}")
        return

    with InfluxDBClient(url=config.INFLUXDB_URL, token=config.INFLUXDB_TOKEN, org=config.INFLUXDB_ORG) as client:
        client.write_api(write_options=SYNCHRONOUS).write(bucket=config.INFLUXDB_BUCKET, record=point)

    summary = ", ".join(f"{k}={v}" for k, v in payload.items() if k != "ID")
    print(f"[campus-mqtt-bridge] wrote point ({MEASUREMENT}): {summary}")


def _on_connect(client: mqtt.Client, userdata, flags, reason_code, properties=None) -> None:
    if reason_code == 0:
        # session_present (flags["session present"]) tells us whether the broker
        # actually remembered us from before — if the last run ended with a
        # clean disconnect (or this is the very first run), it won't, and this
        # subscribe is required again even with clean_session=False.
        print(
            f"[campus-mqtt-bridge] connected to {config.MQTT_BROKER_HOST} "
            f"(session_present={flags.session_present}), subscribing to {config.CAMPUS_MQTT_TOPIC}"
        )
        client.subscribe(config.CAMPUS_MQTT_TOPIC, qos=1)
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

    # InfluxDB first: the live dashboard reads from it. The archive is
    # secondary and is never allowed to interfere with the write above.
    try:
        _write_point(payload)
    except Exception as e:
        print(f"[campus-mqtt-bridge] InfluxDB write failed: {e}")

    try:
        _write_postgres(payload, datetime.now(config.TIMEZONE))
    except Exception as e:
        print(f"[campus-mqtt-bridge] Postgres archive write failed (live feed "
              f"unaffected): {e}")


def main() -> None:
    if not config.MQTT_BROKER_HOST:
        raise SystemExit("MQTT_BROKER_HOST is not set — fill in backend/.env first (see .env.example)")

    # Fixed client_id + clean_session=False: lets the broker hold a *persistent
    # session* for this specific bridge. Combined with the QoS-1 subscribe in
    # _on_connect, this means if the bridge itself is briefly offline (restart,
    # deploy, a network blip) while the ESP32 keeps publishing, the broker
    # queues those messages and delivers them the moment the bridge reconnects
    # — instead of silently losing whatever was published during that gap.
    # (This only protects against *the bridge's* downtime, not the ESP32's own
    # connectivity — nothing can recover a message the device never sent.)
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="campus-mqtt-bridge",
        clean_session=False,
    )
    if config.MQTT_USERNAME:
        client.username_pw_set(config.MQTT_USERNAME, config.MQTT_PASSWORD)
    client.tls_set()  # HiveMQ Cloud requires TLS on the 8883 port

    client.on_connect    = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message    = _on_message

    if config.POSTGRES_URL:
        print(f"[campus-mqtt-bridge] archiving to Postgres table "
              f"'{_pg_table()}' (loopback; not exposed)")
    else:
        print("[campus-mqtt-bridge] POSTGRES_URL not set - InfluxDB only, no "
              "archive. Campus history limited to the ~30-day cloud window.")

    client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT, keepalive=60)
    client.loop_forever(retry_first_connection=True)


if __name__ == "__main__":
    main()
