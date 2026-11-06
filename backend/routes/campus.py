"""
/api/campus — PP Campus-specific control.

Two independent control models, both bypassing Node-RED (unlike Kampot/Kep's
threshold model in routes/setpoint.py, which is proxied through it):

  - Direct relay commands  — POST /relay-command — {"CH1": 1} style on/off.
  - Auto threshold setpoints — POST /setpoint — three zones (two temperature,
    one humidity), sent as one combined 6-value object because that's what
    the controller's own MQTT_Setpoint_Sub topic expects on every publish,
    not a partial per-zone update.
"""
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

import config
from services import auth_service, mqtt_publish_service, setpoint_service

FARM_ID = "campus"

# Deny-by-default like every other router — a new endpoint added here is
# protected automatically instead of relying on remembering the dependency.
router = APIRouter(
    prefix="/api/campus",
    tags=["campus"],
    dependencies=[Depends(auth_service.require_auth)],
)


class RelayCommandRequest(BaseModel):
    channel: str = Field(..., description="Channel key, e.g. 'CH1'")
    state:   int = Field(..., ge=0, le=1, description="0 = off, 1 = on")


@router.post("/relay-command")
def send_relay_command(
    body: RelayCommandRequest,
    user: dict = Depends(auth_service.require_write_access),
) -> dict:
    auth_service.require_farm_access(user, FARM_ID)

    channel_cfg = config.FARM_CHANNELS[FARM_ID].get(body.channel)
    if channel_cfg is None:
        raise HTTPException(status_code=400, detail=f"Unknown channel '{body.channel}'")
    if not channel_cfg.get("controllable"):
        raise HTTPException(status_code=400, detail=f"Channel '{body.channel}' is not controllable")

    try:
        mqtt_publish_service.publish(config.CAMPUS_RELAY_COMMAND_TOPIC, {body.channel: body.state})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MQTT publish failed: {e}")

    return {"channel": body.channel, "state": body.state}


# ── Auto threshold setpoints (zones 1/2 = temperature, zone 3 = humidity) ──

class SetpointRequest(BaseModel):
    # The same ranges the panel enforces. Typed values reach the hardware on one
    # click, so a slip like 260 has to be refused here as well as in the browser.
    temp_low1:  float = Field(..., ge=0, le=50)
    temp_high1: float = Field(..., ge=0, le=50)
    temp_low2:  float = Field(..., ge=0, le=50)
    temp_high2: float = Field(..., ge=0, le=50)
    hum_low3:   float = Field(..., ge=0, le=100)
    hum_high3:  float = Field(..., ge=0, le=100)

    @model_validator(mode="after")
    def low_below_high(self) -> "SetpointRequest":
        for low, high in ((self.temp_low1, self.temp_high1),
                          (self.temp_low2, self.temp_high2),
                          (self.hum_low3,  self.hum_high3)):
            if low >= high:
                raise ValueError(f"low setpoint {low} must be below high setpoint {high}")
        return self


@router.get("/setpoint")
def get_campus_setpoint(user: dict = Depends(auth_service.require_auth)) -> dict:
    """Last-sent setpoints, keyed by zone — {"1": {low, high, updated_at}, "2": {...}, "3": {...}}."""
    auth_service.require_farm_access(user, FARM_ID)
    return setpoint_service.get(FARM_ID)


@router.post("/setpoint")
def send_campus_setpoint(
    body: SetpointRequest,
    user: dict = Depends(auth_service.require_write_access),
) -> dict:
    """
    Publish the complete 6-value setpoint object, then persist each zone —
    reuses the exact same per-farm+relay storage Kampot/Kep's setpoint_service
    already provides, just with campus's zone numbers (1/2/3) standing in for
    relay numbers.
    """
    auth_service.require_farm_access(user, FARM_ID)

    payload = body.model_dump()
    try:
        mqtt_publish_service.publish(config.CAMPUS_SETPOINT_TOPIC, payload)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MQTT publish failed: {e}")

    setpoint_service.save(FARM_ID, 1, body.temp_low1, body.temp_high1)
    setpoint_service.save(FARM_ID, 2, body.temp_low2, body.temp_high2)
    setpoint_service.save(FARM_ID, 3, body.hum_low3,  body.hum_high3)

    return payload


@router.get("/reported")
def get_campus_reported(user: dict = Depends(auth_service.require_auth)) -> dict:
    """
    What the CONTROLLER says its own setpoints are, as opposed to what the
    dashboard last sent.

    These are different claims and the system treated them as one for a long
    time. /setpoint returns the last publish this dashboard made; it says
    nothing about whether any hardware received it. For three weeks every
    publish went to a topic the controller was not subscribed to, so the screen
    showed setpoints no device held, and nothing anywhere could tell.

    The controller publishes its own configuration on a retained topic. The
    MQTT bridge subscribes and writes it to data/campus_reported.json, which
    this reads. Shape:

        {"relay_setpoints": {"values": {...}, "reported_at": "..."},
         "water_setpoint":  {"values": {"Set_water_temp": 34.6}, ...}}

    An empty object means the bridge has not seen a status message yet — it is
    not the same as the controller having no setpoints, and the UI says so
    rather than drawing a comparison it cannot make.
    """
    auth_service.require_farm_access(user, FARM_ID)
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "data", "campus_reported.json")
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"campus_reported.json is unreadable: {e}")
