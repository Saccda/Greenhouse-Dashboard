"""
/api/analytics — decision-oriented statistics for the Analytics page.

One endpoint returns the whole page's payload rather than five chatty ones:
every section is computed from the same raw pull, so splitting them would mean
re-fetching (and re-scanning) the same readings several times per page load.

All statistics are computed in services/analytics_service.py — see the module
docstring there for the methodological caveats that belong alongside these
numbers (sampling bias, autocorrelation, and the observational nature of the
spray comparison).
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

import config
from services import auth_service
from services import influxdb_service as db
from services import analytics_service as an
from services import spray_analysis

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
    dependencies=[Depends(auth_service.require_auth)],
)

# Relative ranges the UI offers, mapped to their length in days so the coverage
# calculation knows what "expected" means.
RANGE_DAYS = {"-24h": 1, "-7d": 7, "-30d": 30, "-90d": 90}


def _measurement(farm_id: str) -> str:
    farm = config.FARMS.get(farm_id)
    if not farm:
        raise HTTPException(status_code=404, detail=f"Unknown farm: '{farm_id}'")
    return farm["measurement"]


@router.get("/summary")
def get_summary(
    farm:           str   = Query(default=config.DEFAULT_FARM),
    range:          str   = Query(default="-7d", description="One of -24h, -7d, -30d, -90d"),
    temp_threshold: float = Query(default=config.DEFAULT_TEMP_WARN),
    hum_threshold:  float = Query(default=config.DEFAULT_HUM_WARN),
    user:           dict  = Depends(auth_service.require_auth),
) -> dict:
    auth_service.require_farm_access(user, farm)

    if range not in RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported range '{range}'. Use one of: {', '.join(RANGE_DAYS)}",
        )

    measurement = _measurement(farm)
    days = RANGE_DAYS[range]
    end = datetime.now(config.TIMEZONE)
    start = end - timedelta(days=days)

    # One raw pull feeds every section below.
    df = db.get_raw_fields(measurement, ["temperature", "humidity"], time_range=range)

    thresholds = {"temperature": temp_threshold, "humidity": hum_threshold}
    parameters = {}
    for field in ("temperature", "humidity"):
        parameters[field] = {
            "coverage":      an.coverage(df, field, start, end),
            "describe":      an.describe(df, field),
            "histogram":     an.histogram(df, field),
            "time_in_range": an.time_in_range(df, field),
            "exceedance":    an.exceedance(df, field, thresholds[field]),
            "diurnal":       an.diurnal_profile(df, field),
        }

    # ── Spray effectiveness ──
    # Uses the same raw relay stream the spray-stats endpoint does, so event
    # detection stays consistent between the two pages.
    relay_df = db.get_relay3_raw(measurement, time_range=range)
    raw_spray = spray_analysis.analyze_spray_events(relay_df)
    fogger_spec = config.FARMS.get(farm, {}).get("fogger_spec")
    spray_stats = {
        "total_sprays":           raw_spray["total_sprays"],
        "total_spray_minutes":    raw_spray["total_spray_minutes"],
        "avg_spray_minutes":      raw_spray["avg_spray_minutes"],
        "estimated_water_liters": spray_analysis.estimate_water_liters(
            raw_spray["total_spray_minutes"], fogger_spec
        ),
    }
    effect = an.spray_effect(df, raw_spray.get("spray_events", []), field="temperature")

    return {
        "farm":         farm,
        "range":        range,
        "range_days":   days,
        "generated_at": end.isoformat(),
        "thresholds":   thresholds,
        "bands":        config.ANALYTICS_BANDS,
        "parameters":   parameters,
        "spray": {
            "stats":            spray_stats,
            "effect":           effect,
            "water_efficiency": an.water_efficiency(spray_stats, effect),
        },
    }
