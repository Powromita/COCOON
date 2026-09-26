"""Stage 9 tests: the public interface and the error envelope."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from cocoon_contracts.errors import ErrorCode, ErrorEnvelope
from pydantic import ValidationError

import design_generator as m2
from design_generator import (
    GenerationOptions,
    GenerationResult,
    NoTemplateError,
    SizingTable,
    UserGeometryError,
    generate_designs,
    to_error_envelope,
)
from design_generator.candidate_generator import GenerationError
from design_generator.layout_generator import NoFeasibleLayoutError
from design_generator.requirement_parser import DEFAULT_SIZING, InfeasibleRequirementsError, RoomSizingRule, parse_requirements
from design_generator.tests.conftest import load_fixture

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_the_public_surface_is_exactly_what_the_docstring_promises():
    assert set(m2.__all__) == {
        "generate_designs", "resolve_user_geometry", "to_error_envelope",
        "GenerationResult", "Candidate", "RejectedCandidate", "UserGeometryResult", "UserShelter", "TopologyReport",
        "GenerationOptions", "SizingTable",
        "GenerationError", "NoTemplateError", "RequirementError", "UserGeometryError", "__version__"}
    for name in m2.__all__:
        assert hasattr(m2, name), name
    assert not hasattr(m2, "generate_candidates")                    # only reachable under its private alias
    assert m2.__version__ == "1.0.0"


def test_generate_designs_accepts_the_contract_objects_and_dicts():
    from cocoon_contracts.materials import MaterialSnapshot
    from cocoon_contracts.requirements import RequirementsContract
    req, snap = load_fixture("requirements_ladakh_30p.json"), load_fixture("material_snapshot_standard.json")
    a = generate_designs(req, snap, seed=3, count=2, created_at=T0)
    b = generate_designs(RequirementsContract.model_validate(req), MaterialSnapshot.model_validate(snap),
                         seed=3, count=2, created_at=T0)
    assert isinstance(a, GenerationResult) and a.complete
    dump = lambda r: [c.building.model_dump(mode="json") for c in r.candidates]
    assert dump(a) == dump(b)


def test_options_and_sizing_are_passed_through():
    req, snap = load_fixture("requirements_ladakh_30p.json"), load_fixture("material_snapshot_standard.json")
    limited = generate_designs(req, snap, seed=1, count=50, created_at=T0, options=GenerationOptions(max_attempts=3))
    assert limited.attempts == 3 and not limited.complete
    rules = dict(DEFAULT_SIZING.rules)
    rules["sleeping"] = RoomSizingRule(fixed_m2=0.0, per_person_m2=0.5, min_dimension_m=2.4)
    roomy = generate_designs(req, snap, seed=1, count=1, created_at=T0, sizing=SizingTable(rules=rules))
    assert roomy.complete
    sleeping = roomy.candidates[0].layout.zone("sleeping")
    assert sleeping.length_m * sleeping.width_m >= 0.5 * 30            # the custom (smaller) rule was the minimum used


def test_incomplete_results_are_returned_not_raised():
    req = load_fixture("requirements_ladakh_30p.json")
    req["constraints"]["maximum_mass_kg"] = 500.0
    res = generate_designs(req, load_fixture("material_snapshot_standard.json"), seed=1, count=2, created_at=T0,
                           options=GenerationOptions(attempts_per_candidate=4))
    assert res.candidates == () and not res.complete and res.reasons


# ------------------------------------------------------------------ error envelope
def _envelope(exc, **kw) -> ErrorEnvelope:
    env = to_error_envelope(exc, **kw)
    ErrorEnvelope.model_validate(env.model_dump(mode="json"))          # round-trips through the contract
    return env


def test_real_errors_map_to_contract_codes():
    req = load_fixture("requirements_ladakh_30p.json")
    req["constraints"]["maximum_footprint_m2"] = 10.0
    with pytest.raises(InfeasibleRequirementsError) as e1:
        parse_requirements(req)
    env = _envelope(e1.value, trace_id="abc")
    assert env.error.code == ErrorCode.VALIDATION_ERROR and env.error.trace_id == "abc"
    assert env.error.details["m2_code"] == "INFEASIBLE_REQUIREMENTS"
    assert env.error.details["required_total_area_m2"] > 0                 # the numbers travel with it
    assert env.error.retryable is False and env.error.message == str(e1.value)

    req2 = load_fixture("requirements_ladakh_30p.json")
    req2["constraints"].update(maximum_floors=1, maximum_footprint_m2=100.0)
    req2["mission"]["required_rooms"] = ["airlock", "command", "medical"]
    with pytest.raises(NoTemplateError) as e2:
        generate_designs(req2, load_fixture("material_snapshot_standard.json"), seed=1, count=1)
    assert _envelope(e2.value).error.code == ErrorCode.VALIDATION_ERROR
    assert _envelope(e2.value).error.details["m2_code"] == "NO_TEMPLATE_FITS"


@pytest.mark.parametrize("m2_code, expected", [
    ("NO_FEASIBLE_LAYOUT", ErrorCode.ZONE_GEOMETRY_INVALID), ("OFF_GRID", ErrorCode.ZONE_GEOMETRY_INVALID),
    ("ZONES_OVERLAP", ErrorCode.ZONE_GEOMETRY_INVALID), ("DOOR_DOES_NOT_FIT", ErrorCode.ZONE_GEOMETRY_INVALID),
    ("DUPLICATE_ZONE_ID", ErrorCode.DUPLICATE_ID), ("UNKNOWN_ZONE", ErrorCode.MISSING_REFERENCE),
    ("MISSING_ASSEMBLY", ErrorCode.MISSING_REFERENCE), ("UNKNOWN_MATERIAL", ErrorCode.UNSUPPORTED_MATERIAL),
    ("MATERIAL_NOT_IN_SNAPSHOT", ErrorCode.UNSUPPORTED_MATERIAL), ("USER_INPUT_INVALID", ErrorCode.VALIDATION_ERROR),
    ("UNSUPPORTED_MODE", ErrorCode.VALIDATION_ERROR), ("SOMETHING_NEW", ErrorCode.VALIDATION_ERROR)])
def test_code_mapping(m2_code, expected):
    exc = UserGeometryError("boom", m2_code, {"k": 1})
    env = _envelope(exc)
    assert env.error.code == expected and env.error.details == {"m2_code": m2_code, "k": 1}


def test_foreign_and_pydantic_errors_are_wrapped():
    env = _envelope(ValueError("plain"))
    assert env.error.code == ErrorCode.VALIDATION_ERROR and env.error.details["m2_code"] == "ValueError"
    with pytest.raises(ValidationError) as pe:
        m2.UserShelter.model_validate({})
    assert _envelope(pe.value).error.code == ErrorCode.VALIDATION_ERROR
    assert _envelope(NoFeasibleLayoutError("x", {"reasons": {"a": 1}})).error.details["reasons"] == {"a": 1}


def test_trace_id_is_generated_and_details_are_json_safe():
    env = _envelope(GenerationError("g", {"when": T0, "n": 1}))
    assert len(env.error.trace_id) >= 32
    json.dumps(env.model_dump(mode="json"))
    assert isinstance(env.error.details["when"], str)
