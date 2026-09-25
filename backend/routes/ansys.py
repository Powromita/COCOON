"""
backend/routes/ansys.py — Module M8 integration surface (PRD §16.5).

Exposes ansys-pipeline/cocoon_ansys over HTTP so the frontend (M11), mobile
(M12) and other backend routes (M9) can submit an exact BuildingModel
revision for independent ANSYS validation and poll it, without depending
on the ansys-pipeline CLI.

A submit call freezes the package and returns the job_id immediately
(§21.1: never block the request thread on the solve); a background thread
runs the actual MAPDL solve, bounded by COCOON_MAX_ANSYS_WORKERS concurrent
solves (default 1 — one ANSYS Student session at a time, matching the
single-machine submission deployment in PRD §25.1).

If ansys-mapdl-core or ANSYS itself is not available, the job still queues
and runs to a genuine UNAVAILABLE status (cocoon_ansys.worker.run_job
handles this) — no result is ever faked (PRD §14.9, §23.2).

M2 (the requirement/layout generator) does not exist yet, so there is no
endpoint yet that produces a BuildingModel from mission requirements. Until
it does, POST /jobs accepts either an inline BuildingModel or a `case` name
from GET /cases (the M8 evidence fixtures) so other modules can integrate
and test against real multi-room geometry today.
"""

import json
import sys
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .. import settings

sys.path.insert(0, str(settings.ANSYS_PIPELINE_DIR))

# The M8 stack pulls in the RC engine and the M0 contracts. If any of that
# can't be imported (e.g. an upstream module changed underneath it), the
# ANSYS endpoints report 503 with the real reason instead of the import
# error taking the whole API down at startup. IMPORT_ERROR is also surfaced
# by /api/health so capability reporting stays truthful (PRD §16.1).
try:
    from cocoon_ansys.contracts_io import (
        BuildingModel, MaterialSnapshot, WeatherSnapshot)
    from cocoon_ansys.validation_package import create_package
    from cocoon_ansys.worker import (
        cancel as _cancel_job, latest_status, read_status, run_job)
    from cocoon_contracts import AnsysSolverConfig
    IMPORT_ERROR: str | None = None
except Exception as _exc:                                       # noqa: BLE001
    IMPORT_ERROR = f"{type(_exc).__name__}: {_exc}"

router = APIRouter(prefix="/api/ansys", tags=["ansys"])


def _require_available() -> None:
    if IMPORT_ERROR is not None:
        raise HTTPException(503, {"error": "ANSYS validation is unavailable on this server",
                                  "status": "UNAVAILABLE", "error_reason": IMPORT_ERROR})
_sem = threading.Semaphore(settings.MAX_ANSYS_WORKERS)

DEFAULT_WEATHER = settings.ANSYS_CASES_DIR / "wx_leh_20260124T11_48h.json"
DEFAULT_MATERIALS = settings.ANSYS_CASES_DIR / "materials_m0_standard.json"


class SubmitBody(BaseModel):
    building: dict | None = Field(default=None, description="M0 BuildingModel, inline")
    case: str | None = Field(default=None, description="name from GET /api/ansys/cases, "
                             "instead of an inline 'building'")
    weather: dict | None = Field(default=None, description="M0 WeatherSnapshot; default is "
                                 "the frozen 48h coldest-window Leh snapshot")
    materials: dict | None = Field(default=None, description="M0 MaterialSnapshot; default "
                                   "is the standard material set")
    hours: int | None = Field(default=None, gt=0, description="truncate the weather window "
                              "(e.g. for a fast smoke test); omit for the full snapshot")
    element_size_m: float = Field(default=0.25, gt=0, le=1.0)
    substeps_per_hour: int = Field(default=4, ge=1, le=20)
    timeout_seconds: int = Field(default=3600, gt=0, le=21600)
    initial_temperature_c: float = 10.0
    priority: int = Field(default=0, ge=0, le=1)


def _job_dir(job_id: str) -> Path:
    """Resolved-path containment (PRD §15.5), not a string-prefix check."""
    base = settings.ANSYS_JOBS_DIR.resolve()
    jd = (settings.ANSYS_JOBS_DIR / job_id).resolve()
    try:
        jd.relative_to(base)
    except ValueError:
        raise HTTPException(404, "unknown job_id")
    if not jd.is_dir():
        raise HTTPException(404, "unknown job_id")
    return jd


def _run_in_background(job_dir: Path) -> None:
    def _target():
        with _sem:
            run_job(job_dir)
    threading.Thread(target=_target, daemon=True).start()


def _load_contract(model_cls, inline, default_path, what):
    if inline is not None:
        try:
            return model_cls.model_validate(inline)
        except Exception as exc:                               # noqa: BLE001
            raise HTTPException(422, {"error": f"invalid {what}", "detail": str(exc)})
    if default_path.exists():
        return model_cls.model_validate_json(default_path.read_text(encoding="utf-8"))
    raise HTTPException(422, f"provide '{what}' (no default snapshot bundled)")


