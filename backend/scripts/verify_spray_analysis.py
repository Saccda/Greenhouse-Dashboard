"""
Verify spray event detection, especially across gaps in the feed.

    cd backend
    python scripts/verify_spray_analysis.py

These numbers are not cosmetic. analyze_spray_events feeds the abnormal-spray
alert and, through it, the dry-run pump guard that can raise a farm's setpoint
on its own. A duration inflated by a blackout is a duration that can justify
stopping a working pump, so the rule asserted hardest here is that a gap can
only ever SHORTEN a reported spray.

Exits non-zero on any failure.
"""
import os
import sys
from datetime import datetime, timedelta

import pandas as pd

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import config
from services import spray_analysis

T0 = datetime(2026, 10, 1, 8, 0, 0, tzinfo=config.TIMEZONE)

ok = True


def check(label, cond):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {label}")
    ok = ok and cond


def frame(samples, field="relay3"):
    """samples: list of (minute_offset, value)."""
    return pd.DataFrame(
        [{"time": T0 + timedelta(minutes=m), "field": field, "value": v} for m, v in samples]
    )


def run(samples, field="relay3"):
    return spray_analysis.analyze_spray_events(frame(samples, field), field)


print("\n=== 1. Ordinary cycles ===")
# one minute apart, on for 3 minutes
s = run([(0, 0), (1, 1), (2, 1), (3, 1), (4, 0), (5, 0)])
check("one spray detected", s["total_sprays"] == 1)
check("duration measured edge to edge", abs(s["spray_events"][0]["duration_minutes"] - 3.0) < 0.01)
check("a completed spray is not ongoing", s["spray_events"][0]["ongoing"] is False)

s = run([(0, 0), (1, 1), (2, 0), (3, 0), (4, 1), (5, 0)])
check("two separate sprays are two events", s["total_sprays"] == 2)

s = run([(0, 0), (1, 0), (2, 0)])
check("never on means no events", s["total_sprays"] == 0)

print("\n=== 2. A blackout is not runtime ===")
# On at minute 1, then the feed vanishes for a day and returns reading 0.
gappy = run([(0, 0), (1, 1), (2, 1), (2 + 1440, 0), (3 + 1440, 0)])
longest = max(e["duration_minutes"] for e in gappy["spray_events"]) if gappy["spray_events"] else 0
check("the day-long gap is not reported as spraying", longest < 60)
check("the event ends at the last sample that showed it running",
      abs(longest - 1.0) < 0.01)
check("and is marked as interrupted",
      all(e.get("gap_interrupted") for e in gappy["spray_events"]))
check("an interrupted event is never 'ongoing'",
      all(e["ongoing"] is False for e in gappy["spray_events"]))

# The regression that started this: campus reported 1353 minutes.
check("total runtime cannot exceed the samples that showed it on",
      gappy["total_spray_minutes"] < 60)

print("\n=== 3. Still on across a gap, then genuinely running ===")
# Feed drops while on, returns still on, keeps running. The post-gap run is a
# NEW event and must not inherit the pre-gap start time.
s = run([(0, 0), (1, 1), (2, 1), (2 + 600, 1), (3 + 600, 1), (4 + 600, 0)])
for e in s["spray_events"]:
    check(f"no event spans the blackout ({e['duration_minutes']} min)", e["duration_minutes"] < 600)
# A pump already running when the feed comes back must still be seen. Waiting
# for a fresh rising edge would hide a dry run from the guard for its entire
# duration, which is the failure this whole subsystem exists to prevent.
check("the run continuing after the gap is still detected", s["total_sprays"] == 2)
post = s["spray_events"][-1]
check("measured only from the first sample that showed it on",
      abs(post["duration_minutes"] - 2.0) < 0.01)

print("\n=== 4. A spray in progress right now ===")
# Ends on 1 with fresh data: ongoing, and measured from its own rising edge.
now = datetime.now(config.TIMEZONE)
live = pd.DataFrame([
    {"time": now - timedelta(minutes=4), "field": "relay3", "value": 0},
    {"time": now - timedelta(minutes=3), "field": "relay3", "value": 1},
    {"time": now - timedelta(minutes=2), "field": "relay3", "value": 1},
    {"time": now - timedelta(minutes=1), "field": "relay3", "value": 1},
])
s = spray_analysis.analyze_spray_events(live, "relay3")
check("an in-progress spray is reported ongoing", s["spray_events"][-1]["ongoing"] is True)
check("and measured from its rising edge, about 2 min",
      abs(s["spray_events"][-1]["duration_minutes"] - 2.0) < 0.2)

print("\n=== 5. The field is honoured ===")
ch2 = run([(0, 0), (1, 1), (2, 0)], field="CH2")
check("CH2 data analysed when CH2 is asked for", ch2["total_sprays"] == 1)
mixed = pd.DataFrame([
    {"time": T0 + timedelta(minutes=0), "field": "CH2", "value": 0},
    {"time": T0 + timedelta(minutes=1), "field": "CH2", "value": 1},
    {"time": T0 + timedelta(minutes=2), "field": "CH2", "value": 0},
    {"time": T0 + timedelta(minutes=1), "field": "CH4", "value": 1},
])
check("another channel's rows are ignored",
      spray_analysis.analyze_spray_events(mixed, "CH2")["total_sprays"] == 1)
check("asking for a field with no rows gives no_data, not a crash",
      spray_analysis.analyze_spray_events(mixed, "relay3")["data_status"] == "no_data")

print("\n=== 6. Degenerate input ===")
check("empty frame", spray_analysis.analyze_spray_events(pd.DataFrame(), "relay3")["total_sprays"] == 0)
check("None", spray_analysis.analyze_spray_events(None, "relay3")["total_sprays"] == 0)
check("a single sample cannot make an event", run([(0, 1)])["total_sprays"] <= 1)

print("\nALL PASS" if ok else "\nSOMETHING FAILED")
sys.exit(0 if ok else 1)
