"""
/api/sensors  — live readings, history, spray stats, health
"""
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException

import config
from schemas import (
    LatestResponse, FieldReading, RelayStatus, Alert,
    HistoryResponse, TimePoint,
    SprayStatsResponse, SprayStats, SprayEvent,
    HealthResponse,
)
from services import influxdb_service as db
from services import spray_analysis

router = APIRouter(prefix="/api/sensors", tags=["sensors"])


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
) -> LatestResponse:
    measurement  = _measurement(farm)
    raw_readings = db.get_latest_readings(measurement)

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
        )
        for relay_key, meta in config.RELAY_LABELS.items()
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
) -> HistoryResponse:
    measurement = _measurement(farm)
    raw_series  = db.get_history(measurement, range, agg, start_date, end_date)

    series = {
        field: [TimePoint(time=p["time"], value=p["value"]) for p in points]
        for field, points in raw_series.items()
    }

    return HistoryResponse(farm=farm, range=range, aggregation=agg, series=series)


# ── GET /api/sensors/spray-stats ──────────────────────────────────────────

@router.get("/spray-stats", response_model=SprayStatsResponse)
def get_spray_stats(
    farm:       str        = Query(default=config.DEFAULT_FARM),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD absolute start"),
    end_date:   str | None = Query(default=None, description="YYYY-MM-DD absolute end"),
) -> SprayStatsResponse:
    measurement = _measurement(farm)

    if start_date and end_date:
        # Date-range query: pull raw relay3 for the whole window, analyse all events
        raw_df    = db.get_relay3_raw(measurement, start_date=start_date, end_date=end_date)
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

    stats = SprayStats(
        spray_events=events,
        total_sprays=raw_stats["total_sprays"],
        total_spray_minutes=raw_stats["total_spray_minutes"],
        avg_spray_minutes=raw_stats["avg_spray_minutes"],
        total_spray_display=spray_analysis.format_duration(raw_stats["total_spray_minutes"]),
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
