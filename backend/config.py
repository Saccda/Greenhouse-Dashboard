"""
Central configuration — all values read from environment variables.
Copy .env.example to .env and fill in your credentials.
"""
import os
import pytz
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Timezone
# ---------------------------------------------------------------------------
TZ_NAME = os.getenv("TIMEZONE", "Asia/Phnom_Penh")
TIMEZONE = pytz.timezone(TZ_NAME)

# ---------------------------------------------------------------------------
# InfluxDB
# ---------------------------------------------------------------------------
INFLUXDB_URL    = os.getenv("INFLUXDB_URL",    "https://us-east-1-1.aws.cloud2.influxdata.com")
INFLUXDB_TOKEN  = os.getenv("INFLUXDB_TOKEN",  "")
INFLUXDB_ORG    = os.getenv("INFLUXDB_ORG",    "")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "IoT_Project")

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
# Postgres lives on the lab desktop and is reached over LOOPBACK ONLY. Every
# process that needs it (the Node-RED flow, the campus bridge, the training
# job, the API) runs on that same machine, so the port is never exposed to the
# internet — see ML_METHODOLOGY.md 5.1.
POSTGRES_URL = os.getenv("POSTGRES_URL", "")

# Write-capable connection for the campus bridge. Kept SEPARATE from
# POSTGRES_URL on purpose: that one is the read-only account the audit and
# training scripts use, so a bug in analysis code cannot corrupt the archive
# it is analysing. The bridge genuinely needs INSERT and CREATE, which is a
# different privilege level and therefore a different role.
#
# Falls back to POSTGRES_URL when unset, because a single-user setup is a
# reasonable place to start — but if that account is read-only the bridge will
# say so clearly at startup rather than failing once per message.
POSTGRES_WRITE_URL = os.getenv("POSTGRES_WRITE_URL", "") or POSTGRES_URL

# Archive table for the campus bridge. Long format (time/farm/field/value) so
# that farms with different channel sets — Kampot's relay1-3 vs campus's CH1-8 —
# can share one table, and so a channel being assigned a real name later does
# not require an ALTER TABLE. Overridable in case the name collides with
# something the Node-RED flow already owns.
POSTGRES_CAMPUS_TABLE = os.getenv("POSTGRES_CAMPUS_TABLE", "campus_readings")

# ---------------------------------------------------------------------------
# Node-RED
# ---------------------------------------------------------------------------
NODE_RED_URL = os.getenv("NODE_RED_URL", "http://localhost:1880")

# ---------------------------------------------------------------------------
# MQTT — campus ingestion bridge (scripts/campus_mqtt_bridge.py)
#
# Bypasses Node-RED for the PP Campus rig only — Kampot/Kep keep streaming
# through Node-RED unchanged. Same HiveMQ Cloud broker Node-RED already uses;
# MQTT brokers support multiple independent subscribers per topic, so this
# doesn't conflict with anything else reading the same feed.
# ---------------------------------------------------------------------------
MQTT_BROKER_HOST  = os.getenv("MQTT_BROKER_HOST", "")
MQTT_BROKER_PORT  = int(os.getenv("MQTT_BROKER_PORT", "8883"))  # TLS port (HiveMQ Cloud default)
MQTT_USERNAME     = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD     = os.getenv("MQTT_PASSWORD", "")
# The campus controller publishes under a root of its own choosing, and that
# root has now changed TWICE:
#
#   originally      RUPP_CAMPUS_1   named for the site
#   ~1 Oct 2026     Device01        named for the device
#   21 Oct 2026     RUPP_CAMPUS_1   changed back
#
# Everything campus hangs off this, so following a rename is one line rather
# than four. The indirection earns its keep because getting it wrong is SILENT
# IN BOTH DIRECTIONS: reads simply show no data, and writes publish
# successfully to a topic nothing is subscribed to, so the dashboard reports a
# relay command sent that no hardware ever hears.
#
# Both failures have now happened for real. The first rename cost 18 days of
# campus history while the ESP32 published every 60 seconds to a topic nothing
# read. The second broke remote setpoints the other way: the dashboard went on
# accepting setpoint changes and reporting success while the controller, back
# on RUPP_CAMPUS_1, heard none of them.
#
# If campus goes quiet again, check this FIRST. One listen settles it:
#     python scripts/mqtt_listen.py --seconds 90 --topic '#'
CAMPUS_TOPIC_ROOT = os.getenv("CAMPUS_TOPIC_ROOT", "RUPP_CAMPUS_1")

