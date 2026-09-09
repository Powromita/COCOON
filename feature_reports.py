"""
feature_reports.py  --  Stage 4 of the integrated pipeline.

Runs the three DRDO deliverables on ONE design's hourly output and
assembles a single ``results.json`` in the shape the frontend consumes
(app/_lib/types.ts :: RunResults, minus the optimize-only blocks).

  Feature 1  inside-temperature prediction     (+ hourly series)
  Feature 2  solar thermal energy               (+ hourly / daily arrays)
  Feature 3  heat flow vs ambient dT            (+ per-hour per-path loss)
  comfort    hours-in-band / frost-free / score
  heating    supplemental demand + kerosene-equivalent fuel
  highlights plain-language derived facts
  resolved   U-values / capacitance / infiltration UA / envelope mass
"""

import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "thermal-calculator"))

from solar_analysis import (                                   # noqa: E402
    calculate_daily_solar_energy, calculate_solar_metrics, plot_solar_analysis,
)
from heat_flow_analysis import (                               # noqa: E402
    calculate_daily_heat_loss, calculate_heat_flow_metrics,
    plot_heat_flow_analysis, SURFACE_STYLE,
)

# kerosene stove: ~0.75 combustion-to-space efficiency, ~9.6 kWh per litre
_STOVE_EFF = 0.75
_KWH_PER_L = 9.6

# comfort-score weights (mirror design_ranker._SCORE_WEIGHTS)
_W = {"median_gap": 3.0, "swing": 1.5, "cold_stress": 4.0, "heat_stress": 2.0,
      "in_band": 20.0}


def _feature1_temperature(hourly: pd.DataFrame, out_dir: Path) -> dict:
    df = hourly.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df[["timestamp", "outdoor_temperature_C", "indoor_temperature_C"]].to_csv(
        out_dir / "temperature.csv", index=False)

    t = df["indoor_temperature_C"].astype(float)
    o = df["outdoor_temperature_C"].astype(float)
    metrics = {
        "hours": int(len(df)),
        "T_min_C": round(float(t.min()), 2),
        "T_max_C": round(float(t.max()), 2),
        "T_mean_C": round(float(t.mean()), 2),
        "T_median_C": round(float(t.median()), 2),
        "T_final_C": round(float(t.iloc[-1]), 2),
        "outdoor_min_C": round(float(o.min()), 2),
        "outdoor_max_C": round(float(o.max()), 2),
        "series": {
            "t_hours": list(range(len(df))),
            "indoor_C": [round(x, 2) for x in t.tolist()],
            "outdoor_C": [round(x, 2) for x in o.tolist()],
        },
    }
    (out_dir / "temperature_metrics.json").write_text(json.dumps(metrics, indent=2))

    fig, ax = plt.subplots(figsize=(12, 5))
    ax.plot(df["timestamp"], o, color="#888", lw=1.3, label="outdoor")
    ax.plot(df["timestamp"], t, color="#d95f02", lw=2.2, label="predicted indoor")
    ax.set_ylabel("temperature (C)"); ax.set_xlabel("time")
    ax.set_title("Feature 1 - predicted shelter inside temperature")
    ax.legend(); ax.grid(alpha=0.3)
    plt.xticks(rotation=45); fig.tight_layout()
    fig.savefig(out_dir / "temperature.png", dpi=150)
    plt.close(fig)
    return metrics


def _feature2_solar(hourly: pd.DataFrame, cfg: dict, out_dir: Path) -> dict:
    daily = calculate_daily_solar_energy(hourly, unit="MJ")
    m = calculate_solar_metrics(hourly, cfg)
    q = pd.to_numeric(hourly.get("Q_solar_W", pd.Series(dtype=float)),
                      errors="coerce").fillna(0.0)

    metrics = {
        "total_energy_Wh": round(float(m.get("total_energy_Wh", 0.0)), 1),
        "total_energy_MJ": round(float(m.get("total_energy_MJ", 0.0)), 2),
        "peak_irradiance_W_m2": round(float(m.get("peak_irradiance_W_m2", 0.0)), 1),
        "peak_gain_W": round(float(m.get("peak_gain_W", 0.0)), 1),
        "avg_irradiance_W_m2": round(float(m.get("avg_irradiance_W_m2", 0.0)), 1),
        "capacity_factor_percent": round(float(m.get("capacity_factor_percent", 0.0)), 2),
        "solar_temp_correlation": (
            round(float(m["solar_temp_correlation"]), 3)
            if m.get("solar_temp_correlation") == m.get("solar_temp_correlation")
            else 0.0
        ),
        "daily_MJ": [round(float(x), 2) for x in daily.tolist()],
        "hourly_gain_kW": [round(float(x) / 1000.0, 3) for x in q.tolist()],
    }
    (out_dir / "solar_metrics.json").write_text(json.dumps(metrics, indent=2))
    daily.to_frame().to_csv(out_dir / "solar_daily.csv")
    plot_solar_analysis(hourly, calculate_daily_solar_energy(hourly, unit="Wh"),
                        str(out_dir / "solar_analysis.png"))
    return metrics


