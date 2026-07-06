"""
/api/farms  — farm registry
"""
from fastapi import APIRouter, HTTPException

import config
from schemas import FarmInfo, FarmsResponse

router = APIRouter(prefix="/api/farms", tags=["farms"])


@router.get("/", response_model=FarmsResponse)
def list_farms() -> FarmsResponse:
    farms = [
        FarmInfo(
            id=farm_id,
            display_name=info["display_name"],
            location=info["location"],
            measurement=info["measurement"],
        )
        for farm_id, info in config.FARMS.items()
    ]
    return FarmsResponse(farms=farms)


@router.get("/{farm_id}", response_model=FarmInfo)
def get_farm(farm_id: str) -> FarmInfo:
    info = config.FARMS.get(farm_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Farm '{farm_id}' not found")
    return FarmInfo(
        id=farm_id,
        display_name=info["display_name"],
        location=info["location"],
        measurement=info["measurement"],
    )
