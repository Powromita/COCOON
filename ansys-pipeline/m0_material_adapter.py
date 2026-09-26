"""
m0_material_adapter.py

Adapter converting official M0 MaterialSnapshot contracts into the materials
database format expected by geometry_builder.py and geometry_builder_multiroom.py,
and validating material references across BuildingModel assemblies.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Ensure packages/contracts/python is importable if not already in sys.path
_CONTRACTS_DIR = Path(__file__).resolve().parent.parent / "packages" / "contracts" / "python"
if _CONTRACTS_DIR.is_dir() and str(_CONTRACTS_DIR) not in sys.path:
    sys.path.insert(0, str(_CONTRACTS_DIR))

from cocoon_contracts.building import BuildingModel
from cocoon_contracts.materials import MaterialSnapshot


def load_material_snapshot(path: str | Path) -> MaterialSnapshot:
    """Read a JSON file and validate it using MaterialSnapshot.model_validate_json.

    Parameters
    ----------
    path : str | Path
        Path to the JSON file containing serialized MaterialSnapshot.

    Returns
    -------
    MaterialSnapshot
        Validated MaterialSnapshot contract instance.
    """
    p = Path(path)
    content = p.read_text(encoding="utf-8")
    return MaterialSnapshot.model_validate_json(content)


def material_snapshot_to_ansys_db(snapshot: MaterialSnapshot) -> dict[str, dict[str, float]]:
    """Convert every M0 material record into the exact property-key format expected

    by geometry_builder.py and geometry_builder_multiroom.py.

    Parameters
    ----------
    snapshot : MaterialSnapshot
        Validated MaterialSnapshot contract instance.

    Returns
    -------
    dict[str, dict[str, float]]
        Dictionary mapping M0 material ID (e.g., 'mat_puf') to property dict:
        {
            "thermal_conductivity": float,  # W/(m·K)
            "density": float,               # kg/m³
            "specific_heat": float,         # J/(kg·K)
        }
    """
    db: dict[str, dict[str, float]] = {}
    for mat_id, record in snapshot.materials.items():
        db[mat_id] = {
            "thermal_conductivity": record.properties.thermal_conductivity_w_mk,
            "density": record.properties.density_kg_m3,
            "specific_heat": record.properties.specific_heat_j_kgk,
        }
    return db


def validate_building_material_references(
    building: BuildingModel,
    snapshot: MaterialSnapshot,
) -> None:
    """Inspect every layer in every BuildingModel assembly and raise a clear ValueError

    listing any material IDs missing from the MaterialSnapshot.

    Parameters
    ----------
    building : BuildingModel
        Validated BuildingModel contract instance.
    snapshot : MaterialSnapshot
        Validated MaterialSnapshot contract instance.

    Raises
    ------
    ValueError
        If one or more material IDs referenced in assemblies are missing from the snapshot.
    """
    missing_ids: set[str] = set()
    for assembly in building.assemblies.values():
        for layer in assembly.layers:
            if layer.material_id not in snapshot.materials:
                missing_ids.add(layer.material_id)

    if missing_ids:
        missing_sorted = sorted(missing_ids)
        raise ValueError(
            f"BuildingModel assemblies reference material ID(s) missing from MaterialSnapshot: {missing_sorted}"
        )
