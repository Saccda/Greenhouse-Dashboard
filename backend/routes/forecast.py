"""
/api/ml/forecast — Stage 1 preview: persistence forecast + validated interval.

DEVELOPER-ONLY. Gated with require_developer, which excludes the owner account
on purpose (ML_METHODOLOGY.md §2.6): this is a work-in-progress preview shown
only to developer accounts until it has been signed off. The owner gets a 403,
which is the intended behaviour, and the frontend hides the card for any
non-developer so the owner never sees a broken request either.
"""
from fastapi import APIRouter, Depends, HTTPException, Query

import config
from services import auth_service
from services import forecast_service
from services import anomaly_service

router = APIRouter(
    prefix="/api/ml",
    tags=["forecast"],
    dependencies=[Depends(auth_service.require_developer)],
)


@router.get("/forecast")
def get_forecast(
    farm:   str = Query(default="kampot"),
    target: str = Query(default="temperature"),
    _user:  dict = Depends(auth_service.require_developer),
):
    if farm not in config.FARMS:
        raise HTTPException(status_code=404, detail=f"Unknown farm: '{farm}'")
    if target not in ("temperature", "humidity"):
        raise HTTPException(status_code=400, detail="target must be temperature or humidity")
    auth_service.require_farm_access(_user, farm)
    return forecast_service.get_forecast(farm, target)


@router.get("/anomalies")
def get_anomalies(
    farm:  str = Query(default="kampot"),
    days:  int = Query(default=7, ge=1, le=30),
    _user: dict = Depends(auth_service.require_developer),
):
    """
    Stage 2 sensor health (§3). Returns grouped INCIDENTS rather than raw events,
    because thirty flags from one thrashing sensor is one interruption, not
    thirty — and an alert stream that does not respect that gets muted (§3.3).
    """
    if farm not in config.FARMS:
        raise HTTPException(status_code=404, detail=f"Unknown farm: '{farm}'")
    auth_service.require_farm_access(_user, farm)
    return anomaly_service.farm_health(farm, days)
