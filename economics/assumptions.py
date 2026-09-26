"""
assumptions.py - Versioned economic assumption sets (PRD Section 13.2).

A LifecycleAssumptionSet is the full M7 parameter set. Every uncertain
numeric input is an Estimate carrying low/expected/high values, so one
frozen file drives all three sensitivity scenarios and each scenario stays
traceable to the exact values it used.

Scenario semantics: the "low" scenario takes every parameter's low value,
"high" every high value. That is a bracket of the *assumptions*, not a
"cheap"/"expensive" outcome ordering - e.g. a low discount rate and a low
fuel price pull the LCC in opposite directions. Direction-aware drivers
are reported separately by sensitivity.parameter_sensitivity().

The M0 contract `cocoon_contracts.EconomicAssumptionSet` holds only a
subset of these fields and a single scenario; `to_m0()` projects one
scenario of this set onto that contract so every EconomicAnalysisResult
references a valid, scenario-specific M0 assumption set ID.
"""

from __future__ import annotations

import hashlib
import json
from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from cocoon_contracts import CostScenario, EconomicAssumptionSet
from cocoon_contracts.common import AwareDatetime

SCENARIOS: tuple[CostScenario, ...] = (CostScenario.LOW, CostScenario.EXPECTED, CostScenario.HIGH)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Estimate(_Strict):
    """A low/expected/high triple. A bare number is accepted as a point estimate."""
    low: float
    expected: float
    high: float

    @model_validator(mode="before")
    @classmethod
    def _point(cls, v):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return {"low": v, "expected": v, "high": v}
        return v

    @model_validator(mode="after")
    def _ordered(self) -> Estimate:
        if not (self.low <= self.expected <= self.high):
            raise ValueError(
                f"estimate must satisfy low <= expected <= high, got "
                f"{self.low} / {self.expected} / {self.high}")
        return self

    def pick(self, scenario: CostScenario) -> float:
        return {CostScenario.LOW: self.low,
                CostScenario.EXPECTED: self.expected,
                CostScenario.HIGH: self.high}[scenario]


def _nonneg(e: Estimate, name: str) -> Estimate:
    if e.low < 0:
        raise ValueError(f"{name} cannot be negative (low={e.low})")
    return e


class CostUnit(str, Enum):
    PER_M3 = "m3"   # per cubic metre of layer volume
    PER_M2 = "m2"   # per square metre of layer area, independent of thickness
    PER_KG = "kg"   # per kilogram of layer mass


class MaterialUnitCost(_Strict):
    unit: CostUnit
    cost_inr: Estimate = Field(description="INR per unit (supply only; labour is separate)")
    transported: bool = Field(
        default=True,
        description="False for site-sourced materials (e.g. local stone/earth): no haulage charged")
    source: str | None = Field(default=None, description="Per-item source when it differs from the set source")

    @field_validator("cost_inr")
    @classmethod
    def _c(cls, v: Estimate) -> Estimate:
        return _nonneg(v, "material cost")


class OpeningCosts(_Strict):
    window_inr_per_m2: Estimate
    external_door_inr_per_unit: Estimate
    internal_door_inr_per_unit: Estimate
    staircase_inr_per_unit: Estimate


class LabourCosts(_Strict):
    construction_inr_per_m2: Estimate = Field(
        description="Fabrication/assembly labour per m2 of constructed (gross, de-duplicated) surface")


class TransportAssumptions(_Strict):
    mode: str = Field(description="e.g. 'road (truck) via Srinagar-Leh highway'")
    distance_km: Estimate
    rate_inr_per_tonne_km: Estimate
    remote_logistics_multiplier: Estimate = Field(
        description=">= 1.0 premium for high passes / remote delivery; also applied to fuel delivery")

    @field_validator("remote_logistics_multiplier")
    @classmethod
    def _m(cls, v: Estimate) -> Estimate:
        if v.low < 1.0:
            raise ValueError("remote_logistics_multiplier must be >= 1.0")
        return v


