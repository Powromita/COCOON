"""
ml/m5_generate_v2.py -- Module M5 dataset v2: designs from M2, labels from the M4 that ships in this repository.

    python ml/m5_generate_v2.py --rows 8000 --workers 12          (from the repo root)

Why v2 exists. m5_dataset_v1 was labelled by a "cocoon_multizone_rc 0.1.0" that is not in this repository and used
a material catalogue (mat_snap_ladakh_csv_v1) unrelated to the M0 snapshots the rest of the pipeline uses, so its
models call every M2 design out-of-distribution and it never learned max / mean occupied temperature or comfort
hours. v2 is generated from scratch with the SAME code the pipeline runs (M3 weather -> M2 designs -> M4 physics)
and labelled exactly as M6 measures a verified design:

    runs (per row, M6's own verify_candidate): free-floating, ideal-load, heater sizing, capacity-limited
    warm-up excluded: the first 48 h of the 7-day window (M6 default)

    heating_energy_kwh            ideal-load: heater power x step, summed over the kept steps
    peak_heating_kw               ideal-load: largest total heater power in the kept steps
    min/mean/max_occupied_temperature_c   capacity-limited (sized heater): occupied rooms (rooms with an occupancy
                                  schedule); min and max over rooms and time, mean over rooms and time
    comfort_hours                 capacity-limited: hours every occupied room is at or above setpoint - 0.05 K
    unmet_hours                   capacity-limited: hours any occupied room is below setpoint - 0.05 K
    max_zone_imbalance_c          capacity-limited: largest spread between occupied rooms at one instant
    passive_min / median_temperature_c    free-floating, occupied rooms (kept for continuity with v1)

Rows are independent and reproducible: row i uses seed (base_seed, i) for the requirements, the site, the weather
window and the M2 seed. A row whose requirements are infeasible or whose design fails a run is stored with
status != "ok" and a reason; it is never patched or dropped silently.
"""

from __future__ import annotations

import argparse
import gzip
import json
import multiprocessing as mp
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

OUT = REPO / "data" / "m5_dataset_v2"
DATASET_VERSION = "m5_dataset_v2"
WARMUP_HOURS = 48.0
SHARD_SIZE = 200
UNMET_TOL_K = 0.05

ROOM_SETS = [                                       # room lists M2 templates can satisfy (see design_generator/templates)
    ["living"],
    ["airlock", "living"],
    ["airlock", "living", "equipment"],
    ["living", "sleeping", "storage"],
    ["airlock", "command", "equipment"],
    ["airlock", "living", "sleeping", "equipment"],
    ["airlock", "medical", "sleeping", "storage"],
]
IST = timezone(timedelta(hours=5, minutes=30))


def _commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:                                                     # noqa: BLE001
        return "unknown"


# ------------------------------------------------------------------------------------------------------------------
def sample_requirements(rng: np.random.Generator, sites: list[str], site_meta: dict, materials: list[str]) -> tuple[dict, dict]:
    site = str(rng.choice(sites))
    meta = site_meta[site]
    start = datetime(2025, 10, 15) + timedelta(days=int(rng.integers(0, 160)), hours=int(rng.integers(0, 24)))
    rooms = list(ROOM_SETS[int(rng.integers(len(ROOM_SETS)))])
    occupants = int(rng.integers(4, 61))
    n_mat = int(rng.integers(3, len(materials) + 1))
    mats = sorted(rng.choice(materials, size=n_mat, replace=False).tolist())
    req = {
        "schema_version": "4.0", "project_id": "prj_m5_dataset_v2", "mode": "new_shelter",
        "site": {"latitude_deg": meta["lat"], "longitude_deg": meta["lon"], "elevation_m": meta["elev"],
                 "timezone": "Asia/Kolkata", "weather_source": "NASA_POWER",
                 "analysis_start": start.replace(tzinfo=IST).isoformat(),
                 "analysis_end": (start + timedelta(hours=168)).replace(tzinfo=IST).isoformat()},
        "mission": {"type": "living_sleeping", "occupants": occupants, "required_rooms": rooms,
                    "occupancy_schedule_id": f"continuous_{occupants}",
                    "target_temperature_c": float(rng.choice([12.0, 15.0, 15.0, 18.0, 20.0])), "maximum_unmet_hours": 12},
        "constraints": {"maximum_footprint_m2": float(rng.integers(30, 121)), "maximum_floors": int(rng.integers(1, 3)),
                        "maximum_capex_inr": 5_000_000.0, "available_material_ids": mats, "heater_fuels": ["kerosene"],
                        "preferred_orientation_deg": None, "maximum_mass_kg": None, "max_assembly_time_hours": None},
        "economic_assumption_set_id": "econ_ladakh_expected_v1"}
    return req, {"site": site, "window_start": req["site"]["analysis_start"], "occupants": occupants, "rooms": rooms}


