"""The client-facing catalogue and compatibility check (catalog.py) against M2's own sources of truth."""

from __future__ import annotations

import copy
import json

import pytest
from cocoon_contracts.materials import MaterialSnapshot

from design_generator import generate_designs
from design_generator.candidate_generator import GenerationOptions, NoTemplateError, fitting_templates
from design_generator.catalog import (catalog_version, check_compatibility, describe_catalog, describe_template,
                                      material_support, template_hash)
from design_generator.requirement_parser import DEFAULT_SIZING, parse_requirements
from design_generator.template_catalog import TEMPLATE_DIR, list_templates

from .conftest import load_fixture


@pytest.fixture
def snapshot() -> MaterialSnapshot:
    return MaterialSnapshot.model_validate(load_fixture("material_snapshot_standard.json"))


def small_request(rooms: list[str], occupants: int = 4, floors: int = 1, footprint: float | None = 60.0) -> dict:
    req = load_fixture("requirements_ladakh_30p.json")
    req["mission"].update(required_rooms=rooms, occupants=occupants)
    req["constraints"].update(maximum_floors=floors, maximum_footprint_m2=footprint, maximum_mass_kg=None,
                              available_material_ids=["mat_plywood", "mat_puf"])
    return req


# ----- catalogue accuracy -----------------------------------------------------------------------------------------
def test_catalogue_lists_exactly_the_template_files(snapshot):
    cat = describe_catalog([snapshot])
    assert [t["id"] for t in cat["templates"]] == sorted(p.stem for p in TEMPLATE_DIR.glob("*.json"))
    for t, src in zip(cat["templates"], list_templates()):
        assert t["name"] == src.name and t["floor_count"] == src.floor_count
        assert t["airlock_required"] == src.rules.airlock_between_outdoors_and_primary
        assert sorted(r["id"] for r in t["rooms"]) == sorted(r.id for r in src.rooms)


def test_shared_functions_come_from_serves_and_exclude_own_rooms():
    by_id = {t.id: describe_template(t) for t in list_templates()}
    assert by_id["airlock_living"]["shared_functions"] == {"equipment": ["living"], "sleeping": ["living"], "storage": ["living"]}
    assert by_id["airlock_living_equipment"]["shared_functions"]["storage"] == ["equipment", "living"]
    assert by_id["two_floor_compact"]["shared_functions"] == {}
    for t in by_id.values():
        assert not set(t["shared_functions"]) & set(t["dedicated_functions"])


def test_room_types_and_sizing_are_the_parser_rules():
    cat = describe_catalog()
    assert [r["type"] for r in cat["room_types"]] == sorted(DEFAULT_SIZING.rules)
    for r in cat["room_types"]:
        rule = DEFAULT_SIZING.rules[r["type"]]
        assert (r["min_area_fixed_m2"], r["min_area_per_person_m2"], r["min_dimension_m"]) == (
            rule.fixed_m2, rule.per_person_m2, rule.min_dimension_m)
    sleeping = next(r for r in cat["room_types"] if r["type"] == "sleeping")
    assert "airlock_living" in sleeping["shared_in"] and "two_floor_compact" in sleeping["dedicated_in"]


def test_catalogue_version_is_stable_and_tracks_template_content(tmp_path):
    same, edited = tmp_path / "same", tmp_path / "edited"          # templates are cached per directory, so two folders
    for d in (same, edited):
        d.mkdir()
        for p in TEMPLATE_DIR.glob("*.json"):
            (d / p.name).write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
    assert catalog_version() == catalog_version() == catalog_version(same)
    raw = json.loads((edited / "single_room.json").read_text(encoding="utf-8"))
    raw["description"] += " (edited)"
    (edited / "single_room.json").write_text(json.dumps(raw), encoding="utf-8")
    assert catalog_version(edited) != catalog_version()
    old = next(t for t in list_templates() if t.id == "single_room")
    new = next(t for t in list_templates(edited) if t.id == "single_room")
    assert template_hash(new) != template_hash(old)


