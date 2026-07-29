"""
Pydantic v2 response models.
These are the single source of truth for the API contract —
the TypeScript types in frontend/src/types/index.ts mirror these exactly.
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


# ── Sensor readings ───────────────────────────────────────────────────────

class FieldReading(BaseModel):
    value:     float
    timestamp: str


class RelayStatus(BaseModel):
    key:         str
    label:       str
    icon:        str
    description: str = ""
    state:       str          # "ON" | "OFF" | "UNKNOWN"
    value:       Optional[float]
    timestamp:   Optional[str]


class Alert(BaseModel):
    type:    str            # "warning" | "danger" | "info"
    field:   str
    message: str


class LatestResponse(BaseModel):
    farm:             str
    timestamp:        str
    is_online:        bool           # False when newest data is older than DATA_STALE_MINUTES
    data_age_minutes: Optional[float]
    last_seen:        Optional[str]
    readings:         dict[str, FieldReading]
    relays:           list[RelayStatus]
    alerts:           list[Alert]


# ── History / time-series ─────────────────────────────────────────────────

class TimePoint(BaseModel):
    time:  str
    value: float


class HistoryResponse(BaseModel):
    farm:        str
    range:       str
    aggregation: str
    series:      dict[str, list[TimePoint]]


# ── Spray analysis ────────────────────────────────────────────────────────

class SprayEvent(BaseModel):
    start_time:       str
    end_time:         str
    duration_minutes: float
    ongoing:          bool
    incomplete:       Optional[bool] = None


class SprayStats(BaseModel):
    spray_events:            list[SprayEvent]
    total_sprays:             int
    total_spray_minutes:      float
    avg_spray_minutes:        float
    total_spray_display:      str
    estimated_water_liters:   Optional[float]   # null when the farm's fogger_spec isn't configured
    data_status:              str   # "fresh" | "stale" | "no_data"
    last_data_time:           Optional[str]


class SprayStatsResponse(BaseModel):
    farm:  str
    stats: SprayStats


# ── Farms ─────────────────────────────────────────────────────────────────

class FarmInfo(BaseModel):
    id:           str
    display_name: str
    location:     str
    measurement:  str


class FarmsResponse(BaseModel):
    farms: list[FarmInfo]


# ── Health ────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status:    str          # "healthy" | "degraded"
    influxdb:  str          # "connected" | "unreachable"
    timestamp: str
