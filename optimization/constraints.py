"""
constraints.py - Hard limits from the requirements (PRD section 12.2).

Two moments:

    check_pre_simulation   BEFORE any simulation. A failure here removes the candidate (``report.ok`` is False).
    apply_post_simulation  AFTER the runs. Exceeding the user's maximum_unmet_hours is a FLAG on the report, never a
                           deletion: the design stays visible and comparable.

Every check reads the BuildingModel (and the bill of quantities / economics when it needs them) directly, so it works
for user-defined buildings too, whose M2 report skips the requirement-based checks. When M2's own report is supplied
its verdict is carried in as one more check (``m2_validation``).

A limit that is SET but cannot be checked yet (no quantities, no economics, no heater fuel chosen, no assembly-time
model) is listed as ``skipped`` with the reason. It is never silently passed: ``report.verified`` is False until every
set limit has actually been checked. A limit that is not set passes vacuously.

Checks never raise for a bad candidate; ``ConstraintError`` is only for inputs that do not belong together
(e.g. economics of another design).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Sequence

from cocoon_contracts.building import BuildingModel
from cocoon_contracts.economics import EconomicAnalysisResult
from cocoon_contracts.requirements import RequirementsContract

from optimization.objectives import ObjectiveResult

PRE_CHECKS = (
    "m2_validation", "footprint_within_cap", "floor_count_within_limit", "materials_allowed",
    "mass_within_limit", "capex_within_budget", "heater_fuel_allowed", "assembly_time_within_limit",
)
POST_CHECK = "unmet_hours_within_limit"
TOLERANCE = 1e-6
_DM = 10


class ConstraintError(ValueError):
    code = "CONSTRAINT_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


class _Skip(Exception):
    def __init__(self, reason: str):
        self.reason = reason


# ----- limits ---------------------------------------------------------------------------------------
@dataclass(frozen=True)
class ConstraintLimits:
    """The limits M6 enforces. None / empty means 'not set'."""

    maximum_footprint_m2: float | None = None
    maximum_floors: int | None = None
    maximum_capex_inr: float | None = None
    maximum_mass_kg: float | None = None
    max_assembly_time_hours: float | None = None
    available_material_ids: tuple[str, ...] = ()
    heater_fuels: tuple[str, ...] = ()
    maximum_unmet_hours: float | None = None

    @classmethod
    def from_requirements(cls, requirements: RequirementsContract | dict) -> "ConstraintLimits":
        if not isinstance(requirements, RequirementsContract):
            requirements = RequirementsContract.model_validate(requirements)
        c, m = requirements.constraints, requirements.mission
        return cls(
            maximum_footprint_m2=c.maximum_footprint_m2, maximum_floors=c.maximum_floors,
            maximum_capex_inr=c.maximum_capex_inr, maximum_mass_kg=c.maximum_mass_kg,
            max_assembly_time_hours=c.max_assembly_time_hours, available_material_ids=tuple(c.available_material_ids),
            heater_fuels=tuple(c.heater_fuels), maximum_unmet_hours=float(m.maximum_unmet_hours))


# ----- report ---------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class ConstraintFailure:
    constraint: str
    reason: str
    value: Any = None
    limit: Any = None

    def to_dict(self) -> dict:
        return {"constraint": self.constraint, "reason": self.reason, "value": self.value, "limit": self.limit}


@dataclass(frozen=True)
class ConstraintReport:
    design_id: str
    revision_id: str
    passed: tuple[str, ...]
    failed: tuple[ConstraintFailure, ...]                 # hard failures: the candidate is rejected
    skipped: tuple[tuple[str, str], ...] = ()             # set limits that could not be checked yet, with the reason
    flags: tuple[ConstraintFailure, ...] = ()             # post-simulation warnings; the candidate stays

    @property
    def ok(self) -> bool:
        return not self.failed

    @property
    def verified(self) -> bool:
        """True when every limit that is set has really been checked."""
        return not self.skipped

    @property
    def failed_constraints(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(f.constraint for f in self.failed))

    def to_dict(self) -> dict:
        return {
            "design_id": self.design_id, "revision_id": self.revision_id, "ok": self.ok, "verified": self.verified,
            "passed": list(self.passed), "failed": [f.to_dict() for f in self.failed],
            "skipped": [{"constraint": n, "reason": r} for n, r in self.skipped],
            "flags": [f.to_dict() for f in self.flags]}


# ----- helpers -----------------------------------------------------------------------------------------------
def footprint_m2(building: BuildingModel) -> float:
    """Ground area of the building: the union of every room's plan rectangle (so an overhang counts)."""
    rects = []
    for f in building.floors:
        for z in f.zones:
            x0, y0 = round(z.origin_m.x * _DM), round(z.origin_m.y * _DM)
            rects.append((x0, y0, x0 + round(z.size_m.length_m * _DM), y0 + round(z.size_m.width_m * _DM)))
    xs = sorted({v for r in rects for v in (r[0], r[2])})
    ys = sorted({v for r in rects for v in (r[1], r[3])})
    total = 0
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            if any(r[0] <= xs[i] and xs[i + 1] <= r[2] and r[1] <= ys[j] and ys[j + 1] <= r[3] for r in rects):
                total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
    return round(total / (_DM * _DM), 6)


