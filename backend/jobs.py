"""
backend/jobs.py — bounded pool of pipeline subprocesses.

One job == one `python run_pipeline.py <mode> --run-dir runs/<id> ...`
subprocess. The run folder is the datastore; this module only tracks
liveness so the status endpoint can tell "running" from "crashed".
"""

import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from . import settings


@dataclass
class Job:
    run_id: str
    mode: str
    argv: list[str]
    state: str = "queued"          # queued | running | exited
    returncode: int | None = None
    started_at: float | None = None
    proc: subprocess.Popen | None = field(default=None, repr=False)


class JobManager:
    def __init__(self, max_workers: int):
        self._sem = threading.Semaphore(max_workers)
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    # ---- public -----------------------------------------------------

    def submit(self, run_id: str, mode: str, argv: list[str]) -> Job:
        job = Job(run_id=run_id, mode=mode, argv=argv)
        with self._lock:
            self._jobs[run_id] = job
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return job

    def get(self, run_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(run_id)

    def alive(self, run_id: str) -> bool:
        j = self.get(run_id)
        return bool(j and j.state == "running")

    def returncode(self, run_id: str) -> int | None:
        j = self.get(run_id)
        return j.returncode if j else None

    def list(self) -> list[Job]:
        with self._lock:
            return list(self._jobs.values())

    # ---- internal ------------------------------------------------

    def _run(self, job: Job) -> None:
        with self._sem:                       # blocks while pool is full
            job.state = "running"
            job.started_at = time.time()
            log = (settings.RUNS_DIR / job.run_id / "pipeline.log").open(
                "w", encoding="utf-8", buffering=1)
            try:
                job.proc = subprocess.Popen(
                    [settings.PIPELINE_PYTHON, str(settings.PIPELINE_SCRIPT), *job.argv],
                    cwd=str(settings.PIPELINE_SCRIPT.parent),
                    stdout=log, stderr=subprocess.STDOUT, text=True,
                )
                try:
                    job.returncode = job.proc.wait(timeout=settings.RUN_TIMEOUT_S)
                except subprocess.TimeoutExpired:
                    job.proc.kill()
                    job.returncode = -1
                    _mark_fatal(job.run_id, "run exceeded RUN_TIMEOUT_S")
            except Exception as exc:                       # noqa: BLE001
                job.returncode = -1
                _mark_fatal(job.run_id, f"spawn failed: {exc}")
            finally:
                job.state = "exited"
                log.close()


def _mark_fatal(run_id: str, note: str) -> None:
    import json
    p = settings.RUNS_DIR / run_id / "PIPELINE_STATUS.json"
    data = json.loads(p.read_text()) if p.exists() else {"stages": []}
    data["stages"].append({"stage": "FATAL", "ok": False, "note": note})
    p.write_text(json.dumps(data, indent=2))


manager = JobManager(settings.MAX_WORKERS)


def sweep_old_runs() -> int:
    """Delete run folders older than the TTL. Returns count removed."""
    import shutil
    cutoff = time.time() - settings.RUN_TTL_HOURS * 3600
    removed = 0
    for d in settings.RUNS_DIR.iterdir():
        if not d.is_dir() or d.name.startswith("_"):
            continue
        try:
            if d.stat().st_mtime < cutoff:
                shutil.rmtree(d, ignore_errors=True)
                removed += 1
        except OSError:
            pass
    return removed
