"""
web_results.py  --  assemble one runs/<id>/results.json in the frontend's
RunResults shape (cocoon-frontend/app/_lib/types.ts). Called as the last
step of run_pipeline.py in both modes; the API then serves the file.
"""

import json
from pathlib import Path

import pandas as pd


def _load(p, default=None):
    p = Path(p)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def _window_meta(run_dir: Path) -> dict:
    def stat(name, col, fn):
        p = run_dir / name
        if not p.exists():
            return None
        s = pd.read_csv(p)[col]
        return round(float(getattr(s, fn)()), 1)

    typ = pd.read_csv(run_dir / "weather_typical.csv") if (run_dir / "weather_typical.csv").exists() else None
    wcs = pd.read_csv(run_dir / "weather_worstcase.csv") if (run_dir / "weather_worstcase.csv").exists() else None
    return {
        "typical_hours": int(len(typ)) if typ is not None else 0,
        "worst_hours": int(len(wcs)) if wcs is not None else 0,
        "typical_mean_C": round(float(typ["temperature_C"].mean()), 1) if typ is not None else 0.0,
        "worst_min_C": round(float(wcs["temperature_C"].min()), 1) if wcs is not None else 0.0,
    }


def _comparison(run_dir: Path) -> list:
    csv = run_dir / "optimization_results.csv"
    sl = _load(run_dir / "shortlist.json", {})
    if not csv.exists():
        return []
    short = set(sl.get("shortlist_ids", []))
    pareto = set(sl.get("pareto_ids", []))
    rows = []
    for _, r in pd.read_csv(csv).iterrows():
        rows.append({
            "rank": int(r["rank"]),
            "design_id": int(r["design_id"]),
            "comfort_score": float(r["comfort_score"]),
            "geometry_label": f"{r['length_m']}x{r['width_m']}x{r['height_m']}",
            "av_ratio": float(r.get("av_ratio", 0) or 0),
            "wwr_percent": float(r.get("wwr_percent", 0) or 0),
            "walls_label": str(r.get("walls", "") or ""),
            "roof_label": str(r.get("roof", "") or ""),
            "floor_label": str(r.get("floor", "") or ""),
            "T_min_C": float(r["T_min_C"]),
            "T_max_C": float(r["T_max_C"]),
            "swing_C": float(r["swing_C"]),
            "hours_in_band_pct": float(r.get("hours_in_band_pct", 0) or 0),
            "shortlisted": int(r["design_id"]) in short,
            "pareto": int(r["design_id"]) in pareto,
        })
    return rows


def _reliability(run_dir: Path) -> dict | None:
    rj = _load(run_dir / "reliability.json")
    sl = _load(run_dir / "shortlist.json", {})
    if rj:
        return rj
    if not sl:
        return None
    # fall back to shortlist.json only
    comp = {c["design_id"]: c for c in _comparison(run_dir)}
    return {
        "verdict": sl.get("verdict", ""),
        "shortlist_ids": sl.get("shortlist_ids", []),
        "pareto_ids": sl.get("pareto_ids", []),
        "top3_stable_across_weather": bool(sl.get("top3_stable_across_weather", False)),
        "sensitivity": [],
        "pareto_points": [
            {"design_id": i, "swing_C": comp.get(i, {}).get("swing_C", 0),
             "T_min_C": comp.get(i, {}).get("T_min_C", 0),
             "pareto": i in set(sl.get("pareto_ids", []))}
            for i in sl.get("shortlist_ids", [])
        ],
    }


def _logistics(run_dir: Path) -> list:
    p = run_dir / "logistics.csv"
    if not p.exists():
        return []
    out = []
    for _, r in pd.read_csv(p).iterrows():
        out.append({
            "design_id": int(r["design_id"]),
            "envelope_mass_t": float(r["envelope_mass_t"]),
            "material_cost_lakh_inr": round(float(r["material_cost_inr"]) / 1e5, 2),
            "transportability_1to5": float(r["transportability_1to5"]),
        })
    return out


