"""
tests/golden_cases.py

Single definition of the golden (regression) cases, shared by the
generator (make_golden.py) and the test (test_golden.py) so the two can
never disagree about what a case is.

Two layers are frozen:

1. **Weather slices** (golden/weather_*.csv) plus the archive ground mean
   (golden/ground.json). The engine test feeds these frozen inputs to
   ``engine_adapter.simulate``, so it checks the physics alone and is
   immune to weather-loader changes (Phase 2 rewrites the archive cache).
   A separate test checks that the loader still reproduces the slices.
2. **Design configs**: 5 designs from ScenarioGenerator(seed=2026),
   frozen to golden/designs_seed2026.json and replayed from the JSON, so
   generator changes (Person 3) cannot break this golden.

Outputs: every column of the hourly results frame, plus key scalar
properties (U-values, capacitance, infiltration UA).
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

TESTS_DIR = Path(__file__).resolve().parent
TC_DIR = TESTS_DIR.parent
REPO_ROOT = TC_DIR.parent
GOLDEN_DIR = TESTS_DIR / "golden"

DESIGN_SEED = 2026
DESIGN_POOL_SIZE = 12
# chosen from the seed-2026 pool for coverage: all 3 glazing types;
# uninsulated light (straw-clay) and heavy (550 mm stone) walls; PUF-
# insulated adobe / concrete / rammed earth; 4-7 windows.
DESIGN_IDS = (2, 3, 4, 7, 11)

WORST_HOURS = 48
TYPICAL_HOURS = 168          # weather_archive.typical_window default

WEATHER_FILES = {
    "worst48": GOLDEN_DIR / "weather_worst48.csv",
    "typical168": GOLDEN_DIR / "weather_typical168.csv",
}
GROUND_FILE = GOLDEN_DIR / "ground.json"
DESIGNS_FILE = GOLDEN_DIR / f"designs_seed{DESIGN_SEED}.json"
MANIFEST_FILE = GOLDEN_DIR / "manifest.json"

# full-precision float I/O so CSV round-trips are exact
FLOAT_FORMAT = "%.17g"


def read_weather(name: str) -> pd.DataFrame:
    return pd.read_csv(WEATHER_FILES[name], parse_dates=["timestamp"])


def read_ground_mean_C() -> float:
    return float(json.loads(GROUND_FILE.read_text())["annual_mean_air_C"])


def read_designs() -> list[dict]:
    return json.loads(DESIGNS_FILE.read_text())


def cases() -> list[dict]:
    """Every golden case: ``{name, weather, cfg}``. ``cfg`` is a canonical
    shelter config (shelter_config.validate)."""

    import shelter_config as sc

    ground = read_ground_mean_C()
    out = [
        # legacy config.SHELTER_CONFIG (ground mode "manual", 0 C)
        {"name": "baseline_worst48", "weather": "worst48",
         "cfg": sc.from_shelter_config()},
        {"name": "baseline_typical168", "weather": "typical168",
         "cfg": sc.from_shelter_config()},
    ]
    # optimizer designs, built exactly as run_pipeline / design_ranker do
    for design in read_designs():
        out.append({
            "name": f"design{design['design_id']:02d}_typical168",
            "weather": "typical168",
            "cfg": sc.from_design(design, ground_mode="annual_mean",
                                  ground_C=ground),
        })
    return out


def run_case(case: dict, **simulate_kwargs):
    """Run one case through engine_adapter.simulate on its frozen weather."""

    from engine_adapter import simulate

    return simulate(case["cfg"], read_weather(case["weather"]),
                    ground_mean_C=read_ground_mean_C(), **simulate_kwargs)


def key_properties(props: dict) -> dict:
    """Scalar properties frozen alongside the hourly series."""

    return {
        "U_wall_W_m2K": props["wall"]["U_W_m2K"],
        "U_roof_W_m2K": props["roof"]["U_W_m2K"],
        "U_floor_W_m2K": props["floor"]["U_W_m2K"],
        "wall_area_m2": props["geometry"]["wall_area_m2"],
        "window_area_m2": props["window"]["area_m2"],
        "infiltration_UA_W_K": props["infiltration"]["UA_W_K"],
        "C_total_J_K": props["capacitance"]["total_J_K"],
        "C_lumped_total_J_K": props["capacitance"]["lumped_mass_total_J_K"],
    }


def output_path(case_name: str) -> Path:
    return GOLDEN_DIR / f"{case_name}.csv"


def props_path() -> Path:
    return GOLDEN_DIR / "properties.json"
