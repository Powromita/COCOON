"""
rc_verification.py - How M6 talks to M4 (simulation) and M7 (economics).

M6 never imports M4 or M7. It calls two small interfaces:

    Evaluator.simulate(SimulationJob)                      -> SimulationResult   (M0 contract)
    EconomicsProvider.analyse(building, quantities, sim,
                              assumption_set_id, scenario) -> EconomicAnalysisResult

Until the real modules are connected, ``M4Evaluator`` and ``M7EconomicsProvider`` raise EVALUATOR_UNAVAILABLE /
ECONOMICS_UNAVAILABLE, so nothing can quietly run on invented results. Test doubles ("stand-ins") live in
``optimization/tests/standins.py``. The library never imports them; only ``python -m optimization`` loads them, and only when asked
for ``--evaluator standin``. Their results are recognisable:
engine name ``standin_*`` (``is_development_only``), analysis id ``econ_standin_*``.

``run_checked`` / ``analyse_checked`` are the ONLY way later phases (and M5's dataset builder) should call the
interfaces: they refuse results that belong to another design, are not finite, are physically implausible, or
whose energy balance does not close.

Inputs the M0 SimulationRequest cannot carry (open questions for the M4 owner, kept in SimulationJob):
    setpoint_c            target temperature the heater holds        (request has no setpoint)
    heater_capacity_kw    capacity of EACH heated zone's heater      (request has no capacity)
    air_changes_per_hour  infiltration                               (BuildingModel has no ACH field)

The warm-up trap (and how verification avoids it). The M0 request default and the stand-in start every room at -25 C, so a
conditioned run spends its first steps re-heating the whole building; peak kW and kWh are then dominated by that burst
(about 170 kW for the Ladakh example) and would size an absurd heater. ``verify_candidate`` therefore (1) starts runs at the
setpoint unless told otherwise, and (2) sizes the heater from the peak AFTER the first ``warmup_hours``. Ask the M4 owner how
M4 treats initial conditions.

Verification of one candidate = three runs through ``run_checked``:
    free-floating  ->  ideal-load  ->  heater sized from the settled ideal-load peak  ->  capacity-limited
A failed or untrustworthy run excludes the candidate with the stage, code and reason. It is never retried.
If the evaluator itself is unavailable the whole batch raises (that is not a property of one design).
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal, Mapping, Protocol, Sequence, runtime_checkable

from cocoon_contracts.building import BuildingModel
from cocoon_contracts.economics import CostScenario, EconomicAnalysisResult
from cocoon_contracts.requirements import RequirementsContract
from cocoon_contracts.simulation import (
    RecommendationState,
    SimulationEngineMode,
    SimulationRequest,
    SimulationRequestEngineMetadata,
    SimulationResult,
    SimulationStatus,
)

if TYPE_CHECKING:  # M2's public types; only for annotations, so this module stays importable without M2
    from design_generator import Candidate

STAND_IN_ENGINE_PREFIX = "standin_"
STAND_IN_ECONOMICS_PREFIX = "econ_standin"
DEFAULT_ENGINE_NAME = "cocoon_multizone_rc"

# Sanity guards (they reject nonsense; they never clip or repair a result).
DEFAULT_TEMPERATURE_BOUNDS_C = (-90.0, 90.0)
DEFAULT_MAX_RESIDUAL_PCT = 1.0


# ----- errors -----------------------------------------------------------------
class EvaluatorError(ValueError):
    """Base class. ``code`` is stable and machine-readable."""

    code = "EVALUATOR_ERROR"

    def __init__(self, message: str, details: dict | None = None):
        self.details = details or {}
        super().__init__(message)


class EvaluatorUnavailableError(EvaluatorError):
    code = "EVALUATOR_UNAVAILABLE"


class EvaluationFailedError(EvaluatorError):
    """The run failed, or its result cannot be trusted. ``code`` says which."""

    code = "EVALUATION_FAILED"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        super().__init__(message, details)


class EconomicsUnavailableError(EvaluatorError):
    code = "ECONOMICS_UNAVAILABLE"


class EconomicsFailedError(EvaluatorError):
    code = "ECONOMICS_FAILED"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        super().__init__(message, details)


# ----- the job M6 hands to M4 ------------------------------------------------------
@dataclass(frozen=True)
class SimulationJob:
    building: BuildingModel
    weather_snapshot_id: str
    mode: SimulationEngineMode
    window_start: datetime
    window_end: datetime
    setpoint_c: float
    timestep_seconds: int = 900
    initial_temperature_c: float = -25.0
    ground_temperature_c: float | None = -10.0
    heater_capacity_kw: float | None = None
    air_changes_per_hour: float | None = None
    extras: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for name in ("window_start", "window_end"):
            value = getattr(self, name)
            if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
                raise EvaluationFailedError(f"{name} must be timezone-aware", "INVALID_JOB", {"field": name})
        if self.window_end <= self.window_start:
            raise EvaluationFailedError("window_end must be after window_start", "INVALID_JOB")
        if self.timestep_seconds <= 0:
            raise EvaluationFailedError("timestep_seconds must be positive", "INVALID_JOB")
        if not self.weather_snapshot_id.startswith("wx_"):
            raise EvaluationFailedError("weather_snapshot_id must start with 'wx_'", "INVALID_JOB")
        if self.mode == SimulationEngineMode.CAPACITY_LIMITED_CONDITIONED and not (
            self.heater_capacity_kw and self.heater_capacity_kw > 0
        ):
            raise EvaluationFailedError("capacity-limited mode needs heater_capacity_kw > 0", "INVALID_JOB")
        if self.heater_capacity_kw is not None and self.heater_capacity_kw <= 0:
            raise EvaluationFailedError("heater_capacity_kw must be positive when given", "INVALID_JOB")
        if self.air_changes_per_hour is not None and self.air_changes_per_hour < 0:
            raise EvaluationFailedError("air_changes_per_hour cannot be negative", "INVALID_JOB")

    @property
    def window_hours(self) -> float:
        return (self.window_end - self.window_start).total_seconds() / 3600.0

    def request_id(self) -> str:
        """Deterministic id over everything that changes the answer."""
        parts: list[Any] = [
            self.building.revision_id, self.weather_snapshot_id, self.mode.value, self.window_start.isoformat(),
            self.window_end.isoformat(), self.setpoint_c, self.timestep_seconds, self.initial_temperature_c,
            self.ground_temperature_c, self.heater_capacity_kw, self.air_changes_per_hour,
        ]
        if "perturbation" in self.extras:          # a perturbed run must not share an id with the base run (phase 8)
            parts.append(self.extras["perturbation"])
        key = json.dumps(parts, sort_keys=True, default=str)
        return "sim_" + hashlib.sha1(key.encode()).hexdigest()[:12]

    def to_request(self, engine_name: str = DEFAULT_ENGINE_NAME, engine_version: str = "1.0.0") -> SimulationRequest:
        """The part of this job the M0 SimulationRequest can carry (see the module docstring for what it cannot)."""
        return SimulationRequest(
            schema_version="4.0", request_id=self.request_id(), design_revision_id=self.building.revision_id,
            weather_snapshot_id=self.weather_snapshot_id,
            engine=SimulationRequestEngineMetadata(
                name=engine_name, version=engine_version, mode=self.mode, timestep_seconds=self.timestep_seconds),
            time_window_start=self.window_start, time_window_end=self.window_end,
            initial_temperature_c=self.initial_temperature_c, ground_temperature_c=self.ground_temperature_c)

    @classmethod
    def from_candidate(
        cls,
        candidate: "Candidate",
        *,
        weather_snapshot_id: str,
        mode: SimulationEngineMode,
        window_start: datetime,
        window_end: datetime,
        setpoint_c: float,
        timestep_seconds: int = 900,
        initial_temperature_c: float = -25.0,
        ground_temperature_c: float | None = -10.0,
        heater_capacity_kw: float | None = None,
        air_changes_per_hour: float | None = None,
    ) -> "SimulationJob":
        """Job for an M2 candidate. Air changes per hour come from ``candidate.extras`` (M2 side field) unless overridden."""
        return cls(
            building=candidate.building, weather_snapshot_id=weather_snapshot_id, mode=mode,
            window_start=window_start, window_end=window_end, setpoint_c=setpoint_c,
            timestep_seconds=timestep_seconds, initial_temperature_c=initial_temperature_c,
            ground_temperature_c=ground_temperature_c, heater_capacity_kw=heater_capacity_kw,
            air_changes_per_hour=(air_changes_per_hour if air_changes_per_hour is not None
                                  else candidate.extras.get("air_changes_per_hour")),
            extras=dict(candidate.extras))


# ----- the interfaces -----------------------------------------------------------------
@runtime_checkable
class Evaluator(Protocol):
    """M4 (or a test double). Must be deterministic for a given job."""

    engine_name: str
    engine_version: str

    def simulate(self, job: SimulationJob) -> SimulationResult: ...


@runtime_checkable
class EconomicsProvider(Protocol):
    """M7 (or a test double)."""

    def analyse(
        self,
        building: BuildingModel,
        quantities: Any,
        simulation: SimulationResult,
        assumption_set_id: str,
        scenario: CostScenario,
    ) -> EconomicAnalysisResult: ...


class M4Evaluator:
    """Placeholder for the real multi-zone RC engine. Replace ``simulate`` with a call into M4."""

    engine_name = DEFAULT_ENGINE_NAME
    engine_version = "unconnected"

    def simulate(self, job: SimulationJob) -> SimulationResult:
        raise EvaluatorUnavailableError(
            "M4 (multi-zone RC engine) is not connected; pass an Evaluator implementation.",
            {"needs": ["callable or CLI for M4", "how setpoint_c, heater_capacity_kw and air_changes_per_hour reach it"]})


class M7EconomicsProvider:
    """Placeholder for the real lifecycle-economics module."""

    def analyse(self, building, quantities, simulation, assumption_set_id, scenario):
        raise EconomicsUnavailableError("M7 (lifecycle economics) is not connected; pass an EconomicsProvider.")


# ----- provenance ------------------------------------------------------------------------
def is_development_only(result: SimulationResult) -> bool:
    """True when the result came from a stand-in, not from M4. Such results must never be shown as validated."""
    return result.engine.name.startswith(STAND_IN_ENGINE_PREFIX)


def is_development_only_economics(result: EconomicAnalysisResult) -> bool:
    return result.analysis_id.startswith(STAND_IN_ECONOMICS_PREFIX)


# ----- checks on what comes back ------------------------------------------------------------
def _numbers(result: SimulationResult):
    if result.summary is not None:
        yield from ((f"summary.{k}", v) for k, v in result.summary.model_dump().items() if isinstance(v, (int, float)))
    for z in result.zones:
        yield from ((f"zone[{z.zone_id}].{k}", v) for k, v in z.model_dump().items() if isinstance(v, (int, float)))
    for i, p in enumerate(result.time_series or ()):
        yield f"time_series[{i}].ambient", p.ambient_temperature_c
        yield f"time_series[{i}].residual", p.energy_residual_w
        for zid, v in p.zone_temperatures_c.items():
            yield f"time_series[{i}].T[{zid}]", v
        for zid, v in p.heating_power_w.items():
            yield f"time_series[{i}].P[{zid}]", v


def check_result_matches_job(job: SimulationJob, result: SimulationResult) -> None:
    """The result must belong to this job's design, mode, weather and rooms."""
    problems = []
    if result.design_revision_id != job.building.revision_id:
        problems.append(f"design {result.design_revision_id} != {job.building.revision_id}")
    mode = getattr(result.engine.mode, "value", result.engine.mode)
    if mode not in (job.mode.value, "conditioned"):
        problems.append(f"mode {mode} != {job.mode.value}")
    if result.provenance.weather_snapshot_id != job.weather_snapshot_id:
        problems.append(f"weather {result.provenance.weather_snapshot_id} != {job.weather_snapshot_id}")
    expected = {z.id for f in job.building.floors for z in f.zones}
    if result.zones and {z.zone_id for z in result.zones} != expected:
        problems.append("zone ids differ from the building's")
    if problems:
        raise EvaluationFailedError("result does not belong to the job: " + "; ".join(problems), "RESULT_MISMATCH",
                                    {"problems": problems})


