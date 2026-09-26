"""Stage 6 tests: the constraint checker."""

from __future__ import annotations

import copy
import json
from dataclasses import replace

import pytest
from cocoon_contracts.building import (
    AssemblyCategory,
    AssemblyLayer,
    BuildingModel,
    ConstructionAssembly,
    Opening,
    OpeningType,
    SurfaceBoundaryType,
    SurfaceType,
)
from cocoon_contracts.materials import MaterialSnapshot

from design_generator import constraints as C
from design_generator.connection_detector import detect_connections
from design_generator.constraints import ALL_CHECK_NAMES, CandidateContext, validate_candidate
from design_generator.geometry_resolver import resolve_geometry
from design_generator.layout_generator import generate_layout, plan_rooms
from design_generator.requirement_parser import parse_requirements
from design_generator.template_catalog import filter_templates
from design_generator.tests.conftest import load_fixture, make_building


# ------------------------------------------------------------------ helpers
def _assemblies() -> dict:
    def asm(aid, cat, layers):
        return ConstructionAssembly(id=aid, name=aid, category=AssemblyCategory(cat),
                                    layers=[AssemblyLayer(material_id=m, thickness_mm=t) for m, t in layers])
    return {
        "asm_wall": asm("asm_wall", "wall", [("mat_stone", 200.0), ("mat_puf", 100.0)]),          # 300 mm
        "asm_roof": asm("asm_roof", "roof", [("mat_plywood", 100.0), ("mat_puf", 100.0)]),         # 200 mm
        "asm_ground_floor": asm("asm_ground_floor", "floor", [("mat_stone", 150.0), ("mat_puf", 50.0)]),
        "asm_interfloor": asm("asm_interfloor", "ceiling", [("mat_plywood", 25.0)]),
        "asm_partition": asm("asm_partition", "partition",
                             [("mat_plywood", 12.0), ("mat_puf", 50.0), ("mat_plywood", 12.0)]),
    }


def _window(op_id, parent, area):
    return Opening(id=op_id, parent_surface_id=parent, opening_type=OpeningType.WINDOW, area_m2=area,
                   u_value_w_m2k=1.8, shgc=0.62, glazing_id="glz_double", frame_fraction=0.15,
                   shading_factor=1.0, is_operable=False)


def _candidate(req, seed=7):
    # The mass limit has its own tests below; switch it off so these fixtures (heavy stone walls) exercise the other checks.
    spec = replace(parse_requirements(req), maximum_mass_kg=None)
    match = next(m for m in filter_templates(req["mission"]["required_rooms"], 2)
                 if m.template.id == "two_floor_compact")
    layout = generate_layout(match, spec, seed)
    geo = resolve_geometry(layout)
    conn = detect_connections(layout, geo)
    south = max((s for s in geo.surfaces if s.surface_type == SurfaceType.EXTERIOR_WALL and s.azimuth_deg == 180.0),
                key=lambda s: s.area_m2)
    openings = list(conn.openings) + [_window("op_south_window", south.id, 1.5)]
    building = make_building(geo, openings, conn.connections, assemblies=_assemblies())
    ctx = CandidateContext(spec=spec, plan=plan_rooms(match, spec),
                           materials=MaterialSnapshot.model_validate(load_fixture("material_snapshot_standard.json")))
    return building, ctx


@pytest.fixture
def cand(requirements_ladakh):
    return _candidate(requirements_ladakh)


def _zone(d, zone_id):
    return next(z for f in d["floors"] for z in f["zones"] if z["id"] == zone_id)


def _surface(d, sid):
    return next(s for s in d["surfaces"] if s["id"] == sid)


# ------------------------------------------------------------------ clean candidates
def test_clean_candidate_passes_every_check(cand):
    building, ctx = cand
    report = validate_candidate(building, ctx)
    assert report.ok and report.failed == () and report.skipped == ()
    assert report.passed == ALL_CHECK_NAMES


@pytest.mark.parametrize("seed", range(30))
def test_clean_candidates_over_many_seeds(requirements_ladakh, seed):
    building, ctx = _candidate(requirements_ladakh, seed)
    report = validate_candidate(building, ctx)
    assert report.ok, report.failed


