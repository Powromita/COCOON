"""
ml/surrogate.py -- Module M5 runtime inference adapter (PRD §11.6).

    from ml.surrogate import Candidate, predict
    results = predict([Candidate(building, weather, setpoint_c=18.0,
                                 air_changes_per_hour=0.6), ...])

For each candidate the coverage / out-of-distribution guard runs FIRST.
A candidate that fails it gets ml_status "out_of_distribution",
route_to_m4 = True and predictions = None: no value and no confidence is
produced for it, and the caller must send it to M4 (the RC simulator)
instead. Only in-distribution candidates are passed to the models.

Production models: the gbt_reference family of m5_baseline_v1, one
HistGradientBoosting regressor per target (data/m5_dataset_v1/model/
m5_baseline_v1/gbt_reference__<target>.joblib).

Return schema, one dict per candidate, in input order:

    {
      "candidate_id":  str | None,
      "design_id":     str,
      "revision_id":   str,
      "ml_status":     "ok" | "out_of_distribution",
      "route_to_m4":   bool,              # True exactly when not "ok"
      "ood_reasons":   [str, ...],        # empty when "ok"
      "predictions":   None | {           # None when out_of_distribution
          "<target>": {"value": float, "lower": float, "upper": float,
                       "unit": str, "nominal_coverage": 0.8},
          ...                              # one entry per AVAILABLE_TARGETS
      },
      "unavailable_targets": {...},       # always UNAVAILABLE_TARGETS
      "model_version": "m5_baseline_v1",
    }

Targets and their definitions (from m5_dataset_v1, 7-day window, the first
48 h are warm-up and excluded):
    heating_energy_kwh           ideal-load run, total heat delivered
    peak_heating_kw              ideal-load run, maximum total heater power
    passive_min_temperature_c    free-floating run, lowest occupied-zone temperature
    passive_median_temperature_c free-floating run, median over time of the mean
                                 occupied-zone temperature (a MEDIAN, not the mean)
    unmet_hours_ref              4.0 kW total shared by the heated zones, hours with
                                 any occupied zone below setpoint - 0.05 K

NOT available (PRD §11.4) -- the M5 dataset kept no per-timestep zone
series, so no model exists for these and none is returned. M6 must obtain
them from M4 if it needs them:
    max_occupied_zone_temperature_c, mean_occupied_zone_temperature_c,
    comfort_hours, max_zone_imbalance_k

Intervals are symmetric split-conformal intervals at nominal 80 % coverage,
calibrated on held-out weather periods (see ml/m5_build_support.py for why
the offsets in model_card.json are not used).
"""

import json
import math
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import m5_features as mf                                    # noqa: E402

MODEL_DIR = Path(__file__).resolve().parent.parent / "data" / "m5_dataset_v1" / "model" / "m5_baseline_v1"
MODEL_VERSION = "m5_baseline_v1"
PRODUCTION_FAMILY = "gbt_reference"

STATUS_OK = "ok"
STATUS_OOD = "out_of_distribution"

AVAILABLE_TARGETS = {
    "heating_energy_kwh": "kWh",
    "peak_heating_kw": "kW",
    "passive_min_temperature_c": "degC",
    "passive_median_temperature_c": "degC",
    "unmet_hours_ref": "h",
}
UNAVAILABLE_TARGETS = {
    "max_occupied_zone_temperature_c": "not in m5_dataset_v1: no per-timestep zone series kept",
    "mean_occupied_zone_temperature_c": "not in m5_dataset_v1: only the median was stored "
                                        "(see passive_median_temperature_c)",
    "comfort_hours": "not in m5_dataset_v1: no per-timestep zone series kept; "
                     "unmet_hours_ref is a different quantity",
    "max_zone_imbalance_k": "not in m5_dataset_v1: no per-timestep zone series kept",
}

# numeric range check: relative slack for float round-off at the boundaries
RANGE_REL_TOL = 1e-9


@dataclass
class Candidate:
    building: object                 # M0 BuildingModel (pydantic object or JSON dict)
    weather: object                  # M0 WeatherSnapshot, exactly 168 hourly points
    setpoint_c: float                # heating setpoint (not carried by BuildingModel)
    air_changes_per_hour: float      # design infiltration ACH (not carried by BuildingModel)
    candidate_id: str | None = None


TARGET_UNITS = {**AVAILABLE_TARGETS, "min_occupied_temperature_c": "degC", "mean_occupied_temperature_c": "degC",
                "max_occupied_temperature_c": "degC", "comfort_hours": "h", "unmet_hours": "h", "max_zone_imbalance_c": "K"}


def _assets(model_dir: Path = MODEL_DIR) -> dict:
    """Loaded models and support data for one model directory (cached; the same dict every call)."""
    return _load_assets(Path(model_dir))