def check_result_sanity(
    result: SimulationResult,
    *,
    max_residual_pct: float = DEFAULT_MAX_RESIDUAL_PCT,
    temperature_bounds_c: tuple[float, float] = DEFAULT_TEMPERATURE_BOUNDS_C,
) -> None:
    """Reject failed, non-finite, physically absurd or non-conserving results. Never repairs them."""
    status = getattr(result.status, "value", result.status)
    if status != SimulationStatus.COMPLETED.value or result.summary is None:
        raise EvaluationFailedError(f"simulation status is '{status}'", "EVALUATION_FAILED", {"status": status})
    bad = [name for name, v in _numbers(result) if not math.isfinite(v)]
    if bad:
        raise EvaluationFailedError(f"non-finite values in result: {bad[:5]}", "NON_FINITE_RESULT", {"fields": bad[:20]})
    lo, hi = temperature_bounds_c
    temps = [(z.zone_id, z.temperature_min_c) for z in result.zones] + [(z.zone_id, z.temperature_max_c) for z in result.zones]
    for p in result.time_series or ():
        temps.extend(p.zone_temperatures_c.items())
    out = sorted({zid for zid, t in temps if not lo <= t <= hi})
    if out:
        raise EvaluationFailedError(f"implausible temperatures outside {lo}..{hi} C in zones {out}", "IMPLAUSIBLE_RESULT",
                                    {"zones": out, "bounds_c": [lo, hi]})
    if abs(result.summary.energy_residual_max_pct) > max_residual_pct:
        raise EvaluationFailedError(
            f"energy residual {result.summary.energy_residual_max_pct}% exceeds {max_residual_pct}%",
            "ENERGY_RESIDUAL_TOO_LARGE", {"residual_pct": result.summary.energy_residual_max_pct})