CAMPUS_MQTT_TOPIC = os.getenv(
    "CAMPUS_MQTT_TOPIC", f"{CAMPUS_TOPIC_ROOT}/phnom_penh/infor/status"
)

# The campus flow meter publishes on its own topic, and on CONSUMPTION rather
# than on a clock: the firmware sends a message each time another cubic metre
# has gone through it.
#     {"Start_totalizer": 15, "Last_totalizer": 17, "Day_consumption": 2}
#
# That is worth knowing before anyone calls a silent meter broken. One cubic
# metre is a thousand litres, so a system that sprays for a few minutes a day
# can legitimately say nothing for days. Silence here is not evidence of a
# fault; only the status feed arriving while the water feed stays empty is.
CAMPUS_WATER_MQTT_TOPIC = os.getenv(
    "CAMPUS_WATER_MQTT_TOPIC", f"{CAMPUS_TOPIC_ROOT}/phnom_penh/water_data"
)

# The meter's unit lives on the farm entry (FARMS[...]["water_meter"]) rather
# than here, because having one is a property OF A FARM, not of the system.
# These remain only as the campus meter's configurable values.
CAMPUS_WATER_UNIT = os.getenv("CAMPUS_WATER_UNIT", "m3")
CAMPUS_WATER_UNIT_LABEL = os.getenv("CAMPUS_WATER_UNIT_LABEL", "m³")
CAMPUS_WATER_LITERS_PER_UNIT = float(os.getenv("CAMPUS_WATER_LITERS_PER_UNIT", "1000"))

# Command topic the controller subscribes to for direct manual relay control —
# publish {"CH1": 1} to turn CH1 on, etc. (see routes/campus.py). Distinct from
# Kampot/Kep's low/high threshold model (routes/setpoint.py, proxied through
# Node-RED) — campus's controller takes direct on/off commands instead.
CAMPUS_RELAY_COMMAND_TOPIC = os.getenv(
    "CAMPUS_RELAY_COMMAND_TOPIC", f"{CAMPUS_TOPIC_ROOT}/phnom_penh/relays/command"
)

# Campus *also* runs its own auto threshold-setpoint model (separate from the
# direct relay command above) — three zones, two temperature (1, 2) and one
# humidity (3). The controller expects the complete 6-value object on every
# publish, not a partial per-zone update, so routes/campus.py always sends
# all six together.
CAMPUS_SETPOINT_TOPIC = os.getenv(
    "CAMPUS_SETPOINT_TOPIC", f"{CAMPUS_TOPIC_ROOT}/phnom_penh/relays/setpoints"
)

# The controller REPORTS BACK on these, retained. Reading them is what turns a
# whole class of silent failure into a visible one: the dashboard otherwise
# displays the setpoints it last SENT, which is not the same thing as the ones
# the hardware is running. Those two drifted apart for weeks while every send
# reported success, because the publishes were going to a topic nothing was
# subscribed to. A device that states its own setpoints settles that argument
# in one reading.
CAMPUS_SETPOINT_STATUS_TOPIC = os.getenv(
    "CAMPUS_SETPOINT_STATUS_TOPIC", f"{CAMPUS_TOPIC_ROOT}/phnom_penh/relays/setpoints/status"
)

