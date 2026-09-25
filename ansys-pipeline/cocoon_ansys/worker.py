"""
worker.py - ANSYS validation job state machine and CLI (PRD v4 §14.3, §14.9).

    NOT_REQUESTED -> QUEUED -> PREPARING -> MESHING -> SOLVING -> EXPORTING
                  -> COMPLETED | FAILED | CANCELLED | TIMED_OUT | UNAVAILABLE

One folder per job (<jobs_root>/<job_id>/), status.json is the M0
AnsysValidationResult and is rewritten atomically on every transition.
A lock file stops two workers taking the same job. A failure never
touches RC or economics results: it only sets this job's state + reason.

CLI (run from ansys-pipeline/):
    python -m cocoon_ansys.worker submit --building B.json --weather W.json \
           --materials M.json [--element-size 0.25] [--timeout 3600] [--run]
    python -m cocoon_ansys.worker run <job_dir>
    python -m cocoon_ansys.worker status <job_dir>
    python -m cocoon_ansys.worker cancel <job_dir>
    python -m cocoon_ansys.worker worker [--once] [--poll 10]
    python -m cocoon_ansys.worker latest <revision_id>
"""

import argparse
import json
import os
import shutil
import time
import traceback
from pathlib import Path

import pandas as pd

from cocoon_ansys import comparison, pyansys_runner
from cocoon_ansys.contracts_io import (
    AnsysValidationResult, load_building, load_materials, load_weather, now_utc,
    sha256_file, write_json)
from cocoon_ansys.geometry_builder import resolve
from cocoon_ansys.paths import JOBS_DIR, ensure_import_paths
from cocoon_ansys.validation_package import create_package, mesh_config_for, verify_package

ensure_import_paths()
from cocoon_contracts import AnsysComparisonMetrics, AnsysArtifactManifest, AnsysSolverConfig  # noqa: E402

TERMINAL = {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "UNAVAILABLE"}
ARTIFACTS = {
    "input_manifest": "input_manifest.json",
    "scenario": "package/scenario.json",
    "boundary_conditions_csv": "package/boundary_conditions.csv",
    "solver_manifest": "solver_manifest.json",
    "temperature_series_csv": "temperature_series.csv",
    "surface_temperature_series_csv": "surface_temperature_series.csv",
    "heat_flux_series_csv": "heat_flux_series.csv",
    "rc_series_csv": "rc_series.csv",
    "comparison_metrics": "comparison_metrics.json",
    "comparison_plot_png": "rc_vs_ansys.png",
    "viewer_payload": "mesh_temperature.json",
    "geometry_png": "geometry.png",
    "mesh_png": "mesh.png",
}


# ---------------------------------------------------------------------------
# status file
# ---------------------------------------------------------------------------

def read_status(job_dir) -> AnsysValidationResult:
    return AnsysValidationResult.model_validate_json(
        (Path(job_dir) / "status.json").read_text(encoding="utf-8"))


def _set_status(job_dir, status, detail=None, **fields):
    cur = read_status(job_dir).model_dump()
    cur.update(fields)
    cur["status"] = status
    new = AnsysValidationResult.model_validate(cur)          # enforces §14.9 invariants
    tmp = Path(job_dir) / "status.json.tmp"
    write_json(tmp, new)
    os.replace(tmp, Path(job_dir) / "status.json")
    with open(Path(job_dir) / "job.log", "a", encoding="utf-8") as fh:
        fh.write(f"{now_utc().isoformat()} {status}{' ' + detail if detail else ''}\n")
    return new


def latest_status(revision_id, jobs_root=JOBS_DIR):
    """Most recent job for a design revision, or NOT_REQUESTED."""
    best = None
    for st in Path(jobs_root).glob("ans_*/status.json"):
        s = AnsysValidationResult.model_validate_json(st.read_text(encoding="utf-8"))
        if s.design_revision_id != revision_id:
            continue
        req = json.loads((st.parent / "request.json").read_text(encoding="utf-8"))
        if best is None or req["submitted_at"] > best[0]:
            best = (req["submitted_at"], s)
    if best is None:
        return {"design_revision_id": revision_id, "status": "NOT_REQUESTED"}
    return best[1].model_dump(mode="json")


# ---------------------------------------------------------------------------
# job execution
# ---------------------------------------------------------------------------

