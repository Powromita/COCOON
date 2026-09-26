"""Stage 5 tests: doors, connections, reachability."""

from __future__ import annotations

import pytest
from cocoon_contracts.building import OpeningType, SurfaceType, ZoneConnectionType

from design_generator.connection_detector import (
    DoorDefaults,
    ConnectionDetectError,
    detect_connections,
    find_unreachable,
)
from design_generator.geometry_resolver import resolve_geometry
from design_generator.layout_generator import Layout, StairLayout, ZoneLayout, generate_layout
from design_generator.requirement_parser import parse_requirements
from design_generator.template_catalog import filter_templates
from design_generator.tests.conftest import load_fixture, make_building


def _ladakh(req, seed):
    spec = parse_requirements(req)
    match = next(m for m in filter_templates(req["mission"]["required_rooms"], 2)
                 if m.template.id == "two_floor_compact")
    layout = generate_layout(match, spec, seed)
    return layout, resolve_geometry(layout)


@pytest.fixture
def seed7(requirements_ladakh):
    layout, geo = _ladakh(requirements_ladakh, 7)
    return layout, geo, detect_connections(layout, geo)


def _zone(zid, level, x, y, l, w, h=2.8, entrance=False):
    return ZoneLayout(zid, "room", level, (x, y, round(level * h, 1)), l, w, h, (), False, entrance)


# --------------------------------------------------------------- content
def test_seed7_doors_connections_and_stair(seed7):
    layout, geo, res = seed7
    doors = {o.id: o for o in res.openings}
    assert set(doors) == {"op_airlock_living_door", "op_living_equipment_door", "op_airlock_entry_door"}
    assert all(o.opening_type == OpeningType.DOOR and o.area_m2 == pytest.approx(1.8) for o in res.openings)
    assert doors["op_airlock_entry_door"].connected_boundary == "outdoors"
    assert doors["op_airlock_living_door"].connected_boundary == "living"
    assert doors["op_living_equipment_door"].connected_boundary == "equipment"

    by_id = {c.id: c for c in res.connections}
    assert set(by_id) == {"conn_partition_airlock_equipment", "conn_partition_airlock_living",
                          "conn_partition_equipment_living", "conn_stair_living_sleeping"}
    assert by_id["conn_stair_living_sleeping"].connection_type == ZoneConnectionType.STAIR
    assert by_id["conn_stair_living_sleeping"].shared_area_m2 == pytest.approx(3.0)
    # airflow only where a door exists
    assert by_id["conn_partition_airlock_living"].is_conditioned is True
    assert by_id["conn_partition_equipment_living"].is_conditioned is True
    assert by_id["conn_partition_airlock_equipment"].is_conditioned is False   # shared wall, no door
    assert res.unreachable_zones == ()


def test_partition_connection_area_equals_wall_area(seed7):
    _, geo, res = seed7
    for c in res.connections:
        if c.connection_type == ZoneConnectionType.PARTITION:
            walls = geo.between(c.zone_a_id, c.zone_b_id)
            assert c.shared_area_m2 == pytest.approx(sum(s.area_m2 for s in walls))
            # and the paired side has the same area, so the pair is counted once
            assert c.shared_area_m2 == pytest.approx(sum(s.area_m2 for s in geo.between(c.zone_b_id, c.zone_a_id)))


def test_door_parents_are_the_right_walls(seed7):
    layout, geo, res = seed7
    owner = {s.id: s for s in geo.surfaces}
    for o in res.openings:
        parent = owner[o.parent_surface_id]
        assert o.area_m2 < parent.area_m2
        if o.connected_boundary == "outdoors":
            assert parent.surface_type == SurfaceType.EXTERIOR_WALL
            zone = layout.zone(parent.owning_zone_id)
            assert zone.exterior_access and zone.floor_level == 0
        else:
            assert parent.surface_type == SurfaceType.PARTITION
            assert parent.adjacent_zone_id == o.connected_boundary


def test_result_is_a_valid_building_model(seed7):
    _, geo, res = seed7
    make_building(geo, res.openings, res.connections)   # runs every contract validator


@pytest.mark.parametrize("seed", range(20))
def test_many_seeds_are_valid_reachable_and_fit(requirements_ladakh, seed):
    layout, geo = _ladakh(requirements_ladakh, seed)
    res = detect_connections(layout, geo)
    assert res.unreachable_zones == ()
    make_building(geo, res.openings, res.connections)
    by_surface = {s.id: s for s in geo.surfaces}
    for p in res.placements:
        # placement centre must lie inside the parent wall polygon (independent bounds check)
        xs = [v.x for v in by_surface[p.parent_surface_id].vertices]
        ys = [v.y for v in by_surface[p.parent_surface_id].vertices]
        zs = [v.z for v in by_surface[p.parent_surface_id].vertices]
        cx, cy, cz = p.centre_m
        half = p.width_m / 2
        lo, hi = (min(ys), max(ys)) if p.axis == "y" else (min(xs), max(xs))
        c_along = cy if p.axis == "y" else cx
        assert lo + 0.05 - 1e-6 <= c_along - half and c_along + half <= hi - 0.05 + 1e-6
        assert min(zs) - 1e-9 <= cz - p.height_m / 2 and cz + p.height_m / 2 <= max(zs) + 1e-9
        assert cz == pytest.approx(min(zs) + p.height_m / 2)