class HeaterAssumptions(_Strict):
    type: str = Field(description="e.g. 'kerosene space heater'")
    purchase_inr_per_unit: Estimate
    purchase_inr_per_kw: Estimate
    installation_inr_per_unit: Estimate
    unit_mass_kg: Estimate
    efficiency: Estimate = Field(description="Fuel-to-space-heat efficiency (0..1]")
    sizing_margin: Estimate = Field(description="Installed capacity / simulated peak load (>= 1)")
    service_life_years: Estimate
    replacement_cost_fraction: Estimate = Field(
        description="Replacement cost as a fraction of the original installed heater cost")

    @model_validator(mode="after")
    def _ranges(self) -> HeaterAssumptions:
        if self.efficiency.low <= 0 or self.efficiency.high > 1:
            raise ValueError("heater efficiency must lie in (0, 1]")
        if self.sizing_margin.low < 1:
            raise ValueError("heater sizing_margin must be >= 1")
        if self.service_life_years.low <= 0:
            raise ValueError("heater service_life_years must be > 0")
        return self


class FuelAssumptions(_Strict):
    fuel_type: str
    lower_heating_value_kwh_per_litre: Estimate
    lhv_source: str = Field(description="Source of the LHV value (PRD 13.4: must be visible)")
    price_inr_per_litre: Estimate
    delivery_premium_inr_per_litre: Estimate
    real_escalation_pct_per_year: Estimate
    density_kg_per_litre: Estimate = Field(description="For fuel transport mass")

    @model_validator(mode="after")
    def _ranges(self) -> FuelAssumptions:
        if self.lower_heating_value_kwh_per_litre.low <= 0:
            raise ValueError("fuel lower heating value must be > 0")
        if self.price_inr_per_litre.low <= 0:
            raise ValueError("fuel price must be > 0")
        if self.density_kg_per_litre.low <= 0:
            raise ValueError("fuel density must be > 0")
        return self


class MaintenanceAssumptions(_Strict):
    fixed_inr_per_year: Estimate
    fraction_of_capex_per_year: Estimate
    real_escalation_pct_per_year: Estimate


class ReplacementItem(_Strict):
    """An extra scheduled replacement beyond the heater (e.g. door seals, glazing)."""
    name: str
    interval_years: int = Field(gt=0)
    cost_inr: Estimate


class OperationAssumptions(_Strict):
    heating_season_days_per_year: Estimate = Field(
        description="Days/year the simulated conditioned window represents (annualisation)")
    occupied_days_per_year: Estimate
    mission_logistics_inr_per_tonne_fuel: Estimate = Field(
        default_factory=lambda: Estimate(low=0, expected=0, high=0),
        description="Optional downtime/mission logistics value per tonne of fuel delivered")

    @model_validator(mode="after")
    def _ranges(self) -> OperationAssumptions:
        for name in ("heating_season_days_per_year", "occupied_days_per_year"):
            e: Estimate = getattr(self, name)
            if e.low <= 0 or e.high > 366:
                raise ValueError(f"{name} must lie in (0, 366]")
        return self