def run_job(job_dir, export_images=True, keep_workdir=False):
    job_dir = Path(job_dir)
    lock = job_dir / ".lock"
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
    except FileExistsError:
        raise RuntimeError(f"job {job_dir.name} is locked by another worker")
    try:
        st = read_status(job_dir)
        if st.status != "QUEUED":
            raise RuntimeError(f"job {job_dir.name} is {st.status}, not QUEUED")
        _set_status(job_dir, "PREPARING", "verifying frozen package", started_at=now_utc())
        try:
            verify_package(job_dir)
            res = pyansys_runner.run(
                job_dir, export_images=export_images,
                on_stage=lambda s, d="": _set_status(job_dir, s, d))
            _set_status(job_dir, "EXPORTING", "RC comparison + manifests")
            _finish(job_dir, res)
        except pyansys_runner.AnsysUnavailable as exc:
            _set_status(job_dir, "UNAVAILABLE", str(exc), error_reason=str(exc),
                        completed_at=now_utc())
        except pyansys_runner.SolveTimeout as exc:
            _set_status(job_dir, "TIMED_OUT", str(exc), error_reason=str(exc),
                        completed_at=now_utc())
        except Exception as exc:                                  # noqa: BLE001
            (job_dir / "error.log").write_text(traceback.format_exc(), encoding="utf-8")
            _keep_solver_errors(job_dir)
            _set_status(job_dir, "FAILED", repr(exc), error_reason=f"{type(exc).__name__}: {exc}",
                        completed_at=now_utc())
    finally:
        lock.unlink(missing_ok=True)
        work = job_dir / "_mapdl_work"
        if work.exists() and not keep_workdir:
            shutil.rmtree(work, ignore_errors=True)
    return read_status(job_dir)


def _keep_solver_errors(job_dir):
    for f in (job_dir / "_mapdl_work").glob("*.err"):
        shutil.copyfile(f, job_dir / f"mapdl_{f.name}")


def _finish(job_dir, res):
    pkg = job_dir / "package"
    scenario = json.loads((pkg / "scenario.json").read_text(encoding="utf-8"))
    solver_cfg = AnsysSolverConfig.model_validate_json((pkg / "solver_config.json").read_text(encoding="utf-8"))
    model = resolve(load_building(pkg / "building.json"), load_materials(pkg / "materials.json"),
                    mesh_config_for(solver_cfg))
    bc = pd.read_csv(pkg / "boundary_conditions.csv")
    cmp = comparison.compare(job_dir, model, bc, scenario["initial_temperature_c"])

    write_json(job_dir / "solver_manifest.json", {
        "job_id": job_dir.name, "design_revision_id": scenario["design_revision_id"], **res})

    artifacts = {k: v for k, v in ARTIFACTS.items() if (job_dir / v).exists()}
    for name, rel in (res.get("images") or {}).items():
        if isinstance(rel, str) and name not in ("geometry_png", "mesh_png") \
                and (job_dir / rel).exists():
            artifacts[name] = rel
    checks = {k: sha256_file(job_dir / v) for k, v in artifacts.items()}
    lines = [f"{sha256_file(p)}  {p.relative_to(job_dir).as_posix()}"
             for p in sorted(job_dir.rglob("*"))
             if p.is_file() and "_mapdl_work" not in p.parts
             and p.name not in ("status.json", "job.log", "checksums.sha256", ".lock",
                                "validation_summary.json")]
    (job_dir / "checksums.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")
    artifacts["checksums"] = "checksums.sha256"

    final = _set_status(
        job_dir, "COMPLETED", f"MAE {cmp['pooled']['mae_c']} C over {cmp['hours']} h",
        completed_at=now_utc(),
        solver_summary={k: res[k] for k in ("nodes", "elements", "element_type",
                                            "element_size_m", "timestep_s", "hours",
                                            "runtime_s", "mapdl_version", "solver_type")},
        metrics=AnsysComparisonMetrics(**cmp["pooled"]),
        artifacts=AnsysArtifactManifest(artifacts=artifacts, checksums_sha256=checks))
    write_json(job_dir / "validation_summary.json", final)


