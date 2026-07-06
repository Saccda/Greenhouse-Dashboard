"""
Periodic alert checker — called every N minutes by APScheduler.

Connectivity-aware design
──────────────────────────
The farm uses intermittent internet (rural location). Two separate thresholds:

  DATA_STALE_MINUTES    (default 15) — UI shows "offline" banner.
  OFFLINE_ALERT_MINUTES (default 30) — Telegram fires; brief drops are silently
                                        absorbed, not spammed to the team.

Alert durations exclude offline gaps so a 2-hour internet drop does not make
a 30-minute temperature alert look like it lasted 2.5 hours.

State per alert key (temperature_kampot, humidity_kep, …):
  inactive → active   : send ALERT, record start + farm's current offline gap total
  active   → active   : send REMINDER every check cycle
  active   → inactive : send RESOLVED with effective duration (wall time − offline gap)
"""
from __future__ import annotations

from datetime import datetime, time as dtime
from typing import Any

import config
from services import influxdb_service as db
from services import spray_analysis
from services import telegram_service as telegram
from services import alert_log_service as alert_log
from services import settings_service


# ── Runtime state ─────────────────────────────────────────────────────────

# Alert lifecycle
_active:            dict[str, datetime] = {}   # key → time first became active
_active_farm:       dict[str, str]      = {}   # key → farm_id (for gap bookkeeping)
_alert_gap_start:   dict[str, float]    = {}   # key → farm's offline total when alert started

# Per-farm connectivity tracking
_farm_offline_since: dict[str, datetime] = {}  # farm_id → when it went offline (absent = online)
_farm_total_offline: dict[str, float]    = {}  # farm_id → cumulative offline minutes (lifetime)

# History for the live UI (last 50 entries, resets on restart)
_history: list[dict[str, Any]] = []


# ── Maintenance window ────────────────────────────────────────────────────

def _in_maintenance_window() -> bool:
    """
    Return True when the current local time falls inside the configured
    hardware-shutdown window (MAINTENANCE_START → MAINTENANCE_END).
    Handles overnight ranges, e.g. 16:00 → 06:00.
    """
    now   = datetime.now(config.TIMEZONE).time()
    start = dtime.fromisoformat(config.MAINTENANCE_START)
    end   = dtime.fromisoformat(config.MAINTENANCE_END)
    if start <= end:
        return start <= now < end          # same-day range
    return now >= start or now < end       # overnight range


# ── Connectivity helpers ──────────────────────────────────────────────────

def _track_connectivity(farm_id: str, is_online: bool) -> None:
    """
    Call at the top of every check cycle BEFORE the early return for offline.
    Maintains the per-farm offline accumulator and accumulates gap minutes into
    any alert that was active during a connectivity gap.
    """
    was_offline = farm_id in _farm_offline_since

    if not is_online:
        if not was_offline:
            _farm_offline_since[farm_id] = datetime.now(config.TIMEZONE)
    else:
        if was_offline:
            # Farm just came back online — accumulate the gap into the farm total.
            # Per-alert gaps are computed lazily in _effective_duration as:
            #   farm_total_now - farm_total_at_alert_start
            # so no per-alert update is needed here.
            gap = (datetime.now(config.TIMEZONE) - _farm_offline_since[farm_id]).total_seconds() / 60
            _farm_total_offline[farm_id] = _farm_total_offline.get(farm_id, 0.0) + gap
            del _farm_offline_since[farm_id]


def _farm_current_gap(farm_id: str) -> float:
    """Offline minutes already accumulated for this farm (does not include ongoing gap)."""
    return _farm_total_offline.get(farm_id, 0.0)


# ── Alert lifecycle helpers ───────────────────────────────────────────────

def _since(key: str) -> float:
    """Wall-clock minutes since alert `key` first became active."""
    start = _active.get(key)
    if start is None:
        return 0.0
    return (datetime.now(config.TIMEZONE) - start).total_seconds() / 60


def _effective_duration(key: str) -> tuple[float, float]:
    """
    Return (effective_minutes, gap_minutes).
    effective_minutes = wall-clock time minus offline gaps (what to show/store).
    gap_minutes       = total offline gap subtracted (shown as a note in the log).
    """
    wall      = _since(key)
    farm_id   = _active_farm.get(key, "")
    gap_accum = _farm_current_gap(farm_id) - _alert_gap_start.get(key, 0.0)

    # Also include any ongoing offline period that hasn't closed yet
    if farm_id in _farm_offline_since:
        ongoing = (datetime.now(config.TIMEZONE) - _farm_offline_since[farm_id]).total_seconds() / 60
        gap_accum += ongoing

    gap_accum = max(0.0, gap_accum)
    return max(0.0, wall - gap_accum), gap_accum


