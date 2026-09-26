"""
test_m0_assembly_adapter.py

Unit tests for m0_assembly_adapter.py.
Validates conversion of M0 BuildingModel assemblies into the M8 ANSYS builder format,
layer-order reversal for envelope assemblies, preservation of partition definitions,
and enforcement of single-assembly constraints per surface category.
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
from m0_assembly_adapter import (
    InvalidPartitionInterfaceError,
    UnsupportedAssemblyLayoutError,
    building_model_to_ansys_assemblies,
)
from cocoon_contracts.building import (
    AssemblyCategory,
    AssemblyLayer,
    ConstructionAssembly,
    SurfaceType,
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


def test_airlock_living_assemblies_conversion():
    """Verify exact conversion of building_airlock_living.json assemblies.

    Checks:
    - Walls converted to outer-to-inner order:
        1. mat_stone, 150 mm
        2. mat_puf, 50 mm
    - Roof converted to outer-to-inner order:
        1. mat_puf, 80 mm
        2. mat_plywood, 80 mm
    - Floor converted to outer-to-inner order:
        1. mat_puf, 50 mm
        2. mat_concrete, 100 mm
    - Partition preserved in inner-to-outer order:
        1. mat_plywood, 12 mm
        2. mat_puf, 50 mm
        3. mat_plywood, 12 mm
    - Partition total thickness is exactly 0.074 m
    - Partition assembly_id is 'asm_partition_timber'
    """
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    result = building_model_to_ansys_assemblies(building)

    # 1. Walls verification (outer-to-inner)
    assert "walls" in result
    walls = result["walls"]
    assert len(walls) == 2
    assert walls[0] == {"material": "mat_stone", "thickness_mm": 150.0}
    assert walls[1] == {"material": "mat_puf", "thickness_mm": 50.0}

    # 2. Roof verification (outer-to-inner)
    assert "roof" in result
    roof = result["roof"]
    assert len(roof) == 2
    assert roof[0] == {"material": "mat_puf", "thickness_mm": 80.0}
    assert roof[1] == {"material": "mat_plywood", "thickness_mm": 80.0}

    # 3. Floor verification (outer-to-inner)
    assert "floor" in result
    floor = result["floor"]
    assert len(floor) == 2
    assert floor[0] == {"material": "mat_puf", "thickness_mm": 50.0}
    assert floor[1] == {"material": "mat_concrete", "thickness_mm": 100.0}

    # 4. Partition verification (inner-to-outer preserved)
    assert "partition" in result
    partition = result["partition"]
    assert partition["assembly_id"] == "asm_partition_timber"
    assert partition["total_thickness_m"] == pytest.approx(0.074)

    partition_layers = partition["layers_inner_to_outer"]
    assert len(partition_layers) == 3
    assert partition_layers[0] == {"material": "mat_plywood", "thickness_mm": 12.0}
    assert partition_layers[1] == {"material": "mat_puf", "thickness_mm": 50.0}
    assert partition_layers[2] == {"material": "mat_plywood", "thickness_mm": 12.0}

    # 5. Partition interfaces metadata verification
    assert "interfaces" in partition
    assert len(partition["interfaces"]) == 1
    assert partition["interfaces"][0] == {
        "surface_id": "surf_partition_airlock_living",
        "owning_zone_id": "airlock",
        "adjacent_zone_id": "living",
    }


def test_rejection_of_multiple_exterior_wall_assemblies():
    """Verify rejection when different exterior-wall surfaces reference different assemblies."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    # Add a second wall assembly to the model
    alt_assembly = ConstructionAssembly(
        id="asm_wall_alt",
        name="Alternative Wall Assembly",
        category=AssemblyCategory.WALL,
        layers=[
            AssemblyLayer(material_id="mat_puf", thickness_mm=100.0),
            AssemblyLayer(material_id="mat_stone", thickness_mm=200.0),
        ],
    )
    new_assemblies = dict(building.assemblies)
    new_assemblies["asm_wall_alt"] = alt_assembly

    # Modify one exterior-wall surface to use the alternative assembly
    new_surfaces = []
    modified = False
    for s in building.surfaces:
        if s.surface_type == SurfaceType.EXTERIOR_WALL and not modified:
            new_surfaces.append(s.model_copy(update={"assembly_id": "asm_wall_alt"}))
            modified = True
        else:
            new_surfaces.append(s)

    building_multi_wall = building.model_copy(
        update={"assemblies": new_assemblies, "surfaces": new_surfaces}
    )

    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info:
        building_model_to_ansys_assemblies(building_multi_wall)

    error_msg = str(exc_info.value)
    assert "exterior-wall" in error_msg
    assert "asm_wall_alt" in error_msg
    assert "asm_wall_insulated" in error_msg


