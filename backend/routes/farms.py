"""
/api/farms  — farm registry
"""
from fastapi import APIRouter, Depends, HTTPException

import config
from schemas import SoilProbe, FarmInfo, FarmsResponse
from services import auth_service


def _water_source(info: dict) -> str:
    """Measured beats estimated; the estimate is only there when no meter is."""
    if info.get("water_meter"):
        return "measured"
    if info.get("fogger_spec"):
        return "estimated"
    return "none"


router = APIRouter(
    prefix="/api/farms",
    tags=["farms"],
    dependencies=[Depends(auth_service.require_auth)],
)


@router.get("/", response_model=FarmsResponse)
def _water_temp_probe(info: dict) -> SoilProbe | None:
    """
    The farm's cooling-tank probe, described the same way a soil probe is.

    Same shape on purpose: both are a named reading with a unit and an
    instrument range, and the dashboard can draw either without knowing in
    advance that it exists. A farm without the sensor gets None and no panel,
    rather than an empty chart promising a reading that can never arrive.
    """
    spec = info.get("water_temp_sensor")
    if not spec:
        return None
    return SoilProbe(
        field=spec["field"],
        label=spec.get("label", spec["field"]),
        unit=spec.get("unit", ""),
        min=spec.get("min"),
        max=spec.get("max"),
    )


def list_farms(user: dict = Depends(auth_service.require_auth)) -> FarmsResponse:
    allowed = user.get("farms")
    farms = [
        FarmInfo(
            id=farm_id,
            display_name=info["display_name"],
            location=info["location"],
            measurement=info["measurement"],
            latitude=info.get("latitude"),
            longitude=info.get("longitude"),
            water_source=_water_source(info),
            has_soil_sensors=bool(info.get("soil_sensors")),
            spray_field=config.FARM_SPRAY_FIELD.get(farm_id, "relay3"),
            soil_probes=[
                SoilProbe(
                    field=p["field"],
                    label=p.get("label", p["field"]),
                    unit=p.get("unit", ""),
                    min=p.get("min"),
                    max=p.get("max"),
                    depth_cm=(info.get("soil_sensors") or {}).get("depth_cm"),
                    group=p.get("group"),
                )
                for p in config.soil_probes(farm_id)
            ],
            water_temp=_water_temp_probe(info),
            energy=[
                SoilProbe(
                    field=c["field"], label=c.get("label", c["field"]),
                    unit=c.get("unit", ""), min=c.get("min"), max=c.get("max"),
                )
                for c in config.energy_channels(farm_id)
            ],
        )
        for farm_id, info in config.FARMS.items()
        if allowed is None or farm_id in allowed
    ]
    return FarmsResponse(farms=farms)


@router.get("/{farm_id}", response_model=FarmInfo)
def get_farm(farm_id: str, user: dict = Depends(auth_service.require_auth)) -> FarmInfo:
    info = config.FARMS.get(farm_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Farm '{farm_id}' not found")
    auth_service.require_farm_access(user, farm_id)
    return FarmInfo(
        id=farm_id,
        display_name=info["display_name"],
        location=info["location"],
        measurement=info["measurement"],
        latitude=info.get("latitude"),
        longitude=info.get("longitude"),
    )
