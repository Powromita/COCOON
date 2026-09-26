"""
ranking.py - The four named recommendations and the reasons for them (PRD sections 12.3 and 21.3).

    best_overall      highest weighted score over comfort, energy, cost, mass and reliability
    best_thermal      highest weighted score over comfort and heating (cost and mass are ignored)
    lowest_lcc        smallest lifecycle cost
    lowest_capex      smallest capital cost

Rules
  * Picks come from the Pareto front, and only from designs that meet the user's unmet-hours limit. If none does, all
    front members become eligible and every pick says so: without this rule "cheapest" would trivially be the design
    that fails the comfort requirement.
  * The weighted picks use VISIBLE, EDITABLE weights (RankingSettings). Each pick returns the weights it actually used
    and the objectives it had to drop because some eligible design has no value for them. Scores are min-max over the
    eligible designs (1 = best in this run), so they compare designs within one run, not absolute quality.
  * A pick that needs economics is "unavailable" when there is none. best_overall is still produced, without cost, and says so.
  * Ties break on the design id, so the result is deterministic.

Explanations use ONLY real fields and say where each sentence came from (``Explanation.sources``). A sentence whose data
is missing is left out; nothing is inferred. The M0 simulation result has no heat-loss breakdown by path, so the "largest
heat-loss path" is computed from the design's own U-values and areas (steady state) and is labelled that way.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

from cocoon_contracts.building import BuildingModel, OpeningType, SurfaceBoundaryType, SurfaceType

from optimization.objectives import OBJECTIVES, CandidateEvaluation, ObjectiveResult, normalise
from optimization.pareto import ParetoResult

RHO_AIR = 1.2
CP_AIR = 1005.0

# PLACEHOLDER weights: review with the team. Objectives with no weight here are not used by that pick.
THERMAL_WEIGHTS: Mapping[str, float] = {
    "unmet_hours": 3.0, "cold_degree_hours": 2.0, "overheating_degree_hours": 2.0, "temperature_swing_c": 1.0,
    "heating_energy_kwh": 2.0, "peak_heating_kw": 1.0}
OVERALL_WEIGHTS: Mapping[str, float] = {
    "unmet_hours": 3.0, "cold_degree_hours": 1.0, "overheating_degree_hours": 1.0, "temperature_swing_c": 1.0,
    "heating_energy_kwh": 2.0, "peak_heating_kw": 1.0, "lcc_inr": 3.0, "capex_inr": 1.0, "mass_kg": 1.0, "reliability": 2.0}
PICKS = ("best_overall", "best_thermal", "lowest_lcc", "lowest_capex")

LABELS = {
    "unmet_hours": "unmet comfort hours", "cold_degree_hours": "cold degree-hours", "overheating_degree_hours": "overheating degree-hours",
    "temperature_swing_c": "temperature swing", "heating_energy_kwh": "heating energy", "peak_heating_kw": "peak heating power",
    "capex_inr": "capital cost", "lcc_inr": "lifecycle cost", "mass_kg": "envelope mass", "reliability": "reliability score"}


class RankingError(ValueError):
    code = "RANKING_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


@dataclass(frozen=True)
class RankingSettings:
    thermal_weights: Mapping[str, float] = field(default_factory=lambda: dict(THERMAL_WEIGHTS))
    overall_weights: Mapping[str, float] = field(default_factory=lambda: dict(OVERALL_WEIGHTS))
    require_within_unmet_limit: bool = True

    def __post_init__(self) -> None:
        for label, w in (("thermal_weights", self.thermal_weights), ("overall_weights", self.overall_weights)):
            unknown = [n for n in w if n not in OBJECTIVES or OBJECTIVES[n].role != "objective"]
            if unknown:
                raise RankingError(f"{label} names unknown or info-only objectives {unknown}", "INVALID_SETTINGS")
            if any(v < 0 or not math.isfinite(v) for v in w.values()):
                raise RankingError(f"{label} must be finite and non-negative", "INVALID_SETTINGS")
            if not any(v > 0 for v in w.values()):
                raise RankingError(f"{label} needs at least one positive weight", "INVALID_SETTINGS")


@dataclass(frozen=True)
class Explanation:
    sentence: str
    sources: tuple[str, ...]                       # the fields the sentence is built from


@dataclass(frozen=True)
class NamedPick:
    name: str
    status: str                                    # "selected" | "unavailable"
    design_id: str | None
    reason: str                                    # why unavailable, or how it was chosen
    value: float | None = None                     # weighted score (0..1), or the cost in INR
    runner_up: str | None = None
    runner_up_value: float | None = None
    gap: float | None = None                       # value difference to the runner-up
    weights: Mapping[str, float] = field(default_factory=dict)         # weights actually used (weighted picks)
    dropped_objectives: tuple[str, ...] = ()       # weighted objectives left out because a design lacked them
    pool_size: int = 0
    flagged: bool = False                          # chosen although it breaks the unmet-hours limit (nothing met it)
    development_only: bool = False
    explanation: tuple[Explanation, ...] = ()


@dataclass(frozen=True)
class RankingResult:
    picks: Mapping[str, NamedPick]
    scores: Mapping[str, Mapping[str, float]]      # eligible design -> {"overall": .., "thermal": ..}
    eligible: tuple[str, ...]
    warnings: tuple[str, ...]

    def to_dict(self) -> dict:
        def pick(p: NamedPick) -> dict:
            return {"name": p.name, "status": p.status, "design_id": p.design_id, "reason": p.reason, "value": p.value,
                    "runner_up": p.runner_up, "runner_up_value": p.runner_up_value, "gap": p.gap, "weights": dict(p.weights),
                    "dropped_objectives": list(p.dropped_objectives), "pool_size": p.pool_size, "flagged": p.flagged,
                    "development_only": p.development_only,
                    "explanation": [{"sentence": e.sentence, "sources": list(e.sources)} for e in p.explanation]}
        return {"picks": {k: pick(v) for k, v in self.picks.items()}, "scores": {k: dict(v) for k, v in self.scores.items()},
                "eligible": list(self.eligible), "warnings": list(self.warnings)}


# ----- what the design itself says about heat loss ------------------------------------------------------------------------
def envelope_conductance(building: BuildingModel, ach: float | None = None) -> dict[str, float] | None:
    """Steady-state conductance (W/K) to the outside by path, from U-values and net areas. None if any U-value is missing.

    walls, roof, floor (to ground or air), windows, doors and, when air changes per hour is known, infiltration.
    """
    opens: dict[str, list] = {}
    for o in building.openings:
        opens.setdefault(o.parent_surface_id, []).append(o)
    out = {"walls": 0.0, "roof": 0.0, "floor": 0.0, "windows": 0.0, "doors": 0.0}
    for s in building.surfaces:
        if s.boundary_type not in (SurfaceBoundaryType.OUTDOORS, SurfaceBoundaryType.GROUND):
            continue
        asm = building.assemblies.get(s.assembly_id)
        if asm is None or asm.u_value_w_m2k is None:
            return None
        here = opens.get(s.id, [])
        key = {SurfaceType.EXTERIOR_WALL: "walls", SurfaceType.ROOF: "roof", SurfaceType.FLOOR: "floor"}.get(s.surface_type)
        if key is None:
            continue
        out[key] += asm.u_value_w_m2k * max(s.area_m2 - sum(o.area_m2 for o in here), 0.0)
        for o in here:
            out["windows" if o.opening_type == OpeningType.WINDOW else "doors"] += o.u_value_w_m2k * o.area_m2
    if ach is not None:
        volume = sum(z.size_m.length_m * z.size_m.width_m * z.size_m.height_m for f in building.floors for z in f.zones)
        out["infiltration"] = RHO_AIR * CP_AIR * ach * volume / 3600.0
    return out


# ----- explanations ---------------------------------------------------------------------------------------------------------
def _num(v: float) -> str:
    return f"{v:,.0f}" if abs(v) >= 1000 else f"{v:.3g}"


def _leadership(name: str, r: ObjectiveResult, pool: Sequence[ObjectiveResult], names: Sequence[str]) -> list[Explanation]:
    out = []
    if len(pool) < 2:
        return out
    for n in names:
        xs = [p.value(n) for p in pool]
        if any(x is None for x in xs) or r.value(n) is None:
            continue
        d = OBJECTIVES[n]
        best = min(xs) if d.direction == "min" else max(xs)
        if not math.isclose(r.value(n), best, rel_tol=1e-9, abs_tol=1e-12):
            continue
        others = sorted((x for x in xs if not math.isclose(x, best, rel_tol=1e-9, abs_tol=1e-12)), reverse=(d.direction == "max"))
        if not others:                                    # everyone ties: nothing to say
            continue
        word = "Lowest" if d.direction == "min" else "Highest"
        out.append(Explanation(f"{word} {LABELS[n]} of the {len(pool)} eligible designs: {_num(best)} {d.unit} "
                               f"(next best {_num(others[0])} {d.unit}).", (f"objectives.{n}",)))
    return out


def _explain(pick: str, r: ObjectiveResult, pool: Sequence[ObjectiveResult], ev: CandidateEvaluation | None,
             extras: Mapping[str, Any] | None, *, flagged: bool) -> tuple[Explanation, ...]:
    out: list[Explanation] = []
    if r.development_only:
        out.append(Explanation("These numbers come from a development stand-in, not from M4; they are not validated results.",
                               ("objectives.development_only",)))
    unmet = r.value("unmet_hours")
    if unmet is not None:
        verdict = "within" if r.within_unmet_limit else "ABOVE"
        out.append(Explanation(f"{_num(unmet)} unmet comfort hours, {verdict} the requirement's limit.",
                               ("objectives.unmet_hours", "objectives.within_unmet_limit")))
    if flagged:
        out.append(Explanation("No eligible design met the unmet-hours limit, so this pick breaks it.", ("objectives.within_unmet_limit",)))

    lead_names = {
        "best_thermal": [n for n in THERMAL_WEIGHTS], "lowest_lcc": ["lcc_inr", "capex_inr"], "lowest_capex": ["capex_inr", "lcc_inr"],
        "best_overall": ["heating_energy_kwh", "peak_heating_kw", "lcc_inr", "capex_inr", "mass_kg", "overheating_degree_hours",
                         "temperature_swing_c", "cold_degree_hours", "reliability"]}[pick]
    out += _leadership(pick, r, pool, lead_names)[:3]

    rel = r.value("reliability")
    if rel is not None and pick in ("best_overall",):
        out.append(Explanation(f"Stays the best choice in {rel:.0%} of the perturbation tests.", ("objectives.reliability",)))

    if ev is not None:
        q = ev.quantities
        if q is not None and pick in ("best_overall", "best_thermal"):
            wins = getattr(getattr(q, "openings", None), "windows_by_orientation", None)
            total = sum(v["area_m2"] for v in wins.values()) if wins else 0.0
            if wins and total > 0:
                top = max(wins, key=lambda k: wins[k]["area_m2"])
                out.append(Explanation(f"{wins[top]['area_m2'] / total:.0%} of the window area ({_num(wins[top]['area_m2'])} of "
                                       f"{_num(total)} m2) faces {top}.", ("quantities.openings.windows_by_orientation",)))
        ach = (extras or {}).get("air_changes_per_hour")
        ua = envelope_conductance(ev.building, ach)
        if ua and pick in ("best_overall", "best_thermal"):
            total_ua = sum(ua.values())
            if total_ua > 0:
                ranked = sorted(ua.items(), key=lambda kv: -kv[1])[:3]
                parts = ", ".join(f"{k} {v / total_ua:.0%}" for k, v in ranked)
                out.append(Explanation(
                    f"Largest steady heat-loss path: {ranked[0][0]} ({parts} of {_num(total_ua)} W/K; computed from the design's "
                    "U-values and areas, not from the simulation).",
                    ("building.assemblies[*].u_value_w_m2k", "building.surfaces[*].area_m2", "building.openings[*]")
                    + (("extras.air_changes_per_hour",) if ach is not None else ())))
        if q is not None and pick in ("best_overall", "lowest_capex", "lowest_lcc"):
            masses = [m.mass_kg for m in getattr(q, "materials", ())]
            if masses and all(m is not None for m in masses):
                out.append(Explanation(f"Envelope mass {sum(masses) / 1000:.1f} t.", ("quantities.materials[*].mass_kg",)))
        e = ev.economics
        if e is not None and pick in ("best_overall", "lowest_capex", "lowest_lcc"):
            years = len(e.annual_cash_flows)
            opex = sum(p.total_opex_inr for p in e.annual_cash_flows)
            fuel = sum(p.fuel_cost_inr for p in e.annual_cash_flows)
            share = f" Fuel is {fuel / opex:.0%} of operating cost." if opex > 0 else ""
            out.append(Explanation(
                f"Capital cost {_num(e.capex.total_capex_inr)} INR; lifecycle cost {_num(e.lcc_inr)} INR over {years} years.{share}",
                ("economics.capex.total_capex_inr", "economics.lcc_inr", "economics.annual_cash_flows[*].fuel_cost_inr",
                 "economics.annual_cash_flows[*].total_opex_inr")))
        for res in (ev.capacity_limited, ev.ideal_load):
            benefit = getattr(getattr(res, "summary", None), "airlock_benefit_vs_baseline_pct", None) if res is not None else None
            if benefit is not None and pick in ("best_overall", "best_thermal"):
                out.append(Explanation(f"The airlock cuts heating by {benefit:.1f}% against a matched baseline without one.",
                                       ("simulation.summary.airlock_benefit_vs_baseline_pct",)))
                break
    return tuple(out)


# ----- the picks ----------------------------------------------------------------------------------------------------------------
def _weighted(pool: Sequence[ObjectiveResult], weights: Mapping[str, float]):
    """(scores by design, weights used, dropped objectives). Objectives some design lacks are dropped, not guessed."""
    wanted = {n: w for n, w in weights.items() if w > 0}
    used = {n: w for n, w in wanted.items() if all(r.value(n) is not None for r in pool)}
    dropped = tuple(n for n in wanted if n not in used)
    if not used:
        return {r.design_id: 0.0 for r in pool}, {}, dropped
    norm = normalise(pool, list(used))
    total = sum(used.values())
    return {r.design_id: sum(used[n] * norm[r.design_id][n] for n in used) / total for r in pool}, used, dropped


def rank_designs(
    results: Sequence[ObjectiveResult],
    pareto: ParetoResult,
    settings: RankingSettings | None = None,
    *,
    evaluations: Mapping[str, CandidateEvaluation] | None = None,
    extras: Mapping[str, Mapping[str, Any]] | None = None,
) -> RankingResult:
    """Choose the four named designs from ``pareto.front``. ``evaluations`` (by design id) and ``extras`` (M2 side fields,
    e.g. air changes per hour) only feed the explanations."""
    settings = settings or RankingSettings()
    by_id = {r.design_id: r for r in results}
    warnings: list[str] = []
    front = [by_id[i] for i in pareto.front if i in by_id]

    def unavailable(name: str, why: str) -> NamedPick:
        return NamedPick(name, "unavailable", None, why)

    if not front:
        return RankingResult({n: unavailable(n, "no comparable design to choose from") for n in PICKS}, {}, (), ("no design is on the Pareto front",))

    pool = [r for r in front if r.within_unmet_limit] if settings.require_within_unmet_limit else list(front)
    flagged = False
    if not pool:
        pool, flagged = list(front), True
        warnings.append("no design on the front meets the unmet-hours limit; every pick breaks it")

    overall, w_overall, dropped_overall = _weighted(pool, settings.overall_weights)
    thermal, w_thermal, dropped_thermal = _weighted(pool, settings.thermal_weights)
    scores = {r.design_id: {"overall": overall[r.design_id], "thermal": thermal[r.design_id]} for r in pool}
    ev_of = (lambda d: evaluations.get(d)) if evaluations else (lambda d: None)
    ex_of = (lambda d: extras.get(d)) if extras else (lambda d: None)

    def build(name: str, chosen: list[tuple[str, float]], used: Mapping[str, float], dropped: tuple[str, ...], how: str) -> NamedPick:
        best_id, best_val = chosen[0]
        run_id, run_val = chosen[1] if len(chosen) > 1 else (None, None)
        r = by_id[best_id]
        return NamedPick(name, "selected", best_id, how, best_val, run_id, run_val,
                         None if run_val is None else abs(best_val - run_val), dict(used), dropped, len(pool), flagged,
                         r.development_only, _explain(name, r, pool, ev_of(best_id), ex_of(best_id), flagged=flagged))

    picks: dict[str, NamedPick] = {}
    for name, table, used, dropped in (("best_overall", overall, w_overall, dropped_overall),
                                       ("best_thermal", thermal, w_thermal, dropped_thermal)):
        order = sorted(pool, key=lambda r: (-table[r.design_id], r.design_id))
        how = f"highest weighted score among {len(pool)} eligible design(s)"
        if dropped:
            how += f"; not counted because some design lacks them: {', '.join(dropped)}"
            warnings.append(f"{name} was computed without {', '.join(dropped)}")
        picks[name] = build(name, [(r.design_id, table[r.design_id]) for r in order], used, dropped, how)

    for name, obj in (("lowest_lcc", "lcc_inr"), ("lowest_capex", "capex_inr")):
        have = [r for r in pool if r.value(obj) is not None]
        if not have:
            picks[name] = unavailable(name, "no economics result for any eligible design (M7 not connected or not run)")
            continue
        if len(have) < len(pool):
            warnings.append(f"{name} ignores {len(pool) - len(have)} design(s) with no {obj}")
        order = sorted(have, key=lambda r: (r.value(obj), -overall[r.design_id], r.design_id))
        picks[name] = build(name, [(r.design_id, r.value(obj)) for r in order], {}, (),
                            f"smallest {LABELS[obj]} among {len(have)} eligible design(s)")
    return RankingResult(picks, scores, tuple(r.design_id for r in pool), tuple(warnings))
