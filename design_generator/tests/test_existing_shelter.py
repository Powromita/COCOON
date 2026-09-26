"""Stage 9 tests: the existing-shelter path (PRD 8.5)."""

from __future__ import annotations

import copy
import json
from datetime import datetime, timezone

import pytest
from cocoon_contracts.building import BuildingModel, BuildingSource

from design_generator import UserGeometryError, resolve_user_geometry
from design_generator.tests.conftest import REPO_ROOT, load_fixture

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
FIXTURE_DIR = REPO_ROOT / "design_generator" / "fixtures"
SPEC_ONLY_CHECKS = ["room_min_area", "room_min_dimension", "ceiling_height_in_range", "footprint_within_cap",
                    "floor_count_allowed", "stairs_allocated", "assembly_materials_allowed", "envelope_mass_within_limit"]


def _shelter() -> dict:
    return json.loads((FIXTURE_DIR / "existing_shelter_valid.json").read_text(encoding="utf-8"))


@pytest.fixture
def snapshot():
    return load_fixture("material_snapshot_standard.json")


@pytest.fixture
def result(snapshot):
    return resolve_user_geometry(_shelter(), snapshot, created_at=T0)


def _code(shelter, snapshot=None) -> str:
    with pytest.raises(UserGeometryError) as err:
        resolve_user_geometry(shelter, snapshot, created_at=T0)
    return err.value.code


# ------------------------------------------------------------------ the valid fixture
def test_valid_fixture_becomes_a_user_defined_building(result):
    b = result.building
    assert b.source == BuildingSource.USER_DEFINED and b.metadata.seed is None
    assert b.design_id.startswith("des_") and b.revision_id.startswith("rev_")
    assert [z.id for f in b.floors for z in f.zones] == ["airlock", "living", "sleeping"]
    assert b.orientation_deg == 180.0
    BuildingModel.model_validate(b.model_dump(mode="json"))


def test_the_report_is_advisory_and_skips_requirement_checks(result):
    assert result.report.ok
    assert [n for n, _ in result.report.skipped] == SPEC_ONLY_CHECKS
    assert all("no requirements" in why for _, why in result.report.skipped)
    # the buildable-thickness limits are off for an existing shelter: it is described as it is
    assert "assembly_thickness_buildable" in result.report.passed


def test_thin_existing_walls_are_not_rejected_as_unbuildable(snapshot):
    s = _shelter()
    s["assemblies"]["wall"] = [["mat_plywood", 20]]              # far below the 250 mm generator clamp
    assert resolve_user_geometry(s, snapshot, created_at=T0).report.ok


def test_areas_by_hand(result):
    q = result.quantities
    # airlock 17.92 + living 38.08 + sleeping 49.28 = 105.28 m2 of outside wall
    assert q.areas["exterior_wall"].gross_m2 == pytest.approx(105.28)
    # minus 5 windows (2x1.44 + 2x1.68 + 1.2 = 7.44) and the entrance door (1.8)
    assert q.openings.windows_count == 5 and q.openings.windows_area_m2 == pytest.approx(7.44)
    assert q.areas["exterior_wall"].net_m2 == pytest.approx(105.28 - 7.44 - 1.8)
    assert (q.openings.doors_count, q.openings.exterior_doors, q.openings.internal_doors) == (2, 1, 1)
    assert q.areas["partition"].gross_m2 == pytest.approx(11.2)
    assert q.areas["interfloor"].net_m2 == pytest.approx(19.2 - 3.0)             # stair void
    assert (q.staircases, q.floor_count, q.zone_count) == (1, 2, 3)


def test_u_value_and_mass_by_hand(result):
    wall = result.building.assemblies["asm_wall"]
    assert wall.u_value_w_m2k == pytest.approx(1 / (0.13 + 0.04 + 0.200 / 2.0 + 0.100 / 0.024), abs=1e-4)   # 0.2254
    assert result.quantities.material("mat_stone").mass_kg > 0


def test_windows_and_doors_are_placed_clear_of_each_other(result):
    door_walls = {d.parent_surface_id: d for d in result.door_placements}
    assert result.window_placements
    for w in result.window_placements:
        assert w.offset_along_wall_m >= 0 and w.width_m > 0
        d = door_walls.get(w.parent_surface_id)
        if d:
            assert w.offset_along_wall_m + w.width_m <= d.offset_along_wall_m - 0.3 + 1e-9 or \
                   w.offset_along_wall_m >= d.offset_along_wall_m + d.width_m + 0.3 - 1e-9


