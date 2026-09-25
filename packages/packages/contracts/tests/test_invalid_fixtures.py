"""
test_invalid_fixtures.py - Verifies that invalid fixtures fail validation for expected reasons,
asserting the model, the exact failure type or message, and the targeted JSON path.
"""

from __future__ import annotations

import json
from pathlib import Path
import pytest
from pydantic import ValidationError

import cocoon_contracts as cc

INVALID_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "invalid"

INVALID_FIXTURES = [
    # (filename, model_cls, expected_path_tuple, expected_error_substr)
    ("invalid_project_id_prefix.json", cc.Project, ("project_id",), "must start with 'prj_'"),
    ("invalid_missing_schema_version.json", cc.RequirementsContract, ("schema_version",), "Field required"),
    ("invalid_orientation_out_of_bounds.json", cc.RequirementsContract, ("constraints", "preferred_orientation_deg"), "less than or equal to 360"),
    ("invalid_naive_timestamp.json", cc.RequirementsContract, ("site", "analysis_start"), "must be timezone-aware"),
    ("invalid_negative_zone_dimension.json", cc.BuildingModel, ("floors", 0, "zones", 0, "size_m", "length_m"), "greater than 0"),
    ("invalid_duplicate_zone_id.json", cc.BuildingModel, (), "Duplicate zone ID found across floors"),
    ("invalid_surface_missing_owner.json", cc.BuildingModel, (), "references non-existent owning zone"),
    ("invalid_surface_missing_assembly.json", cc.BuildingModel, (), "which is not defined in assemblies"),
    ("invalid_partition_outdoor_boundary.json", cc.BuildingModel, (), "Partitions must be 'adjacent_zone' or 'adiabatic'"),
    ("invalid_surface_self_adjacency.json", cc.BuildingModel, (), "cannot reference its own owning zone"),
    ("invalid_opening_missing_parent.json", cc.BuildingModel, (), "references non-existent parent surface"),
    ("invalid_duplicate_weather_timestamp.json", cc.WeatherSnapshot, ("hourly_data",), "Duplicate weather timestamp detected"),
    ("invalid_material_negative_conductivity.json", cc.MaterialSnapshot, ("materials", "mat_stone", "properties", "thermal_conductivity_w_mk"), "greater than 0"),
    ("invalid_simulation_request_mode.json", cc.SimulationRequest, ("engine", "mode"), "Input should be 'free_floating', 'ideal_load_conditioned' or 'capacity_limited_conditioned'"),
    ("invalid_cross_revision_mismatch.json", cc.SimulationResult, ("design_revision_id",), "must start with 'rev_'"),
    ("invalid_economics_negative_lcc.json", cc.EconomicAnalysisResult, ("lcc_inr",), "greater than or equal to 0"),
    ("invalid_ansys_imposed_indoor_temp.json", cc.AnsysJobRequest, ("imposed_indoor_temperature_c",), "Extra inputs are not permitted"),
    ("invalid_ansys_completed_no_artifacts.json", cc.AnsysValidationResult, (), "must include an AnsysArtifactManifest"),
    ("invalid_visualization_missing_revision.json", cc.VisualizationModel, ("design_revision_id",), "must start with 'rev_'"),
    ("invalid_error_envelope_code.json", cc.ErrorEnvelope, ("error", "code"), "Input should be 'VALIDATION_ERROR'"),
]


@pytest.mark.parametrize("filename,model_cls,expected_path,expected_error_substr", INVALID_FIXTURES)
def test_invalid_fixture_fails(
    filename: str,
    model_cls: type[cc.ContractModel],
    expected_path: tuple,
    expected_error_substr: str,
) -> None:
    fixture_path = INVALID_DIR / filename
    assert fixture_path.exists(), f"Invalid fixture file not found: {fixture_path}"

    with fixture_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    with pytest.raises(ValidationError) as exc_info:
        model_cls.model_validate(data)

    errors = exc_info.value.errors()
    assert errors, f"Expected validation errors for {filename} but got none"

    # Verify that at least one error matches the expected path (or prefix) and error substring
    matched = False
    for err in errors:
        loc = err["loc"]
        msg = err["msg"]
        path_matches = True
        if expected_path:
            path_matches = loc[: len(expected_path)] == expected_path
        msg_matches = expected_error_substr.lower() in msg.lower()
        if path_matches and msg_matches:
            matched = True
            break

    assert matched, (
        f"Fixture {filename} failed, but did not match expected path {expected_path} "
        f"and substring '{expected_error_substr}'. Actual errors: {[(e['loc'], e['msg']) for e in errors]}"
    )
