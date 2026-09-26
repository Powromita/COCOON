"""
ml/m5_train_v2.py -- Module M5 surrogate v2: train on data/m5_dataset_v2 (M2 designs labelled by the repository's M4).

    python ml/m5_train_v2.py          (from the repo root, after ml/m5_generate_v2.py)

Writes data/m5_dataset_v2/model/m5_baseline_v2/:
    gbt_reference__<target>.joblib   the shipped model, one HistGradientBoosting regressor per target
    metadata.json                    ranges, checksums, commit, engine version, hyperparameters, metrics
    surrogate_support.json           what ml/surrogate.py needs besides the models (catalogue, categorical support,
                                     conformal half-widths)

Evaluation follows PRD 11.5: Extra Trees and Random Forest baselines and the boosted model are all scored, on
held-out WEATHER PERIODS (never random rows) and on one held-out SITE. Only the boosted model is shipped: the two
forest baselines are evaluation-only here (their files run to hundreds of MB), and that is recorded in metadata.

Coverage guard (PRD 11.6): support.json lists the layouts, materials, surface and opening kinds seen in training;
metadata.json holds the numeric feature ranges. ml/surrogate.py sends anything outside them to M4.
"""

from __future__ import annotations

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
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import m5_features as mf                                                    # noqa: E402

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data" / "m5_dataset_v2"
OUT = DATA / "model" / "m5_baseline_v2"
SEED = 0
HOLDOUT_SITE = "kargil"
FAMILY = "gbt_reference"
NOMINAL_COVERAGE = 0.8
TARGETS = ["heating_energy_kwh", "peak_heating_kw", "min_occupied_temperature_c", "mean_occupied_temperature_c",
           "max_occupied_temperature_c", "comfort_hours", "unmet_hours", "max_zone_imbalance_c",
           "passive_min_temperature_c", "passive_median_temperature_c"]
GBT = dict(learning_rate=0.06, max_iter=300, max_leaf_nodes=31, min_samples_leaf=20, l2_regularization=1.0, early_stopping=False)
FORESTS = {"extra_trees": (ExtraTreesRegressor, dict(n_estimators=60, max_features=0.5, min_samples_leaf=3, n_jobs=-1)),
           "random_forest": (RandomForestRegressor, dict(n_estimators=60, max_features=0.33, min_samples_leaf=3, n_jobs=-1))}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_state() -> dict:
    def run(*a):
        return subprocess.run(["git", *a], cwd=REPO, capture_output=True, text=True).stdout.strip()
    return {"commit": run("rev-parse", "HEAD"), "dirty": bool(run("status", "--porcelain", "--", "ml", "m4_engine"))}


def score(y, p) -> dict:
    return {"n": int(len(y)), "r2": float(r2_score(y, p)), "mae": float(mean_absolute_error(y, p)), "label_std": float(np.std(y))}


def split(df: pd.DataFrame):
    groups = df["window_start"].to_numpy()
    idx = np.arange(len(df))
    tr_va, te = next(GroupShuffleSplit(1, test_size=0.15, random_state=SEED).split(idx, groups=groups))
    tr, va = next(GroupShuffleSplit(1, test_size=0.15 / 0.85, random_state=SEED).split(tr_va, groups=groups[tr_va]))
    tr, va = tr_va[tr], tr_va[va]
    assert not set(groups[tr]) & set(groups[te]) and not set(groups[va]) & set(groups[te])
    return tr, va, te


def rows_by_index() -> dict:
    import gzip
    rows = {}
    for f in sorted(DATA.glob("rows_*.jsonl.gz")):
        with gzip.open(f, "rt", encoding="utf-8") as fh:
            for line in fh:
                r = json.loads(line)
                if r["status"] == "ok":
                    rows[r["params"]["row_index"]] = r
    return rows


