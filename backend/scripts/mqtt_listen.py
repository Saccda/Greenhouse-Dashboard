"""
Listen to the campus MQTT topics and report exactly what arrives.

Two jobs:

  1. DISCOVER A PAYLOAD. Before anything can be stored or displayed, we need to
     know the shape of the JSON a device actually publishes. Guessing produces
     a parser that works until the first real message.

  2. MEASURE THE FEED. Campus has been publishing 1-2 messages a day against an
     expected ~750, and the open question is whether that is the ESP32, the
     network, or the broker. This shows, per topic, how many messages arrive and
     how far apart they are — which answers it from the broker's side.

    cd backend
    python scripts/mqtt_listen.py                          # 2 min, all topics
    python scripts/mqtt_listen.py --seconds 3600           # an hour
    python scripts/mqtt_listen.py --topic "RUPP_CAMPUS_1/phnom_penh/water_data"
    python scripts/mqtt_listen.py --seconds 43200 --log capture.jsonl

A note on what you will see immediately: messages that appear the instant this
connects are RETAINED — the broker's stored copy of the last value on that
topic, not something published just now. They are marked as such, because
mistaking a retained message for live traffic is the easiest way to conclude a
dead feed is healthy.

Uses its own client_id and a clean session, so the production bridge's
persistent session is never disturbed. Reusing "campus-mqtt-bridge" would kick
the real bridge off the broker.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from collections import defaultdict
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import paho.mqtt.client as mqtt

import config

_counts: dict[str, int] = defaultdict(int)
_last_seen: dict[str, float] = {}
_gaps: dict[str, list[float]] = defaultdict(list)
_started = time.time()
_log_file = None


def _on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code != 0:
        print(f"connect failed: {reason_code}")
        return
    topic = userdata["topic"]
    print(f"connected to {config.MQTT_BROKER_HOST}, subscribing to {topic}")
    print(f"listening for {userdata['seconds']}s — Ctrl+C to stop early\n")
    client.subscribe(topic, qos=0)


def _on_message(client, userdata, msg):
    now = time.time()
    body = msg.payload.decode("utf-8", "replace")

    # Anything arriving in the first couple of seconds is the broker replaying
    # its retained value, not live traffic.
    retained = bool(msg.retain) or (now - _started) < 2.0

    if msg.topic in _last_seen:
        _gaps[msg.topic].append(now - _last_seen[msg.topic])
    _last_seen[msg.topic] = now
    _counts[msg.topic] += 1

    tag = "  [RETAINED — broker's stored copy, not live]" if retained else ""
    print(f"[{datetime.now():%H:%M:%S}] {msg.topic}{tag}")

    try:
        parsed = json.loads(body)
        print(f"    {json.dumps(parsed, separators=(',', ':'))}")
        if _counts[msg.topic] == 1:
            print(f"    fields: {', '.join(f'{k}:{type(v).__name__}' for k, v in parsed.items())}")
    except json.JSONDecodeError:
        print(f"    (not JSON) {body[:300]}")

    if _log_file:
        _log_file.write(json.dumps({
            "received_at": datetime.now(config.TIMEZONE).isoformat(),
            "topic": msg.topic, "retained": retained, "payload": body,
        }) + "\n")
        _log_file.flush()   # flushed per message so a long run survives a kill


def main():
    global _log_file

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--topic", default="RUPP_CAMPUS_1/#",
                    help="topic filter; the default wildcard catches every campus topic")
    ap.add_argument("--seconds", type=int, default=120)
    ap.add_argument("--log", metavar="PATH",
                    help="append every message to this file as JSON lines")
    args = ap.parse_args()

    if not config.MQTT_BROKER_HOST:
        sys.exit("MQTT_BROKER_HOST is not set — fill in backend/.env first.")
    if args.log:
        _log_file = open(args.log, "a", encoding="utf-8")

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"claude-listen-{uuid.uuid4().hex[:8]}",
        clean_session=True,
        userdata={"topic": args.topic, "seconds": args.seconds},
    )
    if config.MQTT_USERNAME:
        client.username_pw_set(config.MQTT_USERNAME, config.MQTT_PASSWORD)
    client.tls_set()
    client.on_connect = _on_connect
    client.on_message = _on_message

    client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT, keepalive=30)
    client.loop_start()
    try:
        time.sleep(args.seconds)
    except KeyboardInterrupt:
        print("\nstopped early")
    client.loop_stop()
    client.disconnect()
    if _log_file:
        _log_file.close()

    elapsed = time.time() - _started
    print("\n" + "=" * 70)
    print(f"Summary over {elapsed / 60:.1f} min")
    print("=" * 70)
    if not _counts:
        print("  NOTHING received — not even a retained value.")
        print("  Either no device has ever published here, or the topic is wrong.")
        return
    for topic in sorted(_counts):
        n = _counts[topic]
        gaps = _gaps[topic]
        line = f"  {topic}\n      {n} message(s)"
        if gaps:
            line += f", gap median {sorted(gaps)[len(gaps) // 2]:.0f}s, max {max(gaps):.0f}s"
        elif n == 1:
            line += " (one only — most likely the retained value, i.e. no live traffic)"
        print(line)


if __name__ == "__main__":
    main()
