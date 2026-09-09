"""
comparison.py

Compares the ANSYS transient-thermal result for a case against the Python
physics engine's prediction for the SAME scenario, and writes the
MAE / RMSE / R2 that back the accuracy claim.

To guarantee both models see an identical scenario, the physics side is
re-run here from SHELTER_CONFIG on the exact weather window ANSYS used
(../thermal-calculator/results/ansys_boundary_conditions.csv) rather than
read from a possibly-stale thermal_results.csv.

    python comparison.py                     # case_baseline
    python comparison.py --case case_insulated
"""

import os
import sys
import copy
import argparse
import pandas as pd
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CALC_DIR = os.path.join(HERE, "..", "thermal-calculator")
sys.path.insert(0, CALC_DIR)

from config import SHELTER_CONFIG              # noqa: E402
from materials import load_materials           # noqa: E402
from thermal_model import run_simulation       # noqa: E402

MATERIAL_DB_PATH = os.path.join(CALC_DIR, "data", "material_properties.json")
DEFAULT_WEATHER_CSV = os.path.join(
    CALC_DIR, "results", "ansys_boundary_conditions.csv")
RESULTS_ROOT = os.path.join(HERE, "results")


def _metrics(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    err = a - b
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err ** 2)))
    ss_res = float(np.sum(err ** 2))
    ss_tot = float(np.sum((a - a.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return mae, rmse, r2


def _physics_prediction(weather_csv, config):
    weather = pd.read_csv(weather_csv).rename(
        columns={"outdoor_temperature_C": "temperature_C"})
    materials_db = load_materials(MATERIAL_DB_PATH)
    results, _ = run_simulation(weather, config, materials_db)
    df = pd.DataFrame(results)[["timestamp", "indoor_temperature_C"]]
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


def compare_case(case_name, weather_csv=None, config=None):
    weather_csv = weather_csv or DEFAULT_WEATHER_CSV
    config = config or SHELTER_CONFIG

    ansys_csv = os.path.join(RESULTS_ROOT, case_name, "temperature_series.csv")
    ansys = pd.read_csv(ansys_csv)
    ansys["timestamp"] = pd.to_datetime(ansys["timestamp"])

    physics = _physics_prediction(weather_csv, config)

    merged = physics.merge(ansys, on="timestamp")
    if merged.empty:
        raise SystemExit("No overlapping timestamps between physics and ANSYS.")

    py_T = merged["indoor_temperature_C"]
    ansys_T = merged["T_ansys_C"]
    mae, rmse, r2 = _metrics(py_T, ansys_T)

    out = merged[["timestamp"]].copy()
    out["T_python_C"] = py_T.round(3)
    out["T_ansys_C"] = ansys_T.round(3)
    out["abs_error_C"] = (py_T - ansys_T).abs().round(3)
    report_path = os.path.join(RESULTS_ROOT, case_name, "comparison_report.csv")
    out.to_csv(report_path, index=False)

    print(f"\n  {case_name}: Python physics vs ANSYS  ({len(merged)} hours)")
    print(f"    MAE  = {mae:.2f} C")
    print(f"    RMSE = {rmse:.2f} C")
    print(f"    R2   = {r2:.3f}")
    print(f"    max |error| = {out['abs_error_C'].max():.2f} C")
    print(f"    saved {report_path}")

    summary_path = os.path.join(RESULTS_ROOT, "comparison_report.csv")
    row = pd.DataFrame([{
        "case": case_name, "hours": len(merged),
        "MAE_C": round(mae, 3), "RMSE_C": round(rmse, 3), "R2": round(r2, 4),
        "max_abs_error_C": round(float(out["abs_error_C"].max()), 3),
    }])
    if os.path.exists(summary_path):
        prev = pd.read_csv(summary_path)
        prev = prev[prev["case"] != case_name]
        row = pd.concat([prev, row], ignore_index=True)
    row.to_csv(summary_path, index=False)
    return mae, rmse, r2


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", default="case_baseline")
    ap.add_argument("--weather", default=None)
    ap.add_argument(
        "--reverse-walls", action="store_true",
        help="compare against SHELTER_CONFIG with the wall layer order "
             "reversed -- the pre-Step-1 insulation-inside design that "
             "matches results/case_insulation_inside. Without this, "
             "SHELTER_CONFIG (mass-inside) would be paired with the wrong "
             "ANSYS run. See VALIDATION_FINDINGS.md.")
    args = ap.parse_args()

    cfg = SHELTER_CONFIG
    if args.reverse_walls:
        cfg = copy.deepcopy(SHELTER_CONFIG)
        cfg["walls"] = list(reversed(cfg["walls"]))

    compare_case(args.case, args.weather, cfg)
