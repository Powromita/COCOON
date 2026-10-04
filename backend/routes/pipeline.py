"""
backend/routes/pipeline.py — the integrated M2-M7 API surface (PRD §16.1, §16.3, §16.4).

    GET  /api/v1/capabilities
    GET  /api/v1/materials                         material snapshots (M3)
    GET  /api/v1/weather-snapshots                 frozen weather snapshots (M3)
    POST /api/v1/weather-snapshots                 freeze a site/window from the cached archives
    POST /api/v1/generate-designs                  requirements -> validated candidates (M2, synchronous)
    POST /api/v1/simulations                       one RC run for one BuildingModel revision (M4, synchronous)
    GET  /api/v1/simulations/{id}[/timeseries]
    POST /api/v1/optimizations                     the whole pipeline as a background job (201 + id)
    GET  /api/v1/optimizations/{id}                status, and the result once completed
    GET  /api/v1/optimizations/{id}/candidates
    GET  /api/v1/optimizations/{id}/pareto
    GET  /api/v1/optimizations/{id}/designs/{design_id}   the BuildingModel of any generated candidate
    POST /api/v1/optimizations/{id}/retry          re-run a failed job from its stored request (once per failed job)

Template-aware generation: POST /generate-designs and POST /optimizations take an optional ``template_id`` and
``room_arrangement`` and always re-run the M2 compatibility check (routes/design.py) before any generation; an
incompatible request is refused with a categorised 422 and nothing is queued. When no catalogue template can hold the
requested rooms (and none was pinned) generation falls back to requirement-derived layouts. The job records the
template catalogue version, the compatibility result, real stage transitions (from the pipeline's progress observer)
and, per candidate, the template, layout seed and parameters it was generated with (provenance.json).

Optimisation jobs run on a bounded thread pool, never on the request thread (PRD §21.1). Job status and results
are files, so a restart does not lose history; a job that was `running` when the server died is reported as
`failed` (interrupted) rather than left running forever. Errors use the M0 ErrorEnvelope.
AUTH_MODE is disabled in this build (local development).
"""

import dataclasses
import hashlib
import json
import re
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from cocoon_contracts import (BuildingModel, ErrorCode, ErrorDetail, ErrorEnvelope, RequirementsContract,
                              SimulationEngineMode, SimulationResult)
from design_generator import (GenerationOptions, generate_designs, generation_options_for_policy,
                              to_error_envelope as m2_envelope)
from design_generator.requirement_parser import InfeasibleRequirementsError, parse_requirements
from economics.provider import DEFAULT_ASSUMPTIONS_DIR
from m3_data import WeatherError, WeatherStore, extended_snapshot, load_snapshot, standard_snapshot
from m4_engine import ENGINE_NAME, ENGINE_VERSION, M4Error, M4Evaluator
from optimization import OptimizationSettings, RankingSettings, to_error_envelope as m6_envelope

from .. import settings
from ..auth import AuthenticatedUser, require_user
from ..project_store import create_run, ensure_project, owns_run
from .design import compatibility_or_error
from .errors import GENERIC_MESSAGE, classify_job_error, envelope, log

router = APIRouter(prefix="/api/v1", tags=["pipeline"])
_OPT_ID = re.compile(r"^opt_[A-Za-z0-9_-]+$")
_SIM_ID = re.compile(r"^sim_[0-9a-f]{12}$")
_DESIGN_ID = re.compile(r"^des_[A-Za-z0-9_]+$")
_pool = ThreadPoolExecutor(max_workers=settings.MAX_PIPELINE_JOBS, thread_name_prefix="cocoon-opt")
_live: set[str] = set()
_lock = threading.Lock()
_status_lock = threading.RLock()        # status.json is read-modify-written by the job thread and the progress observer


def require_owned_run(optimization_id: str, user: AuthenticatedUser = Depends(require_user)) -> AuthenticatedUser:
    if not owns_run(user.id, optimization_id):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Optimization not found")
    return user
def _err(status: int, code: ErrorCode, message: str, details: dict | None = None, retryable: bool = False) -> JSONResponse:
    env = ErrorEnvelope(error=ErrorDetail(code=code, message=message, details=details or {}, trace_id=str(uuid.uuid4()),
                                          retryable=retryable))
    return JSONResponse(status_code=status, content=env.model_dump(mode="json"))


def _retry(fn, attempts: int = 40, delay: float = 0.025):
    """Windows briefly denies access to a file that another thread is reading or replacing; wait and try again."""
    for i in range(attempts):
        try:
            return fn()
        except PermissionError:
            if i == attempts - 1:
                raise
            time.sleep(delay)