# CH4 is not driven by the three relay setpoints above. The controller runs it
# from its own water-temperature target, on its own topic, in its own payload
# shape: {"Set_water_temp": 28.5}. Until this was wired up there was no way to
# see or change it from the dashboard at all.
CAMPUS_WATER_SETPOINT_TOPIC = os.getenv(
    "CAMPUS_WATER_SETPOINT_TOPIC", f"{CAMPUS_TOPIC_ROOT}/phnom_penh/water_temp/setpoint"
)
CAMPUS_WATER_SETPOINT_STATUS_TOPIC = os.getenv(
    "CAMPUS_WATER_SETPOINT_STATUS_TOPIC",
    f"{CAMPUS_TOPIC_ROOT}/phnom_penh/water_temp/setpoint/status",
)

# The NTC probe in the cooling tank, published every 5 seconds — twelve times
# more often than the status feed, and until now discarded entirely.
CAMPUS_WATER_TEMP_TOPIC = os.getenv(
    "CAMPUS_WATER_TEMP_TOPIC", f"{CAMPUS_TOPIC_ROOT}/phnom_penh/water_temp_data"
)

# Every 5 seconds is 17,280 points a day for ONE field, against 1,440 for the
# whole status feed. A cooling tank does not change meaningfully in five
# seconds, so the bridge keeps one reading per interval and drops the rest.
# Resolution stays well ahead of the 60-second status feed while the write
# volume stays in the same order of magnitude as everything else.
CAMPUS_WATER_TEMP_MIN_INTERVAL_S = float(os.getenv("CAMPUS_WATER_TEMP_MIN_INTERVAL", "30"))

# Example values straight from the firmware's own topic comment — used as the
# UI's pre-fill defaults before anything has ever actually been sent.
CAMPUS_SETPOINT_DEFAULTS: dict[str, float] = {
    "temp_low1":  23.0, "temp_high1": 24.5,
    "temp_low2":  25.0, "temp_high2": 26.0,
    "hum_low3":   40.0, "hum_high3":  60.0,
}

# ---------------------------------------------------------------------------
# Telegram notifications
# ---------------------------------------------------------------------------
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID",   "")

# ---------------------------------------------------------------------------
# Alert checker
# ---------------------------------------------------------------------------
ALERT_CHECK_INTERVAL_MINUTES = int(os.getenv("ALERT_CHECK_INTERVAL",   "5"))
ALERT_COOLDOWN_MINUTES       = int(os.getenv("ALERT_COOLDOWN_MINUTES", "30"))
MAX_SPRAY_MINUTES            = float(os.getenv("MAX_SPRAY_MINUTES",    "5.0"))
MIN_TEMP_DROP_AFTER_SPRAY    = float(os.getenv("MIN_TEMP_DROP",        "1.0"))  # °C expected drop

