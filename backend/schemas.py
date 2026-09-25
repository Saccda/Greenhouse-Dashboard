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
    controllable: bool = False   # true → UI offers a direct on/off toggle for this channel


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
    # Drives the landing page's weather panel. Optional so a farm added without
    # coordinates degrades to "no weather" rather than silently showing another
    # site's forecast.
    latitude:     Optional[float] = None
    longitude:    Optional[float] = None
    # How this farm's water figure is obtained. "measured" when a flow meter is
    # installed, "estimated" when there is none and the figure is derived from
    # spray runtime and nozzle flow rate, "none" when neither is available.
    #
    # These are alternatives, not a hierarchy to climb. The estimate exists
    # BECAUSE there is no meter; a farm that has one does not want both, and a
    # farm showing "Not configured" where it is actually measured is worse than
    # showing nothing.
    water_source: str = "none"
    # Whether soil probes are fitted. False everywhere today; the dashboard
    # reads this rather than hardcoding "coming soon", so the day probes are
    # wired the panel changes on its own.
    has_soil_sensors: bool = False


class FarmsResponse(BaseModel):
    farms: list[FarmInfo]


# ── Health ────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status:    str          # "healthy" | "degraded"
    influxdb:  str          # "connected" | "unreachable"
    timestamp: str
