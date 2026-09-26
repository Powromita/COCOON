"""Stage 4 tests: surfaces, pairing, orientation and contract validity."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timezone

import pytest
from cocoon_contracts.building import (
    AssemblyCategory,
    AssemblyLayer,
    BuildingMetadata,
    BuildingModel,
    BuildingSource,
    ConstructionAssembly,
    SurfaceBoundaryType as B,
    SurfaceType as T,
)

from design_generator.geometry_resolver import AssemblyIds, facade_azimuth, resolve_geometry
from design_generator.layout_generator import Layout, ZoneLayout, generate_layout
from design_generator.requirement_parser import parse_requirements
from design_generator.template_catalog import filter_templates
from design_generator.tests.conftest import load_fixture, make_building


# ------------------------------------------------------------------ helpers
def _zone(zid, ztype, level, x, y, l, w, h=2.8):
    return ZoneLayout(zid, ztype, level, (x, y, round(level * h, 1)), l, w, h, (), False, False)


def _layout(zones, floors=1):
    top = zones[0]
    return Layout("test", 0, 1, floors, 6.0, 4.0, top.height_m, tuple(zones), (), (), ())


def _building(geometry) -> BuildingModel:
    return make_building(geometry)


def _normal(vertices):
    p0, p1, p2 = vertices[0], vertices[1], vertices[2]
    a = (p1.x - p0.x, p1.y - p0.y, p1.z - p0.z)
    b = (p2.x - p0.x, p2.y - p0.y, p2.z - p0.z)
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


@pytest.fixture
def ladakh_layout(requirements_ladakh):
    spec = parse_requirements(requirements_ladakh)
    match = next(m for m in filter_templates(requirements_ladakh["mission"]["required_rooms"], 2)
                 if m.template.id == "two_floor_compact")
    return generate_layout(match, spec, 7)


# --------------------------------------------------- contract validity
@pytest.mark.parametrize("seed", range(15))
def test_generated_geometry_is_a_valid_building_model(requirements_ladakh, seed):
    spec = parse_requirements(requirements_ladakh)
    match = next(m for m in filter_templates(requirements_ladakh["mission"]["required_rooms"], 2)
                 if m.template.id == "two_floor_compact")
    _building(resolve_geometry(generate_layout(match, spec, seed)))  # raises if any contract rule breaks


# --------------------------------------------------- independent geometry checks
def test_vertices_reproduce_area_and_direction(ladakh_layout):
    geo = resolve_geometry(ladakh_layout)  # orientation 180 = local axes are compass axes
    for s in geo.surfaces:
        assert s.vertices is not None and len(s.vertices) == 4
        n = _normal(s.vertices)
        magnitude = math.sqrt(sum(c * c for c in n))
        assert magnitude == pytest.approx(s.area_m2, rel=1e-6), s.id          # area from the polygon
        tilt = math.degrees(math.acos(n[2] / magnitude))
        assert tilt == pytest.approx(s.tilt_deg, abs=1e-6), s.id              # tilt from the normal
        if s.tilt_deg == 90.0:                                                # compass bearing from the normal
            bearing = math.degrees(math.atan2(n[0], n[1])) % 360
            assert bearing == pytest.approx(s.azimuth_deg, abs=1e-6), s.id


def test_each_zone_closes_up(ladakh_layout):
    geo = resolve_geometry(ladakh_layout)
    for z in ladakh_layout.zones:
        walls = sum(s.area_m2 for s in geo.surfaces_of(z.zone_id) if s.tilt_deg == 90.0)
        floor = sum(s.area_m2 for s in geo.surfaces_of(z.zone_id) if s.tilt_deg == 180.0)
        top = sum(s.area_m2 for s in geo.surfaces_of(z.zone_id) if s.tilt_deg == 0.0)
        assert walls == pytest.approx(2 * (z.length_m + z.width_m) * z.height_m), z.zone_id
        assert floor == pytest.approx(z.length_m * z.width_m), z.zone_id
        assert top == pytest.approx(z.length_m * z.width_m), z.zone_id


def test_whole_building_envelope_totals(ladakh_layout):
    geo = resolve_geometry(ladakh_layout)
    L, W, H = ladakh_layout.footprint_length_m, ladakh_layout.footprint_width_m, ladakh_layout.height_m
    ext = sum(s.area_m2 for s in geo.surfaces if s.surface_type == T.EXTERIOR_WALL)
    assert ext == pytest.approx(2 * (L + W) * H * ladakh_layout.floor_count)
    assert sum(s.area_m2 for s in geo.surfaces if s.surface_type == T.ROOF) == pytest.approx(L * W)
    assert sum(s.area_m2 for s in geo.surfaces if s.boundary_type == B.GROUND) == pytest.approx(L * W)


# --------------------------------------------------- pairing
def test_internal_surfaces_are_reciprocal_pairs(ladakh_layout):
    geo = resolve_geometry(ladakh_layout)
    internal = [s for s in geo.surfaces if s.boundary_type == B.ADJACENT_ZONE]
    assert internal, "expected internal surfaces"
    for s in internal:
        other = geo.surface(s.adjacent_surface_id)
        assert other.adjacent_surface_id == s.id
        assert other.owning_zone_id == s.adjacent_zone_id
        assert other.adjacent_zone_id == s.owning_zone_id
        assert other.area_m2 == pytest.approx(s.area_m2)
        assert other.surface_type != T.EXTERIOR_WALL
    # vertical pair uses ceiling <-> floor, walls use partition <-> partition
    kinds = {frozenset((s.surface_type, geo.surface(s.adjacent_surface_id).surface_type)) for s in internal}
    assert kinds <= {frozenset({T.PARTITION}), frozenset({T.CEILING, T.FLOOR})}


def test_only_ground_floor_touches_ground_and_only_top_has_roof(ladakh_layout):
    geo = resolve_geometry(ladakh_layout)
    level = {z.zone_id: z.floor_level for z in ladakh_layout.zones}
    for s in geo.surfaces:
        if s.boundary_type == B.GROUND:
            assert level[s.owning_zone_id] == 0 and s.surface_type == T.FLOOR
        if s.surface_type == T.ROOF:
            assert level[s.owning_zone_id] == ladakh_layout.floor_count - 1
        if s.boundary_type == B.OUTDOORS and s.surface_type == T.FLOOR:
            pytest.fail("no overhanging floors expected in a same-footprint layout")


def test_ids_are_unique_and_deterministic(ladakh_layout):
    a, b = resolve_geometry(ladakh_layout), resolve_geometry(ladakh_layout)
    assert [s.id for s in a.surfaces] == [s.id for s in b.surfaces]
    assert len({s.id for s in a.surfaces}) == len(a.surfaces)
    assert a.surfaces == b.surfaces


# --------------------------------------------------- orientation
@pytest.mark.parametrize("orientation", [0.0, 45.0, 90.0, 180.0, 270.0, 360.0])
def test_rotation_shifts_every_wall_azimuth_and_nothing_else(ladakh_layout, orientation):
    base = {s.id: s for s in resolve_geometry(ladakh_layout, orientation_deg=180.0).surfaces}
    rotated = {s.id: s for s in resolve_geometry(ladakh_layout, orientation_deg=orientation).surfaces}
    assert base.keys() == rotated.keys()
    for sid, s in rotated.items():
        assert s.area_m2 == base[sid].area_m2 and s.tilt_deg == base[sid].tilt_deg
        if s.tilt_deg == 90.0:
            assert s.azimuth_deg == pytest.approx((base[sid].azimuth_deg + orientation - 180.0) % 360.0)
        else:
            assert s.azimuth_deg == 0.0


def test_facade_azimuth_rule_and_bounds():
    assert facade_azimuth("south", 180.0) == 180.0
    assert facade_azimuth("east", 180.0) == 90.0
    assert facade_azimuth("south", 270.0) == 270.0          # main facade turned to face west
    assert facade_azimuth("north", 90.0) == 270.0
    with pytest.raises(ValueError):
        resolve_geometry(_layout([_zone("a", "living", 0, 0, 0, 3, 3)]), orientation_deg=400.0)


# --------------------------------------------------- the two M0 fixtures
def _key(s):
    st = s["surface_type"] if isinstance(s, dict) else s.surface_type.value
    bt = s["boundary_type"] if isinstance(s, dict) else s.boundary_type.value
    zone = s["owning_zone_id"] if isinstance(s, dict) else s.owning_zone_id
    az = s["azimuth_deg"] if isinstance(s, dict) else s.azimuth_deg
    tilt = s["tilt_deg"] if isinstance(s, dict) else s.tilt_deg
    adj = s["adjacent_zone_id"] if isinstance(s, dict) else s.adjacent_zone_id
    return (zone, st, bt, az, tilt, adj)


def _assert_fixture_covered(fixture_name, layout):
    fixture = load_fixture(fixture_name)
    geo = resolve_geometry(layout, orientation_deg=fixture["orientation_deg"])
    mine = {_key(s): s for s in geo.surfaces}
    for fs in fixture["surfaces"]:
        assert _key(fs) in mine, f"fixture surface {fs['id']} has no counterpart"
        assert mine[_key(fs)].area_m2 == pytest.approx(fs["area_m2"]), fs["id"]
        assert mine[_key(fs)].exposed_fraction == fs["exposed_fraction"], fs["id"]
    _building(geo)


def test_matches_building_airlock_living_fixture():
    layout = _layout([_zone("airlock", "airlock", 0, 0.0, 0.0, 1.2, 4.0),
                      _zone("living", "living", 0, 1.2, 0.0, 4.8, 4.0)])
    _assert_fixture_covered("building_airlock_living.json", layout)
    geo = resolve_geometry(layout)
    # exterior surface ids follow the fixture's naming
    assert {"surf_airlock_west", "surf_airlock_south", "surf_airlock_north", "surf_airlock_floor",
            "surf_airlock_roof", "surf_living_east", "surf_living_south", "surf_living_north",
            "surf_living_floor", "surf_living_roof"} <= {s.id for s in geo.surfaces}


def test_matches_building_two_floor_compact_fixture():
    layout = _layout(
        [_zone("airlock_f0", "airlock", 0, 0.0, 0.0, 1.2, 4.0),
         _zone("living_f0", "living", 0, 1.2, 0.0, 4.8, 4.0),
         _zone("sleeping_f1", "sleeping", 1, 1.2, 0.0, 4.8, 4.0)],
        floors=2,
    )
    _assert_fixture_covered("building_two_floor_compact.json", layout)
    geo = resolve_geometry(layout)
    # airlock has nothing above it -> its own roof; sleeping is fully supported by living
    assert geo.surface("surf_airlock_f0_roof").area_m2 == pytest.approx(4.8)
    assert [s.area_m2 for s in geo.between("sleeping_f1", "living_f0")] == [pytest.approx(19.2)]


# --------------------------------------------------- general (non-generated) geometry
def test_partially_covered_slabs_and_overhangs_are_handled():
    # upper room half over the lower room, half hanging out
    layout = _layout([_zone("low", "living", 0, 0.0, 0.0, 4.0, 4.0),
                      _zone("up", "sleeping", 1, 2.0, 0.0, 4.0, 4.0)], floors=2)
    geo = resolve_geometry(layout)
    roof = geo.surface("surf_low_roof")
    assert roof.area_m2 == pytest.approx(8.0) and roof.vertices is None      # 16 - 8 covered
    overhang = geo.surface("surf_up_floor")
    assert overhang.boundary_type == B.OUTDOORS and overhang.area_m2 == pytest.approx(8.0)
    assert geo.surface("surf_low_ceiling_up").area_m2 == pytest.approx(8.0)
    _building(geo)


def test_face_touching_two_neighbours_splits_into_two_partitions():
    layout = _layout([_zone("wide", "living", 0, 0.0, 0.0, 6.0, 3.0),
                      _zone("n1", "storage", 0, 0.0, 3.0, 2.0, 2.0),
                      _zone("n2", "storage", 0, 2.0, 3.0, 4.0, 2.0)])
    geo = resolve_geometry(layout)
    north = sorted((s.id, s.area_m2) for s in geo.surfaces_of("wide") if s.azimuth_deg == 0.0 and s.tilt_deg == 90.0)
    assert north == [("surf_wide_north_n1", pytest.approx(2.0 * 2.8)), ("surf_wide_north_n2", pytest.approx(4.0 * 2.8))]
    assert not any(s.id == "surf_wide_north" for s in geo.surfaces)          # no exterior remainder
    _building(geo)


def test_custom_assembly_ids_are_used(ladakh_layout):
    ids = AssemblyIds(wall="w1", roof="r1", ground_floor="g1", interfloor="i1", partition="p1")
    used = {s.assembly_id for s in resolve_geometry(ladakh_layout, assembly_ids=ids).surfaces}
    assert used == {"w1", "r1", "g1", "i1", "p1"}


def test_zone_and_floor_objects(ladakh_layout):
    geo = resolve_geometry(ladakh_layout)
    assert [f.level for f in geo.floors] == [0, 1]
    assert geo.floors[1].elevation_m == pytest.approx(ladakh_layout.height_m)
    by_id = {z.id: z for z in geo.zones}
    for lz in ladakh_layout.zones:
        z = by_id[lz.zone_id]
        assert (z.size_m.length_m, z.size_m.width_m, z.size_m.height_m) == (lz.length_m, lz.width_m, lz.height_m)
        assert (z.origin_m.x, z.origin_m.y, z.origin_m.z) == lz.origin_m