_W = {}


def _init(seed: int):
    from cocoon_contracts import MaterialSnapshot
    from m3_data import WeatherStore, extended_snapshot
    from m4_engine import M4Evaluator
    _W["materials"] = extended_snapshot()
    _W["store"] = WeatherStore()
    _W["mem"] = {}                                   # snapshots frozen for the current row (never written to disk)
    _W["evaluator"] = M4Evaluator(_W["materials"], _W["mem"])
    _W["seed"] = seed


def _label(index: int) -> dict:
    from cocoon_contracts import RequirementsContract
    from design_generator import generate_designs
    from m3_data import SITES
    from optimization.objectives import kept_points
    from optimization.rc_verification import VerificationSettings, verify_candidate

    rng = np.random.default_rng([_W["seed"], index])
    mats = _W["materials"]
    ids = sorted(m for m in mats.materials)
    req, params = sample_requirements(rng, sorted(SITES), SITES, ids)
    params = {**params, "row_index": index}
    row = {"params": params, "status": "failed", "reason": None, "extras": None, "building": None, "labels": None}
    try:
        reqs = RequirementsContract.model_validate(req)
        gen = generate_designs(reqs, mats, seed=int(rng.integers(0, 2**31 - 1)), count=1)
    except Exception as exc:                                              # noqa: BLE001
        row["reason"] = f"generation: {type(exc).__name__}: {exc}"[:300]
        return row
    if not gen.candidates:
        row["reason"] = "generation: no valid candidate (" + ", ".join(list(gen.reasons)[:3]) + ")"
        return row
    cand = gen.candidates[0]
    b = cand.building
    row["building"] = b.model_dump(mode="json")
    row["extras"] = {k: cand.extras.get(k) for k in ("template_id", "orientation_deg", "glazing", "airtightness_class",
                                                    "air_changes_per_hour", "wwr_target")}
    try:
        snap = _W["store"].build(params["site"], pd.Timestamp(req["site"]["analysis_start"]).tz_localize(None),
                                 pd.Timestamp(req["site"]["analysis_end"]).tz_localize(None), persist=False)
        _W["mem"].clear()
        _W["mem"][snap.snapshot_id] = snap
        ev = _W["evaluator"]
        vs = VerificationSettings.from_requirements(reqs, weather_snapshot_id=snap.snapshot_id)
        ver = verify_candidate(cand, ev, vs)
    except Exception as exc:                                              # noqa: BLE001
        row["reason"] = f"simulation: {type(exc).__name__}: {exc}"[:300]
        return row
    if ver.status != "verified":
        row["reason"] = f"verification: {ver.failure.code}: {ver.failure.message}"[:300]
        return row

    ideal, limited, free = ver.evaluation.ideal_load, ver.evaluation.capacity_limited, ver.evaluation.free_floating
    occ = [z.id for f in b.floors for z in f.zones if z.occupancy_schedule_id]
    sp = float(reqs.mission.target_temperature_c)
    lo = sp - UNMET_TOL_K

    def series(result):
        pts, dt = kept_points(result, WARMUP_HOURS)
        return pts, dt

    pts, dt = series(ideal)
    total_w = np.array([sum(p.heating_power_w.values()) for p in pts])
    lp, dtl = series(limited)
    fp, _ = series(free)
    lab = {"heating_energy_kwh": float(total_w.sum() * dt / 1000.0), "peak_heating_kw": float(total_w.max() / 1000.0),
           "heater_capacity_kw": float(ver.heater.capacity_kw), "setpoint_c": sp}
    if occ:
        L = np.array([[p.zone_temperatures_c[z] for z in occ] for p in lp])
        F = np.array([[p.zone_temperatures_c[z] for z in occ] for p in fp])
        lab.update({"min_occupied_temperature_c": float(L.min()), "mean_occupied_temperature_c": float(L.mean()),
                    "max_occupied_temperature_c": float(L.max()),
                    "comfort_hours": float((L >= lo).all(axis=1).sum() * dtl),
                    "unmet_hours": float((L < lo).any(axis=1).sum() * dtl),
                    "max_zone_imbalance_c": float((L.max(axis=1) - L.min(axis=1)).max()),
                    "passive_min_temperature_c": float(F.min()),
                    "passive_median_temperature_c": float(np.median(F.mean(axis=1)))})
    else:
        row["reason"] = "no occupied zone (no occupancy schedule)"
        return row
    row.update({"status": "ok", "labels": lab, "reason": None})
    return row


def _run_chunk(indices: list[int]) -> list[dict]:
    return [_label(i) for i in indices]


