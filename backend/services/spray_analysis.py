"""
Spray event detection — ported from the original utils/spray_analysis.py
but made framework-agnostic (no Dash imports).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd

import config


def analyze_spray_events(
    df: pd.DataFrame,
    stale_threshold_minutes: float = 5.0,
) -> dict[str, Any]:
    """
    Detect spray on/off cycles from raw relay3 data.

    Parameters
    ----------
    df : DataFrame with columns [time, field, value]
    stale_threshold_minutes : minutes without new data before labelling 'stale'
    """
    empty = {
        "spray_events":         [],
        "total_sprays":          0,
        "total_spray_minutes":   0.0,
        "avg_spray_minutes":     0.0,
        "data_status":           "no_data",
        "last_data_time":        None,
    }

    if df is None or df.empty or "field" not in df.columns:
        return empty

    relay3 = df[df["field"] == "relay3"].copy()
    if relay3.empty:
        return empty

    relay3 = relay3.sort_values("time").reset_index(drop=True)
    last_data_time: datetime = relay3.iloc[-1]["time"]

    now = datetime.now(config.TIMEZONE)
    minutes_since_data = (now - last_data_time).total_seconds() / 60.0
    data_is_stale = minutes_since_data > stale_threshold_minutes

    events: list[dict] = []
    spray_start: datetime | None = None

    for i in range(len(relay3)):
        cur_val  = relay3.iloc[i]["value"]
        cur_time = relay3.iloc[i]["time"]
        prev_val = relay3.iloc[i - 1]["value"] if i > 0 else 0

        if prev_val == 0 and cur_val == 1:          # rising edge → start
            spray_start = cur_time
        elif prev_val == 1 and cur_val == 0:        # falling edge → stop
            if spray_start is not None:
                duration = (cur_time - spray_start).total_seconds() / 60.0
                events.append({
                    "start_time":        spray_start.isoformat(),
                    "end_time":          cur_time.isoformat(),
                    "duration_minutes":  round(duration, 2),
                    "ongoing":           False,
                })
                spray_start = None

    # Handle spray that is still running (last value == 1)
    if spray_start is not None:
        last_ts  = relay3.iloc[-1]["time"]
        duration = (last_ts - spray_start).total_seconds() / 60.0
        events.append({
            "start_time":        spray_start.isoformat(),
            "end_time":          last_ts.isoformat(),
            "duration_minutes":  round(duration, 2),
            "ongoing":           not data_is_stale,   # stale → not truly ongoing
            "incomplete":        data_is_stale,
        })

    total = len(events)
    total_min = sum(e["duration_minutes"] for e in events)

    return {
        "spray_events":        events,
        "total_sprays":         total,
        "total_spray_minutes":  round(total_min, 2),
        "avg_spray_minutes":    round(total_min / total, 2) if total else 0.0,
        "data_status":          "stale" if data_is_stale else "fresh",
        "last_data_time":       last_data_time.isoformat() if last_data_time else None,
    }


def get_today_spray_stats(df: pd.DataFrame) -> dict[str, Any]:
    """Return spray stats filtered to today's date only."""
    all_stats = analyze_spray_events(df)

    if all_stats["data_status"] == "no_data":
        return all_stats

    today = datetime.now(config.TIMEZONE).date()
    today_events = [
        e for e in all_stats["spray_events"]
        if datetime.fromisoformat(e["start_time"]).date() == today
    ]

    total = len(today_events)
    total_min = sum(e["duration_minutes"] for e in today_events)

    return {
        "spray_events":        today_events,
        "total_sprays":         total,
        "total_spray_minutes":  round(total_min, 2),
        "avg_spray_minutes":    round(total_min / total, 2) if total else 0.0,
        "data_status":          all_stats["data_status"],
        "last_data_time":       all_stats["last_data_time"],
    }


def estimate_water_liters(total_spray_minutes: float, fogger_spec: dict | None) -> float | None:
    """
    total_spray_minutes * lines * foggers_per_line * flow_lpm_per_fogger.
    Assumes every fogger fires whenever the spray relay is on (one relay/pump
    drives the whole manifold, no per-line control). Returns None when the
    farm's fogger_spec isn't configured yet (see config.FARMS).
    """
    if not fogger_spec:
        return None
    lpm = fogger_spec["lines"] * fogger_spec["foggers_per_line"] * fogger_spec["flow_lpm_per_fogger"]
    return round(total_spray_minutes * lpm, 1)


def format_duration(minutes: float) -> str:
    """Human-readable duration string."""
    if minutes < 1:
        return f"{int(minutes * 60)}s"
    if minutes < 60:
        m, s = int(minutes), int((minutes % 1) * 60)
        return f"{m}m {s}s" if s else f"{m}m"
    h, m = int(minutes // 60), int(minutes % 60)
    return f"{h}h {m}m" if m else f"{h}h"
