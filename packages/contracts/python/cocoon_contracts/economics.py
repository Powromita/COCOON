"""
economics.py - Lifecycle cost analysis, CAPEX/OPEX structures, and economic assumption sets.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal
from pydantic import Field, field_validator, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, SCHEMA_VERSION


class CostScenario(str, Enum):
    """Sensitivity uncertainty bracket for cost projections."""
    LOW = "low"
    EXPECTED = "expected"
    HIGH = "high"


class EconomicAssumptionSet(ContractModel):
    """Transparent, versioned parameters governing procurement and operational costs."""
    id: str = Field(description="Assumption set ID starting with 'econ_'")
    version: str = Field(description="Semantic version of assumption set")
    effective_date: AwareDatetime = Field(description="Date when prices and rates were frozen")
    currency: Literal["INR"] = Field(default="INR", description="Financial currency unit")
    project_lifetime_years: int = Field(gt=0, le=50, description="Evaluation period in years")
    discount_rate_pct: float = Field(ge=0.0, le=100.0, description="Annual real discount rate percentage")
    fuel_price_inr_per_litre: float = Field(gt=0.0, description="Base heating fuel price in INR/liter")
    fuel_energy_kwh_per_litre: float = Field(default=9.7, gt=0.0, description="Lower heating value in kWh/liter")
    remote_logistics_multiplier: float = Field(
        default=1.0,
        ge=1.0,
        description="Multiplier for remote transport premium (e.g. 1.25 for high Ladakh passes)"
    )
    heater_efficiency: float = Field(default=0.85, gt=0.0, le=1.0, description="Heating appliance conversion efficiency")
    routine_maintenance_inr_per_year: float = Field(default=0.0, ge=0.0, description="Annual upkeep cost in INR")
    material_cost_multipliers: dict[str, float] = Field(
        default_factory=dict,
        description="Optional material specific cost adjustment multipliers"
    )
    scenario: CostScenario = Field(default=CostScenario.EXPECTED, description="Uncertainty bracket")
    source: str = Field(description="Documentation or institutional source citation")

    @model_validator(mode="after")
    def validate_id(self) -> EconomicAssumptionSet:
        if not self.id.startswith("econ_"):
            raise ValueError(f"Assumption set id '{self.id}' must start with 'econ_'")
        return self


class CapexBreakdown(ContractModel):
    """Direct initial acquisition and construction expenditures."""
    materials_inr: float = Field(ge=0.0, description="Envelope and structural materials cost")
    labour_inr: float = Field(ge=0.0, description="On-site fabrication and assembly labor")
    transport_inr: float = Field(ge=0.0, description="Haulage and logistics freight expenditure")
    equipment_inr: float = Field(ge=0.0, description="HVAC, heater, and control hardware purchase")
    total_capex_inr: float = Field(ge=0.0, description="Total capital cost (sum of categories)")


class AnnualOpexPoint(ContractModel):
    """Single-year cash outflow during shelter operational lifetime."""
    year: int = Field(ge=1, description="Operation year index (1..N)")
    fuel_cost_inr: float = Field(ge=0.0, description="Fuel consumption expense in nominal INR")
    maintenance_cost_inr: float = Field(ge=0.0, description="Routine servicing expenditure")
    replacement_cost_inr: float = Field(default=0.0, ge=0.0, description="Scheduled component overhaul/replacement")
    logistics_cost_inr: float = Field(default=0.0, ge=0.0, description="Ongoing fuel delivery and transport surcharge")
    total_opex_inr: float = Field(ge=0.0, description="Total undiscounted operating expenditure for this year")
    discounted_opex_inr: float = Field(ge=0.0, description="Present-value discounted cash outflow")


class EconomicAnalysisResult(ContractModel):
    """Complete lifecycle cost (LCC) evaluation result contract."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    analysis_id: str = Field(description="Economic run identifier starting with 'econ_'")
    design_revision_id: str = Field(description="Target design revision ID (rev_...)")
    assumption_set_id: str = Field(description="Reference ID of assumptions applied (econ_...)")
    scenario: CostScenario = Field(description="Scenario category (low, expected, high)")
    capex: CapexBreakdown = Field(description="Initial investment breakdown")
    annual_cash_flows: list[AnnualOpexPoint] = Field(description="Year-by-year cash flow projections")
    lcc_inr: float = Field(ge=0.0, description="Total discounted Lifecycle Cost (CAPEX + NPV of OPEX)")
    npv_vs_baseline_inr: float | None = Field(default=None, description="Net Present Value savings compared to baseline")
    simple_payback_years: float | None = Field(default=None, ge=0.0, description="Undiscounted payback duration in years")
    discounted_payback_years: float | None = Field(default=None, ge=0.0, description="Discounted payback duration in years")
    break_even_year: int | None = Field(default=None, ge=1, description="Calendar year in which cumulative savings turn positive")
    annual_fuel_litres: float = Field(ge=0.0, description="Predicted annual heating fuel consumption in liters")
    created_at: AwareDatetime = Field(description="Timestamp of economic calculation")

    @field_validator("analysis_id")
    @classmethod
    def validate_analysis_id(cls, v: str) -> str:
        if not v.startswith("econ_"):
            raise ValueError(f"analysis_id '{v}' must start with 'econ_'")
        return v

    @field_validator("design_revision_id")
    @classmethod
    def validate_revision_id(cls, v: str) -> str:
        if not v.startswith("rev_"):
            raise ValueError(f"design_revision_id '{v}' must start with 'rev_'")
        return v

    @field_validator("assumption_set_id")
    @classmethod
    def validate_assumption_set_id(cls, v: str) -> str:
        if not v.startswith("econ_"):
            raise ValueError(f"assumption_set_id '{v}' must start with 'econ_'")
        return v