def _over(value: float, limit: float) -> bool:
    return value > limit + TOLERANCE


# ----- the checks ----------------------------------------------------------------------------------------------
def _m2_validation(ctx: dict) -> list[ConstraintFailure]:
    report = ctx["m2_report"]
    if report is None:
        raise _Skip("no M2 validation report supplied")
    if report.ok:
        return []
    reasons = "; ".join(dict.fromkeys(f.reason for f in report.failed))
    return [ConstraintFailure("m2_validation", f"M2 rejected this design: {reasons}", list(report.failed_checks), None)]


def _footprint(ctx: dict) -> list[ConstraintFailure]:
    limit = ctx["limits"].maximum_footprint_m2
    if limit is None:
        return []
    area = footprint_m2(ctx["building"])
    return [ConstraintFailure("footprint_within_cap", f"footprint is {area} m2, above the {limit} m2 cap", area, limit)] \
        if _over(area, limit) else []


def _floors(ctx: dict) -> list[ConstraintFailure]:
    limit = ctx["limits"].maximum_floors
    if limit is None:
        return []
    n = len({f.level for f in ctx["building"].floors})
    return [ConstraintFailure("floor_count_within_limit", f"{n} floors, above the limit of {limit}", n, limit)] if n > limit else []


def _materials(ctx: dict) -> list[ConstraintFailure]:
    allowed = ctx["limits"].available_material_ids
    if not allowed:
        return []
    used = sorted({l.material_id for a in ctx["building"].assemblies.values() for l in a.layers})
    bad = [m for m in used if m not in allowed]
    return [ConstraintFailure("materials_allowed", f"uses materials the requirements do not allow: {bad}", bad, list(allowed))] if bad else []


def _mass(ctx: dict) -> list[ConstraintFailure]:
    limit = ctx["limits"].maximum_mass_kg
    if limit is None:
        return []
    q = ctx["quantities"]
    if q is None:
        raise _Skip("no bill of quantities")
    masses = [m.mass_kg for m in q.materials]
    if any(m is None for m in masses):
        raise _Skip("material masses are unknown (no material snapshot when quantities were made)")
    total = round(float(sum(masses)), 1)
    return [ConstraintFailure("mass_within_limit", f"envelope weighs {total:.0f} kg, above the {limit:.0f} kg limit", total, limit)] \
        if _over(total, limit) else []


def _capex(ctx: dict) -> list[ConstraintFailure]:
    limit = ctx["limits"].maximum_capex_inr
    if limit is None:
        return []
    econ = ctx["economics"]
    if econ is None:
        raise _Skip("no economics result (M7 not connected or not run)")
    capex = econ.capex.total_capex_inr
    return [ConstraintFailure("capex_within_budget", f"capex is {capex:.0f} INR, above the {limit:.0f} INR budget", capex, limit)] \
        if _over(capex, limit) else []


