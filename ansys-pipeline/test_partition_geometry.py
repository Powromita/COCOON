"""
test_partition_geometry.py

Comprehensive unit tests for partition_geometry.py.
Validates pure-Python geometry planning for multi-room partitions, exact coordinate
calculations on official M0 fixtures, non-overlap, zero-gap interfaces, volume conservation,
axis independence (X, Y, Z), and error handling for invalid or partial geometries.
Does NOT import or launch ANSYS.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from m0_assembly_adapter import building_model_to_ansys_assemblies
from m0_building_adapter import building_model_to_rooms, load_building_model
from partition_geometry import (
    UnsupportedPartitionGeometryError,
    plan_partition_geometry,
)


def _fixture_path(filename: str) -> Path:
    """Resolve fixture file path across different execution working directories."""
    candidates = [
        _HERE.parent / "packages" / "contracts" / "fixtures" / "valid" / filename,
        Path("..") / "packages" / "contracts" / "fixtures" / "valid" / filename,
        Path("packages") / "contracts" / "fixtures" / "valid" / filename,
    ]
    for c in candidates:
        if c.is_file():
            return c
    raise FileNotFoundError(f"Fixture file not found: {filename}")


def _box_volume(b: dict[str, float]) -> float:
    """Calculate the 3D volume of an axis-aligned bounding box."""
    return (
        (float(b["x_max"]) - float(b["x_min"]))
        * (float(b["y_max"]) - float(b["y_min"]))
        * (float(b["z_max"]) - float(b["z_min"]))
    )


def _check_overlap(b1: dict[str, float], b2: dict[str, float], tol: float = 1e-6) -> bool:
    """Return True if two boxes overlap volumetrically (positive overlap on all 3 axes)."""
    x_ol = min(float(b1["x_max"]), float(b2["x_max"])) - max(float(b1["x_min"]), float(b2["x_min"]))
    y_ol = min(float(b1["y_max"]), float(b2["y_max"])) - max(float(b1["y_min"]), float(b2["y_min"]))
    z_ol = min(float(b1["z_max"]), float(b2["z_max"])) - max(float(b1["z_min"]), float(b2["z_min"]))
    return (x_ol > tol and y_ol > tol and z_ol > tol)


# ============================================================================
# OFFICIAL AIRLOCK-LIVING FIXTURE TESTS
# ============================================================================

def test_official_airlock_living_exact_coordinates():
    """Verify exact calculated coordinates for the official M0 airlock–living fixture.

    Asserts:
    Airlock air: x=[0.000, 1.163], y=[0, 4], z=[0, 2.8]
    Layer 0 (plywood): x=[1.163, 1.175]
    Layer 1 (PUF):     x=[1.175, 1.225]
    Layer 2 (plywood): x=[1.225, 1.237]
    Living air:  x=[1.237, 6.000], y=[0, 4], z=[0, 2.8]
    """
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)
    partition_spec = assemblies["partition"]

    result = plan_partition_geometry(rooms, partition_spec)

    air_rooms = {r["name"]: r for r in result["air_rooms"]}
    blocks = result["partition_blocks"]

    # 1. Airlock air volume
    assert "airlock" in air_rooms
    b_airlock = air_rooms["airlock"]["bounds"]
    assert b_airlock["x_min"] == pytest.approx(0.000)
    assert b_airlock["x_max"] == pytest.approx(1.163)
    assert b_airlock["y_min"] == pytest.approx(0.000)
    assert b_airlock["y_max"] == pytest.approx(4.000)
    assert b_airlock["z_min"] == pytest.approx(0.000)
    assert b_airlock["z_max"] == pytest.approx(2.800)

    # 2. Living room air volume
    assert "living" in air_rooms
    b_living = air_rooms["living"]["bounds"]
    assert b_living["x_min"] == pytest.approx(1.237)
    assert b_living["x_max"] == pytest.approx(6.000)
    assert b_living["y_min"] == pytest.approx(0.000)
    assert b_living["y_max"] == pytest.approx(4.000)
    assert b_living["z_min"] == pytest.approx(0.000)
    assert b_living["z_max"] == pytest.approx(2.800)

    # 3. Partition layers
    assert len(blocks) == 3

    # Layer 0: 12 mm plywood
    blk0 = blocks[0]
    assert blk0["layer_index"] == 0
    assert blk0["material"] == "mat_plywood"
    assert blk0["thickness_m"] == pytest.approx(0.012)
    assert blk0["bounds"]["x_min"] == pytest.approx(1.163)
    assert blk0["bounds"]["x_max"] == pytest.approx(1.175)
    assert blk0["bounds"]["y_min"] == pytest.approx(0.000)
    assert blk0["bounds"]["y_max"] == pytest.approx(4.000)
    assert blk0["bounds"]["z_min"] == pytest.approx(0.000)
    assert blk0["bounds"]["z_max"] == pytest.approx(2.800)
    assert blk0["owning_zone_id"] == "airlock"
    assert blk0["adjacent_zone_id"] == "living"
    assert blk0["surface_id"] == "surf_partition_airlock_living"
    assert blk0["assembly_id"] == "asm_partition_timber"

    # Layer 1: 50 mm PUF
    blk1 = blocks[1]
    assert blk1["layer_index"] == 1
    assert blk1["material"] == "mat_puf"
    assert blk1["thickness_m"] == pytest.approx(0.050)
    assert blk1["bounds"]["x_min"] == pytest.approx(1.175)
    assert blk1["bounds"]["x_max"] == pytest.approx(1.225)
    assert blk1["bounds"]["y_min"] == pytest.approx(0.000)
    assert blk1["bounds"]["y_max"] == pytest.approx(4.000)
    assert blk1["bounds"]["z_min"] == pytest.approx(0.000)
    assert blk1["bounds"]["z_max"] == pytest.approx(2.800)

    # Layer 2: 12 mm plywood
    blk2 = blocks[2]
    assert blk2["layer_index"] == 2
    assert blk2["material"] == "mat_plywood"
    assert blk2["thickness_m"] == pytest.approx(0.012)
    assert blk2["bounds"]["x_min"] == pytest.approx(1.225)
    assert blk2["bounds"]["x_max"] == pytest.approx(1.237)
    assert blk2["bounds"]["y_min"] == pytest.approx(0.000)
    assert blk2["bounds"]["y_max"] == pytest.approx(4.000)
    assert blk2["bounds"]["z_min"] == pytest.approx(0.000)
    assert blk2["bounds"]["z_max"] == pytest.approx(2.800)


def test_zero_gap_at_all_air_and_layer_interfaces():
    """Verify zero gap across all consecutive interfaces along the normal axis."""
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)

    result = plan_partition_geometry(rooms, assemblies["partition"])
    air_rooms = {r["name"]: r for r in result["air_rooms"]}
    blocks = result["partition_blocks"]

    # airlock.max == layer0.min
    assert air_rooms["airlock"]["bounds"]["x_max"] == pytest.approx(blocks[0]["bounds"]["x_min"])
    # layer0.max == layer1.min
    assert blocks[0]["bounds"]["x_max"] == pytest.approx(blocks[1]["bounds"]["x_min"])
    # layer1.max == layer2.min
    assert blocks[1]["bounds"]["x_max"] == pytest.approx(blocks[2]["bounds"]["x_min"])
    # layer2.max == living.min
    assert blocks[2]["bounds"]["x_max"] == pytest.approx(air_rooms["living"]["bounds"]["x_min"])


def test_zero_volumetric_overlap_across_all_elements():
    """Verify that every pair of planned elements (air rooms + partition blocks) has zero volumetric overlap."""
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)

    result = plan_partition_geometry(rooms, assemblies["partition"])

    all_boxes = [r["bounds"] for r in result["air_rooms"]] + [
        b["bounds"] for b in result["partition_blocks"]
    ]

    for i in range(len(all_boxes)):
        for j in range(i + 1, len(all_boxes)):
            assert not _check_overlap(all_boxes[i], all_boxes[j]), (
                f"Volumetric overlap detected between element {i} and element {j}: "
                f"{all_boxes[i]} vs {all_boxes[j]}"
            )


def test_total_volume_conservation():
    """Verify that the sum of planned air and partition block volumes exactly equals original air volume."""
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)

    orig_total_vol = sum(_box_volume(r["bounds"]) for r in rooms)
    # Original: (1.2 * 4.0 * 2.8) + (4.8 * 4.0 * 2.8) = 13.44 + 53.76 = 67.20 m3
    assert orig_total_vol == pytest.approx(67.200)

    result = plan_partition_geometry(rooms, assemblies["partition"])

    air_vol = sum(_box_volume(r["bounds"]) for r in result["air_rooms"])
    part_vol = sum(_box_volume(b["bounds"]) for b in result["partition_blocks"])
    total_planned_vol = air_vol + part_vol

    # Planned: Airlock (1.163*4*2.8 = 13.0256) + Living (4.763*4*2.8 = 53.3456) + Partition (0.074*4*2.8 = 0.8288) = 67.200 m3
    assert air_vol == pytest.approx(66.3712)
    assert part_vol == pytest.approx(0.8288)
    assert total_planned_vol == pytest.approx(orig_total_vol)


def test_input_dictionaries_are_not_mutated():
    """Verify that plan_partition_geometry does not modify input rooms or partition_spec."""
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)
    partition_spec = assemblies["partition"]

    rooms_snapshot = copy.deepcopy(rooms)
    spec_snapshot = copy.deepcopy(partition_spec)

    plan_partition_geometry(rooms, partition_spec)

    assert rooms == rooms_snapshot
    assert partition_spec == spec_snapshot


def test_no_partition_single_room_behaviour():
    """Verify behaviour when partition_spec is None or interfaces list is empty."""
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)

    # 1. partition_spec is None
    res_none = plan_partition_geometry(rooms, None)
    assert res_none["partition_blocks"] == []
    assert len(res_none["air_rooms"]) == len(rooms)
    for orig, planned in zip(rooms, res_none["air_rooms"]):
        assert orig["bounds"] == planned["bounds"]
        assert orig is not planned  # must be deep copy

    # 2. partition_spec with empty interfaces
    empty_spec = {
        "assembly_id": "asm_none",
        "total_thickness_m": 0.05,
        "layers_inner_to_outer": [{"thickness_mm": 50.0, "material": "mat_puf"}],
        "interfaces": [],
    }
    res_empty = plan_partition_geometry(rooms, empty_spec)
    assert res_empty["partition_blocks"] == []
    assert len(res_empty["air_rooms"]) == len(rooms)


def test_reversed_input_room_list_order():
    """Verify that plan_partition_geometry produces identical output regardless of room order."""
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)
    partition_spec = assemblies["partition"]

    # Reverse input rooms: [living, airlock]
    reversed_rooms = list(reversed(rooms))

    result_forward = plan_partition_geometry(rooms, partition_spec)
    result_reversed = plan_partition_geometry(reversed_rooms, partition_spec)

    fwd_air = {r["name"]: r["bounds"] for r in result_forward["air_rooms"]}
    rev_air = {r["name"]: r["bounds"] for r in result_reversed["air_rooms"]}
    assert fwd_air == rev_air

    assert len(result_forward["partition_blocks"]) == len(result_reversed["partition_blocks"])
    for b_fwd, b_rev in zip(result_forward["partition_blocks"], result_reversed["partition_blocks"]):
        assert b_fwd["bounds"] == b_rev["bounds"]
        assert b_fwd["layer_index"] == b_rev["layer_index"]
        assert b_fwd["material"] == b_rev["material"]


def test_owning_room_on_positive_side_handles_coordinate_direction():
    """Verify that when the owning room is on the positive side, layers are sequenced correctly.

    Layer 0 must always touch the owning room, even when growing in the -axis direction.
    """
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)

    # Asymmetric partition specification to distinguish inner vs outer facings:
    # Layer 0: 10 mm Gypsum (closest to owning zone)
    # Layer 1: 50 mm PUF (middle core)
    # Layer 2: 20 mm Timber (closest to adjacent zone)
    # Total = 80 mm (0.080 m), half = 0.040 m
    asymmetric_spec = {
        "assembly_id": "asm_asym",
        "total_thickness_m": 0.080,
        "layers_inner_to_outer": [
            {"thickness_mm": 10.0, "material": "mat_gypsum"},
            {"thickness_mm": 50.0, "material": "mat_puf"},
            {"thickness_mm": 20.0, "material": "mat_timber"},
        ],
        "interfaces": [
            {
                "surface_id": "surf_partition_living_airlock",
                "owning_zone_id": "living",   # Living is on POSITIVE side (x: [1.2, 6.0])
                "adjacent_zone_id": "airlock", # Airlock is on NEGATIVE side (x: [0.0, 1.2])
            }
        ],
    }

    result = plan_partition_geometry(rooms, asymmetric_spec)
    air_rooms = {r["name"]: r for r in result["air_rooms"]}
    blocks = result["partition_blocks"]

    # Shortened bounds with half_thickness = 0.040:
    # Airlock: [0.000, 1.160]
    # Living:  [1.240, 6.000]
    assert air_rooms["airlock"]["bounds"]["x_max"] == pytest.approx(1.160)
    assert air_rooms["living"]["bounds"]["x_min"] == pytest.approx(1.240)

    assert len(blocks) == 3

    # Layer 0 (mat_gypsum, 10 mm) MUST touch the owning zone (Living at x=1.240)
    # Extends from 1.240 - 0.010 = 1.230 to 1.240
    assert blocks[0]["layer_index"] == 0
    assert blocks[0]["material"] == "mat_gypsum"
    assert blocks[0]["bounds"]["x_min"] == pytest.approx(1.230)
    assert blocks[0]["bounds"]["x_max"] == pytest.approx(1.240)

    # Layer 1 (mat_puf, 50 mm): extends from 1.230 - 0.050 = 1.180 to 1.230
    assert blocks[1]["layer_index"] == 1
    assert blocks[1]["material"] == "mat_puf"
    assert blocks[1]["bounds"]["x_min"] == pytest.approx(1.180)
    assert blocks[1]["bounds"]["x_max"] == pytest.approx(1.230)

    # Layer 2 (mat_timber, 20 mm): extends from 1.180 - 0.020 = 1.160 to 1.180
    # Touches adjacent zone (Airlock at x=1.160)
    assert blocks[2]["layer_index"] == 2
    assert blocks[2]["material"] == "mat_timber"
    assert blocks[2]["bounds"]["x_min"] == pytest.approx(1.160)
    assert blocks[2]["bounds"]["x_max"] == pytest.approx(1.180)


# ============================================================================
# AXIS INDEPENDENCE (X, Y, Z) TESTS
# ============================================================================

def test_interfaces_along_y_axis():
    """Verify partition geometry planning across a shared Y-axis face."""
    rooms_y = [
        {
            "name": "south_room",
            "zone_id": "south_room",
            "bounds": {"x_min": 0.0, "x_max": 5.0, "y_min": 0.0, "y_max": 3.0, "z_min": 0.0, "z_max": 2.5},
        },
        {
            "name": "north_room",
            "zone_id": "north_room",
            "bounds": {"x_min": 0.0, "x_max": 5.0, "y_min": 3.0, "y_max": 7.0, "z_min": 0.0, "z_max": 2.5},
        },
    ]
    spec_y = {
        "assembly_id": "asm_y_part",
        "total_thickness_m": 0.100,
        "layers_inner_to_outer": [
            {"thickness_mm": 20.0, "material": "mat_board"},
            {"thickness_mm": 60.0, "material": "mat_insul"},
            {"thickness_mm": 20.0, "material": "mat_board"},
        ],
        "interfaces": [
            {"surface_id": "surf_y", "owning_zone_id": "south_room", "adjacent_zone_id": "north_room"}
        ],
    }

    res = plan_partition_geometry(rooms_y, spec_y)
    air = {r["name"]: r["bounds"] for r in res["air_rooms"]}
    blocks = res["partition_blocks"]

    # Shared Y coord is 3.0, half_thickness is 0.05
    assert air["south_room"]["y_max"] == pytest.approx(2.950)
    assert air["north_room"]["y_min"] == pytest.approx(3.050)

    assert blocks[0]["bounds"]["y_min"] == pytest.approx(2.950)
    assert blocks[0]["bounds"]["y_max"] == pytest.approx(2.970)
    assert blocks[1]["bounds"]["y_min"] == pytest.approx(2.970)
    assert blocks[1]["bounds"]["y_max"] == pytest.approx(3.030)
    assert blocks[2]["bounds"]["y_min"] == pytest.approx(3.030)
    assert blocks[2]["bounds"]["y_max"] == pytest.approx(3.050)

    # Transverse axes (X and Z) preserved
    for b in blocks:
        assert b["bounds"]["x_min"] == pytest.approx(0.0)
        assert b["bounds"]["x_max"] == pytest.approx(5.0)
        assert b["bounds"]["z_min"] == pytest.approx(0.0)
        assert b["bounds"]["z_max"] == pytest.approx(2.5)


def test_interfaces_along_z_axis():
    """Verify partition geometry planning across a shared horizontal Z-axis floor/ceiling."""
    rooms_z = [
        {
            "name": "ground_floor",
            "zone_id": "ground_floor",
            "bounds": {"x_min": 0.0, "x_max": 4.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
        {
            "name": "upper_floor",
            "zone_id": "upper_floor",
            "bounds": {"x_min": 0.0, "x_max": 4.0, "y_min": 0.0, "y_max": 4.0, "z_min": 2.8, "z_max": 5.6},
        },
    ]
    spec_z = {
        "assembly_id": "asm_floor_part",
        "total_thickness_m": 0.200,
        "layers_inner_to_outer": [
            {"thickness_mm": 100.0, "material": "mat_concrete"},
            {"thickness_mm": 100.0, "material": "mat_screed"},
        ],
        "interfaces": [
            {"surface_id": "surf_interfloor", "owning_zone_id": "ground_floor", "adjacent_zone_id": "upper_floor"}
        ],
    }

    res = plan_partition_geometry(rooms_z, spec_z)
    air = {r["name"]: r["bounds"] for r in res["air_rooms"]}
    blocks = res["partition_blocks"]

    # Shared Z coord is 2.8, half_thickness is 0.10
    assert air["ground_floor"]["z_max"] == pytest.approx(2.700)
    assert air["upper_floor"]["z_min"] == pytest.approx(2.900)

    assert blocks[0]["bounds"]["z_min"] == pytest.approx(2.700)
    assert blocks[0]["bounds"]["z_max"] == pytest.approx(2.800)
    assert blocks[1]["bounds"]["z_min"] == pytest.approx(2.800)
    assert blocks[1]["bounds"]["z_max"] == pytest.approx(2.900)


# ============================================================================
# REJECTION & VALIDATION TESTS
# ============================================================================

def test_rejection_partial_face_contact():
    """Verify rejection when the touching face covers only part of either room's transverse face."""
    rooms = [
        {
            "name": "room_a",
            "zone_id": "room_a",
            "bounds": {"x_min": 0.0, "x_max": 3.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
        {
            "name": "room_b",
            "zone_id": "room_b",
            # y_max is 3.0, so it only covers part of room_a's y=[0, 4] face
            "bounds": {"x_min": 3.0, "x_max": 6.0, "y_min": 0.0, "y_max": 3.0, "z_min": 0.0, "z_max": 2.8},
        },
    ]
    spec = {
        "assembly_id": "asm_part",
        "total_thickness_m": 0.10,
        "layers_inner_to_outer": [{"thickness_mm": 100.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }

    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(rooms, spec)
    assert "partial-face" in str(exc_info.value).lower()


def test_rejection_non_touching_rooms():
    """Verify rejection when rooms specified in an interface have a gap between them."""
    rooms = [
        {
            "name": "room_a",
            "zone_id": "room_a",
            "bounds": {"x_min": 0.0, "x_max": 2.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
        {
            "name": "room_b",
            "zone_id": "room_b",
            # Gap between x=2.0 and x=2.5
            "bounds": {"x_min": 2.5, "x_max": 5.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
    ]
    spec = {
        "assembly_id": "asm_part",
        "total_thickness_m": 0.10,
        "layers_inner_to_outer": [{"thickness_mm": 100.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }

    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(rooms, spec)
    assert "do not touch" in str(exc_info.value).lower()


def test_rejection_pre_overlapping_rooms():
    """Verify rejection when rooms specified in an interface have a volumetric overlap prior to partition."""
    rooms = [
        {
            "name": "room_a",
            "zone_id": "room_a",
            "bounds": {"x_min": 0.0, "x_max": 3.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
        {
            "name": "room_b",
            "zone_id": "room_b",
            # Penetrates room_a along x in [2.5, 3.0]
            "bounds": {"x_min": 2.5, "x_max": 6.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
    ]
    spec = {
        "assembly_id": "asm_part",
        "total_thickness_m": 0.10,
        "layers_inner_to_outer": [{"thickness_mm": 100.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }

    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(rooms, spec)
    assert "volumetric overlap" in str(exc_info.value).lower()


def test_rejection_invalid_thicknesses():
    """Verify rejection when partition thickness is zero, negative, mismatched, or too large for room."""
    base_rooms = [
        {
            "name": "room_a",
            "zone_id": "room_a",
            "bounds": {"x_min": 0.0, "x_max": 1.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
        {
            "name": "room_b",
            "zone_id": "room_b",
            "bounds": {"x_min": 1.0, "x_max": 4.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
    ]

    # 1. Zero total thickness
    spec_zero = {
        "assembly_id": "asm_part",
        "total_thickness_m": 0.0,
        "layers_inner_to_outer": [{"thickness_mm": 0.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }
    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(base_rooms, spec_zero)
    assert "positive" in str(exc_info.value).lower()

    # 2. Negative layer thickness
    spec_neg = {
        "assembly_id": "asm_part",
        "total_thickness_m": 0.05,
        "layers_inner_to_outer": [{"thickness_mm": -50.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }
    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(base_rooms, spec_neg)
    assert "non-positive" in str(exc_info.value).lower()

    # 3. Layer sum does not match total thickness
    spec_mismatch = {
        "assembly_id": "asm_part",
        "total_thickness_m": 0.100,
        "layers_inner_to_outer": [{"thickness_mm": 50.0, "material": "mat_puf"}],  # 50 mm != 100 mm
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }
    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(base_rooms, spec_mismatch)
    assert "does not match" in str(exc_info.value).lower()

    # 4. Partition half-thickness exceeds room dimension (room_a length is 1.0 m, half-thickness is 1.2 m)
    spec_huge = {
        "assembly_id": "asm_part",
        "total_thickness_m": 2.400,
        "layers_inner_to_outer": [{"thickness_mm": 2400.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }
    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(base_rooms, spec_huge)
    assert "removes complete dimension" in str(exc_info.value).lower()


def test_rejection_unknown_interface_zones():
    """Verify rejection when an interface references zone IDs not in rooms."""
    rooms = [
        {
            "name": "room_a",
            "zone_id": "room_a",
            "bounds": {"x_min": 0.0, "x_max": 2.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
    ]
    spec = {
        "assembly_id": "asm_part",
        "total_thickness_m": 0.10,
        "layers_inner_to_outer": [{"thickness_mm": 100.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "ghost_zone"}],
    }
    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        plan_partition_geometry(rooms, spec)
    assert "ghost_zone" in str(exc_info.value)