def test_report_is_json_serialisable_and_stable(cand):
    building, ctx = cand
    report = validate_candidate(building, ctx)
    assert json.loads(json.dumps(report.to_dict()))["ok"] is True
    assert validate_candidate(building, ctx) == report


# ------------------------------------------------------------------ one defect -> its check
def _shift(zone_id, dx=0.0, dy=0.0):
    def f(d, ctx):
        z = _zone(d, zone_id)
        z["origin_m"]["x"] = round(z["origin_m"]["x"] + dx, 1)
        z["origin_m"]["y"] = round(z["origin_m"]["y"] + dy, 1)
        return d, ctx
    return f


def _size(zone_id, **dims):
    def f(d, ctx):
        _zone(d, zone_id)["size_m"].update(dims)
        return d, ctx
    return f


def _set_surface(sid, **kw):
    def f(d, ctx):
        _surface(d, sid).update(kw)
        return d, ctx
    return f


def _drop_opening(op_id):
    def f(d, ctx):
        d["openings"] = [o for o in d["openings"] if o["id"] != op_id]
        return d, ctx
    return f


def _opening(op_id, **kw):
    def f(d, ctx):
        next(o for o in d["openings"] if o["id"] == op_id).update(kw)
        return d, ctx
    return f


def _ctx_spec(**changes):
    def f(d, ctx):
        return d, replace(ctx, spec=replace(ctx.spec, **changes))
    return f


def _add_window(op_id, parent, area):
    def f(d, ctx):
        w = _window(op_id, parent, area).model_dump(mode="json")
        d["openings"].append(w)
        return d, ctx
    return f


def _assembly_layers(aid, layers):
    def f(d, ctx):
        d["assemblies"][aid]["layers"] = [{"material_id": m, "thickness_mm": t} for m, t in layers]
        return d, ctx
    return f


def _drop_stair(d, ctx):
    d["connections"] = [c for c in d["connections"] if c["connection_type"] != "stair"]
    return d, ctx


def _small_stair(d, ctx):
    next(c for c in d["connections"] if c["connection_type"] == "stair")["shared_area_m2"] = 1.0
    return d, ctx


CASES = {
    "zones overlap":            (_shift("equipment", dx=0.3),                          {"zones_do_not_overlap"}),
    "entrance door missing":    (_drop_opening("op_airlock_entry_door"),               {"all_zones_reachable"}),
    "room too small":           (_size("sleeping", length_m=3.7),                      {"room_min_area"}),
    "room too narrow":          (_size("sleeping", width_m=2.0),                       {"room_min_dimension", "room_min_area"}),
    "ceiling too high":         (_size("sleeping", height_m=4.0),                      {"ceiling_height_in_range"}),
    "footprint over cap":       (_ctx_spec(footprint_cap_m2=40.0),                     {"footprint_within_cap"}),
    "floor count not allowed":  (_ctx_spec(allowed_floor_counts=(1,)),                 {"floor_count_allowed"}),
    "upper zone overhangs":     (_shift("sleeping", dx=4.0),                           {"upper_zones_supported", "footprint_within_cap"}),
    "no stair":                 (_drop_stair,                                          {"stairs_allocated", "all_zones_reachable"}),
    "stair too small":          (_small_stair,                                         {"stairs_allocated"}),
    "opening bigger than wall": (_opening("op_south_window", area_m2=30.0),            {"openings_fit_parent_surface", "window_to_wall_ratio"}),
    "door joins wrong zone":    (_opening("op_airlock_entry_door", connected_boundary="living"),
                                                                                       {"door_boundaries_consistent", "all_zones_reachable"}),
    "partition pair broken":    (_set_surface("surf_airlock_east_living", adjacent_surface_id=None),
                                                                                       {"internal_surfaces_paired"}),
    "pair areas differ":        (_set_surface("surf_living_west_equipment", area_m2=11.5),
                                                                                       {"internal_surfaces_paired"}),
    "too much glass on one side": (_add_window("op_big_window", "surf_sleeping_south", 14.0),
                                                                                       {"window_to_wall_ratio"}),
    "material not in snapshot": (_assembly_layers("asm_wall", [("mat_stone", 200.0), ("mat_unobtainium", 100.0)]),
                                                                                       {"assembly_materials_in_snapshot", "assembly_materials_allowed"}),
    "material not allowed":     (_ctx_spec(allowed_material_ids=("mat_stone",)),       {"assembly_materials_allowed"}),
    "wall too thin":            (_assembly_layers("asm_wall", [("mat_stone", 100.0)]), {"assembly_thickness_buildable"}),
}


