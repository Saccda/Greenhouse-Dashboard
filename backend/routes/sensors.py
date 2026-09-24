"""
/api/sensors  — live readings, history, spray stats, health
"""
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, Query, HTTPException

import config
from schemas import (
    LatestResponse, FieldReading, RelayStatus, Alert,
    HistoryResponse, TimePoint,
    SprayStatsResponse, SprayStats, SprayEvent,
    HealthResponse,
)
from services import auth_service
from services import influxdb_service as db
from services import spray_analysis

# Deny-by-default: every route on this router requires a logged-in session
# unless explicitly overridden — a new endpoint added here is protected
# automatically instead of relying on remembering to add the dependency.
router = APIRouter(
    prefix="/api/sensors",
    tags=["sensors"],
    dependencies=[Depends(auth_service.require_auth)],
)


def _measurement(farm_id: str) -> str:
    farm = config.FARMS.get(farm_id)
    if not farm:
        raise HTTPException(status_code=404, detail=f"Unknown farm: '{farm_id}'")
    return farm["measurement"]


# ── GET /api/sensors/latest ───────────────────────────────────────────────

@router.get("/latest", response_model=LatestResponse)
def get_latest(
    farm:      str   = Query(default=config.DEFAULT_FARM),
    temp_warn: float = Query(default=config.DEFAULT_TEMP_WARN),
    hum_warn:  float = Query(default=config.DEFAULT_HUM_WARN),
    user:      dict  = Depends(auth_service.require_auth),
) -> LatestResponse:
    auth_service.require_farm_access(user, farm)
    measurement  = _measurement(farm)
    raw_readings = db.get_latest_readings(measurement, config.FARM_FIELDS[farm])

    # Pop the staleness metadata — must not be treated as a field reading
    online_meta  = raw_readings.pop("_online", {"is_online": False, "data_age_minutes": None, "last_seen": None})
    is_online    = online_meta["is_online"]

    # Only pass live alerts when data is fresh — stale readings should not trigger alerts
    raw_alerts = db.get_alerts(raw_readings, temp_warn, hum_warn) if is_online else []

    readings = {
        field: FieldReading(value=r["value"], timestamp=r["timestamp"])
        for field, r in raw_readings.items()
    }

    relays = [
        RelayStatus(
            key=relay_key,
            label=meta["label"],
            icon=meta["icon"],
            description=meta.get("description", ""),
            # Relay state is UNKNOWN when data is stale — last known state is misleading
            state=(
                "UNKNOWN" if not is_online else
                "ON"  if raw_readings.get(relay_key, {}).get("value") == 1 else
                "OFF" if raw_readings.get(relay_key, {}).get("value") == 0 else
                "UNKNOWN"
            ),
            value=raw_readings.get(relay_key, {}).get("value") if is_online else None,
            timestamp=raw_readings.get(relay_key, {}).get("timestamp"),
            controllable=meta.get("controllable", False),
        )
        for relay_key, meta in config.FARM_CHANNELS.get(farm, {}).items()
    ]

    alerts = [Alert(**a) for a in raw_alerts]

    return LatestResponse(
        farm=farm,
        timestamp=datetime.now(config.TIMEZONE).isoformat(),
        is_online=is_online,
        data_age_minutes=online_meta["data_age_minutes"],
        last_seen=online_meta["last_seen"],
        readings=readings,
        relays=relays,
        alerts=alerts,
    )


# ── GET /api/sensors/history ──────────────────────────────────────────────

@router.get("/history", response_model=HistoryResponse)
def get_history(
    farm:       str            = Query(default=config.DEFAULT_FARM),
    range:      str            = Query(default=config.DEFAULT_TIME_RANGE),
    agg:        str            = Query(default=config.DEFAULT_AGGREGATION),
    start_date: str | None     = Query(default=None, description="YYYY-MM-DD absolute start"),
    end_date:   str | None     = Query(default=None, description="YYYY-MM-DD absolute end"),
    user:       dict           = Depends(auth_service.require_auth),
) -> HistoryResponse:
    auth_service.require_farm_access(user, farm)
    measurement = _measurement(farm)
    raw_series  = db.get_history(measurement, config.FARM_FIELDS[farm], range, agg, start_date, end_date)

    series = {
        field: [TimePoint(time=p["time"], value=p["value"]) for p in points]
        for field, points in raw_series.items()
    }

    return HistoryResponse(farm=farm, range=range, aggregation=agg, series=series)


# ── GET /api/sensors/spray-stats ──────────────────────────────────────────

