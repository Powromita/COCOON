"""Stage 8 tests: the candidate generator."""

from __future__ import annotations

import copy
import json
from dataclasses import replace
from datetime import datetime, timezone

import pytest
from cocoon_contracts.building import BuildingModel, OpeningType, SurfaceType
from cocoon_contracts.materials import MaterialSnapshot

from design_generator.candidate_generator import (
    GenerationError,
    GenerationOptions,
    NoTemplateError,
    generate_candidates,
)
from design_generator.quantities import compute_quantities, orientation_bucket
from design_generator.requirement_parser import UnsupportedModeError
from design_generator.tests.conftest import load_fixture

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
ALLOWED_AND_IN_SNAPSHOT = {"mat_stone", "mat_puf", "mat_plywood"}


def _req(**constraint_changes):
    r = load_fixture("requirements_ladakh_30p.json")
    r["constraints"].update(constraint_changes)
    return r


@pytest.fixture(scope="module")
def snapshot_dict():
    return load_fixture("material_snapshot_standard.json")


@pytest.fixture(scope="module")
def snapshot(snapshot_dict):
    return MaterialSnapshot.model_validate(snapshot_dict)


@pytest.fixture(scope="module")
def ladakh(snapshot_dict):
    """Ladakh request (15 t mass limit), 8 candidates."""
    return generate_candidates(_req(), snapshot_dict, seed=42, count=8, created_at=T0)


def _wall_length(surface):
    xs, ys = [v.x for v in surface.vertices], [v.y for v in surface.vertices]
    return max(max(xs) - min(xs), max(ys) - min(ys))


# ------------------------------------------------------------------ the basics
def test_ladakh_request_gives_the_requested_number_of_valid_candidates(ladakh, snapshot):
    assert ladakh.complete and len(ladakh.candidates) == 8 and ladakh.requested == 8
    assert [c.index for c in ladakh.candidates] == sorted(c.index for c in ladakh.candidates)
    assert len({c.building.design_id for c in ladakh.candidates}) == 8
    assert len({c.building.revision_id for c in ladakh.candidates}) == 8
    for c in ladakh.candidates:
        assert c.report.ok and c.report.skipped == () and c.report.failed == ()
        assert c.building.design_id.startswith("des_") and c.building.revision_id.startswith("rev_")
        assert c.building.source.value == "generated"
        BuildingModel.model_validate(c.building.model_dump(mode="json"))          # round-trips through the contract
        assert sum(m.mass_kg for m in c.quantities.materials) <= 15000.0           # the requirement's mass limit
        assert c.quantities == compute_quantities(c.building, snapshot)            # quantities belong to this building
        assert c.building.metadata.seed == 42 and c.building.metadata.generator_version == "layout_generator_v1"


def test_only_the_two_floor_template_fits_this_request(ladakh):
    assert {c.extras["template_id"] for c in ladakh.candidates} == {"two_floor_compact"}
    for c in ladakh.candidates:
        assert len(c.building.floors) == 2 and len(c.layout.stairs) == 1


def test_attempts_add_up(ladakh):
    assert ladakh.attempts == len(ladakh.candidates) + len(ladakh.rejected)
    assert ladakh.attempts <= ladakh.max_attempts == 8 * 50


# ------------------------------------------------------------------ determinism
def test_same_inputs_give_byte_identical_output(snapshot_dict):
    a = generate_candidates(_req(), snapshot_dict, seed=7, count=4, created_at=T0)
    b = generate_candidates(_req(), copy.deepcopy(snapshot_dict), seed=7, count=4, created_at=T0)
    dump = lambda r: json.dumps([c.building.model_dump(mode="json") for c in r.candidates], sort_keys=True)
    assert dump(a) == dump(b)
    assert [c.extras for c in a.candidates] == [c.extras for c in b.candidates]
    assert dict(a.reasons) == dict(b.reasons)