class LifecycleAssumptionSet(_Strict):
    """Full, frozen M7 economic assumption set (PRD Section 13.2)."""
    id: str = Field(description="Stable set ID starting with 'econ_'")
    aliases: list[str] = Field(default_factory=list,
                               description="Other 'econ_' IDs that resolve to this set (e.g. an M0 requirement's scenario ID)")
    version: str
    name: str
    currency: Literal["INR"] = "INR"
    effective_date: AwareDatetime = Field(description="Date the prices were frozen")
    source: str
    owner: str
    notes: str | None = None
    project_lifetime_years: int = Field(gt=0, le=50)
    lcc_horizons_years: list[int] = Field(default_factory=lambda: [5, 10])
    discount_rate_pct: Estimate = Field(description="Annual real discount rate, %")
    envelope_service_life_years: Estimate
    materials: dict[str, MaterialUnitCost]
    openings: OpeningCosts
    labour: LabourCosts
    transport: TransportAssumptions
    heater: HeaterAssumptions
    fuel: FuelAssumptions
    maintenance: MaintenanceAssumptions
    replacements: list[ReplacementItem] = Field(default_factory=list)
    operation: OperationAssumptions

    @field_validator("id")
    @classmethod
    def _id(cls, v: str) -> str:
        if not v.startswith("econ_"):
            raise ValueError(f"assumption set id '{v}' must start with 'econ_'")
        return v

    @field_validator("aliases")
    @classmethod
    def _aliases(cls, v: list[str]) -> list[str]:
        for a in v:
            if not a.startswith("econ_"):
                raise ValueError(f"alias '{a}' must start with 'econ_'")
        return v

    @model_validator(mode="after")
    def _ranges(self) -> LifecycleAssumptionSet:
        if self.discount_rate_pct.low < 0 or self.discount_rate_pct.high > 100:
            raise ValueError("discount_rate_pct must lie in [0, 100]")
        if self.envelope_service_life_years.low <= 0:
            raise ValueError("envelope_service_life_years must be > 0")
        for mid in self.materials:
            if not mid.startswith("mat_"):
                raise ValueError(f"material cost key '{mid}' must be a material ID (mat_...)")
        return self

    # ------------------------------------------------------------------
    def checksum(self) -> str:
        canon = json.dumps(self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canon.encode("utf-8")).hexdigest()

    def scenario_set_id(self, scenario: CostScenario) -> str:
        return f"{self.id}_{scenario.value}"

    def resolve(self, scenario: CostScenario) -> ResolvedAssumptions:
        p = lambda e: e.pick(scenario)                          # noqa: E731
        return ResolvedAssumptions(
            scenario=scenario,
            set_id=self.id,
            scenario_set_id=self.scenario_set_id(scenario),
            set_version=self.version,
            effective_date=self.effective_date,
            project_lifetime_years=self.project_lifetime_years,
            discount_rate=p(self.discount_rate_pct) / 100.0,
            envelope_service_life_years=p(self.envelope_service_life_years),
            material_costs={k: (v.unit, p(v.cost_inr), v.transported) for k, v in self.materials.items()},
            window_inr_per_m2=p(self.openings.window_inr_per_m2),
            external_door_inr_per_unit=p(self.openings.external_door_inr_per_unit),
            internal_door_inr_per_unit=p(self.openings.internal_door_inr_per_unit),
            staircase_inr_per_unit=p(self.openings.staircase_inr_per_unit),
            labour_inr_per_m2=p(self.labour.construction_inr_per_m2),
            transport_distance_km=p(self.transport.distance_km),
            transport_rate_inr_per_tonne_km=p(self.transport.rate_inr_per_tonne_km),
            remote_logistics_multiplier=p(self.transport.remote_logistics_multiplier),
            heater_purchase_inr_per_unit=p(self.heater.purchase_inr_per_unit),
            heater_purchase_inr_per_kw=p(self.heater.purchase_inr_per_kw),
            heater_installation_inr_per_unit=p(self.heater.installation_inr_per_unit),
            heater_unit_mass_kg=p(self.heater.unit_mass_kg),
            heater_efficiency=p(self.heater.efficiency),
            heater_sizing_margin=p(self.heater.sizing_margin),
            heater_service_life_years=p(self.heater.service_life_years),
            heater_replacement_cost_fraction=p(self.heater.replacement_cost_fraction),
            fuel_lhv_kwh_per_litre=p(self.fuel.lower_heating_value_kwh_per_litre),
            fuel_price_inr_per_litre=p(self.fuel.price_inr_per_litre),
            fuel_delivery_premium_inr_per_litre=p(self.fuel.delivery_premium_inr_per_litre),
            fuel_escalation=p(self.fuel.real_escalation_pct_per_year) / 100.0,
            fuel_density_kg_per_litre=p(self.fuel.density_kg_per_litre),
            maintenance_fixed_inr_per_year=p(self.maintenance.fixed_inr_per_year),
            maintenance_fraction_of_capex=p(self.maintenance.fraction_of_capex_per_year),
            maintenance_escalation=p(self.maintenance.real_escalation_pct_per_year) / 100.0,
            replacements=[(r.name, r.interval_years, p(r.cost_inr)) for r in self.replacements],
            heating_season_days=p(self.operation.heating_season_days_per_year),
            occupied_days_per_year=p(self.operation.occupied_days_per_year),
            mission_logistics_inr_per_tonne_fuel=p(self.operation.mission_logistics_inr_per_tonne_fuel),
        )

    def to_m0(self, scenario: CostScenario) -> EconomicAssumptionSet:
        """Project one scenario onto the M0 EconomicAssumptionSet contract."""
        r = self.resolve(scenario)
        return EconomicAssumptionSet(
            id=r.scenario_set_id,
            version=self.version,
            effective_date=self.effective_date,
            currency="INR",
            project_lifetime_years=self.project_lifetime_years,
            discount_rate_pct=r.discount_rate * 100.0,
            fuel_price_inr_per_litre=r.fuel_price_inr_per_litre,
            fuel_energy_kwh_per_litre=r.fuel_lhv_kwh_per_litre,
            remote_logistics_multiplier=r.remote_logistics_multiplier,
            heater_efficiency=r.heater_efficiency,
            routine_maintenance_inr_per_year=r.maintenance_fixed_inr_per_year,
            material_cost_multipliers={},
            scenario=scenario,
            source=f"{self.source} (M7 set {self.id} v{self.version}, owner: {self.owner})",
        )


