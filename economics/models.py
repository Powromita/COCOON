"""
models.py - M7 request and report shapes.

Inputs are M0 contracts only: BuildingModel, SimulationResult,
MaterialSnapshot. Per-scenario outputs are M0 EconomicAnalysisResult
objects; the surrounding EconomicAnalysisReport adds the audit trail the
M0 result has no room for (quantities, line items, residual value, horizon
LCCs, baseline comparison, sensitivity, provenance).

Every monetary block carries a CurrencyContext naming the currency, price
date, assumption set and scenario (PRD 13.7: "all displayed currency
figures identify date and assumption set").
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from cocoon_contracts import (
    BuildingModel,
    EconomicAnalysisResult,
    EconomicAssumptionSet,
    MaterialSnapshot,
    SimulationResult,
)
from economics.assumptions import LifecycleAssumptionSet, ResolvedAssumptions
from economics.capex import CapexLineItem
from economics.heating_fuel import HeatingBasis
from economics.opex import ResidualItem, YearDetail
from economics.quantities import QuantityTakeoff


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ----------------------------------------------------------------------
# Request
# ----------------------------------------------------------------------

class QuantityOverride(_M):
    key: str = Field(description="e.g. 'heater_count', 'window_area_m2', 'material_volume_m3:mat_puf'")
    value: float = Field(ge=0.0)
    reason: str = Field(min_length=5, description="Mandatory justification; kept in the audit log")


class DesignInput(_M):
    building: BuildingModel
    simulation: SimulationResult = Field(description="Conditioned multi-zone RC result for this revision")
    simulated_hours: float | None = Field(
        default=None, gt=0,
        description="Length of the simulated window; required when the result has no time_series")
    simulation_represents_full_year: bool = False
    target_temperature_c: float | None = Field(
        default=None, description="Heating setpoint the simulation used (required with a baseline)")
    quantity_overrides: list[QuantityOverride] = Field(default_factory=list)


class BaselineInput(DesignInput):
    kind: Literal["frozen_revision", "standard_uninsulated_template"] = Field(
        description="PRD 13.6: a standard uninsulated template must be declared as such")
    label: str = Field(min_length=3)


class EconomicsRequest(_M):
    assumption_set_id: str | None = Field(default=None, description="Stored set (see GET /economic-assumption-sets)")
    assumption_set_version: str | None = Field(default=None, description="Exact version; default latest")
    assumption_set: LifecycleAssumptionSet | None = Field(
        default=None, description="Inline set (engineering mode); frozen into the report")
    materials: MaterialSnapshot | None = Field(default=None, description="Default: bundled standard snapshot")
    design: DesignInput
    baseline: BaselineInput | None = None
    occupants: int | None = Field(default=None, ge=0, description="For cost per person-day")

    @model_validator(mode="after")
    def _one_set(self) -> EconomicsRequest:
        if (self.assumption_set_id is None) == (self.assumption_set is None):
            raise ValueError("provide exactly one of 'assumption_set_id' or 'assumption_set'")
        return self


# ----------------------------------------------------------------------
# Report
# ----------------------------------------------------------------------

class CurrencyContext(_M):
    currency: Literal["INR"]
    price_basis: Literal["real"] = "real"
    effective_date: datetime
    assumption_set_id: str
    assumption_set_version: str
    scenario_assumption_set_id: str
    scenario: str
    label: str = Field(description="Ready-to-display caption, e.g. 'INR, real prices of 2026-09-25, ...'")


class ComparabilityCheck(_M):
    check: str
    design_value: str
    baseline_value: str
    passed: bool


class BaselineComparison(_M):
    npv_vs_baseline_inr: float
    incremental_capex_inr: float
    simple_payback_years: float | None
    discounted_payback_years: float | None
    break_even_year: int | None
    payback_status: str
    annual_heating_reduction_kwh: float
    annual_fuel_reduction_litres: float
    annual_fuel_reduction_pct: float | None
    annual_fuel_transport_reduction_kg: float
    annual_logistics_cost_reduction_inr_year1: float
    cumulative_savings_inr: list[float] = Field(description="Undiscounted cumulative OPEX savings, years 1..N")


class ScenarioOutcome(_M):
    scenario: str
    currency_context: CurrencyContext
    resolved_assumptions: ResolvedAssumptions
    heating_basis: HeatingBasis
    result: EconomicAnalysisResult
    capex_line_items: list[CapexLineItem]
    installed_heater_capacity_kw: float
    shipped_mass_kg: float
    year_details: list[YearDetail]
    total_opex_inr: float
    total_discounted_opex_inr: float
    residual_items: list[ResidualItem]
    residual_value_inr: float
    residual_value_pv_inr: float
    lcc_by_horizon_inr: dict[str, float]
    cost_per_occupied_day_inr: float
    cost_per_person_day_inr: float | None
    baseline_heating_basis: HeatingBasis | None = None
    baseline_result: EconomicAnalysisResult | None = None
    baseline_lcc_by_horizon_inr: dict[str, float] | None = None
    comparison: BaselineComparison | None = None


class SensitivityRow(_M):
    parameter: str
    low_value: float
    expected_value: float
    high_value: float
    lcc_at_low_inr: float
    lcc_at_expected_inr: float
    lcc_at_high_inr: float
    npv_at_low_inr: float | None = None
    npv_at_expected_inr: float | None = None
    npv_at_high_inr: float | None = None
    lcc_swing_inr: float


class EvaluatedRevision(_M):
    design_id: str
    revision_id: str
    simulation_id: str
    weather_snapshot_id: str
    quantities: QuantityTakeoff
    kind: str | None = None
    label: str | None = None


class Provenance(_M):
    m7_version: str
    contracts_schema_version: str
    code_commit: str
    input_hashes: dict[str, str]
    material_snapshot_id: str


class EconomicAnalysisReport(_M):
    report_type: Literal["m7_economic_analysis"] = "m7_economic_analysis"
    analysis_id: str
    created_at: datetime
    currency: Literal["INR"]
    assumption_set: LifecycleAssumptionSet
    assumption_set_checksum_sha256: str
    m0_assumption_sets: dict[str, EconomicAssumptionSet]
    occupants: int | None
    design: EvaluatedRevision
    baseline: EvaluatedRevision | None
    comparability: list[ComparabilityCheck]
    scenarios: dict[str, ScenarioOutcome]
    parameter_sensitivity: list[SensitivityRow]
    method_notes: list[str]
    warnings: list[str]
    provenance: Provenance
