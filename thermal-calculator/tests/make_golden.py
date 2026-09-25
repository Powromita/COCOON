"""
tests/make_golden.py -- (re)generate the golden regression files.

Run ONLY when a physics change is intended and reviewed; the whole point
of the golden is that legacy physics never changes by accident:

    python thermal-calculator/tests/make_golden.py            # outputs only
    python thermal-calculator/tests/make_golden.py --inputs   # also re-freeze
                                                              # weather + designs

``--inputs`` re-derives the weather slices from the archive and the
designs from ScenarioGenerator(seed); without it the existing frozen
inputs are reused and only the engine outputs are rewritten.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import conftest  # noqa: E402,F401  (sets sys.path)
import golden_cases as gc  # noqa: E402


def freeze_inputs() -> None:
    import weather_archive as wa
    from scenario_generator import ScenarioGenerator

    gc.GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    arch = wa.load_archive()
    with contextlib.redirect_stdout(io.StringIO()):
        worst = wa.worst_case_window(arch, hours=gc.WORST_HOURS)
        typical = wa.typical_window(arch, hours=gc.TYPICAL_HOURS)
    worst.to_csv(gc.WEATHER_FILES["worst48"], index=False,
                 float_format=gc.FLOAT_FORMAT)
    typical.to_csv(gc.WEATHER_FILES["typical168"], index=False,
                   float_format=gc.FLOAT_FORMAT)
    gc.GROUND_FILE.write_text(json.dumps(
        {"annual_mean_air_C": wa.annual_mean_air_C(arch)}, indent=2))

    gen = ScenarioGenerator(
        str(gc.REPO_ROOT / "data" / "shelter" / "shelter_ratios_recommended.csv"),
        str(gc.REPO_ROOT / "data" / "shelter" / "shelter_elements_dimensions__1_.csv"),
        seed=gc.DESIGN_SEED,
    )
    with contextlib.redirect_stdout(io.StringIO()):
        pool = gen.generate_candidates(gc.DESIGN_POOL_SIZE)
    chosen = [d for d in pool if d["design_id"] in gc.DESIGN_IDS]
    assert len(chosen) == len(gc.DESIGN_IDS), "design pool changed size"
    gc.DESIGNS_FILE.write_text(json.dumps(chosen, indent=2))


def freeze_outputs() -> dict:
    props = {}
    for case in gc.cases():
        hourly, p = gc.run_case(case)
        hourly.to_csv(gc.output_path(case["name"]), index=False,
                      float_format=gc.FLOAT_FORMAT)
        props[case["name"]] = gc.key_properties(p)
        print(f"  {case['name']:<28} {len(hourly):>4} h  "
              f"T_in {hourly['indoor_temperature_C'].min():7.2f} .. "
              f"{hourly['indoor_temperature_C'].max():6.2f} C")
    gc.props_path().write_text(json.dumps(props, indent=2))
    return props


def write_manifest(inputs_refrozen: bool) -> None:
    import numpy
    import pandas

    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=gc.REPO_ROOT, text=True).strip()
    except Exception:  # noqa: BLE001
        commit = "unknown"

    old = (json.loads(gc.MANIFEST_FILE.read_text())
           if gc.MANIFEST_FILE.exists() else {})
    manifest = {
        "outputs_generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputs_generated_utc": (datetime.now(timezone.utc).isoformat(timespec="seconds")
                                 if inputs_refrozen else old.get("inputs_generated_utc")),
        "git_commit": commit,
        "physics_level": "legacy",
        "python": platform.python_version(),
        "numpy": numpy.__version__,
        "pandas": pandas.__version__,
        "design_seed": gc.DESIGN_SEED,
        "design_ids": list(gc.DESIGN_IDS),
        "cases": [c["name"] for c in gc.cases()],
    }
    gc.MANIFEST_FILE.write_text(json.dumps(manifest, indent=2))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inputs", action="store_true",
                    help="also re-freeze weather slices, ground mean and designs")
    a = ap.parse_args()

    if a.inputs or not gc.DESIGNS_FILE.exists():
        print("freezing inputs (weather slices, ground mean, designs)...")
        freeze_inputs()
    print("freezing engine outputs (physics_level=legacy)...")
    freeze_outputs()
    write_manifest(inputs_refrozen=a.inputs)
    print(f"golden files written to {gc.GOLDEN_DIR}")


if __name__ == "__main__":
    main()