def test_material_roles_follow_the_generator_pool(snapshot):
    roles = {m["id"]: m["role"] for m in material_support(snapshot)}
    assert roles["mat_puf"] == "insulation" and roles["mat_plywood"] == "structural"
    for m in material_support(snapshot):
        assert (m["role"] is None) == (m["elements"] == [])


# ----- compatibility -----------------------------------------------------------------------------------------------
def test_single_compatible_template_for_the_ladakh_fixture(snapshot, requirements_ladakh):
    r = check_compatibility(requirements_ladakh, snapshot)
    assert r["ok"] and r["compatible_template_ids"] == ["two_floor_compact"]
    assert r["preliminary"] is True and r["catalog_version"] == catalog_version()
    assert {w["code"] for w in r["warnings"]} == {"MATERIAL_NOT_IN_SNAPSHOT", "MASS_CHECKED_AT_GENERATION"}


def test_compatible_set_equals_what_generation_would_use(snapshot):
    for rooms in (["living"], ["living", "sleeping"], ["airlock", "living", "equipment"], ["command"], ["medical", "storage"]):
        req = small_request(rooms, floors=2)
        compat = check_compatibility(req, snapshot)
        gen = {m.template.id for m in fitting_templates(parse_requirements(req))}
        assert set(compat["compatible_template_ids"]) == gen, rooms


def test_multiple_compatible_templates(snapshot):
    r = check_compatibility(small_request(["living", "sleeping"]), snapshot)
    assert set(r["compatible_template_ids"]) >= {"airlock_living", "living_sleeping_storage", "single_room"}


def test_no_compatible_template_names_the_missing_rooms(snapshot):
    # only the multipurpose single room serves both; asking for both as separate rooms leaves nothing
    r = check_compatibility(small_request(["medical", "command"]), snapshot,
                            room_arrangement={"medical": "dedicated", "command": "dedicated"})
    assert not r["ok"] and r["compatible_template_ids"] == []
    assert r["conflicts"][0]["code"] == "NO_COMPATIBLE_TEMPLATE"
    medical = next(t for t in r["templates"] if t["template_id"] == "medical_post")
    assert medical["issues"][0]["details"]["missing_room_types"] == ["command"]
    single = next(t for t in r["templates"] if t["template_id"] == "single_room")
    assert single["issues"][0]["code"] == "SHARED_NOT_DEDICATED"


def test_dedicated_and_shared_arrangements_filter_templates(snapshot):
    req = small_request(["living", "sleeping"])
    dedicated = check_compatibility(req, snapshot, room_arrangement={"sleeping": "dedicated"})
    shared = check_compatibility(req, snapshot, room_arrangement={"sleeping": "shared"})
    assert set(dedicated["compatible_template_ids"]) == {"living_sleeping_storage"}
    assert set(shared["compatible_template_ids"]) == {"airlock_living", "airlock_living_equipment", "single_room"}
    al = next(t for t in dedicated["templates"] if t["template_id"] == "airlock_living")
    assert al["issues"][0]["code"] == "SHARED_NOT_DEDICATED"


def test_unsupported_dedicated_room_has_no_template(snapshot):
    # no template has a separate equipment room together with a medical room
    r = check_compatibility(small_request(["medical", "equipment"]), snapshot, room_arrangement={"equipment": "dedicated"})
    assert r["compatible_template_ids"] == [] and not r["ok"]


def test_footprint_infeasibility_reports_numbers_and_verified_alternatives(snapshot, requirements_ladakh):
    req = copy.deepcopy(requirements_ladakh)
    req["constraints"]["maximum_footprint_m2"] = 20.0
    r = check_compatibility(req, snapshot)
    assert not r["ok"] and r["conflicts"][0]["code"] == "INFEASIBLE_REQUIREMENTS"
    assert r["spec"]["required_total_area_m2"] == pytest.approx(77.0)
    alt = {a["template_id"]: a["change"] for a in r["alternatives"]}
    assert alt["two_floor_compact"] == {"constraints.maximum_footprint_m2": 41.5}
    req["constraints"]["maximum_footprint_m2"] = 41.5            # the suggestion really is enough
    assert check_compatibility(req, snapshot)["ok"]
    req["constraints"]["maximum_footprint_m2"] = 41.4            # and it is the smallest on the 0.1 m2 grid
    assert not check_compatibility(req, snapshot)["ok"]