# ---------------------------------------------------------------------------
# Dry-run pump protection
#
# A spray pump running with an empty tank destroys itself: there is no water to
# carry heat away from the seals and impeller. The alert checker already
# detects the condition — the pump has run past MAX_SPRAY_MINUTES and the
# temperature has NOT fallen, which together mean it is moving no water — and
# until now the only response was a Telegram message. If nobody is holding
# their phone, the pump keeps running.
#
# This lets the system act. On Kampot and Kep the only control lever is the
# setpoint band proxied to Node-RED, so "stop the pump" means raising relay 3's
# band (P5/P6) above any temperature the greenhouse will reach. The controller
# then never calls for spray.
#
# IT ESCALATES, BECAUSE A TEMPERATURE DROP IS NOT PROOF OF WATER
#   A locked-out greenhouse cools down every evening whether or not anybody
#   refilled the tank — the sun sets. So releasing purely on temperature would
#   restore the band each night and hand the pump a fresh dry run each morning,
#   forever, which is the damage this exists to prevent.
#
#   What makes it safe is the strike count. The FIRST lockout may release
#   itself once the greenhouse has cooled below the pump's own off-point, on
#   the theory that somebody probably topped the tank up without opening the
#   dashboard — which is what actually happens on a farm. If that was wrong,
#   the next dry run is the SECOND strike: it locks out with no grace period
#   at all and will not release itself for any reason. Only a person, who has
#   looked in the tank, can release it from there.
#
#   Worst case is therefore two dry-run cycles, not a nightly one.
#
# after_minutes is a grace period for a person to act before the machine does,
# and it is ZERO on purpose. Nobody watches Telegram or the dashboard minute by
# minute on a working farm, so waiting bought five more minutes of dry running
# and no human response. The guard acts on the first cycle that sees the
# condition. The real floor on reaction time is MAX_SPRAY_MINUTES (5) plus one
# ALERT_CHECK_INTERVAL_MINUTES (5), so the pump runs 5-10 min, not 10-15.
DRY_RUN_PROTECTION: dict[str, dict] = {
    "kampot": {
        "enabled":       os.getenv("DRY_RUN_PROTECT_KAMPOT", "true").lower() == "true",
        "relay":         3,        # Spray Pump (P5/P6)

        # No grace. The farmer is not holding their phone, so the only thing a
        # delay here bought was more dry running. Acting on the first cycle
        # does mean one bad temperature reading can lock the pump out where it
        # previously had to persist across two cycles -- that trade is
        # deliberate: a wrong lockout is visible on the Control page and
        # undone with one button, while pump damage is neither.
        "after_minutes": float(os.getenv("DRY_RUN_AFTER_MIN", "0")),
        # Second strike. Same zero wait, but this one also refuses to release
        # itself -- see auto_release below. That is the whole difference.
        "after_minutes_repeat": 0.0,

        # The pump engages above P6 and releases below P5, so a band the
        # greenhouse never reaches means it is never asked to spray. Kampot has
        # recorded 37.6 °C (2026-10-01), so this leaves ~3.4 °C of headroom —
        # on 30 days of data that do not yet include March–April, the hot
        # season. If the greenhouse ever passes 41 °C the lockout stops
        # working, which is why verify() exists: it alarms when the pump did
        # not stop rather than assuming it did.
        "lockout_low":   40.5,
        "lockout_high":  41.0,

        # First strike only, and never for any later one.
        "auto_release":  True,

        # How long the greenhouse must sit below the pump's own off-point
        # before the first lockout releases itself. Sustained, so a passing
        # cloud does not do it, and below the off-point specifically so the
        # restored band cannot re-engage the pump the instant it lands.
        "auto_release_cool_minutes": 30.0,

        # Survive this long after an auto-release with no further dry run and
        # the strike is forgiven — the tank really was refilled. A second dry
        # run would land during the next hot afternoon, well inside this.
        "strike_forgive_hours": 24.0,
    },
    "kep": {
        # Same hardware, but Kep has not been commissioned, so this stays off
        # until someone confirms its relay map matches Kampot's.
        "enabled":       False,
        "relay":         3,
        "after_minutes": 0.0,
        "after_minutes_repeat": 0.0,
        # Kep has recorded 33.6 °C at most, so the same band clears it by
        # nearly 7 °C.
        "lockout_low":   40.5,
        "lockout_high":  41.0,
        "auto_release":  True,
        "auto_release_cool_minutes": 30.0,
        "strike_forgive_hours": 24.0,
    },
    # Campus is absent deliberately. It has direct per-channel relay commands
    # rather than a setpoint band, so stopping its pump is a different action
    # and belongs in its own path — and it is the development rig, where
    # somebody is usually standing next to it.
}

# Connectivity: brief drops (< OFFLINE_ALERT_MINUTES) are silently tolerated and
# excluded from alert durations.  Only sustained outages trigger a Telegram alert.
OFFLINE_ALERT_MINUTES        = int(os.getenv("OFFLINE_ALERT_MINUTES", "30"))

# Scheduled hardware shutdown window (24-h "HH:MM" local time).
# Offline alerts are suppressed when the current time falls inside this range.
# Overnight ranges are supported — e.g. start=16:00, end=06:00 crosses midnight.
MAINTENANCE_START = os.getenv("MAINTENANCE_START", "16:00")
MAINTENANCE_END   = os.getenv("MAINTENANCE_END",   "06:00")

# ---------------------------------------------------------------------------
# Flask
# ---------------------------------------------------------------------------
SECRET_KEY  = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-me")
FLASK_ENV   = os.getenv("FLASK_ENV", "development")