def test_ids_do_not_depend_on_the_timestamp(snapshot_dict):
    a = generate_candidates(_req(), snapshot_dict, seed=7, count=3, created_at=T0)
    b = generate_candidates(_req(), snapshot_dict, seed=7, count=3, created_at=datetime(2030, 5, 5, tzinfo=timezone.utc))
    assert [(c.building.design_id, c.building.revision_id) for c in a.candidates] == \
           [(c.building.design_id, c.building.revision_id) for c in b.candidates]
    assert a.candidates[0].building.metadata.created_at != b.candidates[0].building.metadata.created_at


def test_a_different_seed_gives_different_designs(snapshot_dict):
    a = generate_candidates(_req(), snapshot_dict, seed=1, count=4, created_at=T0)
    b = generate_candidates(_req(), snapshot_dict, seed=2, count=4, created_at=T0)
    assert {c.building.revision_id for c in a.candidates}.isdisjoint({c.building.revision_id for c in b.candidates})


# ------------------------------------------------------------------ assemblies
def test_assemblies_follow_the_design_rules(ladakh, snapshot):
    clamps = {"wall": (250, 650), "roof": (180, 450), "floor": (130, 400)}
    for c in ladakh.candidates:
        for asm in c.building.assemblies.values():
            mats = [snapshot.materials[l.material_id] for l in asm.layers]
            assert {l.material_id for l in asm.layers} <= ALLOWED_AND_IN_SNAPSHOT          # never steel_panel / concrete
            if asm.category.value in clamps:
                assert 1 <= len(asm.layers) <= 2                                             # one structural (+ one insulation)
                assert mats[0].category in ("masonry", "structural")                         # structural is the inner layer
                if len(asm.layers) == 2:
                    assert mats[1].category == "insulation"                                  # insulation is last = outside
                total = sum(l.thickness_mm for l in asm.layers)
                lo, hi = clamps[asm.category.value]
                assert lo <= total <= hi
            elif asm.category.value == "ceiling":                                            # inter-floor slab
                assert len(asm.layers) == 1
            elif asm.category.value == "partition" and len(asm.layers) == 3:                 # sandwich: equal skins
                assert asm.layers[0].thickness_mm == asm.layers[2].thickness_mm
                assert mats[1].category == "insulation"


def test_u_value_matches_the_hand_formula(ladakh, snapshot):
    for c in ladakh.candidates[:3]:
        for asm in c.building.assemblies.values():
            r = 0.13 + 0.04 + sum(l.thickness_mm / 1000 / snapshot.materials[l.material_id].properties.thermal_conductivity_w_mk
                                  for l in asm.layers)
            assert asm.u_value_w_m2k == pytest.approx(1 / r, abs=1e-4)


def test_only_referenced_assemblies_are_defined(ladakh):
    for c in ladakh.candidates:
        assert set(c.building.assemblies) == {s.assembly_id for s in c.building.surfaces}


# ------------------------------------------------------------------ windows
def test_every_occupied_zone_gets_a_window_and_service_rooms_do_not(ladakh):
    for c in ladakh.candidates:
        surf = {s.id: s for s in c.building.surfaces}
        with_windows = {surf[o.parent_surface_id].owning_zone_id for o in c.building.openings
                        if o.opening_type == OpeningType.WINDOW}
        assert with_windows == {"living", "sleeping"}                # airlock and equipment stay windowless


def test_windows_sit_inside_their_wall_and_never_on_doors_or_each_other(ladakh):
    for c in ladakh.candidates:
        surf = {s.id: s for s in c.building.surfaces}
        assert {p.opening_id for p in c.window_placements} == \
               {o.id for o in c.building.openings if o.opening_type == OpeningType.WINDOW}
        spans: dict[str, list[tuple[float, float, str]]] = {}
        for p in c.window_placements:
            spans.setdefault(p.parent_surface_id, []).append((p.offset_along_wall_m, p.offset_along_wall_m + p.width_m, p.opening_id))
        for d in c.door_placements:
            spans.setdefault(d.parent_surface_id, []).append((d.offset_along_wall_m, d.offset_along_wall_m + d.width_m, d.opening_id))
        for sid, items in spans.items():
            length = _wall_length(surf[sid])
            items.sort()
            for a, b, oid in items:
                assert a >= -1e-9 and b <= length + 1e-9, (oid, a, b, length)
            for (a1, b1, o1), (a2, b2, o2) in zip(items, items[1:]):
                assert a2 >= b1 - 1e-9, f"{o1} overlaps {o2} on {sid}"
        for p in c.window_placements:                                # vertical fit: sill + height below the ceiling
            wall = surf[p.parent_surface_id]
            zs = [v.z for v in wall.vertices]
            assert min(zs) + p.sill_m + p.height_m <= max(zs) + 1e-6