# ------------------------------------------------------------------------------------------------------------------
def build_features(rows: list[dict], catalogue: dict) -> pd.DataFrame:
    import m5_features as mf
    from m3_data import WeatherStore
    store = WeatherStore()
    recs = []
    for r in rows:
        if r["status"] != "ok":
            continue
        p = r["params"]
        s = pd.Timestamp(p["window_start"]).tz_localize(None)
        w = store.build(p["site"], s, s + pd.Timedelta(hours=168), persist=False)
        f = mf.extract(r["building"], w, catalogue, r["labels"]["setpoint_c"], r["extras"]["air_changes_per_hour"])
        recs.append({"row_index": p["row_index"], "site": p["site"], "window_start": p["window_start"],
                     "template_id": r["extras"]["template_id"], **f, **{k: v for k, v in r["labels"].items()}})
    return pd.DataFrame(recs)


def catalogue_from(snapshot) -> dict:
    return {mid: {"k_w_mk": m.properties.thermal_conductivity_w_mk, "density_kg_m3": m.properties.density_kg_m3,
                  "specific_heat_j_kgk": m.properties.specific_heat_j_kgk,
                  "heat_capacity_kj_m3k": m.properties.density_kg_m3 * m.properties.specific_heat_j_kgk / 1000.0,
                  "solar_absorptivity": m.properties.solar_absorptivity if m.properties.solar_absorptivity is not None else 0.6}
            for mid, m in snapshot.materials.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=8000)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--seed", type=int, default=11)
    a = ap.parse_args()
    from m3_data import extended_snapshot
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    idx = list(range(a.rows))
    chunks = [idx[i:i + 20] for i in range(0, len(idx), 20)]
    rows: list[dict] = []
    with mp.Pool(a.workers, initializer=_init, initargs=(a.seed,)) as pool:
        for n, part in enumerate(pool.imap(_run_chunk, chunks), 1):
            rows.extend(part)
            if n % 10 == 0:
                ok = sum(r["status"] == "ok" for r in rows)
                print(f"  {len(rows)}/{a.rows} rows, {ok} ok, {time.time() - t0:.0f}s", flush=True)
    rows.sort(key=lambda r: r["params"]["row_index"])
    for old in OUT.glob("rows_*.jsonl.gz"):
        old.unlink()
    for s in range(0, len(rows), SHARD_SIZE):
        with gzip.open(OUT / f"rows_{s // SHARD_SIZE:05d}.jsonl.gz", "wt", encoding="utf-8") as fh:
            for r in rows[s:s + SHARD_SIZE]:
                fh.write(json.dumps(r) + "\n")
    snap = extended_snapshot()
    cat = catalogue_from(snap)
    feats = build_features(rows, cat)
    feats.to_csv(OUT / "features.csv.gz", index=False)
    reasons: dict[str, int] = {}
    for r in rows:
        if r["status"] != "ok":
            key = (r["reason"] or "").split(":")[0] + ":" + ((r["reason"] or "").split(":")[1].strip()[:40] if ":" in (r["reason"] or "") else "")
            reasons[key] = reasons.get(key, 0) + 1
    meta = {"dataset_version": DATASET_VERSION, "generation_seconds": round(time.time() - t0, 1), "git_commit": _commit(),
            "m4_engine": "cocoon_multizone_rc", "m4_version": "1.0.0", "material_snapshot_id": snap.snapshot_id,
            "material_checksum": snap.checksum_sha256, "rows": len(rows), "rows_ok": int(len(feats)), "seed": a.seed,
            "shard_size": SHARD_SIZE, "sites": sorted(feats["site"].unique().tolist()), "timestep_seconds": 900,
            "warmup_hours": WARMUP_HOURS, "window_days": 7, "failure_reasons": reasons,
            "labels": {"heating_energy_kwh": "ideal-load run, heater power x step summed over the kept steps (after 48 h)",
                       "peak_heating_kw": "ideal-load run, largest total heater power (after 48 h)",
                       "min_occupied_temperature_c": "capacity-limited run with the M6-sized heater, occupied rooms, after 48 h",
                       "mean_occupied_temperature_c": "as above, mean over rooms and time",
                       "max_occupied_temperature_c": "as above, maximum over rooms and time",
                       "comfort_hours": "capacity-limited: hours every occupied room >= setpoint - 0.05 K",
                       "unmet_hours": "capacity-limited: hours any occupied room < setpoint - 0.05 K",
                       "max_zone_imbalance_c": "capacity-limited: largest spread between occupied rooms at one instant",
                       "passive_min_temperature_c": "free-floating, occupied rooms, after 48 h",
                       "passive_median_temperature_c": "free-floating, median over time of the mean occupied-room temperature"}}
    (OUT / "metadata.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    (OUT / "material_catalogue.json").write_text(json.dumps(cat, indent=1), encoding="utf-8")
    print(f"wrote {OUT}: {len(feats)} ok of {len(rows)} rows in {meta['generation_seconds']} s; failures {reasons}")


if __name__ == "__main__":
    mp.freeze_support()
    main()