# Comma-separated list, e.g. "https://your-app.vercel.app,http://localhost:3000"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGIN", "http://localhost:3000").split(",") if o.strip()]

# ---------------------------------------------------------------------------
# Auth — httpOnly cookie sessions
# ---------------------------------------------------------------------------
AUTH_TOKEN_TTL_DAYS = int(os.getenv("AUTH_TOKEN_TTL_DAYS", "30"))

# Cookie scope. Empty in local dev — a cookie set by localhost:5000 is
# automatically visible to localhost:3010 (cookies aren't port-scoped).
# In production, set to ".yourdomain.com" so the cookie is shared between
# the API subdomain and the frontend's own subdomain (lets the frontend's
# Next.js middleware see session presence without a proxy).
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", "") or None

# Secure requires HTTPS. Browsers treat localhost as a secure context even
# over plain HTTP, but this stays env-driven rather than hardcoded true so
# it's explicit and doesn't silently depend on that browser-specific carve-out.
COOKIE_SECURE = FLASK_ENV != "development"

# ---------------------------------------------------------------------------
# Farm definitions
# Each farm maps to a distinct InfluxDB measurement.
# Add more farms here — the frontend picks them up automatically.
# ---------------------------------------------------------------------------
# fogger_spec is a STAND-IN FOR A FLOW METER. It exists so a farm with no meter
# can still show roughly how much water it used, by multiplying spray runtime by
# the manifold's rated flow. Where a meter is installed, the estimate is not
# wanted alongside it — the meter is simply better, and two water figures on one
# page invites the reader to wonder which to believe.
#
# So the two are alternatives: see water_meter below, and _water_source() in
# routes/farms.py, which picks measured over estimated and tells the frontend
# which it is getting. Do not add a fogger_spec to a farm that has a meter.
#
# It drives the "estimated water use" figure on the Historical page:
#   total_spray_minutes * lines * foggers_per_line * flow_lpm_per_fogger
# All foggers are assumed to fire together, since a single relay/pump drives
# the whole manifold with no per-line control. Leave a farm's fogger_spec as
# None until its line/fogger count and per-fogger flow rate are confirmed —
# the API returns estimated_water_liters=null rather than guessing.
#
# water_meter is the same idea for a physical flow meter. ONLY PP CAMPUS HAS
# ONE — it is a development-stage installation on our own test system, not
# something deployed to the working farms. Kampot and Kep are None, and the
# API says "this farm has no water meter" rather than "the meter has not
# reported", which are different facts and would otherwise be indistinguishable
# from an empty result.
#
# Confirmed with the farm team: the campus totalizer counts CUBIC METRES, so
# {"Day_consumption": 2} is 2,000 litres. liters_per_unit is what lets the
# measured figure be compared with the litre-denominated runtime estimate.
#
# soil_sensors is None everywhere for now because none is installed yet. When
# the probes go in, FILLING THIS IN IS THE WHOLE JOB — the field list, the MQTT
# bridge, the farms API and the dashboard all read it, so none of them needs
# editing on the day. That is the point of the shape below rather than a bare
# True/False: a flag would have told the dashboard that soil exists without
# telling anything what to store, query or label.
#
#   "soil_sensors": {
#       "probes": [
#           {
#               # What the device calls it in its MQTT payload. CONFIRM THIS
#               # AGAINST THE FIRMWARE rather than assuming -- a guessed key
#               # matches nothing and stores silently empty, which looks
#               # exactly like a probe that is fitted and reading zero.
#               "payload_key": "SoilMoisture",
#               # What it is called in InfluxDB and in the API. Lower snake
#               # case, prefixed soil_, and NEVER changed once written: Influx
#               # fixes a field's type and name on first write.
#               "field":       "soil_moisture",
#               "label":       "Soil moisture",
#               "unit":        "%",
#               # Chart bounds. Give the real instrument range, not the range
#               # of the readings seen so far, or the first dry week rescales
#               # the axis and every later reading looks extreme.
#               "min":         0,
#               "max":         100,
#           },
#           {
#               "payload_key": "SoilTemperature",
#               "field":       "soil_temperature",
#               "label":       "Soil temperature",
#               "unit":        "°C",
#               "min":         0,
#               "max":         50,
#           },
#       ],
#       # Where the probes sit, for the label under the readings. Optional.
#       "depth_cm": 30,
#   }
#
# Add probes one at a time as they are confirmed. A probe listed here that the
# device does not actually send shows as "no reading" rather than breaking the
# others, so a wrong guess is visible instead of silent.
FARMS: dict[str, dict] = {
    "kampot": {
        "display_name": "Kampot Farm",
        "measurement":  "PepperFarmData",
        "location":     "Kampot Province",
        "latitude":     10.6104,
        "longitude":    104.1811,
        "fogger_spec":  {"lines": 9, "foggers_per_line": 18, "flow_lpm_per_fogger": 3.0},
        "water_meter":  None,   # no flow meter installed at Kampot
        "soil_sensors": None,   # no soil probes installed
    },
    "kep": {
        "display_name": "Kep Farm",
        "measurement":  "KepFarmData",
        "location":     "Kep Province",
        "latitude":     10.4831,
        "longitude":    104.3167,
        "fogger_spec":  None,  # TODO: confirm Kep's line/fogger layout and per-fogger flow rate
        "water_meter":  None,  # no flow meter installed at Kep
        "soil_sensors": None,  # no soil probes installed
    },
    "campus": {
        "display_name": "PP Campus",
        # Dev/testing rig at RUPP — streams via scripts/campus_mqtt_bridge.py
        # (bypasses Node-RED), not the InfluxDB pipeline Kampot/Kep use.
        # NOTE: was "CampusData" — renamed because an early write (before
        # campus_mqtt_bridge.py cast temperature/humidity to float) sent a
        # whole-number humidity reading as an integer, which permanently
        # locked that measurement's humidity column to integer type in
        # InfluxDB (schema-on-write, no ALTER-column-type available). Every
        # later float reading was then rejected outright.
        #
        # The old "CampusData" measurement was left behind in the bucket: 480
        # points spanning five minutes on 2026-09-02, read by nothing. It
        # CANNOT be deleted — this is InfluxDB Cloud Serverless (v3), whose
        # delete API answers "Deletes ranges are not supported for serverless
        # v3 buckets", and the only other lever is dropping the whole bucket,
        # which would take every farm's history with it. It aged out instead
        # via the bucket's 30-day retention, around 2026-10-02.
        #
        # Worth knowing beyond this one measurement: on this plan, data cannot
        # be removed once written. Anything wrong that gets stored stays until
        # retention expires it, which is the real argument for the type casts
        # in campus_mqtt_bridge.py rather than fixing mistakes afterwards.
        #
        # Don't reuse that name.
        "measurement":  "PPCampusData",
        "location":     "Phnom Penh",
        "latitude":     11.5564,
        "longitude":    104.9282,
        "fogger_spec":  None,
        "water_meter":  {
            "unit":            CAMPUS_WATER_UNIT,
            "unit_label":      CAMPUS_WATER_UNIT_LABEL,
            "liters_per_unit": CAMPUS_WATER_LITERS_PER_UNIT,
            "topic":           CAMPUS_WATER_MQTT_TOPIC,
        },
        # NTC probe in the cooling tank. A capability of the farm, like the
        # water meter above, rather than a hardcoded field name: a farm without
        # one gets no panel instead of an empty chart promising a reading that
        # can never arrive.
        "water_temp_sensor": {
            "payload_key": "Water_Temperature",
            "field":       "water_temperature",
            "label":       "Water temperature",
            "unit":        "°C",
            # Instrument range, not the range seen so far -- a tank that holds
            # steady would otherwise get an axis that magnifies its noise.
            "min":         0,
            "max":         60,
            "topic":       CAMPUS_WATER_TEMP_TOPIC,
        },
        # Planned, not installed. Fill this in when probes are wired and the
        # dashboard panel starts showing readings instead of saying there are
        # none.
        "soil_sensors": None,
    },
}
DEFAULT_FARM = "kampot"