def test_schedules_heaters_and_extras(result):
    zones = {z.id: z for f in result.building.floors for z in f.zones}
    assert zones["living"].occupancy_schedule_id == "occupancy_living" and zones["living"].hvac_id == "heater_living"
    assert zones["airlock"].occupancy_schedule_id is None and zones["airlock"].hvac_id is None
    assert result.building.schedules["occupancy_sleeping"].hourly_values == [20.0] * 24
    assert result.extras == {"glazing": "double", "air_changes_per_hour": 0.7,
                             "occupants_by_zone": {"living": 10.0, "sleeping": 20.0},
                             "heater_zone_ids": ["living", "sleeping"]}


def test_topology_report(result):
    t = result.topology
    assert [z["id"] for z in t.zones] == ["airlock", "living", "sleeping"]
    (adj,) = t.adjacencies
    assert (adj["a"], adj["b"], adj["has_door"], adj["shared_wall_length_m"]) == ("airlock", "living", True, 4.0)
    assert [e["zone"] for e in t.entrances] == ["airlock"]
    assert t.stairs == ({"lower": "living", "upper": "sleeping", "area_m2": 3.0},)
    assert t.unreachable_zones == () and dict(t.windows_by_zone) == {"living": 2, "sleeping": 3}
    assert t.notes == ()
    json.dumps(t.to_dict())


def test_deterministic_ids(snapshot):
    a = resolve_user_geometry(_shelter(), snapshot, created_at=T0)
    b = resolve_user_geometry(_shelter(), snapshot, created_at=datetime(2031, 1, 1, tzinfo=timezone.utc))
    assert (a.building.design_id, a.building.revision_id) == (b.building.design_id, b.building.revision_id)
    changed = _shelter()
    changed["assemblies"]["wall"][0][1] = 250
    c = resolve_user_geometry(changed, snapshot, created_at=T0)
    assert c.building.revision_id != a.building.revision_id


def test_works_without_a_material_snapshot():
    r = resolve_user_geometry(_shelter(), created_at=T0)
    assert r.building.assemblies["asm_wall"].u_value_w_m2k is None
    assert all(m.mass_kg is None for m in r.quantities.materials)


def test_single_room_needs_only_three_assemblies(snapshot):
    s = {"zones": [{"id": "hut", "type": "living", "floor_level": 0, "origin_m": {"x": 0, "y": 0},
                    "size_m": {"length_m": 6.0, "width_m": 4.0}, "entrance": True}],
         "windows": [{"zone": "hut", "face": "south"}],
         "assemblies": {k: v for k, v in _shelter()["assemblies"].items() if k in ("wall", "roof", "floor")}}
    r = resolve_user_geometry(s, snapshot, created_at=T0)
    assert r.report.ok and set(r.building.assemblies) == {"asm_wall", "asm_roof", "asm_ground_floor"}
    assert r.building.floors[0].zones[0].size_m.height_m == 2.8              # documented default


def test_stair_footprint_can_be_given(snapshot):
    s = _shelter()
    s["stairs"] = [{"lower": "living", "upper": "sleeping", "x_m": 4.0, "y_m": 2.0, "length_m": 1.0, "width_m": 2.0}]
    r = resolve_user_geometry(s, snapshot, created_at=T0)
    assert r.quantities.stair_footprint_m2 == pytest.approx(2.0)


# ------------------------------------------------------------------ rejected input, one code each
def _mut(fn):
    s = _shelter()
    fn(s)
    return s


def _add_far_room_with_door(s):
    s["zones"].append({"id": "far", "type": "storage", "floor_level": 0, "origin_m": {"x": 20.0, "y": 0.0},
                       "size_m": {"length_m": 3.0, "width_m": 3.0}})
    s["doors"].append(["living", "far"])


