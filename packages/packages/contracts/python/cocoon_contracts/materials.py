"""
materials.py - Thermophysical material properties, cost baselines, and versioned snapshots.
"""

from __future__ import annotations

from typing import Literal
from pydantic import Field, field_validator, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, SCHEMA_VERSION


class MaterialThermalProperties(ContractModel):
    """Thermophysical parameters required for steady-state and transient heat transfer."""
    thermal_conductivity_w_mk: float = Field(gt=0.0, description="Thermal conductivity in W/(m·K)")
    density_kg_m3: float = Field(gt=0.0, description="Material bulk density in kg/m³")
    specific_heat_j_kgk: float = Field(gt=0.0, description="Specific heat capacity in J/(kg·K)")
    emissivity: float | None = Field(default=None, ge=0.0, le=1.0, description="Thermal longwave emissivity [0..1]")
    solar_absorptivity: float | None = Field(default=None, ge=0.0, le=1.0, description="Solar shortwave absorptivity [0..1]")
    cost_inr_per_m2: float | None = Field(default=None, ge=0.0, description="Estimated unit cost per m² area (for standard sheet/panel)")
    cost_inr_per_m3: float | None = Field(default=None, ge=0.0, description="Estimated unit cost per m³ volume")


class MaterialRecord(ContractModel):
    """Standardized material entry with full provenance and validity boundaries."""
    id: str = Field(description="Unique material ID with 'mat_' prefix")
    display_name: str = Field(description="Human-readable material name")
    category: str = Field(description="Material classification (e.g. 'insulation', 'masonry', 'finish', 'glazing')")
    properties: MaterialThermalProperties = Field(description="Thermophysical attributes")
    source_reference: str = Field(description="Bibliographic or laboratory source (e.g. 'ASHRAE Fundamentals', 'DRDO Lab')")
    effective_date: AwareDatetime = Field(description="Date when properties/prices were verified")
    min_temperature_c: float | None = Field(default=None, description="Minimum operational temperature in °C")
    max_temperature_c: float | None = Field(default=None, description="Maximum operational temperature in °C")

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not v.startswith("mat_"):
            raise ValueError(f"Material id '{v}' must start with 'mat_'")
        return v

    @model_validator(mode="after")
    def validate_material(self) -> MaterialRecord:
        if (
            self.min_temperature_c is not None
            and self.max_temperature_c is not None
            and self.max_temperature_c <= self.min_temperature_c
        ):
            raise ValueError("max_temperature_c must be strictly greater than min_temperature_c")
        return self


class MaterialSnapshot(ContractModel):
    """Immutable collection of material records frozen for a specific simulation or analysis."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    snapshot_id: str = Field(description="Snapshot identifier starting with 'mat_'")
    materials: dict[str, MaterialRecord] = Field(description="Dictionary mapping material ID to MaterialRecord")
    checksum_sha256: str = Field(description="SHA-256 integrity hash of materials collection")
    created_at: AwareDatetime = Field(description="Snapshot generation timestamp")

    @field_validator("snapshot_id")
    @classmethod
    def validate_snapshot_id(cls, v: str) -> str:
        if not v.startswith("mat_"):
            raise ValueError(f"snapshot_id '{v}' must start with 'mat_'")
        return v