# ---------------------------------------------------------------------------
# Dashboard defaults
# ---------------------------------------------------------------------------
DEFAULT_TIME_RANGE   = "-24h"
DEFAULT_AGGREGATION  = "5m"
DEFAULT_TEMP_WARN    = 30.0   # °C
DEFAULT_HUM_WARN     = 70.0   # %
DATA_STALE_MINUTES   = 15     # readings older than this → system considered offline

# Broadcast interval for SocketIO live updates (seconds)
BROADCAST_INTERVAL = 30

# ---------------------------------------------------------------------------
# Per-farm relay/channel maps — each farm's hardware exposes a different set
# of switchable outputs, so this is keyed per farm rather than a single global
# map. Kampot/Kep are 3 semantically-labelled relays on a fixed threshold
# control model (see routes/setpoint.py); campus is 8 generic channels on a
# direct on/off command model (see routes/campus.py) since its controller and
# purpose (hardware/software R&D rig) aren't fixed yet.
#
# "controllable" gates whether the UI offers a direct toggle for that channel
# (RelayIndicator) — Kampot/Kep's relays are display-only here since they're
# actually driven by the threshold setpoints sent via SetpointPanel, not a
# direct switch.
# ---------------------------------------------------------------------------
_STANDARD_RELAYS: dict[str, dict] = {
    "relay1": {
        "label":        "Cooling System",
        "icon":         "snowflake",
        "description":  "Tank cooling — active when ON",
        "controllable": False,
    },
    "relay2": {
        "label":        "Standby",
        "icon":         "zap",
        "description":  "Not assigned",
        "controllable": False,
    },
    "relay3": {
        "label":        "Spray Pump",
        "icon":         "cloud-drizzle",
        "description":  "Farm irrigation — spraying when ON",
        "controllable": False,
    },
}

