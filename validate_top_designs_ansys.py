"""
validate_top_designs_ansys.py

Cross-validates the optimizer's shortlist against ANSYS transient-thermal
FEM -- not just design #1, so that "the RC ranking agrees with the FEM
ranking" becomes real evidence rather than an assertion.

For each shortlisted design it:
  1. rebuilds the full config (same as design_ranker), with
     air_changes_per_hour = 0  -- the ANSYS model does not resolve
     infiltration, so both sides are compared infiltration-free;
  2. runs one ANSYS case via ansys-pipeline/pyansys_runner.run_case;
  3. re-runs the Python RC engine on the identical weather window;
  4. computes MAE / RMSE / R2 (RC vs ANSYS) for the indoor air node;
  5. checks whether ANSYS ranks the shortlist in the same order the RC
     model did.

Needs a licensed local ANSYS/MAPDL (ansys-mapdl-core). If MAPDL will not
launch, the script says so and stops -- it does not fake numbers.

Usage:
    python validate_top_designs_ansys.py --ids 49 7 45 --hours 48
    python validate_top_designs_ansys.py --ids 49 7 45 --weather results/weather_worst_case.csv
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent
TC_DIR = ROOT / "thermal-calculator"
ANSYS_DIR = ROOT / "ansys-pipeline"
sys.path.insert(0, str(TC_DIR))
sys.path.insert(0, str(ANSYS_DIR))

import json

import shelter_config as _sc                                 # noqa: E402
from scenario_generator import load_pool                      # noqa: E402
from engine_adapter import simulate as _simulate, get_materials  # noqa: E402


def _metrics(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    mae = float(np.mean(np.abs(a - b)))
    rmse = float(np.sqrt(np.mean((a - b) ** 2)))
    ss_res = float(np.sum((a - b) ** 2))
    ss_tot = float(np.sum((a - np.mean(a)) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return round(mae, 3), round(rmse, 3), round(r2, 3)


def run_validation(run_dir, ids=None, hours=24, fast=True,
                   element_size=None, max_designs=2):
    """Stage 8. Reads run_dir/{shortlist.json, designs_pool.json,
    weather_worstcase.csv, ground_temperature.json}, runs ANSYS on up to
    ``max_designs`` shortlisted designs, writes ansys_validation_summary.csv.

    Returns the summary DataFrame, or None if ANSYS could not run
    (pipeline treats ANSYS as optional evidence, not a gate)."""

    run_dir = Path(run_dir)
    if element_size is None:
        element_size = 0.30 if fast else 0.16

    if ids is None:
        with open(run_dir / "shortlist.json", encoding="utf-8") as fh:
            ids = json.load(fh)["shortlist_ids"]
    ids = list(ids)[:max_designs]

    pool = {d["design_id"]: d for d in load_pool(run_dir / "designs_pool.json")}
    ids = [i for i in ids if i in pool]
    if not ids:
        print("[validate] no valid shortlist ids"); return None

    gmean = json.loads((run_dir / "ground_temperature.json").read_text())["annual_mean_air_C"]
    weather_df = pd.read_csv(run_dir / "weather_worstcase.csv",
                             parse_dates=["timestamp"])

    ansys_weather = run_dir / "ansys_validation_weather.csv"
    weather_df.rename(columns={"temperature_C": "outdoor_temperature_C"})[
        ["timestamp", "outdoor_temperature_C", "solar_radiation_W_m2"]
    ].to_csv(ansys_weather, index=False)

    try:
        from pyansys_runner import run_case
    except Exception as exc:                                   # noqa: BLE001
        print(f"[validate] ANSYS runner unavailable: {exc}")
        return None

    materials = get_materials()
    rows = []
    series_rows = []
    for design_id in ids:
        # ANSYS has no infiltration term -> compare both sides at ACH 0
        cfg = _sc.from_design(pool[design_id], ground_mode="annual_mean",
                              ground_C=gmean, overrides={"air_changes_per_hour": 0.0})
        case = f"opt_rank_{design_id}"
        print(f"\n=== design {design_id}: ANSYS case '{case}' ({hours} h) ===")
        try:
            run_case(cfg, str(ansys_weather), case, max_hours=hours,
                     element_size_m=element_size, fast=fast)
        except Exception as exc:                               # noqa: BLE001
            print(f"[validate] ANSYS run failed for design {design_id}: {exc}")
            return None

        ta = pd.read_csv(ANSYS_DIR / "results" / case /
                         "temperature_series.csv")["T_ansys_C"].to_numpy(float)
        hourly, _ = _simulate(cfg, weather_df, materials, ground_mean_C=gmean)
        tr = hourly["indoor_temperature_C"].to_numpy(float)

        n = min(len(tr), len(ta))
        series_rows.append({
            "design_id": design_id,
            "rc_C": [round(float(x), 2) for x in tr[:n]],
            "ansys_C": [round(float(x), 2) for x in ta[:n]],
        })

        mae, rmse, r2 = _metrics(tr, ta)
        rows.append({
            "design_id": design_id,
            "RC_Tmin_C": round(float(tr.min()), 2),
            "ANSYS_Tmin_C": round(float(ta.min()), 2),
            "RC_Tmean_C": round(float(tr.mean()), 2),
            "ANSYS_Tmean_C": round(float(ta.mean()), 2),
            "RC_Tmax_C": round(float(tr.max()), 2),
            "ANSYS_Tmax_C": round(float(ta.max()), 2),
            "MAE_C": mae, "RMSE_C": rmse, "R2": r2,
        })

    res = pd.DataFrame(rows)
    res["RC_rank"] = res["RC_Tmean_C"].rank(ascending=False).astype(int)
    res["ANSYS_rank"] = res["ANSYS_Tmean_C"].rank(ascending=False).astype(int)
    res.to_csv(run_dir / "ansys_validation_summary.csv", index=False)

    # per-hour RC vs FEM series, for the results-page overlay chart
    n_series = min((len(s["rc_C"]) for s in series_rows), default=0)
    out_T = weather_df["temperature_C"].to_numpy(float)[:n_series]
    (run_dir / "ansys_validation_series.json").write_text(json.dumps({
        "t_hours": list(range(n_series)),
        "outdoor_C": [round(float(x), 2) for x in out_T],
        "designs": [
            {"design_id": s["design_id"],
             "rc_C": s["rc_C"][:n_series],
             "ansys_C": s["ansys_C"][:n_series]}
            for s in series_rows
        ],
    }, indent=2), encoding="utf-8")

    agree = bool((res["RC_rank"] == res["ANSYS_rank"]).all())
    spread = float((res["ANSYS_Tmean_C"] - res["RC_Tmean_C"]).mean())
    gap = float(res["RC_Tmean_C"].max() - res["RC_Tmean_C"].min())
    print("\n" + "=" * 84)
    print("ANSYS CROSS-VALIDATION  -  predicted indoor temperature (C)".center(84))
    print("=" * 84)
    print(res.to_string(index=False))
    print(f"\nANSYS runs {spread:+.2f} C vs RC on average.  "
          f"Design spread {gap:.2f} C, worst MAE {res['MAE_C'].max()} C.")
    if agree:
        print("RANKING AGREES between RC and FEM.")
    elif gap < res["MAE_C"].max():
        print("Ranking differs BUT design spread < MAE -> designs are a "
              "thermal tie; decide on logistics.")
    else:
        print("RANKING DIFFERS and the gap exceeds the MAE -- investigate.")
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run-dir", required=True,
                    help="pipeline run folder (has shortlist.json, "
                         "designs_pool.json, weather_worstcase.csv)")
    ap.add_argument("--ids", type=int, nargs="+", default=None,
                    help="override the shortlist ids")
    ap.add_argument("--hours", type=int, default=24)
    ap.add_argument("--max-designs", type=int, default=2)
    ap.add_argument("--element-size", type=float, default=None)
    ap.add_argument("--full", action="store_true",
                    help="fine mesh + full substeps + exports (slow)")
    args = ap.parse_args()

    res = run_validation(args.run_dir, ids=args.ids, hours=args.hours,
                         fast=not args.full, element_size=args.element_size,
                         max_designs=args.max_designs)
    return 0 if res is not None else 1


if __name__ == "__main__":
    sys.exit(main())