def _atomic(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + f".{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_text(text, encoding="utf-8")
    _retry(lambda: tmp.replace(path))


def _read(path: Path) -> str:
    return _retry(lambda: path.read_text(encoding="utf-8"))


def _store() -> WeatherStore:
    return WeatherStore()


def _materials(snapshot_id: str | None):
    if snapshot_id in (None, "mat_snap_himalayan_v1"):
        return standard_snapshot()
    if snapshot_id == "mat_snap_himalayan_v2":
        return extended_snapshot()
    return load_snapshot(snapshot_id)


# ----------------------------------------------------------------------------------------------------------
@router.get("/capabilities")
def capabilities():
    from .ansys import IMPORT_ERROR
    ml = None
    try:
        import ml.surrogate  # noqa: F401
        ml = "importable (not used by the pipeline until it is valid for this engine)"
    except Exception as exc:                                        # noqa: BLE001
        ml = f"unavailable: {type(exc).__name__}"
    return {
        "schema_versions": ["4.0"], "auth_mode": "supabase_jwt",
        "modules": {
            "m2_design_generator": True, "m3_weather_sites": _store().sites(),
            "m4_engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "m5_ml_surrogate": ml, "m6_optimization": True, "m7_economics": True,
            "m8_ansys": {"importable": IMPORT_ERROR is None, "unavailable_reason": IMPORT_ERROR}},
        "economic_assumption_sets_dir": str(DEFAULT_ASSUMPTIONS_DIR), "weather": {"source": "cached NASA POWER archives"}}


@router.get("/materials")
def list_materials():
    out = []
    for s in (standard_snapshot(), extended_snapshot()):
        out.append({"snapshot_id": s.snapshot_id, "materials": sorted(s.materials), "checksum_sha256": s.checksum_sha256})
    return {"snapshots": out, "default": "mat_snap_himalayan_v1"}


@router.get("/weather-snapshots")
def list_weather():
    return {"snapshots": _store().list(), "sites": _store().sites()}


class WeatherBody(BaseModel):
    site: str
    start: datetime
    end: datetime


@router.post("/weather-snapshots", status_code=201)
def create_weather(body: WeatherBody):
    try:
        snap = _store().build(body.site, body.start.replace(tzinfo=None), body.end.replace(tzinfo=None))
    except WeatherError as exc:
        return _err(422, ErrorCode.WEATHER_GAP_TOO_LARGE if "GAP" in exc.code else ErrorCode.VALIDATION_ERROR, exc.message,
                    {"weather_code": exc.code})
    return {"snapshot_id": snap.snapshot_id, "hours": len(snap.hourly_data), "checksum_sha256": snap.checksum_sha256,
            "is_cached": snap.source.is_cached, "interpolations": len(snap.interpolations)}


# ----------------------------------------------------------------------------------------------------------
class GenerateBody(BaseModel):
    requirements: RequirementsContract
    count: int = Field(default=20, ge=1, le=settings.MAX_GENERATE_COUNT)
    seed: int = 42
    materials_snapshot_id: str | None = None
    template_id: str | None = None                                  # None = every compatible template
    room_arrangement: dict[str, Literal["dedicated", "shared"]] = Field(default_factory=dict)


def _provenance(candidates, compatibility: dict, seed: int) -> list[dict]:
    """Per valid M2 candidate: what it was generated from. Every value is read from the candidate itself."""
    versions = {t["template_id"]: t["version"] for t in compatibility["templates"]}
    keys = ("layout_seed", "orientation_deg", "glazing", "airtightness_class", "air_changes_per_hour", "wwr_target",
            "merged_rooms")
    return [{"design_id": c.building.design_id, "revision_id": c.building.revision_id,
             "template_id": c.extras["template_id"], "template_version": versions.get(c.extras["template_id"]),
             "catalog_version": compatibility["catalog_version"], "generator_version": c.building.metadata.generator_version,
             "seed": seed, "parameters": {k: c.extras.get(k) for k in keys},
             "m2_validation": {"ok": c.report.ok, "passed": list(c.report.passed),
                               "skipped": [name for name, _ in c.report.skipped]}}
            for c in candidates]


@router.post("/generate-designs")
def generate(body: GenerateBody):
    snapshot = _materials(body.materials_snapshot_id)
    compat, refused = compatibility_or_error(body.requirements.model_dump(mode="json"), body.template_id,
                                             body.room_arrangement, snapshot)
    if refused is not None:
        return refused
    options = GenerationOptions(template_ids=tuple(compat["selected_template_ids"]))
    try:
        res = generate_designs(body.requirements, snapshot, seed=body.seed, count=body.count, options=options)
    except Exception as exc:                                        # noqa: BLE001
        env = m2_envelope(exc).model_dump(mode="json")
        env["error"] = classify_job_error(env["error"], [])
        return JSONResponse(status_code=422, content=env)
    out = {"requested": res.requested, "generated": len(res.candidates), "complete": res.complete,
           "attempts": res.attempts, "max_attempts": res.max_attempts, "rejection_reasons": dict(res.reasons),
           "catalog_version": compat["catalog_version"], "template_ids": compat["selected_template_ids"],
           "outcome": "OK" if res.complete else ("NO_FEASIBLE_CANDIDATES" if not res.candidates else "PARTIAL"),
           "provenance": _provenance(res.candidates, compat, body.seed),
           "candidates": [{"design_id": c.building.design_id, "revision_id": c.building.revision_id,
                           "extras": c.extras, "building": c.building.model_dump(mode="json")} for c in res.candidates]}
    return out


# ----------------------------------------------------------------------------------------------------------
class SimulationBody(BaseModel):
    building: BuildingModel
    weather_snapshot_id: str
    mode: SimulationEngineMode = SimulationEngineMode.IDEAL_LOAD_CONDITIONED
    window_start: datetime
    window_end: datetime
    setpoint_c: float = 15.0
    timestep_seconds: int = Field(default=900, gt=0)
    initial_temperature_c: float | None = None
    ground_temperature_c: float | None = -10.0
    heater_capacity_kw: float | None = Field(default=None, gt=0)
    air_changes_per_hour: float | None = Field(default=None, ge=0)
    materials_snapshot_id: str | None = None


def _sim_path(sim_id: str) -> Path | None:
    if not _SIM_ID.match(sim_id):
        return None
    p = (settings.SIMULATIONS_DIR / f"{sim_id}.json").resolve()
    try:
        p.relative_to(settings.SIMULATIONS_DIR.resolve())
    except ValueError:
        return None
    return p


@router.post("/simulations", status_code=201)
def create_simulation(body: SimulationBody):
    if body.window_start.tzinfo is None or body.window_end.tzinfo is None:
        return _err(422, ErrorCode.DATETIME_NOT_TIMEZONE_AWARE, "window_start and window_end must be timezone-aware")
    if body.mode == SimulationEngineMode.CAPACITY_LIMITED_CONDITIONED and not body.heater_capacity_kw:
        return _err(422, ErrorCode.VALIDATION_ERROR, "capacity-limited mode needs heater_capacity_kw")
    init = body.setpoint_c if body.initial_temperature_c is None else body.initial_temperature_c
    key = json.dumps([body.building.revision_id, body.weather_snapshot_id, body.mode.value, body.window_start.isoformat(),
                      body.window_end.isoformat(), body.setpoint_c, body.timestep_seconds, init, body.ground_temperature_c,
                      body.heater_capacity_kw, body.air_changes_per_hour, body.materials_snapshot_id], default=str)
    sim_id = "sim_" + hashlib.sha1(key.encode()).hexdigest()[:12]
    job = SimpleNamespace(building=body.building, weather_snapshot_id=body.weather_snapshot_id, mode=body.mode,
                          window_start=body.window_start, window_end=body.window_end, setpoint_c=body.setpoint_c,
                          timestep_seconds=body.timestep_seconds, initial_temperature_c=init,
                          ground_temperature_c=body.ground_temperature_c, heater_capacity_kw=body.heater_capacity_kw,
                          air_changes_per_hour=body.air_changes_per_hour, extras={}, request_id=lambda: sim_id)
    try:
        result = M4Evaluator(_materials(body.materials_snapshot_id), _store()).simulate(job)
    except M4Error as exc:
        code = ErrorCode.MISSING_REFERENCE if "NOT_FOUND" in exc.code else (
            ErrorCode.UNSUPPORTED_MATERIAL if "MATERIAL" in exc.code else ErrorCode.VALIDATION_ERROR)
        return _err(422, code, exc.message, {"m4_code": exc.code, **exc.details})
    _atomic(settings.SIMULATIONS_DIR / f"{sim_id}.json", result.model_dump_json())
    return result.model_copy(update={"time_series": None}).model_dump(mode="json") | {"timeseries_url": f"/api/v1/simulations/{sim_id}/timeseries"}


@router.get("/simulations/{simulation_id}")
def get_simulation(simulation_id: str):
    p = _sim_path(simulation_id)
    if p is None or not p.is_file():
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown simulation '{simulation_id}'")
    r = SimulationResult.model_validate_json(p.read_text(encoding="utf-8"))
    return r.model_copy(update={"time_series": None}).model_dump(mode="json")


@router.get("/simulations/{simulation_id}/timeseries")
def get_timeseries(simulation_id: str):
    p = _sim_path(simulation_id)
    if p is None or not p.is_file():
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown simulation '{simulation_id}'")
    r = SimulationResult.model_validate_json(p.read_text(encoding="utf-8"))
    return {"simulation_id": r.simulation_id, "timestep_seconds": r.engine.timestep_seconds,
            "points": [pt.model_dump(mode="json") for pt in (r.time_series or [])]}


# ----------------------------------------------------------------------------------------------------------
class RunOptions(BaseModel):
    hvac_mode: str = Field(default="ideal_load")
    heater_benchmark: bool = False


class DesignOptions(BaseModel):
    """Explicit geometry/envelope/opening choices from the configurator."""
    length_m: float | None = Field(default=None, ge=2.0, le=100.0)
    width_m: float | None = Field(default=None, ge=2.0, le=100.0)
    height_m: float | None = Field(default=None, ge=2.3, le=3.0)
    shape: str = Field(default="rectangular", pattern="^rectangular$")
    wall_thickness_mm: float | None = Field(default=None, ge=100, le=1000)
    roof_thickness_mm: float | None = Field(default=None, ge=80, le=1000)
    floor_thickness_mm: float | None = Field(default=None, ge=80, le=1000)
    window_count: int = Field(default=4, ge=0, le=20)
    window_width_m: float = Field(default=1.2, ge=0.4, le=3.0)
    window_height_m: float = Field(default=1.2, ge=0.4, le=3.0)
    window_orientation: str = Field(default="south", pattern="^(north|east|south|west)$")
    glazing: str = Field(default="double", pattern="^(single|double|triple|none)$")
    air_changes_per_hour: float = Field(default=0.8, ge=0.0, le=10.0)
    initial_temperature_c: float | None = Field(default=None, ge=-40, le=40)
    require_separate_rooms: bool = True
    material_policy: str = Field(default="cost_optimized_v2", pattern="^(legacy_v1|cost_optimized_v2)$")


def _generation_options(options: DesignOptions, template_ids=None) -> GenerationOptions:
    policy = generation_options_for_policy(options.material_policy)
    assembly = dict(policy.assembly_mm)
    # Configurator thicknesses are maximum build-up limits, not exact targets.
    # Standard material combinations may be thinner but never exceed the limit.
    if options.wall_thickness_mm is not None: assembly["wall"] = (assembly["wall"][0], min(assembly["wall"][1], options.wall_thickness_mm))
    if options.roof_thickness_mm is not None: assembly["roof"] = (assembly["roof"][0], min(assembly["roof"][1], options.roof_thickness_mm))
    if options.floor_thickness_mm is not None: assembly["floor"] = (assembly["floor"][0], min(assembly["floor"][1], options.floor_thickness_mm))
    glazing = options.glazing if options.glazing != "none" else "double"
    return GenerationOptions(
        thickness_mm=policy.thickness_mm, thickness_by_category_mm=policy.thickness_by_category_mm,
        thickness_choices_mm=policy.thickness_choices_mm,
        insulation_probability=policy.insulation_probability, max_u_value_w_m2k=policy.max_u_value_w_m2k,
        material_policy=policy.material_policy,
        fixed_length_m=options.length_m, fixed_width_m=options.width_m, fixed_height_m=options.height_m,
        window_count=options.window_count, window_orientation=options.window_orientation,
        window_sizes_m=((options.window_width_m, options.window_height_m),),
        glazing_weights={glazing: 1.0}, airtightness={"user": (options.air_changes_per_hour, 1.0)},
        assembly_mm=assembly,
        require_separate_rooms=options.require_separate_rooms, force_cardinal_orientation=True,
        template_ids=tuple(template_ids) if template_ids else None,
    )


class OptimizationBody(BaseModel):
    name: str | None = None
    project_name: str | None = None
    requirements: RequirementsContract
    count: int = Field(default=20, ge=1, le=200)
    seed: int = 42
    site: str | None = None
    materials_snapshot_id: str | None = None
    validate_with_ansys: bool = False
    ansys_designs: int = Field(default=1, ge=1, le=2)
    validation_strategy: str = Field(default="staged", pattern="^(staged|exhaustive)$")
    shortlist_size: int = Field(default=20, ge=5, le=25)
    reliability_designs: int = Field(default=5, ge=3, le=5)
    rc_workers: int = Field(default=4, ge=1, le=8)
    baseline_economics: bool = True
    run_options: RunOptions = Field(default_factory=RunOptions)
    design_options: DesignOptions = Field(default_factory=DesignOptions)
    template_id: str | None = None                                  # None = every compatible template (automatic)
    room_arrangement: dict[str, Literal["dedicated", "shared"]] = Field(default_factory=dict)


def _preflight(body: OptimizationBody) -> dict:
    dimensions = body.design_options
    cap = body.requirements.constraints.maximum_footprint_m2
    if dimensions.length_m is not None and dimensions.width_m is not None and cap is not None:
        area = dimensions.length_m * dimensions.width_m
        if area > cap + 1e-9:
            return {"error": ErrorEnvelope(error=ErrorDetail(
                code=ErrorCode.VALIDATION_ERROR,
                message=f"fixed geometry needs {area:.1f} m² per floor, but the maximum footprint is {cap:.1f} m²",
                details={"length_m": dimensions.length_m, "width_m": dimensions.width_m,
                         "fixed_footprint_m2": area, "maximum_footprint_m2": cap},
                trace_id=str(uuid.uuid4()), retryable=False)).model_dump(mode="json")}
    try:
        spec = parse_requirements(body.requirements)
    except Exception as exc:
        return {"error": m2_envelope(exc).model_dump(mode="json")}

    usable_area = dict(spec.usable_area_by_floor_count_m2)
    allowed_floor_counts = list(spec.allowed_floor_counts)
    if dimensions.length_m is not None and dimensions.width_m is not None:
        fixed_area = dimensions.length_m * dimensions.width_m
        usable_area = {
            floors: round(floors * fixed_area - 2 * (floors - 1) * spec.stair_allowance_m2, 6)
            for floors in range(1, spec.max_floors + 1)
        }
        allowed_floor_counts = [
            floors for floors, usable in usable_area.items()
            if usable >= spec.required_total_area_m2
        ]
        if not allowed_floor_counts:
            exc = InfeasibleRequirementsError(
                f"rooms need {spec.required_total_area_m2:.1f} m2 (incl. circulation), but the fixed "
                f"{dimensions.length_m:g} m x {dimensions.width_m:g} m footprint provides at most "
                f"{usable_area[spec.max_floors]:.1f} m2 across {spec.max_floors} floor(s)",
                {
                    "required_total_area_m2": spec.required_total_area_m2,
                    "room_area_sum_m2": spec.room_area_sum_m2,
                    "fixed_length_m": dimensions.length_m,
                    "fixed_width_m": dimensions.width_m,
                    "fixed_footprint_m2": fixed_area,
                    "max_floors": spec.max_floors,
                    "usable_area_by_floor_count_m2": usable_area,
                },
            )
            return {"error": m2_envelope(exc).model_dump(mode="json")}

        shortest_side = min(dimensions.length_m, dimensions.width_m)
        widest_room = max(spec.rooms, key=lambda room: room.min_dimension_m)
        if shortest_side + 1e-9 < widest_room.min_dimension_m:
            exc = InfeasibleRequirementsError(
                f"the fixed footprint's shortest side is {shortest_side:g} m, but room type "
                f"'{widest_room.room_type}' needs a minimum dimension of {widest_room.min_dimension_m:g} m",
                {
                    "fixed_length_m": dimensions.length_m,
                    "fixed_width_m": dimensions.width_m,
                    "shortest_side_m": shortest_side,
                    "room_type": widest_room.room_type,
                    "required_minimum_dimension_m": widest_room.min_dimension_m,
                },
            )
            return {"error": m2_envelope(exc).model_dump(mode="json")}

    return {"feasible": True, "required_total_area_m2": spec.required_total_area_m2,
            "room_area_sum_m2": spec.room_area_sum_m2,
            "usable_area_by_floor_count_m2": usable_area,
            "allowed_floor_counts": allowed_floor_counts}


@router.post("/optimizations/preflight")
def optimization_preflight(body: OptimizationBody):
    result = _preflight(body)
    if "error" in result:
        return JSONResponse(status_code=422, content=result["error"])
    return result


# Pipeline stages a job reports, in order. `event` is the progress-observer name that marks the stage finished
# (cocoon_pipeline.run_pipeline / optimization.optimize); nothing is estimated or interpolated.
STAGES: tuple[tuple[str, str, str | None], ...] = (
    ("compatibility", "Requirements checked against the M2 templates", None),
    ("weather", "Weather snapshot (M3)", "weather"),
    ("generation", "Candidate generation and validation (M2)", "generation"),
    ("simulation", "RC thermal simulation (M4)", "verification"),
    ("economics", "Lifecycle economics (M7)", "economics"),
    ("optimization", "Ranking and reliability (M6)", "reliability"),
    ("ansys", "ANSYS validation (M8)", "ansys"),
    ("report", "Final report", "final_report"),
)
_EVENT_STAGE = {event: sid for sid, _, event in STAGES if event}


def _initial_stages(ansys_requested: bool) -> list[dict]:
    out = []
    for sid, label, _ in STAGES:
        status = "pending"
        if sid == "compatibility":
            status = "completed"
        elif sid == "ansys" and not ansys_requested:
            status = "not_requested"
        out.append({"id": sid, "label": label, "status": status})
    return out


def _run_dir(opt_id: str) -> Path | None:
    if not _OPT_ID.match(opt_id):
        return None
    d = (settings.PIPELINE_RUNS_DIR / opt_id).resolve()
    try:
        d.relative_to(settings.PIPELINE_RUNS_DIR.resolve())
    except ValueError:
        return None
    return d


def _set_status(d: Path, **fields) -> dict:
    with _status_lock:
        p = d / "status.json"
        cur = json.loads(_read(p)) if p.exists() else {}
        cur.update(fields)
        cur["updated_at"] = datetime.now(timezone.utc).isoformat()
        _atomic(p, json.dumps(cur, indent=1))
        return cur


def _advance(d: Path, event: str) -> None:
    """Progress observer: mark the finished stage completed and the next pending one running. Never raises."""
    try:
        skip = event.endswith("_disabled")                      # e.g. "economics_disabled": the stage will not run
        sid = _EVENT_STAGE.get(event.removesuffix("_disabled") if skip else event)
        if sid is None:
            return
        with _status_lock:
            p = d / "status.json"
            cur = json.loads(_read(p))
            stages = cur.get("stages", [])
            now = datetime.now(timezone.utc).isoformat()
            if skip:
                for st in stages:
                    if st["id"] == sid and st["status"] == "pending":
                        st.update(status="skipped", note="turned off in this build")
                cur["stages"] = stages
                _atomic(p, json.dumps(cur, indent=1))
                return
            for i, st in enumerate(stages):
                if st["id"] == sid:
                    if st["status"] != "skipped":                      # a disabled stage stays "skipped"
                        st.update(status="completed", finished_at=now)
                    nxt = next((x for x in stages[i + 1:] if x["status"] == "pending"), None)
                    if nxt is not None:
                        nxt.update(status="running", started_at=now)
                    break
            cur["stages"] = stages
            cur["updated_at"] = now
            _atomic(p, json.dumps(cur, indent=1))
    except Exception:                                               # noqa: BLE001
        log.exception("could not record stage %s for %s", event, d.name)


def _finish_stages(stages: list[dict], failed: bool) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    for st in stages:
        if st["status"] == "running":
            st.update(status="failed" if failed else "completed", finished_at=now)
        elif st["status"] == "pending":
            st["status"] = "skipped"
    return stages


def _compat_gate(requirements: dict, template_id: str | None, room_arrangement: dict, snapshot,
                 require_separate_rooms: bool = False) -> tuple[dict, JSONResponse | None, list[str] | None]:
    """Server-side M2 compatibility check before anything is generated or queued.

    Returns (compatibility, refusal, template_ids). ``template_ids`` None means "no catalogue template applies": the
    request names no template and the only finding is that none can hold the rooms, so generation derives layouts from
    the requirements instead. Every other problem (input, physical infeasibility, a pinned template that does not fit)
    still refuses with a categorised 422.
    """
    compat, refused = compatibility_or_error(requirements, template_id, room_arrangement, snapshot)
    if refused is not None:
        codes = {c["code"] for c in compat["conflicts"]}
        if template_id is None and not compat["input_errors"] and codes == {"NO_COMPATIBLE_TEMPLATE"}:
            return compat, None, None
        return compat, refused, None
    ids = list(compat["selected_template_ids"])
    if require_separate_rooms and template_id is None:
        dedicated = {x["template_id"] for x in compat["templates"] if not x["shared"]}
        ids = [i for i in ids if i in dedicated] or None          # None: only requirement-derived layouts keep rooms separate
    return compat, None, ids


def _job(opt_id: str, body: OptimizationBody, template_ids: list[str] | None) -> None:
    from cocoon_pipeline import PipelineConfig, run_pipeline
    d = _run_dir(opt_id)
    st = _set_status(d, status="running", phase_message="Starting optimization",
                     started_at=datetime.now(timezone.utc).isoformat())
    stages = st.get("stages") or _initial_stages(body.validate_with_ansys)
    next(s for s in stages if s["id"] == "weather").update(status="running", started_at=st["started_at"])
    _set_status(d, stages=stages)

    def progress(phase: str, message: str) -> None:
        _set_status(d, phase_message=message)

    try:
        generation = _generation_options(body.design_options, template_ids)
        cfg = PipelineConfig(seed=body.seed, count=body.count, site=body.site, materials=_materials(body.materials_snapshot_id),
                             weather_store=_store(),
                             baseline_economics=body.baseline_economics, persist=True, run_id=opt_id,
                             runs_dir=settings.PIPELINE_RUNS_DIR,
                             ansys="submit" if body.validate_with_ansys else "not_requested",
                             ansys_wait=body.validate_with_ansys, ansys_designs=body.ansys_designs,
                             validation_strategy=body.validation_strategy, shortlist_size=min(body.shortlist_size, body.count),
                             reliability_designs=min(body.reliability_designs, body.shortlist_size, body.count),
                             rc_workers=body.rc_workers, progress_callback=progress,
                             progress=lambda event: _advance(d, event),
                             optimization=OptimizationSettings(generation=generation,
                                                               verification={"initial_temperature_c": body.design_options.initial_temperature_c}
                                                               if body.design_options.initial_temperature_c is not None else {}))
        result = run_pipeline(body.requirements, cfg)
        compat = json.loads(_read(d / "compatibility.json"))
        _atomic(d / "provenance.json", json.dumps(_provenance(result.optimization.candidates, compat, body.seed), indent=1))
        cur = json.loads(_read(d / "status.json"))
        stages = _finish_stages(cur.get("stages", []), failed=False)
        ansys = next((s for s in stages if s["id"] == "ansys"), None)
        if ansys is not None and body.validate_with_ansys:
            ansys["status"] = _ansys_stage_status(result.validation)
        _set_status(d, status="completed", phase_message="Validation completed",
                    finished_at=datetime.now(timezone.utc).isoformat(), stages=stages,
                    recommended_design_id=result.recommended_design_id, validation=result.validation,
                    summary=result.optimization.summary(), timings_s=result.timings_s,
                    generation=dataclasses.asdict(result.optimization.generation))
    except Exception as exc:                                        # noqa: BLE001
        env = m6_envelope(exc).model_dump(mode="json")
        cur = json.loads(_read(d / "status.json"))
        done = [s["id"] for s in cur.get("stages", []) if s["status"] == "completed"]
        log.error("optimization %s failed [trace %s]: %s", opt_id, env["error"]["trace_id"], type(exc).__name__)
        _set_status(d, status="failed", phase_message=env["error"].get("message", "Pipeline failed"),
                    finished_at=datetime.now(timezone.utc).isoformat(),
                    stages=_finish_stages(cur.get("stages", []), failed=True), error=classify_job_error(env["error"], done))
    finally:
        with _lock:
            _live.discard(opt_id)


def _ansys_stage_status(validation: dict | None) -> str:
    state = (validation or {}).get("state", "")
    job_status = str((validation or {}).get("job_status") or "").upper()
    if state.endswith("NOT_REQUESTED"):
        return "not_requested"
    if state == "NO_ELIGIBLE_DESIGN":
        return "skipped"
    if state.endswith("UNAVAILABLE"):
        return "unavailable"
    if state.endswith("FAILED") or job_status in ("FAILED", "TIMEOUT", "CANCELLED"):
        return "failed"
    if state == "VALIDATED_BY_ANSYS" or job_status == "COMPLETED":
        return "completed"
    return "queued"


def _queue(body: OptimizationBody, compat: dict, template_ids: list[str] | None, user: AuthenticatedUser,
           retry_of: str | None = None) -> str:
    try:
        snapshot = _materials(body.materials_snapshot_id)
    except Exception:                                               # noqa: BLE001
        return _err(422, ErrorCode.MISSING_REFERENCE, f"unknown material set '{body.materials_snapshot_id}'",
                    {"category": "invalid_input", "field": "materials_snapshot_id"})
    # Never trust a client-side compatibility result: re-check before anything expensive is queued.
    compat, refused, template_ids = _compat_gate(body.requirements.model_dump(mode="json"), body.template_id,
                                                 body.room_arrangement, snapshot, body.design_options.require_separate_rooms)
    if refused is not None:
        return refused
    opt_id = _queue(body, compat, template_ids, user)
    if idem is not None:
        _atomic(idem, json.dumps({"optimization_id": opt_id, "request_sha256": body_hash}))
    return {"optimization_id": opt_id, "status": "queued", "status_url": f"/api/v1/optimizations/{opt_id}",
            "template_catalog_version": compat["catalog_version"], "template_ids": template_ids or []}


@router.get("/optimizations")
def list_optimizations(user: AuthenticatedUser = Depends(require_user)):
    """Return persisted optimization runs, newest first."""
    items = []
    for d in settings.PIPELINE_RUNS_DIR.iterdir():
        if not d.is_dir() or not _OPT_ID.match(d.name):
            continue
        status_path = d / "status.json"
        if not status_path.is_file():
            continue
        try:
            st = json.loads(_read(status_path))
        except (OSError, ValueError):
            continue
        if not owns_run(user.id, d.name):
            continue
        items.append({
            "optimization_id": d.name,
            "project_id": st.get("project_id"),
            "status": st.get("status", "unknown"),
            "created_at": st.get("created_at"),
            "started_at": st.get("started_at"),
            "finished_at": st.get("finished_at"),
            "count": st.get("count"),
            "recommended_design_id": st.get("recommended_design_id"),
            "validation": st.get("validation"),
            "summary": st.get("summary"),
            "has_report": (d / "final_report.json").is_file(),
        })
    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"optimizations": items}

