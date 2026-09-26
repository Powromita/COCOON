"""
ml/m5_build_support.py -- builds data/m5_dataset_v1/model/m5_baseline_v1/
surrogate_support.json, everything ml/surrogate.py needs besides the models:

  material_catalogue   per-material conductivity, density, volumetric heat
                       capacity and outer solar absorptivity
  categorical_support  layout signatures, materials, surface and opening
                       kinds present in the rows the shipped models were fit on
  conformal            per-target half-width for a nominal 80 % interval

    python ml/m5_build_support.py            (from the repo root)

The material catalogue the dataset was generated with (mat_snap_ladakh_csv_v1)
is not in this repository. Its values are recovered here from the dataset
itself: r_layers, mass, heat capacity and absorptivity in features.csv are
exact linear functions of the per-material constants, so a least-squares
solve over all rows returns them, and the script refuses to write anything
unless the residual is at floating-point level.

The build then re-extracts all 52 features for every row with
ml/m5_features.py and fails if any row disagrees with features.csv.

Conformal: the offsets in model_card.json belong to the earlier m5_gbt_v1
quantile model (they correct its quantile bounds) and do not give 80 %
coverage around the retrained GBT point predictions. The half-width here is
the finite-sample 80 % quantile of absolute residuals on the validation
weather periods from a GBT fit on the training periods only; coverage of the
shipped model on the untouched test periods is recorded alongside.
"""

import gzip
import json
import sys
import time
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import m5_features as mf                                    # noqa: E402
import m5_train_baselines as tb                              # noqa: E402

MODEL_DIR = tb.OUT
SUPPORT_PATH = MODEL_DIR / "surrogate_support.json"
WEATHER_CACHE = tb.REPO / "data" / "weather" / "cache"
PRODUCTION_FAMILY = "gbt_reference"
NOMINAL_COVERAGE = 0.8
RESIDUAL_TOL = 1e-6

# occupants are stored in the schedule rounded to 0.001, the table used the
# requested integer; these features inherit that rounding
OCCUPANT_DERIVED = {"occupants", "occupants_per_m2", "fresh_air_ach", "ach_effective",
                    "internal_gain_w_per_m2"}


def load_rows() -> dict:
    rows = {}
    for f in sorted(tb.DATA.glob("rows_*.jsonl.gz")):
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            for line in fh:
                r = json.loads(line)
                if r["status"] == "ok":
                    rows[r["params"]["row_index"]] = r
    return rows


@lru_cache(maxsize=None)
def _site_series(site: str) -> pd.DataFrame:
    return pd.read_csv(WEATHER_CACHE / f"{site}_weather_archive.csv",
                       parse_dates=["timestamp"]).set_index("timestamp")


def cached_site_weather(site: str, window_start: str, latitude_deg: float,
                        elevation_m: float, hours: int = mf.WEATHER_WINDOW_HOURS) -> dict:
    """A WeatherSnapshot-shaped dict for one dataset row's weather window,
    from data/weather/cache (timestamps there are local, IST)."""
    t0 = pd.Timestamp(window_start)
    x = _site_series(site).loc[t0.tz_localize(None):t0.tz_localize(None) + pd.Timedelta(hours=hours - 1)]
    return {
        "schema_version": "4.0", "snapshot_id": f"wx_{site}_{t0:%Y%m%dT%H}_{hours}h",
        "source": {"source_name": "cached_file", "location_name": site,
                   "latitude_deg": latitude_deg, "longitude_deg": 0.0,
                   "elevation_m": elevation_m, "is_cached": True,
                   "fetch_date": "2026-01-01T00:00:00+05:30", "time_zone": "Asia/Kolkata"},
        "hourly_data": [{"timestamp": (ts.tz_localize(t0.tz)).isoformat(),
                         "outdoor_dry_bulb_temperature_c": float(r.temperature_C),
                         "ghi_w_m2": float(r.solar_radiation_W_m2),
                         "wind_speed_m_s": float(r.wind_speed_m_s)}
                        for ts, r in x.iterrows()],
        "interpolations": [], "checksum_sha256": "0" * 64,
    }


