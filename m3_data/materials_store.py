"""
materials_store.py - Module M3: versioned, checksummed M0 MaterialSnapshots (PRD 9.4).

    standard_snapshot()   the frozen v1 set every module already uses (packages/.../material_snapshot_standard.json)
    extended_snapshot()   v1 plus the project's traditional-Ladakh library (adobe, rammed earth, straw-clay,
                          timber, reinforced concrete). Where v1 already defines a material, v1 wins.

Costs live beside thermal properties in the M0 contract (`cost_inr_per_m3`), but M7 prices from its own frozen
assumption set, so a material cost here is informational. Material IDs use the M0 `mat_` prefix; the legacy
library names map as `adobe -> mat_adobe`.
"""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cocoon_contracts import MaterialSnapshot

REPO_ROOT = Path(__file__).resolve().parents[1]
STANDARD_PATH = REPO_ROOT / "packages" / "packages" / "contracts" / "fixtures" / "valid" / "material_snapshot_standard.json"
LEGACY_LIBRARY = REPO_ROOT / "thermal-calculator" / "data" / "material_properties.json"
COST_CSV = REPO_ROOT / "data" / "shelter" / "shelter_material_logistics.csv"
STORE_DIR = REPO_ROOT / "data" / "materials"
IST = timezone(timedelta(hours=5, minutes=30))
_LEGACY_TO_ID = {"stone_masonry": "mat_stone_masonry", "concrete": "mat_concrete_legacy", "puf": "mat_puf_legacy"}


def materials_checksum(materials: dict) -> str:
    payload = {k: v.model_dump(mode="json") if hasattr(v, "model_dump") else v for k, v in materials.items()}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def standard_snapshot() -> MaterialSnapshot:
    return MaterialSnapshot.model_validate_json(STANDARD_PATH.read_text(encoding="utf-8"))


def _costs() -> dict[str, float]:
    if not COST_CSV.is_file():
        return {}
    with open(COST_CSV, newline="", encoding="utf-8") as fh:
        return {r["material"].strip().lower(): float(r["cost_inr_per_m3"]) for r in csv.DictReader(fh)}


def extended_snapshot(snapshot_id: str = "mat_snap_himalayan_v2") -> MaterialSnapshot:
    base = standard_snapshot()
    legacy = json.loads(LEGACY_LIBRARY.read_text(encoding="utf-8"))
    costs = _costs()
    materials = {k: v.model_dump(mode="json") for k, v in base.materials.items()}
    for name, raw in legacy.items():
        mid = _LEGACY_TO_ID.get(name, f"mat_{name}")
        if mid in materials or name in ("stone_masonry", "concrete", "puf"):
            continue                                            # v1 already covers stone / concrete / PUF
        materials[mid] = {
            "id": mid, "display_name": raw["display_name"], "category": raw.get("category", "traditional"),
            "properties": {"thermal_conductivity_w_mk": raw["thermal_conductivity"], "density_kg_m3": raw["density"],
                           "specific_heat_j_kgk": raw["specific_heat"], "emissivity": raw.get("emissivity"),
                           "solar_absorptivity": raw.get("solar_absorptance"), "cost_inr_per_m2": None,
                           "cost_inr_per_m3": costs.get(name)},
            "source_reference": raw.get("data_source", "thermal-calculator/data/material_properties.json"),
            "effective_date": datetime(2026, 9, 25, tzinfo=IST).isoformat(),
            "min_temperature_c": None, "max_temperature_c": None}
    snap = MaterialSnapshot.model_validate({
        "schema_version": "4.0", "snapshot_id": snapshot_id, "materials": materials, "checksum_sha256": "0" * 64,
        "created_at": datetime(2026, 9, 25, tzinfo=IST).isoformat()})
    return snap.model_copy(update={"checksum_sha256": materials_checksum(snap.materials)})     # over the validated form


def verify_snapshot(snap: MaterialSnapshot) -> bool:
    return materials_checksum(snap.materials) == snap.checksum_sha256


def save_snapshot(snap: MaterialSnapshot, directory: Path = STORE_DIR) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{snap.snapshot_id}.json"
    path.write_text(snap.model_dump_json(indent=1), encoding="utf-8")
    return path


def load_snapshot(snapshot_id: str, directory: Path = STORE_DIR) -> MaterialSnapshot:
    if snapshot_id == "mat_snap_himalayan_v1":
        return standard_snapshot()
    path = (directory / f"{snapshot_id}.json").resolve()
    try:
        path.relative_to(directory.resolve())
    except ValueError:
        raise KeyError(snapshot_id)
    if not path.is_file():
        raise KeyError(snapshot_id)
    return MaterialSnapshot.model_validate_json(path.read_text(encoding="utf-8"))
