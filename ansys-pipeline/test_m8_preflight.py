"""
test_m8_preflight.py

Non-ANSYS preflight verification test for test_m8_multiroom_pipeline_FIXED.py.
Validates:
- M0 BuildingModel and MaterialSnapshot loading and schema validation;
- M0 assembly conversion into M8 CONFIG layers (walls, roof, floor, partition);
- Exact material properties converted from MaterialSnapshot;
- Partition specification (layers, thickness, interface orientation);
- Preflight validation function behavior and failure detection;
- Offline multi-room geometry builder execution using MockMapdl with pipeline CONFIG.
Does NOT launch PyMAPDL or require an active ANSYS licence.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import test_m8_multiroom_pipeline_FIXED as pipeline
from geometry_builder_multiroom import build_shelter_multiroom
from test_geometry_builder_multiroom import MockMapdl


def test_m8_preflight_loads_m0_contracts_and_passes_validation():
    """Verify that test_m8_multiroom_pipeline_FIXED loads M0 fixtures and passes preflight validation."""
    assert pipeline.building_model.design_id == "des_airlock_living_001"
    assert pipeline.building_model.revision_id == "rev_airlock_living_r1"
    assert pipeline.material_snapshot.snapshot_id == "mat_snap_himalayan_v1"
    assert len(pipeline.rooms) == 2

    # Must pass without raising any exception
    pipeline.validate_preflight_configuration(
        building_model=pipeline.building_model,
        material_snapshot=pipeline.material_snapshot,
        assemblies=pipeline.assemblies,
        materials_db=pipeline.MATERIALS_DB,
        config=pipeline.CONFIG,
    )


def test_m8_preflight_wall_roof_floor_partition_exact_layers():
    """Verify exact layer thicknesses, materials, and ordering derived from M0 assemblies."""
    # 1. Walls: outer-to-inner: mat_stone 150 mm, mat_puf 50 mm
    expected_walls = [
        {"thickness_mm": 150.0, "material": "mat_stone"},
        {"thickness_mm": 50.0, "material": "mat_puf"},
    ]
    assert pipeline.CONFIG["walls"] == expected_walls

    # 2. Roof: outer-to-inner: mat_puf 80 mm, mat_plywood 80 mm
    expected_roof = [
        {"thickness_mm": 80.0, "material": "mat_puf"},
        {"thickness_mm": 80.0, "material": "mat_plywood"},
    ]
    assert pipeline.CONFIG["roof"] == expected_roof

    # 3. Floor: outer-to-inner: mat_puf 50 mm, mat_concrete 100 mm
    expected_floor = [
        {"thickness_mm": 50.0, "material": "mat_puf"},
        {"thickness_mm": 100.0, "material": "mat_concrete"},
    ]
    assert pipeline.CONFIG["floor"] == expected_floor

    # 4. Partition: owning-zone to adjacent-zone: mat_plywood 12 mm, mat_puf 50 mm, mat_plywood 12 mm
    part = pipeline.assemblies["partition"]
    assert part is not None
    expected_partition_layers = [
        {"thickness_mm": 12.0, "material": "mat_plywood"},
        {"thickness_mm": 50.0, "material": "mat_puf"},
        {"thickness_mm": 12.0, "material": "mat_plywood"},
    ]
    assert part["layers_inner_to_outer"] == expected_partition_layers
    assert part["total_thickness_m"] == pytest.approx(0.074, abs=1e-6)

    # 5. Interface: airlock -> living
    interfaces = part["interfaces"]
    assert len(interfaces) == 1
    assert interfaces[0]["owning_zone_id"] == "airlock"
    assert interfaces[0]["adjacent_zone_id"] == "living"
    assert interfaces[0]["surface_id"] == "surf_partition_airlock_living"


def test_m8_preflight_materials_db_properties():
    """Verify that MATERIALS_DB was populated from the MaterialSnapshot with exact thermal properties."""
    db = pipeline.MATERIALS_DB
    assert set(db.keys()) == {"mat_stone", "mat_puf", "mat_plywood", "mat_concrete"}

    # mat_stone
    assert db["mat_stone"]["thermal_conductivity"] == pytest.approx(2.0)
    assert db["mat_stone"]["density"] == pytest.approx(2300.0)
    assert db["mat_stone"]["specific_heat"] == pytest.approx(880.0)

    # mat_puf
    assert db["mat_puf"]["thermal_conductivity"] == pytest.approx(0.024)
    assert db["mat_puf"]["density"] == pytest.approx(35.0)
    assert db["mat_puf"]["specific_heat"] == pytest.approx(1500.0)

    # mat_plywood
    assert db["mat_plywood"]["thermal_conductivity"] == pytest.approx(0.13)
    assert db["mat_plywood"]["density"] == pytest.approx(650.0)
    assert db["mat_plywood"]["specific_heat"] == pytest.approx(1600.0)

    # mat_concrete
    assert db["mat_concrete"]["thermal_conductivity"] == pytest.approx(1.4)
    assert db["mat_concrete"]["density"] == pytest.approx(2400.0)
    assert db["mat_concrete"]["specific_heat"] == pytest.approx(1000.0)


def test_m8_preflight_catches_invalid_configuration():
    """Verify that validate_preflight_configuration raises AssertionError on corrupted configurations."""
    # Mutate walls
    bad_config = copy.deepcopy(pipeline.CONFIG)
    bad_config["walls"][0]["thickness_mm"] = 999.0
    with pytest.raises(AssertionError) as exc:
        pipeline.validate_preflight_configuration(
            pipeline.building_model,
            pipeline.material_snapshot,
            pipeline.assemblies,
            pipeline.MATERIALS_DB,
            bad_config,
        )
    assert "Wall layers mismatch" in str(exc.value)

    # Mutate partition thickness
    bad_assemblies = copy.deepcopy(pipeline.assemblies)
    bad_assemblies["partition"]["total_thickness_m"] = 0.100
    with pytest.raises(AssertionError) as exc:
        pipeline.validate_preflight_configuration(
            pipeline.building_model,
            pipeline.material_snapshot,
            bad_assemblies,
            pipeline.MATERIALS_DB,
            pipeline.CONFIG,
        )
    assert "Partition total thickness mismatch" in str(exc.value)

    # Missing material from materials_db
    bad_db = copy.deepcopy(pipeline.MATERIALS_DB)
    del bad_db["mat_stone"]
    with pytest.raises(AssertionError) as exc:
        pipeline.validate_preflight_configuration(
            pipeline.building_model,
            pipeline.material_snapshot,
            pipeline.assemblies,
            bad_db,
            pipeline.CONFIG,
        )
    assert "Material 'mat_stone' in walls not found in materials_db" in str(exc.value)


def test_m8_mock_builder_with_pipeline_config():
    """Verify that geometry_builder_multiroom runs cleanly with pipeline CONFIG and produces exact coordinates."""
    mapdl = MockMapdl()
    info = build_shelter_multiroom(
        mapdl=mapdl,
        config=pipeline.CONFIG,
        materials_db=pipeline.MATERIALS_DB,
        rooms=pipeline.rooms,
        window_room="living",
        element_size_m=0.25,
        partition_thickness_m=pipeline.assemblies["partition"]["total_thickness_m"],
        partition_spec=pipeline.assemblies["partition"],
    )

    # Verify return dict
    assert "airlock" in info["air_mats"]
    assert "living" in info["air_mats"]
    assert "airlock_to_living" in info["partition_mats"]
    assert len(info["partition_blocks"]) == 3

    # Airlock air: x=[0.000, 1.163]
    b_airlock = mapdl.blocks[0]
    assert b_airlock["x_min"] == pytest.approx(0.000)
    assert b_airlock["x_max"] == pytest.approx(1.163)

    # Living air: x=[1.237, 6.000]
    b_living = mapdl.blocks[1]
    assert b_living["x_min"] == pytest.approx(1.237)
    assert b_living["x_max"] == pytest.approx(6.000)

    # Partition layers
    # Layer 0: mat_plywood [1.163, 1.175]
    b_p0 = mapdl.blocks[2]
    assert b_p0["x_min"] == pytest.approx(1.163)
    assert b_p0["x_max"] == pytest.approx(1.175)
    plywood_mat = info["envelope_mats"]["mat_map"]["mat_plywood"]
    assert mapdl.volu_mats[b_p0["volu"]] == plywood_mat

    # Layer 1: mat_puf [1.175, 1.225]
    b_p1 = mapdl.blocks[3]
    assert b_p1["x_min"] == pytest.approx(1.175)
    assert b_p1["x_max"] == pytest.approx(1.225)
    puf_mat = info["envelope_mats"]["mat_map"]["mat_puf"]
    assert mapdl.volu_mats[b_p1["volu"]] == puf_mat

    # Layer 2: mat_plywood [1.225, 1.237]
    b_p2 = mapdl.blocks[4]
    assert b_p2["x_min"] == pytest.approx(1.225)
    assert b_p2["x_max"] == pytest.approx(1.237)
    assert mapdl.volu_mats[b_p2["volu"]] == plywood_mat