def run_checked(evaluator: Evaluator, job: SimulationJob, **sanity: Any) -> SimulationResult:
    """Run one simulation and refuse untrustworthy answers. The single entry point for later phases."""
    try:
        result = evaluator.simulate(job)
    except EvaluatorError:
        raise
    except Exception as exc:  # an evaluator crash is a failed run, not a crash of M6
        raise EvaluationFailedError(f"evaluator crashed: {exc!r}", "EVALUATION_FAILED",
                                    {"exception": type(exc).__name__}) from exc
    check_result_matches_job(job, result)
    check_result_sanity(result, **sanity)
    return result


def analyse_checked(
    provider: EconomicsProvider,
    building: BuildingModel,
    quantities: Any,
    simulation: SimulationResult,
    assumption_set_id: str,
    scenario: CostScenario = CostScenario.EXPECTED,
) -> EconomicAnalysisResult:
    """Run one economic analysis and refuse inconsistent answers."""
    try:
        econ = provider.analyse(building, quantities, simulation, assumption_set_id, scenario)
    except EvaluatorError:
        raise
    except Exception as exc:
        raise EconomicsFailedError(f"economics provider crashed: {exc!r}", "ECONOMICS_FAILED",
                                   {"exception": type(exc).__name__}) from exc
    problems = []
    if econ.design_revision_id != building.revision_id:
        problems.append("design revision differs")
    if econ.assumption_set_id != assumption_set_id:
        problems.append("assumption set differs")
    if econ.scenario != scenario:
        problems.append("scenario differs")
    c = econ.capex
    parts = c.materials_inr + c.labour_inr + c.transport_inr + c.equipment_inr
    if not math.isclose(parts, c.total_capex_inr, rel_tol=1e-6, abs_tol=1e-6):
        problems.append(f"capex total {c.total_capex_inr} != sum of parts {parts}")
    if not math.isfinite(econ.lcc_inr) or econ.lcc_inr + 1e-6 < c.total_capex_inr:
        problems.append("lifecycle cost is not finite or is below capex")
    years = [p.year for p in econ.annual_cash_flows]
    if years != list(range(1, len(years) + 1)):
        problems.append("cash-flow years are not 1..N")
    if problems:
        raise EconomicsFailedError("economics result is inconsistent: " + "; ".join(problems), "ECONOMICS_INCONSISTENT",
                                   {"problems": problems})
    return econ