def _feature3_heatflow(hourly: pd.DataFrame, out_dir: Path) -> dict:
    daily = calculate_daily_heat_loss(hourly, unit="Wh")
    m = calculate_heat_flow_metrics(hourly)

    cols = {k: v[0] for k, v in SURFACE_STYLE.items()}   # wall -> Q_wall_W ...
    hourly_by_path = {}
    for key, col in cols.items():
        s = pd.to_numeric(hourly.get(col, pd.Series(dtype=float)),
                          errors="coerce").fillna(0.0)
        hourly_by_path[key] = [round(float(x), 1) for x in s.tolist()]

    metrics = {
        "total_heat_loss_Wh": round(float(m.get("total_heat_loss_Wh", 0.0)), 0),
        "peak_hourly_loss_W": round(float(m.get("peak_hourly_loss_W", 0.0)), 0),
        "avg_hourly_loss_W": round(float(m.get("avg_hourly_loss_W", 0.0)), 0),
        "peak_temp_difference_C": round(float(m.get("peak_temp_difference_C", 0.0)), 1),
        "avg_temp_difference_C": round(float(m.get("avg_temp_difference_C", 0.0)), 1),
        "split_percent": {
            k: round(float(m.get(f"{k}_fraction_percent", 0.0)), 1)
            for k in SURFACE_STYLE
        },
        "hourly_by_path": hourly_by_path,
    }
    (out_dir / "heatflow_metrics.json").write_text(json.dumps(metrics, indent=2))
    daily.to_csv(out_dir / "heatflow_daily.csv")
    plot_heat_flow_analysis(hourly, daily, str(out_dir / "heat_flow_analysis.png"))
    return metrics


def _resolved(props: dict, cfg: dict, materials_db: dict | None = None) -> dict:
    mass_t = 0.0
    if materials_db:
        g = cfg["geometry"]
        L, Wd, Hh = g["length_m"], g["width_m"], g["height_m"]
        area = {"walls": 2 * (L * Hh + Wd * Hh), "roof": L * Wd, "floor": L * Wd}
        for surf, akey in (("walls", "walls"), ("roof", "roof"), ("floor", "floor")):
            for lyr in cfg[surf]:
                d = materials_db.get(str(lyr["material"]).lower(), {}).get("density", 0.0)
                mass_t += area[akey] * lyr["thickness_mm"] / 1000.0 * d / 1000.0
    return {
        "U_wall_W_m2K": round(float(props["wall"]["U_W_m2K"]), 3),
        "U_roof_W_m2K": round(float(props["roof"]["U_W_m2K"]), 3),
        "U_floor_W_m2K": round(float(props["floor"]["U_W_m2K"]), 3),
        "C_total_MJ_per_K": round(float(props["capacitance"]["total_J_K"]) / 1e6, 2),
        "infiltration_UA_W_K": round(float(props["infiltration"]["UA_W_K"]), 2),
        "envelope_mass_t": round(mass_t, 1),
    }


def _comfort(temps: np.ndarray, spec: dict) -> dict:
    target = spec.get("target_C", 18.0)
    lo, hi = spec.get("band_lo_C", 15.0), spec.get("band_hi_C", 24.0)
    n = len(temps)
    in_band = float(np.mean((temps >= lo) & (temps <= hi))) if n else 0.0
    below = float(np.mean(temps < lo)) if n else 0.0
    above = float(np.mean(temps > hi)) if n else 0.0
    frost_free = float(np.mean(temps > 0.0)) if n else 0.0
    med = float(np.median(temps)) if n else 0.0
    swing = float(temps.max() - temps.min()) if n else 0.0
    cold = max(0.0, lo - float(temps.min())) if n else 0.0
    heat = max(0.0, float(temps.max()) - (hi + 4)) if n else 0.0
    score = (100.0 - _W["median_gap"] * abs(med - target) - _W["swing"] * swing
             - _W["cold_stress"] * cold - _W["heat_stress"] * heat
             + _W["in_band"] * in_band)
    return {
        "target_C": target, "band_lo_C": lo, "band_hi_C": hi,
        "hours_in_band_pct": round(in_band * 100, 1),
        "hours_below_band_pct": round(below * 100, 1),
        "hours_above_band_pct": round(above * 100, 1),
        "frost_free_pct": round(frost_free * 100, 1),
        "comfort_score": round(score, 1),
    }


