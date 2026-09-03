"""
InfluxDB service — connection-per-request pattern.

Each public function opens a fresh InfluxDBClient, runs its query,
closes the client, and returns plain Python dicts/lists.  This completely
eliminates the long-running connection timeout that plagued the original
global-client design.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from typing import Generator

import pandas as pd
from influxdb_client import InfluxDBClient
from influxdb_client.client.write_api import SYNCHRONOUS

import config


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

@contextmanager
def _client() -> Generator[any, None, None]:
    """Context manager that creates and cleanly closes a fresh InfluxDB client."""
    c = InfluxDBClient(
        url=config.INFLUXDB_URL,
        token=config.INFLUXDB_TOKEN,
        org=config.INFLUXDB_ORG,
        timeout=30_000,       # 30 s request timeout
        enable_gzip=True,
    )
    try:
        yield c.query_api()
    finally:
        c.close()


def _run_query(flux: str) -> pd.DataFrame:
    """Execute a Flux query and return a tidy DataFrame."""
    with _client() as api:
        tables = api.query(flux)

    rows: list[dict] = []
    for table in tables:
        for record in table.records:
            rows.append({
                "time":  record["_time"],
                "field": record["_field"],
                "value": record["_value"],
            })

    if not rows:
        return pd.DataFrame(columns=["time", "field", "value"])

    df = pd.DataFrame(rows)
    df["time"] = pd.to_datetime(df["time"]).dt.tz_convert(config.TIMEZONE)
    return df


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def health_check() -> bool:
    """Return True if InfluxDB is reachable."""
    try:
        bucket = config.INFLUXDB_BUCKET
        flux = f'from(bucket: "{bucket}") |> range(start: -1m) |> limit(n: 1)'
        with _client() as api:
            api.query(flux)
        return True
    except Exception:
        return False


def _field_filter(fields: list[str]) -> str:
    """Build a Flux `r._field == "x" or r._field == "y" or ...` clause."""
    return " or\n       ".join(f'r._field == "{f}"' for f in fields)


def get_latest_readings(measurement: str, fields: list[str]) -> dict:
    """
    Return the most recent value for each field in the measurement.

    `fields` is the farm's own field list (config.FARM_FIELDS[farm]) — Kampot/
    Kep query temperature/humidity/relay1-3, campus queries temperature/
    humidity/CH1-8, etc.

    Returns a dict:
      {
        "_online": {"is_online": bool, "data_age_minutes": float, "last_seen": str|None},
        "temperature": {"value": 32.1, "timestamp": "..."},
        ...
      }

    "_online" must be popped by the caller before iterating over field readings.
    is_online = False when the newest reading is older than DATA_STALE_MINUTES.
    """
    bucket = config.INFLUXDB_BUCKET
    flux = f'''
from(bucket: "{bucket}")
  |> range(start: -6h)
  |> filter(fn: (r) => r._measurement == "{measurement}")
  |> filter(fn: (r) => {_field_filter(fields)})
  |> last()
'''
    try:
        df = _run_query(flux)
    except Exception as e:
        print(f"[InfluxDB] get_latest_readings failed: {e}")
        return {"_online": {"is_online": False, "data_age_minutes": None, "last_seen": None}}

    if df.empty:
        return {"_online": {"is_online": False, "data_age_minutes": None, "last_seen": None}}

    # Compute data age from the most recent timestamp
    most_recent  = df["time"].max()
    now          = datetime.now(config.TIMEZONE)
    age_minutes  = (now - most_recent).total_seconds() / 60
    is_online    = age_minutes <= config.DATA_STALE_MINUTES

    result: dict = {
        "_online": {
            "is_online":        is_online,
            "data_age_minutes": round(age_minutes, 1),
            "last_seen":        most_recent.isoformat(),
        }
    }
    for _, row in df.iterrows():
        field = row["field"]
        result[field] = {
            "value":     row["value"],
            "timestamp": row["time"].isoformat(),
        }
    return result


def _tz_offset() -> str:
    """Return the configured timezone offset as '+HH:MM' string."""
    now = datetime.now(config.TIMEZONE)
    total_seconds = int(now.utcoffset().total_seconds())
    sign  = "+" if total_seconds >= 0 else "-"
    hours = abs(total_seconds) // 3600
    mins  = (abs(total_seconds) % 3600) // 60
    return f"{sign}{hours:02d}:{mins:02d}"


def get_history(
    measurement: str,
    fields:      list[str],
    time_range:  str = "-1h",
    aggregation: str = "1m",
    start_date:  str | None = None,   # YYYY-MM-DD absolute start
    end_date:    str | None = None,   # YYYY-MM-DD absolute end
) -> dict:
    """
    Return time-series data suitable for charting.

    `fields` is the farm's own field list (config.FARM_FIELDS[farm]).

    Returns a dict of  { field: [{"time": iso_str, "value": float}, ...] }
    """
    bucket = config.INFLUXDB_BUCKET

    if start_date and end_date:
        tz = _tz_offset()
        range_clause = f"range(start: {start_date}T00:00:00{tz}, stop: {end_date}T23:59:59{tz})"
    else:
        range_clause = f"range(start: {time_range})"

    flux = f'''
from(bucket: "{bucket}")
  |> {range_clause}
  |> filter(fn: (r) => r._measurement == "{measurement}")
  |> filter(fn: (r) => {_field_filter(fields)})
  |> aggregateWindow(every: {aggregation}, fn: mean, createEmpty: false)
'''
    try:
        df = _run_query(flux)
    except Exception as e:
        print(f"[InfluxDB] get_history failed: {e}")
        return {}

    series: dict = {}
    for field, group in df.groupby("field"):
        series[field] = [
            {"time": row["time"].isoformat(), "value": row["value"]}
            for _, row in group.sort_values("time").iterrows()
        ]
    return series


def get_relay3_raw(
    measurement: str,
    time_range:  str = "-1d",
    start_date:  str | None = None,   # YYYY-MM-DD absolute start
    end_date:    str | None = None,   # YYYY-MM-DD absolute end
) -> pd.DataFrame:
    """
    Return raw (un-aggregated) relay3 data for spray event detection.
    Aggregation destroys the transitions needed to count spray cycles.
    Accepts either a relative time_range or an absolute start_date/end_date pair.
    """
    bucket = config.INFLUXDB_BUCKET

    if start_date and end_date:
        tz = _tz_offset()
        range_clause = f"range(start: {start_date}T00:00:00{tz}, stop: {end_date}T23:59:59{tz})"
    else:
        range_clause = f"range(start: {time_range})"

    flux = f'''
from(bucket: "{bucket}")
  |> {range_clause}
  |> filter(fn: (r) => r._measurement == "{measurement}")
  |> filter(fn: (r) => r._field == "relay3")
'''
    try:
        return _run_query(flux)
    except Exception as e:
        print(f"[InfluxDB] get_relay3_raw failed: {e}")
        return pd.DataFrame(columns=["time", "field", "value"])


def get_raw_fields(
    measurement: str,
    fields:      list[str],
    time_range:  str = "-7d",
    start_date:  str | None = None,   # YYYY-MM-DD absolute start
    end_date:    str | None = None,   # YYYY-MM-DD absolute end
) -> pd.DataFrame:
    """
    Return RAW (un-aggregated) readings for the given fields.

    Deliberately not aggregated: get_history()'s aggregateWindow(mean) is right
    for charting, but it destroys the very things the analytics service needs —
    the shape of the distribution, the true min/max, exceedance counts, and the
    exact transitions that delimit spray events. A 30-day pull at Kampot's ~30 s
    cadence is ~86k rows, which pandas handles comfortably server-side; only the
    computed summaries are ever sent to the browser.

    Returns a tidy DataFrame with columns [time, field, value].
    """
    bucket = config.INFLUXDB_BUCKET

    if start_date and end_date:
        tz = _tz_offset()
        range_clause = f"range(start: {start_date}T00:00:00{tz}, stop: {end_date}T23:59:59{tz})"
    else:
        range_clause = f"range(start: {time_range})"

    flux = f'''
from(bucket: "{bucket}")
  |> {range_clause}
  |> filter(fn: (r) => r._measurement == "{measurement}")
  |> filter(fn: (r) => {_field_filter(fields)})
'''
    try:
        return _run_query(flux)
    except Exception as e:
        print(f"[InfluxDB] get_raw_fields failed: {e}")
        return pd.DataFrame(columns=["time", "field", "value"])


def get_temp_at_range_start(measurement: str, window_minutes: float) -> float | None:
    """
    Return the FIRST temperature reading within the last `window_minutes` minutes.
    Used by the alert checker to compare temperature at the start of a spray event
    vs. current temperature to detect whether the spray cooled the farm.
    """
    bucket = config.INFLUXDB_BUCKET
    flux = f'''
from(bucket: "{bucket}")
  |> range(start: -{int(window_minutes + 5)}m)
  |> filter(fn: (r) => r._measurement == "{measurement}")
  |> filter(fn: (r) => r._field == "temperature")
  |> first()
'''
    try:
        df = _run_query(flux)
        if not df.empty:
            return float(df.iloc[0]["value"])
    except Exception as e:
        print(f"[InfluxDB] get_temp_at_range_start failed: {e}")
    return None


def get_alerts(latest: dict, temp_warn: float, hum_warn: float) -> list[dict]:
    """
    Derive alert list from the latest readings dict.
    """
    alerts: list[dict] = []

    temp = latest.get("temperature", {}).get("value")
    if temp is not None and temp > temp_warn:
        alerts.append({
            "type":    "warning",
            "field":   "temperature",
            "message": f"Temperature {temp:.1f}°C exceeds threshold ({temp_warn}°C)",
        })

    hum = latest.get("humidity", {}).get("value")
    if hum is not None and hum > hum_warn:
        alerts.append({
            "type":    "warning",
            "field":   "humidity",
            "message": f"Humidity {hum:.1f}% exceeds threshold ({hum_warn}%)",
        })

    return alerts
