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
from services import pump_guard
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


@router.get("/api/pump-lockout")
def get_pump_lockout(farm: str, user: dict = Depends(auth_service.require_auth)) -> dict:
    """
    Whether this farm's pump is currently locked out, and why.

    Readable by anyone who can see the farm, including read-only accounts: a
    display panel showing a farm that will not spray should be able to say
    why, and withholding the reason from a viewer helps nobody.
    """
    if farm not in config.FARMS:
        raise HTTPException(status_code=400, detail=f"Unknown farm '{farm}'")
    auth_service.require_farm_access(user, farm)
    entry = pump_guard.state(farm)
    return {
        "farm":    farm,
        "locked":  entry is not None,
        "lockout": entry,
        # Strikes spent. 1 or more means the next dry run locks out with no
        # grace period and will not release itself, so the UI has to say so
        # even when nothing is locked right now.
        "strikes": pump_guard.strikes(farm),
    }


@router.post("/api/pump-lockout/release")
def release_pump_lockout(farm: str, user: dict = Depends(auth_service.require_write_access)) -> dict:
    """
    Release a lockout and restore the setpoint that preceded it.

    Requires write access, because it re-arms a pump. It is a plain def rather
    than async so FastAPI runs it in a threadpool — pump_guard talks to
    Node-RED over blocking HTTP, and doing that on the event loop would stall
    every other request for the duration.

    Nothing releases a lockout automatically. The lockout does not refill a
    tank, so releasing one while the tank is still empty simply restarts the
    dry run. That judgement belongs to whoever looked in the tank.
    """
    if farm not in config.FARMS:
        raise HTTPException(status_code=400, detail=f"Unknown farm '{farm}'")
    auth_service.require_farm_access(user, farm)
    try:
        return pump_guard.release(farm, user["username"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Node-RED unreachable at {config.NODE_RED_URL} — the lockout is still in force",
        )
    except Exception as e:
        # The lockout stays latched on any failure. Reporting success over a
        # restore that did not happen would leave someone believing the farm
        # can spray again when it cannot.
        raise HTTPException(status_code=502, detail=f"Could not restore the setpoint: {e}")