def _solve(A, y, what):
    x, *_ = np.linalg.lstsq(np.asarray(A), np.asarray(y), rcond=None)
    resid = float(np.abs(np.asarray(A) @ x - np.asarray(y)).max())
    if resid > RESIDUAL_TOL * max(1.0, float(np.abs(y).max())):
        raise RuntimeError(f"{what}: least-squares residual {resid:.3g}; the feature "
                           "definition no longer matches the dataset")
    return x, resid


def recover_catalogue(rows: dict, F: pd.DataFrame) -> tuple[dict, dict]:
    mats = sorted({m for r in rows.values() for m in mf.material_ids(r["building"])})
    ix = {m: i for i, m in enumerate(mats)}

    def thick(a, scale=1.0):
        v = np.zeros(len(mats))
        for L in a["layers"]:
            v[ix[L["material_id"]]] += scale * L["thickness_mm"] / 1000
        return v

    A_k, y_k, A_m, y_m, y_c, A_a, y_a = [], [], [], [], [], [], []
    for ri, r in rows.items():
        b, f = r["building"], F.loc[ri]
        asm = b["assemblies"]
        opening_area = {}
        for o in b["openings"]:
            opening_area[o["parent_surface_id"]] = opening_area.get(o["parent_surface_id"], 0) + o["area_m2"]
        by_cat = {}
        for a in asm.values():
            by_cat.setdefault(a["category"], []).append(a)
        # conductivity: r_layers = sum(t / k), linear in 1/k
        for cat, col in (("wall", "r_layers_wall"), ("roof", "r_layers_roof")):
            if len(by_cat.get(cat, [])) == 1:
                A_k.append(thick(by_cat[cat][0])); y_k.append(f[col])
        if len(by_cat.get("floor", [])) == 1:
            a = by_cat["floor"][0]
            A_k.append(thick(a))
            y_k.append(1 / f["u_ground"] - a["r_inside_film_m2k_w"] - mf.SOIL_RESISTANCE_M2K_W)
        # mass / heat capacity: sum over opaque elements of area * t
        v = np.zeros(len(mats))
        for s in b["surfaces"]:
            share = 0.5 if s["boundary_type"] == "adjacent_zone" else 1.0
            v += thick(asm[s["assembly_id"]], s["area_m2"] * share)
        fa = f["floor_area_m2"]
        A_m.append(v); y_m.append(f["mass_per_floor_area_kg_m2"] * fa)
        y_c.append(f["heat_capacity_per_floor_area_kj_m2k"] * fa)
        # absorptivity: outer layer, net-area weighted over outdoor walls + roofs
        v, tot = np.zeros(len(mats)), 0.0
        for s in b["surfaces"]:
            if s["boundary_type"] == "outdoors" and s["surface_type"] in ("exterior_wall", "roof"):
                a_net = s["area_m2"] - opening_area.get(s["id"], 0)
                v[ix[asm[s["assembly_id"]]["layers"][-1]["material_id"]]] += a_net
                tot += a_net
        A_a.append(v / tot); y_a.append(f["solar_absorptivity_outer"])

    inv_k, r_k = _solve(A_k, y_k, "conductivity")
    rho, r_m = _solve(A_m, y_m, "density")
    rc, r_c = _solve(A_m, y_c, "heat capacity")
    alpha, r_a = _solve(A_a, y_a, "absorptivity")
    cat = {m: {"k_w_mk": round(1 / inv_k[i], 6), "density_kg_m3": round(rho[i], 6),
               "heat_capacity_kj_m3k": round(rc[i], 6),
               "specific_heat_j_kgk": round(rc[i] / rho[i] * 1000, 6),
               "solar_absorptivity": round(alpha[i], 6)} for m, i in ix.items()}
    return cat, {"conductivity": r_k, "density": r_m, "heat_capacity": r_c, "absorptivity": r_a}


def verify_extractor(rows: dict, F: pd.DataFrame, catalogue: dict) -> dict:
    site_xy = F.groupby("site")[["latitude_deg", "elevation_m"]].first()
    worst, bad = {k: 0.0 for k in mf.FEATURE_NAMES}, []
    for ri, r in rows.items():
        p = r["params"]
        w = cached_site_weather(p["site"], p["window_start"], *site_xy.loc[p["site"]])
        got = mf.extract(r["building"], w, catalogue, p["setpoint_c"],
                         r["extras"]["air_changes_per_hour"])
        for k, v in got.items():
            ref = F.at[ri, k]
            rel = abs(v - ref) / max(1.0, abs(ref))
            worst[k] = max(worst[k], rel)
            if rel > (2e-3 if k in OCCUPANT_DERIVED else 1e-6):
                bad.append((ri, k, v, ref))
    if bad:
        raise RuntimeError(f"feature extractor disagrees with features.csv on {len(bad)} "
                           f"values, e.g. {bad[:5]}")
    return worst