def _heating(hourly: pd.DataFrame, spec: dict) -> dict:
    """Extra sensible heat needed each hour to keep the air at the comfort
    lower bound: Q_extra = max(0, (T_lo - T_in) * UA_effective). We back out
    an effective UA from the modelled Q_net vs (T_in - T_out)."""
    lo = spec.get("band_lo_C", 15.0)
    t_in = pd.to_numeric(hourly["indoor_temperature_C"], errors="coerce").to_numpy(float)
    q_loss = pd.to_numeric(hourly.get("Q_total_loss_W"), errors="coerce").to_numpy(float)
    q_solar = pd.to_numeric(hourly.get("Q_solar_W", 0), errors="coerce").fillna(0).to_numpy(float)
    dt = np.maximum(0.0, lo - t_in)
    # if indoor already below lo, the deficit ~ the net loss not covered by gains
    deficit_W = np.where(dt > 0, np.maximum(0.0, q_loss - q_solar), 0.0)
    total_kWh = float(deficit_W.sum()) / 1000.0
    days = max(1.0, len(hourly) / 24.0)
    per_day = total_kWh / days
    litres_day = per_day / _STOVE_EFF / _KWH_PER_L
    return {
        "demand_kWh_per_day": round(per_day, 1),
        "demand_kWh_total": round(total_kWh, 1),
        "fuel_litres_per_day": round(litres_day, 2),
        "fuel_note": f"kerosene equiv. to hold >= {lo:.0f} C "
                     f"(stove eta {_STOVE_EFF}, {_KWH_PER_L} kWh/L)",
    }


def _highlights(comfort: dict, heatflow: dict, cfg: dict, resolved: dict) -> list:
    infil_pct = heatflow["split_percent"].get("infiltration", 0.0)
    # crude thermal lag proxy from capacitance vs envelope conductance
    ua = sum(resolved[k] for k in ("U_wall_W_m2K", "U_roof_W_m2K", "U_floor_W_m2K"))
    lag_h = min(24.0, resolved["C_total_MJ_per_K"] / max(0.1, ua) / 3.6)
    return [
        {"key": "frost", "title": "Frost protection",
         "value": f"{comfort['frost_free_pct']:.0f}% of hours above 0 C"},
        {"key": "solar", "title": "Thermal lag",
         "value": f"~{lag_h:.1f} h mass flywheel"},
        {"key": "air", "title": "Air exchange",
         "value": f"{cfg.get('air_changes_per_hour', 0):.1f} ACH -> {infil_pct:.0f}% of loss"},
    ]


def _config_echo(cfg: dict, materials_db: dict | None) -> dict:
    g = cfg["geometry"]
    fa = g["length_m"] * g["width_m"]

    def label(layers):
        return " + ".join(f"{l['material']} {l['thickness_mm']} mm" for l in layers)

    win = cfg.get("windows", {})
    return {
        "footprint_label": f"{g['length_m']} x {g['width_m']} m ({fa:.1f} m2)",
        "wall_label": label(cfg["walls"]),
        "roof_label": label(cfg["roof"]),
        "floor_label": label(cfg["floor"]),
        "glazing_label": f"{win.get('glazing_type', '?')} ({win.get('area_m2', 0)} m2)",
        "air_changes_per_hour": cfg.get("air_changes_per_hour", 0.0),
        "internal_gain_W": cfg.get("internal_heat_gain_W", 0.0),
    }


def run_feature_reports(hourly_df: pd.DataFrame, cfg: dict, out_dir,
                        properties: dict | None = None,
                        comfort_spec: dict | None = None,
                        materials_db: dict | None = None,
                        window_meta: dict | None = None,
                        run_id: str = "local",
                        mode: str = "single") -> dict:
    """Run Features 1-3 (+ comfort/heating/highlights/resolved) on one
    design. Writes csv/json/png into ``out_dir`` and, if given
    ``properties``, a consolidated ``results.json`` there too."""

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    comfort_spec = comfort_spec or {"target_C": 18, "band_lo_C": 15, "band_hi_C": 24}

    f1 = _feature1_temperature(hourly_df, out_dir)
    f2 = _feature2_solar(hourly_df, cfg, out_dir)
    f3 = _feature3_heatflow(hourly_df, out_dir)

    temps = np.asarray(f1["series"]["indoor_C"], float)
    comfort = _comfort(temps, comfort_spec)
    heating = _heating(hourly_df, comfort_spec)

    summary = {"feature1_temperature": f1, "feature2_solar": f2,
               "feature3_heatflow": f3, "comfort": comfort, "heating": heating}
    (out_dir / "feature_summary.json").write_text(json.dumps(summary, indent=2))

    if properties is not None:
        resolved = _resolved(properties, cfg, materials_db)
        results = {
            "run_id": run_id,
            "mode": mode,
            "window": window_meta or {},
            "resolved": resolved,
            "features": {"temperature": f1, "solar": f2, "heatflow": f3},
            "comfort": comfort,
            "heating": heating,
            "highlights": _highlights(comfort, f3, cfg, resolved),
            "config_echo": _config_echo(cfg, materials_db),
            "report_md_url": "REPORT.md",
        }
        (out_dir / "results.json").write_text(json.dumps(results, indent=2))

    print(f"[features] wrote reports -> {out_dir}")
    return summary


if __name__ == "__main__":
    import shelter_config as sc
    from engine_adapter import simulate, get_materials
    from weather_archive import load_archive, typical_window, annual_mean_air_C

    arch = load_archive()
    wx = typical_window(arch, hours=72)
    cfg = sc.from_shelter_config()
    hourly, props = simulate(cfg, wx, ground_mean_C=annual_mean_air_C(arch))
    run_feature_reports(hourly, cfg, "runs/_test_features", properties=props,
                        materials_db=get_materials(),
                        window_meta={"typical_hours": 72, "worst_hours": 48})
