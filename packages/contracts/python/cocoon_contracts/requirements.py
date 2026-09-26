"""
requirements.py - Mission requirements, site parameters, and design constraints.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal
from pydantic import Field, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, SCHEMA_VERSION


class ProjectMode(str, Enum):
    """Operational mode for shelter evaluation and generation."""
    NEW_SHELTER = "new_shelter"
    EXISTING_SHELTER = "existing_shelter"
    ENGINEERING_OPTIMIZATION = "engineering_optimization"
    REFERENCE_BENCHMARK = "reference_benchmark"


class SiteSpecification(ContractModel):
    """Geographic, elevation, and temporal boundary parameters for a site."""
    latitude_deg: float = Field(ge=-90.0, le=90.0, description="Latitude in decimal degrees [-90..90]")
    longitude_deg: float = Field(ge=-180.0, le=180.0, description="Longitude in decimal degrees [-180..180]")
    elevation_m: float = Field(ge=-500.0, le=9000.0, description="Site elevation in meters above sea level")
    timezone: str = Field(description="IANA timezone identifier (e.g. 'Asia/Kolkata')")
    weather_source: str = Field(description="Source identifier (e.g. 'NASA_POWER', 'ERA5', 'cached_file')")
    analysis_start: AwareDatetime = Field(description="Start timestamp for simulation window")
    analysis_end: AwareDatetime = Field(description="End timestamp for simulation window")

    @model_validator(mode="after")
    def validate_date_range(self) -> SiteSpecification:
        if self.analysis_end <= self.analysis_start:
            raise ValueError(
                f"analysis_end ({self.analysis_end}) must be strictly after analysis_start ({self.analysis_start})"
            )
        return self


class MissionRequirements(ContractModel):
    """Functional occupancy, room type, and thermal comfort requirements."""
    type: str = Field(description="Mission category (e.g. 'living', 'sleeping', 'living_sleeping', 'medical', 'command')")
    occupants: int = Field(ge=0, description="Nominal occupant count")
    required_rooms: list[str] = Field(description="List of room/zone types that must be accommodated")
    occupancy_schedule_id: str | None = Field(default=None, description="Optional custom occupancy schedule ID")
    target_temperature_c: float = Field(default=15.0, description="Desired indoor target temperature in °C")
    maximum_unmet_hours: int = Field(default=12, ge=0, description="Allowable cumulative hours below target threshold")


class DesignConstraints(ContractModel):
    """Boundary conditions and limits bounding automated layout generation."""
    maximum_footprint_m2: float | None = Field(default=None, gt=0, description="Upper bound on shelter ground footprint in m²")
    maximum_floors: int | None = Field(default=None, ge=1, le=5, description="Maximum allowed floor count (1..5)")
    maximum_capex_inr: float | None = Field(default=None, gt=0, description="Capital expenditure budget limit in INR")
    available_material_ids: list[str] = Field(
        default_factory=list,
        description="Material IDs permitted for envelope construction"
    )
    heater_fuels: list[str] = Field(
        default_factory=list,
        description="Allowed heater fuel types (e.g. 'kerosene', 'electricity', 'solar_thermal')"
    )
    preferred_orientation_deg: float | None = Field(
        default=None,
        ge=0.0,
        le=360.0,
        description="Preferred longitudinal azimuth in degrees [0..360]"
    )
    maximum_mass_kg: float | None = Field(default=None, gt=0, description="Optional logistics weight constraint in kg")
    max_assembly_time_hours: float | None = Field(default=None, gt=0, description="Optional field assembly time target in hours")


class RequirementsContract(ContractModel):
    """Complete requirement payload submitted to generate or evaluate shelter designs."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    project_id: str = Field(description="Project identifier (must start with 'prj_')")
    mode: ProjectMode = Field(description="Operational project mode")
    site: SiteSpecification
    mission: MissionRequirements
    constraints: DesignConstraints
    economic_assumption_set_id: str = Field(description="Reference ID of versioned economic assumption set (econ_...)")

    @model_validator(mode="after")
    def validate_prefixes(self) -> RequirementsContract:
        if not self.project_id.startswith("prj_"):
            raise ValueError(f"project_id '{self.project_id}' must start with 'prj_'")
        return self
