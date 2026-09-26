"""
test_m0_material_adapter.py

Unit tests for m0_material_adapter.py.
Validates loading, conversion to ANSYS property dictionary, and cross-reference
validation between M0 BuildingModel assemblies and MaterialSnapshot.
Does NOT launch ANSYS.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure local directory is on sys.path
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from m0_building_adapter import load_building_model
from m0_material_adapter import (
    load_material_snapshot,
    material_snapshot_to_ansys_db,
    validate_building_material_references,
)


def _fixture_path(filename: str) -> Path:
    """Resolve fixture file path across different working directories."""
    candidates = [
        _HERE.parent / "packages" / "contracts" / "fixtures" / "valid" / filename,
        Path("..") / "packages" / "contracts" / "fixtures" / "valid" / filename,
        Path("packages") / "contracts" / "fixtures" / "valid" / filename,
    ]
    for c in candidates:
        if c.is_file():
            return c
    raise FileNotFoundError(f"Fixture file not found: {filename}")


def test_load_and_convert_material_snapshot():
    """Verify loading and conversion of material_snapshot_standard.json.

    Checks:
    - Exactly four materials converted
    - Exact conductivity, density, and specific heat for mat_puf
    - Keys use M0 material IDs (mat_puf, mat_stone, mat_plywood, mat_concrete)
    - Converted properties match M0 snapshot values
    """
    path = _fixture_path("material_snapshot_standard.json")
    snapshot = load_material_snapshot(path)

    ansys_db = material_snapshot_to_ansys_db(snapshot)

    # Confirm exactly four materials are converted
    assert len(ansys_db) == 4, f"Expected 4 materials, got {len(ansys_db)}"

    # Confirm exact M0 IDs are used as dictionary keys
    expected_material_ids = {"mat_stone", "mat_puf", "mat_plywood", "mat_concrete"}
    assert set(ansys_db.keys()) == expected_material_ids

    # Confirm exact conductivity, density, and specific heat for mat_puf
    puf_props = ansys_db["mat_puf"]
    assert puf_props["thermal_conductivity"] == pytest.approx(0.024)
    assert puf_props["density"] == pytest.approx(35.0)
    assert puf_props["specific_heat"] == pytest.approx(1500.0)

    # Confirm properties for remaining materials
    stone_props = ansys_db["mat_stone"]
    assert stone_props["thermal_conductivity"] == pytest.approx(2.0)
    assert stone_props["density"] == pytest.approx(2300.0)
    assert stone_props["specific_heat"] == pytest.approx(880.0)

    plywood_props = ansys_db["mat_plywood"]
    assert plywood_props["thermal_conductivity"] == pytest.approx(0.13)
    assert plywood_props["density"] == pytest.approx(650.0)
    assert plywood_props["specific_heat"] == pytest.approx(1600.0)

    concrete_props = ansys_db["mat_concrete"]
    assert concrete_props["thermal_conductivity"] == pytest.approx(1.4)
    assert concrete_props["density"] == pytest.approx(2400.0)
    assert concrete_props["specific_heat"] == pytest.approx(1000.0)


def test_validate_building_material_references_valid():
    """Verify that building_airlock_living.json materials match standard snapshot.

    Checks:
    - All assembly material references (mat_puf, mat_stone, mat_plywood, mat_concrete)
      are present in material_snapshot_standard.json
    - validate_building_material_references completes without error
    """
    building_path = _fixture_path("building_airlock_living.json")
    snapshot_path = _fixture_path("material_snapshot_standard.json")

    building = load_building_model(building_path)
    snapshot = load_material_snapshot(snapshot_path)

    # Should succeed without raising any exception
    validate_building_material_references(building, snapshot)


def test_validate_building_material_references_missing_material_in_snapshot():
    """Verify that a modified snapshot with a missing material raises a clear ValueError.

    Checks:
    - Removing 'mat_puf' raises ValueError mentioning 'mat_puf'
    - Removing multiple materials lists all missing IDs
    """
    building_path = _fixture_path("building_airlock_living.json")
    snapshot_path = _fixture_path("material_snapshot_standard.json")

    building = load_building_model(building_path)
    snapshot = load_material_snapshot(snapshot_path)

    # Create modified snapshot with mat_puf omitted
    materials_without_puf = {k: v for k, v in snapshot.materials.items() if k != "mat_puf"}
    snapshot_missing_puf = snapshot.model_copy(update={"materials": materials_without_puf})

    with pytest.raises(ValueError) as exc_info:
        validate_building_material_references(building, snapshot_missing_puf)
    assert "mat_puf" in str(exc_info.value)

    # Create modified snapshot with both mat_puf and mat_stone omitted
    materials_without_puf_stone = {
        k: v for k, v in snapshot.materials.items() if k not in ("mat_puf", "mat_stone")
    }
    snapshot_missing_two = snapshot.model_copy(update={"materials": materials_without_puf_stone})

    with pytest.raises(ValueError) as exc_info_two:
        validate_building_material_references(building, snapshot_missing_two)
    error_msg = str(exc_info_two.value)
    assert "mat_puf" in error_msg
    assert "mat_stone" in error_msg


def test_validate_building_material_references_unknown_material_in_model():
    """Verify that a modified BuildingModel referencing an unknown material raises a clear ValueError."""
    building_path = _fixture_path("building_airlock_living.json")
    snapshot_path = _fixture_path("material_snapshot_standard.json")

    building = load_building_model(building_path)
    snapshot = load_material_snapshot(snapshot_path)

    # Modify an assembly in the building to reference an unknown material ID
    modified_assemblies = dict(building.assemblies)
    wall_asm = modified_assemblies["asm_wall_insulated"].model_copy(deep=True)
    # Change first layer's material_id to an unknown ID
    wall_asm.layers[0] = wall_asm.layers[0].model_copy(update={"material_id": "mat_aerogel_nonexistent"})
    modified_assemblies["asm_wall_insulated"] = wall_asm

    modified_building = building.model_copy(update={"assemblies": modified_assemblies})

    with pytest.raises(ValueError) as exc_info:
        validate_building_material_references(modified_building, snapshot)
    assert "mat_aerogel_nonexistent" in str(exc_info.value)