def conformal(df: pd.DataFrame, tr, va, te) -> dict:
    from sklearn.ensemble import HistGradientBoostingRegressor
    params = tb.GRID[PRODUCTION_FAMILY][0]
    out = {}
    for tgt in tb.TARGETS:
        X = df[mf.FEATURE_NAMES].astype(float)
        y = df[tgt].to_numpy(dtype=float)
        m_tr = HistGradientBoostingRegressor(random_state=tb.SEED, **params).fit(X.iloc[tr], y[tr])
        res = np.sort(np.abs(m_tr.predict(X.iloc[va]) - y[va]))
        n = len(res)
        q = float(res[min(n - 1, int(np.ceil((n + 1) * NOMINAL_COVERAGE)) - 1)])
        shipped = joblib.load(MODEL_DIR / f"{PRODUCTION_FAMILY}__{tgt}.joblib")["model"]
        test_res = np.abs(shipped.predict(X.iloc[te]) - y[te])
        out[tgt] = {"half_width": q, "n_calibration": n,
                    "test_coverage_shipped_model": float(np.mean(test_res <= q))}
    return out


def main() -> None:
    t0 = time.time()
    git = tb.git_state()
    rows = load_rows()
    F = pd.read_csv(tb.DATA / "features.csv.gz").set_index("row_index")
    df = tb.load()
    tr, va, te = tb.split_indices(df)
    fit_rows = set(df["row_index"].iloc[np.r_[tr, va]])

    catalogue, residuals = recover_catalogue(rows, F)
    print("catalogue recovered, max residuals:", {k: f"{v:.2g}" for k, v in residuals.items()})
    worst = verify_extractor(rows, F, catalogue)
    print(f"extractor matches features.csv on all {len(rows)} rows")

    fit = [rows[i]["building"] for i in sorted(fit_rows)]
    support = {
        "layout_signatures": sorted({mf.layout_signature(b) for b in fit}),
        "material_ids": sorted({m for b in fit for m in mf.material_ids(b)}),
        "surface_kinds": sorted({f"{s['surface_type']}/{s['boundary_type']}"
                                 for b in fit for s in b["surfaces"]}),
        "opening_kinds": sorted({f"{o['opening_type']}/"
                                 f"{'outdoors' if o.get('connected_boundary') == 'outdoors' else 'zone' if o.get('connected_boundary') else 'none'}"
                                 for b in fit for o in b["openings"]}),
    }
    card = json.loads((tb.DATA / "model" / "model_card.json").read_text(encoding="utf-8"))
    conf = conformal(df, tr, va, te)
    for tgt, c in conf.items():
        c["model_card_offset_not_used"] = card["conformal_offset"][tgt]

    out = {
        "support_version": "m5_baseline_v1.support.1",
        "built_by": "ml/m5_build_support.py", "git": git, "created_at_unix": int(time.time()),
        "production_model_family": PRODUCTION_FAMILY,
        "fit_rows": len(fit_rows),
        "material_catalogue": catalogue,
        "material_catalogue_provenance": {
            "source": "recovered by least squares from m5_dataset_v1 features.csv "
                      "(the generating snapshot mat_snap_ladakh_csv_v1 is not in the repo)",
            "max_residuals": residuals},
        "extractor_check": {"rows": len(rows), "max_relative_error": worst},
        "categorical_support": support,
        "conformal": {"nominal_coverage": NOMINAL_COVERAGE,
                      "method": "split conformal, symmetric: |residual| quantile on validation "
                                "weather periods, GBT fit on training periods only",
                      "targets": conf},
    }
    SUPPORT_PATH.write_text(json.dumps(out, indent=1), encoding="utf-8")
    for tgt, c in conf.items():
        print(f"{tgt:30s} +/-{c['half_width']:.3f}  test coverage {c['test_coverage_shipped_model']:.3f}")
    print(f"wrote {SUPPORT_PATH} in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