def _project_from_run(directory: Path, status: dict) -> dict | None:
    """Create the UI project view from the durable files for one optimization run."""
    project_id = status.get("project_id")
    if not project_id:
        return None
    try:
        request = json.loads(_read(directory / "request.json"))
    except (OSError, ValueError):
        request = {}
    requirements = request.get("requirements", {})
    site = requirements.get("site", {})
    mission = requirements.get("mission", {})
    report = {}
    report_path = directory / "final_report.json"
    if report_path.is_file():
        try:
            report = json.loads(_read(report_path))
        except (OSError, ValueError):
            pass
    design = report.get("design", {})
    materials = [assembly.get("name") or assembly.get("id") for assembly in design.get("assemblies", [])]
    custom_name = status.get("project_name") or status.get("name") or request.get("project_name") or request.get("name")
    return {
        "project_id": project_id,
        "name": custom_name,
        "project_name": custom_name,
        "optimization_id": status.get("optimization_id", directory.name),
        "status": status.get("status", "unknown"),
        "phase": status.get("phase"),
        "phase_message": status.get("phase_message"),
        "created_at": status.get("created_at"),
        "updated_at": status.get("updated_at"),
        "finished_at": status.get("finished_at"),
        "candidate_count": status.get("count"),
        "recommended_design_id": status.get("recommended_design_id"),
        "validation": status.get("validation"),
        "has_report": report_path.is_file(),
        "site": {key: site.get(key) for key in ("latitude_deg", "longitude_deg", "elevation_m")},
        "mission": {key: mission.get(key) for key in ("type", "occupants", "target_temperature_c")},
        "design": {"template": design.get("template"), "floors": design.get("floors"), "materials": materials},
    }


