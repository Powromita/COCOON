"""
simulation.py - Multi-zone simulation request, timeseries point, summary, and result contracts.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal
from pydantic import Field, field_validator, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, SCHEMA_VERSION


class SimulationEngineMode(str, Enum):
    """Explicit HVAC and thermal control solver modes mandated by PRD Section 10.12."""
    FREE_FLOATING = "free_floating"
    IDEAL_LOAD_CONDITIONED = "ideal_load_conditioned"
    CAPACITY_LIMITED_CONDITIONED = "capacity_limited_conditioned"


class SimulationOutputEngineMode(str, Enum):
    """
    Operational HVAC simulation mode in simulation outputs (PRD Section 22.1).
    Accepts specific solver modes or the broader 'conditioned' label.
    """
    FREE_FLOATING = "free_floating"
    IDEAL_LOAD_CONDITIONED = "ideal_load_conditioned"
    CAPACITY_LIMITED_CONDITIONED = "capacity_limited_conditioned"
    CONDITIONED = "conditioned"


class EngineMetadata(ContractModel):
    """Identification and configuration of the numerical simulation engine in results."""
    name: str = Field(description="Engine name (e.g. 'cocoon_multizone_rc')")
    version: str = Field(description="Engine semantic version (e.g. '1.0.0')")
    mode: SimulationOutputEngineMode = Field(
        description="Operational HVAC simulation mode; accepts specific solver mode or 'conditioned' per PRD §22.1"
    )
    timestep_seconds: int = Field(gt=0, description="Internal integration timestep in seconds (e.g. 900)")


class SimulationRequestEngineMetadata(ContractModel):
    """Identification and configuration of the numerical simulation engine for requests."""
    name: str = Field(description="Engine name (e.g. 'cocoon_multizone_rc')")
    version: str = Field(description="Engine semantic version (e.g. '1.0.0')")
    mode: SimulationEngineMode = Field(
        description="Explicit operational HVAC simulation mode required by PRD Section 10.12"
    )
    timestep_seconds: int = Field(gt=0, description="Internal integration timestep in seconds (e.g. 900)")


class SimulationStatus(str, Enum):
    """Lifecycle status of a thermal simulation run."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RecommendationState(str, Enum):
    """
    Exact recommendation provenance states mandated by PRD Section 22.2.
    Must accurately reflect evidence backing the candidate design.
    """
    SCREENED_BY_ML = "SCREENED_BY_ML"
    VERIFIED_BY_RC = "VERIFIED_BY_RC"
    VALIDATED_BY_ANSYS = "VALIDATED_BY_ANSYS"
    RC_ONLY_ANSYS_NOT_REQUESTED = "RC_ONLY_ANSYS_NOT_REQUESTED"
    RC_ONLY_ANSYS_UNAVAILABLE = "RC_ONLY_ANSYS_UNAVAILABLE"
    REFERENCE_BENCHMARK = "REFERENCE_BENCHMARK"


class ZoneSummary(ContractModel):
    """Aggregated thermal performance metrics for an individual room/zone."""
    zone_id: str = Field(description="Zone ID matching BuildingModel")
    temperature_min_c: float = Field(description="Minimum predicted temperature (°C)")
    temperature_mean_c: float = Field(description="Time-weighted mean temperature (°C)")
    temperature_max_c: float = Field(description="Peak predicted temperature (°C)")
    comfort_hours: float = Field(ge=0.0, description="Cumulative hours within specified comfort envelope")
    peak_heating_kw: float | None = Field(default=None, ge=0.0, description="Peak heating capacity required (kW)")
    unmet_hours: float | None = Field(default=None, ge=0.0, description="Cumulative hours below target setpoint")


class SimulationSummary(ContractModel):
    """Building-level aggregated thermal and energy balance metrics."""
    heating_energy_kwh: float = Field(ge=0.0, description="Total thermal energy required for conditioning (kWh)")
    peak_heating_kw: float = Field(ge=0.0, description="Maximum instantaneous heating demand (kW)")
    occupied_comfort_hours: float = Field(ge=0.0, description="Hours occupied zones remained in thermal comfort")
    unmet_hours: float = Field(ge=0.0, description="Total unmet heating hours across occupied zones")
    energy_residual_max_pct: float = Field(description="Worst-case energy balance residual percentage")
    airlock_benefit_vs_baseline_pct: float | None = Field(
        default=None,
        description="Measured heat retention improvement compared to matched unbuffered baseline (%)"
    )


