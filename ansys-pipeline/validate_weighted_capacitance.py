"""
validate_weighted_capacitance.py

Step 2 of the RC-model correction (see VALIDATION_FINDINGS.md): checks the
position-weighted thermal capacitance in thermal_model.py against the
ANSYS 3D reference for BOTH wall orderings at once, and sweeps the single
calibration constant thermal_model.CAPACITANCE_COUPLING_RESISTANCE_M2K_W.

    case_baseline          = mass-inside walls       (current SHELTER_CONFIG)
    case_insulation_inside = insulation-inside walls  (SHELTER_CONFIG walls reversed)

Both ANSYS temperature_series.csv files were produced by pyansys_runner.py
on the same 48 h weather window (results/<case>/); this script never
re-runs ANSYS -- only the fast RC model.

    python validate_weighted_capacitance.py
"""

import os
import sys
import copy

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
CALC_DIR = os.path.join(HERE, "..", "thermal-calculator")
sys.path.insert(0, CALC_DIR)

import thermal_model                              # noqa: E402
from config import SHELTER_CONFIG                 # noqa: E402
from comparison import compare_case               # noqa: E402

# the model's own default, captured before the sweep overwrites it
DEFAULT_RC = thermal_model.CAPACITANCE_COUPLING_RESISTANCE_M2K_W

# current committed config is mass-inside; reverse the wall list to get
# the original insulation-inside design ANSYS ran for case_insulation_inside
MASS_INSIDE = copy.deepcopy(SHELTER_CONFIG)
INSULATION_INSIDE = copy.deepcopy(SHELTER_CONFIG)
INSULATION_INSIDE["walls"] = list(reversed(INSULATION_INSIDE["walls"]))

CASES = [
    ("mass-inside", "case_baseline", MASS_INSIDE),
    ("insulation-inside", "case_insulation_inside", INSULATION_INSIDE),
]

# None -> unweighted lumped baseline (coupling resistance forced huge so
# every layer weight collapses to 1.0)
SWEEP = [None, 0.5, 0.7, 0.8, 0.9, 1.0, 1.5, 2.0]

_LUMPED_SENTINEL = 1.0e9


def _run_at(rc):
    if rc is None:
        thermal_model.CAPACITANCE_COUPLING_RESISTANCE_M2K_W = _LUMPED_SENTINEL
        label = "lumped (unweighted)"
    else:
        thermal_model.CAPACITANCE_COUPLING_RESISTANCE_M2K_W = rc
        label = f"weighted  Rc={rc:>4}"

    row = {"model": label}
    for cfg_label, case_name, cfg in CASES:
        mae, rmse, r2 = compare_case(case_name, config=cfg)
        row[f"{cfg_label}  MAE"] = round(mae, 2)
        row[f"{cfg_label}  RMSE"] = round(rmse, 2)
    return row


def main():
    rows = [_run_at(rc) for rc in SWEEP]
    df = pd.DataFrame(rows)

    pd.set_option("display.width", 140)
    pd.set_option("display.max_columns", 20)
    print("\n" + "=" * 78)
    print("Position-weighted capacitance vs ANSYS 3D  (48 h cold spell, MAE/RMSE in C)")
    print("=" * 78)
    print(df.to_string(index=False))
    print()

    out_csv = os.path.join(HERE, "results", "weighted_capacitance_sweep.csv")
    df.to_csv(out_csv, index=False)
    print(f"saved {out_csv}")

    # leave on-disk comparison_report.csv files at the model's default Rc
    thermal_model.CAPACITANCE_COUPLING_RESISTANCE_M2K_W = DEFAULT_RC
    for _, case_name, cfg in CASES:
        compare_case(case_name, config=cfg)
    print(f"\nfinal comparison_report.csv written at Rc = {DEFAULT_RC}")


if __name__ == "__main__":
    main()