@router.get("/projects")
def list_projects(user: AuthenticatedUser = Depends(require_user)):
    """Return the latest persisted optimization for every project."""
    projects: dict[str, dict] = {}
    for directory in settings.PIPELINE_RUNS_DIR.iterdir():
        if not directory.is_dir() or not _OPT_ID.match(directory.name):
            continue
        status_path = directory / "status.json"
        if not status_path.is_file():
            continue
        if not owns_run(user.id, directory.name):
            continue
        try:
            project = _project_from_run(directory, json.loads(_read(status_path)))
        except (OSError, ValueError):
            continue
        if project is None:
            continue
        previous = projects.get(project["project_id"])
        if previous is None or (project.get("created_at") or "") > (previous.get("created_at") or ""):
            projects[project["project_id"]] = project
    return {"projects": sorted(projects.values(), key=lambda project: project.get("created_at") or "", reverse=True)}


def _safe_remove_dir(d: Path) -> bool:
    """Safely remove a directory on Windows/OneDrive by stripping read-only attributes with retries."""
    import os
    import stat

    def _make_writable(path: str | Path):
        try:
            os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
        except Exception:
            pass

    def _on_error(func, path, exc_info):
        _make_writable(path)
        try:
            func(path)
        except Exception:
            pass

    if not d.exists():
        return True

    for _ in range(4):
        try:
            for root, dirs, files in os.walk(d):
                for dir_name in dirs:
                    _make_writable(os.path.join(root, dir_name))
                for file_name in files:
                    _make_writable(os.path.join(root, file_name))
            _make_writable(d)
            shutil.rmtree(d, onexc=_on_error)
            if not d.exists():
                return True
        except Exception:
            time.sleep(0.08)

    try:
        shutil.rmtree(d, ignore_errors=True)
    except Exception:
        pass
    return not d.exists()


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    """Delete all persisted optimization runs associated with a project."""
    matched_dirs: list[Path] = []
    matched_opt_ids: list[str] = []
    for directory in settings.PIPELINE_RUNS_DIR.iterdir():
        if not directory.is_dir() or not _OPT_ID.match(directory.name):
            continue
        cur_proj_id = None
        status_path = directory / "status.json"
        if status_path.is_file():
            try:
                st = json.loads(_read(status_path))
                cur_proj_id = st.get("project_id")
            except Exception:
                pass
        if not cur_proj_id:
            req_path = directory / "request.json"
            if req_path.is_file():
                try:
                    req_data = json.loads(_read(req_path))
                    cur_proj_id = req_data.get("requirements", {}).get("project_id")
                except Exception:
                    pass
        if cur_proj_id == project_id or directory.name == project_id:
            matched_dirs.append(directory)
            matched_opt_ids.append(directory.name)

    if not matched_dirs:
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown project '{project_id}'")

    with _lock:
        for opt_id in matched_opt_ids:
            _live.discard(opt_id)

    idem_dir = settings.PIPELINE_RUNS_DIR / "_idempotency"
    if idem_dir.is_dir():
        for f in idem_dir.glob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                if data.get("optimization_id") in matched_opt_ids:
                    f.unlink(missing_ok=True)
            except Exception:
                pass

    for d in matched_dirs:
        _safe_remove_dir(d)

    return {"deleted": True, "project_id": project_id, "deleted_runs_count": len(matched_dirs), "deleted_optimizations": matched_opt_ids}


