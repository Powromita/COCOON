#!/usr/bin/env python3
"""
check_fixtures.py - Validates all fixtures in packages/contracts/fixtures/ against
both Pydantic v2 models and compiled JSON Schema Draft 2020-12 specifications.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Ensure cocoon_contracts is importable
HERE = Path(__file__).resolve().parent
CONTRACTS_ROOT = HERE.parent
PYTHON_DIR = CONTRACTS_ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from pydantic import ValidationError

import cocoon_contracts as cc

SCHEMA_MAP: dict[str, tuple[type[cc.ContractModel], str]] = {
    "project_active.json": (cc.Project, "project.schema.json"),
    "requirements_ladakh_30p.json": (cc.RequirementsContract, "requirements.schema.json"),
    "building_airlock_living.json": (cc.BuildingModel, "building.schema.json"),
    "building_two_floor_compact.json": (cc.BuildingModel, "building.schema.json"),
    "weather_snapshot_leh.json": (cc.WeatherSnapshot, "weather.schema.json"),
    "material_snapshot_standard.json": (cc.MaterialSnapshot, "material.schema.json"),
    "simulation_request.json": (cc.SimulationRequest, "simulation-request.schema.json"),
    "simulation_result_completed.json": (cc.SimulationResult, "simulation.schema.json"),
    "simulation_result_normalized_prd.json": (cc.SimulationResult, "simulation.schema.json"),
    "economics_lifecycle_result.json": (cc.EconomicAnalysisResult, "economics.schema.json"),
    "ansys_job_queued.json": (cc.AnsysJobRequest, "ansys-job.schema.json"),
    "ansys_validation_completed.json": (cc.AnsysValidationResult, "ansys-validation.schema.json"),
    "ansys_validation_unavailable.json": (cc.AnsysValidationResult, "ansys-validation.schema.json"),
    "visualization_model.json": (cc.VisualizationModel, "visualization.schema.json"),
    "error_envelope_ml_fallback.json": (cc.ErrorEnvelope, "error.schema.json"),
}

INVALID_MODEL_MAP: dict[str, type[cc.ContractModel]] = {
    "invalid_project_id_prefix.json": cc.Project,
    "invalid_missing_schema_version.json": cc.RequirementsContract,
    "invalid_orientation_out_of_bounds.json": cc.RequirementsContract,
    "invalid_naive_timestamp.json": cc.RequirementsContract,
    "invalid_negative_zone_dimension.json": cc.BuildingModel,
    "invalid_duplicate_zone_id.json": cc.BuildingModel,
    "invalid_surface_missing_owner.json": cc.BuildingModel,
    "invalid_surface_missing_assembly.json": cc.BuildingModel,
    "invalid_partition_outdoor_boundary.json": cc.BuildingModel,
    "invalid_surface_self_adjacency.json": cc.BuildingModel,
    "invalid_opening_missing_parent.json": cc.BuildingModel,
    "invalid_duplicate_weather_timestamp.json": cc.WeatherSnapshot,
    "invalid_material_negative_conductivity.json": cc.MaterialSnapshot,
    "invalid_simulation_request_mode.json": cc.SimulationRequest,
    "invalid_cross_revision_mismatch.json": cc.SimulationResult,
    "invalid_economics_negative_lcc.json": cc.EconomicAnalysisResult,
    "invalid_ansys_imposed_indoor_temp.json": cc.AnsysJobRequest,
    "invalid_ansys_completed_no_artifacts.json": cc.AnsysValidationResult,
    "invalid_visualization_missing_revision.json": cc.VisualizationModel,
    "invalid_error_envelope_code.json": cc.ErrorEnvelope,
}


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def check_valid_fixtures() -> bool:
    valid_dir = CONTRACTS_ROOT / "fixtures" / "valid"
    schema_dir = CONTRACTS_ROOT / "jsonschema"
    all_passed = True

    print("\n--- Validating Valid Fixtures ---")
    for file_path in sorted(valid_dir.glob("*.json")):
        name = file_path.name
        if name not in SCHEMA_MAP:
            print(f"  [WARN] Fixture not in mapping: {name}")
            all_passed = False
            continue

        model_cls, schema_file = SCHEMA_MAP[name]
        data = load_json(file_path)

        # 1. Pydantic validation
        try:
            instance = model_cls.model_validate(data)
            print(f"  [PASS Pydantic] {name} ({model_cls.__name__})")
        except ValidationError as err:
            print(f"  [FAIL Pydantic] {name}: {err}")
            all_passed = False
            continue

        # 2. JSON Schema validation
        if schema_file:
            schema_path = schema_dir / schema_file
            if schema_path.exists():
                schema = load_json(schema_path)
                resource = Resource.from_contents(schema)
                registry = Registry().with_resource(schema.get("$id", f"urn:{schema_file}"), resource)
                validator = Draft202012Validator(schema, registry=registry)
                errors = list(validator.iter_errors(data))
                if errors:
                    print(f"  [FAIL Schema] {name} against {schema_file}:")
                    for e in errors[:3]:
                        print(f"    -> {e.message} at {e.json_path}")
                    all_passed = False
                else:
                    print(f"  [PASS Schema]   {name} ({schema_file})")
            else:
                print(f"  [WARN Schema] Schema not found on disk: {schema_file}")
                all_passed = False

    return all_passed


def check_invalid_fixtures() -> bool:
    invalid_dir = CONTRACTS_ROOT / "fixtures" / "invalid"
    all_passed = True

    print("\n--- Validating Invalid Fixtures (Must Fail) ---")
    for file_path in sorted(invalid_dir.glob("*.json")):
        name = file_path.name
        if name not in INVALID_MODEL_MAP:
            print(f"  [WARN] Invalid fixture not in mapping: {name}")
            all_passed = False
            continue

        model_cls = INVALID_MODEL_MAP[name]
        data = load_json(file_path)

        try:
            model_cls.model_validate(data)
            print(f"  [FAIL] {name} passed validation unexpectedly!")
            all_passed = False
        except ValidationError as err:
            first_err = str(err).splitlines()[0] if str(err) else "Validation failed"
            print(f"  [PASS] {name} correctly failed: {first_err[:70]}...")

    return all_passed


def main() -> None:
    valid_ok = check_valid_fixtures()
    invalid_ok = check_invalid_fixtures()

    if valid_ok and invalid_ok:
        print("\nAll fixture validation checks passed successfully!")
        sys.exit(0)
    else:
        print("\nFixture validation checks failed!", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