def recompare(job_dir):
    """Re-derive the RC comparison of a COMPLETED job from its stored ANSYS
    output (no re-solve). ANSYS result files are not touched; comparison
    artifacts, checksums and status metrics are regenerated and logged."""
    job_dir = Path(job_dir)
    if read_status(job_dir).status != "COMPLETED":
        raise RuntimeError("only COMPLETED jobs can be re-compared")
    res = json.loads((job_dir / "solver_manifest.json").read_text(encoding="utf-8"))
    for k in ("job_id", "design_revision_id"):
        res.pop(k, None)
    with open(job_dir / "job.log", "a", encoding="utf-8") as fh:
        fh.write(f"{now_utc().isoformat()} RECOMPARE comparison re-derived from stored "
                 "ANSYS output (no re-solve)\n")
    _finish(job_dir, res)
    return read_status(job_dir)


def cancel(job_dir):
    st = read_status(job_dir)
    if st.status != "QUEUED":
        raise RuntimeError(f"only QUEUED jobs can be cancelled (job is {st.status})")
    return _set_status(job_dir, "CANCELLED", "cancelled before start", completed_at=now_utc())


def worker_loop(jobs_root=JOBS_DIR, once=False, poll_s=10.0):
    """Single ANSYS worker (MAX_ANSYS_WORKERS=1): oldest QUEUED job first."""
    while True:
        queued = []
        for st in Path(jobs_root).glob("ans_*/status.json"):
            if read_status(st.parent).status == "QUEUED" and not (st.parent / ".lock").exists():
                req = json.loads((st.parent / "request.json").read_text(encoding="utf-8"))
                queued.append(((-req.get("priority", 0), req["submitted_at"]), st.parent))
        for _, jd in sorted(queued):
            print(f"[worker] running {jd.name}")
            print(f"[worker] {jd.name}: {run_job(jd).status}")
        if once:
            return
        time.sleep(poll_s)


def submit(building, weather, materials, element_size=0.25, timeout=3600, substeps=4,
           jobs_root=JOBS_DIR, initial_temperature_c=10.0, hours=None):
    b, w, m = load_building(building), load_weather(weather), load_materials(materials)
    if hours:
        w = w.model_copy(update={"hourly_data": w.hourly_data[:hours]})
    cfg = AnsysSolverConfig(element_size_m=element_size, element_type="SOLID70",
                            substeps_min=substeps, substeps_max=substeps,
                            timeout_seconds=timeout)
    return create_package(b, w, m, cfg, jobs_root=jobs_root,
                          initial_temperature_c=initial_temperature_c)


def _cli():
    ap = argparse.ArgumentParser(description="COCOON M8 ANSYS validation worker")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("submit")
    s.add_argument("--building", required=True)
    s.add_argument("--weather", required=True)
    s.add_argument("--materials", required=True)
    s.add_argument("--element-size", type=float, default=0.25)
    s.add_argument("--timeout", type=int, default=3600)
    s.add_argument("--hours", type=int, default=None)
    s.add_argument("--initial-temperature", type=float, default=10.0)
    s.add_argument("--jobs-root", default=str(JOBS_DIR))
    s.add_argument("--run", action="store_true")
    for name in ("run", "status", "cancel", "recompare"):
        p = sub.add_parser(name)
        p.add_argument("job_dir")
    w = sub.add_parser("worker")
    w.add_argument("--jobs-root", default=str(JOBS_DIR))
    w.add_argument("--once", action="store_true")
    w.add_argument("--poll", type=float, default=10.0)
    l = sub.add_parser("latest")
    l.add_argument("revision_id")
    l.add_argument("--jobs-root", default=str(JOBS_DIR))
    a = ap.parse_args()

    if a.cmd == "submit":
        req, jd = submit(a.building, a.weather, a.materials, a.element_size, a.timeout,
                         jobs_root=a.jobs_root, initial_temperature_c=a.initial_temperature,
                         hours=a.hours)
        print(f"QUEUED {req.job_id}\n  {jd}")
        if a.run:
            print(run_job(jd).model_dump_json(indent=2))
    elif a.cmd == "run":
        print(run_job(a.job_dir).model_dump_json(indent=2))
    elif a.cmd == "status":
        print(read_status(a.job_dir).model_dump_json(indent=2))
    elif a.cmd == "cancel":
        print(cancel(a.job_dir).status)
    elif a.cmd == "recompare":
        print(recompare(a.job_dir).metrics)
    elif a.cmd == "worker":
        worker_loop(a.jobs_root, a.once, a.poll)
    elif a.cmd == "latest":
        print(json.dumps(latest_status(a.revision_id, a.jobs_root), indent=2))


if __name__ == "__main__":
    _cli()
