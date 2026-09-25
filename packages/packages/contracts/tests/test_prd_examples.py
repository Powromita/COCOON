"""
test_prd_examples.py - Permanent regression tests asserting exact PRD example conformance.

Tests verbatim or normalized JSON payloads from:
- PRD Section 7.1 (Project & Requirements)
- PRD Section 7.2 (Generated BuildingModel)
- PRD Section 16.6 (Standard Error Envelope)
- PRD Section 22.1 (Simulation Summary Result)
- Rejection of literal 'ISO_8601' placeholder
- Rejection of generic 'conditioned' mode in SimulationRequest
"""

import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from jsonschema.validators import Draft202012Validator
from referencing import Registry, Resource

from cocoon_contracts.requirements import RequirementsContract
from cocoon_contracts.building import BuildingModel
from cocoon_contracts.errors import ErrorEnvelope
from cocoon_contracts.simulation import (
    SimulationRequest,
    SimulationResult,
    SimulationEngineMode,
    SimulationOutputEngineMode,
)

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "jsonschema"


def validate_with_persisted_schema(schema_name: str, instance: dict) -> None:
    schema_path = SCHEMA_DIR / schema_name
    schema_doc = json.loads(schema_path.read_text(encoding="utf-8"))
    resource = Resource.from_contents(schema_doc)
    registry = Registry().with_resource(schema_doc.get("$id", f"urn:{schema_name}"), resource)
    validator = Draft202012Validator(schema_doc, registry=registry)
    errors = list(validator.iter_errors(instance))
    assert not errors, f"JSON Schema validation failed for {schema_name}: {[e.message for e in errors]}"


PRD_7_1_JSON = """{
  "schema_version": "4.0",
  "project_id": "prj_uuid",
  "mode": "new_shelter",
  "site": {
    "latitude_deg": 34.1526,
    "longitude_deg": 77.5771,
    "elevation_m": 3500,
    "timezone": "Asia/Kolkata",
    "weather_source": "NASA_POWER",
    "analysis_start": "2026-01-01T00:00:00+05:30",
    "analysis_end": "2026-01-08T00:00:00+05:30"
  },
  "mission": {
    "type": "living_sleeping",
    "occupants": 30,
    "required_rooms": ["airlock", "living", "sleeping", "equipment"],
    "occupancy_schedule_id": "continuous_30",
    "target_temperature_c": 15,
    "maximum_unmet_hours": 12
  },
  "constraints": {
    "maximum_footprint_m2": 48,
    "maximum_floors": 2,
    "maximum_capex_inr": 2500000,
    "available_material_ids": ["stone", "puf", "plywood", "steel_panel"],
    "heater_fuels": ["kerosene"],
    "preferred_orientation_deg": null
  },
  "economic_assumption_set_id": "econ_ladakh_expected_v1"
}"""


PRD_7_2_JSON = """{
  "schema_version": "4.0",
  "design_id": "des_uuid",
  "revision_id": "rev_uuid",
  "source": "generated",
  "orientation_deg": 180,
  "floors": [
    {
      "id": "floor_0",
      "level": 0,
      "elevation_m": 0,
      "zones": [
        {
          "id": "airlock",
          "type": "airlock",
          "origin_m": {"x": 0, "y": 0, "z": 0},
          "size_m": {"length": 1.2, "width": 4, "height": 2.8},
          "occupancy_schedule_id": null,
          "equipment_schedule_id": null,
          "hvac_id": null
        },
        {
          "id": "living",
          "type": "living",
          "origin_m": {"x": 1.2, "y": 0, "z": 0},
          "size_m": {"length": 4.8, "width": 4, "height": 2.8},
          "occupancy_schedule_id": "continuous_20",
          "equipment_schedule_id": "living_equipment",
          "hvac_id": "heater_ground"
        }
      ]
    }
  ],
  "surfaces": [],
  "openings": [],
  "connections": [],
  "assemblies": {},
  "schedules": {},
  "metadata": {
    "generator_version": "layout_generator_v1",
    "seed": 42,
    "created_at": "2026-09-20T10:00:00Z"
  }
}"""


PRD_16_6_JSON = """{
  "error": {
    "code": "DESIGN_OUTSIDE_ML_COVERAGE",
    "message": "ML screening was skipped; RC verification was started.",
    "details": {},
    "trace_id": "uuid",
    "retryable": false
  }
}"""


PRD_22_1_NORMALIZED_JSON = """{
  "schema_version": "4.0",
  "simulation_id": "sim_uuid",
  "design_revision_id": "rev_uuid",
  "engine": {
    "name": "cocoon_multizone_rc",
    "version": "1.0.0",
    "mode": "conditioned",
    "timestep_seconds": 900
  },
  "status": "completed",
  "summary": {
    "heating_energy_kwh": 0,
    "peak_heating_kw": 0,
    "occupied_comfort_hours": 0,
    "unmet_hours": 0,
    "energy_residual_max_pct": 0
  },
  "zones": [
    {
      "zone_id": "living",
      "temperature_min_c": 0,
      "temperature_mean_c": 0,
      "temperature_max_c": 0,
      "comfort_hours": 0
    }
  ],
  "provenance": {
    "weather_snapshot_id": "wx_uuid",
    "material_version": "materials_v1",
    "code_commit": "git_sha",
    "created_at": "2026-09-20T10:00:00Z"
  }
}"""