def _fuel(ctx: dict) -> list[ConstraintFailure]:
    allowed = ctx["limits"].heater_fuels
    if not allowed:
        return []
    fuel = ctx["heater_fuel"]
    if fuel is None:
        raise _Skip("no heater fuel chosen yet")
    return [] if fuel in allowed else [ConstraintFailure("heater_fuel_allowed", f"heater fuel '{fuel}' is not allowed", fuel, list(allowed))]


def _assembly_time(ctx: dict) -> list[ConstraintFailure]:
    if ctx["limits"].max_assembly_time_hours is None:
        return []
    raise _Skip("there is no assembly-time model yet, so this limit cannot be checked")


_CHECKS = {"m2_validation": _m2_validation, "footprint_within_cap": _footprint, "floor_count_within_limit": _floors,
           "materials_allowed": _materials, "mass_within_limit": _mass, "capex_within_budget": _capex,
           "heater_fuel_allowed": _fuel, "assembly_time_within_limit": _assembly_time}
assert tuple(_CHECKS) == PRE_CHECKS


# ----- public functions --------------------------------------------------------------------------------------------
def check_pre_simulation(
    building: BuildingModel,
    limits: ConstraintLimits,
    *,
    m2_report: Any = None,
    quantities: Any = None,
    economics: EconomicAnalysisResult | None = None,
    heater_fuel: str | None = None,
) -> ConstraintReport:
    """Run every hard check that can run before simulation. Never raises for a bad candidate."""
    if economics is not None and economics.design_revision_id != building.revision_id:
        raise ConstraintError(f"economics is for design {economics.design_revision_id}, not {building.revision_id}",
                              "EVALUATION_MISMATCH")
    ctx = {"building": building, "limits": limits, "m2_report": m2_report, "quantities": quantities,
           "economics": economics, "heater_fuel": heater_fuel}
    passed, failed, skipped = [], [], []
    for name, fn in _CHECKS.items():
        try:
            problems = fn(ctx)
        except _Skip as s:
            skipped.append((name, s.reason))
            continue
        (failed.extend(problems) if problems else passed.append(name))
    return ConstraintReport(building.design_id, building.revision_id, tuple(passed), tuple(failed), tuple(skipped))


def check_candidate(candidate: Any, limits: ConstraintLimits, *, economics: EconomicAnalysisResult | None = None,
                    heater_fuel: str | None = None) -> ConstraintReport:
    """Convenience for an M2 ``Candidate``: uses its building, quantities and validation report."""
    return check_pre_simulation(candidate.building, limits, m2_report=candidate.report, quantities=candidate.quantities,
                                economics=economics, heater_fuel=heater_fuel)


def apply_post_simulation(report: ConstraintReport, objectives: ObjectiveResult, limits: ConstraintLimits) -> ConstraintReport:
    """Add the after-simulation check. Too many unmet hours is a FLAG: the design stays in the comparison."""
    if objectives.revision_id != report.revision_id:
        raise ConstraintError(f"objectives are for {objectives.revision_id}, report is for {report.revision_id}", "EVALUATION_MISMATCH")
    if limits.maximum_unmet_hours is None:
        return replace(report, passed=report.passed + (POST_CHECK,))
    unmet = objectives.value("unmet_hours")
    if unmet is None:
        return replace(report, skipped=report.skipped + ((POST_CHECK, "no capacity-limited run, so unmet hours are unknown"),))
    if _over(unmet, limits.maximum_unmet_hours):
        flag = ConstraintFailure(POST_CHECK, f"{unmet:g} unmet hours, above the {limits.maximum_unmet_hours:g} h limit",
                                 unmet, limits.maximum_unmet_hours)
        return replace(report, flags=report.flags + (flag,))
    return replace(report, passed=report.passed + (POST_CHECK,))


def partition(reports: Sequence[ConstraintReport]) -> tuple[list[ConstraintReport], list[ConstraintReport]]:
    """(kept, rejected) by hard failures only; flags never reject. Order is preserved."""
    return [r for r in reports if r.ok], [r for r in reports if not r.ok]
