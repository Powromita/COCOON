"""
test_valid_fixtures.py - Validates that all valid JSON fixtures conform to Pydantic v2 models
and compiled JSON Schema Draft 2020-12 specifications.
"""

from __future__ import annotations

import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

import cocoon_contracts as cc

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "valid"
SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "jsonschema"

FIXTURE_MODEL_SCHEMA_MAP = [
    ("project_active.json", cc.Project, "project.schema.json"),
    ("requirements_ladakh_30p.json", cc.RequirementsContract, "requirements.schema.json"),
    ("building_airlock_living.json", cc.BuildingModel, "building.schema.json"),
    ("building_two_floor_compact.json", cc.BuildingModel, "building.schema.json"),
    ("weather_snapshot_leh.json", cc.WeatherSnapshot, "weather.schema.json"),
    ("material_snapshot_standard.json", cc.MaterialSnapshot, "material.schema.json"),
    ("simulation_request.json", cc.SimulationRequest, "simulation-request.schema.json"),
    ("simulation_result_completed.json", cc.SimulationResult, "simulation.schema.json"),
    ("simulation_result_normalized_prd.json", cc.SimulationResult, "simulation.schema.json"),
    ("economics_lifecycle_result.json", cc.EconomicAnalysisResult, "economics.schema.json"),
    ("ansys_job_queued.json", cc.AnsysJobRequest, "ansys-job.schema.json"),
    ("ansys_validation_completed.json", cc.AnsysValidationResult, "ansys-validation.schema.json"),
    ("ansys_validation_unavailable.json", cc.AnsysValidationResult, "ansys-validation.schema.json"),
    ("visualization_model.json", cc.VisualizationModel, "visualization.schema.json"),
    ("error_envelope_ml_fallback.json", cc.ErrorEnvelope, "error.schema.json"),
]


@pytest.mark.parametrize("filename,model_cls,schema_name", FIXTURE_MODEL_SCHEMA_MAP)
def test_valid_fixture_pydantic(filename: str, model_cls: type[cc.ContractModel], schema_name: str | None) -> None:
    fixture_path = FIXTURES_DIR / filename
    assert fixture_path.exists(), f"Fixture file not found: {fixture_path}"

    with fixture_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # 1. Pydantic validation
    instance = model_cls.model_validate(data)
    assert instance is not None
    if hasattr(instance, "schema_version"):
        assert instance.schema_version == "4.0"

    # 2. JSON Schema Draft 2020-12 validation (against persisted schema)
    if schema_name is not None:
        schema_path = SCHEMAS_DIR / schema_name
        assert schema_path.exists(), f"Schema file not found: {schema_path}"

        with schema_path.open("r", encoding="utf-8") as f:
            schema_doc = json.load(f)

        resource = Resource.from_contents(schema_doc)
        registry = Registry().with_resource(schema_doc.get("$id", f"urn:{schema_name}"), resource)
        validator = Draft202012Validator(schema_doc, registry=registry)
        errors = list(validator.iter_errors(data))
        assert not errors, f"JSON Schema validation failed for {filename} against {schema_name}: {[e.message for e in errors]}"
