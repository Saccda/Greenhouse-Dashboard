"""
Is the campus water meter's data arriving, and is anything listening?

    cd backend
    python scripts/check_water_feed.py
    python scripts/check_water_feed.py --wait 120

The meter publishes roughly once a DAY, not every 30 seconds like the status
topic, so "nothing on screen" is the normal state almost all of the time and
tells you nothing on its own. This answers the question that actually matters:
has anything EVER arrived, and would it be captured if it did.

It checks four things in the order a message travels:

  1. the broker   — subscribes briefly. A retained message means the last
                    publish is sitting there right now and a running bridge
                    would pick it up the moment it subscribes.
  2. InfluxDB     — the live store the dashboard reads.
  3. Postgres     — the long-term archive.
  4. the gap      — data in one and not the other localises the fault to a
                    single write path instead of "the water thing is broken".

Read-only. It subscribes and queries; it never publishes and never writes.
"""
import argparse
import os
import sys
import time
from datetime import datetime, timedelta

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import config
from services import influxdb_service

WATER_FIELDS = influxdb_service.WATER_FIELDS


def check_broker(wait: int) -> bool:
    """Subscribe briefly. Reports a retained message, or a live publish."""
    import paho.mqtt.client as mqtt

    seen = []
    topic = config.CAMPUS_WATER_MQTT_TOPIC

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            client.subscribe(topic, qos=1)
        else:
            print(f"   connect refused: {reason_code}")

    def on_message(client, userdata, msg):
        seen.append((msg.payload.decode("utf-8", "replace"), msg.retain))

    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    if config.MQTT_USERNAME:
        client.username_pw_set(config.MQTT_USERNAME, config.MQTT_PASSWORD)
    client.tls_set()
    client.on_connect = on_connect
    client.on_message = on_message

    print(f"\n1. BROKER — listening on {topic} for {wait}s")
    try:
        client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT, keepalive=30)
    except Exception as e:
        print(f"   could not reach the broker: {e}")
        return False
    client.loop_start()
    # sleep, not a spin. The original loop was `while ...: pass`, which pegs a
    # CPU core for the whole wait — rude anywhere, worse on the lab desktop
    # where this shares a machine with the bridge and Postgres.
    #
    # It also prints a countdown. A silent 60-second wait is indistinguishable
    # from a hang, and the first thing anyone does to a program that looks hung
    # is kill it — which here means killing it a second before the answer.
    deadline = datetime.now() + timedelta(seconds=wait)
    last_left = None
    while datetime.now() < deadline and not seen:
        left = int((deadline - datetime.now()).total_seconds())
        # Redraw only when the whole second changes. Polling at 4 Hz and
        # reprinting the same text four times over is noise in a captured log.
        if left != last_left:
            last_left = left
            print("   waiting... " + str(left) + "s left (Ctrl-C to stop early)",
                  end=chr(13), flush=True)
        time.sleep(0.25)
    print(chr(13) + " " * 60 + chr(13), end="", flush=True)
    client.loop_stop()
    client.disconnect()

    if not seen:
        print("   nothing arrived, and nothing is retained.")
        print("   This is EXPECTED between the meter's daily publishes. It only")
        print("   means trouble if InfluxDB below is also empty after a day or two.")
        return False
    payload, retained = seen[0]
    kind = "RETAINED (the broker was already holding it)" if retained else "published live just now"
    print(f"   got a message — {kind}")
    print(f"   {payload}")
    if retained:
        print("   A running bridge receives a retained message the instant it")
        print("   subscribes, so if InfluxDB below is empty, the bridge is not")
        print("   running or has not been restarted since the water topic was added.")
    return True


def check_influx() -> int:
    print("\n2. INFLUXDB — the store the dashboard reads")
    measurement = config.FARMS["campus"]["measurement"]
    df = influxdb_service.get_water_history(measurement, days=90)
    if df.empty:
        print(f"   no water_* fields in '{measurement}' in the last 90 days.")
        return 0
    print(f"   {len(df)} row(s), most recent first:")
    for _, row in df.tail(5).iloc[::-1].iterrows():
        vals = ", ".join(f"{f.replace('water_', '')}={row[f]}"
                         for f in WATER_FIELDS if f in row and row[f] == row[f])
        print(f"     {row['_time']}  {vals}")
    return len(df)


def check_postgres() -> int:
    print("\n3. POSTGRES — the long-term archive")
    url = config.POSTGRES_URL or config.POSTGRES_WRITE_URL
    if not url:
        print("   POSTGRES_URL is not set in this environment; skipped.")
        return -1
    try:
        import psycopg2
        with psycopg2.connect(url) as conn, conn.cursor() as cur:
            cur.execute(
                'SELECT field, count(*), max(time) FROM "' + config.POSTGRES_CAMPUS_TABLE + '" '
                "WHERE field LIKE 'water\\_%' GROUP BY field ORDER BY field"
            )
            rows = cur.fetchall()
    except Exception as e:
        msg = str(e)
        # These are different faults with different fixes, and calling both
        # "unreachable" sends someone to check the network when the database
        # answered perfectly well and simply said no.
        if "permission denied" in msg:
            print(f"   CONNECTED, but this role may not read the table:")
            print(f"     {msg.strip()}")
            print("   POSTGRES_URL is the read-only analysis role. The bridge")
            print("   creates the table as its own write role, and a table belongs")
            print("   to its creator, so the read role needs granting access once:")
            print(f'     GRANT SELECT ON "{config.POSTGRES_CAMPUS_TABLE}" TO <read_role>;')
            print(f"   Until then this section cannot see the archive, but the")
            print(f"   BRIDGE still writes to it fine — the two use different roles.")
            return -2
        print(f"   could not connect: {msg.strip()}")
        return -1
        return -1
    if not rows:
        print(f"   no water_* rows in '{config.POSTGRES_CAMPUS_TABLE}'.")
        return 0
    for field, n, newest in rows:
        print(f"     {field:26s} {n:4d} row(s), newest {newest}")
    return sum(n for _, n, _ in rows)


