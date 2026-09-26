"""Stage 3 tests: room planning and layout generation."""

from __future__ import annotations

import copy
from dataclasses import replace

import pytest

from design_generator import layout_generator as lg
from design_generator.layout_generator import (
    NoFeasibleLayoutError,
    generate_layout,
    plan_rooms,
    verify_layout,
)
from design_generator.requirement_parser import DEFAULT_SIZING, RoomSizingRule, parse_requirements
from design_generator.template_catalog import filter_templates


def _match(spec_req: dict, template_id: str):
    rooms = spec_req["mission"]["required_rooms"]
    floors = spec_req["constraints"]["maximum_floors"] or 1
    return next(m for m in filter_templates(rooms, floors) if m.template.id == template_id)


@pytest.fixture
def ladakh_spec(requirements_ladakh):
    return parse_requirements(requirements_ladakh)


@pytest.fixture
def two_floor(requirements_ladakh):
    return _match(requirements_ladakh, "two_floor_compact")


def _rect(z):
    return (z.origin_m[0], z.origin_m[1], z.origin_m[0] + z.length_m, z.origin_m[1] + z.width_m)


# ---------------------------------------------------------------- planning
def test_plan_drops_unrequested_storage_and_sizes_rooms(two_floor, ladakh_spec):
    plan = plan_rooms(two_floor, ladakh_spec)
    assert {r.id for r in plan.rooms} == {"airlock", "living", "equipment", "sleeping"}
    assert plan.pruned_rooms == ("storage",)
    assert ("sleeping", "storage", "door") not in plan.links
    areas = {r.id: r.min_area_m2 for r in plan.rooms}
    assert areas["airlock"] == pytest.approx(3.3)                 # 3.0 * 1.10
    assert areas["equipment"] == pytest.approx(7.7)               # 7.0 * 1.10
    assert areas["living"] == pytest.approx(24 * 1.1 + 3.0)       # + stair allowance
    assert areas["sleeping"] == pytest.approx(36 * 1.1 + 3.0)


def test_plan_merged_room_sums_required_areas(requirements_ladakh):
    req = copy.deepcopy(requirements_ladakh)
    req["constraints"]["maximum_footprint_m2"] = 100.0
    spec = parse_requirements(req)
    plan = plan_rooms(_match(req, "airlock_living"), spec)
    living = next(r for r in plan.rooms if r.id == "living")
    assert living.provides == ("equipment", "living", "sleeping")
    assert living.min_area_m2 == pytest.approx((24 + 36 + 7) * 1.1)
    assert living.min_dimension_m == 2.5                          # widest of the merged rules


def test_plan_keeps_connector_room_that_was_not_requested(requirements_ladakh):
    req = copy.deepcopy(requirements_ladakh)
    req["mission"]["required_rooms"] = ["airlock", "storage"]
    spec = parse_requirements(req)
    plan = plan_rooms(_match(req, "two_floor_compact"), spec)
    ids = {r.id for r in plan.rooms}
    assert "sleeping" in ids                       # bridges living -> storage, so it must stay
    assert plan.pruned_rooms == ("equipment",)
    sleeping = next(r for r in plan.rooms if r.id == "sleeping")
    assert sleeping.min_area_m2 == pytest.approx(36 * 1.1 + 3.0)   # sized from its own rule


# ------------------------------------------------------- layout, many seeds
@pytest.mark.parametrize("seed", range(40))
def test_layouts_are_valid_for_many_seeds(two_floor, ladakh_spec, seed):
    layout = generate_layout(two_floor, ladakh_spec, seed)
    plan = plan_rooms(two_floor, ladakh_spec)
    assert verify_layout(layout, plan, ladakh_spec) == []

    # independent arithmetic, not using the module's helpers
    footprint = layout.footprint_length_m * layout.footprint_width_m
    assert footprint <= 48.0 + 1e-6
    assert 1.0 <= layout.footprint_length_m / layout.footprint_width_m <= 1.8 + 1e-9
    assert 2.3 <= layout.height_m <= 3.0
    for level in (0, 1):
        zones = [z for z in layout.zones if z.floor_level == level]
        assert sum(z.length_m * z.width_m for z in zones) == pytest.approx(footprint)
        for i, a in enumerate(zones):
            for b in zones[i + 1:]:
                ra, rb = _rect(a), _rect(b)
                overlap_x = min(ra[2], rb[2]) - max(ra[0], rb[0])
                overlap_y = min(ra[3], rb[3]) - max(ra[1], rb[1])
                assert not (overlap_x > 1e-9 and overlap_y > 1e-9)


