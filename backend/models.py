"""
backend/models.py — Pydantic mirrors of the frontend contract
(cocoon-frontend/app/_lib/types.ts). Input models are strict; output is
served largely verbatim from the pipeline's results.json.
"""

from __future__ import annotations

from typing import Literal, Optional, get_args

from pydantic import BaseModel, Field, field_validator

MaterialId = Literal[
    "adobe", "rammed_earth", "straw_clay", "stone_masonry",
    "wood_timber", "concrete", "reinforced_concrete", "puf",
]
GlazingType = Literal["single", "double", "triple"]
Season = Literal["winter", "spring", "summer", "autumn"]
GroundMode = Literal["annual_mean", "manual"]
RatioFactor = Literal[
    "aspect_ratio", "av_ratio", "wwr_percent",
    "ceiling_height_m", "floor_area_m2",
]


# ---- shelter configuration ------------------------------------------------

class Layer(BaseModel):
    material: MaterialId
    thickness_mm: float = Field(gt=0, le=2000)


class Geometry(BaseModel):
    length_m: float = Field(gt=0, le=50)
    width_m: float = Field(gt=0, le=50)
    height_m: float = Field(gt=0, le=20)


class WindowsConfig(BaseModel):
    area_m2: float = Field(ge=0)
    U_W_m2K: float = Field(ge=0)
    SHGC: float = Field(ge=0, le=1)
    glazing_type: GlazingType
    count: Optional[float] = None
    width_m: Optional[float] = None
    height_m: Optional[float] = None


class Contents(BaseModel):
    mass_kg: float = Field(ge=0)
    specific_heat_J_kgK: float = Field(ge=0)


class HeatTransfer(BaseModel):
    h_inside_W_m2K: float = Field(gt=0)
    h_outside_W_m2K: float = Field(gt=0)


class ShelterConfig(BaseModel):
    geometry: Geometry
    walls: list[Layer] = Field(min_length=1)
    roof: list[Layer] = Field(min_length=1)
    floor: list[Layer] = Field(min_length=1)
    windows: WindowsConfig
    contents: Contents
    heat_transfer: HeatTransfer
    air_changes_per_hour: float = Field(ge=0, le=20)
    ground_temperature_mode: GroundMode
    ground_temperature_C: float
    internal_heat_gain_W: float = Field(ge=0)
    initial_temperature_C: float


# ---- analysis window / comfort -----------------------------------------

class AnalysisWindow(BaseModel):
    season: Season = "winter"
    typical_hours: int = Field(ge=24, le=720)
    worst_hours: int = Field(ge=12, le=336)


class ComfortSpec(BaseModel):
    target_C: float
    band_lo_C: float
    band_hi_C: float

    @field_validator("band_hi_C")
    @classmethod
    def _band_order(cls, v: float, info):
        lo = info.data.get("band_lo_C")
        if lo is not None and v <= lo:
            raise ValueError("band_hi_C must exceed band_lo_C")
        return v


# ---- optimizer request ------------------------------------------------

class RatioConstraint(BaseModel):
    factor: RatioFactor
    min: float
    max: float


class OptimizeSpec(BaseModel):
    """The optimize flow: the user pins the box and the openings; the
    pipeline designs everything else (wall/roof/floor materials +
    thicknesses, insulation, glazing type)."""

    designs: int = Field(default=50, ge=5, le=200)
    seed: int = Field(default=0, ge=0)
    trials: int = Field(default=400, ge=10, le=5000)

    # fixed envelope the user provides
    geometry: Geometry
    window_count: int = Field(ge=0, le=20)
    window_width_m: float = Field(default=1.2, gt=0, le=5)
    window_height_m: float = Field(default=1.4, gt=0, le=5)
    door_count: int = Field(default=1, ge=0, le=6)

    # optional scenario -- applied uniformly to every candidate so the
    # ranking is for the user's occupancy / ventilation, not the bare shell
    internal_heat_gain_W: Optional[float] = Field(default=None, ge=0, le=20000)
    air_changes_per_hour: Optional[float] = Field(default=None, ge=0, le=20)
    initial_temperature_C: Optional[float] = Field(default=None, ge=-40, le=40)

    # optional sourcing filter -- defaults to every material
    allowed_materials: list[MaterialId] = Field(
        default_factory=lambda: list(get_args(MaterialId)))

    run_ansys: bool = False
    ansys_hours: int = Field(default=24, ge=8, le=72)
    ansys_designs: int = Field(default=2, ge=1, le=5)


# ---- the POST body --------------------------------------------------

class SingleRunRequest(BaseModel):
    mode: Literal["single"]
    config: ShelterConfig
    window: AnalysisWindow
    comfort: ComfortSpec


class OptimizeRunRequest(BaseModel):
    mode: Literal["optimize"]
    base_config: Optional[dict] = None
    window: AnalysisWindow
    comfort: ComfortSpec
    optimize: OptimizeSpec


RunRequest = SingleRunRequest | OptimizeRunRequest


# ---- responses ----------------------------------------------------

class StartRunResponse(BaseModel):
    run_id: str


class StageStatus(BaseModel):
    stage: str
    phase: Literal["pending", "running", "ok", "failed", "skipped"]
    note: Optional[str] = None


class PipelineStatus(BaseModel):
    run_id: str
    done: bool
    failed: bool
    stages: list[StageStatus]


class MaterialProps(BaseModel):
    id: MaterialId
    display_name: str
    thermal_conductivity: float
    density: float
    specific_heat: float


class GlazingProps(BaseModel):
    id: GlazingType
    U_W_m2K: float
    SHGC: float


class ReferenceData(BaseModel):
    materials: list[MaterialProps]
    glazing: list[GlazingProps]
    ratio_constraints: list[RatioConstraint]
