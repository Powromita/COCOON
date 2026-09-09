"""
recommend.py  --  Stage 9 of the integrated pipeline.

Turns the evidence in a run folder into one stated choice.

Rule:
  candidates = shortlist_ids
  if the candidates' comfort-score spread (and, when ANSYS ran, their
  ANSYS mean-temperature spread) is smaller than the RC-vs-ANSYS MAE ->
  declare a THERMAL TIE and pick on deployability
  (lowest envelope mass, then highest transportability, then lowest cost).
  otherwise -> pick the highest comfort score whose ANSYS rank (if any)
  is <= 2.
"""

import json
from pathlib import Path

import pandas as pd

_TIE_COMFORT_SPREAD = 4.0     # score points, used when ANSYS did not run


def recommend(run_dir) -> dict:
    run_dir = Path(run_dir)

    opt = pd.read_csv(run_dir / "optimization_results.csv")
    shortlist = json.loads((run_dir / "shortlist.json").read_text())
    ids = shortlist["shortlist_ids"]
    log = pd.read_csv(run_dir / "logistics.csv").set_index("design_id")

    ansys_path = run_dir / "ansys_validation_summary.csv"
    ansys = pd.read_csv(ansys_path) if ansys_path.exists() else None

    cand = opt[opt["design_id"].isin(ids)].copy()
    comfort_spread = float(cand["comfort_score"].max() - cand["comfort_score"].min())

    tie = False
    reason_bits = []
    if ansys is not None and len(ansys) >= 2:
        a_spread = float(ansys["ANSYS_Tmean_C"].max() - ansys["ANSYS_Tmean_C"].min())
        mae = float(ansys["MAE_C"].max())
        tie = a_spread < mae
        reason_bits.append(
            f"ANSYS FEM: the shortlisted designs are {a_spread:.2f} C apart "
            f"in mean indoor temperature, inside the {mae:.2f} C RC-vs-FEM "
            f"error -> thermally indistinguishable"
            if tie else
            f"ANSYS FEM: designs {a_spread:.2f} C apart, above the "
            f"{mae:.2f} C model error -> a real difference"
        )
    else:
        tie = comfort_spread < _TIE_COMFORT_SPREAD
        reason_bits.append(
            f"comfort scores span only {comfort_spread:.1f} points across the "
            f"shortlist -> treated as a tie" if tie else
            f"comfort scores span {comfort_spread:.1f} points -> a clear leader"
        )

    if tie:
        rank_df = log.loc[[i for i in ids if i in log.index]].copy()
        rank_df = rank_df.sort_values(
            ["envelope_mass_t", "transportability_1to5", "material_cost_inr"],
            ascending=[True, False, True],
        )
        chosen = int(rank_df.index[0])
        runner_up = int(rank_df.index[1]) if len(rank_df) > 1 else None
        reason_bits.append(
            f"tie broken on logistics: design {chosen} is the lightest "
            f"({log.loc[chosen, 'envelope_mass_t']} t) with transportability "
            f"{log.loc[chosen, 'transportability_1to5']}/5"
        )
    else:
        order = cand.sort_values("comfort_score", ascending=False)
        if ansys is not None:
            ok = set(ansys[ansys["ANSYS_rank"] <= 2]["design_id"])
            order = pd.concat([order[order["design_id"].isin(ok)],
                               order[~order["design_id"].isin(ok)]])
        chosen = int(order.iloc[0]["design_id"])
        runner_up = int(order.iloc[1]["design_id"]) if len(order) > 1 else None
        reason_bits.append(
            f"design {chosen} has the top comfort score "
            f"({float(order.iloc[0]['comfort_score'])})"
        )

    row = opt[opt["design_id"] == chosen].iloc[0]
    out = {
        "chosen_design_id": chosen,
        "runner_up_id": runner_up,
        "thermal_tie": bool(tie),
        "justification": "; ".join(reason_bits) + ".",
        "basis": {
            "shortlist": ids,
            "comfort_spread_points": round(comfort_spread, 1),
            "chosen_comfort_score": float(row["comfort_score"]),
            "chosen_T_min_C": float(row["T_min_C"]),
            "chosen_mass_t": float(log.loc[chosen, "envelope_mass_t"])
            if chosen in log.index else None,
            "ansys_ran": ansys is not None,
        },
    }
    with open(run_dir / "recommendation.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"[recommend] chosen design {chosen}"
          + (f", runner-up {runner_up}" if runner_up is not None else ""))
    print(f"            {out['justification']}")
    return out


if __name__ == "__main__":
    import sys
    print(recommend(sys.argv[1]))
