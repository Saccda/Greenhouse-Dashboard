"""
Last-sent setpoint per farm+relay — backend/data/setpoints.json.

This is what lets a second browser tab learn "someone already sent a new
setpoint" on its next poll, instead of only ever showing its own local
default. A relay that has never been sent is simply absent from the
response (not zeroed) so the frontend can tell "never sent — use the UI
default" apart from "sent value 0".
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "setpoints.json")


def _load() -> dict:
    try:
        with open(_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write(data: dict) -> None:
    os.makedirs(os.path.dirname(_PATH), exist_ok=True)
    with open(_PATH, "w") as f:
        json.dump(data, f, indent=2)


def get(farm: str) -> dict:
    """Return {relay_num_str: {low, high, updated_at}} for relays that have been sent."""
    return _load().get(farm, {})


def save(farm: str, relay: int, low: float, high: float) -> dict:
    data = _load()
    farm_data = data.setdefault(farm, {})
    farm_data[str(relay)] = {
        "low":        low,
        "high":       high,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write(data)
    return farm_data[str(relay)]
