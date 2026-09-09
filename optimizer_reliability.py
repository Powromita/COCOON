"""
optimizer_reliability.py

Makes the shelter-design optimizer's "best design" claim defensible
instead of taking the single top comfort score on faith. It runs, on one
pool of candidate designs:

  1. SENSITIVITY ANALYSIS
     Perturbs the five comfort-score weights by +/- a jitter fraction
     many times, re-ranks, and reports how often each design lands in the
     top 3. If no design owns the top spot across the perturbations, it
     reports a *robust shortlist* rather than a single winner.

  2. REAL WORST-CASE WEATHER
     Instead of a tiled average day, it pulls a long real NASA POWER
     window for the site and ranks on the coldest contiguous stretch in
     it -- the condition the shelter actually has to survive.

  3. PARETO FRONT
     Finds the designs that are not beaten on all of {high T_min,
     low swing, high hours-in-band} simultaneously, so the trade-off the
     scalar score hides is visible.

  4. LOGISTICS PROFILE  (cost / weight / transportability)
     Estimates each shortlisted design's envelope mass, material cost and
     a transportability score from shelter_material_logistics.csv, and
     offers an optional deployability-weighted ranking.

ANSYS cross-validation of the shortlist is a separate script,
validate_top_designs_ansys.py (it needs a licensed ANSYS/MAPDL).

Usage:
    python optimizer_reliability.py --designs 50 --trials 400
    python optimizer_reliability.py --no-fetch      # skip the NASA call
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).parent
TC_DIR = ROOT / "thermal-calculator"
sys.path.insert(0, str(TC_DIR))

from scenario_generator import ScenarioGenerator            # noqa: E402
from design_ranker import (                                  # noqa: E402
    DesignRanker, comfort_score, _SCORE_WEIGHTS,
    COMFORT_TARGET_C, COMFORT_BAND_C,
)

# Leh, Ladakh -- the project's reference site
SITE_LAT, SITE_LON = 34.1526, 77.5771
RESULTS = ROOT / "results"


# ==================================================
# 2. REAL WORST-CASE WEATHER
# ==================================================

def fetch_worst_case_weather(
    window_hours=72,
    scan_start="20240101",
    scan_end="20240215",
    out_csv=RESULTS / "weather_worst_case.csv",
):
    """Pull a long real NASA POWER window for the site and return the
    coldest ``window_hours``-long contiguous slice of it.

    Falls back to tiling the synthetic ``data/weather_data.csv`` if the
    NASA call fails (no network).
    """

    from weather import fetch_nasa_power_weather

    try:
        print(f"[weather] fetching NASA POWER {scan_start}..{scan_end} "
              f"for {SITE_LAT},{SITE_LON} ...")
        wx = fetch_nasa_power_weather(
            latitude=SITE_LAT, longitude=SITE_LON,
            start_date=scan_start, end_date=scan_end,
        )
        wx = wx.sort_values("timestamp").reset_index(drop=True)

        roll = wx["temperature_C"].rolling(window_hours).mean()
        end = int(roll.idxmin())
        start = max(0, end - window_hours + 1)
        worst = wx.iloc[start:end + 1].reset_index(drop=True)

        out_csv.parent.mkdir(parents=True, exist_ok=True)
        worst.to_csv(out_csv, index=False)
        print(
            f"[weather] coldest {len(worst)} h window: "
            f"{worst['timestamp'].iloc[0]} -> {worst['timestamp'].iloc[-1]}  "
            f"(mean {worst['temperature_C'].mean():.1f} C, "
            f"min {worst['temperature_C'].min():.1f} C)  -> {out_csv.name}"
        )
        return str(out_csv), True

    except Exception as exc:                                   # noqa: BLE001
        print(f"[weather] NASA fetch failed ({exc}); "
              f"falling back to tiled synthetic weather")
        return str(TC_DIR / "data" / "weather_data.csv"), False


# ==================================================
# 1. SENSITIVITY ANALYSIS
# ==================================================

def sensitivity_analysis(evaluated, n_trials=400, jitter=0.5, top_k=3,
                         shortlist_freq=0.5, seed=0):
    """Perturb the score weights ``n_trials`` times and see whether the
    ranking holds.

    ``evaluated`` is the successful-designs list from
    ``DesignRanker.evaluate_all`` -- each carries ``hourly_indoor_C``.

    Returns a dict: per-design frequencies, the robust shortlist, and a
    verdict string.
    """

    rng = np.random.default_rng(seed)
    ids = [d["design_id"] for d in evaluated]
    series = {d["design_id"]: np.asarray(d["hourly_indoor_C"], float)
              for d in evaluated}

    top1 = {i: 0 for i in ids}
    topk = {i: 0 for i in ids}
    ranks = {i: [] for i in ids}

    base_keys = list(_SCORE_WEIGHTS)

    for _ in range(n_trials):
        w = {
            k: _SCORE_WEIGHTS[k] * float(rng.uniform(1 - jitter, 1 + jitter))
            for k in base_keys
        }
        scored = sorted(
            ids,
            key=lambda i: comfort_score(series[i], weights=w)["comfort_score"],
            reverse=True,
        )
        for rank, i in enumerate(scored, 1):
            ranks[i].append(rank)
        top1[scored[0]] += 1
        for i in scored[:top_k]:
            topk[i] += 1

    rows = []
    for i in ids:
        rr = np.array(ranks[i])
        rows.append({
            "design_id": i,
            "freq_rank1_pct": round(100 * top1[i] / n_trials, 1),
            f"freq_top{top_k}_pct": round(100 * topk[i] / n_trials, 1),
            "mean_rank": round(rr.mean(), 1),
            "best_rank": int(rr.min()),
            "worst_rank": int(rr.max()),
        })
    table = pd.DataFrame(rows).sort_values(
        f"freq_top{top_k}_pct", ascending=False
    ).reset_index(drop=True)

    shortlist = table.loc[
        table[f"freq_top{top_k}_pct"] >= shortlist_freq * 100, "design_id"
    ].tolist()

    base_best = max(
        ids, key=lambda i: comfort_score(series[i])["comfort_score"]
    )
    if table.loc[table.design_id == base_best, "freq_rank1_pct"].iloc[0] >= 80:
        verdict = (
            f"STABLE: design {base_best} is rank 1 in "
            f">=80% of perturbed rankings -- a single winner is defensible."
        )
    else:
        verdict = (
            f"NOT a clean single winner: the top spot moves under weight "
            f"perturbation. Report the robust shortlist "
            f"{shortlist} instead of one design."
        )

    return {
        "table": table,
        "shortlist": shortlist,
        "base_best": base_best,
        "verdict": verdict,
        "n_trials": n_trials,
        "jitter": jitter,
        "top_k": top_k,
    }


def plot_sensitivity(sens, out_png=RESULTS / "reliability_sensitivity.png"):
    t = sens["table"].head(12).iloc[::-1]
    fig, ax = plt.subplots(figsize=(10, 6))
    colours = [
        "#1b7837" if i in sens["shortlist"] else "#b0b0b0"
        for i in t["design_id"]
    ]
    ax.barh(
        [f"#{i}" for i in t["design_id"]],
        t[f"freq_top{sens['top_k']}_pct"],
        color=colours, edgecolor="black", linewidth=0.5,
    )
    ax.axvline(50, ls="--", color="k", lw=1)
    ax.set_xlabel(f"% of {sens['n_trials']} perturbed rankings in top "
                  f"{sens['top_k']}")
    ax.set_title(
        f"Weight-sensitivity of the comfort ranking "
        f"(weights jittered +/-{int(sens['jitter']*100)}%)\n"
        f"green = robust shortlist (>=50%)"
    )
    ax.grid(alpha=0.3, axis="x")
    fig.tight_layout()
    out_png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_png, dpi=150)
    plt.close(fig)
    return str(out_png)


# ==================================================
# 3. PARETO FRONT
# ==================================================

def pareto_front(evaluated):
    """Non-dominated set on {T_min up, swing down, hours-in-band up}."""

    pts = [
        {
            "design_id": d["design_id"],
            "T_min": d["T_min"],
            "swing_C": d["swing_C"],
            "hours_in_band_pct": d["hours_in_band_pct"],
            "comfort_score": d["comfort_score"],
        }
        for d in evaluated
    ]

    def dominates(a, b):
        # a dominates b if >= on every objective and > on at least one
        ge = (
            a["T_min"] >= b["T_min"]
            and a["swing_C"] <= b["swing_C"]
            and a["hours_in_band_pct"] >= b["hours_in_band_pct"]
        )
        gt = (
            a["T_min"] > b["T_min"]
            or a["swing_C"] < b["swing_C"]
            or a["hours_in_band_pct"] > b["hours_in_band_pct"]
        )
        return ge and gt

    front = [
        p for p in pts
        if not any(dominates(q, p) for q in pts if q is not p)
    ]
    front.sort(key=lambda p: p["T_min"], reverse=True)
    return front, pts


def plot_pareto(front, pts, out_png=RESULTS / "reliability_pareto.png"):
    fig, ax = plt.subplots(figsize=(10, 6))
    front_ids = {p["design_id"] for p in front}

    sc = ax.scatter(
        [p["swing_C"] for p in pts],
        [p["T_min"] for p in pts],
        c=[p["hours_in_band_pct"] for p in pts],
        cmap="viridis", s=60, edgecolor="#888", linewidth=0.5,
    )
    fx = [p["swing_C"] for p in sorted(front, key=lambda p: p["swing_C"])]
    fy = [p["T_min"] for p in sorted(front, key=lambda p: p["swing_C"])]
    ax.plot(fx, fy, "-", color="#d62728", lw=1.5, zorder=1)
    ax.scatter(
        [p["swing_C"] for p in front],
        [p["T_min"] for p in front],
        s=150, facecolors="none", edgecolors="#d62728", linewidths=2,
        label="Pareto-optimal", zorder=3,
    )
    for p in front:
        ax.annotate(f"#{p['design_id']}", (p["swing_C"], p["T_min"]),
                    textcoords="offset points", xytext=(6, 4), fontsize=8)

    ax.set_xlabel("indoor temperature swing  T_max - T_min  (C)  [lower better]")
    ax.set_ylabel("worst-hour indoor temperature  T_min  (C)  [higher better]")
    ax.set_title("Design trade-off: worst-hour warmth vs stability\n"
                 "colour = % hours in comfort band")
    fig.colorbar(sc, label="hours in 15-24 C band (%)")
    ax.legend(loc="lower left")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    out_png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_png, dpi=150)
    plt.close(fig)
    return str(out_png)


# ==================================================
# 4. LOGISTICS PROFILE
# ==================================================

def load_logistics(csv_path=ROOT / "shelter_material_logistics.csv"):
    df = pd.read_csv(csv_path)
    return {
        str(r["material"]).strip().lower(): {
            "cost_inr_per_m3": float(r["cost_inr_per_m3"]),
            "transportability_score": float(r["transportability_score"]),
        }
        for _, r in df.iterrows()
    }


def logistics_profile(design, materials_db, logistics):
    """Estimate envelope mass (kg), material cost (INR) and a
    volume-weighted transportability score (1 hard .. 5 easy)."""

    g = design["geometry"]
    L, W, H = g["length_m"], g["width_m"], g["height_m"]
    area = {
        "walls": 2 * (L * H + W * H),
        "roof": L * W,
        "floor": L * W,
    }

    mass_kg = 0.0
    cost_inr = 0.0
    vol_total = 0.0
    transport_weighted = 0.0

    for surface in ("walls", "roof", "floor"):
        for layer in design[surface]:
            mat = str(layer["material"]).strip().lower()
            vol = area[surface] * layer["thickness_mm"] / 1000.0
            density = materials_db.get(mat, {}).get("density", 0.0)
            log = logistics.get(mat, {})
            mass_kg += vol * density
            cost_inr += vol * log.get("cost_inr_per_m3", 0.0)
            transport_weighted += vol * log.get("transportability_score", 3.0)
            vol_total += vol

    transportability = (
        transport_weighted / vol_total if vol_total else float("nan")
    )
    return {
        "design_id": design["design_id"],
        "envelope_mass_kg": round(mass_kg, 0),
        "envelope_mass_t": round(mass_kg / 1000.0, 2),
        "material_cost_inr": round(cost_inr, 0),
        "transportability_1to5": round(transportability, 2),
    }


def deployability_ranking(evaluated, logistics_rows, w_comfort=1.0,
                          w_cost=4.0, w_mass=1.5, w_transport=4.0):
    """Optional combined ranking: comfort minus deployment burden.

    Cost is in lakh INR, mass in tonnes, transportability 1-5. Weights
    are deliberately exposed -- deployment priorities are a command
    decision, not a physics constant.
    """

    by_id = {r["design_id"]: r for r in logistics_rows}
    rows = []
    for d in evaluated:
        lg = by_id.get(d["design_id"], {})
        deploy = (
            w_comfort * d["comfort_score"]
            - w_cost * (lg.get("material_cost_inr", 0) / 1e5)
            - w_mass * lg.get("envelope_mass_t", 0)
            + w_transport * lg.get("transportability_1to5", 3)
        )
        rows.append({
            "design_id": d["design_id"],
            "comfort_score": d["comfort_score"],
            "mass_t": lg.get("envelope_mass_t"),
            "cost_lakh_inr": round(lg.get("material_cost_inr", 0) / 1e5, 2),
            "transportability": lg.get("transportability_1to5"),
            "deployability_score": round(deploy, 1),
        })
    return pd.DataFrame(rows).sort_values(
        "deployability_score", ascending=False
    ).reset_index(drop=True)


# ==================================================
# ORCHESTRATOR
# ==================================================

def run_reliability(run_dir, trials=400, jitter=0.5, top_k=3):
    """Stage 7. Reads the run folder's designs_pool.json,
    evaluated_typical.json and weather_worstcase.csv; writes
    reliability_sensitivity.png, reliability_pareto.png,
    reliability_report.md, shortlist.json and logistics.csv back."""

    import json as _json
    from scenario_generator import load_pool
    from weather_archive import annual_mean_air_C, load_archive

    run_dir = Path(run_dir)
    line = "=" * 84

    designs = load_pool(run_dir / "designs_pool.json")
    dmap = {d["design_id"]: d for d in designs}
    with open(run_dir / "evaluated_typical.json", encoding="utf-8") as fh:
        evaluated = _json.load(fh)
    base_rank = [d["design_id"] for d in evaluated]

    # --- 1. sensitivity (on the typical-weather scores) ----------
    print("\n" + line)
    print("1. WEIGHT-SENSITIVITY ANALYSIS".center(84))
    print(line)
    sens = sensitivity_analysis(evaluated, n_trials=trials, jitter=jitter,
                                top_k=top_k)
    print(sens["table"].head(10).to_string(index=False))
    print(f"\nbase ranking (top 6): {base_rank[:6]}")
    print(f"robust shortlist    : {sens['shortlist']}")
    print(f"\nVERDICT: {sens['verdict']}")
    p_sens = plot_sensitivity(sens, out_png=run_dir / "reliability_sensitivity.png")

    # --- 2. re-rank on the real worst-case window --------------
    print("\n" + line)
    print("2. RE-RANK ON WORST-CASE WEATHER".center(84))
    print(line)
    wcs = pd.read_csv(run_dir / "weather_worstcase.csv", parse_dates=["timestamp"])
    gmean = annual_mean_air_C(load_archive())
    wr = DesignRanker(wcs, ground_mean_C=gmean, ground_mode="annual_mean")
    worst_eval = wr.evaluate_pool(str(run_dir / "designs_pool.json"))
    worst_rank = [d["design_id"] for d in worst_eval]
    print(f"typical-weather top 5 : {base_rank[:5]}")
    print(f"worst-case  top 5     : {worst_rank[:5]}")
    stable_top3 = set(base_rank[:3]) == set(worst_rank[:3])
    print(f"top-3 identical across weather: {stable_top3}")

    # --- 3. pareto (on typical) --------------------------------
    print("\n" + line)
    print("3. PARETO FRONT  (T_min up / swing down / in-band up)".center(84))
    print(line)
    front, pts = pareto_front(evaluated)
    fdf = pd.DataFrame(front)[
        ["design_id", "T_min", "swing_C", "hours_in_band_pct", "comfort_score"]
    ]
    print(fdf.to_string(index=False))
    print(f"\n{len(front)} of {len(evaluated)} designs are Pareto-optimal.")
    p_par = plot_pareto(front, pts, out_png=run_dir / "reliability_pareto.png")

    # --- 4. logistics -----------------------------------------
    print("\n" + line)
    print("4. LOGISTICS / DEPLOYABILITY".center(84))
    print(line)
    from engine_adapter import get_materials
    logistics = load_logistics()
    focus_ids = sorted(
        set(sens["shortlist"]) | {p["design_id"] for p in front}
        | set(worst_rank[:3])
    )
    log_rows = [logistics_profile(dmap[i], get_materials(), logistics)
                for i in focus_ids]
    log_df = pd.DataFrame(log_rows)
    print(log_df.to_string(index=False))
    log_df.to_csv(run_dir / "logistics.csv", index=False)

    deploy = deployability_ranking(
        [d for d in evaluated if d["design_id"] in focus_ids], log_rows
    )
    print("\ndeployability-weighted ranking:")
    print(deploy.to_string(index=False))

    # --- shortlist.json --------------------------------------
    shortlist = {
        "shortlist_ids": sens["shortlist"],
        "verdict": sens["verdict"],
        "pareto_ids": [p["design_id"] for p in front],
        "typical_top5": base_rank[:5],
        "worstcase_top5": worst_rank[:5],
        "top3_stable_across_weather": bool(stable_top3),
    }
    with open(run_dir / "shortlist.json", "w", encoding="utf-8") as fh:
        _json.dump(shortlist, fh, indent=2)

    # --- report ---------------------------------------------
    report = run_dir / "reliability_report.md"
    with open(report, "w", encoding="utf-8") as fh:
        fh.write("# Optimizer reliability report\n\n")
        fh.write(f"- designs: {len(designs)}\n")
        fh.write(f"- comfort target {COMFORT_TARGET_C} C, band "
                 f"{COMFORT_BAND_C[0]}-{COMFORT_BAND_C[1]} C\n\n")
        fh.write(f"## 1. Sensitivity\n\n{sens['verdict']}\n\n")
        fh.write(f"Robust shortlist: {sens['shortlist']}\n\n")
        fh.write(sens["table"].head(10).to_markdown(index=False))
        fh.write("\n\n## 2. Weather robustness\n\n")
        fh.write(f"typical-weather top 5: {base_rank[:5]}\n\n")
        fh.write(f"worst-case top 5: {worst_rank[:5]}\n\n")
        fh.write(f"top-3 identical across weather: {stable_top3}\n\n")
        fh.write("## 3. Pareto front\n\n")
        fh.write(fdf.to_markdown(index=False))
        fh.write("\n\n## 4. Logistics\n\n")
        fh.write(log_df.to_markdown(index=False))
        fh.write("\n\n### Deployability-weighted\n\n")
        fh.write(deploy.to_markdown(index=False))
        fh.write("\n")
    print(f"\n[ok] wrote {report}, shortlist.json, logistics.csv")
    print(f"[ok] plots: {p_sens} , {p_par}")
    return shortlist


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--designs", type=int, default=50)
    ap.add_argument("--trials", type=int, default=400)
    ap.add_argument("--jitter", type=float, default=0.5)
    ap.add_argument("--hours", type=int, default=72)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--no-fetch", action="store_true",
                    help="skip the NASA call, use the tiled synthetic day")
    args = ap.parse_args()

    RESULTS.mkdir(parents=True, exist_ok=True)
    line = "=" * 84

    # --- weather -------------------------------------------------
    if args.no_fetch:
        weather_csv = str(TC_DIR / "data" / "weather_data.csv")
        real_wx = False
    else:
        weather_csv, real_wx = fetch_worst_case_weather(window_hours=args.hours)

    # --- generate + evaluate -----------------------------------
    print(f"\n[gen] {args.designs} designs (seed {args.seed})")
    gen = ScenarioGenerator(
        "shelter_ratios_recommended.csv",
        "shelter_elements_dimensions__1_.csv",
        seed=args.seed,
    )
    designs = gen.generate_candidates(args.designs)

    ranker = DesignRanker(weather_csv, target_hours=args.hours)
    evaluated = ranker.evaluate_all(designs)
    if not evaluated:
        print("[fatal] no designs evaluated")
        return 1

    base_rank = [d["design_id"] for d in evaluated]

    # --- 1. sensitivity --------------------------------------
    print("\n" + line)
    print("1. WEIGHT-SENSITIVITY ANALYSIS".center(84))
    print(line)
    sens = sensitivity_analysis(
        evaluated, n_trials=args.trials, jitter=args.jitter, seed=args.seed
    )
    print(sens["table"].head(10).to_string(index=False))
    print(f"\nbase ranking (top 6): {base_rank[:6]}")
    print(f"robust shortlist    : {sens['shortlist']}")
    print(f"\nVERDICT: {sens['verdict']}")
    p_sens = plot_sensitivity(sens)

    # --- 2. weather note -----------------------------------
    print("\n" + line)
    print("2. WORST-CASE WEATHER".center(84))
    print(line)
    if real_wx:
        wdf = pd.read_csv(weather_csv)
        print(f"ranked on the coldest {len(wdf)} h in real NASA POWER data: "
              f"{wdf['temperature_C'].min():.1f} .. "
              f"{wdf['temperature_C'].max():.1f} C "
              f"(mean {wdf['temperature_C'].mean():.1f} C)")
    else:
        print("ranked on the tiled synthetic day (NASA fetch skipped/failed)")

    # --- 3. pareto ---------------------------------------
    print("\n" + line)
    print("3. PARETO FRONT  (T_min up / swing down / in-band up)".center(84))
    print(line)
    front, pts = pareto_front(evaluated)
    fdf = pd.DataFrame(front)[
        ["design_id", "T_min", "swing_C", "hours_in_band_pct", "comfort_score"]
    ]
    print(fdf.to_string(index=False))
    print(f"\n{len(front)} of {len(evaluated)} designs are Pareto-optimal.")
    p_par = plot_pareto(front, pts)

    # --- 4. logistics ------------------------------------
    print("\n" + line)
    print("4. LOGISTICS / DEPLOYABILITY".center(84))
    print(line)
    logistics = load_logistics()
    dmap = {d["design_id"]: d for d in designs}
    focus_ids = sorted(
        set(sens["shortlist"]) | {p["design_id"] for p in front}
    )
    log_rows = [
        logistics_profile(dmap[i], ranker.materials, logistics)
        for i in focus_ids
    ]
    print(pd.DataFrame(log_rows).to_string(index=False))

    deploy = deployability_ranking(
        [d for d in evaluated if d["design_id"] in focus_ids], log_rows
    )
    print("\noptional deployability-weighted ranking "
          "(comfort - cost - mass + transportability):")
    print(deploy.to_string(index=False))

    # --- consolidated report --------------------------
    report = RESULTS / "reliability_report.md"
    with open(report, "w", encoding="utf-8") as fh:
        fh.write("# Optimizer reliability report\n\n")
        fh.write(f"- designs: {args.designs}  seed: {args.seed}\n")
        fh.write(f"- weather: {'real coldest window' if real_wx else 'tiled synthetic'}"
                 f"  ({args.hours} h)\n")
        fh.write(f"- comfort target {COMFORT_TARGET_C} C, band "
                 f"{COMFORT_BAND_C[0]}-{COMFORT_BAND_C[1]} C\n\n")
        fh.write(f"## 1. Sensitivity\n\n{sens['verdict']}\n\n")
        fh.write(f"Robust shortlist: {sens['shortlist']}\n\n")
        fh.write(sens["table"].head(10).to_markdown(index=False))
        fh.write("\n\n## 3. Pareto front\n\n")
        fh.write(fdf.to_markdown(index=False))
        fh.write("\n\n## 4. Logistics\n\n")
        fh.write(pd.DataFrame(log_rows).to_markdown(index=False))
        fh.write("\n\n### Deployability-weighted\n\n")
        fh.write(deploy.to_markdown(index=False))
        fh.write("\n")
    print(f"\n[ok] wrote {report}")
    print(f"[ok] plots: {p_sens} , {p_par}")

    print("\n" + line)
    print("NEXT: cross-validate the shortlist in ANSYS with")
    print(f"  python validate_top_designs_ansys.py --ids {' '.join(map(str, sens['shortlist']))}")
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