def test_rejection_of_multiple_partition_assemblies():
    """Verify rejection when multiple partition surfaces reference different assemblies."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    alt_partition = ConstructionAssembly(
        id="asm_partition_alt",
        name="Alternative Partition Assembly",
        category=AssemblyCategory.PARTITION,
        layers=[
            AssemblyLayer(material_id="mat_plywood", thickness_mm=20.0),
        ],
    )
    new_assemblies = dict(building.assemblies)
    new_assemblies["asm_partition_alt"] = alt_partition

    # Find the existing partition surface and add a second partition surface with alt assembly
    partition_surf = next(s for s in building.surfaces if s.surface_type == SurfaceType.PARTITION)
    second_partition_surf = partition_surf.model_copy(
        update={"id": "surf_partition_secondary", "assembly_id": "asm_partition_alt"}
    )
    new_surfaces = list(building.surfaces) + [second_partition_surf]

    building_multi_part = building.model_copy(
        update={"assemblies": new_assemblies, "surfaces": new_surfaces}
    )

    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info:
        building_model_to_ansys_assemblies(building_multi_part)

    error_msg = str(exc_info.value)
    assert "partition" in error_msg
    assert "asm_partition_alt" in error_msg
    assert "asm_partition_timber" in error_msg


def test_rejection_of_multiple_roof_and_floor_assemblies():
    """Verify rejection when multiple roof or floor assemblies are referenced."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    alt_roof = ConstructionAssembly(
        id="asm_roof_alt",
        name="Alternative Roof Assembly",
        category=AssemblyCategory.ROOF,
        layers=[
            AssemblyLayer(material_id="mat_plywood", thickness_mm=50.0),
        ],
    )
    new_assemblies = dict(building.assemblies)
    new_assemblies["asm_roof_alt"] = alt_roof

    new_surfaces = []
    modified = False
    for s in building.surfaces:
        if s.surface_type == SurfaceType.ROOF and not modified:
            new_surfaces.append(s.model_copy(update={"assembly_id": "asm_roof_alt"}))
            modified = True
        else:
            new_surfaces.append(s)

    building_multi_roof = building.model_copy(
        update={"assemblies": new_assemblies, "surfaces": new_surfaces}
    )

    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info:
        building_model_to_ansys_assemblies(building_multi_roof)
    assert "roof" in str(exc_info.value)


