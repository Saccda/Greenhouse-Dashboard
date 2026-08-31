"""
Setpoint proxy — forwards controller setpoint commands from the dashboard to
Node-RED, which publishes them to the ESP32 via MQTT (HiveMQ Cloud).

Payload  :  { farm, relay, low, high }
Node-RED :  POST {NODE_RED_URL}/api/setpoint
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import httpx

import config
from services import auth_service
from services import setpoint_service

router = APIRouter(tags=["setpoint"], dependencies=[Depends(auth_service.require_auth)])


class SetpointRequest(BaseModel):
    farm:  str   = Field(..., description="Farm ID: 'kampot' or 'kep'")
    relay: int   = Field(..., ge=1, le=3, description="Relay number 1–3")
    low:   float = Field(..., description="Low setpoint value (P1/P3/P5)")
    high:  float = Field(..., description="High setpoint value (P2/P4/P6)")


@router.get("/api/setpoint")
def get_setpoints(farm: str, user: dict = Depends(auth_service.require_auth)) -> dict:
    """Last-sent setpoint per relay for this farm."""
    if farm not in config.FARMS:
        raise HTTPException(status_code=400, detail=f"Unknown farm '{farm}'")
    if farm == "campus":
        raise HTTPException(status_code=400, detail="Campus uses /api/campus/setpoint, not this endpoint")
    auth_service.require_farm_access(user, farm)
    return setpoint_service.get(farm)


@router.post("/api/setpoint")
async def send_setpoint(body: SetpointRequest, user: dict = Depends(auth_service.require_write_access)):
    """Proxy a setpoint command to Node-RED, then persist it if the send succeeded."""
    if body.farm not in config.FARMS:
        raise HTTPException(status_code=400, detail=f"Unknown farm '{body.farm}'")
    if body.farm == "campus":
        # Campus bypasses Node-RED and uses a different 6-value setpoint shape
        # entirely (see routes/campus.py) — never let this proxy reach it, and
        # never let it write into the same setpoints.json "campus" key that
        # routes/campus.py owns.
        raise HTTPException(status_code=400, detail="Campus uses /api/campus/setpoint, not this endpoint")
    auth_service.require_farm_access(user, body.farm)

    url = f"{config.NODE_RED_URL}/api/setpoint"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=body.model_dump())
            r.raise_for_status()
            result = r.json()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Node-RED unreachable at {config.NODE_RED_URL} — check NODE_RED_URL in .env",
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Node-RED did not respond within 10 s")
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Node-RED returned HTTP {e.response.status_code}",
        )

    setpoint_service.save(body.farm, body.relay, body.low, body.high)
    return result
