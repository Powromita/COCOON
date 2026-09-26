"""
ml/m5_train_baselines.py -- Module M5 baseline surrogate training (PRD §11.5).

Trains Extra Trees and Random Forest regressors on data/m5_dataset_v1 and
writes, under data/m5_dataset_v1/model/m5_baseline_v1/:

    <model>__<target>.joblib   one fitted estimator per model family x target
                               (split per target so each file stays well under
                               GitHub's 100 MB per-file limit)
    metadata.json              ranges, checksums, commit, engine version,
                               hyperparameters, metrics

Model families: extra_trees and random_forest (the §11.5 baselines) plus
gbt_reference, the HistGradientBoosting settings of the earlier m5_gbt_v1
model card, retrained on this split as a like-for-like sanity check.

    python ml/m5_train_baselines.py            (from the repo root)

Splits are never by random row. Every row belongs to a weather period (the
7-day window start); the primary split assigns whole weather periods, across
all sites, to train / validation / test, so no test row shares a calendar
weather window with a training row at any site. A second evaluation holds out one complete site (kargil) to
match the existing model card's holdout.

Targets are the scalar labels the M4 dataset retained. The §11.4 targets
maximum / average occupied-zone temperature, comfort hours and maximum zone
imbalance are NOT in this dataset: the generator kept no per-timestep zone
series, so they cannot be derived without re-simulation. They are recorded
as missing in metadata.json rather than approximated.
"""

import gzip
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import (ExtraTreesRegressor, HistGradientBoostingRegressor,
                              RandomForestRegressor)
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data" / "m5_dataset_v1"
OUT = DATA / "model" / "m5_baseline_v1"
SEED = 0
HOLDOUT_SITE = "kargil"

TARGETS = ["heating_energy_kwh", "peak_heating_kw", "passive_min_temperature_c",
           "passive_median_temperature_c", "unmet_hours_ref"]
MISSING_TARGETS = {
    "max_occupied_zone_temperature_c": "no per-timestep zone series retained",
    "mean_occupied_zone_temperature_c": "only the median was stored",
    "comfort_hours": "no per-timestep zone series retained; unmet_hours_ref is a "
                     "different quantity (capacity-limited 4 kW run)",
    "max_zone_imbalance_k": "no per-timestep zone series retained",
}

# Small grid, chosen on the validation weather periods only. Leaves of 1
# score marginally higher but make the forests several hundred MB, so the
# leaf size floor is 2.
N_ESTIMATORS = 100
GRID = {
    "extra_trees": [dict(n_estimators=N_ESTIMATORS, max_features=mf, min_samples_leaf=msl)
                    for mf in (1.0, 0.5) for msl in (2, 3)],
    "random_forest": [dict(n_estimators=N_ESTIMATORS, max_features=mf, min_samples_leaf=msl)
                      for mf in (1.0, 0.5, 0.33) for msl in (2, 3)],
    # the m5_gbt_v1 model card's params, unchanged
    "gbt_reference": [dict(learning_rate=0.06, max_iter=300, max_leaf_nodes=31,
                           min_samples_leaf=20, l2_regularization=1.0,
                           early_stopping=False)],
}
MODELS = {"extra_trees": ExtraTreesRegressor, "random_forest": RandomForestRegressor,
          "gbt_reference": HistGradientBoostingRegressor}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_state() -> dict:
    def run(*a):
        return subprocess.run(["git", *a], cwd=REPO, capture_output=True,
                              text=True).stdout.strip()
    return {"commit": run("rev-parse", "HEAD"),
            "dirty": bool(run("status", "--porcelain", "--", "ml", "data/m5_dataset_v1"))}


def load() -> pd.DataFrame:
    """features.csv.gz joined with the grouping keys kept in the raw rows."""
    df = pd.read_csv(DATA / "features.csv.gz")
    keys = {}
    for f in sorted(DATA.glob("rows_*.jsonl.gz")):
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            for line in fh:
                r = json.loads(line)
                if r["status"] == "ok":
                    p = r["params"]
                    keys[p["row_index"]] = (r["extras"]["template_id"], p["window_start"])
    df["template_id"] = df["row_index"].map(lambda i: keys[i][0])
    df["window_start"] = df["row_index"].map(lambda i: keys[i][1])
    df["weather_period"] = df["window_start"]
    return df


def fit(name, params, X, y):
    extra = {} if name == "gbt_reference" else {"n_jobs": -1}
    return MODELS[name](random_state=SEED, **extra, **params).fit(X, y)


def score(est, X, y) -> dict:
    p = est.predict(X)
    return {"n": int(len(y)), "r2": float(r2_score(y, p)),
            "mae": float(mean_absolute_error(y, p)), "label_std": float(np.std(y))}


def split_indices(df: pd.DataFrame):
    """Primary split: whole weather periods -> 70 / 15 / 15 (train, validation, test)."""
    groups = df["weather_period"].to_numpy()
    idx = np.arange(len(df))
    tr_va, te = next(GroupShuffleSplit(1, test_size=0.15, random_state=SEED).split(idx, groups=groups))
    tr, va = next(GroupShuffleSplit(1, test_size=0.15 / 0.85, random_state=SEED)
                  .split(tr_va, groups=groups[tr_va]))
    tr, va = tr_va[tr], tr_va[va]
    assert not set(groups[tr]) & set(groups[te]) and not set(groups[va]) & set(groups[te])
    return tr, va, te