@router.get("/spray-stats", response_model=SprayStatsResponse)
def get_spray_stats(
    farm:       str        = Query(default=config.DEFAULT_FARM),
    range:      str | None = Query(default=None, description="Relative range, e.g. -7d — omit for today's stats"),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD absolute start"),
    end_date:   str | None = Query(default=None, description="YYYY-MM-DD absolute end"),
    user:       dict       = Depends(auth_service.require_auth),
) -> SprayStatsResponse:
    auth_service.require_farm_access(user, farm)
    measurement = _measurement(farm)

    if start_date and end_date:
        # Date-range query: pull raw relay3 for the whole window, analyse all events
        raw_df    = db.get_relay3_raw(measurement, start_date=start_date, end_date=end_date)
        raw_stats = spray_analysis.analyze_spray_events(raw_df)
    elif range:
        # Relative-range query (mirrors /history's `range` param) — analyse every event
        # in the window, not just today's, so 7d/30d selections aren't silently clipped.
        raw_df    = db.get_relay3_raw(measurement, time_range=range)
        raw_stats = spray_analysis.analyze_spray_events(raw_df)
    else:
        # Default: today's events from the last 24 h of raw data
        raw_df    = db.get_relay3_raw(measurement, time_range="-1d")
        raw_stats = spray_analysis.get_today_spray_stats(raw_df)

    events = [
        SprayEvent(
            start_time=e["start_time"],
            end_time=e["end_time"],
            duration_minutes=e["duration_minutes"],
            ongoing=e.get("ongoing", False),
            incomplete=e.get("incomplete"),
        )
        for e in raw_stats.get("spray_events", [])
    ]

    fogger_spec = config.FARMS.get(farm, {}).get("fogger_spec")

    stats = SprayStats(
        spray_events=events,
        total_sprays=raw_stats["total_sprays"],
        total_spray_minutes=raw_stats["total_spray_minutes"],
        avg_spray_minutes=raw_stats["avg_spray_minutes"],
        total_spray_display=spray_analysis.format_duration(raw_stats["total_spray_minutes"]),
        estimated_water_liters=spray_analysis.estimate_water_liters(raw_stats["total_spray_minutes"], fogger_spec),
        data_status=raw_stats["data_status"],
        last_data_time=raw_stats.get("last_data_time"),
    )

    return SprayStatsResponse(farm=farm, stats=stats)


# ── GET /api/sensors/health ───────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
def sensor_health() -> HealthResponse:
    ok = db.health_check()
    return HealthResponse(
        status="healthy" if ok else "degraded",
        influxdb="connected" if ok else "unreachable",
        timestamp=datetime.now(config.TIMEZONE).isoformat(),
    )


@router.get("/water")
def water(farm: str = Query(...), user: dict = Depends(auth_service.require_auth)) -> dict:
    """
    Measured water use from the flow meter, newest day first.

    This is MEASURED, unlike the estimated_water_liters on /spray-stats, which
    multiplies spray runtime by a nozzle flow rate. Both are reported where both
    exist: an estimate that disagrees with the meter is worth seeing, because it
    is how a blocked nozzle or a leak shows up.

    Only campus has a meter. Other farms return readings=[] and a reason,
    rather than a 404 — a farm with no meter is a normal state, not an error.
    """
    auth_service.require_farm_access(user, farm)
    if farm not in config.FARMS:
        raise HTTPException(status_code=404, detail=f"Unknown farm '{farm}'")

    measurement = config.FARMS[farm]["measurement"]
    df = db.get_water_history(measurement)

    readings = []
    if not df.empty:
        for _, row in df.iterrows():
            start = row.get("water_start_totalizer")
            last  = row.get("water_last_totalizer")
            day   = row.get("water_day_consumption")

            # A reset makes the day's figure meaningless — it measures the
            # reset, not the water. Report it as such rather than charting a
            # negative or a spike that never happened.
            reset = start is not None and last is not None and not pd.isna(start)                 and not pd.isna(last) and float(last) < float(start)

            readings.append({
                "timestamp":       row["_time"].isoformat(),
                "start_totalizer": None if start is None or pd.isna(start) else float(start),
                "last_totalizer":  None if last  is None or pd.isna(last)  else float(last),
                "consumption":     None if reset or day is None or pd.isna(day) else float(day),
                "meter_reset":     bool(reset),
            })
        readings.reverse()

    return {
        "farm": farm,
        "unit": config.CAMPUS_WATER_UNIT,
        # Stated plainly rather than buried: the meter does not publish its unit
        # and nobody has confirmed it, so the label is an assumption. The raw
        # totalizer readings are returned alongside so a wrong one is visible.
        "unit_confirmed": False,
        "readings": readings,
        "reason": None if readings else (
            "No water meter has published for this farm yet"
        ),
    }