class TimeSeriesPoint(ContractModel):
    """Timestamped snapshot of zone temperatures and thermal heat flows."""
    timestamp: AwareDatetime = Field(description="Simulation timestep timestamp")
    zone_temperatures_c: dict[str, float] = Field(description="Mean air temperature by zone ID (°C)")
    ambient_temperature_c: float = Field(description="Outdoor ambient temperature (°C)")
    solar_gain_w: dict[str, float] = Field(
        default_factory=dict,
        description="Solar radiant heat gain into each zone (W)"
    )
    heating_power_w: dict[str, float] = Field(
        default_factory=dict,
        description="HVAC heating power injected into each zone (W)"
    )
    energy_residual_w: float = Field(default=0.0, description="Instantaneous energy conservation residual (W)")


class SimulationProvenance(ContractModel):
    """Lineage and reproducibility metadata for a simulation result."""
    weather_snapshot_id: str = Field(description="Weather dataset ID (wx_...)")
    material_version: str = Field(description="Material database version")
    code_commit: str = Field(description="Git commit hash of physics engine")
    created_at: AwareDatetime = Field(description="Run execution timestamp")


class SimulationRequest(ContractModel):
    """Request payload to execute a multi-zone physics simulation."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    request_id: str = Field(description="Unique simulation request ID starting with 'sim_'")
    design_revision_id: str = Field(description="Target design revision ID (rev_...)")
    weather_snapshot_id: str = Field(description="Target weather snapshot ID (wx_...)")
    engine: SimulationRequestEngineMetadata = Field(description="Solver engine settings with explicit solver mode")
    time_window_start: AwareDatetime = Field(description="Simulation start time")
    time_window_end: AwareDatetime = Field(description="Simulation end time")
    initial_temperature_c: float = Field(default=-25.0, description="Uniform initial condition temperature (°C)")
    ground_temperature_c: float | None = Field(default=-10.0, description="Assumed ground contact temperature (°C)")

    @field_validator("request_id")
    @classmethod
    def validate_request_id(cls, v: str) -> str:
        if not v.startswith("sim_"):
            raise ValueError(f"request_id '{v}' must start with 'sim_'")
        return v

    @field_validator("design_revision_id")
    @classmethod
    def validate_revision_id(cls, v: str) -> str:
        if not v.startswith("rev_"):
            raise ValueError(f"design_revision_id '{v}' must start with 'rev_'")
        return v

    @field_validator("weather_snapshot_id")
    @classmethod
    def validate_weather_id(cls, v: str) -> str:
        if not v.startswith("wx_"):
            raise ValueError(f"weather_snapshot_id '{v}' must start with 'wx_'")
        return v

    @model_validator(mode="after")
    def validate_request(self) -> SimulationRequest:
        if self.time_window_end <= self.time_window_start:
            raise ValueError("time_window_end must be strictly after time_window_start")
        return self


class SimulationResult(ContractModel):
    """Complete simulation output contract matching PRD Section 22.1."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    simulation_id: str = Field(description="Simulation identifier starting with 'sim_'")
    design_revision_id: str = Field(description="Design revision evaluated (rev_...)")
    engine: EngineMetadata = Field(description="Solver engine parameters used")
    status: SimulationStatus = Field(description="Execution outcome status")
    summary: SimulationSummary | None = Field(default=None, description="Building-level performance summary")
    zones: list[ZoneSummary] = Field(description="Per-zone thermal metrics (explicit empty array allowed if none)")
    time_series: list[TimeSeriesPoint] | None = Field(default=None, description="Optional detailed hourly timeseries")
    provenance: SimulationProvenance = Field(description="Execution lineage and audit info")
    recommendation_state: RecommendationState | None = Field(
        default=None,
        description="Official recommendation truth state"
    )

    @field_validator("simulation_id")
    @classmethod
    def validate_simulation_id(cls, v: str) -> str:
        if not v.startswith("sim_"):
            raise ValueError(f"simulation_id '{v}' must start with 'sim_'")
        return v

    @field_validator("design_revision_id")
    @classmethod
    def validate_revision_id(cls, v: str) -> str:
        if not v.startswith("rev_"):
            raise ValueError(f"design_revision_id '{v}' must start with 'rev_'")
        return v

    @model_validator(mode="after")
    def validate_result(self) -> SimulationResult:
        if self.status == SimulationStatus.COMPLETED and self.summary is None:
            raise ValueError("Completed simulation must include a valid SimulationSummary")
        return self