# ======================================================================================================================
# Phase 5: verifying finalists and sizing their heaters
# ======================================================================================================================
DEFAULT_HEATER_SIZES_KW = (1.0, 2.0, 3.0, 5.0, 7.5, 10.0, 15.0, 20.0, 30.0, 50.0)     # PLACEHOLDER standard sizes


@dataclass(frozen=True)
class VerificationSettings:
    """How every finalist is run. Values marked PLACEHOLDER are assumptions to be reviewed."""

    weather_snapshot_id: str
    window_start: datetime
    window_end: datetime
    setpoint_c: float                                   # the requirement's target temperature
    timestep_seconds: int = 900
    initial_temperature_c: float | None = None          # None -> the setpoint (a warm start; see the module docstring)
    ground_temperature_c: float | None = -10.0
    warmup_hours: float = 48.0                          # PLACEHOLDER: ignored when sizing and when computing metrics
    heater_margin: float = 1.25                         # PLACEHOLDER: capacity = settled peak x margin, rounded up
    heater_sizes_kw: tuple[float, ...] = DEFAULT_HEATER_SIZES_KW
    heater_fuel: str | None = None
    include_free_floating: bool = True
    run_timeout_s: float | None = None                  # a run that takes longer is a failed run (cooperative)
    max_workers: int = 1

    def __post_init__(self) -> None:
        if self.window_end <= self.window_start:
            raise EvaluationFailedError("window_end must be after window_start", "INVALID_SETTINGS")
        if self.warmup_hours < 0 or self.warmup_hours * 3600 >= (self.window_end - self.window_start).total_seconds():
            raise EvaluationFailedError("warmup_hours must be >= 0 and shorter than the simulation window", "INVALID_SETTINGS")
        if self.heater_margin < 1.0:
            raise EvaluationFailedError("heater_margin must be at least 1.0", "INVALID_SETTINGS")
        sizes = list(self.heater_sizes_kw)
        if not sizes or any(x <= 0 for x in sizes) or sizes != sorted(set(sizes)):
            raise EvaluationFailedError("heater_sizes_kw must be positive, increasing and unique", "INVALID_SETTINGS")
        if self.run_timeout_s is not None and self.run_timeout_s <= 0:
            raise EvaluationFailedError("run_timeout_s must be positive", "INVALID_SETTINGS")
        if self.max_workers < 1:
            raise EvaluationFailedError("max_workers must be at least 1", "INVALID_SETTINGS")

    @property
    def start_temperature_c(self) -> float:
        return self.setpoint_c if self.initial_temperature_c is None else self.initial_temperature_c

    def to_objective_settings(self, max_unmet_hours: float, **overrides: Any):
        """ObjectiveSettings that use the SAME target and warm-up as these runs (so sizing and metrics agree)."""
        from optimization.objectives import ObjectiveSettings

        return ObjectiveSettings(target_c=self.setpoint_c, max_unmet_hours=max_unmet_hours,
                                 warmup_hours=self.warmup_hours, **overrides)

    @classmethod
    def from_requirements(cls, requirements: RequirementsContract | dict, *, weather_snapshot_id: str,
                          **overrides: Any) -> "VerificationSettings":
        """Window, target temperature and first allowed fuel come from the requirements."""
        if not isinstance(requirements, RequirementsContract):
            requirements = RequirementsContract.model_validate(requirements)
        fuels = requirements.constraints.heater_fuels
        args: dict[str, Any] = dict(
            weather_snapshot_id=weather_snapshot_id, window_start=requirements.site.analysis_start,
            window_end=requirements.site.analysis_end, setpoint_c=requirements.mission.target_temperature_c,
            heater_fuel=fuels[0] if fuels else None)
        args.update(overrides)
        return cls(**args)


