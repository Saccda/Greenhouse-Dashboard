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
        print(f"   could not query: {e}")
        return -1
    if not rows:
        print(f"   no water_* rows in '{config.POSTGRES_CAMPUS_TABLE}'.")
        return 0
    for field, n, newest in rows:
        print(f"     {field:26s} {n:4d} row(s), newest {newest}")
    return sum(n for _, n, _ in rows)


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

    check_broker(args.wait)
    influx = check_influx()
    postgres = check_postgres()

    print("\n4. WHAT THIS MEANS")
    if postgres == -1:
        print("   (Postgres was not reachable from here, so only the broker and")
        print("    InfluxDB are being judged. Run this on the lab desktop, where")
        print("    the archive lives, to check that half.)")
    if influx == 0 and postgres <= 0:
        print("   Nothing has been stored anywhere yet.")
        print("   Most likely the bridge has not been RESTARTED since the water")
        print("   topic was added — a subscription is not retroactive, so a")
        print("   process that started before the change is not listening to")
        print("   this topic at all, however long it stays up.")
        print("   Restart the campus bridge service, then run this again.")
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
