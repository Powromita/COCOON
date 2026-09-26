"""
test_cross_references.py - Unit tests for cross-field semantic and referential integrity validators.
"""

from __future__ import annotations

from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

import cocoon_contracts as cc


def aware_dt(year: int, month: int, day: int, hour: int = 0) -> datetime:
    return datetime(year, month, day, hour, tzinfo=timezone.utc)


def test_site_analysis_window_validation():
    # End before or equal to start must raise error
    with pytest.raises(ValidationError) as exc:
        cc.SiteSpecification(
            latitude_deg=34.15,
            longitude_deg=77.57,
            elevation_m=3500.0,
            timezone="Asia/Kolkata",
            weather_source="NASA_POWER",
            analysis_start=aware_dt(2026, 1, 10),
            analysis_end=aware_dt(2026, 1, 5),
        )
    assert "strictly after analysis_start" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        cc.SiteSpecification(
            latitude_deg=34.15,
            longitude_deg=77.57,
            elevation_m=3500.0,
            timezone="Asia/Kolkata",
            weather_source="NASA_POWER",
            analysis_start=aware_dt(2026, 1, 5),
            analysis_end=aware_dt(2026, 1, 5),
        )
    assert "strictly after analysis_start" in str(exc.value)


def test_naive_datetime_rejected():
    naive = datetime(2026, 1, 1, 0, 0, 0)
    with pytest.raises(ValidationError) as exc:
        cc.SourceMetadata(
            creator="tester",
            created_at=naive,
        )
    assert "must be timezone-aware" in str(exc.value)


def test_building_duplicate_floor_id():
    with pytest.raises(ValidationError) as exc:
        cc.BuildingModel(
            schema_version="4.0",
            design_id="des_001",
            revision_id="rev_001",
            source=cc.BuildingSource.GENERATED,
            floors=[
                cc.Floor(id="floor_0", level=0, zones=[]),
                cc.Floor(id="floor_0", level=1, zones=[]),
            ],
            surfaces=[],
            openings=[],
            connections=[],
            assemblies={},
            schedules={},
            metadata=cc.BuildingMetadata(created_at=aware_dt(2026, 1, 1)),
        )
    assert "Duplicate floor ID found" in str(exc.value)


def test_building_duplicate_floor_level():
    with pytest.raises(ValidationError) as exc:
        cc.BuildingModel(
            schema_version="4.0",
            design_id="des_001",
            revision_id="rev_001",
            source=cc.BuildingSource.GENERATED,
            floors=[
                cc.Floor(id="floor_a", level=0, zones=[]),
                cc.Floor(id="floor_b", level=0, zones=[]),
            ],
            surfaces=[],
            openings=[],
            connections=[],
            assemblies={},
            schedules={},
            metadata=cc.BuildingMetadata(created_at=aware_dt(2026, 1, 1)),
        )
    assert "Duplicate floor level found" in str(exc.value)


def test_building_adjacent_zone_surface_validation():
    # Adjacent zone surface missing adjacent_zone_id
    with pytest.raises(ValidationError) as exc:
        cc.BuildingModel(
            schema_version="4.0",
            design_id="des_001",
            revision_id="rev_001",
            source=cc.BuildingSource.GENERATED,
            floors=[
                cc.Floor(
                    id="floor_0",
                    level=0,
                    zones=[
                        cc.Zone(
                            id="z1",
                            type="living",
                            origin_m=cc.Vector3D(x=0, y=0, z=0),
                            size_m=cc.ZoneSize(length_m=4, width_m=4, height_m=2.8),
                        )
                    ],
                )
            ],
            surfaces=[
                cc.Surface(
                    id="surf_part",
                    owning_zone_id="z1",
                    boundary_type=cc.SurfaceBoundaryType.ADJACENT_ZONE,
                    surface_type=cc.SurfaceType.PARTITION,
                    area_m2=10.0,
                    azimuth_deg=90.0,
                    tilt_deg=90.0,
                    assembly_id="asm_part",
                    adjacent_zone_id=None,
                )
            ],
            openings=[],
            connections=[],
            assemblies={
                "asm_part": cc.ConstructionAssembly(
                    id="asm_part",
                    name="Partition Assembly",
                    category=cc.AssemblyCategory.PARTITION,
                    layers=[cc.AssemblyLayer(material_id="mat_puf", thickness_mm=50.0)],
                )
            },
            schedules={},
            metadata=cc.BuildingMetadata(created_at=aware_dt(2026, 1, 1)),
        )
    assert "adjacent_zone_id is missing" in str(exc.value)