class ResolvedAssumptions(_Strict):
    """Flat, single-scenario numbers actually used by the calculators."""
    scenario: CostScenario
    set_id: str
    scenario_set_id: str
    set_version: str
    effective_date: AwareDatetime
    project_lifetime_years: int
    discount_rate: float
    envelope_service_life_years: float
    material_costs: dict[str, tuple[CostUnit, float, bool]]
    window_inr_per_m2: float
    external_door_inr_per_unit: float
    internal_door_inr_per_unit: float
    staircase_inr_per_unit: float
    labour_inr_per_m2: float
    transport_distance_km: float
    transport_rate_inr_per_tonne_km: float
    remote_logistics_multiplier: float
    heater_purchase_inr_per_unit: float
    heater_purchase_inr_per_kw: float
    heater_installation_inr_per_unit: float
    heater_unit_mass_kg: float
    heater_efficiency: float
    heater_sizing_margin: float
    heater_service_life_years: float
    heater_replacement_cost_fraction: float
    fuel_lhv_kwh_per_litre: float
    fuel_price_inr_per_litre: float
    fuel_delivery_premium_inr_per_litre: float
    fuel_escalation: float
    fuel_density_kg_per_litre: float
    maintenance_fixed_inr_per_year: float
    maintenance_fraction_of_capex: float
    maintenance_escalation: float
    replacements: list[tuple[str, int, float]]
    heating_season_days: float
    occupied_days_per_year: float
    mission_logistics_inr_per_tonne_fuel: float


# ----------------------------------------------------------------------
# Storage: one JSON file per (id, version) under a directory, e.g. data/costs/
# ----------------------------------------------------------------------

def load_assumption_set_file(path: Path) -> LifecycleAssumptionSet:
    return LifecycleAssumptionSet.model_validate_json(path.read_text(encoding="utf-8"))


def list_assumption_sets(directory: Path) -> list[LifecycleAssumptionSet]:
    if not directory.is_dir():
        return []
    sets = [load_assumption_set_file(p) for p in sorted(directory.glob("*.json"))]
    seen: set[tuple[str, str]] = set()
    for s in sets:
        if (s.id, s.version) in seen:
            raise ValueError(f"duplicate assumption set {s.id} v{s.version} in {directory}")
        seen.add((s.id, s.version))
    return sets


def _version_key(v: str) -> tuple:
    return tuple(int(x) if x.isdigit() else x for x in v.split("."))


def load_assumption_set(directory: Path, set_id: str, version: str | None = None) -> LifecycleAssumptionSet | None:
    """Exact version when given, otherwise the highest version of that ID."""
    matches = [s for s in list_assumption_sets(directory) if set_id == s.id or set_id in s.aliases]
    if version is not None:
        matches = [s for s in matches if s.version == version]
    if not matches:
        return None
    return max(matches, key=lambda s: _version_key(s.version))