@dataclass(frozen=True)
class HeaterPlan:
    zone_ids: tuple[str, ...]                          # rooms that have a heater
    capacity_kw: float                                 # size of EACH heater (one size for all, set by the biggest need)
    peak_kw_by_zone: Mapping[str, float]               # settled peak per heated room (warm-up excluded)
    settled_peak_kw: float                             # the largest of those
    margin: float
    fuel: str | None


@dataclass(frozen=True)
class RunRecord:
    mode: str
    request_id: str
    simulation_id: str
    engine_name: str
    engine_version: str
    timestep_seconds: int
    heater_capacity_kw: float | None
    elapsed_s: float = field(default=0.0, compare=False)      # wall time; excluded from equality so results are comparable


@dataclass(frozen=True)
class VerificationFailure:
    stage: str                                         # setup | free_floating | ideal_load | sizing | capacity_limited
    code: str
    message: str


@dataclass(frozen=True)
class VerifiedCandidate:
    design_id: str
    revision_id: str
    status: Literal["verified", "failed"]
    evaluation: Any = None                             # optimization.objectives.CandidateEvaluation when verified
    heater: HeaterPlan | None = None
    recommendation_state: RecommendationState | None = None
    development_only: bool = False
    failure: VerificationFailure | None = None
    runs: tuple[RunRecord, ...] = ()

    def to_dict(self) -> dict:
        return {
            "design_id": self.design_id, "revision_id": self.revision_id, "status": self.status,
            "recommendation_state": self.recommendation_state.value if self.recommendation_state else None,
            "development_only": self.development_only,
            "heater": None if self.heater is None else {
                "zone_ids": list(self.heater.zone_ids), "capacity_kw": self.heater.capacity_kw,
                "settled_peak_kw": self.heater.settled_peak_kw, "margin": self.heater.margin, "fuel": self.heater.fuel,
                "peak_kw_by_zone": dict(self.heater.peak_kw_by_zone)},
            "failure": None if self.failure is None else {
                "stage": self.failure.stage, "code": self.failure.code, "message": self.failure.message},
            "runs": [{"mode": r.mode, "request_id": r.request_id, "simulation_id": r.simulation_id, "engine": r.engine_name,
                      "engine_version": r.engine_version, "timestep_seconds": r.timestep_seconds,
                      "heater_capacity_kw": r.heater_capacity_kw} for r in self.runs]}