def test_failure_when_surface_category_has_no_assembly():
    """Verify clear failure when any required surface category (walls, roof, floor) has no assembly."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    # 1. Missing exterior-wall surfaces
    surfaces_no_walls = [s for s in building.surfaces if s.surface_type != SurfaceType.EXTERIOR_WALL]
    b_no_walls = building.model_copy(update={"surfaces": surfaces_no_walls})
    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info:
        building_model_to_ansys_assemblies(b_no_walls)
    assert "exterior-wall" in str(exc_info.value)

    # 2. Missing roof surfaces
    surfaces_no_roof = [s for s in building.surfaces if s.surface_type != SurfaceType.ROOF]
    b_no_roof = building.model_copy(update={"surfaces": surfaces_no_roof})
    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info:
        building_model_to_ansys_assemblies(b_no_roof)
    assert "roof" in str(exc_info.value)

    # 3. Missing floor surfaces
    surfaces_no_floor = [s for s in building.surfaces if s.surface_type != SurfaceType.FLOOR]
    b_no_floor = building.model_copy(update={"surfaces": surfaces_no_floor})
    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info:
        building_model_to_ansys_assemblies(b_no_floor)
    assert "floor" in str(exc_info.value)


def test_no_partition_surfaces_success():
    """Verify that a building with no partition surfaces converts successfully with partition=None.

    Ensures that a valid single-room building (or any building without partition surfaces)
    still has valid wall, roof, and floor layers and returns partition=None.
    """
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    # Filter out all partition surfaces, leaving only wall, roof, and floor surfaces
    surfaces_without_partitions = [
        s for s in building.surfaces if s.surface_type != SurfaceType.PARTITION
    ]
    b_no_partitions = building.model_copy(update={"surfaces": surfaces_without_partitions})

    result = building_model_to_ansys_assemblies(b_no_partitions)

    # Partition must be None
    assert result["partition"] is None

    # Wall, roof, and floor assemblies must still convert properly
    assert len(result["walls"]) == 2
    assert result["walls"][0] == {"material": "mat_stone", "thickness_mm": 150.0}
    assert result["walls"][1] == {"material": "mat_puf", "thickness_mm": 50.0}

    assert len(result["roof"]) == 2
    assert result["roof"][0] == {"material": "mat_puf", "thickness_mm": 80.0}
    assert result["roof"][1] == {"material": "mat_plywood", "thickness_mm": 80.0}

    assert len(result["floor"]) == 2
    assert result["floor"][0] == {"material": "mat_puf", "thickness_mm": 50.0}
    assert result["floor"][1] == {"material": "mat_concrete", "thickness_mm": 100.0}


def test_failure_when_referenced_assembly_missing_from_assemblies_dict():
    """Verify failure when a surface references an assembly_id not in building.assemblies."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    # 1. Remove the wall assembly from building.assemblies
    assemblies_without_wall = {
        k: v for k, v in building.assemblies.items() if k != "asm_wall_insulated"
    }
    b_missing_wall_asm = building.model_copy(update={"assemblies": assemblies_without_wall})
    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info_wall:
        building_model_to_ansys_assemblies(b_missing_wall_asm)
    assert "asm_wall_insulated" in str(exc_info_wall.value)

    # 2. Remove the partition assembly from building.assemblies
    assemblies_without_partition = {
        k: v for k, v in building.assemblies.items() if k != "asm_partition_timber"
    }
    b_missing_part_asm = building.model_copy(update={"assemblies": assemblies_without_partition})
    with pytest.raises(UnsupportedAssemblyLayoutError) as exc_info_part:
        building_model_to_ansys_assemblies(b_missing_part_asm)
    assert "asm_partition_timber" in str(exc_info_part.value)


def test_airlock_living_partition_orientation():
    """Verify exact airlock-to-living orientation metadata and layer sequence."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    result = building_model_to_ansys_assemblies(building)
    partition = result["partition"]
    assert partition is not None

    # Exact interface assertion per requirement 6
    assert partition["interfaces"] == [
        {
            "surface_id": "surf_partition_airlock_living",
            "owning_zone_id": "airlock",
            "adjacent_zone_id": "living",
        }
    ]

    # Layers inner-to-outer from owning zone (airlock) toward adjacent zone (living)
    assert partition["layers_inner_to_outer"] == [
        {"material": "mat_plywood", "thickness_mm": 12.0},
        {"material": "mat_puf", "thickness_mm": 50.0},
        {"material": "mat_plywood", "thickness_mm": 12.0},
    ]


def test_partition_missing_adjacent_zone_id():
    """Verify rejection when a partition surface has adjacent_zone_id set to None or empty."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    new_surfaces = []
    for s in building.surfaces:
        if s.surface_type == SurfaceType.PARTITION:
            new_surfaces.append(s.model_copy(update={"adjacent_zone_id": None}))
        else:
            new_surfaces.append(s)

    b_missing_adj = building.model_copy(update={"surfaces": new_surfaces})
    with pytest.raises(InvalidPartitionInterfaceError) as exc_info:
        building_model_to_ansys_assemblies(b_missing_adj)

    error_msg = str(exc_info.value)
    assert "surf_partition_airlock_living" in error_msg
    assert "adjacent_zone_id" in error_msg


