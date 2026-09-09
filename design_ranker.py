"""
design_ranker.py

Runs the Python RC thermal engine (thermal-calculator/) on every
candidate design from ``scenario_generator.py`` and ranks them by a
**balanced comfort score** rather than by raw mean temperature.

Why not T_avg
-------------
Ranking by the mean rewards thin, low-mass, over-glazed shelters that
bake at midday and crash at night -- their average looks warm but the
lived experience is terrible. This ranker instead scores each design on
how close it stays to a comfort target, how *stable* it is, and how it
does in its worst hour.

Comfort score (higher = better, ~100 = ideal)::

    score = 100
            - 3.0 * |T_median - TARGET|      # centred on the target
            - 1.5 * (T_max - T_min)          # thermal stability / balance
            - 4.0 * max(0, COLD_LIMIT - T_min)   # worst-hour survivability
            - 2.0 * max(0, T_max - HEAT_LIMIT)   # no daytime overheating
            + 20.0 * fraction_hours_in_band       # time inside [15, 24] C

with TARGET = 18 C, comfort band 15-24 C, COLD_LIMIT = 15 C,
HEAT_LIMIT = 28 C.

Engine API used::

    results, properties = thermal_model.run_simulation(
        weather_df, configuration, materials
    )
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

try:
    from tqdm import tqdm
except ImportError:                                   # pragma: no cover
    def tqdm(iterable, **_kwargs):
        return iterable


ROOT = Path(__file__).parent
TC_DIR = ROOT / "thermal-calculator"
sys.path.insert(0, str(TC_DIR))

import shelter_config as _sc                            # noqa: E402
from engine_adapter import simulate as _simulate, get_materials  # noqa: E402
from scenario_generator import load_pool                 # noqa: E402

_GLAZING_PATH = TC_DIR / "data" / "glazing_profiles.json"

# --- comfort model ------------------------------------------------
COMFORT_TARGET_C = 18.0
COMFORT_BAND_C = (15.0, 24.0)
COLD_LIMIT_C = 15.0
HEAT_LIMIT_C = 28.0

_SCORE_WEIGHTS = {
    "median_gap": 3.0,
    "swing": 1.5,
    "cold_stress": 4.0,
    "heat_stress": 2.0,
    "in_band": 20.0,
}

# the fixed operating assumptions live in shelter_config.FIXED_ASSUMPTIONS


def comfort_score(temps, weights=None):
    """Return the balanced comfort metrics dict for an hourly temp series.

    ``weights`` overrides ``_SCORE_WEIGHTS`` (used by the sensitivity
    analysis to perturb the score function).
    """

    w = _SCORE_WEIGHTS if weights is None else weights

    t = np.asarray(temps, dtype=float)
    t_med = float(np.median(t))
    t_min = float(t.min())
    t_max = float(t.max())
    swing = t_max - t_min
    in_band = float(
        np.mean((t >= COMFORT_BAND_C[0]) & (t <= COMFORT_BAND_C[1]))
    )
    median_gap = abs(t_med - COMFORT_TARGET_C)
    cold_stress = max(0.0, COLD_LIMIT_C - t_min)
    heat_stress = max(0.0, t_max - HEAT_LIMIT_C)

    score = (
        100.0
        - w["median_gap"] * median_gap
        - w["swing"] * swing
        - w["cold_stress"] * cold_stress
        - w["heat_stress"] * heat_stress
        + w["in_band"] * in_band
    )

    return {
        "comfort_score": round(score, 1),
        "T_median": round(t_med, 2),
        "T_min": round(t_min, 2),
        "T_max": round(t_max, 2),
        "T_avg": round(float(t.mean()), 2),
        "swing_C": round(swing, 2),
        "hours_in_band_pct": round(in_band * 100, 1),
    }


class DesignRanker:
    """Evaluate and rank a pool of shelter designs by comfort score."""

    def __init__(self, weather, target_hours=None, ground_mean_C=None,
                 ground_mode="manual"):
        """``weather`` is a DataFrame or a CSV path. ``target_hours`` only
        tiles/truncates when set (the pipeline passes a ready window and
        leaves it None). ``ground_mode`` / ``ground_mean_C`` are threaded
        into every design's config."""

        self.materials = get_materials()
        with open(_GLAZING_PATH, encoding="utf-8") as fh:
            self.glazing = json.load(fh)
        self.ground_mean_C = ground_mean_C
        self.ground_mode = ground_mode

        if isinstance(weather, pd.DataFrame):
            self.weather_df = weather.reset_index(drop=True)
        else:
            self.weather_df = self._load_weather(weather, target_hours)

        t = self.weather_df["temperature_C"]
        print(
            f"[ok] weather: {len(self.weather_df)} hourly rows, "
            f"outdoor {t.min():.1f} to {t.max():.1f} C"
        )

    # ---------------------------------------------------------------
    # weather
    # ---------------------------------------------------------------

    @staticmethod
    def _load_weather(path, target_hours):
        df = pd.read_csv(path)

        rename = {}
        for col in df.columns:
            key = col.strip().lower()
            if key in (
                "temperature_c", "t_out_c", "t_outdoor",
                "outdoor_temperature_c", "temp_c",
            ):
                rename[col] = "temperature_C"
            elif key in ("solar_radiation_w_m2", "g_w_m2", "ghi_w_m2", "solar_w_m2"):
                rename[col] = "solar_radiation_W_m2"
            elif key in ("timestamp", "time", "datetime", "date_time"):
                rename[col] = "timestamp"
        df = df.rename(columns=rename)

        missing = {"timestamp", "temperature_C", "solar_radiation_W_m2"} - set(
            df.columns
        )
        if missing:
            raise ValueError(
                f"weather CSV {path!r} missing column(s): {sorted(missing)}"
            )

        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.dropna(subset=["timestamp"]).reset_index(drop=True)

        if not target_hours or len(df) == target_hours:
            return df.reset_index(drop=True)
        if len(df) > target_hours:
            return df.iloc[:target_hours].reset_index(drop=True)

        step = (
            df["timestamp"].iloc[1] - df["timestamp"].iloc[0]
            if len(df) > 1
            else pd.Timedelta(hours=1)
        )
        period = df["timestamp"].iloc[-1] - df["timestamp"].iloc[0] + step
        tiles, k = [], 0
        while sum(len(t) for t in tiles) < target_hours:
            chunk = df.copy()
            chunk["timestamp"] = chunk["timestamp"] + k * period
            tiles.append(chunk)
            k += 1
        out = pd.concat(tiles, ignore_index=True).iloc[:target_hours]
        print(
            f"[note] weather file had {len(df)} rows; tiled to {len(out)} h "
            f"to match --hours {target_hours}"
        )
        return out.reset_index(drop=True)

    # ---------------------------------------------------------------
    # evaluation
    # ---------------------------------------------------------------

    def _config_for(self, design):
        return _sc.from_design(design, self.glazing,
                               ground_mode=self.ground_mode,
                               ground_C=(0.0 if self.ground_mean_C is None
                                         else self.ground_mean_C))

    def evaluate_design(self, design):
        try:
            cfg = self._config_for(design)
            hourly, props = _simulate(cfg, self.weather_df, self.materials,
                                      ground_mean_C=self.ground_mean_C)
            temps = hourly["indoor_temperature_C"].astype(float)

            # Guard against explicit-Euler blow-up on very-low-mass
            # envelopes: an indoor air temperature this far outside the
            # weather range is a numerical artefact, not a design.
            if temps.max() > 60.0 or temps.min() < -40.0:
                raise ValueError(
                    "non-physical result "
                    f"(T {temps.min():.0f}..{temps.max():.0f} C) -- "
                    "numerical instability at low thermal mass"
                )

            metrics = comfort_score(temps)

            return {
                "design_id": design["design_id"],
                "geometry": design["geometry"],
                "walls": design["walls"],
                "roof": design["roof"],
                "floor": design["floor"],
                "windows": design["windows"],
                "doors": design.get("doors", {}),
                "aspect_ratio": design.get("aspect_ratio"),
                "av_ratio": design.get("av_ratio"),
                "floor_area_m2": design.get("floor_area_m2"),
                "wwr_percent": design.get("wwr_percent"),
                "wall_thickness_mm": design.get("wall_thickness_mm"),
                "roof_thickness_mm": design.get("roof_thickness_mm"),
                "floor_thickness_mm": design.get("floor_thickness_mm"),
                "U_wall_W_m2K": round(props["wall"]["U_W_m2K"], 3),
                "U_roof_W_m2K": round(props["roof"]["U_W_m2K"], 3),
                "U_floor_W_m2K": round(props["floor"]["U_W_m2K"], 3),
                "C_total_MJ_per_K": round(
                    props["capacitance"]["total_J_K"] / 1e6, 2
                ),
                "infil_ACH": props["infiltration"]["air_changes_per_hour"],
                "infil_UA_W_K": round(props["infiltration"]["UA_W_K"], 2),
                **metrics,
                "hourly_indoor_C": [round(float(x), 3) for x in temps],
                "status": "success",
            }
        except Exception as exc:                          # noqa: BLE001
            return {
                "design_id": design.get("design_id"),
                "comfort_score": -9999.0,
                "status": f"failed: {exc}",
            }

    def evaluate_all(self, designs):
        print(f"\n[run] simulating {len(designs)} designs ...")
        results = [
            self.evaluate_design(d)
            for d in tqdm(designs, desc="Simulating", unit="design")
        ]

        ok = [r for r in results if r.get("status") == "success"]
        bad = [r for r in results if r.get("status") != "success"]
        print(f"[ok] {len(ok)} succeeded, {len(bad)} failed")
        for r in bad:
            print(f"     design #{r.get('design_id')}: {r.get('status')}")

        return sorted(ok, key=lambda r: r["comfort_score"], reverse=True)

    def evaluate_pool(self, pool_path):
        """Read a designs_pool.json and rank it."""
        return self.evaluate_all(load_pool(pool_path))

    # ---------------------------------------------------------------
    # output
    # ---------------------------------------------------------------

    @staticmethod
    def _fmt_layers(layers):
        return " + ".join(
            f"{lyr['material']} ({lyr['thickness_mm']} mm)" for lyr in layers
        )

    def display_results(self, ranked_designs, top_n=5):
        line = "=" * 84
        print("\n" + line)
        print("SHELTER OPTIMIZATION  -  ranked by balanced comfort score".center(84))
        print(line)
        print(
            f"target {COMFORT_TARGET_C:.0f} C | comfort band "
            f"{COMFORT_BAND_C[0]:.0f}-{COMFORT_BAND_C[1]:.0f} C | "
            f"window: {len(self.weather_df)} h"
        )

        if not ranked_designs:
            print("No successful designs found.")
            return

        best = ranked_designs[0]
        g = best["geometry"]
        print(f"\nBEST DESIGN  (id {best['design_id']})   "
              f"comfort score {best['comfort_score']}")
        print("-" * 84)
        print(
            f"Geometry : {g['length_m']} x {g['width_m']} x {g['height_m']} m"
            f"  |  floor {best.get('floor_area_m2')} m2  |  "
            f"aspect {best.get('aspect_ratio')}  |  A/V {best.get('av_ratio')}"
        )
        print(f"Walls    : {self._fmt_layers(best['walls'])}"
              f"   [{best.get('wall_thickness_mm')} mm]")
        print(f"Roof     : {self._fmt_layers(best['roof'])}"
              f"   [{best.get('roof_thickness_mm')} mm]")
        print(f"Floor    : {self._fmt_layers(best['floor'])}"
              f"   [{best.get('floor_thickness_mm')} mm]")
        print(
            f"Windows  : {best['windows']['count']} x {best['windows']['type']}"
            f"  ({best['windows']['area_m2']} m2, WWR {best.get('wwr_percent')}%)"
        )
        print(
            f"U-values : wall {best['U_wall_W_m2K']} / roof {best['U_roof_W_m2K']}"
            f" / floor {best['U_floor_W_m2K']} W/m2K   |   "
            f"C_total {best['C_total_MJ_per_K']} MJ/K"
        )
        print(
            f"\nPerformance :  T_median {best['T_median']} C   "
            f"T_min {best['T_min']} C   T_max {best['T_max']} C   "
            f"swing {best['swing_C']} C   "
            f"in-band {best['hours_in_band_pct']}%"
        )

        n = min(top_n, len(ranked_designs))
        print(f"\nTOP {n} DESIGNS")
        print("-" * 84)
        print(
            f"{'rk':<4}{'id':<4}{'L x W x H (m)':<20}{'score':>7}"
            f"{'T_med':>7}{'T_min':>7}{'T_max':>7}{'swing':>7}{'band%':>7}"
        )
        print("-" * 84)
        for rank, d in enumerate(ranked_designs[:n], 1):
            g = d["geometry"]
            geom = f"{g['length_m']}x{g['width_m']}x{g['height_m']}"
            print(
                f"{rank:<4}{d['design_id']:<4}{geom:<20}{d['comfort_score']:>7}"
                f"{d['T_median']:>7}{d['T_min']:>7}{d['T_max']:>7}"
                f"{d['swing_C']:>7}{d['hours_in_band_pct']:>7}"
            )
        print(line + "\n")

    def save_results(self, ranked_designs, output_csv="results/optimization_results.csv"):
        out = Path(output_csv)
        out.parent.mkdir(parents=True, exist_ok=True)

        rows = []
        for rank, d in enumerate(ranked_designs, 1):
            g = d["geometry"]
            rows.append(
                {
                    "rank": rank,
                    "design_id": d["design_id"],
                    "comfort_score": d["comfort_score"],
                    "length_m": g["length_m"],
                    "width_m": g["width_m"],
                    "height_m": g["height_m"],
                    "floor_area_m2": d.get("floor_area_m2"),
                    "aspect_ratio": d.get("aspect_ratio"),
                    "av_ratio": d.get("av_ratio"),
                    "wwr_percent": d.get("wwr_percent"),
                    "walls": self._fmt_layers(d["walls"]),
                    "wall_thickness_mm": d.get("wall_thickness_mm"),
                    "roof": self._fmt_layers(d["roof"]),
                    "roof_thickness_mm": d.get("roof_thickness_mm"),
                    "floor": self._fmt_layers(d["floor"]),
                    "floor_thickness_mm": d.get("floor_thickness_mm"),
                    "windows": f"{d['windows']['count']}x {d['windows']['type']} "
                               f"({d['windows']['area_m2']} m2)",
                    "U_wall_W_m2K": d["U_wall_W_m2K"],
                    "U_roof_W_m2K": d["U_roof_W_m2K"],
                    "U_floor_W_m2K": d["U_floor_W_m2K"],
                    "C_total_MJ_per_K": d["C_total_MJ_per_K"],
                    "T_median_C": d["T_median"],
                    "T_min_C": d["T_min"],
                    "T_max_C": d["T_max"],
                    "T_avg_C": d["T_avg"],
                    "swing_C": d["swing_C"],
                    "hours_in_band_pct": d["hours_in_band_pct"],
                }
            )
        pd.DataFrame(rows).to_csv(out, index=False)
        print(f"[ok] ranking saved -> {out}")

    @staticmethod
    def save_evaluated(ranked_designs, output_json):
        """Dump the full evaluated list (incl. per-design hourly_indoor_C)
        so later stages read it from a file instead of an object."""
        out = Path(output_json)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(ranked_designs, fh)
        print(f"[ok] evaluated designs saved -> {out}")

    def save_best_timeseries(
        self, best_design, output_csv="results/best_design_timeseries.csv"
    ):
        if not best_design:
            return
        out = Path(output_csv)
        out.parent.mkdir(parents=True, exist_ok=True)
        cfg = self._config_for(best_design)
        hourly, _props = _simulate(cfg, self.weather_df, self.materials,
                                   ground_mean_C=self.ground_mean_C)
        hourly.to_csv(out, index=False)
        print(f"[ok] best-design hourly series saved -> {out}")


if __name__ == "__main__":
    from scenario_generator import ScenarioGenerator
    from weather_archive import load_archive, typical_window, annual_mean_air_C

    gen = ScenarioGenerator(
        "shelter_ratios_recommended.csv",
        "shelter_elements_dimensions__1_.csv",
        seed=0,
    )
    candidates = gen.generate_candidates(num_designs=50)
    gen.save_pool(candidates, "runs/_test_ranker_pool.json")

    arch = load_archive()
    ranker = DesignRanker(typical_window(arch, hours=72),
                          ground_mean_C=annual_mean_air_C(arch),
                          ground_mode="annual_mean")
    ranked = ranker.evaluate_pool("runs/_test_ranker_pool.json")

    ranker.display_results(ranked, top_n=5)
    ranker.save_results(ranked, "runs/_test_optimization_results.csv")
    if ranked:
        ranker.save_best_timeseries(ranked[0], "runs/_test_best_timeseries.csv")