def main() -> None:
    t0 = time.time()
    git = git_state()                       # before any artifact is written
    card = json.loads((DATA / "model" / "model_card.json").read_text(encoding="utf-8"))
    features = card["feature_names"]
    ds_meta = json.loads((DATA / "metadata.json").read_text(encoding="utf-8"))

    df = load()
    Xdf = df[features].astype(float)
    X = Xdf.to_numpy()
    tr, va, te = split_indices(df)

    site_ho = (df["site"] == HOLDOUT_SITE).to_numpy()

    OUT.mkdir(parents=True, exist_ok=True)
    metrics, chosen, fitted = {}, {}, {}
    for name in MODELS:
        metrics[name], chosen[name], fitted[name] = {}, {}, {}
        for tgt in TARGETS:
            y = df[tgt].to_numpy(dtype=float)
            best = GRID[name][0] if len(GRID[name]) == 1 else max(
                GRID[name], key=lambda g: r2_score(y[va], fit(name, g, X[tr], y[tr]).predict(X[va])))
            chosen[name][tgt] = best
            est = fit(name, best, X[tr], y[tr])
            m = {"validation": score(est, X[va], y[va]), "test": score(est, X[te], y[te])}
            ho = fit(name, best, X[~site_ho], y[~site_ho])
            m[f"site_holdout_{HOLDOUT_SITE}"] = score(ho, X[site_ho], y[site_ho])
            metrics[name][tgt] = m
            # shipped model: refit on train + validation, test periods stay unseen
            fit_idx = np.r_[tr, va]
            est = fit(name, best, Xdf.iloc[fit_idx], y[fit_idx])   # keeps feature names
            joblib.dump({"features": features, "target": tgt, "model": est},
                        OUT / f"{name}__{tgt}.joblib", compress=3)
            fitted[name][tgt] = f"{name}__{tgt}.joblib"
            print(f"{name:14s} {tgt:30s} test R2 {m['test']['r2']:.4f}  "
                  f"MAE {m['test']['mae']:.3f}  {HOLDOUT_SITE} R2 "
                  f"{m[f'site_holdout_{HOLDOUT_SITE}']['r2']:.4f}", flush=True)

    X_fit = df.iloc[np.r_[tr, va]]
    meta = {
        "model_version": "m5_baseline_v1",
        "created_at_unix": int(time.time()),
        "training_seconds": round(time.time() - t0, 1),
        "git": git,
        "training_script": "ml/m5_train_baselines.py",
        "library_versions": {"python": sys.version.split()[0], "scikit-learn": sklearn.__version__,
                             "numpy": np.__version__, "pandas": pd.__version__,
                             "joblib": joblib.__version__},
        "dataset": {
            "version": ds_meta["dataset_version"],
            "features_csv_sha256": sha256(DATA / "features.csv.gz"),
            "raw_rows_sha256": {f.name: sha256(f) for f in sorted(DATA.glob("rows_*.jsonl.gz"))},
            "rows_total": ds_meta["rows"], "rows_ok_used": int(len(df)),
            "generator_git_commit": ds_meta["git_commit"],
        },
        "engine": {"name": ds_meta["m4_engine"], "version": ds_meta["m4_version"],
                   "options": ds_meta["m4_options"],
                   "timestep_seconds": ds_meta["timestep_seconds"],
                   "warmup_hours": ds_meta["warmup_hours"], "window_days": ds_meta["window_days"]},
        "targets": TARGETS,
        "target_definitions": ds_meta["labels"],
        "missing_targets_prd_11_4": MISSING_TARGETS,
        "features": features,
        "training_ranges": {c: [float(X_fit[c].min()), float(X_fit[c].max())] for c in features},
        "target_ranges": {c: [float(X_fit[c].min()), float(X_fit[c].max())] for c in TARGETS},
        "split": {
            "method": "GroupShuffleSplit on weather_period = window_start across "
                      "all sites (no calendar weather window shared across splits); "
                      "shipped models refit on train+validation",
            "seed": SEED, "n_weather_periods": int(df["weather_period"].nunique()),
            "sizes": {"train": int(len(tr)), "validation": int(len(va)), "test": int(len(te))},
            "site_holdout": {"site": HOLDOUT_SITE, "n": int(site_ho.sum()),
                             "note": "separate fit on all other sites, not the shipped model"},
            "templates": df["template_id"].value_counts().to_dict(),
        },
        "hyperparameters": {n: {"random_state": SEED, "grid": GRID[n],
                                "chosen_per_target": chosen[n]} for n in MODELS},
        "metrics": metrics,
        "artifacts": {f: sha256(OUT / f) for n in MODELS for f in fitted[n].values()},
    }
    (OUT / "metadata.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"wrote {OUT} in {meta['training_seconds']} s")


if __name__ == "__main__":
    main()
