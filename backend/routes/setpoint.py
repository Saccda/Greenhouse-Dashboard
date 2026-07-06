"""
Setpoint proxy — forwards controller setpoint commands from the dashboard to
Node-RED, which publishes them to the ESP32 via MQTT (HiveMQ Cloud).

Payload  :  { farm, relay, low, high }
Node-RED :  POST {NODE_RED_URL}/api/setpoint
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import httpx

import config

router = APIRouter(tags=["setpoint"])


class SetpointRequest(BaseModel):
    farm:  str   = Field(..., description="Farm ID: 'kampot' or 'kep'")
    relay: int   = Field(..., ge=1, le=3, description="Relay number 1–3")
    low:   float = Field(..., description="Low setpoint value (P1/P3/P5)")
    high:  float = Field(..., description="High setpoint value (P2/P4/P6)")


@router.post("/api/setpoint")
async def send_setpoint(body: SetpointRequest):
    """Proxy a setpoint command to Node-RED."""
    if body.farm not in config.FARMS:
        raise HTTPException(status_code=400, detail=f"Unknown farm '{body.farm}'")

    url = f"{config.NODE_RED_URL}/api/setpoint"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=body.model_dump())
            r.raise_for_status()
            return r.json()
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