@pytest.mark.parametrize("name", list(CASES))
def test_each_defect_trips_exactly_its_checks(cand, name):
    building, ctx = cand
    mutate, expected = CASES[name]
    d, ctx2 = mutate(building.model_dump(mode="json"), ctx)
    report = validate_candidate(d, ctx2)
    assert not report.ok
    assert set(report.failed_checks) == expected, [f.reason for f in report.failed]
    assert all(f.reason for f in report.failed)
    # every other check still passed and is listed as such
    assert set(report.passed) | {n for n, _ in report.skipped} == set(ALL_CHECK_NAMES) - expected


def test_failures_explain_themselves(cand):
    building, ctx = cand
    d, ctx2 = _size("sleeping", length_m=3.7)(building.model_dump(mode="json"), ctx)
    (f,) = validate_candidate(d, ctx2).failed
    assert f.check == "room_min_area" and "sleeping" in f.reason
    assert f.value == pytest.approx(3.7 * 6.1, abs=0.01) and f.limit == pytest.approx(42.6)


# ------------------------------------------------------------------ inputs that change behaviour
def test_no_material_snapshot_is_skipped_not_passed(cand):
    building, ctx = cand
    report = validate_candidate(building, replace(ctx, materials=None))
    assert report.ok
    assert [n for n, _ in report.skipped] == ["assembly_materials_in_snapshot"]      # no mass limit set in this suite
    assert "assembly_materials_in_snapshot" not in report.passed
    limited = replace(ctx, materials=None, spec=replace(ctx.spec, maximum_mass_kg=15000.0))
    assert [n for n, _ in validate_candidate(building, limited).skipped] == [
        "assembly_materials_in_snapshot", "envelope_mass_within_limit"]


def test_exact_plan_minimums_are_stricter_than_spec_minimums(cand):
    building, ctx = cand
    d, ctx2 = _size("sleeping", length_m=6.6)(building.model_dump(mode="json"), ctx)   # 40.3 m2: 36 <= 40.3 < 42.6
    assert validate_candidate(d, replace(ctx2, plan=None)).ok                          # spec minimum (36) is met
    assert validate_candidate(d, ctx2).failed_checks == ("room_min_area",)             # plan minimum (42.6) is not


def test_wwr_bounds_are_configurable(cand):
    building, ctx = cand
    tight = replace(ctx, wwr=C.WwrBounds(min_overall=0.10, max_overall=0.20))          # CSV-style 10-20 %
    report = validate_candidate(building, tight)                                        # ~1 % glazing
    assert report.failed_checks == ("window_to_wall_ratio",) and "only" in report.failed[0].reason


def test_thickness_limits_are_configurable(cand):
    building, ctx = cand
    strict = replace(ctx, assembly_mm={"wall": (400.0, 650.0)})
    assert validate_candidate(building, strict).failed_checks == ("assembly_thickness_buildable",)


def test_no_footprint_cap_means_the_check_passes(cand):
    building, ctx = cand
    d, ctx2 = _ctx_spec(footprint_cap_m2=None)(building.model_dump(mode="json"), ctx)
    assert "footprint_within_cap" in validate_candidate(d, ctx2).passed


# ------------------------------------------------------------------ never raises
def test_contract_invalid_building_is_reported_not_raised(cand):
    building, ctx = cand
    d = building.model_dump(mode="json")
    del d["schema_version"]
    report = validate_candidate(d, ctx)
    assert report.failed_checks == ("contract_valid",) and "schema_version" in report.failed[0].reason
    assert report.passed == () and len(report.skipped) == len(C.CHECKS)


