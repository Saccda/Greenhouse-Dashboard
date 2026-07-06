"""
Persistent user settings — stored in backend/data/settings.json.

The backend is the source of truth for alert thresholds.
The frontend reads on load and writes on save; the alert checker
reads on every check cycle so changes take effect immediately.
"""
from __future__ import annotations

import json
import os

import config

_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "settings.json")

# Keys that may be stored; all others are ignored.
_ALLOWED = {"temp_warn", "hum_warn"}


def _defaults() -> dict:
    return {
        "temp_warn": float(config.DEFAULT_TEMP_WARN),
        "hum_warn":  float(config.DEFAULT_HUM_WARN),
    }


def get() -> dict:
    """Return current settings, falling back to config defaults if file is missing."""
    try:
        with open(_PATH) as f:
            data = json.load(f)
        merged = _defaults()
        merged.update({k: float(v) for k, v in data.items() if k in _ALLOWED})
        return merged
    except (FileNotFoundError, json.JSONDecodeError):
        return _defaults()


def save(data: dict) -> dict:
    """Persist updated values and return the full settings dict."""
    current = get()
    for k in _ALLOWED:
        if k in data:
            current[k] = float(data[k])
    os.makedirs(os.path.dirname(_PATH), exist_ok=True)
    with open(_PATH, "w") as f:
        json.dump(current, f, indent=2)
    return current