def test_floor_limit_suggests_more_floors_only_when_that_fits(snapshot, requirements_ladakh):
    req = copy.deepcopy(requirements_ladakh)
    req["constraints"]["maximum_floors"] = 1
    r = check_compatibility(req, snapshot)
    alt = {a["template_id"]: a["change"] for a in r["alternatives"]}
    assert alt["two_floor_compact"] == {"constraints.maximum_floors": 2}


def test_materials_without_a_structural_layer_are_incompatible(snapshot):
    req = small_request(["living"])
    req["constraints"]["available_material_ids"] = ["mat_puf"]
    r = check_compatibility(req, snapshot)
    assert r["compatible_template_ids"] == []
    assert all(any(i["code"] == "NO_STRUCTURAL_MATERIAL" for i in t["issues"])
               for t in r["templates"] if t["provided_by"])


def test_invalid_and_incomplete_input_is_reported_not_raised(snapshot):
    r = check_compatibility({"mission": {"type": "x", "occupants": 2, "required_rooms": ["living", "garage"]}}, snapshot)
    assert not r["ok"] and r["input_errors"]                       # site, project_id ... missing
    assert r["conflicts"][0]["code"] == "UNKNOWN_ROOM_TYPE" and r["conflicts"][0]["field"] == "mission.required_rooms"
    r = check_compatibility({"mission": {"type": "x", "occupants": -1, "required_rooms": []}}, snapshot)
    assert any(e["field"] == "mission.occupants" for e in r["input_errors"])


def test_pinned_template_must_be_compatible(snapshot, requirements_ladakh):
    assert check_compatibility(requirements_ladakh, snapshot, template_id="two_floor_compact")["selected_template_ids"] == [
        "two_floor_compact"]
    r = check_compatibility(requirements_ladakh, snapshot, template_id="airlock_living")
    assert not r["ok"] and r["conflicts"][-1]["code"] == "TEMPLATE_NOT_COMPATIBLE"
    assert "usable" in r["conflicts"][-1]["message"]
    assert check_compatibility(requirements_ladakh, snapshot, template_id="nope")["conflicts"][-1]["code"] == "UNKNOWN_TEMPLATE"


# ----- generation with a template pin ------------------------------------------------------------------------------
def test_generation_uses_only_the_pinned_templates(snapshot):
    req = small_request(["living", "sleeping"])
    res = generate_designs(req, snapshot, seed=3, count=4, options=GenerationOptions(template_ids=("single_room",)))
    assert res.candidates and {c.extras["template_id"] for c in res.candidates} == {"single_room"}
    assert all(c.report.ok for c in res.candidates)


def test_generation_refuses_a_pinned_template_that_does_not_fit(snapshot):
    req = small_request(["living", "sleeping"])
    with pytest.raises(NoTemplateError) as exc:
        generate_designs(req, snapshot, seed=3, count=2, options=GenerationOptions(template_ids=("medical_post",)))
    assert exc.value.details["not_fitting"] == ["medical_post"]


def test_unpinned_generation_is_unchanged(snapshot, requirements_ladakh):
    a = generate_designs(requirements_ladakh, snapshot, seed=7, count=3)
    b = generate_designs(requirements_ladakh, snapshot, seed=7, count=3, options=GenerationOptions(template_ids=None))
    assert [c.building.revision_id for c in a.candidates] == [c.building.revision_id for c in b.candidates]


def test_zero_valid_candidates_is_returned_with_reasons(snapshot):
    req = small_request(["living"])
    req["constraints"]["maximum_mass_kg"] = 1.0                    # no real envelope weighs under a kilogram
    res = generate_designs(req, snapshot, seed=1, count=2, options=GenerationOptions(max_attempts=10))
    assert res.candidates == () and not res.complete and res.attempts == 10
    assert res.reasons.get("constraints:envelope_mass_within_limit", 0) > 0