def main() -> None:
    t0 = time.time()
    git = git_state()
    df = pd.read_csv(DATA / "features.csv.gz")
    ds = json.loads((DATA / "metadata.json").read_text(encoding="utf-8"))
    catalogue = json.loads((DATA / "material_catalogue.json").read_text(encoding="utf-8"))
    features = mf.FEATURE_NAMES
    X = df[features].astype(float)
    tr, va, te = split(df)
    site_ho = (df["site"] == HOLDOUT_SITE).to_numpy()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.joblib"):
        old.unlink()

    # a label that never varies (e.g. unmet hours when the heater is always sized to hold the setpoint) carries no signal
    constant = [t for t in TARGETS if float(df[t].std()) < 1e-9]
    targets = [t for t in TARGETS if t not in constant]
    print("constant labels, not learned:", constant)
    metrics, conformal = {}, {}
    for tgt in targets:
        y = df[tgt].to_numpy(dtype=float)
        gb = HistGradientBoostingRegressor(random_state=SEED, **GBT)
        m_tr = gb.fit(X.iloc[tr], y[tr])
        res = np.sort(np.abs(m_tr.predict(X.iloc[va]) - y[va]))
        q = float(res[min(len(res) - 1, int(np.ceil((len(res) + 1) * NOMINAL_COVERAGE)) - 1)])
        metrics[tgt] = {FAMILY: {"validation": score(y[va], m_tr.predict(X.iloc[va])), "test": score(y[te], m_tr.predict(X.iloc[te])),
                                 f"site_holdout_{HOLDOUT_SITE}": score(
                                     y[site_ho], HistGradientBoostingRegressor(random_state=SEED, **GBT)
                                     .fit(X[~site_ho], y[~site_ho]).predict(X[site_ho]))}}
        for name, (cls, params) in FORESTS.items():
            est = cls(random_state=SEED, **params).fit(X.iloc[tr], y[tr])
            metrics[tgt][name] = {"validation": score(y[va], est.predict(X.iloc[va])), "test": score(y[te], est.predict(X.iloc[te]))}
        fit_idx = np.r_[tr, va]
        shipped = HistGradientBoostingRegressor(random_state=SEED, **GBT).fit(X.iloc[fit_idx], y[fit_idx])
        joblib.dump({"features": features, "target": tgt, "model": shipped}, OUT / f"{FAMILY}__{tgt}.joblib", compress=3)
        cov = float(np.mean(np.abs(shipped.predict(X.iloc[te]) - y[te]) <= q))
        conformal[tgt] = {"half_width": q, "n_calibration": int(len(res)), "test_coverage_shipped_model": cov}
        m = metrics[tgt]
        print(f"{tgt:30s} GBT test R2 {m[FAMILY]['test']['r2']:.3f} MAE {m[FAMILY]['test']['mae']:.3f}  "
              f"ET {m['extra_trees']['test']['r2']:.3f}  RF {m['random_forest']['test']['r2']:.3f}  "
              f"{HOLDOUT_SITE} {m[FAMILY]['site_holdout_' + HOLDOUT_SITE]['r2']:.3f}  cov {cov:.2f}", flush=True)

    rows = rows_by_index()
    fit_rows = set(df["row_index"].iloc[np.r_[tr, va]])
    fit_b = [rows[i]["building"] for i in sorted(fit_rows)]
    support = {
        "support_version": "m5_baseline_v2.support.1", "built_by": "ml/m5_train_v2.py", "git": git,
        "production_model_family": FAMILY, "fit_rows": len(fit_rows), "material_catalogue": catalogue,
        "material_catalogue_provenance": {"source": "M3 MaterialSnapshot " + ds["material_snapshot_id"] + " (exact, not recovered)",
                                          "checksum_sha256": ds["material_checksum"]},
        "categorical_support": {
            "layout_signatures": sorted({mf.layout_signature(b) for b in fit_b}),
            "material_ids": sorted({m for b in fit_b for m in mf.material_ids(b)}),
            "surface_kinds": sorted({f"{s['surface_type']}/{s['boundary_type']}" for b in fit_b for s in b["surfaces"]}),
            "opening_kinds": sorted({f"{o['opening_type']}/" f"{'outdoors' if o.get('connected_boundary') == 'outdoors' else 'zone' if o.get('connected_boundary') else 'none'}"
                                     for b in fit_b for o in b["openings"]})},
        "conformal": {"nominal_coverage": NOMINAL_COVERAGE,
                      "method": "split conformal, symmetric: |residual| quantile on validation weather periods, model fit on training periods only",
                      "targets": conformal}}
    (OUT / "surrogate_support.json").write_text(json.dumps(support, indent=1), encoding="utf-8")

    X_fit = df.iloc[np.r_[tr, va]]
    meta = {
        "model_version": "m5_baseline_v2", "created_at_unix": int(time.time()), "training_seconds": round(time.time() - t0, 1),
        "git": git, "training_script": "ml/m5_train_v2.py",
        "library_versions": {"python": sys.version.split()[0], "scikit-learn": sklearn.__version__, "numpy": np.__version__,
                             "pandas": pd.__version__, "joblib": joblib.__version__},
        "dataset": {"version": ds["dataset_version"], "features_csv_sha256": sha256(DATA / "features.csv.gz"),
                    "raw_rows_sha256": {f.name: sha256(f) for f in sorted(DATA.glob("rows_*.jsonl.gz"))},
                    "rows_total": ds["rows"], "rows_ok_used": int(len(df)), "generator_git_commit": ds["git_commit"],
                    "failure_reasons": ds["failure_reasons"]},
        "engine": {"name": ds["m4_engine"], "version": ds["m4_version"], "timestep_seconds": ds["timestep_seconds"],
                   "warmup_hours": ds["warmup_hours"], "window_days": ds["window_days"]},
        "targets": targets, "constant_targets_not_learned": constant, "target_definitions": ds["labels"], "features": features,
        "training_ranges": {c: [float(X_fit[c].min()), float(X_fit[c].max())] for c in features},
        "target_ranges": {c: [float(X_fit[c].min()), float(X_fit[c].max())] for c in targets},
        "split": {"method": "GroupShuffleSplit on weather window start across all sites (no calendar weather window shared "
                            "across splits); shipped models refit on train+validation",
                  "seed": SEED, "sizes": {"train": int(len(tr)), "validation": int(len(va)), "test": int(len(te))},
                  "site_holdout": {"site": HOLDOUT_SITE, "n": int(site_ho.sum()), "note": "separate fit on all other sites"},
                  "templates": df["template_id"].value_counts().to_dict()},
        "hyperparameters": {FAMILY: GBT, **{k: v[1] for k, v in FORESTS.items()}},
        "shipped_family": FAMILY, "evaluation_only_families": list(FORESTS),
        "note_baselines": "Extra Trees / Random Forest are scored (PRD 11.5) but not shipped: their files run to hundreds of MB.",
        "metrics": metrics, "artifacts": {f.name: sha256(f) for f in sorted(OUT.glob("*.joblib"))}}
    (OUT / "metadata.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"wrote {OUT} in {meta['training_seconds']} s")


if __name__ == "__main__":
    main()
