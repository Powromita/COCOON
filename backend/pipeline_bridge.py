"""
backend/pipeline_bridge.py — translate a RunRequest into a run folder +
CLI invocation, and PIPELINE_STATUS.json into the frontend PipelineStatus.
"""

import csv
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path

from . import settings
from .models import (OptimizeRunRequest, PipelineStatus, SingleRunRequest,
                     StageStatus)

def new_run_id() -> str:
    return (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            + "-" + secrets.token_hex(2))


def prepare_run(run_id: str, req) -> list[str]:
    """Write inputs into runs/<run_id>/ and return the CLI argv (after
    the interpreter + script)."""

    rd = settings.RUNS_DIR / run_id
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "request.json").write_text(req.model_dump_json(indent=2), encoding="utf-8")

    common = [
        "--run-dir", str(rd),
        "--season", req.window.season,
        "--typical-hours", str(req.window.typical_hours),
        "--worst-hours", str(req.window.worst_hours),
        "--comfort-target", str(req.comfort.target_C),
        "--comfort-lo", str(req.comfort.band_lo_C),
        "--comfort-hi", str(req.comfort.band_hi_C),
    ]

    if isinstance(req, SingleRunRequest):
        cfg_path = rd / "shelter_config.json"
        cfg_path.write_text(req.config.model_dump_json(indent=2), encoding="utf-8")
        return ["single", "--config", str(cfg_path), *common]

    assert isinstance(req, OptimizeRunRequest)
    opt = req.optimize

    # the user pins the box + openings; the pipeline designs the envelope
    scenario = {
        k: v for k, v in {
            "internal_heat_gain_W": opt.internal_heat_gain_W,
            "air_changes_per_hour": opt.air_changes_per_hour,
            "initial_temperature_C": opt.initial_temperature_C,
        }.items() if v is not None
    }
    fixed = rd / "fixed_design.json"
    fixed.write_text(json.dumps({
        "geometry": {
            "length_m": opt.geometry.length_m,
            "width_m": opt.geometry.width_m,
            "height_m": opt.geometry.height_m,
        },
        "window": {
            "count": opt.window_count,
            "width_m": opt.window_width_m,
            "height_m": opt.window_height_m,
        },
        "door": {"count": opt.door_count},
        "scenario": scenario,
    }, indent=2), encoding="utf-8")

    # ratios.csv is still read for the WWR band + as a fallback; geometry
    # rows are ignored once a fixed geometry is supplied
    ratios = rd / "ratios.csv"
    ratios.write_text(settings.RATIOS_CSV.read_text(encoding="utf-8"),
                      encoding="utf-8")

    # per-run elements.csv (filter master to allowed materials)
    master = _read_elements()
    allowed = set(opt.allowed_materials)
    elements = rd / "elements.csv"
    with elements.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(master["header"])
        for row in master["rows"]:
            # keep opening rows (window/door/vent) + allowed structural/insulation
            elem = row[0].strip().lower()
            mat = row[1].strip().lower()
            if elem in ("window", "door", "vent") or mat in allowed:
                w.writerow(row)

    argv = [
        "optimize",
        "--designs", str(opt.designs),
        "--seed", str(opt.seed),
        "--trials", str(opt.trials),
        "--ratios", str(ratios),
        "--elements", str(elements),
        "--fixed-design", str(fixed),
        *common,
    ]
    if opt.run_ansys:
        argv += ["--ansys", "--ansys-hours", str(opt.ansys_hours),
                 "--ansys-designs", str(opt.ansys_designs)]
    return argv


def _read_elements() -> dict:
    with settings.ELEMENTS_CSV.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh))
    return {"header": rows[0], "rows": rows[1:]}


# ---- status translation ---------------------------------------------

_PHASE = {True: "ok", False: "failed", None: "skipped"}


def read_status(run_id: str, mode: str, proc_alive: bool,
                proc_returncode: int | None) -> PipelineStatus:
    rd = settings.RUNS_DIR / run_id
    p = rd / "PIPELINE_STATUS.json"
    raw = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"stages": []}
    written = {s["stage"]: s for s in raw.get("stages", [])}

    rc = rd / "run_config.json"
    ansys_requested = False
    if rc.exists():
        try:
            ansys_requested = bool(json.loads(rc.read_text()).get("ansys"))
        except Exception:  # noqa: BLE001
            pass

    expected = settings.EXPECTED_STAGES.get(mode, [])
    if mode == "optimize":
        drop = set()
        if not ansys_requested and "8_ansys" not in written:
            drop.add("8_ansys")
        expected = [s for s in expected if s not in drop]

    stages: list[StageStatus] = []
    for name in expected:
        s = written.get(name)
        if s is not None:
            stages.append(StageStatus(stage=name, phase=_PHASE[s["ok"]],
                                      note=str(s.get("note", "")) or None))
        else:
            # first not-yet-written stage after the last written one = running
            last_written_idx = max(
                (expected.index(k) for k in written if k in expected), default=-1)
            phase = "running" if (proc_alive and expected.index(name) == last_written_idx + 1) else "pending"
            stages.append(StageStatus(stage=name, phase=phase))

    fatal = "FATAL" in written and written["FATAL"]["ok"] is False
    if fatal:
        stages.append(StageStatus(stage="FATAL", phase="failed",
                                  note=str(written["FATAL"].get("note", ""))[:400]))

    got_results = (rd / "results.json").exists() or "11_results_json" in written
    done = bool(got_results and not fatal)

    critical_fail = any(
        written[k]["ok"] is False
        for k in written if k in settings.CRITICAL_STAGES
    )
    failed = bool(fatal or critical_fail
                  or (not proc_alive and proc_returncode not in (None, 0) and not done))

    return PipelineStatus(run_id=run_id, done=done, failed=failed, stages=stages)
