"""Stage 2 tests: requirement parsing and feasibility."""

from __future__ import annotations

import copy
from dataclasses import replace

import pytest

from design_generator.requirement_parser import (
    DEFAULT_SIZING,
    InfeasibleRequirementsError,
    InvalidRoomListError,
    RoomSizingRule,
    UnknownRoomTypeError,
    UnsupportedModeError,
    parse_requirements,
)


def _variant(req, **changes):
    r = copy.deepcopy(req)
    for path, value in changes.items():
        section, key = path.split("__")
        r[section][key] = value
    return r


def test_ladakh_room_areas_match_hand_calculation(requirements_ladakh):
    spec = parse_requirements(requirements_ladakh)
    # 30 occupants: sleeping 1.2*30, living 0.8*30, equipment 4+0.1*30, airlock fixed 3
    assert {r.room_type: r.min_area_m2 for r in spec.rooms} == {
        "airlock": 3.0,
        "living": 24.0,
        "sleeping": 36.0,
        "equipment": 7.0,
    }
    assert spec.room_area_sum_m2 == 70.0
    assert spec.required_total_area_m2 == pytest.approx(70.0 * 1.10)
    assert spec.room("sleeping").min_dimension_m == 2.4


def test_ladakh_only_two_floors_fit(requirements_ladakh):
    spec = parse_requirements(requirements_ladakh)
    # 1 floor: 48 m2 usable < 77.0 needed. 2 floors: 96 - 2*3 = 90 >= 77.0
    assert spec.usable_area_by_floor_count_m2 == {1: 48.0, 2: 90.0}
    assert spec.allowed_floor_counts == (2,)


def test_ladakh_passthrough_fields(requirements_ladakh):
    spec = parse_requirements(requirements_ladakh)
    assert spec.footprint_cap_m2 == 48.0
    assert spec.allowed_orientations_deg == (180.0,)
    assert spec.allowed_material_ids == ("mat_stone", "mat_puf", "mat_plywood", "mat_steel_panel")
    assert spec.target_temperature_c == 15.0
    assert spec.occupancy_schedule_id == "continuous_30"
    assert spec.occupants == 30


def test_one_floor_limit_is_infeasible_with_numbers(requirements_ladakh):
    req = _variant(requirements_ladakh, constraints__maximum_floors=1)
    with pytest.raises(InfeasibleRequirementsError) as err:
        parse_requirements(req)
    assert err.value.code == "INFEASIBLE_REQUIREMENTS"
    d = err.value.details
    assert d["required_total_area_m2"] == pytest.approx(77.0)
    assert d["usable_area_by_floor_count_m2"] == {1: 48.0}
    assert "77.0" in str(err.value) and "48.0" in str(err.value)


def test_tiny_footprint_is_infeasible(requirements_ladakh):
    req = _variant(requirements_ladakh, constraints__maximum_footprint_m2=10.0)
    with pytest.raises(InfeasibleRequirementsError):
        parse_requirements(req)


def test_bigger_footprint_allows_both_floor_counts(requirements_ladakh):
    req = _variant(requirements_ladakh, constraints__maximum_footprint_m2=100.0)
    assert parse_requirements(req).allowed_floor_counts == (1, 2)


def test_no_footprint_cap_allows_all_floor_counts(requirements_ladakh):
    req = _variant(requirements_ladakh, constraints__maximum_footprint_m2=None)
    spec = parse_requirements(req)
    assert spec.footprint_cap_m2 is None
    assert spec.allowed_floor_counts == (1, 2)


def test_defaults_when_floors_and_orientation_missing(requirements_ladakh):
    req = _variant(
        requirements_ladakh,
        constraints__maximum_floors=None,
        constraints__preferred_orientation_deg=None,
        constraints__maximum_footprint_m2=200.0,
    )
    spec = parse_requirements(req)
    assert spec.max_floors == 1 and spec.allowed_floor_counts == (1,)
    assert spec.allowed_orientations_deg == (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0)


def test_unknown_room_type(requirements_ladakh):
    req = _variant(requirements_ladakh, mission__required_rooms=["airlock", "laboratory"])
    with pytest.raises(UnknownRoomTypeError) as err:
        parse_requirements(req)
    assert err.value.details["unknown"] == ["laboratory"]


def test_duplicate_and_empty_room_lists(requirements_ladakh):
    with pytest.raises(InvalidRoomListError):
        parse_requirements(_variant(requirements_ladakh, mission__required_rooms=["living", "living"]))
    with pytest.raises(InvalidRoomListError):
        parse_requirements(_variant(requirements_ladakh, mission__required_rooms=[]))


@pytest.mark.parametrize("mode", ["existing_shelter", "reference_benchmark"])
def test_modes_that_do_not_generate(requirements_ladakh, mode):
    req = copy.deepcopy(requirements_ladakh)
    req["mode"] = mode
    with pytest.raises(UnsupportedModeError) as err:
        parse_requirements(req)
    assert err.value.details == {"mode": mode}


def test_deterministic(requirements_ladakh):
    assert parse_requirements(requirements_ladakh) == parse_requirements(copy.deepcopy(requirements_ladakh))


def test_custom_sizing_table_overrides_defaults(requirements_ladakh):
    rules = dict(DEFAULT_SIZING.rules)
    rules["sleeping"] = RoomSizingRule(fixed_m2=0.0, per_person_m2=1.0, min_dimension_m=2.4)
    custom = replace(DEFAULT_SIZING, rules=rules, circulation_factor=1.0)
    spec = parse_requirements(requirements_ladakh, sizing=custom)
    assert spec.room("sleeping").min_area_m2 == 30.0
    assert spec.required_total_area_m2 == pytest.approx(64.0)
    assert spec.assumptions["circulation_factor"] == 1.0
    assert spec.allowed_floor_counts == (2,)  # 48 < 64 <= 90


def test_zero_occupants_uses_fixed_areas_only(requirements_ladakh):
    spec = parse_requirements(_variant(requirements_ladakh, mission__occupants=0))
    assert {r.room_type: r.min_area_m2 for r in spec.rooms} == {
        "airlock": 3.0, "living": 0.0, "sleeping": 0.0, "equipment": 4.0,
    }


def test_assumptions_are_echoed(requirements_ladakh):
    spec = parse_requirements(requirements_ladakh)
    assert spec.assumptions["stair_allowance_m2"] == 3.0
    assert spec.assumptions["rules"]["sleeping"]["per_person_m2"] == 1.2


def test_logistics_limits_are_carried_through(requirements_ladakh):
    spec = parse_requirements(requirements_ladakh)
    assert spec.maximum_mass_kg == 15000.0
    assert spec.maximum_capex_inr == 2500000.0
    assert spec.max_assembly_time_hours == 72.0
    unset = _variant(requirements_ladakh, constraints__maximum_mass_kg=None, constraints__maximum_capex_inr=None,
                     constraints__max_assembly_time_hours=None)
    spec = parse_requirements(unset)
    assert (spec.maximum_mass_kg, spec.maximum_capex_inr, spec.max_assembly_time_hours) == (None, None, None)