@lru_cache(maxsize=4)
def _load_assets(model_dir: Path) -> dict:
    support = json.loads((model_dir / "surrogate_support.json").read_text(encoding="utf-8"))
    meta = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    family = support.get("production_model_family", PRODUCTION_FAMILY)
    targets = {t: TARGET_UNITS[t] for t in meta["targets"] if t in TARGET_UNITS and t in support["conformal"]["targets"]}
    models = {}
    for tgt in targets:
        art = joblib.load(model_dir / f"{family}__{tgt}.joblib")
        if list(art["features"]) != mf.FEATURE_NAMES:
            raise RuntimeError(f"{tgt}: model feature order differs from m5_features")
        models[tgt] = art["model"]
    return {
        "targets": targets, "model_version": meta.get("model_version", MODEL_VERSION),
        "models": models,
        "ranges": meta["training_ranges"],
        "catalogue": support["material_catalogue"],
        "support": {k: set(v) for k, v in support["categorical_support"].items()},
        "half_width": {t: c["half_width"] for t, c in support["conformal"]["targets"].items()},
        "nominal": support["conformal"]["nominal_coverage"],
    }


def _weather_reasons(w: dict) -> list:
    pts = w.get("hourly_data") or []
    if len(pts) != mf.WEATHER_WINDOW_HOURS:
        return [f"weather window has {len(pts)} hourly points; the models were trained "
                f"on {mf.WEATHER_WINDOW_HOURS} (7 days)"]
    ts = pd.to_datetime([p["timestamp"] for p in pts], utc=True)
    if not ((ts[1:] - ts[:-1]) == pd.Timedelta(hours=1)).all():
        return ["weather timestamps are not a continuous hourly series"]
    return []


def _categorical_reasons(b: dict, sup: dict) -> list:
    reasons = []
    sig = mf.layout_signature(b)
    if sig not in sup["layout_signatures"]:
        reasons.append(f"layout '{sig}' (zone types per floor, * = heated) not seen in training")
    unknown = mf.material_ids(b) - sup["material_ids"]
    if unknown:
        reasons.append(f"materials not in training catalogue: {sorted(unknown)}")
    kinds = {f"{s['surface_type']}/{s['boundary_type']}" for s in b["surfaces"]} - sup["surface_kinds"]
    if kinds:
        reasons.append(f"surface kinds not seen in training: {sorted(kinds)}")
    ok = {f"{o['opening_type']}/"
          f"{'outdoors' if o.get('connected_boundary') == 'outdoors' else 'zone' if o.get('connected_boundary') else 'none'}"
          for o in b["openings"]} - sup["opening_kinds"]
    if ok:
        reasons.append(f"opening kinds not seen in training: {sorted(ok)}")
    return reasons


def _range_reasons(feats: dict, ranges: dict) -> list:
    reasons = []
    for k in mf.FEATURE_NAMES:
        lo, hi = ranges[k]
        v = feats[k]
        slack = RANGE_REL_TOL * max(1.0, abs(lo), abs(hi))
        if not math.isfinite(v) or v < lo - slack or v > hi + slack:
            reasons.append(f"{k}={v:.6g} outside training range [{lo:.6g}, {hi:.6g}]")
    return reasons


def check_coverage(candidate: Candidate, model_dir: Path = MODEL_DIR) -> tuple[list, dict | None]:
    """The §11.6 guard. Returns (ood_reasons, features); features is None
    whenever the candidate is out of distribution."""
    a = _assets(model_dir)
    b, w = mf.as_dict(candidate.building), mf.as_dict(candidate.weather)
    reasons = _weather_reasons(w) + _categorical_reasons(b, a["support"])
    if reasons:
        return reasons, None
    try:
        feats = mf.extract(b, w, a["catalogue"], candidate.setpoint_c,
                           candidate.air_changes_per_hour)
    except (KeyError, ValueError, ZeroDivisionError, TypeError) as exc:
        return [f"features could not be computed: {type(exc).__name__}: {exc}"], None
    reasons = _range_reasons(feats, a["ranges"])
    return (reasons, None) if reasons else ([], feats)


def predict(candidates: list, model_dir: Path = MODEL_DIR) -> list:
    """Run the OOD guard, then GBT inference for in-distribution candidates
    only. See the module docstring for the return schema."""
    a = _assets(model_dir)
    results, ok_idx, ok_rows = [], [], []
    for i, c in enumerate(candidates):
        b = mf.as_dict(c.building)
        reasons, feats = check_coverage(c, model_dir)
        results.append({
            "candidate_id": c.candidate_id,
            "design_id": b.get("design_id"), "revision_id": b.get("revision_id"),
            "ml_status": STATUS_OK if feats is not None else STATUS_OOD,
            "route_to_m4": feats is None,
            "ood_reasons": reasons,
            "predictions": None,
            "unavailable_targets": {k: v for k, v in UNAVAILABLE_TARGETS.items() if k not in a["targets"]},
            "model_version": a["model_version"],
        })
        if feats is not None:
            ok_idx.append(i)
            ok_rows.append(feats)
    if ok_rows:
        X = pd.DataFrame(ok_rows, columns=mf.FEATURE_NAMES)
        preds = {t: m.predict(X) for t, m in a["models"].items()}
        for j, i in enumerate(ok_idx):
            out = {}
            for t, unit in a["targets"].items():
                v, h = float(preds[t][j]), a["half_width"][t]
                lo, hi = v - h, v + h
                if t in ("heating_energy_kwh", "peak_heating_kw", "unmet_hours_ref", "unmet_hours", "comfort_hours", "max_zone_imbalance_c"):
                    v, lo = max(v, 0.0), max(lo, 0.0)          # physically non-negative
                out[t] = {"value": v, "lower": lo, "upper": hi, "unit": unit,
                          "nominal_coverage": a["nominal"]}
            results[i]["predictions"] = out
    return results