PRD_22_1_LITERAL_PLACEHOLDER_JSON = """{
  "schema_version": "4.0",
  "simulation_id": "sim_uuid",
  "design_revision_id": "rev_uuid",
  "engine": {
    "name": "cocoon_multizone_rc",
    "version": "1.0.0",
    "mode": "conditioned",
    "timestep_seconds": 900
  },
  "status": "completed",
  "summary": {
    "heating_energy_kwh": 0,
    "peak_heating_kw": 0,
    "occupied_comfort_hours": 0,
    "unmet_hours": 0,
    "energy_residual_max_pct": 0
  },
  "zones": [
    {
      "zone_id": "living",
      "temperature_min_c": 0,
      "temperature_mean_c": 0,
      "temperature_max_c": 0,
      "comfort_hours": 0
    }
  ],
  "provenance": {
    "weather_snapshot_id": "wx_uuid",
    "material_version": "materials_v1",
    "code_commit": "git_sha",
    "created_at": "ISO_8601"
  }
}"""


def test_prd_7_1_requirements_verbatim():
    """PRD Section 7.1 project and requirements example must validate verbatim."""
    req = RequirementsContract.model_validate_json(PRD_7_1_JSON)
    assert req.schema_version == "4.0"
    assert req.project_id == "prj_uuid"
    assert req.site.elevation_m == 3500
    assert req.mission.occupants == 30
    assert req.constraints.maximum_footprint_m2 == 48

    validate_with_persisted_schema("requirements.schema.json", json.loads(PRD_7_1_JSON))


def test_prd_7_2_building_model_verbatim():
    """PRD Section 7.2 generated building model example must validate verbatim."""
    bm = BuildingModel.model_validate_json(PRD_7_2_JSON)
    assert bm.schema_version == "4.0"
    assert bm.design_id == "des_uuid"
    assert len(bm.floors) == 1
    assert len(bm.floors[0].zones) == 2
    assert bm.floors[0].zones[0].size_m.length_m == 1.2
    assert bm.floors[0].zones[1].size_m.length_m == 4.8

    # Once parsed into the canonical model, its serialized output strictly matches building.schema.json
    validate_with_persisted_schema("building.schema.json", bm.model_dump(mode="json"))


def test_prd_16_6_error_envelope_verbatim():
    """PRD Section 16.6 standard error envelope must validate verbatim."""
    env = ErrorEnvelope.model_validate_json(PRD_16_6_JSON)
    assert env.error.code == "DESIGN_OUTSIDE_ML_COVERAGE"
    assert env.error.retryable is False

    validate_with_persisted_schema("error.schema.json", json.loads(PRD_16_6_JSON))


def test_prd_22_1_simulation_result_normalized():
    """PRD Section 22.1 simulation summary example with normalized timestamp must validate."""
    res = SimulationResult.model_validate_json(PRD_22_1_NORMALIZED_JSON)
    assert res.schema_version == "4.0"
    assert res.simulation_id == "sim_uuid"
    assert res.engine.mode == SimulationOutputEngineMode.CONDITIONED
    assert res.status.value == "completed"

    validate_with_persisted_schema("simulation.schema.json", json.loads(PRD_22_1_NORMALIZED_JSON))


def test_prd_22_1_literal_placeholder_rejected():
    """PRD Section 22.1 literal 'ISO_8601' placeholder must be rejected by AwareDatetime."""
    with pytest.raises(ValidationError) as excinfo:
        SimulationResult.model_validate_json(PRD_22_1_LITERAL_PLACEHOLDER_JSON)

    errors = excinfo.value.errors()
    assert any("created_at" in str(e["loc"]) for e in errors)


def test_simulation_request_rejects_generic_conditioned_mode():
    """SimulationRequest must reject generic 'conditioned' and require explicit solver mode."""
    req_json = {
        "schema_version": "4.0",
        "request_id": "sim_req_001",
        "design_revision_id": "rev_test",
        "weather_snapshot_id": "wx_test",
        "engine": {
            "name": "cocoon_multizone_rc",
            "version": "1.0.0",
            "mode": "conditioned",  # FORBIDDEN in request
            "timestep_seconds": 900
        },
        "time_window_start": "2026-01-01T00:00:00+05:30",
        "time_window_end": "2026-01-08T00:00:00+05:30"
    }

    with pytest.raises(ValidationError) as excinfo:
        SimulationRequest.model_validate(req_json)

    errors = excinfo.value.errors()
    assert any(e["loc"] == ("engine", "mode") for e in errors)
