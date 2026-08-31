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
POSTGRES_URL = os.getenv("POSTGRES_URL", "")

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
CAMPUS_MQTT_TOPIC = os.getenv("CAMPUS_MQTT_TOPIC", "RUPP_CAMPUS_1/phnom_penh/infor/status")

# Command topic the controller subscribes to for direct manual relay control —
# publish {"CH1": 1} to turn CH1 on, etc. (see routes/campus.py). Distinct from
# Kampot/Kep's low/high threshold model (routes/setpoint.py, proxied through
# Node-RED) — campus's controller takes direct on/off commands instead.
CAMPUS_RELAY_COMMAND_TOPIC = os.getenv(
    "CAMPUS_RELAY_COMMAND_TOPIC", "RUPP_CAMPUS_1/phnom_penh/relays/command"
)

# Campus *also* runs its own auto threshold-setpoint model (separate from the
# direct relay command above) — three zones, two temperature (1, 2) and one
# humidity (3). The controller expects the complete 6-value object on every
# publish, not a partial per-zone update, so routes/campus.py always sends
# all six together.
CAMPUS_SETPOINT_TOPIC = os.getenv(
    "CAMPUS_SETPOINT_TOPIC", "RUPP_CAMPUS_1/phnom_penh/relays/setpoints"
)

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
# fogger_spec drives the "estimated water use" figure on the Historical page:
#   total_spray_minutes * lines * foggers_per_line * flow_lpm_per_fogger
# All foggers are assumed to fire together, since a single relay/pump drives
# the whole manifold with no per-line control. Leave a farm's fogger_spec as
# None until its line/fogger count and per-fogger flow rate are confirmed —
# the API returns estimated_water_liters=null rather than guessing.
FARMS: dict[str, dict] = {
    "kampot": {
        "display_name": "Kampot Farm",
        "measurement":  "PepperFarmData",
        "location":     "Kampot Province",
        "fogger_spec":  {"lines": 9, "foggers_per_line": 18, "flow_lpm_per_fogger": 3.0},
    },
    "kep": {
        "display_name": "Kep Farm",
        "measurement":  "KepFarmData",
        "location":     "Kep Province",
        "fogger_spec":  None,  # TODO: confirm Kep's line/fogger layout and per-fogger flow rate
    },
    "campus": {
        "display_name": "PP Campus",
        # Dev/testing rig at RUPP — streams via scripts/campus_mqtt_bridge.py
        # (bypasses Node-RED), not the InfluxDB pipeline Kampot/Kep use.
        "measurement":  "CampusData",
        "location":     "Phnom Penh",
        "fogger_spec":  None,
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
        f"CH{i}": {
            "label":        f"Channel {i}",
            "icon":         "zap",
            "description":  "Not yet assigned",
            "controllable": True,
        }
        for i in range(1, 9)
    },
}

# Influx fields to query per farm — derived from FARM_CHANNELS so the channel
# list only has to be maintained in one place.
FARM_FIELDS: dict[str, list[str]] = {
    farm_id: ["temperature", "humidity", *channels.keys()]
    for farm_id, channels in FARM_CHANNELS.items()
}
