"""
backend/main.py — the COCOON API service.

    uvicorn backend.main:app --reload --port 8000

Run from the repo root so `python run_pipeline.py ...` resolves.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import settings
from .jobs import sweep_old_runs
from .routes import ansys, reference, run

app = FastAPI(title="COCOON API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

app.include_router(reference.router)
app.include_router(run.router)
app.include_router(ansys.router)


@app.on_event("startup")
def _startup() -> None:
    removed = sweep_old_runs()
    if removed:
        print(f"[startup] swept {removed} stale run folder(s)")


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "runs_dir": str(settings.RUNS_DIR),
        "pipeline": settings.PIPELINE_SCRIPT.exists(),
        "max_workers": settings.MAX_WORKERS,
        "ansys": {
            "available": ansys.IMPORT_ERROR is None,
            "unavailable_reason": ansys.IMPORT_ERROR,
            "jobs_dir": str(settings.ANSYS_JOBS_DIR),
            "max_ansys_workers": settings.MAX_ANSYS_WORKERS,
            "cases_available": settings.ANSYS_CASES_DIR.exists(),
        },
    }