def _ansys(run_dir: Path) -> dict:
    p = run_dir / "ansys_validation_summary.csv"
    if not p.exists():
        bench_ref = Path(__file__).parent / "benchmarks" / "ansys_reference"
        bench_legacy = Path(__file__).parent / "runs" / "20260909T193431Z-8d13"
        bench = bench_ref if (bench_ref / "ansys_validation_summary.csv").exists() else bench_legacy
        if (bench / "ansys_validation_summary.csv").exists():
            try:
                b_df = pd.read_csv(bench / "ansys_validation_summary.csv")
                rows = [{
                    "design_id": int(r["design_id"]),
                    "RC_Tmin_C": float(r["RC_Tmin_C"]), "ANSYS_Tmin_C": float(r["ANSYS_Tmin_C"]),
                    "RC_Tmean_C": float(r["RC_Tmean_C"]), "ANSYS_Tmean_C": float(r["ANSYS_Tmean_C"]),
                    "RC_Tmax_C": float(r["RC_Tmax_C"]), "ANSYS_Tmax_C": float(r["ANSYS_Tmax_C"]),
                    "MAE_C": float(r["MAE_C"]), "RMSE_C": float(r["RMSE_C"]),
                    "RC_rank": int(r["RC_rank"]), "ANSYS_rank": int(r["ANSYS_rank"]),
                } for _, r in b_df.iterrows()]
                agree = bool((b_df["RC_rank"] == b_df["ANSYS_rank"]).all())
                offset = round(float((b_df["ANSYS_Tmean_C"] - b_df["RC_Tmean_C"]).mean()), 2)
                return {"ran": False, "is_benchmark": True, "rows": rows, "rankings_agree": agree,
                        "mean_offset_C": offset, "worst_mae_C": round(float(b_df["MAE_C"].max()), 2),
                        "series": _load(bench / "ansys_validation_series.json")}
            except Exception:
                pass
        return {"ran": False, "rows": [], "rankings_agree": True,
                "mean_offset_C": 0.0, "worst_mae_C": 0.0, "series": None}
    df = pd.read_csv(p)
    rows = [{
        "design_id": int(r["design_id"]),
        "RC_Tmin_C": float(r["RC_Tmin_C"]), "ANSYS_Tmin_C": float(r["ANSYS_Tmin_C"]),
        "RC_Tmean_C": float(r["RC_Tmean_C"]), "ANSYS_Tmean_C": float(r["ANSYS_Tmean_C"]),
        "RC_Tmax_C": float(r["RC_Tmax_C"]), "ANSYS_Tmax_C": float(r["ANSYS_Tmax_C"]),
        "MAE_C": float(r["MAE_C"]), "RMSE_C": float(r["RMSE_C"]),
        "RC_rank": int(r["RC_rank"]), "ANSYS_rank": int(r["ANSYS_rank"]),
    } for _, r in df.iterrows()]
    agree = bool((df["RC_rank"] == df["ANSYS_rank"]).all())
    offset = round(float((df["ANSYS_Tmean_C"] - df["RC_Tmean_C"]).mean()), 2)
    return {"ran": True, "is_benchmark": False, "rows": rows, "rankings_agree": agree,
            "mean_offset_C": offset, "worst_mae_C": round(float(df["MAE_C"].max()), 2),
            "series": _load(run_dir / "ansys_validation_series.json")}


def _recommendation(run_dir: Path, chosen_features: dict | None) -> dict | None:
    rec = _load(run_dir / "recommendation.json")
    if not rec:
        return None
    ce = (chosen_features or {}).get("config_echo", {})
    ft = (chosen_features or {}).get("feature1_temperature") or \
         (chosen_features or {}).get("features", {}).get("temperature", {})
    return {
        "chosen_design_id": rec.get("chosen_design_id"),
        "runner_up_id": rec.get("runner_up_id"),
        "thermal_tie": bool(rec.get("thermal_tie", False)),
        "justification": rec.get("justification", ""),
        "chosen": {
            "geometry_label": ce.get("footprint_label", ""),
            "walls_label": ce.get("wall_label", ""),
            "roof_label": ce.get("roof_label", ""),
            "floor_label": ce.get("floor_label", ""),
            "windows_label": ce.get("glazing_label", ""),
            "comfort_score": (chosen_features or {}).get("comfort", {}).get("comfort_score", 0),
            "T_min_C": ft.get("T_min_C", 0),
            "envelope_mass_t": (chosen_features or {}).get("resolved", {}).get("envelope_mass_t", 0),
        },
    }


def assemble_results(run_dir, mode: str, run_id: str) -> dict:
    run_dir = Path(run_dir)

    if mode == "single":
        feat = _load(run_dir / "features" / "single" / "results.json")
        if feat is None:
            raise FileNotFoundError("features/single/results.json missing")
        feat["run_id"] = run_id
        feat["mode"] = "single"
        feat["window"] = _window_meta(run_dir)
        feat["report_md_url"] = "REPORT.md"
        feat["ansys"] = _ansys(run_dir)
        return feat

    # optimize: base off the chosen design's feature block
    rec = _load(run_dir / "recommendation.json", {})
    chosen = rec.get("chosen_design_id")
    feat = _load(run_dir / "features" / str(chosen) / "results.json") or {}

    out = {
        "run_id": run_id,
        "mode": "optimize",
        "window": _window_meta(run_dir),
        "resolved": feat.get("resolved", {}),
        "features": feat.get("features", {}),
        "comfort": feat.get("comfort", {}),
        "heating": feat.get("heating", {}),
        "highlights": feat.get("highlights", []),
        "config_echo": feat.get("config_echo", {}),
        "comparison": _comparison(run_dir),
        "reliability": _reliability(run_dir),
        "recommendation": _recommendation(run_dir, feat),
        "logistics": _logistics(run_dir),
        "ansys": _ansys(run_dir),
        "report_md_url": "REPORT.md",
    }
    return out


def write_results(run_dir, mode: str, run_id: str) -> Path:
    run_dir = Path(run_dir)
    data = assemble_results(run_dir, mode, run_id)
    p = run_dir / "results.json"
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"[web_results] wrote {p}")
    return p


if __name__ == "__main__":
    import sys
    rd = Path(sys.argv[1])
    m = sys.argv[2] if len(sys.argv) > 2 else "single"
    print(json.dumps(assemble_results(rd, m, rd.name), indent=2)[:2000])