FARM_CHANNELS: dict[str, dict[str, dict]] = {
    "kampot": _STANDARD_RELAYS,
    "kep":    _STANDARD_RELAYS,
    "campus": {
        "CH1": {
            "label":        "System Enable",
            "icon":         "thermometer",
            # CH1 has no setpoint of its own. The controller holds it ON
            # whenever any of CH2, CH3 or CH4 is on, so it is an indicator of
            # "something is running" rather than a threshold channel. It used
            # to read "System ON when temperature exceeds 32 degC", which was
            # the CH2 spray setpoint wearing CH1's name.
            "description":  "ON whenever CH2, CH3 or CH4 is running",
            "controllable": True,
        },
        "CH2": {
            "label":        "Spraying System",
            "icon":         "cloud-drizzle",
            "description":  "Spraying — active when ON",
            "controllable": True,
        },
        "CH3": {
            "label":        "Humidity Control",
            "icon":         "droplets",
            # TODO: confirm the actual trigger condition with the team —
            # known to be humidity-related, threshold not given yet.
            "description":  "Humidity-related — trigger condition not yet confirmed",
            "controllable": True,
        },
        "CH4": {
            "label":        "Cooling System",
            "icon":         "snowflake",
            "description":  "Cooling tank — active when ON",
            "controllable": True,
        },
        **{
            f"CH{i}": {
                "label":        f"Channel {i}",
                "icon":         "zap",
                "description":  "Not yet assigned",
                "controllable": True,
            }
            for i in range(5, 9)
        },
    },
}

