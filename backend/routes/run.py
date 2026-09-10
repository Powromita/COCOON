import json

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError


class ValidationFailed(Exception):
    def __init__(self, errors: list[dict]):
        self.errors = errors

from .. import settings
from ..jobs import manager
from ..models import (OptimizeRunRequest, PipelineStatus, SingleRunRequest,
                      StartRunResponse)
from ..pipeline_bridge import new_run_id, prepare_run, read_status

router = APIRouter(prefix="/api/run", tags=["run"])

_MEDIA = {".png": "image/png", ".csv": "text/csv", ".md": "text/markdown",
          ".json": "application/json", ".txt": "text/plain"}


def _parse(body: dict):
    mode = body.get("mode")
    model = {"single": SingleRunRequest, "optimize": OptimizeRunRequest}.get(mode)
    if model is None:
        raise ValidationFailed([{"field": "mode", "message": "must be 'single' or 'optimize'"}])
    try:
        return model.model_validate(body)
    except ValidationError as e:
        raise ValidationFailed([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])


@router.post("", response_model=StartRunResponse, status_code=201)
@router.post("/", response_model=StartRunResponse, status_code=201, include_in_schema=False)
def start_run(body: dict = Body(...)):
    try:
        req = _parse(body)
    except ValidationFailed as vf:
        return JSONResponse(status_code=422, content={"errors": vf.errors})

    running = sum(1 for j in manager.list() if j.state in ("queued", "running"))
    if running >= settings.MAX_WORKERS * 4:
        raise HTTPException(429, "too many runs in flight, retry shortly")

    run_id = new_run_id()
    argv = prepare_run(run_id, req)
    manager.submit(run_id, req.mode, argv)
    return StartRunResponse(run_id=run_id)


def _run_dir(run_id: str):
    rd = settings.RUNS_DIR / run_id
    if not rd.is_dir() or ".." in run_id or "/" in run_id or "\\" in run_id:
        raise HTTPException(404, "unknown run_id")
    return rd


@router.get("/{run_id}/status", response_model=PipelineStatus)
def status(run_id: str) -> PipelineStatus:
    rd = _run_dir(run_id)
    job = manager.get(run_id)
    mode = job.mode if job else _infer_mode(rd)
    return read_status(run_id, mode,
                       proc_alive=manager.alive(run_id),
                       proc_returncode=manager.returncode(run_id))


@router.get("/{run_id}/results")
def results(run_id: str):
    rd = _run_dir(run_id)
    p = rd / "results.json"
    if not p.exists():
        job = manager.get(run_id)
        rc = manager.returncode(run_id)
        if job and job.state == "exited" and rc not in (None, 0):
            raise HTTPException(422, {"error": "pipeline failed",
                                      "hint": "see /status"})
        raise HTTPException(409, {"state": "running"})
    data = json.loads(p.read_text(encoding="utf-8"))
    data["report_md_url"] = f"/api/run/{run_id}/artifact/REPORT.md"
    return JSONResponse(data)


@router.get("/{run_id}/artifact/{path:path}")
def artifact(run_id: str, path: str):
    rd = _run_dir(run_id).resolve()
    target = (rd / path).resolve()
    if not str(target).startswith(str(rd)) or not target.is_file():
        raise HTTPException(404, "artifact not found")
    return FileResponse(target,
                        media_type=_MEDIA.get(target.suffix.lower(),
                                              "application/octet-stream"),
                        filename=target.name)


def _infer_mode(rd) -> str:
    rc = rd / "run_config.json"
    if rc.exists():
        try:
            return json.loads(rc.read_text()).get("mode", "single")
        except Exception:  # noqa: BLE001
            pass
    return "optimize" if (rd / "optimization_results.csv").exists() else "single"
