"""
test_geometry_builder_multiroom.py

Unit tests for geometry_builder_multiroom.py using a mocked PyMAPDL session.
Validates:
- air BLOCK coordinates use shortened planner bounds,
- three partition layer BLOCKs are created with exact coordinates, materials, and order,
- the old overlapping partition block is NOT created,
- original room bounds are preserved for exterior walls, roof, floor, and global faces,
- single-room / no-partition behavior produces normal air volume with zero partition blocks,
- partition_spec can be passed as argument or inside config['partition'],
- partial partition faces raise UnsupportedPartitionGeometryError.
Does NOT require an active ANSYS licence or PyMAPDL session.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any

import pytest

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from geometry_builder_multiroom import (
    build_shelter_multiroom,
    UnsupportedPartitionGeometryError,
)
from m0_assembly_adapter import building_model_to_ansys_assemblies
from m0_building_adapter import building_model_to_rooms, load_building_model


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


class MockMapdl:
    """Mock PyMAPDL session capturing block creation, material assignment, and mesh calls."""

    def __init__(self):
        self.blocks: list[dict[str, float]] = []
        self.volu_mats: dict[int, int] = {}
        self.materials: dict[int, dict[str, float]] = {}
        self._current_volu: int | None = None
        self._next_volu: int = 1
        self.call_log: list[tuple[str, Any]] = []

    def et(self, *args):
        self.call_log.append(("et", args))

    def mp(self, prop: str, mat_num: int, val: float):
        if mat_num not in self.materials:
            self.materials[mat_num] = {}
        self.materials[mat_num][prop] = float(val)
        self.call_log.append(("mp", (prop, mat_num, val)))

    def block(self, x1: float, x2: float, y1: float, y2: float, z1: float, z2: float) -> int:
        v = self._next_volu
        self._next_volu += 1
        blk_dict = {
            "volu": v,
            "x_min": round(float(x1), 6),
            "x_max": round(float(x2), 6),
            "y_min": round(float(y1), 6),
            "y_max": round(float(y2), 6),
            "z_min": round(float(z1), 6),
            "z_max": round(float(z2), 6),
        }
        self.blocks.append(blk_dict)
        self._current_volu = v
        self.call_log.append(("block", blk_dict))
        return v

    def vsel(self, *args):
        self.call_log.append(("vsel", args))

    def vatt(self, mat_num: int):
        if self._current_volu is not None:
            self.volu_mats[self._current_volu] = int(mat_num)
        self.call_log.append(("vatt", (mat_num,)))

    def allsel(self):
        self.call_log.append(("allsel", ()))

    def esize(self, *args):
        self.call_log.append(("esize", args))

    def mshkey(self, *args):
        self.call_log.append(("mshkey", args))

    def mshape(self, *args):
        self.call_log.append(("mshape", args))

    def vmesh(self, *args):
        self.call_log.append(("vmesh", args))

    def nummrg(self, *args):
        self.call_log.append(("nummrg", args))

    def asel(self, *args):
        self.call_log.append(("asel", args))

    def asum(self):
        self.call_log.append(("asum", ()))

    def get_value(self, entity: str, num: int, item: str) -> float:
        if entity == "AREA":
            return 80.0
        return 0.0


# Standard test materials database
MATERIALS_DB = {
    "mat_stone": {
        "thermal_conductivity": 2.0,
        "density": 2300.0,
        "specific_heat": 880.0,
    },
    "mat_puf": {
        "thermal_conductivity": 0.04,
        "density": 30.0,
        "specific_heat": 1500.0,
    },
    "mat_plywood": {
        "thermal_conductivity": 0.3,
        "density": 600.0,
        "specific_heat": 1500.0,
    },
    "mat_concrete": {
        "thermal_conductivity": 1.5,
        "density": 2400.0,
        "specific_heat": 880.0,
    },
}


def _get_base_config() -> dict[str, Any]:
    return {
        "heat_transfer": {
            "h_inside_W_m2K": 5.0,
            "h_outside_W_m2K": 25.0,
        },
        "walls": [
            {"thickness_mm": 150.0, "material": "mat_stone"},
            {"thickness_mm": 50.0, "material": "mat_puf"},
        ],
        "roof": [
            {"thickness_mm": 80.0, "material": "mat_puf"},
            {"thickness_mm": 80.0, "material": "mat_plywood"},
        ],
        "floor": [
            {"thickness_mm": 50.0, "material": "mat_puf"},
            {"thickness_mm": 100.0, "material": "mat_concrete"},
        ],
    }


# ============================================================================
# TESTS
# ============================================================================

def test_builder_with_layered_partition_exact_coordinates():
    """Verify build_shelter_multiroom with M0 partition specification produces exact non-overlapping geometry."""
    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)

    config = _get_base_config()
    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=config,
        materials_db=MATERIALS_DB,
        rooms=rooms,
        partition_spec=assemblies["partition"],
    )

    # 1. Verify return dictionary structure
    assert "air_mats" in info
    assert "airlock" in info["air_mats"]
    assert "living" in info["air_mats"]
    assert "partition_mats" in info
    assert "partition_blocks" in info
    assert len(info["partition_blocks"]) == 3

    # 2. Verify air BLOCK coordinates (first 2 blocks created in mapdl)
    # Block 1: airlock air, Block 2: living air
    airlock_blk = mapdl.blocks[0]
    living_blk = mapdl.blocks[1]

    # Airlock air: x=[0.000, 1.163], y=[0, 4], z=[0, 2.8]
    assert airlock_blk["x_min"] == pytest.approx(0.000)
    assert airlock_blk["x_max"] == pytest.approx(1.163)
    assert airlock_blk["y_min"] == pytest.approx(0.000)
    assert airlock_blk["y_max"] == pytest.approx(4.000)
    assert airlock_blk["z_min"] == pytest.approx(0.000)
    assert airlock_blk["z_max"] == pytest.approx(2.800)
    assert mapdl.volu_mats[airlock_blk["volu"]] == info["air_mats"]["airlock"]

    # Living air: x=[1.237, 6.000], y=[0, 4], z=[0, 2.8]
    assert living_blk["x_min"] == pytest.approx(1.237)
    assert living_blk["x_max"] == pytest.approx(6.000)
    assert living_blk["y_min"] == pytest.approx(0.000)
    assert living_blk["y_max"] == pytest.approx(4.000)
    assert living_blk["z_min"] == pytest.approx(0.000)
    assert living_blk["z_max"] == pytest.approx(2.800)
    assert mapdl.volu_mats[living_blk["volu"]] == info["air_mats"]["living"]

    # 3. Verify partition layer BLOCKs (blocks 3, 4, 5 in mapdl)
    part_layer0 = mapdl.blocks[2]
    part_layer1 = mapdl.blocks[3]
    part_layer2 = mapdl.blocks[4]

    # Layer 0: 12 mm plywood (x: 1.163 to 1.175)
    assert part_layer0["x_min"] == pytest.approx(1.163)
    assert part_layer0["x_max"] == pytest.approx(1.175)
    assert part_layer0["y_min"] == pytest.approx(0.000)
    assert part_layer0["y_max"] == pytest.approx(4.000)
    assert part_layer0["z_min"] == pytest.approx(0.000)
    assert part_layer0["z_max"] == pytest.approx(2.800)
    mat_plywood_num = info["envelope_mats"]["mat_map"]["mat_plywood"]
    assert mapdl.volu_mats[part_layer0["volu"]] == mat_plywood_num

    # Layer 1: 50 mm PUF (x: 1.175 to 1.225)
    assert part_layer1["x_min"] == pytest.approx(1.175)
    assert part_layer1["x_max"] == pytest.approx(1.225)
    assert part_layer1["y_min"] == pytest.approx(0.000)
    assert part_layer1["y_max"] == pytest.approx(4.000)
    assert part_layer1["z_min"] == pytest.approx(0.000)
    assert part_layer1["z_max"] == pytest.approx(2.800)
    mat_puf_num = info["envelope_mats"]["mat_map"]["mat_puf"]
    assert mapdl.volu_mats[part_layer1["volu"]] == mat_puf_num

    # Layer 2: 12 mm plywood (x: 1.225 to 1.237)
    assert part_layer2["x_min"] == pytest.approx(1.225)
    assert part_layer2["x_max"] == pytest.approx(1.237)
    assert part_layer2["y_min"] == pytest.approx(0.000)
    assert part_layer2["y_max"] == pytest.approx(4.000)
    assert part_layer2["z_min"] == pytest.approx(0.000)
    assert part_layer2["z_max"] == pytest.approx(2.800)
    assert mapdl.volu_mats[part_layer2["volu"]] == mat_plywood_num

    # 4. Confirm old overlapping partition block was NEVER created
    # The old block was x=[1.15, 1.25]
    for blk in mapdl.blocks:
        assert not (
            abs(blk["x_min"] - 1.150) < 1e-4 and abs(blk["x_max"] - 1.250) < 1e-4
        ), "Found old overlapping partition block x=[1.15, 1.25]!"


def test_builder_exterior_geometry_preserves_original_room_bounds():
    """Verify that exterior envelope slabs (walls, roof, floor) continue to use original room bounds."""
    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)

    config = _get_base_config()
    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=config,
        materials_db=MATERIALS_DB,
        rooms=rooms,
        partition_spec=assemblies["partition"],
    )

    # Global face coordinates should use outer boundary of full building
    # Westmost room inner face is 0.0 -> global x_min is 0 - t_wall
    # Eastmost room inner face is 6.0 -> global x_max is 6 + t_wall
    faces = info["faces"]
    assert faces["x_min_global"] < 0.0
    assert faces["x_max_global"] > 6.0
    assert faces["y_min_global"] < 0.0
    assert faces["y_max_global"] > 4.0
    assert faces["z_min_global"] < 0.0
    assert faces["z_max_global"] > 2.8

    # Find floor blocks (z < 0):
    # Airlock floor spans x in [0.0, 1.20]
    # Living floor spans x in [1.20, 6.00]
    floor_blocks = [b for b in mapdl.blocks if b["z_max"] <= 0.0]
    floor_x_spans = [(b["x_min"], b["x_max"]) for b in floor_blocks]
    assert any(abs(x0 - 0.0) < 1e-5 and abs(x1 - 1.2) < 1e-5 for x0, x1 in floor_x_spans)
    assert any(abs(x0 - 1.2) < 1e-5 and abs(x1 - 6.0) < 1e-5 for x0, x1 in floor_x_spans)
    # Confirm no floor slab has gap [1.163, 1.237]
    assert not any(abs(x1 - 1.163) < 1e-4 for x0, x1 in floor_x_spans)


def test_builder_single_room_no_partition_behaviour():
    """Verify single-room shelter builds normal air block and zero partition blocks."""
    mapdl = MockMapdl()
    single_room = [
        {
            "name": "single_hall",
            "bounds": {"x_min": 0.0, "x_max": 5.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        }
    ]
    config = _get_base_config()

    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=config,
        materials_db=MATERIALS_DB,
        rooms=single_room,
        partition_spec=None,
    )

    # 1. Normal air volume created
    air_blk = mapdl.blocks[0]
    assert air_blk["x_min"] == pytest.approx(0.0)
    assert air_blk["x_max"] == pytest.approx(5.0)
    assert air_blk["y_min"] == pytest.approx(0.0)
    assert air_blk["y_max"] == pytest.approx(4.0)
    assert air_blk["z_min"] == pytest.approx(0.0)
    assert air_blk["z_max"] == pytest.approx(2.8)

    # 2. No partition blocks
    assert info["partition_mats"] == {}
    assert info.get("partition_blocks", []) == []


def test_builder_partition_spec_via_config():
    """Verify partition_spec can be passed via config['partition'] instead of explicit arg."""
    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)

    config = _get_base_config()
    config["partition"] = assemblies["partition"]

    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=config,
        materials_db=MATERIALS_DB,
        rooms=rooms,
        # partition_spec omitted -> picked from config["partition"]
    )

    assert "partition_blocks" in info
    assert len(info["partition_blocks"]) == 3
    assert mapdl.blocks[0]["x_max"] == pytest.approx(1.163)
    assert mapdl.blocks[1]["x_min"] == pytest.approx(1.237)


def test_builder_rejection_of_partial_face_partition():
    """Verify build_shelter_multiroom raises UnsupportedPartitionGeometryError for partial faces."""
    mapdl = MockMapdl()
    rooms_partial = [
        {
            "name": "room_a",
            "bounds": {"x_min": 0.0, "x_max": 2.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
        {
            "name": "room_b",
            # y_max is 3.0 instead of 4.0 (partial face)
            "bounds": {"x_min": 2.0, "x_max": 5.0, "y_min": 0.0, "y_max": 3.0, "z_min": 0.0, "z_max": 2.8},
        },
    ]
    spec = {
        "assembly_id": "asm_p",
        "total_thickness_m": 0.10,
        "layers_inner_to_outer": [{"thickness_mm": 100.0, "material": "mat_puf"}],
        "interfaces": [{"surface_id": "s1", "owning_zone_id": "room_a", "adjacent_zone_id": "room_b"}],
    }
    config = _get_base_config()

    with pytest.raises(UnsupportedPartitionGeometryError) as exc_info:
        build_shelter_multiroom(
            mapdl=mapdl,
            config=config,
            materials_db=MATERIALS_DB,
            rooms=rooms_partial,
            partition_spec=spec,
        )
    assert "partial-face" in str(exc_info.value).lower()


def test_touching_rooms_without_partition_spec_raises_value_error_before_blocks():
    """Verify touching rooms without partition_spec raise ValueError before creating any blocks."""
    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    config = _get_base_config()
    # config has no "partition" entry

    with pytest.raises(ValueError) as exc_info:
        build_shelter_multiroom(
            mapdl=mapdl,
            config=config,
            materials_db=MATERIALS_DB,
            rooms=rooms,
            partition_spec=None,
        )

    expected_msg = (
        "Multi-room geometry requires a partition_spec so non-overlapping partition layers can be created."
    )
    assert expected_msg in str(exc_info.value)
    # Crucial: failure must happen before ANY air or partition block is created
    assert len(mapdl.blocks) == 0
    assert not any(call[0] == "block" for call in mapdl.call_log)


def test_disjoint_rooms_without_partition_spec_succeeds_with_no_partition_blocks():
    """Verify multiple separated rooms without shared faces succeed with partition_spec=None."""
    mapdl = MockMapdl()
    disjoint_rooms = [
        {
            "name": "room_west",
            "bounds": {"x_min": 0.0, "x_max": 3.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
        {
            "name": "room_east",
            "bounds": {"x_min": 10.0, "x_max": 15.0, "y_min": 0.0, "y_max": 4.0, "z_min": 0.0, "z_max": 2.8},
        },
    ]
    config = _get_base_config()

    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=config,
        materials_db=MATERIALS_DB,
        rooms=disjoint_rooms,
        partition_spec=None,
    )

    assert len(info["air_mats"]) == 2
    assert "room_west" in info["air_mats"]
    assert "room_east" in info["air_mats"]
    assert info["partition_mats"] == {}
    assert info.get("partition_blocks", []) == []

    # First two blocks are the air volumes for west and east
    assert mapdl.blocks[0]["x_min"] == pytest.approx(0.0)
    assert mapdl.blocks[0]["x_max"] == pytest.approx(3.0)
    assert mapdl.blocks[1]["x_min"] == pytest.approx(10.0)
    assert mapdl.blocks[1]["x_max"] == pytest.approx(15.0)


def test_partition_only_material_registered_in_ansys():
    """Verify materials used only in partition layers are registered in ANSYS and mat_map."""
    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)

    materials_db = dict(MATERIALS_DB)
    materials_db["mat_aerogel"] = {
        "thermal_conductivity": 0.015,
        "density": 10.0,
        "specific_heat": 1100.0,
    }

    spec = {
        "assembly_id": "asm_aerogel",
        "total_thickness_m": 0.05,
        "layers_inner_to_outer": [{"thickness_mm": 50.0, "material": "mat_aerogel"}],
        "interfaces": [{"surface_id": "s_part", "owning_zone_id": "airlock", "adjacent_zone_id": "living"}],
    }

    config = _get_base_config()
    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=config,
        materials_db=materials_db,
        rooms=rooms,
        partition_spec=spec,
    )

    # 1. mat_aerogel must be in envelope_mats['mat_map']
    assert "mat_aerogel" in info["envelope_mats"]["mat_map"]
    aerogel_mat_num = info["envelope_mats"]["mat_map"]["mat_aerogel"]

    # 2. Must be registered in ANSYS material definitions
    assert aerogel_mat_num in mapdl.materials
    props = mapdl.materials[aerogel_mat_num]
    assert props["KXX"] == pytest.approx(0.015)
    assert props["DENS"] == pytest.approx(10.0)
    assert props["C"] == pytest.approx(1100.0)

    # 3. Partition block volume must have aerogel_mat_num assigned
    # Blocks 0, 1 are airlock air and living air; block 2 is partition
    part_block = mapdl.blocks[2]
    assert mapdl.volu_mats[part_block["volu"]] == aerogel_mat_num
    assert info["partition_mats"]["airlock_to_living"] == [aerogel_mat_num]


def test_repeated_partition_material_reuses_ansys_material_number():
    """Verify repeated partition layer materials reuse the same ANSYS material number."""
    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)

    materials_db = dict(MATERIALS_DB)
    materials_db["mat_fiber"] = {
        "thermal_conductivity": 0.035,
        "density": 50.0,
        "specific_heat": 900.0,
    }

    # Sandwich partition: fiber (10 mm) / puf (30 mm) / fiber (10 mm) -> total 50 mm
    spec = {
        "assembly_id": "asm_fiber_sandwich",
        "total_thickness_m": 0.05,
        "layers_inner_to_outer": [
            {"thickness_mm": 10.0, "material": "mat_fiber"},
            {"thickness_mm": 30.0, "material": "mat_puf"},
            {"thickness_mm": 10.0, "material": "mat_fiber"},
        ],
        "interfaces": [{"surface_id": "s_part", "owning_zone_id": "airlock", "adjacent_zone_id": "living"}],
    }

    config = _get_base_config()
    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=config,
        materials_db=materials_db,
        rooms=rooms,
        partition_spec=spec,
    )

    fiber_mat_num = info["envelope_mats"]["mat_map"]["mat_fiber"]
    puf_mat_num = info["envelope_mats"]["mat_map"]["mat_puf"]

    # Blocks: 0=airlock air, 1=living air, 2=fiber, 3=puf, 4=fiber
    b_fiber0 = mapdl.blocks[2]
    b_puf    = mapdl.blocks[3]
    b_fiber1 = mapdl.blocks[4]

    assert mapdl.volu_mats[b_fiber0["volu"]] == fiber_mat_num
    assert mapdl.volu_mats[b_puf["volu"]]    == puf_mat_num
    assert mapdl.volu_mats[b_fiber1["volu"]] == fiber_mat_num

    # Reused material number
    assert mapdl.volu_mats[b_fiber0["volu"]] == mapdl.volu_mats[b_fiber1["volu"]]
    assert info["partition_mats"]["airlock_to_living"] == [fiber_mat_num, puf_mat_num, fiber_mat_num]


def test_partition_material_missing_from_db_raises_key_error_before_blocks():
    """Verify partition layer with missing material from materials_db raises KeyError before blocks."""
    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)

    spec = {
        "assembly_id": "asm_bad",
        "total_thickness_m": 0.05,
        "layers_inner_to_outer": [{"thickness_mm": 50.0, "material": "mat_nonexistent_xyz"}],
        "interfaces": [{"surface_id": "s_part", "owning_zone_id": "airlock", "adjacent_zone_id": "living"}],
    }

    config = _get_base_config()
    with pytest.raises(KeyError) as exc_info:
        build_shelter_multiroom(
            mapdl=mapdl,
            config=config,
            materials_db=MATERIALS_DB,  # does not contain mat_nonexistent_xyz
            rooms=rooms,
            partition_spec=spec,
        )

    assert "mat_nonexistent_xyz" in str(exc_info.value)
    # Failure must happen before ANY air or partition block is created
    assert len(mapdl.blocks) == 0
    assert not any(call[0] == "block" for call in mapdl.call_log)


def test_no_legacy_overlapping_partition_block_can_be_created():
    """Verify legacy single overlapping block functions are deleted and no straddling block exists."""
    import geometry_builder_multiroom

    # Legacy functions must NOT exist
    assert not hasattr(geometry_builder_multiroom, "_build_partition_block")
    assert not hasattr(geometry_builder_multiroom, "_register_partition_mat")

    mapdl = MockMapdl()
    model = load_building_model(_fixture_path("building_airlock_living.json"))
    rooms = building_model_to_rooms(model)
    assemblies = building_model_to_ansys_assemblies(model)

    build_shelter_multiroom(
        mapdl=mapdl,
        config=_get_base_config(),
        materials_db=MATERIALS_DB,
        rooms=rooms,
        partition_spec=assemblies["partition"],
    )

    # Legacy 100 mm monolithic block was centred at 1.200 (x in [1.150, 1.250])
    # which overlapped airlock air [0.0, 1.200] and living air [1.200, 6.000].
    # Verify the legacy monolithic block was never created:
    for b in mapdl.blocks:
        is_legacy = abs(b["x_min"] - 1.150) < 1e-4 and abs(b["x_max"] - 1.250) < 1e-4
        assert not is_legacy, f"Found legacy overlapping block x=[1.15, 1.25]: {b}"

    # Partition blocks must strictly reside within the planned partition envelope [1.163, 1.237]
    # and not overlap with air volumes [0.0, 1.163] or [1.237, 6.000]
    part_blocks = mapdl.blocks[2:5]
    assert len(part_blocks) == 3
    for pb in part_blocks:
        assert pb["x_min"] >= 1.163 - 1e-5
        assert pb["x_max"] <= 1.237 + 1e-5
        # Must not intrude into airlock air [0, 1.163]
        assert pb["x_min"] >= mapdl.blocks[0]["x_max"] - 1e-5
        # Must not intrude into living air [1.237, 6.0]
        assert pb["x_max"] <= mapdl.blocks[1]["x_min"] + 1e-5
