"""
objectives.py - The separate numbers M6 compares designs on (PRD section 12.3).

There is NO hidden single score here. Each objective has a name, unit, direction (min / max), a source, a role
and a rule for what happens when it cannot be computed:

    role "objective"  can drive the Pareto set and the ranking
    role "info"       reported, never used to decide
    required          a candidate missing a REQUIRED value is "not comparable" (with reasons), never scored 0;
                      a missing optional value just leaves that objective out for that candidate

A candidate is described by a ``CandidateEvaluation``: its BuildingModel plus the runs M6 made on it
(free-floating, ideal-load, capacity-limited), its bill of quantities and its economics. Anything may be None.

Comfort follows the requirement (PLACEHOLDER settings, all in ObjectiveSettings):
    lower limit  = target_temperature_c                       cold side; the user's maximum_unmet_hours is pass/fail
    upper limit  = target + overheating_margin_c (default 9)  overheating side
    zones        = rooms that have an occupancy schedule ("occupied"); other rooms never count for comfort
    warm-up      = the first ``warmup_hours`` of every time series are ignored (a cold start re-heats the whole
                   building and would dominate peak kW and kWh; see rc_verification)
Degree-hours follow the RC guide (section 6): sum over occupied rooms and timesteps of the departure from the band
times the step length. They are indicators, not a comfort standard.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from statistics import median
from typing import Any, Literal, Mapping, Sequence

from cocoon_contracts.building import BuildingModel
from cocoon_contracts.economics import EconomicAnalysisResult
from cocoon_contracts.requirements import RequirementsContract
from cocoon_contracts.simulation import SimulationResult

from optimization.rc_verification import is_development_only, is_development_only_economics

UNMET_TOLERANCE_K = 0.05          # same tolerance the M0 unmet-hours definition example uses; see ObjectiveSettings


class ObjectiveError(ValueError):
    code = "OBJECTIVE_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


# ----- definitions -----------------------------------------------------------------------------
@dataclass(frozen=True)
class ObjectiveDefinition:
    name: str
    unit: str
    direction: Literal["min", "max"]
    role: Literal["objective", "info"]
    required: bool
    source: str
    description: str


OBJECTIVES: Mapping[str, ObjectiveDefinition] = {d.name: d for d in (
    ObjectiveDefinition("unmet_hours", "h", "min", "objective", True, "capacity-limited run",
                        "hours an occupied room is below the target with the sized heater (pass/fail vs the user's limit)"),
    ObjectiveDefinition("cold_degree_hours", "K*h", "min", "objective", False, "capacity-limited run, time series",
                        "sum over occupied rooms of how far below the target the room is, times the step"),
    ObjectiveDefinition("overheating_degree_hours", "K*h", "min", "objective", False, "capacity-limited run, time series",
                        "sum over occupied rooms of how far above the overheating limit the room is, times the step"),
    ObjectiveDefinition("temperature_swing_c", "K", "min", "objective", False, "capacity-limited run, time series",
                        "largest max-minus-min temperature of any occupied room (stability)"),
    ObjectiveDefinition("heating_energy_kwh", "kWh", "min", "objective", True, "ideal-load run",
                        "heat needed to hold the target (warm-up excluded)"),
    ObjectiveDefinition("peak_heating_kw", "kW", "min", "objective", True, "ideal-load run",
                        "largest total heating power (warm-up excluded)"),
    ObjectiveDefinition("capex_inr", "INR", "min", "objective", False, "economics (M7)", "capital cost"),
    ObjectiveDefinition("lcc_inr", "INR", "min", "objective", False, "economics (M7)", "discounted lifecycle cost"),
    ObjectiveDefinition("mass_kg", "kg", "min", "objective", False, "quantities (M2)", "envelope mass, for logistics"),
    ObjectiveDefinition("reliability", "0..1", "max", "objective", False, "reliability tests (phase 8)",
                        "how often the design stays best when inputs are perturbed"),
    ObjectiveDefinition("occupied_comfort_hours", "h", "max", "info", False, "capacity-limited run",
                        "hours all occupied rooms are at or above the target"),
    ObjectiveDefinition("passive_min_temperature_c", "C", "max", "info", False, "free-floating run, time series",
                        "lowest occupied-room temperature with no heater (needs a warm-up that lets the building settle)"),
    ObjectiveDefinition("passive_median_temperature_c", "C", "max", "info", False, "free-floating run, time series",
                        "median occupied-room temperature with no heater (same caveat)"),
)}


@dataclass(frozen=True)
class ObjectiveSettings:
    target_c: float                          # requirement's target_temperature_c: the cold-side limit
    max_unmet_hours: float                   # requirement's maximum_unmet_hours: pass/fail on the cold side
    overheating_margin_c: float = 9.0        # PLACEHOLDER: overheating limit = target + margin
    warmup_hours: float = 0.0                # PLACEHOLDER: ignored at the start of every time series
    unmet_tolerance_k: float = UNMET_TOLERANCE_K

    def __post_init__(self) -> None:
        if self.max_unmet_hours < 0:
            raise ObjectiveError("max_unmet_hours cannot be negative", "INVALID_SETTINGS")
        if self.warmup_hours < 0:
            raise ObjectiveError("warmup_hours cannot be negative", "INVALID_SETTINGS")
        if self.overheating_margin_c <= 0:
            raise ObjectiveError("overheating_margin_c must be positive", "INVALID_SETTINGS")

    @property
    def hot_limit_c(self) -> float:
        return self.target_c + self.overheating_margin_c

    @classmethod
    def from_requirements(cls, requirements: RequirementsContract | dict, **overrides: Any) -> "ObjectiveSettings":
        if not isinstance(requirements, RequirementsContract):
            requirements = RequirementsContract.model_validate(requirements)
        m = requirements.mission
        return cls(target_c=m.target_temperature_c, max_unmet_hours=float(m.maximum_unmet_hours), **overrides)


# ----- input and output -------------------------------------------------------------------------
@dataclass(frozen=True)
class CandidateEvaluation:
    building: BuildingModel
    quantities: Any = None                            # M2 Quantities (only .materials[*].mass_kg is used)
    free_floating: SimulationResult | None = None
    ideal_load: SimulationResult | None = None
    capacity_limited: SimulationResult | None = None
    economics: EconomicAnalysisResult | None = None
    reliability: float | None = None                  # filled in phase 8

    def __post_init__(self) -> None:
        for label, r in (("free_floating", self.free_floating), ("ideal_load", self.ideal_load),
                         ("capacity_limited", self.capacity_limited), ("economics", self.economics)):
            if r is not None and r.design_revision_id != self.building.revision_id:
                raise ObjectiveError(f"{label} result is for design {r.design_revision_id}, not {self.building.revision_id}",
                                     "EVALUATION_MISMATCH", {"field": label})
        if self.reliability is not None and not 0.0 <= self.reliability <= 1.0:
            raise ObjectiveError("reliability must be within 0..1", "INVALID_RELIABILITY")

    @property
    def occupied_zone_ids(self) -> tuple[str, ...]:
        return tuple(z.id for f in self.building.floors for z in f.zones if z.occupancy_schedule_id)


@dataclass(frozen=True)
class ObjectiveValue:
    name: str
    value: float | None
    reason: str | None = None                          # why value is None
    note: str | None = None


@dataclass(frozen=True)
class ObjectiveResult:
    design_id: str
    revision_id: str
    values: Mapping[str, ObjectiveValue]               # every objective name, in registry order
    comparable: bool
    not_comparable_reasons: tuple[str, ...]
    within_unmet_limit: bool | None                    # the user's cold-side pass/fail; None when unmet hours are unknown
    development_only: bool                             # any input came from a stand-in

    def value(self, name: str) -> float | None:
        return self.values[name].value

    def to_dict(self) -> dict:
        return {
            "design_id": self.design_id, "revision_id": self.revision_id, "comparable": self.comparable,
            "not_comparable_reasons": list(self.not_comparable_reasons), "within_unmet_limit": self.within_unmet_limit,
            "development_only": self.development_only,
            "values": {k: {"value": v.value, "reason": v.reason, "note": v.note, "unit": OBJECTIVES[k].unit,
                           "direction": OBJECTIVES[k].direction, "role": OBJECTIVES[k].role} for k, v in self.values.items()},
        }


# ----- time-series metrics -------------------------------------------------------------------------
def kept_points(result: SimulationResult, warmup_hours: float):
    """Time-series points after the warm-up, and the step length in hours. Empty list if nothing is left."""
    series = result.time_series or []
    dt_h = result.engine.timestep_seconds / 3600.0
    skip = math.ceil(warmup_hours / dt_h - 1e-9) if warmup_hours > 0 else 0
    return series[skip:], dt_h


def _need_series(result: SimulationResult, warmup_hours: float):
    """(points, dt_h) or (None, reason) when the metric cannot be computed honestly."""
    if not result.time_series:
        return None, "the result has no time series"
    points, dt_h = kept_points(result, warmup_hours)
    if not points:
        return None, f"the {warmup_hours:g} h warm-up covers the whole run"
    return (points, dt_h), None


def series_metrics(result: SimulationResult, occupied: Sequence[str], s: ObjectiveSettings) -> dict[str, float]:
    """Everything derivable from a time series, after the warm-up. Raises ObjectiveError if it cannot be done."""
    got, why = _need_series(result, s.warmup_hours)
    if got is None:
        raise ObjectiveError(why, "NO_TIME_SERIES")
    points, dt_h = got
    temps = [[p.zone_temperatures_c[z] for z in occupied] for p in points] if occupied else []
    flat = [t for row in temps for t in row]
    out: dict[str, float] = {
        "heating_energy_kwh": sum(sum(p.heating_power_w.values()) for p in points) * dt_h / 1000.0,
        "peak_heating_kw": max(sum(p.heating_power_w.values()) for p in points) / 1000.0,
    }
    if occupied:
        out.update({
            "cold_degree_hours": sum(max(0.0, s.target_c - t) for t in flat) * dt_h,
            "overheating_degree_hours": sum(max(0.0, t - s.hot_limit_c) for t in flat) * dt_h,
            "temperature_swing_c": max(max(col) - min(col) for col in zip(*temps)),
            "unmet_hours": sum(1 for row in temps if any(t < s.target_c - s.unmet_tolerance_k for t in row)) * dt_h,
            "occupied_comfort_hours": sum(1 for row in temps if all(t >= s.target_c - s.unmet_tolerance_k for t in row)) * dt_h,
            "min_temperature_c": min(flat), "median_temperature_c": float(median(flat)),
        })
    return out


# ----- computing one candidate --------------------------------------------------------------------------
def compute_objectives(ev: CandidateEvaluation, settings: ObjectiveSettings) -> ObjectiveResult:
    occupied = ev.occupied_zone_ids
    vals: dict[str, ObjectiveValue] = {}

    def put(name: str, value: float | None, reason: str | None = None, note: str | None = None) -> None:
        if value is not None and not math.isfinite(value):
            value, reason = None, "the computed value is not finite"
        vals[name] = ObjectiveValue(name, value, None if value is not None else reason, note)

    def from_run(run: SimulationResult | None, label: str, names: Sequence[str], summary_fields: Mapping[str, str | None]):
        """Fill ``names`` from one run: series-derived when needed, else the contract summary."""
        if run is None:
            for n in names:
                put(n, None, f"needs the {label} run")
            return
        needs_series = settings.warmup_hours > 0 or any(summary_fields.get(n) is None for n in names)
        m: dict[str, float] = {}
        why = None
        if needs_series:
            try:
                m = series_metrics(run, occupied, settings)
            except ObjectiveError as exc:
                why = str(exc)
        for n in names:
            field_name = summary_fields.get(n)
            if n in m and (settings.warmup_hours > 0 or field_name is None):
                put(n, m[n], note=f"warm-up {settings.warmup_hours:g} h excluded" if settings.warmup_hours > 0 else None)
            elif field_name is not None and settings.warmup_hours == 0:
                put(n, getattr(run.summary, field_name))
            elif n in ("cold_degree_hours", "overheating_degree_hours", "temperature_swing_c", "unmet_hours", "occupied_comfort_hours") \
                    and not occupied:
                put(n, None, "the building has no occupied room (no occupancy schedule)")
            else:
                put(n, None, why or "cannot be computed from this run")

    from_run(ev.capacity_limited, "capacity-limited",
             ["unmet_hours", "cold_degree_hours", "overheating_degree_hours", "temperature_swing_c", "occupied_comfort_hours"],
             {"unmet_hours": "unmet_hours", "occupied_comfort_hours": "occupied_comfort_hours"})
    from_run(ev.ideal_load, "ideal-load", ["heating_energy_kwh", "peak_heating_kw"],
             {"heating_energy_kwh": "heating_energy_kwh", "peak_heating_kw": "peak_heating_kw"})

    if ev.economics is None:
        for n in ("capex_inr", "lcc_inr"):
            put(n, None, "no economics result (M7 not connected or not run)")
    else:
        put("capex_inr", ev.economics.capex.total_capex_inr)
        put("lcc_inr", ev.economics.lcc_inr)

    masses = [m.mass_kg for m in getattr(ev.quantities, "materials", ())] if ev.quantities is not None else None
    if masses is None:
        put("mass_kg", None, "no bill of quantities")
    elif any(m is None for m in masses):
        put("mass_kg", None, "material masses are unknown (no material snapshot when quantities were made)")
    else:
        put("mass_kg", float(sum(masses)))

    put("reliability", ev.reliability, "not tested yet (reliability tests come later)")

    passive_why = None
    if ev.free_floating is None:
        passive_why = "needs the free-floating run"
    elif not occupied:
        passive_why = "the building has no occupied room (no occupancy schedule)"
    passive: dict[str, float] = {}
    if passive_why is None:
        try:
            passive = series_metrics(ev.free_floating, occupied, settings)
        except ObjectiveError as exc:
            passive_why = str(exc)
    put("passive_min_temperature_c", passive.get("min_temperature_c"), passive_why,
        "only meaningful once the building has settled: use a warm-up")
    put("passive_median_temperature_c", passive.get("median_temperature_c"), passive_why,
        "only meaningful once the building has settled: use a warm-up")

    ordered = {name: vals[name] for name in OBJECTIVES}
    missing_required = [f"{n}: {ordered[n].reason}" for n, d in OBJECTIVES.items() if d.required and ordered[n].value is None]
    unmet = ordered["unmet_hours"].value
    dev_only = any(is_development_only(r) for r in (ev.free_floating, ev.ideal_load, ev.capacity_limited) if r is not None) \
        or (ev.economics is not None and is_development_only_economics(ev.economics))
    return ObjectiveResult(
        design_id=ev.building.design_id, revision_id=ev.building.revision_id, values=ordered,
        comparable=not missing_required, not_comparable_reasons=tuple(missing_required),
        within_unmet_limit=None if unmet is None else unmet <= settings.max_unmet_hours + 1e-9,
        development_only=dev_only)


# ----- comparing a population ------------------------------------------------------------------------------
def split_comparable(results: Sequence[ObjectiveResult]) -> tuple[list[ObjectiveResult], list[ObjectiveResult]]:
    """(comparable, excluded). Excluded candidates keep their reasons; they are never scored."""
    return [r for r in results if r.comparable], [r for r in results if not r.comparable]


def active_objectives(results: Sequence[ObjectiveResult], role: str = "objective") -> list[str]:
    """Objectives every COMPARABLE candidate has a value for, in registry order. These are the ones a Pareto set may use."""
    comparable, _ = split_comparable(results)
    if not comparable:
        return []
    return [n for n, d in OBJECTIVES.items() if d.role == role and all(r.value(n) is not None for r in comparable)]


def normalise(results: Sequence[ObjectiveResult], names: Sequence[str]) -> dict[str, dict[str, float]]:
    """Min-max scores per design: 1.0 = best in this population, 0.0 = worst, direction-aware.

    An objective that is identical for everyone scores 1.0 for everyone (it cannot separate them). The scores depend on
    the population, so they are for comparing designs within one run, not absolute quality.
    """
    for r in results:
        for n in names:
            if n not in OBJECTIVES:
                raise ObjectiveError(f"unknown objective '{n}'", "UNKNOWN_OBJECTIVE")
            if r.value(n) is None:
                raise ObjectiveError(f"design {r.design_id} has no value for '{n}'", "MISSING_OBJECTIVE",
                                     {"design": r.design_id, "objective": n})
    scores: dict[str, dict[str, float]] = {r.design_id: {} for r in results}
    for n in names:
        xs = [r.value(n) for r in results]
        lo, hi = min(xs), max(xs)
        for r in results:
            if hi == lo:
                s = 1.0
            elif OBJECTIVES[n].direction == "min":
                s = (hi - r.value(n)) / (hi - lo)
            else:
                s = (r.value(n) - lo) / (hi - lo)
            scores[r.design_id][n] = s
    return scores