def _record(
    farm_id:      str,
    alert_type:   str,
    event:        str,
    message:      str,
    sensor_value: float | None = None,
    threshold:    float | None = None,
    duration_min: float | None = None,
    gap_minutes:  float | None = None,
) -> None:
    """Write to in-memory history and persist to SQLite."""
    _history.insert(0, {
        "farm":         farm_id,
        "type":         alert_type,
        "event":        event,
        "sensor_value": sensor_value,
        "threshold":    threshold,
        "duration_min": duration_min,
        "gap_minutes":  gap_minutes,
        "message":      message,
        "timestamp":    datetime.now(config.TIMEZONE).isoformat(),
    })
    del _history[50:]

    try:
        alert_log.log_alert(
            farm_id      = farm_id,
            alert_type   = alert_type,
            event        = event,
            sensor_value = sensor_value,
            threshold    = threshold,
            duration_min = duration_min,
            gap_minutes  = gap_minutes,
            message      = message,
        )
    except Exception as exc:
        print(f"[AlertChecker] DB log failed: {exc}")


def _handle(
    key:          str,
    farm_id:      str,
    alert_type:   str,
    is_active:    bool,
    alert_msg:    str,
    reminder_msg: str,
    resolved_msg: str,
    sensor_value: float | None = None,
    threshold:    float | None = None,
) -> None:
    """
    Core state machine.
    Sends the right message, updates _active, and records the event.
    Durations on resolved events exclude connectivity gaps.
    """
    if is_active:
        if key not in _active:
            _active[key]          = datetime.now(config.TIMEZONE)
            _active_farm[key]     = farm_id
            _alert_gap_start[key] = _farm_current_gap(farm_id)
            if telegram.send_message(alert_msg):
                _record(farm_id, alert_type, "alert", alert_msg, sensor_value, threshold)
                print(f"[AlertChecker] ALERT: {key} (value={sensor_value})")
        else:
            effective, _ = _effective_duration(key)
            if telegram.send_message(reminder_msg):
                _record(farm_id, alert_type, "reminder", reminder_msg, sensor_value, threshold)
                print(f"[AlertChecker] REMINDER: {key} ({effective:.0f} min effective)")
    else:
        if key in _active:
            effective, gap = _effective_duration(key)
            del _active[key]
            _active_farm.pop(key, None)
            _alert_gap_start.pop(key, None)
            if telegram.send_message(resolved_msg):
                _record(farm_id, alert_type, "resolved", resolved_msg,
                        sensor_value, threshold, effective, gap if gap > 0 else None)
                print(f"[AlertChecker] RESOLVED: {key} ({effective:.0f} min effective, {gap:.0f} min gap)")


# ── Public API ────────────────────────────────────────────────────────────

def get_history() -> list[dict]:
    return list(_history)


def get_status() -> dict:
    active_now = {}
    for k, start in _active.items():
        effective, gap = _effective_duration(k)
        active_now[k] = {
            "since":              start.isoformat(),
            "wall_minutes":       round(_since(k), 1),
            "effective_minutes":  round(effective, 1),
            "offline_gap_minutes": round(gap, 1),
        }
    return {
        "telegram_configured":       telegram.is_configured(),
        "check_interval_minutes":    config.ALERT_CHECK_INTERVAL_MINUTES,
        "offline_alert_minutes":     config.OFFLINE_ALERT_MINUTES,
        "maintenance_window":        f"{config.MAINTENANCE_START} – {config.MAINTENANCE_END}",
        "in_maintenance_window":     _in_maintenance_window(),
        "temp_warn_threshold":       config.DEFAULT_TEMP_WARN,
        "hum_warn_threshold":        config.DEFAULT_HUM_WARN,
        "max_spray_minutes":         config.MAX_SPRAY_MINUTES,
        "min_temp_drop_after_spray": config.MIN_TEMP_DROP_AFTER_SPRAY,
        "active_alerts":             active_now,
    }


# ── Per-farm check ────────────────────────────────────────────────────────

