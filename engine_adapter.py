"""
engine_adapter.py  --  Stage 3 of the integrated pipeline.

One call site for the RC physics engine. Handles the
``ground_temperature_mode == "annual_mean"`` case and returns the hourly
results as a DataFrame instead of a list of dicts.
"""

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "thermal-calculator"))

from thermal_model import run_simulation          # noqa: E402
from materials import load_materials               # noqa: E402

_MATERIALS_PATH = ROOT / "thermal-calculator" / "data" / "material_properties.json"

_materials_cache = None


def get_materials():
    global _materials_cache
    if _materials_cache is None:
        _materials_cache = load_materials(str(_MATERIALS_PATH))
    return _materials_cache


def simulate(cfg: dict, weather_df: pd.DataFrame, materials=None,
             ground_mean_C: float | None = None):
    """Run one design.

    Parameters
    ----------
    cfg : dict            canonical shelter config (shelter_config.validate)
    weather_df : DataFrame  columns timestamp, temperature_C,
                            solar_radiation_W_m2 (+ optional wind/humidity)
    ground_mean_C : float   used when cfg["ground_temperature_mode"] ==
                            "annual_mean"

    Returns
    -------
    (hourly_df, properties)  hourly_df has the columns thermal_model
    writes, incl. indoor_temperature_C and every Q_* term.
    """

    materials = materials or get_materials()
    run_cfg = dict(cfg)

    if run_cfg.get("ground_temperature_mode") == "annual_mean":
        if ground_mean_C is None:
            raise ValueError(
                "ground_temperature_mode is 'annual_mean' but no "
                "ground_mean_C was supplied"
            )
        run_cfg["ground_temperature_mode"] = "manual"
        run_cfg["ground_temperature_C"] = float(ground_mean_C)

    results, properties = run_simulation(weather_df, run_cfg, materials)
    return pd.DataFrame(results), properties


if __name__ == "__main__":
    import shelter_config as sc
    from weather_archive import load_archive, worst_case_window, annual_mean_air_C

    arch = load_archive()
    wx = worst_case_window(arch, hours=24)
    cfg = sc.from_shelter_config()
    hourly, props = simulate(cfg, wx, ground_mean_C=annual_mean_air_C(arch))
    print(hourly[["timestamp", "outdoor_temperature_C",
                  "indoor_temperature_C"]].describe())
    print("U_wall", round(props["wall"]["U_W_m2K"], 3),
          "C_total_MJ/K", round(props["capacitance"]["total_J_K"] / 1e6, 1))
