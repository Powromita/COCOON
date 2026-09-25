# ANSYS Validation Pipeline (Module M8)

Independent transient-thermal FEM validation of an **exact, immutable design
revision**, for any number of rooms on any number of floors, run with PyMAPDL
against a local ANSYS install (ANSYS Student is fine for the submission).
PRD v4 §14. It is not in the interactive path: the RC engine gives every
result; ANSYS validates selected revisions and never replaces them.

Independence rule (PRD §0.3 rule 4): ANSYS receives geometry, materials,
films and the hourly weather/ground/solar/internal-gain inputs only. It never
receives an RC-predicted temperature; the M0 `AnsysJobRequest` contract
rejects a request that tries.

## Layout

| Path | Role |
|---|---|
| `cocoon_ansys/` | **M8 multi-zone pipeline** (use this) |
| `cocoon_ansys/geometry_builder.py` | M0 `BuildingModel` → conforming SOLID70 hex grid: one air block per zone, exterior stacks, one stack per partition / inter-storey slab, windows and doors |
| `cocoon_ansys/boundary_condition_builder.py` | Hourly forcing shared by ANSYS and RC: T_out, Kusuda ground, window POA (team `solar.py`), occupants + equipment |
| `cocoon_ansys/validation_package.py` | Frozen job package + SHA-256 input hashes + `AnsysJobRequest` |
| `cocoon_ansys/pyansys_runner.py` | APDL model file, stepped load tables, chunked transient solve, per-zone / surface / heat-flow extraction |
| `cocoon_ansys/contour_export.py` | geometry.png, mesh.png, envelope + cutaway contour frames, animation |
| `cocoon_ansys/comparison.py` | Same scenario through `thermal-calculator/multiroom_rc.py` (unmodified) + metrics |
| `cocoon_ansys/worker.py` | PRD §14.9 job state machine + CLI |
| `cocoon_ansys/evidence.py` | Runs the §14.11 evidence set + mesh/timestep checks, writes the report |
| `cases/` | Evidence BuildingModels (M0 contracts), weather + material snapshots |
| `evidence/` | Completed evidence jobs, `M8_VALIDATION_REPORT.md`, `EVIDENCE_INDEX.json` |
| `quarantined/` | Legacy benchmark that must never be shown as evidence (see `QUARANTINE.md`) |
| `tests/` | `python -m pytest tests` — geometry, package, status machine, RC adapter (no ANSYS needed) |
| `geometry_builder.py`, `pyansys_runner.py`, `comparison.py` (top level) | Legacy single-zone path still used by pipeline stage 8 (`validate_top_designs_ansys.py`) |

## Run it

From `ansys-pipeline/` with a Python that has `ansys-mapdl-core`, `pydantic`,
`pandas`, `numpy`, `matplotlib`:

```bash
# queue + run one exact revision
python -m cocoon_ansys.worker submit \
    --building cases/case_04_two_floor.json \
    --weather cases/wx_leh_20260124T11_48h.json \
    --materials cases/materials_m0_standard.json --run

python -m cocoon_ansys.worker status jobs/<job_id>        # AnsysValidationResult JSON
python -m cocoon_ansys.worker latest rev_ev04_r1          # latest job or NOT_REQUESTED
python -m cocoon_ansys.worker worker                      # process QUEUED jobs (1 at a time)
python -m cocoon_ansys.evidence                           # evidence set + report
```

`ANSYS_EXECUTABLE_PATH` overrides the Student default path. If MAPDL cannot
be launched the job ends `UNAVAILABLE` with the reason; nothing is faked.

### Backend integration (M9)

`POST /api/v1/ansys/jobs` → `validation_package.create_package(building,
weather, materials, solver_cfg)` returns the `AnsysJobRequest` and job folder
(status `QUEUED`). A Windows worker process runs `worker.worker_loop()`.
`GET /api/v1/ansys/jobs/{id}` → `worker.read_status(job_dir)` (M0
`AnsysValidationResult`). `GET .../artifacts` → `status.artifacts` (relative
paths + SHA-256). A revision with no job → `worker.latest_status()` returns
`NOT_REQUESTED`; never substitute a benchmark.

## Job folder (PRD §14.8)

```
<job_id>/
  request.json  status.json  job.log  input_manifest.json
  package/  building.json weather.json materials.json solver_config.json
            boundary_conditions.csv scenario.json
  solver_manifest.json          nodes/elements, element size, dt, runtime, MAPDL version
  temperature_series.csv        per-zone air temperature (mean/min/max), end of each hour
  surface_temperature_series.csv inner-surface temperature per surface
  heat_flux_series.csv          W through each exterior surface/opening and each interface
  rc_series.csv                 multiroom_rc on the same scenario
  comparison_metrics.json       per-zone + pooled MAE/RMSE/max/bias/R², envelope heat loss
  rc_vs_ansys.png  geometry.png  mesh.png  contour_frames/  temperature_animation.gif
  mesh_temperature.json         downsampled skin-node + zone temperatures for the 3D viewer
  validation_summary.json       final AnsysValidationResult
  checksums.sha256
```

## Modelling choices

- **Zones** are air blocks (k = 50 W/mK, real ρcₚ), one material per zone, so
  each room's temperature is read back separately (volume-weighted mean).
- **Exterior stacks** grow outward from the zone face: 20 mm inside film with
  `d/k = r_inside_film`, then the assembly layers inner→outer; the outer face
  has convection `h = 1/r_outside_film` to T_out (walls, roofs) or to the
  Kusuda ground temperature (ground floors). Same U as the RC side exactly.
- **Partitions / inter-storey slabs** are one stack (film + layers + film) in
  a gap inserted at the shared plane; everything beyond is shifted by the gap,
  so zone sizes and surface areas equal the contract exactly (unit-tested).
  Only ground-floor zones touch the ground; only top surfaces get roof BCs.
- **Windows / doors** fill their rectangle through the stack: interior film +
  orthotropic core whose normal k makes the air-to-air U equal the contract U.
- **Solar + internal gains** enter as heat flux on the zone's floor slab (the
  validated single-zone treatment); the RC node receives the same watts.
- **Junction strips/corners** belonging to no surface are adiabatic, as the RC
  model ignores junction bridging.
- **Excluded on both sides**: heating (free-floating), infiltration, door and
  stair airflow, opaque solar, long-wave sky. MAPDL validates conduction
  through envelope, partitions and slabs — not indoor airflow (no CFD claim).
- **Time**: backward Euler, fixed dt = 3600/substeps (900 s default), loads
  hourly-constant via stepped tables; mesh ≤ element size, massive layers
  sliced to ≤ 0.05 m.