def test_window_area_respects_glazing_bounds_and_matches_the_target(ladakh):
    for c in ladakh.candidates:
        wins = [o for o in c.building.openings if o.opening_type == OpeningType.WINDOW]
        actual = sum(w.area_m2 for w in wins) / c.quantities.areas["exterior_wall"].gross_m2
        assert 0.0 < actual <= 0.25 + 1e-9                           # the checker's overall cap
        assert abs(actual - c.extras["wwr_target"]) < 0.08           # close to what was aimed for


def test_glazing_values_match_the_chosen_type(ladakh):
    table = {"single": (5.8, 0.86), "double": (2.8, 0.70), "triple": (1.8, 0.55)}
    for c in ladakh.candidates:
        u, shgc = table[c.extras["glazing"]]
        for o in c.building.openings:
            if o.opening_type == OpeningType.WINDOW:
                assert (o.u_value_w_m2k, o.shgc, o.glazing_id) == (u, shgc, f"glz_{c.extras['glazing']}")


def test_windows_favour_the_solar_face(snapshot_dict):
    res = generate_candidates(_req(maximum_mass_kg=None), snapshot_dict, seed=5, count=30, created_at=T0)
    area = {"north": 0.0, "east": 0.0, "south": 0.0, "west": 0.0}
    for c in res.candidates:
        surf = {s.id: s for s in c.building.surfaces}
        for o in c.building.openings:
            if o.opening_type == OpeningType.WINDOW:
                area[orientation_bucket(surf[o.parent_surface_id].azimuth_deg)] += o.area_m2
    assert area["south"] > area["east"] and area["south"] > area["west"] > area["north"]


def test_low_ceilings_still_get_windows(snapshot_dict):
    res = generate_candidates(_req(maximum_mass_kg=None), snapshot_dict, seed=3, count=30, created_at=T0)
    low = [c for c in res.candidates if c.layout.height_m <= 2.3 + 1e-9]
    assert low, "expected at least one 2.3 m ceiling in 30 candidates"
    assert all(any(o.opening_type == OpeningType.WINDOW for o in c.building.openings) for c in low)


# ------------------------------------------------------------------ schedules and zones
def test_schedules_and_heaters(ladakh):
    for c in ladakh.candidates:
        b = c.building
        zones = {z.id: z for f in b.floors for z in f.zones}
        assert zones["airlock"].occupancy_schedule_id is None and zones["airlock"].hvac_id is None
        for zid in ("living", "sleeping"):
            z = zones[zid]
            assert z.occupancy_schedule_id in b.schedules and z.hvac_id == f"heater_{zid}"
            assert b.schedules[z.occupancy_schedule_id].type == "occupancy"
        assert zones["equipment"].equipment_schedule_id in b.schedules and zones["equipment"].hvac_id is None
        assert sum(c.extras["occupants_by_zone"].values()) == pytest.approx(30.0, abs=0.01)   # everyone is somewhere
        assert c.extras["heater_zone_ids"] == ["living", "sleeping"]


# ------------------------------------------------------------------ the rejection ledger
def test_rejections_are_recorded_with_reasons(ladakh):
    assert ladakh.rejected, "a 15 t limit must reject heavy designs"
    for r in ladakh.rejected:
        assert r.stage and r.code and r.message
    heavy = [r for r in ladakh.rejected if r.report is not None]
    assert heavy and all(r.report.failed_checks == ("envelope_mass_within_limit",) for r in heavy)
    assert all(r.building is not None and r.template_id == "two_floor_compact" for r in heavy)
    assert ladakh.reasons["constraints:envelope_mass_within_limit"] == len(heavy)
    assert all("kg" in r.message for r in heavy)