@pytest.mark.parametrize("junk", [{}, None, 42, "text", {"floors": "x"}])
def test_garbage_input_never_raises(cand, junk):
    _, ctx = cand
    report = validate_candidate(junk, ctx)
    assert not report.ok and report.failed_checks == ("contract_valid",)


def test_topology_violating_the_contract_is_caught(cand):
    building, ctx = cand
    d = building.model_dump(mode="json")
    d["surfaces"][0]["owning_zone_id"] = "ghost"
    assert validate_candidate(d, ctx).failed_checks == ("contract_valid",)


# ------------------------------------------------------------------ helpers themselves
def test_union_area_handles_overlap_and_gaps():
    assert C._union_area([(0, 0, 10, 10), (5, 5, 15, 15)]) == 175           # 100 + 100 - 25
    assert C._union_area([(0, 0, 10, 10), (20, 0, 30, 10)]) == 200          # disjoint
    assert C._union_area([(0, 0, 10, 10), (0, 0, 10, 10)]) == 100           # identical


# ------------------------------------------------------------------ what the M0 fixtures say
def test_m0_fixtures_disagree_with_each_other_in_two_ways(cand):
    """Documents two inconsistencies between the M0 fixtures that this checker exposes.

    1. The building fixtures list one-sided partitions (no adjacent_surface_id), which
       PRD 8.4 says must pair.
    2. The Ladakh requirements allow 'mat_steel_panel' (absent from the standard material
       snapshot) and do not allow 'mat_concrete' (present in the snapshot and used by the
       building fixtures). So a candidate can only draw from allowed AND in-snapshot
       materials: stone, puf, plywood.
    """
    _, ctx = cand
    for name in ("building_airlock_living.json", "building_two_floor_compact.json"):
        model = BuildingModel.model_validate(load_fixture(name))
        unpaired = C.internal_surfaces_paired(model, ctx)
        assert unpaired and all("unpaired" in f.reason for f in unpaired), name
        assert C.assembly_materials_in_snapshot(model, ctx) == [], name       # snapshot covers them
        assert {f.value for f in C.assembly_materials_allowed(model, ctx)} == {"mat_concrete"}, name

    allowed = set(ctx.spec.allowed_material_ids)
    in_snapshot = set(ctx.materials.materials)
    assert allowed - in_snapshot == {"mat_steel_panel"}
    assert in_snapshot - allowed == {"mat_concrete"}
    assert allowed & in_snapshot == {"mat_stone", "mat_puf", "mat_plywood"}


# ------------------------------------------------------------------ envelope mass
def test_mass_check_fails_a_heavy_envelope_and_says_why(cand):
    building, ctx = cand                      # 300 mm walls with 200 mm of stone: many tonnes
    heavy = replace(ctx, spec=replace(ctx.spec, maximum_mass_kg=15000.0))
    report = validate_candidate(building, heavy)
    assert report.failed_checks == ("envelope_mass_within_limit",)
    (f,) = report.failed
    assert f.value > 15000.0 and f.limit == 15000.0 and "kg" in f.reason


def test_mass_check_passes_under_the_limit_and_when_unset(cand):
    building, ctx = cand
    assert "envelope_mass_within_limit" in validate_candidate(building, ctx).passed                       # unset
    roomy = replace(ctx, spec=replace(ctx.spec, maximum_mass_kg=500000.0))
    assert "envelope_mass_within_limit" in validate_candidate(building, roomy).passed


def test_mass_check_defers_to_the_snapshot_check_for_unknown_materials(cand):
    building, ctx = cand
    d = building.model_dump(mode="json")
    d["assemblies"]["asm_wall"]["layers"][1]["material_id"] = "mat_unobtainium"
    report = validate_candidate(d, replace(ctx, spec=replace(ctx.spec, maximum_mass_kg=15000.0)))
    assert "assembly_materials_in_snapshot" in report.failed_checks
    assert [n for n, _ in report.skipped] == ["envelope_mass_within_limit"]
