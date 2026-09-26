"""
m0_building_adapter.py

Adapter converting the official M0 BuildingModel into the rooms format
expected by geometry_builder_multiroom.py.
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


def load_building_model(path: str | Path) -> BuildingModel:
    """Read a JSON file and validate it using BuildingModel.model_validate_json.

    Parameters
    ----------
    path : str | Path
        Path to the JSON file containing the serialized BuildingModel.

    Returns
    -------
    BuildingModel
        Validated BuildingModel contract instance.
    """
    p = Path(path)
    content = p.read_text(encoding="utf-8")
    return BuildingModel.model_validate_json(content)


def building_model_to_rooms(model: BuildingModel) -> list[dict[str, Any]]:
    """Convert a BuildingModel into the rooms format expected by geometry_builder_multiroom.

    Iterates through all floors and zones, using zone.id as the unique room name
    and zone.origin_m as the authoritative global coordinate origin.

    Parameters
    ----------
    model : BuildingModel
        The validated BuildingModel instance.

    Returns
    -------
    list[dict[str, Any]]
        List of room dictionaries containing 'name', 'zone_id', 'zone_type',
        'floor_id', and 'bounds' (with 'x_min', 'x_max', 'y_min', 'y_max',
        'z_min', 'z_max').
    """
    rooms: list[dict[str, Any]] = []
    for floor in model.floors:
        for zone in floor.zones:
            rooms.append({
                "name": zone.id,
                "zone_id": zone.id,
                "zone_type": zone.type,
                "floor_id": floor.id,
                "bounds": {
                    "x_min": zone.origin_m.x,
                    "x_max": zone.origin_m.x + zone.size_m.length_m,
                    "y_min": zone.origin_m.y,
                    "y_max": zone.origin_m.y + zone.size_m.width_m,
                    "z_min": zone.origin_m.z,
                    "z_max": zone.origin_m.z + zone.size_m.height_m,
                },
            })
    return rooms
