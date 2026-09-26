"""
ansys_stage.py - run a design through the ANSYS worker and compare it with the M4 engine.

    run_ansys_validation(building, weather, materials, hours=48, wait=True) -> validation dict for the final report
    compare_m4_with_ansys(job_dir)  -> metrics of M4 vs the ANSYS zone temperatures of that job

M4 runs on the FROZEN package ANSYS was given, never the other way round: ANSYS never sees an M4 temperature. Both
sides exclude what M8 excludes (heating, infiltration, door and stair airflow, opaque-surface solar, long-wave), so the
comparison covers conduction through the envelope and partitions plus window solar and internal gains. It says nothing
about heating or airflow, and the numbers describe this exact revision and window only (PRD 14.10).
"""

from __future__ import annotations

import csv
import json
import math
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from cocoon_pipeline import ansys_hook

STATE_VALIDATED = "VALIDATED_BY_ANSYS"
STATE_FAILED = "RC_ONLY_ANSYS_FAILED"
COVERS_NOT = ["heating and heater control", "infiltration", "door-opening and stair airflow", "opaque-surface solar",
              "long-wave sky exchange", "indoor airflow (no CFD)"]


def _series(path: Path) -> tuple[list[datetime], dict[str, list[float]]]:
    with path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    zones = [c[2:-2] for c in rows[0] if c.startswith("T_") and c.endswith("_C") and not c.endswith(("_min_C", "_max_C"))]
    return ([datetime.fromisoformat(r["timestamp"]) for r in rows],
            {z: [float(r[f"T_{z}_C"]) for r in rows] for z in zones})


def compare_m4_with_ansys(job_dir: Path) -> dict[str, Any]:
    from cocoon_contracts import BuildingModel, MaterialSnapshot, WeatherSnapshot
    from m4_engine import M4Evaluator
    from m4_engine.options import EngineOptions

    job_dir = Path(job_dir)
    pkg = job_dir / "package"
    building = BuildingModel.model_validate_json((pkg / "building.json").read_text(encoding="utf-8"))
    materials = MaterialSnapshot.model_validate_json((pkg / "materials.json").read_text(encoding="utf-8"))
    weather = WeatherSnapshot.model_validate_json((pkg / "weather.json").read_text(encoding="utf-8"))
    scenario = json.loads((pkg / "scenario.json").read_text(encoding="utf-8"))
    times, ansys = _series(job_dir / "temperature_series.csv")

    with (pkg / "boundary_conditions.csv").open(newline="", encoding="utf-8") as fh:
        bc = list(csv.DictReader(fh))
    gcol = next((c for c in bc[0] if "ground" in c.lower()), None)
    ground_c = (sum(float(r[gcol]) for r in bc) / len(bc)) if gcol else scenario.get("ground", {}).get("annual_mean_C")
    init_c = float(scenario.get("initial_temperature_c", (json.loads((job_dir / "request.json").read_text()) or {}).get("initial_temperature_c", 10.0)))

    opts = EngineOptions(opaque_absorptivity_override=0.0, longwave_sky=False, stair_open_fraction=0.0)
    ev = M4Evaluator(materials, {weather.snapshot_id: weather}, opts)
    start = weather.hourly_data[0].timestamp
    end = weather.hourly_data[-1].timestamp
    from datetime import timedelta
    job = SimpleNamespace(building=building, weather_snapshot_id=weather.snapshot_id, mode=SimpleNamespace(value="free_floating"),
                          window_start=start, window_end=end + timedelta(hours=1), setpoint_c=15.0, timestep_seconds=900,
                          initial_temperature_c=init_c, ground_temperature_c=ground_c, heater_capacity_kw=None,
                          air_changes_per_hour=0.0, extras={"perturbation": {"door_usage": 0.0}})
    res = ev.simulate(job)
    m4 = {p.timestamp: p.zone_temperatures_c for p in res.time_series}

    zones, pooled = {}, []
    for z, vals in ansys.items():
        errs = []
        for t, a in zip(times, vals):
            if t in m4 and z in m4[t]:
                errs.append(a - m4[t][z])
        if not errs:
            continue
        n = len(errs)
        zones[z] = {"n": n, "mae_c": sum(abs(e) for e in errs) / n, "rmse_c": math.sqrt(sum(e * e for e in errs) / n),
                    "max_abs_c": max(abs(e) for e in errs), "bias_ansys_minus_m4_c": sum(errs) / n}
        pooled += errs
    if not pooled:
        return {"compared": False, "reason": "no matching timestamps between the ANSYS series and the M4 run"}
    n = len(pooled)
    return {"compared": True, "reference_engine": f"{res.engine.name} {res.engine.version}", "scenario": "48 h free-floating",
            "pooled": {"n": n, "mae_c": sum(abs(e) for e in pooled) / n, "rmse_c": math.sqrt(sum(e * e for e in pooled) / n),
                       "max_abs_c": max(abs(e) for e in pooled), "bias_ansys_minus_m4_c": sum(pooled) / n},
            "zones": zones, "m4_exclusions": ["opaque solar", "long-wave", "infiltration", "door exchange", "stair exchange", "heating"],
            "not_covered": COVERS_NOT}


def run_ansys_validation(building: Any, weather: Any, materials: Any, hours: int = 48, wait: bool = True,
                         jobs_dir: Path | None = None) -> dict[str, Any]:
    """Freeze, solve (blocking when wait=True) and compare. VALIDATED_BY_ANSYS only when the job COMPLETED."""
    sub = ansys_hook.submit(building, weather.model_copy(update={"hourly_data": weather.hourly_data[:hours]}), materials,
                            jobs_dir=jobs_dir, wait=wait)
    if not wait or sub["state"] != ansys_hook.STATE_QUEUED:
        return sub
    status = sub.get("job_status")
    if status == "UNAVAILABLE":
        return {**sub, "state": ansys_hook.STATE_UNAVAILABLE, "reason": sub.get("error_reason") or "ANSYS is not available"}
    if status != "COMPLETED":
        return {**sub, "state": STATE_FAILED, "reason": f"ANSYS job ended as {status}: {sub.get('error_reason')}"}
    try:
        cmp = compare_m4_with_ansys(Path(sub["job_dir"]))
    except Exception as exc:                                        # noqa: BLE001
        cmp = {"compared": False, "reason": f"{type(exc).__name__}: {exc}"}
    return {**sub, "state": STATE_VALIDATED, "hours": hours, "comparison_m4_vs_ansys": cmp,
            "meaning": "ANSYS MAPDL solved this exact revision independently; it validates conduction and window-solar behaviour "
                       "for the 48 h free-floating scenario only, not a general accuracy claim"}
