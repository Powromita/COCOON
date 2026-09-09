"""
report_bundle.py  --  Stage 10 of the integrated pipeline.

Collates one run folder into a single REPORT.md: inputs, the chosen
design, its three DRDO feature reports, the reliability verdict, the
ANSYS validation, and the recommendation.
"""

import json
from pathlib import Path

import pandas as pd


def _load_json(p, default=None):
    p = Path(p)
    return json.loads(p.read_text()) if p.exists() else default


def _fmt_layers(layers):
    return " + ".join(f"{l['material']} ({l['thickness_mm']} mm)" for l in layers)


def build_report(run_dir) -> str:
    run_dir = Path(run_dir)
    L = []
    w = L.append

    cfg = _load_json(run_dir / "run_config.json", {})
    rec = _load_json(run_dir / "recommendation.json")
    shortlist = _load_json(run_dir / "shortlist.json", {})
    pool = {d["design_id"]: d for d in
            _load_json(run_dir / "designs_pool.json", [])}

    w("# COCOON shelter pipeline report\n")
    w(f"_run: `{run_dir.name}`  |  mode: {cfg.get('mode','?')}_\n")

    # --- inputs ---
    w("## 1. Inputs\n")
    for name in ("weather_typical.csv", "weather_worstcase.csv"):
        p = run_dir / name
        if p.exists():
            d = pd.read_csv(p)
            w(f"- **{name}**: {len(d)} h, "
              f"{d['temperature_C'].min():.1f} to {d['temperature_C'].max():.1f} C "
              f"(mean {d['temperature_C'].mean():.1f} C)")
    g = _load_json(run_dir / "ground_temperature.json", {})
    if g:
        w(f"- ground temperature: {g.get('annual_mean_air_C')} C "
          f"(10-yr annual-mean air)")
    if cfg.get("mode") == "optimize":
        w(f"- design pool: {len(pool)} candidates\n")
    else:
        w("")

    # --- chosen design ---
    if rec:
        cid = rec["chosen_design_id"]
        w(f"## 2. Recommended design: #{cid}\n")
        w(f"> {rec['justification']}\n")
        if rec.get("runner_up_id") is not None:
            w(f"Runner-up: #{rec['runner_up_id']}\n")
        d = pool.get(cid)
        if d:
            gm = d["geometry"]
            w(f"- Geometry: {gm['length_m']} x {gm['width_m']} x {gm['height_m']} m")
            w(f"- Walls: {_fmt_layers(d['walls'])}")
            w(f"- Roof: {_fmt_layers(d['roof'])}")
            w(f"- Floor: {_fmt_layers(d['floor'])}")
            w(f"- Windows: {d['windows']['count']} x {d['windows']['type']} "
              f"({d['windows']['area_m2']} m2)\n")
        b = rec.get("basis", {})
        w(f"- comfort score {b.get('chosen_comfort_score')}, "
          f"worst-hour T_min {b.get('chosen_T_min_C')} C, "
          f"envelope mass {b.get('chosen_mass_t')} t\n")
    else:
        cid = None

    # --- feature reports for the chosen design ---
    fdir = run_dir / "features" / str(cid) if cid is not None else None
    if fdir and fdir.exists():
        fs = _load_json(fdir / "feature_summary.json", {})
        w("## 3. DRDO feature reports (chosen design)\n")
        f1 = fs.get("feature1_temperature", {})
        w(f"**Feature 1 - inside temperature:** "
          f"min {f1.get('T_min_C')} / mean {f1.get('T_mean_C')} / "
          f"max {f1.get('T_max_C')} C over {f1.get('hours')} h")
        w(f"![temperature](features/{cid}/temperature.png)\n")
        f2 = fs.get("feature2_solar", {})
        w(f"**Feature 2 - solar energy:** total "
          f"{f2.get('total_energy_Wh')} Wh ({f2.get('total_energy_MJ')} MJ), "
          f"peak gain {f2.get('peak_gain_W')} W")
        w(f"![solar](features/{cid}/solar_analysis.png)\n")
        f3 = fs.get("feature3_heatflow", {})
        w(f"**Feature 3 - heat flow:** total loss "
          f"{f3.get('total_heat_loss_Wh')} Wh; "
          f"walls {f3.get('wall_fraction_percent')}% / "
          f"roof {f3.get('roof_fraction_percent')}% / "
          f"floor {f3.get('floor_fraction_percent')}% / "
          f"windows {f3.get('window_fraction_percent')}% / "
          f"infiltration {f3.get('infiltration_fraction_percent')}%")
        w(f"![heatflow](features/{cid}/heat_flow_analysis.png)\n")

    # --- reliability ---
    rel = run_dir / "reliability_report.md"
    if rel.exists():
        w("## 4. Reliability\n")
        w(f"- verdict: {shortlist.get('verdict','?')}")
        w(f"- robust shortlist: {shortlist.get('shortlist_ids')}")
        w(f"- Pareto-optimal: {shortlist.get('pareto_ids')}")
        w(f"- top-3 stable across typical vs worst-case weather: "
          f"{shortlist.get('top3_stable_across_weather')}")
        w("![sensitivity](reliability_sensitivity.png)")
        w("![pareto](reliability_pareto.png)\n")

    # --- ansys ---
    ap = run_dir / "ansys_validation_summary.csv"
    if ap.exists():
        a = pd.read_csv(ap)
        w("## 5. ANSYS cross-validation\n")
        w(a.to_markdown(index=False))
        gap = a["RC_Tmean_C"].max() - a["RC_Tmean_C"].min()
        w(f"\nDesign spread {gap:.2f} C vs worst MAE {a['MAE_C'].max()} C.\n")
    else:
        w("## 5. ANSYS cross-validation\n\n_not run for this pipeline pass._\n")

    text = "\n".join(L) + "\n"
    (run_dir / "REPORT.md").write_text(text, encoding="utf-8")
    print(f"[report] wrote {run_dir / 'REPORT.md'}")
    return str(run_dir / "REPORT.md")


if __name__ == "__main__":
    import sys
    build_report(sys.argv[1])
