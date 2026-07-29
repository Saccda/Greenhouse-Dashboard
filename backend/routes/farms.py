"""
/api/farms  — farm registry
"""
from fastapi import APIRouter, Depends, HTTPException

import config
from schemas import FarmInfo, FarmsResponse
from services import auth_service

router = APIRouter(
    prefix="/api/farms",
    tags=["farms"],
    dependencies=[Depends(auth_service.require_auth)],
)


@router.get("/", response_model=FarmsResponse)
def list_farms(user: dict = Depends(auth_service.require_auth)) -> FarmsResponse:
    allowed = user.get("farms")
    farms = [
        FarmInfo(
            id=farm_id,
            display_name=info["display_name"],
            location=info["location"],
            measurement=info["measurement"],
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
    )
