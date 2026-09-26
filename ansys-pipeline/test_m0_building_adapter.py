"""
test_m0_building_adapter.py

Unit tests for m0_building_adapter.py.
Validates loading and conversion of M0 BuildingModel fixtures to ANSYS multi-room format.
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

from m0_building_adapter import building_model_to_rooms, load_building_model
from geometry_builder_multiroom import _detect_all_shared_faces


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


def test_airlock_living_fixture():
    """Verify loading and conversion of building_airlock_living.json.

    Checks:
    - Exactly two rooms produced
    - Airlock bounds: x=[0.0, 1.2], y=[0.0, 4.0], z=[0.0, 2.8]
    - Living bounds: x=[1.2, 6.0], y=[0.0, 4.0], z=[0.0, 2.8]
    - All room names unique
    - Name is zone.id (not zone.type)
    """
    path = _fixture_path("building_airlock_living.json")
    model = load_building_model(path)
    rooms = building_model_to_rooms(model)

    # Confirm exactly two rooms are produced
    assert len(rooms) == 2, f"Expected exactly 2 rooms, got {len(rooms)}"

    # Index rooms by name (which must be zone.id)
    rooms_by_name = {r["name"]: r for r in rooms}

    # Confirm all generated room names are unique
    assert len(rooms_by_name) == len(rooms), "Room names must be unique"
    assert "airlock" in rooms_by_name
    assert "living" in rooms_by_name

    # Confirm airlock bounds
    airlock = rooms_by_name["airlock"]
    assert airlock["bounds"]["x_min"] == pytest.approx(0.0)
    assert airlock["bounds"]["x_max"] == pytest.approx(1.2)
    assert airlock["bounds"]["y_min"] == pytest.approx(0.0)
    assert airlock["bounds"]["y_max"] == pytest.approx(4.0)
    assert airlock["bounds"]["z_min"] == pytest.approx(0.0)
    assert airlock["bounds"]["z_max"] == pytest.approx(2.8)

    # Confirm living bounds
    living = rooms_by_name["living"]
    assert living["bounds"]["x_min"] == pytest.approx(1.2)
    assert living["bounds"]["x_max"] == pytest.approx(6.0)
    assert living["bounds"]["y_min"] == pytest.approx(0.0)
    assert living["bounds"]["y_max"] == pytest.approx(4.0)
    assert living["bounds"]["z_min"] == pytest.approx(0.0)
    assert living["bounds"]["z_max"] == pytest.approx(2.8)

    # Verify metadata fields are preserved
    assert airlock["zone_id"] == "airlock"
    assert airlock["zone_type"] == "airlock"
    assert airlock["floor_id"] == "floor_0"
    assert living["zone_id"] == "living"
    assert living["zone_type"] == "living"
    assert living["floor_id"] == "floor_0"


def test_two_floor_compact_fixture():
    """Verify loading and conversion of building_two_floor_compact.json.

    Checks:
    - Upper-floor zone keeps global Z bounds from 2.8 to 5.6
    - All generated room names are unique
    - Correct floor mapping across multiple floors
    """
    path = _fixture_path("building_two_floor_compact.json")
    model = load_building_model(path)
    rooms = building_model_to_rooms(model)

    # Confirm all generated room names are unique
    room_names = [r["name"] for r in rooms]
    assert len(room_names) == len(set(room_names)), "All generated room names must be unique"

    # Confirm 3 rooms across the two floors
    assert len(rooms) == 3, f"Expected 3 rooms across two floors, got {len(rooms)}"

    # Locate the upper-floor zone (floor_1)
    upper_rooms = [r for r in rooms if r["floor_id"] == "floor_1"]
    assert len(upper_rooms) == 1, f"Expected 1 zone on floor_1, found {len(upper_rooms)}"

    upper_zone = upper_rooms[0]
    assert upper_zone["name"] == "sleeping_f1"
    assert upper_zone["bounds"]["z_min"] == pytest.approx(2.8)
    assert upper_zone["bounds"]["z_max"] == pytest.approx(5.6)
    assert upper_zone["bounds"]["x_min"] == pytest.approx(1.2)
    assert upper_zone["bounds"]["x_max"] == pytest.approx(6.0)
    assert upper_zone["bounds"]["y_min"] == pytest.approx(0.0)
    assert upper_zone["bounds"]["y_max"] == pytest.approx(4.0)


def test_geometry_builder_multiroom_integration():
    """Verify adapter output is directly consumable by geometry_builder_multiroom partition detection."""
    path = _fixture_path("building_airlock_living.json")
    model = load_building_model(path)
    rooms = building_model_to_rooms(model)

    shared = _detect_all_shared_faces(rooms, partition_thickness=0.10)
    assert len(shared) == 1, f"Expected 1 shared face between airlock and living, found {len(shared)}"
    sf = shared[0]
    assert {sf["room_a"], sf["room_b"]} == {"airlock", "living"}
    assert sf["face"]["axis"] == "x"
    assert sf["face"]["coord"] == pytest.approx(1.2)
