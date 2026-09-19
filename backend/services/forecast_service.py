"""
Stage 1 serving — persistence forecast + validated interval (ML_METHODOLOGY §2.6).

The point forecast is persistence (ŷ = the current reading): validation on 115
days found no model beat it significantly, so persistence is what ships. The
value is the INTERVAL — an empirical 80% band whose coverage was measured
out-of-fold, so it is honest about how far the reading can move.

Two hard rules from the methodology are enforced here, not left to the caller:

  §2.5  No forecast is returned for a horizon that lands at or after the 16:00
        shutdown — that region has no training support and can never be verified.
        The horizon comes back `available: false` with a reason, never a number.

  §1.2  If the feed is stale, there is no trustworthy "current reading" to project
        from, so every horizon is unavailable.

This module is read-only and cheap: it loads a small JSON band artifact once and
adds it to the latest reading. It never trains.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

import config
from services import influxdb_service as db

_BANDS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

WINDOW_OPEN_HOUR  = 8
WINDOW_CLOSE_HOUR = 16

# The bands file is tiny and rarely changes; cache it, keyed by mtime so a
# retrain on the lab desktop is picked up without a restart.
_cache: dict[str, tuple[float, dict]] = {}


def _load_bands(target: str) -> dict | None:
    path = os.path.join(_BANDS_DIR, f"forecast_bands_{target}.json")
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None
    cached = _cache.get(target)
    if cached and cached[0] == mtime:
        return cached[1]
    with open(path, encoding="utf-8") as f:
        bands = json.load(f)
    _cache[target] = (mtime, bands)
    return bands


def _lands_past_shutdown(now: datetime, horizon_min: int) -> bool:
    close = now.replace(hour=WINDOW_CLOSE_HOUR, minute=0, second=0, microsecond=0)
    target = now.timestamp() + horizon_min * 60
    return target >= close.timestamp()


def get_forecast(farm: str, target: str = "temperature") -> dict:
    """
    Build the forecast payload for one farm and target. Always returns a
    well-formed dict; individual horizons carry their own availability so the UI
    can render a partial card (some horizons open, later ones past shutdown).
    """
    bands = _load_bands(target)
    now = datetime.now(config.TIMEZONE)

    base = {
        "farm": farm,
        "target": target,
        "as_of": now.isoformat(),
        "model": "persistence",
        "interval_pct": int((bands or {}).get("interval", 0.8) * 100),
        "unit": (bands or {}).get("unit", "°C"),
        "horizons": [],
        "trained_at": (bands or {}).get("metadata", {}).get("trained_at"),
    }

    if bands is None:
        base["status"] = "no_model"
        base["message"] = "Forecast model not trained yet (run train_forecast.py on the lab desktop)."
        return base

    # Current reading — the value persistence projects forward.
    measurement = config.FARMS[farm]["measurement"]
    raw = db.get_latest_readings(measurement, ["temperature", "humidity"])
    online = raw.pop("_online", {"is_online": False})
    is_online = bool(online.get("is_online"))
    current = raw.get(target, {}).get("value") if is_online else None

    base["is_online"] = is_online
    base["current"] = current

    before_open = now.hour < WINDOW_OPEN_HOUR
    for hz_str, b in sorted(bands["horizons"].items(), key=lambda kv: int(kv[0])):
        hz = int(hz_str)
        entry = {"minutes": hz, "coverage_observed": b.get("coverage")}
        if not is_online or current is None:
            entry.update(available=False, reason="No live reading to forecast from")
        elif before_open:
            entry.update(available=False, reason="Outside monitored hours")
        elif _lands_past_shutdown(now, hz):
            entry.update(available=False, reason="Would land after 16:00 shutdown")
        else:
            entry.update(
                available=True,
                center=round(float(current), 2),                 # persistence
                low=round(float(current) + b["q_lo"], 2),
                high=round(float(current) + b["q_hi"], 2),
            )
        base["horizons"].append(entry)

    base["status"] = "ok"
    return base