def check_bridge_log() -> int:
    """
    What the RUNNING bridge actually subscribed to.

    This is the question the other sections cannot answer. An MQTT subscription
    happens once, on connect, so a process started before the water topic was
    added is not listening to it however long it stays up and however correct
    the code on disk is. The subscribe line in its log is the only record of
    what the live process asked for.

    Returns 1 if the water topic is there, 0 if the line names only the status
    topic, -1 if no log could be read.
    """
    print("")
    print("0. BRIDGE — what the running process subscribed to")
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(here, "data", "campus-bridge.log"),
        os.path.join(here, "data", "campus-bridge-out.log"),
        os.path.join(here, "data", "service-out.log"),
    ]
    path = next((c for c in candidates if os.path.exists(c)), None)
    if not path:
        print("   no bridge log found. Looked in backend/data for:")
        for c in candidates:
            print("     " + os.path.basename(c))
        print("   If the service writes elsewhere, check its subscribe line by hand:")
        print("     nssm.exe get CampusMqttBridge AppStdout")
        return -1

    last = None
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                if "subscribing to" in line:
                    last = line.strip()
    except Exception as e:
        print(f"   could not read {path}: {e}")
        return -1

    if not last:
        print(f"   {os.path.basename(path)} has no 'subscribing to' line yet.")
        return -1
    print(f"   {last}")
    if config.CAMPUS_WATER_MQTT_TOPIC in last:
        print("   The running process IS subscribed to the water topic.")
        return 1
    print("   The water topic is NOT in that line. The running process predates")
    print("   the change, so restarting is what makes it take effect:")
    print("     nssm.exe restart CampusMqttBridge")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wait", type=int, default=20,
                    help="seconds to listen on the broker (default 20)")
    args = ap.parse_args()

    print("=" * 70)
    print("Campus water meter — feed check")
    print(f"  topic : {config.CAMPUS_WATER_MQTT_TOPIC}")
    meter = config.FARMS["campus"].get("water_meter") or {}
    print(f"  unit  : {meter.get('unit_label')} ({meter.get('liters_per_unit')} L each)")
    print("=" * 70)

    subscribed = check_bridge_log()
    check_broker(args.wait)
    influx = check_influx()
    postgres = check_postgres()

    print("\n4. WHAT THIS MEANS")
    if postgres == -1:
        print("   (Postgres could not be reached from here, so only the broker")
        print("    and InfluxDB are being judged.)")
    elif postgres == -2:
        print("   (The archive exists but this role cannot read it. That blocks")
        print("    THIS CHECK only — the bridge writes with a different role.)")
    if influx == 0 and postgres <= 0:
        print("   Nothing has been stored anywhere yet.")
        if subscribed == 0:
            print("   Section 0 found the cause: the running bridge is not")
            print("   subscribed to the water topic. Restart it.")
        elif subscribed == 1:
            print("   The bridge IS subscribed, and nothing is retained on the")
            print("   broker, so the meter has not published since it connected.")
            print("   That is expected for a once-a-day topic and is not a fault")
            print("   yet. Give it a day, then run this again.")
            print("   To settle it sooner, trigger a publish from the ESP32 while")
            print("   this is listening, or ask for the retain flag below.")
        else:
            print("   Could not read the bridge log, so it is unknown whether the")
            print("   running process is subscribed to the water topic at all.")
            print("   Check its subscribe line, then restart it if the water topic")
            print("   is missing: nssm.exe restart CampusMqttBridge")
    elif influx > 0 and postgres == 0:
        print("   InfluxDB has it, Postgres does not. The bridge IS receiving the")
        print("   messages; only the archive write is failing. That is by design —")
        print("   the archive is never allowed to interfere with the live feed — so")
        print("   look for 'Postgres archive write failed' in the bridge's log.")
    elif influx == 0 and postgres > 0:
        print("   Postgres has it, InfluxDB does not, which is the reverse of the")
        print("   expected failure. Check the InfluxDB token and bucket.")
    elif influx > 0:
        print("   Both stores have water data. The pipeline works end to end.")
        print("   The dashboard card appears on Historical for PP Campus.")
    print("")
    print("5. WORTH ASKING THE FIRMWARE TEAM FOR")
    print("   Publish the water topic with the RETAIN flag set.")
    print("   MQTT delivers a message to whoever is subscribed AT THAT MOMENT.")
    print("   On the status topic, publishing every 30s, a miss costs one sample")
    print("   out of thousands. On a topic that publishes once a DAY, a miss")
    print("   during a restart, a deploy or a network blip costs the whole day,")
    print("   and it cannot be recovered afterwards.")
    print("   A retained message is held by the broker and handed to every new")
    print("   subscriber immediately, so the latest reading survives all of it.")
    print("   One flag on the publish call, and this failure mode is gone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