BAD_INPUT = {
    "duplicate zone id":        (lambda s: s["zones"].append(copy.deepcopy(s["zones"][0])), "DUPLICATE_ZONE_ID"),
    "off the 0.1 m grid":       (lambda s: s["zones"][1]["origin_m"].update(x=1.25), "OFF_GRID"),
    "door to an unknown zone":  (lambda s: s["doors"].append(["airlock", "ghost"]), "UNKNOWN_ZONE"),
    "window in an unknown zone": (lambda s: s["windows"].append({"zone": "ghost", "face": "south"}), "UNKNOWN_ZONE"),
    "floor levels with a gap":  (lambda s: s["zones"][2].update(floor_level=2), "FLOOR_LEVELS_INVALID"),
    "entrance above ground":    (lambda s: s["zones"][2].update(entrance=True), "ENTRANCE_NOT_GROUND_FLOOR"),
    "rooms overlap":            (lambda s: s["zones"][1]["origin_m"].update(x=0.6), "ZONES_OVERLAP"),
    "stair upside down":        (lambda s: s.update(stairs=[{"lower": "sleeping", "upper": "living"}]), "STAIR_LEVELS_INVALID"),
    "stair too big":            (lambda s: s.update(stairs=[{"lower": "living", "upper": "sleeping", "x_m": 1.2, "y_m": 0.0,
                                                             "length_m": 9.0, "width_m": 1.0}]), "STAIR_DOES_NOT_FIT"),
    "partial stair footprint":  (lambda s: s.update(stairs=[{"lower": "living", "upper": "sleeping", "x_m": 1.2}]), "USER_INPUT_INVALID"),
    "door between rooms that do not touch": (_add_far_room_with_door, "DOOR_DOES_NOT_FIT"),
    "window on an inside wall": (lambda s: s["windows"].append({"zone": "living", "face": "west"}), "NO_EXTERIOR_WALL_FOR_WINDOW"),
    "too many windows for the wall": (lambda s: s["windows"].append({"zone": "living", "face": "north", "count": 12}), "WINDOW_DOES_NOT_FIT"),
    "missing assembly":         (lambda s: s["assemblies"].pop("partition"), "MISSING_ASSEMBLY"),
    "unknown material":         (lambda s: s["assemblies"]["wall"].append(["mat_unobtainium", 50]), "UNKNOWN_MATERIAL"),
    "zero thickness":           (lambda s: s["assemblies"]["wall"].__setitem__(0, ["mat_stone", 0]), "USER_INPUT_INVALID"),
    "unknown glazing":          (lambda s: s.update(glazing="quad"), "USER_INPUT_INVALID"),
    "unknown field":            (lambda s: s.update(colour="red"), "USER_INPUT_INVALID"),
    "no zones":                 (lambda s: s.update(zones=[]), "USER_INPUT_INVALID"),
    "orientation out of range": (lambda s: s.update(orientation_deg=400), "USER_INPUT_INVALID"),
}


@pytest.mark.parametrize("name", list(BAD_INPUT))
def test_bad_input_gets_a_specific_code(snapshot, name):
    mutate, code = BAD_INPUT[name]
    assert _code(_mut(mutate), snapshot) == code


def test_invalid_fixture_file_is_rejected_with_the_grid_hint(snapshot):
    bad = json.loads((FIXTURE_DIR / "existing_shelter_invalid.json").read_text(encoding="utf-8"))
    with pytest.raises(UserGeometryError) as err:
        resolve_user_geometry(bad, snapshot)
    assert err.value.code == "OFF_GRID" and "1.2" in str(err.value)
    assert err.value.details["zone"] == "living"


# ------------------------------------------------------------------ problems are reported, not raised
def test_no_entrance_is_reported_not_raised(snapshot):
    r = resolve_user_geometry(_mut(lambda s: s["zones"][0].update(entrance=False)), snapshot, created_at=T0)
    assert "all_zones_reachable" in r.report.failed_checks
    assert set(r.topology.unreachable_zones) == {"airlock", "living", "sleeping"}
    assert any("no outside door" in n for n in r.topology.notes)


def test_missing_door_and_windows_appear_as_notes(snapshot):
    r = resolve_user_geometry(_mut(lambda s: s.update(doors=[], windows=[])), snapshot, created_at=T0)
    assert any("share a wall" in n and "no door" in n for n in r.topology.notes)
    assert any("'living'" in n and "no windows" in n for n in r.topology.notes)
    assert any("'sleeping'" in n and "no windows" in n for n in r.topology.notes)
    assert not any("'airlock'" in n and "no windows" in n for n in r.topology.notes)      # airlocks need none
    assert "all_zones_reachable" in r.report.failed_checks                                # living cut off from the airlock


def test_too_much_glass_is_flagged_by_the_report(snapshot):
    s = _shelter()
    # four 1.4 x 1.7 m windows on the north side: 9.52 m2 of the 30.24 m2 of north wall = 31 % (limit 30 %)
    s["windows"] = [{"zone": z, "face": "north", "width_m": 1.4, "height_m": 1.7, "count": 2} for z in ("living", "sleeping")]
    r = resolve_user_geometry(s, snapshot, created_at=T0)
    assert r.report.failed_checks == ("window_to_wall_ratio",)
    assert "north window-to-wall ratio is 31%" in r.report.failed[0].reason
    assert any("window_to_wall_ratio" in n for n in r.topology.notes)
