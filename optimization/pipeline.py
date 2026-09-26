"""
pipeline.py - ``optimize()``: the whole M6 flow in one call (PRD sections 11.7, 12 and 21).

    requirements + materials
      1  M2  generate_designs                        candidate designs
      2  M6  hard constraints (before any run)       rejected designs are excluded, with the reason
      3  M5  screening (or straight to RC)           ML only shortlists; it never supplies a final number
      4  M4  verification: free-floating, ideal-load, heater sizing, capacity-limited (rc_verification)
      5  M7  economics, priced from the capacity-limited run of the SIZED heater; capex limit checked
      6  M6  objectives, unmet-hours flag, Pareto front
      7  M6  named picks (best_overall, best_thermal, lowest_lcc, lowest_capex)
      8  M6  reliability of the contenders (optional), then the picks are re-ranked with it when every eligible design has a score
      9  M8  NOT here: nothing returned by this module is ANSYS-validated

Rules that hold everywhere
  * Every generated design ends in exactly one outcome, with the stage and the reason (``DesignOutcome``).
  * A failure is recorded for that design and never retried. Only an unavailable evaluator raises (nothing can run).
  * Nothing is invented: a missing economics result leaves cost objectives and cost picks unavailable and says so.
  * Stand-in inputs stamp ``development_only`` on the result and on every design that used them.
  * Simulator runs are counted before they start; ``settings.max_runs`` refuses a plan that is too big (500 designs
    with no trained M5 model is 1,500 verification runs).

Economics are priced from each design's capacity-limited run because the M0 economics interface carries a SimulationResult and
no heater plan. That run cannot draw more than the installed heaters, so it has no cold-start burst; the plan itself
(capacity, rooms, fuel) is returned next to the price. M7 should price equipment from the plan (open question, README).

The result is a plain dataclass with ``to_dict()``. It is NOT an M0 contract: there is no M0 schema for M6's output yet
(``to_dict()["schema"]`` says so). ``to_error_envelope()`` maps errors onto the closed M0 ErrorCode list.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Any, Mapping, Sequence

from pydantic import ValidationError

from cocoon_contracts.economics import CostScenario
from cocoon_contracts.errors import ErrorCode, ErrorDetail, ErrorEnvelope
from cocoon_contracts.materials import MaterialSnapshot
from cocoon_contracts.requirements import RequirementsContract

from design_generator import GenerationError, GenerationOptions, RequirementError, UserGeometryError, generate_designs
from design_generator import to_error_envelope as _m2_envelope
from optimization.constraints import (
    ConstraintLimits,
    ConstraintReport,
    apply_post_simulation,
    check_candidate,
    check_pre_simulation,
)
from optimization.objectives import CandidateEvaluation, ObjectiveResult, ObjectiveSettings, compute_objectives
from optimization.pareto import ParetoResult, ParetoSettings, pareto_front
from optimization.ranking import PICKS, NamedPick, RankingResult, RankingSettings, rank_designs
from optimization.rc_verification import (
    EconomicsFailedError,
    EconomicsProvider,
    EconomicsUnavailableError,
    EvaluatorError,
    EvaluatorUnavailableError,
    Evaluator,
    VerificationSettings,
    VerifiedCandidate,
    analyse_checked,
    is_development_only_economics,
    verify_candidates,
)
from optimization.reliability import PerturbationSpec, ReliabilityError, ReliabilityResult, assess_reliability
from optimization.screening import NoModel, Predictor, ScreeningResult, ScreeningSettings, screen_candidates

SCHEMA = "PROPOSED cocoon.m6.optimization_result 0 (not an M0 contract)"

# what happened to a design
EXCLUDED_CONSTRAINTS = "excluded_by_constraints"
DISCARDED_ML = "discarded_by_ml"
FAILED_VERIFICATION = "failed_verification"
FAILED_ECONOMICS = "failed_economics"
EXCLUDED_AFTER_PRICING = "excluded_after_pricing"
NOT_COMPARABLE = "not_comparable"
DOMINATED = "dominated"
ON_FRONT = "on_front"
ON_FRONT_OVER_LIMIT = "on_front_over_unmet_limit"
OUTCOMES = (EXCLUDED_CONSTRAINTS, DISCARDED_ML, FAILED_VERIFICATION, FAILED_ECONOMICS, EXCLUDED_AFTER_PRICING, NOT_COMPARABLE,
            DOMINATED, ON_FRONT, ON_FRONT_OVER_LIMIT)
RUN_MODES_PER_DESIGN = 2                      # ideal-load + capacity-limited (free-floating is a third when included)


# ----- errors ----------------------------------------------------------------------------------------------------------------
class OptimizationError(ValueError):
    code = "OPTIMIZATION_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


_RETRYABLE = (EvaluatorUnavailableError, EconomicsUnavailableError)


def to_error_envelope(exc: BaseException, trace_id: str | None = None) -> ErrorEnvelope:
    """Standard PRD 16.6 envelope for anything ``optimize()`` (or a stage it calls) raises.

    M2 errors keep M2's mapping. The M0 ErrorCode list is closed, so M6's own errors map to VALIDATION_ERROR and the
    specific code travels in ``details["m6_code"]``.
    """
    if isinstance(exc, (RequirementError, GenerationError, UserGeometryError)):
        return _m2_envelope(exc, trace_id)
    raw: dict[str, Any] = dict(getattr(exc, "details", {}) or {})
    if isinstance(exc, ValidationError):
        raw = {"errors": [{"loc": [str(x) for x in e["loc"]], "message": e["msg"], "type": e["type"]} for e in exc.errors()]}
    m6_code = "VALIDATION_ERROR" if isinstance(exc, ValidationError) else (getattr(exc, "code", None) or type(exc).__name__)
    details = json.loads(json.dumps({"m6_code": m6_code, "exception": type(exc).__name__, **raw}, default=str))
    return ErrorEnvelope(error=ErrorDetail(code=ErrorCode.VALIDATION_ERROR, message=str(exc), details=details,
                                           trace_id=trace_id or str(uuid.uuid4()), retryable=isinstance(exc, _RETRYABLE)))


# ----- settings --------------------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class OptimizationSettings:
    """Every tunable of the flow. Values marked PLACEHOLDER are assumptions to review with the team."""

    generation: GenerationOptions | None = None
    screening: ScreeningSettings | None = None
    verification: Mapping[str, Any] = field(default_factory=dict)      # overrides of VerificationSettings (timestep_seconds, warmup_hours, ...)
    objective: Mapping[str, Any] = field(default_factory=dict)         # overrides of ObjectiveSettings (overheating_margin_c, ...)
    pareto: ParetoSettings | None = None
    ranking: RankingSettings = field(default_factory=RankingSettings)
    reliability: PerturbationSpec | None = field(default_factory=PerturbationSpec)      # None switches reliability off
    reliability_max_designs: int = 8              # PLACEHOLDER: contenders assessed when more are eligible
    cost_scenario: CostScenario = CostScenario.EXPECTED
    max_runs: int | None = None                   # refuse a plan that needs more simulator runs than this

    def __post_init__(self) -> None:
        if self.reliability_max_designs < 1:
            raise OptimizationError("reliability_max_designs must be at least 1", "INVALID_SETTINGS")
        if self.max_runs is not None and self.max_runs < 1:
            raise OptimizationError("max_runs must be at least 1", "INVALID_SETTINGS")
        unknown = set(self.verification) - set(VerificationSettings.__dataclass_fields__)
        if unknown:
            raise OptimizationError(f"unknown verification settings {sorted(unknown)}", "INVALID_SETTINGS", {"unknown": sorted(unknown)})
        for forbidden in ("weather_snapshot_id", "setpoint_c", "window_start", "window_end"):
            if forbidden in self.verification:
                raise OptimizationError(f"'{forbidden}' comes from the requirements / the weather_snapshot_id argument", "INVALID_SETTINGS")


# ----- result ----------------------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class DesignOutcome:
    design_id: str
    revision_id: str
    status: str                                   # one of OUTCOMES
    stage: str                                    # the last stage the design reached
    reason: str
    picked_as: tuple[str, ...] = ()               # which named picks chose it
    development_only: bool = False
    recommendation_state: str | None = None       # RecommendationState value; None for stand-ins or when no run happened
    heater_capacity_kw: float | None = None
    heater_fuel: str | None = None
    heated_zone_ids: tuple[str, ...] = ()
    objectives: Mapping[str, float | None] = field(default_factory=dict)
    failed_constraints: tuple[str, ...] = ()
    flags: tuple[str, ...] = ()
    dominated_by: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {"design_id": self.design_id, "revision_id": self.revision_id, "status": self.status, "stage": self.stage,
                "reason": self.reason, "picked_as": list(self.picked_as), "development_only": self.development_only,
                "recommendation_state": self.recommendation_state,
                "heater": None if self.heater_capacity_kw is None else {
                    "capacity_kw": self.heater_capacity_kw, "fuel": self.heater_fuel, "zone_ids": list(self.heated_zone_ids)},
                "objectives": dict(self.objectives), "failed_constraints": list(self.failed_constraints),
                "flags": list(self.flags), "dominated_by": list(self.dominated_by)}


@dataclass(frozen=True)
class GenerationSummary:
    requested: int
    generated: int
    attempts: int
    max_attempts: int
    complete: bool
    rejection_reasons: Mapping[str, int]


@dataclass(frozen=True)
class OptimizationResult:
    project_id: str
    seed: int
    weather_snapshot_id: str
    assumption_set_id: str
    engine: Mapping[str, str | None]
    generation: GenerationSummary
    candidates: tuple[Any, ...]                       # M2 Candidates, so the caller can take a pick's BuildingModel
    constraint_reports: Mapping[str, ConstraintReport]
    screening: ScreeningResult
    verified: Mapping[str, VerifiedCandidate]
    objectives: tuple[ObjectiveResult, ...]
    pareto: ParetoResult | None
    ranking: RankingResult
    reliability: ReliabilityResult | None
    outcomes: tuple[DesignOutcome, ...]
    development_only: bool
    runs: Mapping[str, int]
    assumptions: tuple[str, ...]
    warnings: tuple[str, ...]
    timings_s: Mapping[str, float] = field(default_factory=dict, compare=False)

    def pick(self, name: str) -> NamedPick:
        return self.ranking.picks[name]

    @property
    def recommended(self) -> NamedPick:
        return self.ranking.picks["best_overall"]

    def outcome(self, design_id: str) -> DesignOutcome:
        return next(o for o in self.outcomes if o.design_id == design_id)

    def candidate(self, design_id: str):
        return next(c for c in self.candidates if c.building.design_id == design_id)

    def summary(self) -> dict[str, int]:
        out = {"generated": len(self.candidates)}
        for o in self.outcomes:
            out[o.status] = out.get(o.status, 0) + 1
        return out

    def to_dict(self) -> dict:
        g = self.generation
        return {
            "schema": SCHEMA, "project_id": self.project_id, "seed": self.seed, "weather_snapshot_id": self.weather_snapshot_id,
            "assumption_set_id": self.assumption_set_id, "engine": dict(self.engine), "development_only": self.development_only,
            "validation": "development stand-in: NOT verified by M4 and NOT validated by ANSYS" if self.development_only
            else "verified by the RC engine (M4); not validated by ANSYS (M8 not run)",
            "generation": {"requested": g.requested, "generated": g.generated, "attempts": g.attempts, "max_attempts": g.max_attempts,
                           "complete": g.complete, "rejection_reasons": dict(g.rejection_reasons)},
            "summary": self.summary(), "runs": dict(self.runs), "picks": self.ranking.to_dict(), "outcomes": [o.to_dict() for o in self.outcomes],
            "constraints": {k: v.to_dict() for k, v in self.constraint_reports.items()}, "screening": self.screening.to_dict(),
            "pareto": None if self.pareto is None else self.pareto.to_dict(),
            "reliability": None if self.reliability is None else self.reliability.to_dict(),
            "assumptions": list(self.assumptions), "warnings": list(self.warnings), "timings_s": dict(self.timings_s)}


# ----- helpers ---------------------------------------------------------------------------------------------------------------
def _values(o: ObjectiveResult) -> dict[str, float | None]:
    return {k: v.value for k, v in o.values.items()}


def _select_for_reliability(pool: Sequence[str], scores: Mapping[str, Mapping[str, float]], picks: Mapping[str, NamedPick], cap: int) -> list[str]:
    """The eligible designs whose robustness is worth measuring: everyone if they fit, else the best by score plus every pick."""
    if len(pool) <= cap:
        return sorted(pool)
    by_score = sorted(pool, key=lambda d: (-scores[d]["overall"], d))
    chosen = set(by_score[:cap]) | {p.design_id for p in picks.values() if p.design_id}
    return sorted(chosen)


def optimize(
    requirements: RequirementsContract | dict,
    material_snapshot: MaterialSnapshot | dict,
    evaluator: Evaluator,
    economics: EconomicsProvider | None = None,
    *,
    weather_snapshot_id: str,
    seed: int,
    count: int,
    predictor: Predictor | None = None,
    created_at: datetime | None = None,
    settings: OptimizationSettings | None = None,
) -> OptimizationResult:
    """Generate ``count`` designs for the requirements, verify the promising ones with the RC engine and name the best.

    Raises OptimizationError for a plan that cannot run (bad settings, no design generated, run budget), the M2 errors for
    requirements that cannot be met, and EvaluatorUnavailableError when M4 cannot be reached. Everything that goes wrong for
    one design is recorded on that design instead (``result.outcomes``). Deterministic for a deterministic evaluator.
    """
    settings = settings or OptimizationSettings()
    timings: dict[str, float] = {}
    started = time.perf_counter()

    def lap(name: str, since: float) -> float:
        now = time.perf_counter()
        timings[name] = round(now - since, 6)
        return now

    reqs = requirements if isinstance(requirements, RequirementsContract) else RequirementsContract.model_validate(requirements)
    snapshot = material_snapshot if isinstance(material_snapshot, MaterialSnapshot) else MaterialSnapshot.model_validate(material_snapshot)
    if count < 1:
        raise OptimizationError("count must be at least 1", "INVALID_SETTINGS")
    if not weather_snapshot_id.startswith("wx_"):
        raise OptimizationError("weather_snapshot_id must start with 'wx_'", "INVALID_SETTINGS")

    warnings: list[str] = []
    assumptions: list[str] = []
    limits = ConstraintLimits.from_requirements(reqs)
    vsettings = VerificationSettings.from_requirements(reqs, weather_snapshot_id=weather_snapshot_id, **dict(settings.verification))
    osettings = vsettings.to_objective_settings(float(reqs.mission.maximum_unmet_hours), **dict(settings.objective))
    assumption_set_id = reqs.economic_assumption_set_id

    # 1. M2: candidate designs
    t = time.perf_counter()
    generated = generate_designs(reqs, snapshot, seed=seed, count=count, created_at=created_at, options=settings.generation)
    candidates = generated.candidates
    generation = GenerationSummary(generated.requested, len(candidates), generated.attempts, generated.max_attempts, generated.complete,
                                   dict(generated.reasons))
    if not candidates:
        raise OptimizationError("M2 produced no valid design for these requirements", "NO_CANDIDATES",
                                {"attempts": generated.attempts, "reasons": dict(generated.reasons)})
    if not generated.complete:
        warnings.append(f"only {len(candidates)} of the {generated.requested} requested designs could be generated")
    t = lap("generation", t)

    # 2. hard constraints that need no simulation
    reports = {c.building.design_id: check_candidate(c, limits, heater_fuel=vsettings.heater_fuel) for c in candidates}
    t = lap("constraints", t)

    # 3. screening
    screening = screen_candidates(candidates, predictor or NoModel(), settings.screening, reports=reports)
    warnings += list(screening.warnings)
    to_rc = set(screening.to_rc)
    finalists = [c for c in candidates if c.building.design_id in to_rc]
    t = lap("screening", t)

    # the plan must fit the budget before any run starts
    per_design = RUN_MODES_PER_DESIGN + (1 if vsettings.include_free_floating else 0)
    verification_runs = per_design * len(finalists)
    if settings.max_runs is not None and verification_runs > settings.max_runs:
        raise OptimizationError(
            f"verifying {len(finalists)} designs needs {verification_runs} simulator runs, over the limit of {settings.max_runs}",
            "RUN_BUDGET_EXCEEDED", {"runs_needed": verification_runs, "designs": len(finalists), "max_runs": settings.max_runs})

    # 4. verification (the physics decides; an unavailable evaluator raises)
    verified_list = verify_candidates(finalists, evaluator, vsettings)
    verified = {v.design_id: v for v in verified_list}
    t = lap("verification", t)

    # 5. economics, the capex limit, the unmet-hours flag and the objectives
    econ_used = economics is not None
    if economics is None and any(v.status == "verified" for v in verified_list):
        warnings.append("no economics provider was given: capex and lifecycle cost are unknown, so cost picks are unavailable "
                        "and the capex limit was not checked")
    evaluations: dict[str, CandidateEvaluation] = {}
    econ_failures: dict[str, str] = {}
    cand_by_id = {c.building.design_id: c for c in candidates}
    for v in verified_list:
        if v.status != "verified":
            continue
        cand = cand_by_id[v.design_id]
        ev = replace(v.evaluation, quantities=cand.quantities)
        if econ_used:
            try:
                econ = analyse_checked(economics, cand.building, cand.quantities, ev.capacity_limited, assumption_set_id, settings.cost_scenario)
                ev = replace(ev, economics=econ)
            except EconomicsUnavailableError as exc:
                econ_used = False
                evaluations = {d: replace(e, economics=None) for d, e in evaluations.items()}       # no design has a cost, not just some
                warnings.append(f"the economics provider is unavailable ({exc}): no design has a cost")
            except EconomicsFailedError as exc:
                econ_failures[v.design_id] = f"{exc.code}: {exc}"
                continue
        evaluations[v.design_id] = ev
    if econ_failures and len(econ_failures) == sum(v.status == "verified" for v in verified_list):
        codes = sorted({m.split(":")[0] for m in econ_failures.values()})
        warnings.append(f"economics failed for every verified design ({', '.join(codes)}): check the economics provider and the "
                        f"assumption set '{assumption_set_id}'")
    if econ_used:
        assumptions.append(
            "Economics are priced from each design's capacity-limited run (the sized heater cannot draw more than its capacity, so there is "
            "no cold-start burst); the heater plan is returned next to the price. M7 should price equipment from the plan.")
    assumptions.append(f"Heaters: one size for all heated rooms, {vsettings.heater_margin:g} x the settled peak (first "
                       f"{vsettings.warmup_hours:g} h ignored), rounded up to a standard size. Runs start at the setpoint.")
    t = lap("economics", t)

    final_reports: dict[str, ConstraintReport] = dict(reports)
    results: dict[str, ObjectiveResult] = {}
    for design_id, ev in evaluations.items():
        cand = cand_by_id[design_id]
        report = check_pre_simulation(cand.building, limits, m2_report=cand.report, quantities=cand.quantities, economics=ev.economics,
                                      heater_fuel=vsettings.heater_fuel)
        obj = compute_objectives(ev, osettings)
        results[design_id] = obj
        final_reports[design_id] = apply_post_simulation(report, obj, limits)
    priced_out = {d for d, r in final_reports.items() if d in results and not r.ok}
    objective_list = [r for d, r in results.items() if d not in priced_out]
    t = lap("objectives", t)

    # 6. Pareto front
    pareto = pareto_front(objective_list, settings=settings.pareto, reports=final_reports) if objective_list else None
    t = lap("pareto", t)

    # 7. named picks
    extras = {d: c.extras for d, c in cand_by_id.items()}
    live_evals = {d: e for d, e in evaluations.items() if d not in priced_out}
    ranking = rank_designs(objective_list, pareto if pareto is not None else pareto_front([]), settings.ranking,
                           evaluations=live_evals, extras=extras)

    # 8. reliability of the contenders
    reliability: ReliabilityResult | None = None
    reliability_runs = 0
    if settings.reliability is not None and ranking.eligible:
        chosen = _select_for_reliability(ranking.eligible, ranking.scores, ranking.picks, settings.reliability_max_designs)
        budget = None if settings.max_runs is None else settings.max_runs - verification_runs
        try:
            if budget is not None and budget < 1:
                raise ReliabilityError(f"the run budget of {settings.max_runs} is used up by verification ({verification_runs} runs)",
                                       "RUN_BUDGET_EXCEEDED")
            spec = replace(settings.reliability, seed=settings.reliability.seed or seed,
                           max_runs=budget if budget is not None else settings.reliability.max_runs)
            reliability = assess_reliability(
                [cand_by_id[d] for d in chosen], [verified[d] for d in chosen], evaluator, vsettings, osettings, spec,
                economics=economics if econ_used else None, assumption_set_id=assumption_set_id if econ_used else None,
                base_scenario=settings.cost_scenario, ranking=settings.ranking)
            reliability_runs = reliability.runs
        except ReliabilityError as exc:
            if exc.code != "RUN_BUDGET_EXCEEDED":
                raise
            warnings.append(f"reliability was skipped: {exc}")
        if reliability is not None:
            warnings += list(reliability.warnings)
            scores = reliability.reliability_by_design()
            for d, s in scores.items():
                live_evals[d] = replace(live_evals[d], reliability=s)
                results[d] = compute_objectives(live_evals[d], osettings)
            objective_list = [r for d, r in results.items() if d not in priced_out]
            if all(d in scores for d in ranking.eligible):
                pareto = pareto_front(objective_list, settings=settings.pareto, reports=final_reports)
                ranking = rank_designs(objective_list, pareto, settings.ranking, evaluations=live_evals, extras=extras)
            else:
                warnings.append(f"reliability was measured for {len(scores)} of the {len(ranking.eligible)} eligible designs, so it is "
                                "reported but was not used to rank them")
    t = lap("reliability", t)
    warnings += list(ranking.warnings)

    # 9. one outcome per design
    by_pick: dict[str, list[str]] = {}
    for name in PICKS:
        p = ranking.picks[name]
        if p.design_id:
            by_pick.setdefault(p.design_id, []).append(name)
    outcomes = []
    for cand in candidates:
        d, rev = cand.building.design_id, cand.building.revision_id
        v, rep, rec = verified.get(d), final_reports.get(d), screening.record(d)
        picked = tuple(by_pick.get(d, ()))
        base = dict(design_id=d, revision_id=rev, picked_as=picked)
        failed = tuple(rep.failed_constraints) if rep is not None else ()
        if rec.decision == "exclude":
            outcomes.append(DesignOutcome(status=EXCLUDED_CONSTRAINTS, stage="constraints", reason=rec.reason, failed_constraints=failed, **base))
        elif rec.decision == "discard":
            outcomes.append(DesignOutcome(status=DISCARDED_ML, stage="screening", reason=rec.reason, recommendation_state=(
                rec.recommendation_state.value if rec.recommendation_state else None), development_only=bool(screening.development_only), **base))
        elif v is not None and v.status == "failed":
            outcomes.append(DesignOutcome(status=FAILED_VERIFICATION, stage=v.failure.stage,
                                          reason=f"{v.failure.code}: {v.failure.message}", **base))
        elif d in econ_failures:
            outcomes.append(DesignOutcome(status=FAILED_ECONOMICS, stage="economics", reason=econ_failures[d],
                                          development_only=v.development_only, **base))
        else:
            obj = results[d]
            common = dict(development_only=obj.development_only, heater_capacity_kw=v.heater.capacity_kw, heater_fuel=v.heater.fuel,
                          heated_zone_ids=v.heater.zone_ids, objectives=_values(obj), failed_constraints=failed,
                          flags=tuple(f.reason for f in rep.flags),
                          recommendation_state=v.recommendation_state.value if v.recommendation_state else None)
            if d in priced_out:
                outcomes.append(DesignOutcome(status=EXCLUDED_AFTER_PRICING, stage="economics",
                                              reason="; ".join(f.reason for f in rep.failed), **{**base, **common}))
            elif not obj.comparable:
                outcomes.append(DesignOutcome(status=NOT_COMPARABLE, stage="objectives", reason="; ".join(obj.not_comparable_reasons),
                                              **{**base, **common}))
            elif pareto is not None and d in pareto.front:
                over = obj.within_unmet_limit is False
                outcomes.append(DesignOutcome(
                    status=ON_FRONT_OVER_LIMIT if over else ON_FRONT, stage="ranking",
                    reason="not beaten on every objective, but above the unmet-hours limit, so it cannot be picked" if over
                    else "not beaten on every objective", **{**base, **common}))
            elif pareto is not None and d in pareto.excluded:
                outcomes.append(DesignOutcome(status=NOT_COMPARABLE, stage="pareto", reason=pareto.excluded[d], **{**base, **common}))
            else:
                by = tuple(pareto.dominated_by.get(d, ())) if pareto is not None else ()
                outcomes.append(DesignOutcome(status=DOMINATED, stage="pareto", reason=f"beaten on every objective by {', '.join(by)}" if by
                                              else "beaten on every objective", dominated_by=by, **{**base, **common}))

    dev = (any(o.development_only for o in outcomes) or screening.development_only
           or any(e.economics is not None and is_development_only_economics(e.economics) for e in evaluations.values()))
    if dev:
        warnings.append("development stand-in results: these designs were NOT verified by the real RC engine and must not be presented as validated")
    if ranking.picks["best_overall"].flagged:
        warnings.append("no eligible design meets the unmet-hours limit")
    lap("total", started)
    return OptimizationResult(
        project_id=reqs.project_id, seed=seed, weather_snapshot_id=weather_snapshot_id, assumption_set_id=assumption_set_id,
        engine={"name": getattr(evaluator, "engine_name", None), "version": getattr(evaluator, "engine_version", None)},
        generation=generation, candidates=tuple(candidates), constraint_reports=final_reports, screening=screening, verified=verified,
        objectives=tuple(objective_list), pareto=pareto, ranking=ranking, reliability=reliability, outcomes=tuple(outcomes),
        development_only=dev, runs={"verification": sum(len(v.runs) for v in verified_list), "reliability": reliability_runs},
        assumptions=tuple(assumptions), warnings=tuple(dict.fromkeys(warnings)), timings_s=timings)
