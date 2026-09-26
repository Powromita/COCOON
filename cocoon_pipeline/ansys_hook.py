"""
ansys_hook.py - hand the recommended revision to the M8 worker, or say honestly why that is not possible.

Importing cocoon_pipeline never needs ANSYS: cocoon_ansys is imported here, on demand. If it (or PyMAPDL) cannot be
imported, the answer is an UNAVAILABLE validation state with the reason, never a made-up result (PRD 14.9, 23.2).
The job is the same frozen package the /api/ansys/jobs route builds: same building revision, the same weather
snapshot the RC engine used, the same materials. RC results are never passed to ANSYS.
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
ANSYS_PIPELINE_DIR = REPO_ROOT / "ansys-pipeline"
ANSYS_JOBS_DIR = ANSYS_PIPELINE_DIR / "jobs"

_one_solve_at_a_time = threading.Semaphore(1)         # one ANSYS Student session (PRD 14.2)

STATE_QUEUED = "RC_ONLY_ANSYS_QUEUED"
STATE_UNAVAILABLE = "RC_ONLY_ANSYS_UNAVAILABLE"


def submit(building: Any, weather: Any, materials: Any, jobs_dir: Path | None = None, wait: bool = False) -> dict[str, Any]:
    """Freeze a validation package for `building`; solve in the background, or block until done when wait=True."""
    try:
        if str(ANSYS_PIPELINE_DIR) not in sys.path:
            sys.path.insert(0, str(ANSYS_PIPELINE_DIR))
        from cocoon_ansys.validation_package import create_package
        from cocoon_ansys.worker import run_job
    except Exception as exc:                                        # noqa: BLE001
        return {"state": STATE_UNAVAILABLE, "job_id": None, "reason": f"{type(exc).__name__}: {exc}"}
    try:
        req, job_dir = create_package(building, weather, materials, jobs_root=jobs_dir or ANSYS_JOBS_DIR)
    except Exception as exc:                                        # noqa: BLE001
        return {"state": STATE_UNAVAILABLE, "job_id": None, "reason": f"could not build a validation package: {exc}"}

    def _target() -> None:
        with _one_solve_at_a_time:
            run_job(job_dir)

    if wait:
        try:
            _target()
        except Exception as exc:                                    # noqa: BLE001
            return {"state": STATE_QUEUED, "job_id": req.job_id, "job_dir": str(job_dir), "job_status": "FAILED",
                    "error_reason": f"{type(exc).__name__}: {exc}", "reason": None}
        from cocoon_ansys.worker import read_status
        st = read_status(job_dir)
        return {"state": STATE_QUEUED, "job_id": req.job_id, "job_dir": str(job_dir), "design_revision_id": req.design_revision_id,
                "job_status": str(getattr(st.status, "value", st.status)), "error_reason": getattr(st, "error_reason", None),
                "reason": None}

    threading.Thread(target=_target, daemon=True, name=f"cocoon-ansys-{req.job_id}").start()
    return {"state": STATE_QUEUED, "job_id": req.job_id, "design_revision_id": req.design_revision_id,
            "status_url": f"/api/ansys/jobs/{req.job_id}", "reason": None}
