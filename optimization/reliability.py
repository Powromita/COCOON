"""
reliability.py - How often does a design stay a good choice when the inputs are not exactly as assumed? (PRD section 12.3)

The score written to the ``reliability`` objective (0..1) is the share of PERTURBED cases in which a design is still among
the top ``top_k`` recommendations. The recommendations are found the way ranking.py finds ``best_overall`` (same placeholder
weights; reliability itself is not scored, so the score cannot feed on itself): take the best_overall pick, remove it, pick
again. A design that no longer meets the user's unmet-hours limit with the heater it was sized with in the base run is never
recommended: the heater is bought once, so a colder year is allowed to hurt it. Also reported per design: how often it is
the single best, how often it stays on the Pareto front, how often it stays comfortable, and its worst unmet hours.

What is perturbed (all are data in ``PerturbationSpec``; nothing is hard-wired)
  infiltration      air changes per hour x factor           job field (needs the design's own ACH)
  weather           another weather snapshot id you supply  job field (M6 cannot invent weather)
  conductivity      every opaque assembly's conductivity x factor, applied to the building's own U-value and film resistances
                    (windows and doors keep their U-values)     needs the evaluator to declare it
  internal_gains    occupant and equipment gains x factor   needs the evaluator to declare it (job.extras["perturbation"])
  door_usage        door opening frequency x factor         needs the evaluator to declare it
  fuel_price, discount_rate, cost_scenario
                    another economics assumption set / scenario you supply (M6 cannot edit M7's assumptions)

A kind the evaluator has not declared it honours (``evaluator.supported_perturbations``), or that has no values supplied, is
NOT RUN and is listed in ``ReliabilityResult.not_tested`` with the reason. It is never approximated.

Cases: one-at-a-time (each supported value alone), plus ``monte_carlo_trials`` seeded random combinations. A design whose run
fails or cannot be perturbed in a case counts as "not best" in it (recorded, never retried); a case where every design fails is
dropped. An unavailable evaluator raises. The base (unperturbed) results are reused, not re-run.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field, replace
from typing import Any, Mapping, Sequence

from cocoon_contracts.economics import CostScenario
from cocoon_contracts.simulation import SimulationEngineMode

from optimization.objectives import CandidateEvaluation, ObjectiveResult, ObjectiveSettings, compute_objectives
from optimization.pareto import pareto_front
from optimization.ranking import RankingSettings, rank_designs
from optimization.rc_verification import (
    EconomicsUnavailableError,
    EvaluatorError,
    EvaluatorUnavailableError,
    EvaluationFailedError,
    SimulationJob,
    VerificationSettings,
    VerifiedCandidate,
    analyse_checked,
    is_development_only,
    run_checked,
)

KINDS = ("weather", "infiltration", "conductivity", "internal_gains", "door_usage", "fuel_price", "discount_rate")
ECONOMIC_KINDS = ("fuel_price", "discount_rate", "cost_scenario")
NUMERIC_KINDS = ("infiltration", "conductivity", "internal_gains", "door_usage")
# What every evaluator can do because the M6 job already carries it. Everything else must be declared by the evaluator.
DEFAULT_SUPPORTED = frozenset({"infiltration", "weather"})
BASE_TAG = "base"


class ReliabilityError(ValueError):
    code = "RELIABILITY_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


# ----- the specification (data) -----------------------------------------------------------------------------------------
@dataclass(frozen=True)
class EconomicCase:
    label: str
    kind: str                                     # fuel_price | discount_rate | cost_scenario
    assumption_set_id: str | None = None          # an assumption set that differs from the base in that one thing
    scenario: CostScenario | None = None          # None -> the base scenario

    def __post_init__(self) -> None:
        if not self.label:
            raise ReliabilityError("an economic case needs a label", "INVALID_SPEC")
        if self.kind not in ECONOMIC_KINDS:
            raise ReliabilityError(f"unknown economic kind '{self.kind}'", "INVALID_SPEC", {"kinds": list(ECONOMIC_KINDS)})
        if self.kind in ("fuel_price", "discount_rate") and not self.assumption_set_id:
            raise ReliabilityError(f"'{self.kind}' needs the id of an assumption set that changes it", "INVALID_SPEC")
        if self.kind == "cost_scenario" and self.scenario is None:
            raise ReliabilityError("'cost_scenario' needs a scenario", "INVALID_SPEC")


@dataclass(frozen=True)
class PerturbationSpec:
    """PLACEHOLDER ranges: review with the team. An empty tuple switches that kind off."""

    infiltration_factors: tuple[float, ...] = (0.5, 1.5, 2.0)
    conductivity_factors: tuple[float, ...] = (0.9, 1.1)
    internal_gains_factors: tuple[float, ...] = (0.5, 1.5)
    door_usage_factors: tuple[float, ...] = (0.5, 2.0)
    weather_snapshot_ids: tuple[str, ...] = ()
    economic_cases: tuple[EconomicCase, ...] = ()
    monte_carlo_trials: int = 0
    seed: int = 0
    top_k: int = 3
    max_runs: int | None = None                   # refuse to start if the plan needs more simulator runs than this

    def __post_init__(self) -> None:
        for name in ("infiltration_factors", "conductivity_factors", "internal_gains_factors", "door_usage_factors"):
            if any(not (f > 0) or f != f or f == float("inf") for f in getattr(self, name)):
                raise ReliabilityError(f"{name} must be finite and positive", "INVALID_SPEC", {"field": name})
        if any(not w.startswith("wx_") for w in self.weather_snapshot_ids):
            raise ReliabilityError("weather snapshot ids must start with 'wx_'", "INVALID_SPEC")
        if self.monte_carlo_trials < 0 or self.top_k < 1 or (self.max_runs is not None and self.max_runs < 1):
            raise ReliabilityError("monte_carlo_trials cannot be negative, top_k must be at least 1, max_runs at least 1", "INVALID_SPEC")
        labels = [e.label for e in self.economic_cases]
        if len(labels) != len(set(labels)):
            raise ReliabilityError("economic case labels must be unique", "INVALID_SPEC")

    def factors(self, kind: str) -> tuple[float, ...]:
        return getattr(self, kind + "_factors")


@dataclass(frozen=True)
class Case:
    name: str
    kind: str                                     # one kind for a one-at-a-time case, "combined" for a Monte Carlo trial
    changes: Mapping[str, Any]                    # kind -> factor | snapshot id | EconomicCase

    def to_dict(self) -> dict:
        return {"name": self.name, "kind": self.kind,
                "changes": {k: (v.label if isinstance(v, EconomicCase) else v) for k, v in self.changes.items()}}


@dataclass(frozen=True)
class NotTested:
    kind: str
    reason: str


def evaluator_support(evaluator: Any) -> frozenset[str]:
    declared = getattr(evaluator, "supported_perturbations", None)
    return DEFAULT_SUPPORTED if declared is None else frozenset(declared)


def build_cases(spec: PerturbationSpec, supported: frozenset[str], *, economics_available: bool) -> tuple[list[Case], list[NotTested]]:
    """The cases to run and the kinds that cannot be run (with the reason). Pure and seeded."""
    cases: list[Case] = []
    not_tested: list[NotTested] = []
    usable: dict[str, tuple] = {}

    for kind in NUMERIC_KINDS:
        values = spec.factors(kind)
        if not values:
            not_tested.append(NotTested(kind, "switched off in the specification (no factors given)"))
        elif kind not in supported:
            not_tested.append(NotTested(kind, f"the evaluator does not declare that it honours '{kind}' changes, so it is not faked"))
        else:
            usable[kind] = tuple(values)
            cases += [Case(f"{kind}_x{f:g}", kind, {kind: f}) for f in values]

    if not spec.weather_snapshot_ids:
        not_tested.append(NotTested("weather", "no alternative weather snapshot was supplied (M6 cannot invent weather)"))
    elif "weather" not in supported:
        not_tested.append(NotTested("weather", "the evaluator does not declare that it honours weather changes"))
    else:
        usable["weather"] = tuple(spec.weather_snapshot_ids)
        cases += [Case(f"weather_{w}", "weather", {"weather": w}) for w in spec.weather_snapshot_ids]

    econ_by_kind = {k: [e for e in spec.economic_cases if e.kind == k] for k in ECONOMIC_KINDS}
    for kind in ("fuel_price", "discount_rate"):
        if not econ_by_kind[kind]:
            not_tested.append(NotTested(kind, "no alternative assumption set was supplied (M6 cannot edit M7's assumptions)"))
    if spec.economic_cases and not economics_available:
        for kind in ECONOMIC_KINDS:
            if econ_by_kind[kind]:
                not_tested.append(NotTested(kind, "no economics provider or base assumption set was given"))
    else:
        usable_econ = tuple(spec.economic_cases)
        if usable_econ:
            usable["economics"] = usable_econ
        cases += [Case(f"{e.kind}_{e.label}", e.kind, {"economics": e}) for e in usable_econ]

    rng = random.Random(spec.seed)
    for i in range(1, spec.monte_carlo_trials + 1):
        changes: dict[str, Any] = {}
        for kind in NUMERIC_KINDS:
            if kind in usable:
                lo, hi = min(usable[kind] + (1.0,)), max(usable[kind] + (1.0,))
                changes[kind] = round(rng.uniform(lo, hi), 4)
        if "weather" in usable:
            pick = rng.choice((None,) + usable["weather"])
            if pick is not None:
                changes["weather"] = pick
        if "economics" in usable:
            pick = rng.choice((None,) + usable["economics"])
            if pick is not None:
                changes["economics"] = pick
        cases.append(Case(f"mc_{i:03d}", "combined", changes))
    return cases, not_tested


# ----- applying a case to a design -------------------------------------------------------------------------------------------
class NotApplicable(EvaluationFailedError):
    def __init__(self, message: str):
        super().__init__(message, "PERTURBATION_NOT_APPLICABLE")


def scale_conductivity(building, factor: float):
    """Copy of the building whose opaque assemblies have every layer's conductivity multiplied by ``factor``.

    R_layers = 1/U - R_films, so the new U = 1 / (R_films + R_layers / factor). Films are not conductivity; windows and doors keep
    their own U-values. Needs each assembly's U-value; raises NotApplicable if one is missing or inconsistent.
    """
    scaled = {}
    for aid, asm in building.assemblies.items():
        u = asm.u_value_w_m2k
        if u is None:
            raise NotApplicable(f"assembly '{aid}' has no U-value to scale")
        films = (asm.r_inside_film_m2k_w or 0.0) + (asm.r_outside_film_m2k_w or 0.0)
        r_layers = 1.0 / u - films
        if r_layers <= 0:
            raise NotApplicable(f"assembly '{aid}' has film resistance >= its total resistance, so its layers cannot be rescaled")
        scaled[aid] = asm.model_copy(update={"u_value_w_m2k": 1.0 / (films + r_layers / factor)})
    return building.model_copy(update={"assemblies": scaled})


def _job(candidate: Any, settings: VerificationSettings, case: Case | None, mode: SimulationEngineMode,
         capacity_kw: float | None) -> SimulationJob:
    extras = dict(getattr(candidate, "extras", None) or {})
    building = candidate.building
    ach = extras.get("air_changes_per_hour")
    weather = settings.weather_snapshot_id
    if case is not None:
        perturbation: dict[str, Any] = {"case": case.name}
        for kind, value in case.changes.items():
            if kind == "infiltration":
                if ach is None:
                    raise NotApplicable("the design has no air-changes-per-hour value to scale")
                ach = ach * value
                perturbation["infiltration"] = value
            elif kind == "conductivity":
                building = scale_conductivity(building, value)
                perturbation["conductivity"] = value
            elif kind == "weather":
                weather = value
                perturbation["weather"] = value
            elif kind in ("internal_gains", "door_usage"):
                perturbation[kind] = value
        extras["perturbation"] = perturbation
    return SimulationJob(
        building=building, weather_snapshot_id=weather, mode=mode, window_start=settings.window_start, window_end=settings.window_end,
        setpoint_c=settings.setpoint_c, timestep_seconds=settings.timestep_seconds, initial_temperature_c=settings.start_temperature_c,
        ground_temperature_c=settings.ground_temperature_c, heater_capacity_kw=capacity_kw, air_changes_per_hour=ach, extras=extras)


# ----- results ---------------------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class CaseRecord:
    case: Case
    status: str                                    # "evaluated" | "failed"
    winner: str | None                             # best_overall among this case's eligible designs
    top: tuple[str, ...]                           # the top-k, best first
    eligible: tuple[str, ...]
    failures: Mapping[str, str]                    # design -> "code: message"
    worst_unmet_hours: float | None

    def to_dict(self) -> dict:
        return {**self.case.to_dict(), "status": self.status, "winner": self.winner, "top": list(self.top),
                "eligible": list(self.eligible), "failures": dict(self.failures), "worst_unmet_hours": self.worst_unmet_hours}


@dataclass(frozen=True)
class DesignReliability:
    design_id: str
    reliability: float | None                      # share of evaluated cases in which it stays in the top k (None: no case)
    cases: int
    top_k_rate: float | None
    best_rate: float | None
    front_rate: float | None
    comfort_rate: float | None
    worst_unmet_hours: float | None
    failed_cases: int


@dataclass(frozen=True)
class ReliabilityResult:
    designs: Mapping[str, DesignReliability]
    cases: tuple[CaseRecord, ...]
    not_tested: tuple[NotTested, ...]
    base_winner: str | None
    sensitivity: Mapping[str, Mapping[str, Any]]   # kind -> {"cases", "winner_changed_in", "worst_unmet_hours"}
    top_k: int
    seed: int
    runs: int
    informative: bool                              # False when top_k >= the eligible designs: only eligibility is measured
    development_only: bool
    warnings: tuple[str, ...]

    def reliability_by_design(self) -> dict[str, float]:
        return {d: r.reliability for d, r in self.designs.items() if r.reliability is not None}

    def apply(self, evaluations: Mapping[str, CandidateEvaluation]) -> dict[str, CandidateEvaluation]:
        """Copies of the evaluations with ``reliability`` filled in (designs with no score are left as they were)."""
        scores = self.reliability_by_design()
        return {k: (replace(v, reliability=scores[k]) if k in scores else v) for k, v in evaluations.items()}

    def to_dict(self) -> dict:
        return {
            "designs": {k: v.__dict__.copy() for k, v in self.designs.items()}, "cases": [c.to_dict() for c in self.cases],
            "not_tested": [{"kind": n.kind, "reason": n.reason} for n in self.not_tested], "base_winner": self.base_winner,
            "sensitivity": {k: dict(v) for k, v in self.sensitivity.items()}, "top_k": self.top_k, "seed": self.seed,
            "runs": self.runs, "informative": self.informative, "development_only": self.development_only,
            "warnings": list(self.warnings)}


# ----- the analysis ----------------------------------------------------------------------------------------------------------
def _rank(results: Sequence[ObjectiveResult], ranking: RankingSettings, top_k: int):
    """(winner, top-k, eligible, on-front) for one population.

    The top-k are found by peeling: take the ``best_overall`` pick, remove it, pick again. So the first is exactly what
    ranking.py would recommend for this population, and each next one is what it would recommend if the earlier ones were
    unavailable. A design that breaks the unmet-hours limit is never taken. ``eligible`` = comparable designs within the limit.
    """
    comparable = [r for r in results if r.comparable]
    if not comparable:
        return None, (), (), ()
    eligible = tuple(sorted(r.design_id for r in comparable if r.within_unmet_limit))
    on_front = tuple(pareto_front(comparable).front)
    top: list[str] = []
    remaining = list(comparable)
    while remaining and len(top) < top_k:
        best = rank_designs(remaining, pareto_front(remaining), ranking).picks["best_overall"]
        if best.status != "selected" or best.flagged:
            break
        top.append(best.design_id)
        remaining = [r for r in remaining if r.design_id != best.design_id]
    return (top[0] if top else None), tuple(top), eligible, on_front


def assess_reliability(
    candidates: Sequence[Any],
    verified: Sequence[VerifiedCandidate],
    evaluator: Any,
    settings: VerificationSettings,
    objective_settings: ObjectiveSettings,
    spec: PerturbationSpec | None = None,
    *,
    economics: Any = None,
    assumption_set_id: str | None = None,
    base_scenario: CostScenario = CostScenario.EXPECTED,
    ranking: RankingSettings | None = None,
) -> ReliabilityResult:
    """Score the finalists. ``candidates`` need ``.building`` (and ``.extras``, ``.quantities``); ``verified`` are their
    verify_candidates() results (only "verified" ones take part; each one's sized heater is kept fixed)."""
    spec = spec or PerturbationSpec()
    ranking = ranking or RankingSettings()
    by_id = {c.building.design_id: c for c in candidates}
    finalists = [(by_id[v.design_id], v) for v in verified if v.status == "verified" and v.design_id in by_id]
    warnings: list[str] = []
    skipped = [v.design_id for v in verified if v.status != "verified"]
    if skipped:
        warnings.append(f"{len(skipped)} design(s) were not verified and take no part: {', '.join(skipped)}")
    if not finalists:
        raise ReliabilityError("no verified design to assess", "NO_FINALISTS")
    ids = [c.building.design_id for c, _ in finalists]

    econ_ok = economics is not None and assumption_set_id is not None
    cases, not_tested = build_cases(spec, evaluator_support(evaluator), economics_available=econ_ok)
    runs_needed = 2 * len(finalists) * len(cases)
    if spec.max_runs is not None and runs_needed > spec.max_runs:
        raise ReliabilityError(f"the plan needs {runs_needed} simulator runs, over the limit of {spec.max_runs}", "RUN_BUDGET_EXCEEDED",
                               {"runs_needed": runs_needed, "cases": len(cases), "designs": len(finalists)})
    if not cases:
        warnings.append("no perturbation could be run, so no design has a reliability score")

    def priced(cand, limited, set_id, scenario):
        if not econ_ok:
            return None
        return analyse_checked(economics, cand.building, getattr(cand, "quantities", None), limited, set_id, scenario)

    def objectives(cand, ideal, limited, econ) -> ObjectiveResult:
        ev = CandidateEvaluation(building=cand.building, quantities=getattr(cand, "quantities", None), ideal_load=ideal,
                                 capacity_limited=limited, economics=econ)
        return compute_objectives(ev, objective_settings)

    # the base population, reusing the verified runs
    base_results = [objectives(c, v.evaluation.ideal_load, v.evaluation.capacity_limited,
                               priced(c, v.evaluation.capacity_limited, assumption_set_id, base_scenario)) for c, v in finalists]
    base_winner = _rank(base_results, ranking, spec.top_k)[0]
    development_only = any(r.development_only for r in base_results)

    records: list[CaseRecord] = []
    tallies = {i: dict(top=0, best=0, front=0, comfort=0, failed=0, worst=None) for i in ids}
    used = 0
    for case in cases:
        results, failures = [], {}
        for cand, ver in finalists:
            design = cand.building.design_id
            try:
                economic = case.changes.get("economics")
                ideal = run_checked(evaluator, _job(cand, settings, case, SimulationEngineMode.IDEAL_LOAD_CONDITIONED, None))
                used += 1
                limited = run_checked(evaluator, _job(cand, settings, case, SimulationEngineMode.CAPACITY_LIMITED_CONDITIONED,
                                                      ver.heater.capacity_kw))
                used += 1
                set_id = economic.assumption_set_id if economic and economic.assumption_set_id else assumption_set_id
                scenario = economic.scenario if economic and economic.scenario else base_scenario
                results.append(objectives(cand, ideal, limited, priced(cand, limited, set_id, scenario)))
                development_only = development_only or is_development_only(limited)
            except (EvaluatorUnavailableError, EconomicsUnavailableError):
                raise
            except EvaluatorError as exc:
                failures[design] = f"{exc.code}: {exc}"
        winner, top, eligible, on_front = _rank(results, ranking, spec.top_k)
        unmet = [r.value("unmet_hours") for r in results if r.value("unmet_hours") is not None]
        if not results:
            records.append(CaseRecord(case, "failed", None, (), (), failures, None))
            continue
        records.append(CaseRecord(case, "evaluated", winner, top, eligible, failures, max(unmet) if unmet else None))
        by_result = {r.design_id: r for r in results}
        for design in ids:
            t = tallies[design]
            t["top"] += design in top
            t["best"] += design == winner
            t["front"] += design in on_front
            r = by_result.get(design)
            t["comfort"] += bool(r is not None and r.within_unmet_limit)
            t["failed"] += design in failures
            u = None if r is None else r.value("unmet_hours")
            if u is not None:
                t["worst"] = u if t["worst"] is None else max(t["worst"], u)

    evaluated = [r for r in records if r.status == "evaluated"]
    dropped = len(records) - len(evaluated)
    if dropped:
        warnings.append(f"{dropped} case(s) failed for every design and were dropped: "
                        + ", ".join(r.case.name for r in records if r.status == "failed"))
    n = len(evaluated)
    designs = {}
    for design in ids:
        t = tallies[design]
        rate = (lambda x: x / n) if n else (lambda x: None)
        designs[design] = DesignReliability(design, rate(t["top"]), n, rate(t["top"]), rate(t["best"]), rate(t["front"]),
                                            rate(t["comfort"]), t["worst"], t["failed"])
    informative = bool(evaluated) and spec.top_k < max((len(r.eligible) for r in evaluated), default=0)
    if evaluated and not informative:
        warnings.append(f"top_k={spec.top_k} covers every eligible design, so the score only measures whether a design "
                        "stays within the unmet-hours limit")

    one_at_a_time = {}
    for kind in {c.kind for c in cases if c.kind != "combined"}:
        rows = [r for r in evaluated if r.case.kind == kind]
        if rows:
            unmet = [r.worst_unmet_hours for r in rows if r.worst_unmet_hours is not None]
            one_at_a_time[kind] = {"cases": len(rows), "winner_changed_in": sum(r.winner != base_winner for r in rows),
                                   "worst_unmet_hours": max(unmet) if unmet else None}
    return ReliabilityResult(designs, tuple(records), tuple(not_tested), base_winner, one_at_a_time, spec.top_k, spec.seed, used,
                             informative, development_only, tuple(warnings))