class RenameProjectBody(BaseModel):
    name: str


@router.patch("/projects/{project_id}")
@router.put("/projects/{project_id}/rename")
def rename_project(project_id: str, body: RenameProjectBody):
    """Update custom name for a project across all its runs."""
    new_name = body.name.strip()
    if not new_name:
        return _err(422, ErrorCode.VALIDATION_ERROR, "Project name cannot be empty")
    updated = 0
    for directory in settings.PIPELINE_RUNS_DIR.iterdir():
        if not directory.is_dir() or not _OPT_ID.match(directory.name):
            continue
        status_path = directory / "status.json"
        if status_path.is_file():
            try:
                st = json.loads(_read(status_path))
                if st.get("project_id") == project_id or directory.name == project_id:
                    st["project_name"] = new_name
                    st["name"] = new_name
                    _atomic(status_path, json.dumps(st, indent=2))
                    updated += 1
            except Exception:
                pass
    if updated == 0:
        return _err(404, ErrorCode.MISSING_REFERENCE, f"Project '{project_id}' not found")
    return {"success": True, "project_id": project_id, "name": new_name}


def _phase(st: dict) -> str:
    """One word for the job's position in the pipeline; derived from status and the recorded stages only."""
    status = st.get("status")
    if status == "queued":
        return "queued"
    if status == "failed":
        return "failed"
    stages = {s["id"]: s["status"] for s in st.get("stages", [])}
    if status == "running":
        running = next((s["id"] for s in st.get("stages", []) if s["status"] == "running"), None)
        return {"weather": "generating", "generation": "generating", "simulation": "simulation",
                "economics": "simulation", "optimization": "optimization", "ansys": "ansys_validation",
                "report": "finalizing"}.get(running or "", "running")
    if status == "completed":
        ansys = stages.get("ansys")
        if ansys in ("queued", "running"):
            return "ansys_validation"
        gen = st.get("generation") or {}
        if ansys in ("failed", "unavailable") or gen.get("complete") is False:
            return "partially_completed"
        return "completed"
    return status or "unknown"