def round_up_to_size(kw: float, sizes: Sequence[float]) -> float:
    """Smallest listed size that is at least ``kw``; beyond the list, the next multiple of the largest size."""
    for size in sizes:
        if kw <= size + 1e-9:
            return size
    return math.ceil(kw / sizes[-1] - 1e-9) * sizes[-1]


def size_heater(ideal: SimulationResult, heated_zone_ids: Sequence[str], settings: VerificationSettings) -> HeaterPlan:
    """Heater capacity from the ideal-load run's SETTLED peak (the first ``warmup_hours`` are ignored).

    Each heated room's peak is taken separately; one capacity is used for all heaters, sized for the biggest need. A
    building whose settled demand is zero still gets the smallest listed heater.
    """
    from optimization.objectives import kept_points

    zones = list(heated_zone_ids)
    if not zones:
        raise EvaluationFailedError("the building has no heated room to size a heater for", "NO_HEATED_ZONE")
    if ideal.time_series:
        points, _ = kept_points(ideal, settings.warmup_hours)
        if not points:
            raise EvaluationFailedError(f"the {settings.warmup_hours:g} h warm-up covers the whole run", "NO_TIME_SERIES")
        peaks = {z: max(p.heating_power_w.get(z, 0.0) for p in points) / 1000.0 for z in zones}
    elif settings.warmup_hours == 0:
        by_zone = {z.zone_id: (z.peak_heating_kw or 0.0) for z in ideal.zones}
        peaks = {z: by_zone.get(z, 0.0) for z in zones}
    else:
        raise EvaluationFailedError("cannot exclude the warm-up: the ideal-load result has no time series", "NO_TIME_SERIES")
    settled = max(peaks.values())
    capacity = round_up_to_size(settled * settings.heater_margin, settings.heater_sizes_kw)
    return HeaterPlan(tuple(zones), capacity, peaks, settled, settings.heater_margin, settings.heater_fuel)