def test_upper_floor_sits_at_ceiling_height(two_floor, ladakh_spec):
    layout = generate_layout(two_floor, ladakh_spec, 7)
    for z in layout.zones:
        assert z.origin_m[2] == pytest.approx(z.floor_level * layout.height_m)
        assert z.height_m == layout.height_m


def test_airlock_is_on_perimeter_and_joined_to_living(two_floor, ladakh_spec):
    layout = generate_layout(two_floor, ladakh_spec, 3)
    airlock, living = layout.zone("airlock"), layout.zone("living")
    a = tuple(round(v * 10) for v in _rect(airlock))
    b = tuple(round(v * 10) for v in _rect(living))
    assert lg._shared_wall(a, b) >= lg.MIN_SHARED_WALL_DM
    L, W = round(layout.footprint_length_m * 10), round(layout.footprint_width_m * 10)
    assert lg._perimeter_contact(a, L, W) >= lg.MIN_SHARED_WALL_DM


def test_stair_fits_in_overlap_of_living_and_sleeping(two_floor, ladakh_spec):
    layout = generate_layout(two_floor, ladakh_spec, 11)
    assert len(layout.stairs) == 1
    s = layout.stairs[0]
    assert (s.lower_zone_id, s.upper_zone_id) == ("living", "sleeping")
    assert s.length_m * s.width_m == pytest.approx(3.0)
    for zid in ("living", "sleeping"):
        zx0, zy0, zx1, zy1 = _rect(layout.zone(zid))
        assert zx0 - 1e-9 <= s.x_m and s.x_m + s.length_m <= zx1 + 1e-9
        assert zy0 - 1e-9 <= s.y_m and s.y_m + s.width_m <= zy1 + 1e-9


# ------------------------------------------------------------- determinism
def test_same_seed_same_layout(two_floor, ladakh_spec):
    assert generate_layout(two_floor, ladakh_spec, 42) == generate_layout(two_floor, ladakh_spec, 42)


def test_different_seeds_give_different_layouts(two_floor, ladakh_spec):
    layouts = {generate_layout(two_floor, ladakh_spec, s).zones for s in range(10)}
    assert len(layouts) > 1


# ------------------------------------------------------------ failure modes
def test_single_floor_template_rejected_when_only_two_floors_fit(requirements_ladakh, ladakh_spec):
    with pytest.raises(NoFeasibleLayoutError) as err:
        generate_layout(_match(requirements_ladakh, "airlock_living"), ladakh_spec, 1)
    assert err.value.code == "NO_FEASIBLE_LAYOUT"
    assert err.value.details["reasons"] == {"floor_count_not_allowed": 1}


def test_floor_that_cannot_fit_footprint_cap(requirements_ladakh):
    req = copy.deepcopy(requirements_ladakh)
    req["constraints"]["maximum_footprint_m2"] = 42.0   # total fits (78 >= 77) but upper floor needs 42.6
    spec = parse_requirements(req)
    assert spec.allowed_floor_counts == (2,)
    with pytest.raises(NoFeasibleLayoutError) as err:
        generate_layout(_match(req, "two_floor_compact"), spec, 1)
    assert err.value.details["reasons"] == {"floor_needs_more_than_footprint_cap": 1}
    assert err.value.details["floor"] == 1


def test_impossible_geometry_reports_reasons(requirements_ladakh):
    rules = dict(DEFAULT_SIZING.rules)
    rules["sleeping"] = RoomSizingRule(fixed_m2=0.0, per_person_m2=1.2, min_dimension_m=20.0)
    spec = parse_requirements(requirements_ladakh, sizing=replace(DEFAULT_SIZING, rules=rules))
    with pytest.raises(NoFeasibleLayoutError) as err:
        generate_layout(_match(requirements_ladakh, "two_floor_compact"), spec, 1)
    assert err.value.details["attempts"] == lg.MAX_ATTEMPTS
    # a 20 m wide room cannot fit any footprint under the 48 m2 cap; the footprint is widened to try, then rejected
    assert err.value.details["reasons"]["footprint_exceeds_cap"] == lg.MAX_ATTEMPTS


