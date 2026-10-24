"""
Verify the campus bridge routes each topic to the right place.

    cd backend
    python scripts/verify_campus_routing.py

Five topics now arrive on one connection and they are not interchangeable: two
are measurements to store, two are the controller stating its own
configuration, and one of the measurements arrives twelve times faster than
everything else and must be thinned before it is written.

Routing is done on the TOPIC rather than the payload's shape, and this asserts
that, because the failure mode is quiet: a setpoint status misfiled as a
reading would write temp_high1 into the measurement series and look like a
sensor spike, and a water temperature written on every message would be 17,280
points a day for one field.

InfluxDB, Postgres and the clock are stubbed. Nothing is written anywhere and
no connection is opened.
"""
import importlib.util
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import config

_spec = importlib.util.spec_from_file_location("bridge", os.path.join(_HERE, "campus_mqtt_bridge.py"))
bridge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bridge)

# ── Stubs ───────────────────────────────────────────────────────────────────
WRITES: list[tuple] = []
PG: list[tuple] = []

bridge._write_point = lambda payload, spec=None: WRITES.append((payload, spec))
bridge._write_postgres = lambda payload, ts, spec=None: PG.append((payload, spec))

_tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
_tmp.close()
bridge.REPORTED_SETPOINTS_PATH = _tmp.name


class Msg:
    def __init__(self, topic, payload):
        self.topic = topic
        self.payload = json.dumps(payload).encode()


def send(topic, payload):
    bridge._on_message(None, None, Msg(topic, payload))


ok = True


def check(label, cond):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {label}")
    ok = ok and cond


def reset():
    WRITES.clear()
    PG.clear()
    bridge._last_fast_write.clear()


STATUS = {"ID": "Device01", "CH1": 0, "CH2": 1, "CH3": 0, "CH4": 1,
          "CH5": 0, "CH6": 0, "CH7": 0, "CH8": 0, "Temperature": 31.0, "Humidity": 77.4}
WATER = {"Start_totalizer": 15, "Last_totalizer": 17, "Day_consumption": 2}
WTEMP = {"ID": "Device01", "Water_Temperature": 31.5}
SETPOINTS = {"temp_high1": 34.5, "temp_low1": 33, "temp_high2": 36,
             "temp_low2": 35, "hum_low3": 40, "hum_high3": 60}
WSETPOINT = {"Set_water_temp": 34.6}

print("\n=== 1. Measurements are stored ===")
reset()
send(config.CAMPUS_MQTT_TOPIC, STATUS)
check("status writes a point", len(WRITES) == 1 and WRITES[0][1] is None)
check("status reaches the archive too", len(PG) == 1)

reset()
send(config.CAMPUS_WATER_MQTT_TOPIC, WATER)
check("water meter writes with the meter field spec",
      len(WRITES) == 1 and WRITES[0][1] == bridge.WATER_FIELDS)

reset()
send(config.CAMPUS_WATER_TEMP_TOPIC, WTEMP)
check("water temperature writes with its own field spec",
      len(WRITES) == 1 and WRITES[0][1] == bridge.WATER_TEMP_FIELDS)
check("and maps Water_Temperature -> water_temperature",
      bridge.WATER_TEMP_FIELDS == [("Water_Temperature", "water_temperature")])

print("\n=== 2. The 5-second probe is thinned ===")
reset()
for _ in range(12):           # a minute of readings at 5 s
    send(config.CAMPUS_WATER_TEMP_TOPIC, WTEMP)
check("twelve rapid readings store only one", len(WRITES) == 1)

bridge._last_fast_write[config.CAMPUS_WATER_TEMP_TOPIC] = (
    datetime.now(config.TIMEZONE)
    - timedelta(seconds=config.CAMPUS_WATER_TEMP_MIN_INTERVAL_S + 1)
)
send(config.CAMPUS_WATER_TEMP_TOPIC, WTEMP)
check("once the interval has passed, the next one is stored", len(WRITES) == 2)
check("the thinning never applies to the status feed",
      (reset() or send(config.CAMPUS_MQTT_TOPIC, STATUS) or True)
      and (send(config.CAMPUS_MQTT_TOPIC, STATUS) or True) and len(WRITES) == 2)