# ------------------------------------------------------------ entrance choice
def test_entrance_default_avoids_the_south_solar_face(seed7):
    _, geo, res = seed7
    entry = next(o for o in res.openings if o.id == "op_airlock_entry_door")
    assert entry.parent_surface_id in {"surf_airlock_north", "surf_airlock_west", "surf_airlock_east"}
    assert not entry.parent_surface_id.endswith("_south")


def test_entrance_face_priority_is_respected(seed7):
    layout, geo, _ = seed7
    res = detect_connections(layout, geo, entrance_face_priority=("west", "north", "east", "south"))
    entry = next(o for o in res.openings if o.id == "op_airlock_entry_door")
    assert entry.parent_surface_id == "surf_airlock_west"


def test_deterministic(seed7):
    layout, geo, res = seed7
    assert detect_connections(layout, geo) == res


# ------------------------------------------------------------- reachability
def test_missing_internal_door_isolates_a_room(seed7):
    layout, geo, res = seed7
    zone_ids = [z.zone_id for z in layout.zones]
    kept = [o for o in res.openings if o.id != "op_living_equipment_door"]
    assert find_unreachable(zone_ids, geo.surfaces, kept, res.connections) == ["equipment"]


def test_missing_stair_isolates_the_upper_floor(seed7):
    layout, geo, res = seed7
    zone_ids = [z.zone_id for z in layout.zones]
    no_stair = [c for c in res.connections if c.connection_type != ZoneConnectionType.STAIR]
    assert find_unreachable(zone_ids, geo.surfaces, res.openings, no_stair) == ["sleeping"]


def test_missing_entrance_isolates_everything(seed7):
    layout, geo, res = seed7
    zone_ids = [z.zone_id for z in layout.zones]
    no_entry = [o for o in res.openings if o.connected_boundary != "outdoors"]
    assert find_unreachable(zone_ids, geo.surfaces, no_entry, res.connections) == sorted(zone_ids)


def test_room_with_no_door_in_layout_is_reported():
    # three rooms in a row; the template link to "c" is a plain partition (no door)
    zones = (_zone("a", 0, 0.0, 0.0, 3.0, 3.0, entrance=True), _zone("b", 0, 3.0, 0.0, 3.0, 3.0),
             _zone("c", 0, 6.0, 0.0, 3.0, 3.0))
    layout = Layout("t", 0, 1, 1, 9.0, 3.0, 2.8, zones, (), (("a", "b", "door"), ("b", "c", "partition")), ())
    res = detect_connections(layout, resolve_geometry(layout))
    assert res.unreachable_zones == ("c",)


# ------------------------------------------------------------ failure modes
def test_entrance_room_with_only_tiny_walls_raises():
    layout = Layout("t", 0, 1, 1, 0.9, 0.9, 2.8, (_zone("a", 0, 0.0, 0.0, 0.9, 0.9, entrance=True),), (), (), ())
    with pytest.raises(ConnectionDetectError) as err:
        detect_connections(layout, resolve_geometry(layout))
    assert err.value.code == "NO_ENTRANCE_WALL"


def test_door_on_too_short_shared_wall_raises():
    zones = (_zone("a", 0, 0.0, 0.0, 3.0, 3.0, entrance=True), _zone("b", 0, 3.0, 0.0, 3.0, 0.8))
    layout = Layout("t", 0, 1, 1, 6.0, 3.0, 2.8, zones, (), (("a", "b", "door"),), ())
    with pytest.raises(ConnectionDetectError) as err:
        detect_connections(layout, resolve_geometry(layout))
    assert err.value.code == "DOOR_DOES_NOT_FIT"


def test_door_taller_than_room_raises():
    layout = Layout("t", 0, 1, 1, 3.0, 3.0, 1.8, (_zone("a", 0, 0.0, 0.0, 3.0, 3.0, h=1.8, entrance=True),), (), (), ())
    with pytest.raises(ConnectionDetectError):
        detect_connections(layout, resolve_geometry(layout))


def test_custom_door_defaults_flow_through(seed7):
    layout, geo, _ = seed7
    res = detect_connections(layout, geo, door=DoorDefaults(width_m=1.0, height_m=2.1, u_value_w_m2k=1.5))
    assert all(o.area_m2 == pytest.approx(2.1) and o.u_value_w_m2k == 1.5 for o in res.openings)