def test_building_connection_self_loop_rejected():
    with pytest.raises(ValidationError) as exc:
        cc.BuildingModel(
            schema_version="4.0",
            design_id="des_001",
            revision_id="rev_001",
            source=cc.BuildingSource.GENERATED,
            floors=[
                cc.Floor(
                    id="floor_0",
                    level=0,
                    zones=[
                        cc.Zone(
                            id="z1",
                            type="living",
                            origin_m=cc.Vector3D(x=0, y=0, z=0),
                            size_m=cc.ZoneSize(length_m=4, width_m=4, height_m=2.8),
                        )
                    ],
                )
            ],
            surfaces=[],
            openings=[],
            connections=[
                cc.ZoneConnection(
                    id="conn_loop",
                    zone_a_id="z1",
                    zone_b_id="z1",
                    connection_type=cc.ZoneConnectionType.DOOR,
                )
            ],
            assemblies={},
            schedules={},
            metadata=cc.BuildingMetadata(created_at=aware_dt(2026, 1, 1)),
        )
    assert "cannot connect zone 'z1' to itself" in str(exc.value)


def test_ansys_scientific_integrity_guard():
    # If imposed_indoor_temp_forbidden is set to False (meaning user tried to pass indoor temp to ANSYS)
    with pytest.raises(ValidationError) as exc:
        cc.AnsysJobRequest(
            schema_version="4.0",
            job_id="ans_001",
            design_revision_id="rev_001",
            weather_snapshot_id="wx_001",
            solver_config=cc.AnsysSolverConfig(),
            input_hashes={"hash": "abc"},
            submitted_at=aware_dt(2026, 1, 1),
            imposed_indoor_temp_forbidden=False,
        )
    assert "SCIENTIFIC INTEGRITY VIOLATION" in str(exc.value)


def test_ansys_status_consistency():
    # COMPLETED job without artifacts
    with pytest.raises(ValidationError) as exc:
        cc.AnsysValidationResult(
            schema_version="4.0",
            job_id="ans_001",
            design_revision_id="rev_001",
            status=cc.AnsysJobStatus.COMPLETED,
            started_at=aware_dt(2026, 1, 1, 1),
            completed_at=aware_dt(2026, 1, 1, 2),
            artifacts=None,
        )
    assert "must include an AnsysArtifactManifest" in str(exc.value)

    # FAILED job without error reason
    with pytest.raises(ValidationError) as exc:
        cc.AnsysValidationResult(
            schema_version="4.0",
            job_id="ans_001",
            design_revision_id="rev_001",
            status=cc.AnsysJobStatus.FAILED,
            error_reason=None,
        )
    assert "must provide an error_reason" in str(exc.value)


def test_id_prefixes():
    # Test all domain prefixes
    with pytest.raises(ValidationError):
        cc.RequirementsContract(
            schema_version="4.0",
            project_id="invalid_prefix",
            mode=cc.ProjectMode.NEW_SHELTER,
            site=cc.SiteSpecification(
                latitude_deg=34.0, longitude_deg=77.0, elevation_m=3500.0,
                timezone="Asia/Kolkata", weather_source="NASA",
                analysis_start=aware_dt(2026, 1, 1), analysis_end=aware_dt(2026, 1, 2),
            ),
            mission=cc.MissionRequirements(type="living", occupants=10, required_rooms=["living"]),
            constraints=cc.DesignConstraints(),
            economic_assumption_set_id="econ_001",
        )

    with pytest.raises(ValidationError):
        cc.MaterialRecord(
            id="bad_material_id",
            display_name="Stone",
            category="masonry",
            properties=cc.MaterialThermalProperties(
                thermal_conductivity_w_mk=1.5,
                density_kg_m3=2000.0,
                specific_heat_j_kgk=800.0,
            ),
            source_reference="Ref",
            effective_date=aware_dt(2026, 1, 1),
        )

    with pytest.raises(ValidationError):
        cc.SimulationResult(
            schema_version="4.0",
            simulation_id="bad_sim_id",
            design_revision_id="rev_001",
            engine=cc.EngineMetadata(name="rc", version="1", mode=cc.SimulationEngineMode.FREE_FLOATING, timestep_seconds=900),
            status=cc.SimulationStatus.FAILED,
            provenance=cc.SimulationProvenance(
                weather_snapshot_id="wx_01", material_version="v1", code_commit="sha", created_at=aware_dt(2026, 1, 1)
            ),
        )