def _live_ansys(st: dict) -> dict | None:
    """Current M8 status of the job's ANSYS run, read from the M8 job folder (None if not requested or unreadable)."""
    job_id = (st.get("validation") or {}).get("job_id")
    if not job_id:
        return None
    try:
        from . import ansys as ansys_routes
        if ansys_routes.IMPORT_ERROR is not None:
            return {"job_id": job_id, "status": "UNAVAILABLE"}
        jd = Path(settings.ANSYS_PIPELINE_DIR) / "jobs" / job_id       # where cocoon_pipeline.ansys_hook queues jobs
        if not jd.is_dir():
            jd = ansys_routes._job_dir(job_id)
        res = ansys_routes.read_status(jd).model_dump(mode="json")
        return {"job_id": job_id, "status": res.get("status"), "design_revision_id": res.get("design_revision_id"),
                "error_reason": res.get("error_reason")}
    except Exception:                                               # noqa: BLE001
        log.exception("could not read ANSYS status for %s", job_id)
        return None


def _status(opt_id: str):
    d = _run_dir(opt_id)
    if d is None:
        return None, None
    status_file = d / "status.json"
    if status_file.is_file():
        st = json.loads(_read(status_file))
    elif (d / "final_report.json").is_file():
        st = {"optimization_id": opt_id, "status": "completed", "count": 1, "recommended_design_id": "des_recommended"}
    else:
        return None, None
    with _lock:
        alive = opt_id in _live
    if st.get("status") in ("queued", "running") and not alive:        # the server restarted while it was running
        st = _set_status(d, status="failed", stages=_finish_stages(st.get("stages", []), failed=True),
                         error=envelope(ErrorCode.VALIDATION_ERROR, "The job was interrupted by a server restart. "
                                        "Your inputs are unchanged; it can be retried.", category="temporary_failure",
                                        details={"m6_code": "INTERRUPTED"}, retryable=True)["error"])
    live = _live_ansys(st) if st.get("status") == "completed" else None
    if live is not None:
        st = {**st, "ansys": live}
        stages = [dict(s) for s in st.get("stages", [])]
        for s in stages:
            if s["id"] == "ansys":
                s["status"] = {"QUEUED": "queued", "RUNNING": "running", "COMPLETED": "completed",
                               "UNAVAILABLE": "unavailable"}.get(str(live.get("status")), "failed")
        st["stages"] = stages
    return d, {**st, "phase": _phase(st)}