@router.get("/cases")
def list_cases():
    """Demo/dev BuildingModels (the M8 evidence fixtures) usable in POST
    /jobs via {"case": "<name>"} without needing M2 yet."""
    cases = sorted(p.stem for p in settings.ANSYS_CASES_DIR.glob("case_*.json"))
    return {"cases": {name: f"/api/ansys/cases/{name}" for name in cases}}


@router.get("/cases/{name}")
def get_case(name: str):
    if ".." in name or "/" in name or "\\" in name:
        raise HTTPException(404, "unknown case")
    p = settings.ANSYS_CASES_DIR / f"{name}.json"
    if not p.is_file():
        raise HTTPException(404, "unknown case")
    return JSONResponse(json.loads(p.read_text(encoding="utf-8")))


@router.post("/jobs", status_code=201)
def submit_job(body: SubmitBody):
    _require_available()
    if body.case:
        if ".." in body.case or "/" in body.case or "\\" in body.case:
            raise HTTPException(422, f"invalid case name '{body.case}'")
        case_path = settings.ANSYS_CASES_DIR / f"{body.case}.json"
        if not case_path.is_file():
            raise HTTPException(422, f"unknown case '{body.case}'; see GET /api/ansys/cases")
        building = BuildingModel.model_validate_json(case_path.read_text(encoding="utf-8"))
    elif body.building is not None:
        building = _load_contract(BuildingModel, body.building, None, "building")
    else:
        raise HTTPException(422, "provide either 'case' or 'building'")

    weather = _load_contract(WeatherSnapshot, body.weather, DEFAULT_WEATHER, "weather")
    if body.hours:
        weather = weather.model_copy(update={"hourly_data": weather.hourly_data[:body.hours]})
    materials = _load_contract(MaterialSnapshot, body.materials, DEFAULT_MATERIALS, "materials")

    cfg = AnsysSolverConfig(element_size_m=body.element_size_m, element_type="SOLID70",
                            substeps_min=body.substeps_per_hour,
                            substeps_max=body.substeps_per_hour,
                            timeout_seconds=body.timeout_seconds)
    try:
        req, job_dir = create_package(building, weather, materials, cfg,
                                      jobs_root=settings.ANSYS_JOBS_DIR,
                                      initial_temperature_c=body.initial_temperature_c,
                                      priority=body.priority)
    except Exception as exc:                                    # noqa: BLE001
        raise HTTPException(422, {"error": "could not build a valid validation package",
                                  "detail": str(exc)})

    _run_in_background(job_dir)
    return {"job_id": req.job_id, "status": "QUEUED",
           "design_revision_id": req.design_revision_id,
           "status_url": f"/api/ansys/jobs/{req.job_id}"}


@router.get("/jobs")
def list_jobs(limit: int = 50):
    _require_available()
    limit = max(1, min(limit, 200))
    rows = sorted(settings.ANSYS_JOBS_DIR.glob("ans_*/status.json"),
                 key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    return {"jobs": [read_status(p.parent).model_dump(mode="json") for p in rows]}


@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    jd = _job_dir(job_id)
    _require_available()
    return JSONResponse(read_status(jd).model_dump(mode="json"))


@router.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    jd = _job_dir(job_id)
    _require_available()
    try:
        return JSONResponse(_cancel_job(jd).model_dump(mode="json"))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.get("/jobs/{job_id}/artifacts")
def job_artifacts(job_id: str):
    jd = _job_dir(job_id)
    _require_available()
    st = read_status(jd)
    if st.status.value != "COMPLETED" or not st.artifacts:
        raise HTTPException(409, {"status": st.status.value, "error_reason": st.error_reason})
    base = f"/api/ansys/jobs/{job_id}/artifact/"
    return {"artifacts": {k: base + v for k, v in st.artifacts.artifacts.items()},
           "checksums_sha256": st.artifacts.checksums_sha256}


@router.get("/jobs/{job_id}/artifact/{path:path}")
def job_artifact(job_id: str, path: str):
    jd = _job_dir(job_id)
    target = (jd / path).resolve()
    try:
        target.relative_to(jd)
    except ValueError:
        raise HTTPException(404, "artifact not found")
    if not target.is_file():
        raise HTTPException(404, "artifact not found")
    return FileResponse(target, filename=target.name)


@router.get("/revisions/{revision_id}/latest")
def revision_latest(revision_id: str):
    """The latest job for a design revision, or NOT_REQUESTED (PRD §22.2) —
    never a substituted benchmark."""
    _require_available()
    return latest_status(revision_id, settings.ANSYS_JOBS_DIR)