def verify_candidate(candidate: Any, evaluator: Evaluator, settings: VerificationSettings) -> VerifiedCandidate:
    """Free-floating, ideal-load, heater sizing, capacity-limited. ``candidate`` needs ``.building`` (and may have
    ``.extras`` and ``.quantities``, as an M2 Candidate does). Raises only if the evaluator is unavailable."""
    from optimization.objectives import CandidateEvaluation

    building = candidate.building
    extras = dict(getattr(candidate, "extras", None) or {})
    base = dict(
        building=building, weather_snapshot_id=settings.weather_snapshot_id, window_start=settings.window_start,
        window_end=settings.window_end, setpoint_c=settings.setpoint_c, timestep_seconds=settings.timestep_seconds,
        initial_temperature_c=settings.start_temperature_c, ground_temperature_c=settings.ground_temperature_c,
        air_changes_per_hour=extras.get("air_changes_per_hour"), extras=extras)
    heated = tuple(z.id for f in building.floors for z in f.zones if z.hvac_id)
    runs: list[RunRecord] = []

    def failed(stage: str, code: str, message: str) -> VerifiedCandidate:
        return VerifiedCandidate(building.design_id, building.revision_id, "failed",
                                 failure=VerificationFailure(stage, code, message), runs=tuple(runs))

    if not heated:
        return failed("setup", "NO_HEATED_ZONE", "the building has no heated room, so there is nothing to size or run")

    def go(mode: SimulationEngineMode, capacity: float | None = None) -> SimulationResult:
        job = SimulationJob(mode=mode, heater_capacity_kw=capacity, **base)
        started = time.perf_counter()
        result = run_checked(evaluator, job)
        elapsed = time.perf_counter() - started
        if settings.run_timeout_s is not None and elapsed > settings.run_timeout_s:
            raise EvaluationFailedError(f"the {mode.value} run took {elapsed:.2f} s, over the {settings.run_timeout_s:g} s limit",
                                        "TIMED_OUT", {"elapsed_s": elapsed})
        runs.append(RunRecord(mode.value, job.request_id(), result.simulation_id, result.engine.name, result.engine.version,
                              result.engine.timestep_seconds, capacity, elapsed))
        return result

    stage = "free_floating"
    try:
        free = go(SimulationEngineMode.FREE_FLOATING) if settings.include_free_floating else None
        stage = "ideal_load"
        ideal = go(SimulationEngineMode.IDEAL_LOAD_CONDITIONED)
        stage = "sizing"
        plan = size_heater(ideal, heated, settings)
        stage = "capacity_limited"
        limited = go(SimulationEngineMode.CAPACITY_LIMITED_CONDITIONED, plan.capacity_kw)
    except EvaluatorUnavailableError:
        raise
    except EvaluatorError as exc:
        return failed(stage, exc.code, str(exc))

    results = [r for r in (free, ideal, limited) if r is not None]
    dev = any(is_development_only(r) for r in results)
    evaluation = CandidateEvaluation(building=building, quantities=getattr(candidate, "quantities", None),
                                     free_floating=free, ideal_load=ideal, capacity_limited=limited)
    return VerifiedCandidate(
        building.design_id, building.revision_id, "verified", evaluation, plan,
        None if dev else RecommendationState.VERIFIED_BY_RC, dev, None, tuple(runs))


def verify_candidates(candidates: Sequence[Any], evaluator: Evaluator, settings: VerificationSettings) -> list[VerifiedCandidate]:
    """Verify every candidate; results come back in input order whatever ``max_workers`` is."""
    if settings.max_workers == 1 or len(candidates) <= 1:
        return [verify_candidate(c, evaluator, settings) for c in candidates]
    with ThreadPoolExecutor(max_workers=settings.max_workers) as pool:
        futures = [pool.submit(verify_candidate, c, evaluator, settings) for c in candidates]
        return [f.result() for f in futures]