def test_larger_footprint_allows_single_floor_merged_template(requirements_ladakh):
    req = copy.deepcopy(requirements_ladakh)
    req["constraints"]["maximum_footprint_m2"] = 100.0
    spec = parse_requirements(req)
    assert spec.allowed_floor_counts == (1, 2)
    match = _match(req, "airlock_living_equipment")
    layout = generate_layout(match, spec, 5)
    assert layout.floor_count == 1 and {z.zone_id for z in layout.zones} == {"airlock", "living", "equipment"}
    assert verify_layout(layout, plan_rooms(match, spec), spec) == []


# --------------------------------------------------- the verifier really works
def test_verifier_catches_tampering(two_floor, ladakh_spec):
    layout = generate_layout(two_floor, ladakh_spec, 2)
    plan = plan_rooms(two_floor, ladakh_spec)

    moved = tuple(
        replace(z, origin_m=(0.0, 0.0, z.origin_m[2])) if z.zone_id in ("airlock", "equipment") else z
        for z in layout.zones
    )
    bad = replace(layout, zones=moved)
    assert any("overlaps" in p for p in verify_layout(bad, plan, ladakh_spec))

    shrunk = tuple(replace(z, length_m=round(z.length_m / 2, 1)) if z.zone_id == "sleeping" else z for z in layout.zones)
    problems = verify_layout(replace(layout, zones=shrunk), plan, ladakh_spec)
    assert any("not_fully_tiled" in p or "below_min" in p for p in problems)

    assert any("stair_missing" in p for p in verify_layout(replace(layout, stairs=()), plan, ladakh_spec))
    assert any("exceeds_cap" in p for p in verify_layout(
        replace(layout, footprint_length_m=layout.footprint_length_m + 3), plan, ladakh_spec))


def test_two_room_template_gets_a_wide_enough_airlock_strip(requirements_ladakh):
    """Regression: with only two rooms the airlock is a full-width strip. It used to come out ~0.7 m wide
    (below its 1.2 m minimum) in about 90 % of attempts, so the template was almost unusable."""
    req = copy.deepcopy(requirements_ladakh)
    req["constraints"].update(maximum_floors=1, maximum_footprint_m2=100.0)
    req["mission"]["occupants"] = 10
    spec = parse_requirements(req)
    match = _match(req, "airlock_living")
    attempts = []
    for seed in range(40):
        layout = generate_layout(match, spec, seed)
        assert verify_layout(layout, plan_rooms(match, spec), spec) == []
        a = layout.zone("airlock")
        assert min(a.length_m, a.width_m) >= 1.2 - 1e-9
        attempts.append(layout.attempts)
    assert sorted(attempts)[len(attempts) // 2] <= 10        # median attempts stays small


@pytest.mark.parametrize("template_id", ["single_room", "living_sleeping_storage"])
def test_small_shelters_get_a_footprint_wide_enough_for_their_rooms(requirements_ladakh, template_id):
    """Regression: the footprint was sized from room AREA only, so a 5.3 m2 living room (min width 2.5 m)
    got a ~2.3 m wide footprint and 95 % of attempts failed on width."""
    req = copy.deepcopy(requirements_ladakh)
    req["constraints"].update(maximum_floors=1, maximum_footprint_m2=60.0)
    req["mission"].update(required_rooms=["living"], occupants=6)
    spec = parse_requirements(req)
    match = _match(req, template_id)
    plan = plan_rooms(match, spec)
    widest = max(r.min_dimension_m for r in plan.rooms)
    attempts = []
    for seed in range(30):
        layout = generate_layout(match, spec, seed)
        assert verify_layout(layout, plan, spec) == []
        assert min(layout.footprint_length_m, layout.footprint_width_m) >= widest - 1e-9
        attempts.append(layout.attempts)
    assert sorted(attempts)[len(attempts) // 2] <= 10