def test_partition_self_adjacency():
    """Verify rejection when a partition surface has identical owning and adjacent zone IDs."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    new_surfaces = []
    for s in building.surfaces:
        if s.surface_type == SurfaceType.PARTITION:
            new_surfaces.append(s.model_copy(update={"adjacent_zone_id": s.owning_zone_id}))
        else:
            new_surfaces.append(s)

    b_self_adj = building.model_copy(update={"surfaces": new_surfaces})
    with pytest.raises(InvalidPartitionInterfaceError) as exc_info:
        building_model_to_ansys_assemblies(b_self_adj)

    error_msg = str(exc_info.value)
    assert "self-adjacency" in error_msg.lower()
    assert "airlock" in error_msg


def test_partition_unknown_owning_zone():
    """Verify rejection when a partition surface references an unknown owning_zone_id."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    new_surfaces = []
    for s in building.surfaces:
        if s.surface_type == SurfaceType.PARTITION:
            new_surfaces.append(s.model_copy(update={"owning_zone_id": "ghost_zone"}))
        else:
            new_surfaces.append(s)

    b_unknown_owner = building.model_copy(update={"surfaces": new_surfaces})
    with pytest.raises(InvalidPartitionInterfaceError) as exc_info:
        building_model_to_ansys_assemblies(b_unknown_owner)

    error_msg = str(exc_info.value)
    assert "owning_zone_id" in error_msg
    assert "ghost_zone" in error_msg


def test_partition_unknown_adjacent_zone():
    """Verify rejection when a partition surface references an unknown adjacent_zone_id."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    new_surfaces = []
    for s in building.surfaces:
        if s.surface_type == SurfaceType.PARTITION:
            new_surfaces.append(s.model_copy(update={"adjacent_zone_id": "ghost_zone"}))
        else:
            new_surfaces.append(s)

    b_unknown_adj = building.model_copy(update={"surfaces": new_surfaces})
    with pytest.raises(InvalidPartitionInterfaceError) as exc_info:
        building_model_to_ansys_assemblies(b_unknown_adj)

    error_msg = str(exc_info.value)
    assert "adjacent_zone_id" in error_msg
    assert "ghost_zone" in error_msg


def test_partition_duplicate_unordered_room_pair_interfaces():
    """Verify rejection when multiple partition surfaces link the same unordered zone pair."""
    path = _fixture_path("building_airlock_living.json")
    building = load_building_model(path)

    part_surf = next(s for s in building.surfaces if s.surface_type == SurfaceType.PARTITION)

    # 1. Opposite direction: owning=living, adjacent=airlock (same unordered pair)
    reversed_part = part_surf.model_copy(
        update={
            "id": "surf_partition_reversed",
            "owning_zone_id": "living",
            "adjacent_zone_id": "airlock",
        }
    )
    b_dup_rev = building.model_copy(
        update={"surfaces": list(building.surfaces) + [reversed_part]}
    )
    with pytest.raises(InvalidPartitionInterfaceError) as exc_info_rev:
        building_model_to_ansys_assemblies(b_dup_rev)
    assert "duplicate" in str(exc_info_rev.value).lower()
    assert "airlock" in str(exc_info_rev.value)
    assert "living" in str(exc_info_rev.value)

    # 2. Identical direction: duplicate surface with same owning and adjacent zone IDs
    same_part = part_surf.model_copy(update={"id": "surf_partition_duplicate_same"})
    b_dup_same = building.model_copy(
        update={"surfaces": list(building.surfaces) + [same_part]}
    )
    with pytest.raises(InvalidPartitionInterfaceError) as exc_info_same:
        building_model_to_ansys_assemblies(b_dup_same)
    assert "duplicate" in str(exc_info_same.value).lower()