# ------------------------------------------------------------- M0 fixture
def test_airlock_living_matches_fixture_shape():
    layout = Layout("t", 0, 1, 1, 6.0, 4.0, 2.8,
                    (_zone("airlock", 0, 0.0, 0.0, 1.2, 4.0, entrance=True), _zone("living", 0, 1.2, 0.0, 4.8, 4.0)),
                    (), (("airlock", "living", "door"),), ())
    geo = resolve_geometry(layout)
    res = detect_connections(layout, geo)
    fx = load_fixture("building_airlock_living.json")

    (conn,) = res.connections
    fconn = fx["connections"][0]
    assert (conn.zone_a_id, conn.zone_b_id) == (fconn["zone_a_id"], fconn["zone_b_id"])
    assert conn.connection_type.value == fconn["connection_type"]
    assert conn.shared_area_m2 == pytest.approx(fconn["shared_area_m2"])
    assert conn.is_conditioned == fconn["is_conditioned"]

    by_boundary = {o.connected_boundary: o for o in res.openings}
    for fo in (o for o in fx["openings"] if o["opening_type"] == "door"):
        mine = by_boundary[fo["connected_boundary"]]
        assert mine.area_m2 == pytest.approx(fo["area_m2"])
        assert mine.u_value_w_m2k == fo["u_value_w_m2k"]
        assert mine.open_events_per_hour == fo["open_events_per_hour"]
        assert mine.avg_open_duration_s == fo["avg_open_duration_s"]
        assert mine.discharge_coefficient == fo["discharge_coefficient"]
    make_building(geo, res.openings, res.connections)


def test_two_floor_fixture_stair_connection():
    zones = (_zone("airlock_f0", 0, 0.0, 0.0, 1.2, 4.0, entrance=True), _zone("living_f0", 0, 1.2, 0.0, 4.8, 4.0),
             _zone("sleeping_f1", 1, 1.2, 0.0, 4.8, 4.0))
    stairs = (StairLayout("stair_0", "living_f0", "sleeping_f1", 1.2, 0.0, 4.0, 1.0),)
    layout = Layout("t", 0, 1, 2, 6.0, 4.0, 2.8, zones, stairs,
                    (("airlock_f0", "living_f0", "door"), ("living_f0", "sleeping_f1", "stair")), ())
    geo = resolve_geometry(layout)
    res = detect_connections(layout, geo)
    fx = load_fixture("building_two_floor_compact.json")
    fstair = next(c for c in fx["connections"] if c["connection_type"] == "stair")
    stair = next(c for c in res.connections if c.connection_type == ZoneConnectionType.STAIR)
    assert (stair.zone_a_id, stair.zone_b_id) == (fstair["zone_a_id"], fstair["zone_b_id"])
    assert stair.shared_area_m2 == pytest.approx(fstair["shared_area_m2"])   # 4.0 m2 in the fixture
    assert res.unreachable_zones == ()
    make_building(geo, res.openings, res.connections)


# ----------------------------------- entrance choice where the south face IS available
def _airlock_living_layout():
    return Layout("t", 0, 1, 1, 6.0, 4.0, 2.8,
                  (_zone("airlock", 0, 0.0, 0.0, 1.2, 4.0, entrance=True), _zone("living", 0, 1.2, 0.0, 4.8, 4.0)),
                  (), (("airlock", "living", "door"),), ())


def test_default_entrance_prefers_north_over_available_south_and_west():
    layout = _airlock_living_layout()
    geo = resolve_geometry(layout)
    faces = {s.id for s in geo.surfaces_of("airlock") if s.surface_type == SurfaceType.EXTERIOR_WALL}
    assert {"surf_airlock_south", "surf_airlock_north", "surf_airlock_west"} <= faces   # south really is an option
    entry = next(o for o in detect_connections(layout, geo).openings if o.id == "op_airlock_entry_door")
    assert entry.parent_surface_id == "surf_airlock_north"


def test_south_entrance_only_when_asked_for():
    layout = _airlock_living_layout()
    geo = resolve_geometry(layout)
    res = detect_connections(layout, geo, entrance_face_priority=("south", "north", "east", "west"))
    entry = next(o for o in res.openings if o.id == "op_airlock_entry_door")
    assert entry.parent_surface_id == "surf_airlock_south"


def test_entrance_falls_back_when_preferred_face_is_too_short():
    # airlock 0.9 wide: its north/south walls (0.9 m) cannot hold a door, only the 4 m west wall can
    layout = Layout("t", 0, 1, 1, 6.0, 4.0, 2.8,
                    (_zone("airlock", 0, 0.0, 0.0, 0.9, 4.0, entrance=True), _zone("living", 0, 0.9, 0.0, 5.1, 4.0)),
                    (), (("airlock", "living", "door"),), ())
    geo = resolve_geometry(layout)
    entry = next(o for o in detect_connections(layout, geo).openings if o.id == "op_airlock_entry_door")
    assert entry.parent_surface_id == "surf_airlock_west"