@router.get("/optimizations/{optimization_id}")
def get_optimization(optimization_id: str, _: AuthenticatedUser = Depends(require_owned_run)):
    d, st = _status(optimization_id)
    if d is None:
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    if st["status"] == "completed" and (d / "result.json").is_file():
        return {**st, "result": json.loads(_read(d / "result.json"))}
    return st


@router.post("/optimizations/{optimization_id}/retry", status_code=201)
def retry_optimization(optimization_id: str, response: Response,
                       user: AuthenticatedUser = Depends(require_owned_run)):
    """Re-run a failed job from its stored request. One retry per failed job: a repeated call returns the same new job.

    The request is re-validated against the current template catalogue. ANSYS is re-requested only if no M8 job was
    submitted while the failed job ran, so a retry never starts a second solve of the same revision.
    """
    d, st = _status(optimization_id)
    if d is None:
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    if st["status"] != "failed":
        return _err(409, ErrorCode.VALIDATION_ERROR, f"only a failed job can be retried; this one is {st['status']}",
                    {"status": st["status"]})
    if st.get("retried_as"):
        response.status_code = 200
        return {"optimization_id": st["retried_as"], "status_url": f"/api/v1/optimizations/{st['retried_as']}",
                "replayed": True}
    category = ((st.get("error") or {}).get("details") or {}).get("category")
    if category in ("invalid_input", "no_compatible_template", "physical_infeasibility", "no_feasible_candidates"):
        return _err(409, ErrorCode.VALIDATION_ERROR, "This job failed because of its requirements; running it again "
                    "would fail the same way. Change the requirements and generate again.", {"category": category})
    body = OptimizationBody.model_validate_json(_read(d / "request.json"))
    notes = []
    if body.validate_with_ansys and _ansys_submitted_during(st):
        body = body.model_copy(update={"validate_with_ansys": False})
        notes.append("ANSYS validation was already submitted by the failed job, so it is not requested again; "
                     "check it on the design's validation tab.")
    compat, refused, template_ids = _compat_gate(body.requirements.model_dump(mode="json"), body.template_id,
                                                 body.room_arrangement, _materials(body.materials_snapshot_id),
                                                 body.design_options.require_separate_rooms)
    if refused is not None:
        return refused
    new_id = _queue(body, compat, template_ids, user, retry_of=optimization_id)
    _set_status(d, retried_as=new_id)
    return {"optimization_id": new_id, "status": "queued", "status_url": f"/api/v1/optimizations/{new_id}",
            "retry_of": optimization_id, "notes": notes}