print("\n=== 3. Setpoint status is state, not a measurement ===")
reset()
send(config.CAMPUS_SETPOINT_STATUS_TOPIC, SETPOINTS)
check("relay setpoints are NOT written as a reading", len(WRITES) == 0)
check("and do not reach the archive either", len(PG) == 0)
stored = json.load(open(_tmp.name))
check("they are recorded as reported state", stored["relay_setpoints"]["values"] == SETPOINTS)
check("with a timestamp", "reported_at" in stored["relay_setpoints"])

reset()
send(config.CAMPUS_WATER_SETPOINT_STATUS_TOPIC, WSETPOINT)
check("water setpoint is NOT written as a reading", len(WRITES) == 0)
stored = json.load(open(_tmp.name))
check("water setpoint recorded separately",
      stored["water_setpoint"]["values"] == WSETPOINT)
check("recording one does not erase the other",
      stored["relay_setpoints"]["values"] == SETPOINTS)

print("\n=== 4. Rubbish does not reach the store ===")
reset()
bridge._on_message(None, None, type("M", (), {"topic": config.CAMPUS_MQTT_TOPIC,
                                              "payload": b"not json"})())
check("a malformed payload is dropped, not written", len(WRITES) == 0)

reset()
send("RUPP_CAMPUS_1/phnom_penh/something/else", {"x": 1})
check("an unknown topic falls through to the status path",
      len(WRITES) == 1 and WRITES[0][1] is None)

# ── 5. Energy and soil, each on its own topic ───────────────────────────────
# Three sensors arrived at once, on three topics, with payload keys that look
# nothing like the field names they are stored under. A mapping error here is
# invisible: the write succeeds, the field is simply absent, and the chart
# shows a sensor that is "fitted but never reported".
print("\n=== 5. Energy and soil route to their own fields ===")
ENERGY = {"voltage": 222.37, "current": 0.07, "power_w": 0}
NPK = {"nitrogen": 2, "phosphorus": 3, "potassium": 6}
MOIST = {"soil_moisture": 0.2, "soil_temperature": 34.5}

reset()
send(config.CAMPUS_ENERGY_TOPIC, ENERGY)
check("energy writes with the meter's own field spec",
      len(WRITES) == 1 and WRITES[0][1] == bridge.ENERGY_FIELDS)

reset()
send(config.CAMPUS_SOIL_NPK_TOPIC, NPK)
check("NPK writes with the NPK field spec", len(WRITES) == 1)
check("and renames nitrogen -> soil_nitrogen, not nitrogen",
      dict(WRITES[0][1]) == {"nitrogen": "soil_nitrogen",
                             "phosphorus": "soil_phosphorus",
                             "potassium": "soil_potassium"})

reset()
send(config.CAMPUS_SOIL_MOISTURE_TOPIC, MOIST)
check("moisture and soil temperature share one topic and one spec",
      len(WRITES) == 1 and dict(WRITES[0][1]) == {"soil_moisture": "soil_moisture",
                                                  "soil_temperature": "soil_temperature"})

check("the two soil topics do NOT share a field spec",
      bridge.SOIL_BY_TOPIC[config.CAMPUS_SOIL_NPK_TOPIC]
      != bridge.SOIL_BY_TOPIC[config.CAMPUS_SOIL_MOISTURE_TOPIC])

print("\n=== 6. Fast feeds are thinned independently ===")
reset()
for _ in range(6):
    send(config.CAMPUS_ENERGY_TOPIC, ENERGY)
    send(config.CAMPUS_SOIL_NPK_TOPIC, NPK)
# One each, not one between them: a shared clock would let the 5-second feed
# consume the window and leave the 10-second one mostly unrecorded.
check("energy and soil each store one, not one in total", len(WRITES) == 2)

reset()
for _ in range(4):
    send(config.CAMPUS_MQTT_TOPIC, STATUS)
check("the status feed is never thinned", len(WRITES) == 4)

reset()
for _ in range(3):
    send(config.CAMPUS_WATER_MQTT_TOPIC, WATER)
# The meter reports once per cubic metre; a dropped message is a missing day.
check("the water meter is never thinned", len(WRITES) == 3)

print("\n=== 7. Soil no longer rides on the status payload ===")
reset()
send(config.CAMPUS_MQTT_TOPIC, {**STATUS, "soil_moisture": 99})
# Guarding the old arrangement: soil used to be expected inside the status
# message, and a stray key there must not quietly become a soil reading.
check("a soil key inside a status payload is not stored as soil",
      len(WRITES) == 1 and WRITES[0][1] is None)

os.unlink(_tmp.name)
print("\nALL PASS" if ok else "\nSOMETHING FAILED")
sys.exit(0 if ok else 1)