def test_a_tight_mass_limit_returns_an_incomplete_result_not_an_error(snapshot_dict):
    opts = GenerationOptions(attempts_per_candidate=6)
    res = generate_candidates(_req(maximum_mass_kg=500.0), snapshot_dict, seed=1, count=3, created_at=T0, options=opts)
    assert res.candidates == () and not res.complete and res.attempts == 18
    assert res.reasons["constraints:envelope_mass_within_limit"] == 18


def test_max_attempts_is_respected(snapshot_dict):
    res = generate_candidates(_req(), snapshot_dict, seed=1, count=50, created_at=T0,
                              options=GenerationOptions(max_attempts=4))
    assert res.attempts == 4 and res.max_attempts == 4 and len(res.candidates) <= 4 and not res.complete


# ------------------------------------------------------------------ without the mass limit
def test_without_a_mass_limit_almost_every_attempt_succeeds_and_stone_appears(snapshot_dict):
    res = generate_candidates(_req(maximum_mass_kg=None), snapshot_dict, seed=11, count=20, created_at=T0)
    assert res.complete and res.attempts <= 22
    materials = {l.material_id for c in res.candidates for a in c.building.assemblies.values() for l in a.layers}
    assert materials == ALLOWED_AND_IN_SNAPSHOT                       # heavy stone is now viable


# ------------------------------------------------------------------ other requests
def test_single_floor_request_uses_several_templates_and_no_stairs(snapshot_dict):
    req = _req(maximum_floors=1, maximum_footprint_m2=100.0, maximum_mass_kg=None)
    req["mission"]["occupants"] = 10
    res = generate_candidates(req, snapshot_dict, seed=4, count=20, created_at=T0)
    assert res.complete
    assert {c.extras["template_id"] for c in res.candidates} == {"airlock_living", "airlock_living_equipment"}
    for c in res.candidates:
        assert len(c.building.floors) == 1 and c.layout.stairs == ()
        assert "asm_interfloor" not in c.building.assemblies
        assert c.extras["merged_rooms"]                                # sleeping (and more) live inside "living"


def test_unset_orientation_is_sampled_and_the_south_facade_follows_it(snapshot_dict):
    req = _req(preferred_orientation_deg=None, maximum_mass_kg=None)
    res = generate_candidates(req, snapshot_dict, seed=8, count=25, created_at=T0)
    seen = {c.building.orientation_deg for c in res.candidates}
    assert len(seen) >= 4 and seen <= {0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0}
    for c in res.candidates:
        south_walls = [s for s in c.building.surfaces if s.owning_zone_id == "sleeping"
                       and s.surface_type == SurfaceType.EXTERIOR_WALL and s.id.endswith("_south")]
        assert south_walls[0].azimuth_deg == pytest.approx(c.building.orientation_deg % 360)


def test_material_restrictions_are_honoured(snapshot_dict):
    res = generate_candidates(_req(available_material_ids=["mat_puf", "mat_plywood"], maximum_mass_kg=None),
                              snapshot_dict, seed=2, count=10, created_at=T0)
    used = {l.material_id for c in res.candidates for a in c.building.assemblies.values() for l in a.layers}
    assert used <= {"mat_puf", "mat_plywood"}
    everything = generate_candidates(_req(available_material_ids=[], maximum_mass_kg=None),
                                     snapshot_dict, seed=2, count=30, created_at=T0)
    assert "mat_concrete" in {l.material_id for c in everything.candidates
                              for a in c.building.assemblies.values() for l in a.layers}


def test_no_usable_structural_material_gives_zero_candidates_with_a_reason(snapshot_dict):
    res = generate_candidates(_req(available_material_ids=["mat_puf"], maximum_mass_kg=None), snapshot_dict, seed=1,
                              count=2, created_at=T0, options=GenerationOptions(attempts_per_candidate=5))
    assert res.candidates == () and res.attempts == 10
    assert set(res.reasons) == {"composition:no_materials_for_wall"}