def _ansys_submitted_during(st: dict) -> bool:
    """Conservative: any M8 job submitted between this job's start and end counts (it may belong to this job)."""
    start, end = st.get("started_at"), st.get("finished_at") or st.get("updated_at")
    if not start:
        return False
    lo, hi = datetime.fromisoformat(start), datetime.fromisoformat(end)
    for req in (Path(settings.ANSYS_PIPELINE_DIR) / "jobs").glob("ans_*/request.json"):
        try:
            submitted = datetime.fromisoformat(json.loads(req.read_text(encoding="utf-8"))["submitted_at"])
            if submitted.tzinfo is None:
                submitted = submitted.replace(tzinfo=timezone.utc)
        except Exception:                                           # noqa: BLE001
            return True                                             # unreadable: assume it may be ours
        if lo <= submitted <= hi:
            return True
    return False


@router.delete("/optimizations/{optimization_id}")
def delete_optimization(optimization_id: str):
    """Delete a persisted optimization run and all its associated artifacts."""
    d = _run_dir(optimization_id)
    if d is None or not d.is_dir():
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    with _lock:
        _live.discard(optimization_id)
    idem_dir = settings.PIPELINE_RUNS_DIR / "_idempotency"
    if idem_dir.is_dir():
        for f in idem_dir.glob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                if data.get("optimization_id") == optimization_id:
                    f.unlink(missing_ok=True)
            except Exception:
                pass
    success = _safe_remove_dir(d)
    if not success and d.exists():
        return _err(500, ErrorCode.VALIDATION_ERROR, f"failed to delete optimization directory '{optimization_id}'")
    return {"deleted": True, "optimization_id": optimization_id}


def _result(optimization_id: str):
    d, st = _status(optimization_id)
    if d is None:
        return None, _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    if st["status"] != "completed" or not (d / "result.json").is_file():
        return None, _err(409, ErrorCode.VALIDATION_ERROR, f"optimization is {st['status']}, not completed",
                          {"status": st["status"]}, retryable=st["status"] in ("queued", "running"))
    return d, json.loads(_read(d / "result.json"))


@router.get("/optimizations/{optimization_id}/candidates")
def get_candidates(optimization_id: str, _: AuthenticatedUser = Depends(require_owned_run)):
    d, res = _result(optimization_id)
    if d is None:
        return res
    prov_path = d / "provenance.json"
    provenance = {p["design_id"]: p for p in json.loads(_read(prov_path))} if prov_path.is_file() else {}
    return {"optimization_id": optimization_id, "recommended_design_id": res["recommended_design_id"],
            "validation": res["validation"], "generation": res["optimization"].get("generation"),
            "candidates": [{**o, "provenance": provenance.get(o["design_id"])} for o in res["optimization"]["outcomes"]]}


@router.get("/optimizations/{optimization_id}/pareto")
def get_pareto(optimization_id: str, _: AuthenticatedUser = Depends(require_owned_run)):
    d, res = _result(optimization_id)
    if d is None:
        return res
    return {"optimization_id": optimization_id, "pareto": res["optimization"]["pareto"], "picks": res["optimization"]["picks"]}


@router.get("/optimizations/{optimization_id}/designs/{design_id}")
def get_design(optimization_id: str, design_id: str, _: AuthenticatedUser = Depends(require_owned_run)):
    d, st = _status(optimization_id)
    if d is None or not _DESIGN_ID.match(design_id):
        return _err(404, ErrorCode.MISSING_REFERENCE, "unknown optimization or design")
    p = (d / "candidates" / f"{design_id}.building.json").resolve()
    try:
        p.relative_to(d.resolve())
    except ValueError:
        return _err(404, ErrorCode.MISSING_REFERENCE, "unknown design")
    if not p.is_file():
        return _err(404, ErrorCode.MISSING_REFERENCE, f"design '{design_id}' not found in this optimization")
    return json.loads(p.read_text(encoding="utf-8"))


@router.get("/optimizations/{optimization_id}/report")
def get_report(optimization_id: str, _: AuthenticatedUser = Depends(require_owned_run)):
    """The recommended design's full final_design_report.json — DRDO Task 1/2/3 objectives, economics
    (NPV/payback/LCC), materials/assembly breakdown, ANSYS validation state. Written by
    cocoon_pipeline.finalize.build_final_report; absent until the run completes (cfg.final_report=True)."""
    d, st = _status(optimization_id)
    if d is None:
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    p = d / "final_report.json"
    if not p.is_file():
        return _err(409, ErrorCode.VALIDATION_ERROR, f"optimization is {st['status']}, report not ready",
                    {"status": st["status"]}, retryable=st["status"] in ("queued", "running"))
    return json.loads(_read(p))


_TIMESERIES_NAMES = {"conditioned", "free_floating", "baseline_conditioned"}


@router.get("/optimizations/{optimization_id}/timeseries")
def get_optimization_timeseries(optimization_id: str, which: str = "conditioned", _: AuthenticatedUser = Depends(require_owned_run)):
    """Hourly (15-minute) ambient + per-zone temperature/heating/solar series for the recommended design,
    parsed from cocoon_pipeline.finalize.write_timeseries's CSV. `which` is conditioned (default; sized
    heater), free_floating (no heater), or baseline_conditioned (uninsulated GS-10-style reference)."""
    if which not in _TIMESERIES_NAMES:
        return _err(422, ErrorCode.VALIDATION_ERROR, f"which must be one of {sorted(_TIMESERIES_NAMES)}")
    d, st = _status(optimization_id)
    if d is None:
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    p = d / "recommended" / f"timeseries_{which}.csv"
    if not p.is_file():
        return _err(409, ErrorCode.VALIDATION_ERROR, f"optimization is {st['status']}, timeseries not ready",
                    {"status": st["status"]}, retryable=st["status"] in ("queued", "running"))
    import csv as _csv
    import io as _io
    rows = list(_csv.DictReader(_io.StringIO(_read(p))))
    zone_ids = sorted({k[:-len("_temp_c")] for k in (rows[0].keys() if rows else []) if k.endswith("_temp_c")})
    points = []
    for r in rows:
        points.append({
            "timestamp": r["timestamp"], "ambient_c": float(r["ambient_c"]),
            "zone_temp_c": {z: float(r[f"{z}_temp_c"]) for z in zone_ids},
            "zone_heating_w": {z: float(r[f"{z}_heating_w"]) for z in zone_ids},
            "zone_solar_w": {z: float(r[f"{z}_solar_w"]) for z in zone_ids},
        })
    return {"which": which, "zone_ids": zone_ids, "points": points}