# ---------------------------------------------------------------------------
# Analytics bands — used by the Analytics page's time-in-range analysis.
#
# THESE ARE OPERATOR-SET AGRONOMIC TARGETS, NOT MEASURED CONSTANTS. They decide
# what counts as "optimal" vs "stressed" for the crop, so they are the first
# thing to review with an agronomist before quoting any time-in-range figure.
# Bands are half-open [min, max): min=None means "no lower bound", max=None
# means "no upper bound". They must be ordered and must not overlap.
#
# Defaults below reflect what the dashboard already assumed elsewhere (the
# Dashboard's own "Target relative humidity 60-80%" subtitle) and general
# black-pepper guidance; adjust per farm once real agronomic targets are set.
# ---------------------------------------------------------------------------
ANALYTICS_BANDS: dict[str, list[dict]] = {
    "temperature": [
        {"label": "Cold",        "status": "critical", "min": None, "max": 20.0},
        {"label": "Optimal",     "status": "optimal",  "min": 20.0, "max": 30.0},
        {"label": "Warm",        "status": "warning",  "min": 30.0, "max": 35.0},
        {"label": "Heat stress", "status": "critical", "min": 35.0, "max": None},
    ],
    "humidity": [
        {"label": "Too dry",     "status": "critical", "min": None, "max": 50.0},
        {"label": "Dry",         "status": "warning",  "min": 50.0, "max": 60.0},
        {"label": "Optimal",     "status": "optimal",  "min": 60.0, "max": 80.0},
        {"label": "Humid",       "status": "warning",  "min": 80.0, "max": 90.0},
        {"label": "Disease risk","status": "critical", "min": 90.0, "max": None},
    ],
}

# Nominal seconds between readings, used to estimate how much of a period the
# sensor actually covered. Kampot/Kep publish roughly every 30 s.
EXPECTED_SAMPLE_INTERVAL_S = int(os.getenv("EXPECTED_SAMPLE_INTERVAL_S", "30"))

# A run of readings above a threshold is treated as broken (not one continuous
# episode) once the gap between consecutive readings exceeds this. Prevents an
# overnight shutdown from being reported as one 16-hour heat episode.
EXCEEDANCE_MAX_GAP_S = int(os.getenv("EXCEEDANCE_MAX_GAP_S", "300"))

def water_temp_sensor(farm_id: str) -> dict | None:
    """The farm's cooling-tank probe spec, or None when it has no sensor."""
    return (FARMS.get(farm_id) or {}).get("water_temp_sensor") or None


def water_temp_field(farm_id: str) -> str | None:
    """Influx field name for the farm's water temperature, or None."""
    spec = water_temp_sensor(farm_id)
    return spec.get("field") if spec else None


def soil_probes(farm_id: str) -> list[dict]:
    """
    The configured soil probes for a farm, or [] when none are fitted.

    One accessor rather than four places reaching into FARMS[...]["soil_sensors"]
    and each handling None its own way.
    """
    spec = (FARMS.get(farm_id) or {}).get("soil_sensors") or {}
    return list(spec.get("probes") or [])


def soil_fields(farm_id: str) -> list[str]:
    """Influx field names for a farm's soil probes, in configured order."""
    return [p["field"] for p in soil_probes(farm_id) if p.get("field")]


# Influx fields to query per farm — derived from FARM_CHANNELS and the soil
# spec so each list is maintained in exactly one place. Soil fields join
# automatically the moment probes are configured, which is what makes
# /latest and /history return them without either route being touched.
FARM_FIELDS: dict[str, list[str]] = {
    farm_id: ["temperature", "humidity", *channels.keys(), *soil_fields(farm_id),
              *([water_temp_field(farm_id)] if water_temp_field(farm_id) else [])]
    for farm_id, channels in FARM_CHANNELS.items()
}

# Which field carries the SPRAY PUMP, per farm.
#
# Kampot and Kep run a three-relay controller where relay3 is the pump. Campus
# runs an eight-channel one where CH2 is. Every piece of spray analysis used to
# query "relay3" literally, so on campus it matched nothing and returned a
# clean, confident empty result: no sprays, no durations, no events, and a
# chart with nothing shaded. Not an error anywhere -- just a farm that looked
# like it had never once watered itself.
#
# An empty answer that looks identical to a true zero is the failure mode worth
# naming here, which is why this is a map rather than a default with a special
# case bolted on.
FARM_SPRAY_FIELD: dict[str, str] = {
    "kampot": "relay3",
    "kep":    "relay3",
    "campus": "CH2",
}
