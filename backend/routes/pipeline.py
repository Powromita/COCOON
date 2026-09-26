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

Optimisation jobs run on a bounded thread pool, never on the request thread (PRD §21.1). Job status and results
are files, so a restart does not lose history; a job that was `running` when the server died is reported as
`failed` (interrupted) rather than left running forever. Errors use the M0 ErrorEnvelope.
AUTH_MODE is disabled in this build (local development).
"""

import hashlib
import json
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import APIRouter, Header, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from cocoon_contracts import (BuildingModel, ErrorCode, ErrorDetail, ErrorEnvelope, RequirementsContract,
                              SimulationEngineMode, SimulationResult)
from design_generator import generate_designs, to_error_envelope as m2_envelope
from economics.provider import DEFAULT_ASSUMPTIONS_DIR
from m3_data import WeatherError, WeatherStore, extended_snapshot, load_snapshot, standard_snapshot
from m4_engine import ENGINE_NAME, ENGINE_VERSION, M4Error, M4Evaluator
from optimization import OptimizationSettings, to_error_envelope as m6_envelope

from .. import settings

router = APIRouter(prefix="/api/v1", tags=["pipeline"])
_OPT_ID = re.compile(r"^opt_[0-9a-f]{12}$")
_SIM_ID = re.compile(r"^sim_[0-9a-f]{12}$")
_DESIGN_ID = re.compile(r"^des_[A-Za-z0-9_]+$")
_pool = ThreadPoolExecutor(max_workers=settings.MAX_PIPELINE_JOBS, thread_name_prefix="cocoon-opt")
_live: set[str] = set()
_lock = threading.Lock()


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
        "schema_versions": ["4.0"], "auth_mode": "disabled",
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


@router.post("/generate-designs")
def generate(body: GenerateBody):
    try:
        res = generate_designs(body.requirements, _materials(body.materials_snapshot_id), seed=body.seed, count=body.count)
    except Exception as exc:                                        # noqa: BLE001
        env = m2_envelope(exc)
        return JSONResponse(status_code=422, content=env.model_dump(mode="json"))
    return {"requested": res.requested, "generated": len(res.candidates), "complete": res.complete,
            "attempts": res.attempts, "rejection_reasons": dict(res.reasons),
            "candidates": [{"design_id": c.building.design_id, "revision_id": c.building.revision_id,
                            "extras": c.extras, "building": c.building.model_dump(mode="json")} for c in res.candidates]}


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
class OptimizationBody(BaseModel):
    requirements: RequirementsContract
    count: int = Field(default=20, ge=1, le=200)
    seed: int = 42
    site: str | None = None
    materials_snapshot_id: str | None = None
    validate_with_ansys: bool = False
    baseline_economics: bool = True


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
    p = d / "status.json"
    cur = json.loads(_read(p)) if p.exists() else {}
    cur.update(fields)
    cur["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic(p, json.dumps(cur, indent=1))
    return cur


def _job(opt_id: str, body: OptimizationBody) -> None:
    from cocoon_pipeline import PipelineConfig, run_pipeline
    d = _run_dir(opt_id)
    _set_status(d, status="running", started_at=datetime.now(timezone.utc).isoformat())
    try:
        cfg = PipelineConfig(seed=body.seed, count=body.count, site=body.site, materials=_materials(body.materials_snapshot_id),
                             baseline_economics=body.baseline_economics, persist=True, run_id=opt_id,
                             runs_dir=settings.PIPELINE_RUNS_DIR,
                             ansys="submit" if body.validate_with_ansys else "not_requested",
                             optimization=OptimizationSettings())
        result = run_pipeline(body.requirements, cfg)
        _set_status(d, status="completed", finished_at=datetime.now(timezone.utc).isoformat(),
                    recommended_design_id=result.recommended_design_id, validation=result.validation,
                    summary=result.optimization.summary(), timings_s=result.timings_s)
    except Exception as exc:                                        # noqa: BLE001
        env = m6_envelope(exc).model_dump(mode="json")
        _set_status(d, status="failed", finished_at=datetime.now(timezone.utc).isoformat(), error=env["error"])
    finally:
        with _lock:
            _live.discard(opt_id)


@router.post("/optimizations", status_code=201)
def create_optimization(body: OptimizationBody, response: Response,
                        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    body_hash = hashlib.sha256(body.model_dump_json().encode("utf-8")).hexdigest()
    idem = None
    if idempotency_key:
        idem_dir = settings.PIPELINE_RUNS_DIR / "_idempotency"
        idem_dir.mkdir(exist_ok=True)
        idem = idem_dir / (hashlib.sha256(idempotency_key.encode()).hexdigest() + ".json")
        if idem.exists():
            seen = json.loads(idem.read_text(encoding="utf-8"))
            if seen["request_sha256"] != body_hash:
                return _err(409, ErrorCode.VALIDATION_ERROR, "Idempotency-Key was already used with a different request body")
            response.status_code = 200
            return {"optimization_id": seen["optimization_id"], "status_url": f"/api/v1/optimizations/{seen['optimization_id']}",
                    "replayed": True}
    opt_id = "opt_" + uuid.uuid4().hex[:12]
    d = _run_dir(opt_id)
    d.mkdir(parents=True)
    _atomic(d / "request.json", body.model_dump_json(indent=1))
    _set_status(d, status="queued", optimization_id=opt_id, created_at=datetime.now(timezone.utc).isoformat(),
                project_id=body.requirements.project_id, count=body.count, seed=body.seed)
    if idem is not None:
        _atomic(idem, json.dumps({"optimization_id": opt_id, "request_sha256": body_hash}))
    with _lock:
        _live.add(opt_id)
    _pool.submit(_job, opt_id, body)
    return {"optimization_id": opt_id, "status": "queued", "status_url": f"/api/v1/optimizations/{opt_id}"}


def _status(opt_id: str):
    d = _run_dir(opt_id)
    if d is None or not (d / "status.json").is_file():
        return None, None
    st = json.loads(_read(d / "status.json"))
    with _lock:
        alive = opt_id in _live
    if st.get("status") in ("queued", "running") and not alive:        # the server restarted while it was running
        st = _set_status(d, status="failed", error={"code": "VALIDATION_ERROR", "message": "job interrupted by a server restart",
                                                    "details": {}, "retryable": True})
    return d, st


@router.get("/optimizations/{optimization_id}")
def get_optimization(optimization_id: str):
    d, st = _status(optimization_id)
    if d is None:
        return _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    if st["status"] == "completed" and (d / "result.json").is_file():
        return {**st, "result": json.loads(_read(d / "result.json"))}
    return st


def _result(optimization_id: str):
    d, st = _status(optimization_id)
    if d is None:
        return None, _err(404, ErrorCode.MISSING_REFERENCE, f"unknown optimization '{optimization_id}'")
    if st["status"] != "completed" or not (d / "result.json").is_file():
        return None, _err(409, ErrorCode.VALIDATION_ERROR, f"optimization is {st['status']}, not completed",
                          {"status": st["status"]}, retryable=st["status"] in ("queued", "running"))
    return d, json.loads(_read(d / "result.json"))


@router.get("/optimizations/{optimization_id}/candidates")
def get_candidates(optimization_id: str):
    d, res = _result(optimization_id)
    if d is None:
        return res
    return {"optimization_id": optimization_id, "recommended_design_id": res["recommended_design_id"],
            "validation": res["validation"], "candidates": res["optimization"]["outcomes"]}


@router.get("/optimizations/{optimization_id}/pareto")
def get_pareto(optimization_id: str):
    d, res = _result(optimization_id)
    if d is None:
        return res
    return {"optimization_id": optimization_id, "pareto": res["optimization"]["pareto"], "picks": res["optimization"]["picks"]}


@router.get("/optimizations/{optimization_id}/designs/{design_id}")
def get_design(optimization_id: str, design_id: str):
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