# ------------------------------------------------------------------ errors
def test_no_template_for_the_requested_rooms(snapshot_dict):
    req = _req(maximum_floors=1, maximum_footprint_m2=100.0)
    req["mission"]["required_rooms"] = ["airlock", "command", "medical"]      # no template has both
    with pytest.raises(NoTemplateError) as err:
        generate_candidates(req, snapshot_dict, seed=1, count=1, created_at=T0)
    assert err.value.code == "NO_TEMPLATE_FITS"


def test_bad_arguments(snapshot_dict):
    with pytest.raises(GenerationError):
        generate_candidates(_req(), snapshot_dict, seed=1, count=0)
    req = _req()
    req["mode"] = "existing_shelter"
    with pytest.raises(UnsupportedModeError):
        generate_candidates(req, snapshot_dict, seed=1, count=1)


def test_accepts_contract_objects_as_well_as_dicts(snapshot):
    from cocoon_contracts.requirements import RequirementsContract
    res = generate_candidates(RequirementsContract.model_validate(_req()), snapshot, seed=1, count=2, created_at=T0)
    assert len(res.candidates) == 2


# ------------------------------------------------------------------ windows sharing a wall with the entrance door
def _single_room_result(snapshot_dict, count=30):
    """Rooms big enough to hold windows beside the entrance door, with windows biased to the (north) door wall
    so the door/window clearance logic is genuinely exercised."""
    req = _req(maximum_floors=1, maximum_footprint_m2=60.0, maximum_mass_kg=None)
    req["mission"].update(required_rooms=["living"], occupants=20)
    north_heavy = GenerationOptions(orientation_weights={"north": 10.0, "east": 1.0, "south": 1.0, "west": 1.0})
    return generate_candidates(req, snapshot_dict, seed=9, count=count, created_at=T0, options=north_heavy)


def test_windows_keep_clear_of_the_entrance_door_on_the_same_wall(snapshot_dict):
    res = _single_room_result(snapshot_dict)
    assert res.complete
    assert {c.extras["template_id"] for c in res.candidates} >= {"single_room", "living_sleeping_storage"}
    shared_walls = 0
    for c in res.candidates:
        surf = {s.id: s for s in c.building.surfaces}
        door_walls = {d.parent_surface_id: d for d in c.door_placements}
        for w in c.window_placements:
            d = door_walls.get(w.parent_surface_id)
            if d is None:
                continue
            shared_walls += 1
            wa, wb = w.offset_along_wall_m, w.offset_along_wall_m + w.width_m
            da, db = d.offset_along_wall_m, d.offset_along_wall_m + d.width_m
            assert wb <= da - 0.3 + 1e-9 or wa >= db + 0.3 - 1e-9, f"window too close to door on {w.parent_surface_id}"
            assert wa >= -1e-9 and wb <= _wall_length(surf[w.parent_surface_id]) + 1e-9
    assert shared_walls > 0, "the scenario must actually put a window and a door on one wall"


def test_room_with_the_entrance_still_gets_windows(snapshot_dict):
    res = _single_room_result(snapshot_dict, count=15)
    for c in res.candidates:
        assert any(o.opening_type == OpeningType.WINDOW for o in c.building.openings)


def test_every_occupied_room_gets_a_window_even_when_the_glazing_target_is_zero(snapshot_dict):
    """With a 0 % target only the guaranteed windows remain: exactly one per occupied room."""
    opts = GenerationOptions(wwr_target_range=(0.0, 0.0))
    res = generate_candidates(_req(maximum_mass_kg=None), snapshot_dict, seed=6, count=10, created_at=T0, options=opts)
    assert res.complete
    for c in res.candidates:
        surf = {s.id: s for s in c.building.surfaces}
        per_zone: dict[str, int] = {}
        for o in c.building.openings:
            if o.opening_type == OpeningType.WINDOW:
                z = surf[o.parent_surface_id].owning_zone_id
                per_zone[z] = per_zone.get(z, 0) + 1
        assert per_zone == {"living": 1, "sleeping": 1}