def _check_farm(farm_id: str) -> None:
    farm        = config.FARMS.get(farm_id)
    measurement = farm["measurement"]
    farm_name   = farm["display_name"]
    now_str     = datetime.now(config.TIMEZONE).strftime("%Y-%m-%d %H:%M:%S")

    try:
        readings = db.get_latest_readings(measurement)
    except Exception as exc:
        print(f"[AlertChecker] Could not fetch readings for {farm_id}: {exc}")
        return

    online_meta = readings.pop("_online", {"is_online": False, "data_age_minutes": None, "last_seen": None})
    is_online   = online_meta["is_online"]
    age_min     = online_meta.get("data_age_minutes") or 0.0

    # ── Update connectivity state (must happen before early return) ───────
    _track_connectivity(farm_id, is_online)

    # ── Offline alert — only after sustained outage, not brief drops ──────
    # Brief internet blips (< OFFLINE_ALERT_MINUTES) are silently absorbed.
    # During the scheduled hardware-shutdown window the alert is suppressed
    # entirely, and any in-progress offline state is cleared so the "back
    # online" message does not fire when the system restarts next morning.
    key = f"offline_{farm_id}"

    if _in_maintenance_window():
        if key in _active:
            del _active[key]
            _active_farm.pop(key, None)
            _alert_gap_start.pop(key, None)
            print(f"[AlertChecker] Maintenance window active — cleared offline state for {farm_id}")
        return  # nothing more to check while hardware is intentionally off

    is_offline_sustained = not is_online and age_min >= config.OFFLINE_ALERT_MINUTES
    active_min_offline   = _since(key)

    _handle(
        key          = key,
        farm_id      = farm_id,
        alert_type   = "offline",
        is_active    = is_offline_sustained,
        sensor_value = age_min,
        threshold    = config.OFFLINE_ALERT_MINUTES,
        alert_msg    = (
            f"🔴 *SENSOR OFFLINE*\n"
            f"Farm: {farm_name}\n"
            f"No new data for *{age_min:.0f} min*\n"
            f"Last seen: {online_meta.get('last_seen', 'unknown')}\n"
            f"Time: {now_str}"
        ),
        reminder_msg = (
            f"🔔 *SENSOR OFFLINE — Still Offline ({active_min_offline:.0f} min)*\n"
            f"Farm: {farm_name}\n"
            f"No new data for *{age_min:.0f} min*\n"
            f"Time: {now_str}"
        ),
        resolved_msg = (
            f"✅ *SENSOR BACK ONLINE*\n"
            f"Farm: {farm_name}\n"
            f"Data resumed after *{active_min_offline:.0f} min* offline\n"
            f"Time: {now_str}"
        ),
    )

    # Skip threshold checks when data is stale — old readings must not trigger alerts
    if not is_online:
        return

    temp = readings.get("temperature", {}).get("value")
    hum  = readings.get("humidity",    {}).get("value")

    # Read thresholds fresh every cycle — picks up any UI changes immediately
    thresholds = settings_service.get()
    temp_warn  = thresholds["temp_warn"]
    hum_warn   = thresholds["hum_warn"]

    # ── Temperature ───────────────────────────────────────────────────────
    key        = f"temperature_{farm_id}"
    is_active  = temp is not None and temp > temp_warn
    active_eff, _ = _effective_duration(key)

    _handle(
        key          = key,
        farm_id      = farm_id,
        alert_type   = "temperature",
        is_active    = is_active,
        sensor_value = temp,
        threshold    = temp_warn,
        alert_msg    = (
            f"🌡️ *TEMPERATURE ALERT*\n"
            f"Farm: {farm_name}\n"
            f"Temperature: *{temp:.1f}°C*  ┃  Threshold: {temp_warn}°C\n"
            f"Time: {now_str}"
        ),
        reminder_msg = (
            f"🔔 *TEMPERATURE — Still Active ({active_eff:.0f} min)*\n"
            f"Farm: {farm_name}\n"
            f"Temperature: *{temp:.1f}°C*  ┃  Threshold: {temp_warn}°C\n"
            f"Time: {now_str}"
        ),
        resolved_msg = (
            f"✅ *TEMPERATURE — Resolved*\n"
            f"Farm: {farm_name}\n"
            f"Temperature is back to normal (active {active_eff:.0f} min)\n"
            f"Time: {now_str}"
        ),
    )

    # ── Humidity ──────────────────────────────────────────────────────────
    key        = f"humidity_{farm_id}"
    is_active  = hum is not None and hum > hum_warn
    active_eff, _ = _effective_duration(key)

    _handle(
        key          = key,
        farm_id      = farm_id,
        alert_type   = "humidity",
        is_active    = is_active,
        sensor_value = hum,
        threshold    = hum_warn,
        alert_msg    = (
            f"💧 *HUMIDITY ALERT*\n"
            f"Farm: {farm_name}\n"
            f"Humidity: *{hum:.1f}%*  ┃  Threshold: {hum_warn}%\n"
            f"Time: {now_str}"
        ),
        reminder_msg = (
            f"🔔 *HUMIDITY — Still Active ({active_eff:.0f} min)*\n"
            f"Farm: {farm_name}\n"
            f"Humidity: *{hum:.1f}%*  ┃  Threshold: {hum_warn}%\n"
            f"Time: {now_str}"
        ),
        resolved_msg = (
            f"✅ *HUMIDITY — Resolved*\n"
            f"Farm: {farm_name}\n"
            f"Humidity is back to normal (active {active_eff:.0f} min)\n"
            f"Time: {now_str}"
        ),
    )

    # ── Spray pump / empty tank ───────────────────────────────────────────
    try:
        relay3_df   = db.get_relay3_raw(measurement, time_range="-60m")
        spray_stats = spray_analysis.analyze_spray_events(relay3_df)
    except Exception as exc:
        print(f"[AlertChecker] Spray analysis failed for {farm_id}: {exc}")
        return

    ongoing_duration: float | None = None
    for event in spray_stats.get("spray_events", []):
        if event.get("ongoing") and event["duration_minutes"] > config.MAX_SPRAY_MINUTES:
            ongoing_duration = event["duration_minutes"]
            break

    key        = f"spray_long_{farm_id}"
    is_active  = ongoing_duration is not None
    active_eff, _ = _effective_duration(key)

    if is_active:
        dur = ongoing_duration or 0.0
        temp_at_start = db.get_temp_at_range_start(measurement, dur)

        if temp_at_start is not None and temp is not None:
            temp_delta = temp - temp_at_start
            cooled     = temp_delta <= -config.MIN_TEMP_DROP_AFTER_SPRAY
            tank_line  = (
                f"🚨 Temp: {temp_at_start:.1f}→{temp:.1f}°C (Δ{temp_delta:+.1f}°C) — *no cooling*\n"
                f"*Tank is likely empty*"
            ) if not cooled else (
                f"Temp dropped {abs(temp_delta):.1f}°C — pump may be slow-draining"
            )
            alert_type = "empty_tank" if not cooled else "long_spray"
        else:
            tank_line  = "Temperature comparison unavailable"
            alert_type = "long_spray"

        _handle(
            key          = key,
            farm_id      = farm_id,
            alert_type   = alert_type,
            is_active    = True,
            sensor_value = dur,
            threshold    = config.MAX_SPRAY_MINUTES,
            alert_msg    = (
                f"⚠️ *ABNORMAL SPRAY — ALERT*\n"
                f"Farm: {farm_name}\n"
                f"Pump running: *{dur:.1f} min*  ┃  Max: {config.MAX_SPRAY_MINUTES:.0f} min\n"
                f"{tank_line}\n"
                f"👉 Check water tank and relay\n"
                f"Time: {now_str}"
            ),
            reminder_msg = (
                f"🔔 *ABNORMAL SPRAY — Still Active ({active_eff:.0f} min)*\n"
                f"Farm: {farm_name}\n"
                f"Pump still running: *{dur:.1f} min*\n"
                f"{tank_line}\n"
                f"👉 Pump has not stopped — check immediately\n"
                f"Time: {now_str}"
            ),
            resolved_msg = (
                f"✅ *SPRAY PUMP — Stopped*\n"
                f"Farm: {farm_name}\n"
                f"Pump stopped after *{active_eff:.0f} min* of abnormal running\n"
                f"👉 Check tank water level before next spray cycle\n"
                f"Time: {now_str}"
            ),
        )
    else:
        _handle(
            key=key, farm_id=farm_id, alert_type="long_spray",
            is_active=False, sensor_value=None, threshold=config.MAX_SPRAY_MINUTES,
            alert_msg="", reminder_msg="",
            resolved_msg=(
                f"✅ *SPRAY PUMP — Stopped*\n"
                f"Farm: {farm_name}\n"
                f"Pump stopped after *{active_eff:.0f} min* of abnormal running\n"
                f"👉 Check tank water level before next spray cycle\n"
                f"Time: {now_str}"
            ),
        )


# ── Entry point ───────────────────────────────────────────────────────────

def run_all_checks() -> None:
    """Check every configured farm. Called by the background scheduler."""
    print(f"[AlertChecker] Running at {datetime.now(config.TIMEZONE).strftime('%H:%M:%S')}")
    for farm_id in config.FARMS:
        try:
            _check_farm(farm_id)
        except Exception as exc:
            print(f"[AlertChecker] Unhandled error for {farm_id}: {exc}")
