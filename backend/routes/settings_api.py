"""
/api/settings — user-configurable alert thresholds.

GET  /api/settings        → current values
POST /api/settings        → update and persist
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from services import settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ThresholdPayload(BaseModel):
    temp_warn: float = Field(ge=15, le=60, description="Temperature alert threshold (°C)")
    hum_warn:  float = Field(ge=10, le=100, description="Humidity alert threshold (%)")


@router.get("")
def get_settings() -> dict:
    """Return current alert thresholds."""
    return settings_service.get()


@router.post("")
def update_settings(payload: ThresholdPayload) -> dict:
    """Persist new thresholds. Takes effect on the next alert checker cycle."""
    return settings_service.save({
        "temp_warn": payload.temp_warn,
        "hum_warn":  payload.hum_warn,
    })
