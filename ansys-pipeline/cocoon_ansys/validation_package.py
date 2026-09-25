"""
validation_package.py - Frozen, hashed ANSYS validation package (PRD v4 §14.4).

create_package() writes, under <jobs_root>/<job_id>/package/:

    building.json            exact BuildingModel revision (canonical JSON)
    weather.json             WeatherSnapshot
    materials.json           MaterialSnapshot
    solver_config.json       AnsysSolverConfig
    boundary_conditions.csv  hourly forcing shared by ANSYS and RC
    scenario.json            initial state, assumptions, geometry summary,
                             area checks (no RC temperatures, ever)

plus <job>/request.json (AnsysJobRequest, input_hashes = SHA-256 of every
package file) and <job>/status.json (AnsysValidationResult, QUEUED).
Nothing in the package is modified after creation; the worker verifies
the hashes before solving.
"""

from pathlib import Path

from cocoon_ansys import __version__
from cocoon_ansys import boundary_condition_builder as bcb
from cocoon_ansys.contracts_io import (
    AnsysJobRequest, AnsysValidationResult, canonical_json, code_commit, now_utc,
    sha256_file, sha256_text, write_json)
from cocoon_ansys.geometry_builder import MeshConfig, resolve
from cocoon_ansys.paths import JOBS_DIR, ensure_import_paths

ensure_import_paths()
from cocoon_contracts import AnsysSolverConfig                 # noqa: E402

PACKAGE_FILES = ("building.json", "weather.json", "materials.json",
                 "solver_config.json", "boundary_conditions.csv", "scenario.json")
DEFAULT_INITIAL_TEMPERATURE_C = 10.0


def mesh_config_for(solver_cfg) -> MeshConfig:
    return MeshConfig(element_size_m=solver_cfg.element_size_m)


def timestep_s(solver_cfg) -> float:
    """Fixed transient step: one hour split into substeps_max equal steps."""
    return 3600.0 / solver_cfg.substeps_max


def create_package(building, weather, materials, solver_cfg=None, *,
                   jobs_root=JOBS_DIR, initial_temperature_c=DEFAULT_INITIAL_TEMPERATURE_C,
                   job_id=None, priority=0):
    solver_cfg = solver_cfg or AnsysSolverConfig(element_size_m=0.25, substeps_min=4,
                                                 substeps_max=4, timeout_seconds=3600)
    if solver_cfg.element_type != "SOLID70":
        raise ValueError("M8 builder emits 8-node SOLID70 bricks only")
    if solver_cfg.substeps_min != solver_cfg.substeps_max:
        raise ValueError("M8 uses a fixed step: substeps_min must equal substeps_max")

    model = resolve(building, materials, mesh_config_for(solver_cfg))
    bc, assumptions = bcb.build(building, weather, model)

    content_hash = sha256_text(canonical_json(building) + canonical_json(weather)
                               + canonical_json(materials) + canonical_json(solver_cfg)
                               + str(initial_temperature_c))
    submitted = now_utc()
    rev = building.revision_id.removeprefix("rev_")
    job_id = job_id or f"ans_{rev}_{content_hash[:8]}_{submitted:%Y%m%dT%H%M%S}"
    job_dir = Path(jobs_root) / job_id
    pkg = job_dir / "package"
    if job_dir.exists():
        raise FileExistsError(f"job folder already exists: {job_dir}")
    pkg.mkdir(parents=True)

    write_json(pkg / "building.json", building)
    write_json(pkg / "weather.json", weather)
    write_json(pkg / "materials.json", materials)
    write_json(pkg / "solver_config.json", solver_cfg)
    bc.to_csv(pkg / "boundary_conditions.csv", index=False, float_format="%.6g")

    scenario = {
        "schema_version": "4.0",
        "job_id": job_id,
        "design_id": building.design_id,
        "design_revision_id": building.revision_id,
        "weather_snapshot_id": weather.snapshot_id,
        "material_snapshot_id": materials.snapshot_id,
        "initial_temperature_c": initial_temperature_c,
        "start": bc["timestamp"].iloc[0],
        "hours": int(len(bc)),
        "timestep_s": timestep_s(solver_cfg),
        "time_integration": "backward Euler (MAPDL TINTP theta=1), fixed step",
        "mesh": {"element_type": "SOLID70", "element_size_m": solver_cfg.element_size_m,
                 "max_layer_slice_m": mesh_config_for(solver_cfg).layer_slice},
        "model_summary": model.summary(),
        "zones": {zid: {"type": z["type"], "level": z["level"], "volume_m3": z["volume_m3"],
                        "gain_area_m2": z["gain_area_m2"]} for zid, z in model.zones.items()},
        "surfaces": {sid: {k: s[k] for k in ("zone_id", "surface_type", "boundary",
                                             "contract_area_m2", "built_area_m2",
                                             "area_deviation") if k in s}
                     for sid, s in model.surfaces.items()},
        "assumptions": assumptions,
        "independence": "ANSYS receives geometry, materials, films and the hourly "
                        "inputs in boundary_conditions.csv only; no RC result is an input.",
        "software": {"cocoon_ansys": __version__},
    }
    write_json(pkg / "scenario.json", scenario)

    hashes = {name: sha256_file(pkg / name) for name in PACKAGE_FILES}
    request = AnsysJobRequest(
        schema_version="4.0", job_id=job_id, design_revision_id=building.revision_id,
        weather_snapshot_id=weather.snapshot_id, solver_config=solver_cfg,
        input_hashes=hashes, priority=priority, submitted_at=submitted,
        imposed_indoor_temp_forbidden=True)
    write_json(job_dir / "request.json", request)
    write_json(job_dir / "input_manifest.json", {
        "job_id": job_id, "files": {n: f"package/{n}" for n in PACKAGE_FILES},
        "sha256": hashes, "code_commit": code_commit(), "created_at": submitted.isoformat()})
    write_json(job_dir / "status.json", AnsysValidationResult(
        schema_version="4.0", job_id=job_id, design_revision_id=building.revision_id,
        status="QUEUED"))
    return request, job_dir


def verify_package(job_dir):
    """Raise if any frozen input changed since the job was queued."""
    req = AnsysJobRequest.model_validate_json((Path(job_dir) / "request.json").read_text(encoding="utf-8"))
    for name, h in req.input_hashes.items():
        actual = sha256_file(Path(job_dir) / "package" / name)
        if actual != h:
            raise RuntimeError(f"package file '{name}' changed after queueing "
                               f"(expected {h[:12]}, found {actual[:12]})")
    return req
