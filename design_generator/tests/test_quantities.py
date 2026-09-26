"""Stage 7 tests: quantities, checked against hand calculations."""

from __future__ import annotations

import json

import pytest
from cocoon_contracts.building import (
    AssemblyCategory,
    AssemblyLayer,
    BuildingModel,
    ConstructionAssembly,
    Opening,
    OpeningType,
)
from cocoon_contracts.materials import MaterialSnapshot

from design_generator.connection_detector import detect_connections
from design_generator.geometry_resolver import resolve_geometry
from design_generator.layout_generator import Layout, StairLayout, ZoneLayout, generate_layout
from design_generator.quantities import QuantityError, compute_quantities
from design_generator.requirement_parser import parse_requirements
from design_generator.template_catalog import filter_templates
from design_generator.tests.conftest import load_fixture, make_building


# ------------------------------------------------------------------ helpers
@pytest.fixture
def snapshot() -> MaterialSnapshot:
    return MaterialSnapshot.model_validate(load_fixture("material_snapshot_standard.json"))


def _rho(snapshot, material_id):
    return snapshot.materials[material_id].properties.density_kg_m3


def _assemblies(wall=(("mat_stone", 200.0), ("mat_puf", 100.0))):
    def asm(aid, cat, layers):
        return ConstructionAssembly(id=aid, name=aid, category=AssemblyCategory(cat),
                                    layers=[AssemblyLayer(material_id=m, thickness_mm=t) for m, t in layers])
    return {
        "asm_wall": asm("asm_wall", "wall", wall),
        "asm_roof": asm("asm_roof", "roof", [("mat_plywood", 100.0), ("mat_puf", 100.0)]),
        "asm_ground_floor": asm("asm_ground_floor", "floor", [("mat_stone", 150.0), ("mat_puf", 50.0)]),
        "asm_interfloor": asm("asm_interfloor", "ceiling", [("mat_plywood", 25.0)]),
        "asm_partition": asm("asm_partition", "partition",
                             [("mat_plywood", 12.0), ("mat_puf", 50.0), ("mat_plywood", 12.0)]),
    }


def _zone(zid, level, x, y, l, w, h=2.8, entrance=False):
    return ZoneLayout(zid, "room", level, (x, y, round(level * h, 1)), l, w, h, (), False, entrance)


def _window(op_id, parent, area, glazing="glz_double"):
    return Opening(id=op_id, parent_surface_id=parent, opening_type=OpeningType.WINDOW, area_m2=area,
                   u_value_w_m2k=1.8, shgc=0.62, glazing_id=glazing, frame_fraction=0.15,
                   shading_factor=1.0, is_operable=False)


def _build(layout, extra_openings=(), assemblies=None):
    geo = resolve_geometry(layout)
    conn = detect_connections(layout, geo)
    return make_building(geo, list(conn.openings) + list(extra_openings), conn.connections,
                         assemblies=assemblies or _assemblies())


def _single_room(assemblies=None):
    layout = Layout("t", 0, 1, 1, 6.0, 4.0, 2.8, (_zone("room", 0, 0.0, 0.0, 6.0, 4.0, entrance=True),), (), (), ())
    return _build(layout, [_window("w", "surf_room_south", 2.0)], assemblies)


# ------------------------------------------------------------------ hand-checked single room
def test_single_room_areas_by_hand(snapshot):
    q = compute_quantities(_single_room(), snapshot)
    # 6 x 4 x 2.8 m room: walls 2*(6+4)*2.8 = 56.0; window 2.0 + entrance door 1.8 removed
    assert q.areas["exterior_wall"].gross_m2 == pytest.approx(56.0)
    assert q.areas["exterior_wall"].net_m2 == pytest.approx(52.2)
    assert q.areas["roof"].net_m2 == pytest.approx(24.0)
    assert q.areas["ground_floor"].net_m2 == pytest.approx(24.0)
    assert q.areas["partition"].gross_m2 == 0.0 and q.areas["interfloor"].gross_m2 == 0.0
    assert q.gross_floor_area_m2 == pytest.approx(24.0) and q.volume_m3 == pytest.approx(67.2)
    assert (q.zone_count, q.floor_count, q.staircases, q.stair_footprint_m2) == (1, 1, 0, 0.0)


def test_single_room_layer_volumes_and_masses_by_hand(snapshot):
    q = compute_quantities(_single_room(), snapshot)
    wall = q.assembly("asm_wall")
    assert wall.area_m2 == pytest.approx(52.2)
    assert [(l.material_id, l.volume_m3) for l in wall.layers] == [
        ("mat_stone", pytest.approx(52.2 * 0.200)), ("mat_puf", pytest.approx(52.2 * 0.100))]   # 10.44, 5.22
    assert q.assembly("asm_roof").layers[0].volume_m3 == pytest.approx(2.4)                      # 24 x 0.1
    assert q.assembly("asm_ground_floor").layers[0].volume_m3 == pytest.approx(3.6)              # 24 x 0.15
    assert q.assembly("asm_ground_floor").layers[1].volume_m3 == pytest.approx(1.2)              # 24 x 0.05

    stone, puf, ply = q.material("mat_stone"), q.material("mat_puf"), q.material("mat_plywood")
    assert stone.volume_m3 == pytest.approx(10.44 + 3.6)
    assert puf.volume_m3 == pytest.approx(5.22 + 2.4 + 1.2)
    assert ply.volume_m3 == pytest.approx(2.4)
    assert stone.mass_kg == pytest.approx(14.04 * _rho(snapshot, "mat_stone"), abs=1e-3)
    assert puf.mass_kg == pytest.approx(8.82 * _rho(snapshot, "mat_puf"), abs=1e-3)
    assert ply.mass_kg == pytest.approx(2.4 * _rho(snapshot, "mat_plywood"), abs=1e-3)
    assert stone.area_m2 == pytest.approx(52.2 + 24.0)                    # wall layer + floor layer
    assert puf.area_m2 == pytest.approx(52.2 + 24.0 + 24.0)               # wall + roof + floor


def test_single_room_openings(snapshot):
    o = compute_quantities(_single_room(), snapshot).openings
    assert (o.windows_count, o.windows_area_m2) == (1, pytest.approx(2.0))
    assert o.windows_by_orientation["south"] == {"count": 1, "area_m2": 2.0}
    assert o.windows_by_orientation["north"] == {"count": 0, "area_m2": 0.0}
    assert dict(o.glazing_counts) == {"glz_double": 1}
    assert (o.doors_count, o.exterior_doors, o.internal_doors, o.doors_area_m2) == (1, 1, 0, pytest.approx(1.8))


def test_unused_assemblies_are_left_out(snapshot):
    q = compute_quantities(_single_room(), snapshot)
    assert {a.assembly_id for a in q.assemblies} == {"asm_wall", "asm_roof", "asm_ground_floor"}


def test_doubling_a_layer_thickness_doubles_only_that_volume(snapshot):
    base = compute_quantities(_single_room(), snapshot).assembly("asm_wall")
    thick = compute_quantities(_single_room(_assemblies(wall=(("mat_stone", 400.0), ("mat_puf", 100.0)))), snapshot)
    wall = thick.assembly("asm_wall")
    assert wall.layers[0].volume_m3 == pytest.approx(2 * base.layers[0].volume_m3)
    assert wall.layers[1].volume_m3 == pytest.approx(base.layers[1].volume_m3)
    assert wall.total_thickness_mm == pytest.approx(500.0)


# ------------------------------------------------------------------ pairs are counted once
def test_shared_wall_is_counted_once_and_door_comes_off_it(snapshot):
    layout = Layout("t", 0, 1, 1, 6.0, 4.0, 2.8,
                    (_zone("airlock", 0, 0.0, 0.0, 1.2, 4.0, entrance=True), _zone("living", 0, 1.2, 0.0, 4.8, 4.0)),
                    (), (("airlock", "living", "door"),), ())
    q = compute_quantities(_build(layout), snapshot)
    # one 4.0 x 2.8 = 11.2 m2 wall, not two; the 1.8 m2 internal door reduces it
    assert q.areas["partition"].gross_m2 == pytest.approx(11.2)
    assert q.areas["partition"].net_m2 == pytest.approx(9.4)
    assert q.areas["exterior_wall"].gross_m2 == pytest.approx(56.0)
    assert q.areas["exterior_wall"].net_m2 == pytest.approx(54.2)          # entrance door only
    part = q.assembly("asm_partition")
    assert [l.volume_m3 for l in part.layers] == [pytest.approx(9.4 * 0.012), pytest.approx(9.4 * 0.05),
                                                  pytest.approx(9.4 * 0.012)]
    assert q.warnings == ()
    assert (q.openings.internal_doors, q.openings.exterior_doors) == (1, 1)


def test_slab_pair_counted_once_and_stair_void_removed(snapshot):
    zones = (_zone("airlock_f0", 0, 0.0, 0.0, 1.2, 4.0, entrance=True), _zone("living_f0", 0, 1.2, 0.0, 4.8, 4.0),
             _zone("sleeping_f1", 1, 1.2, 0.0, 4.8, 4.0))
    stairs = (StairLayout("stair_0", "living_f0", "sleeping_f1", 1.2, 0.0, 3.0, 1.0),)
    layout = Layout("t", 0, 1, 2, 6.0, 4.0, 2.8, zones, stairs,
                    (("airlock_f0", "living_f0", "door"), ("living_f0", "sleeping_f1", "stair")), ())
    q = compute_quantities(_build(layout), snapshot)
    assert q.areas["interfloor"].gross_m2 == pytest.approx(19.2)           # once, not 38.4
    assert q.areas["interfloor"].net_m2 == pytest.approx(19.2 - 3.0)       # stair void removed
    assert q.areas["roof"].net_m2 == pytest.approx(4.8 + 19.2)             # airlock roof + sleeping roof
    assert q.areas["ground_floor"].net_m2 == pytest.approx(24.0)
    assert (q.staircases, q.stair_footprint_m2, q.floor_count, q.zone_count) == (1, 3.0, 2, 3)
    assert q.gross_floor_area_m2 == pytest.approx(4.8 + 19.2 + 19.2)


# ------------------------------------------------------------------ whole generated building
@pytest.fixture
def ladakh_building(requirements_ladakh):
    spec = parse_requirements(requirements_ladakh)
    match = next(m for m in filter_templates(requirements_ladakh["mission"]["required_rooms"], 2)
                 if m.template.id == "two_floor_compact")
    layout = generate_layout(match, spec, 7)
    return layout, _build(layout)


def test_generated_building_identities(ladakh_building, snapshot):
    layout, building = ladakh_building
    q = compute_quantities(building, snapshot)
    L, W, H = layout.footprint_length_m, layout.footprint_width_m, layout.height_m
    assert q.areas["exterior_wall"].gross_m2 == pytest.approx(2 * (L + W) * H * 2)
    assert q.areas["roof"].gross_m2 == pytest.approx(L * W)
    assert q.areas["ground_floor"].gross_m2 == pytest.approx(L * W)
    assert q.areas["interfloor"].gross_m2 == pytest.approx(L * W)            # each slab pair once
    half_partitions = sum(s.area_m2 for s in building.surfaces if s.surface_type.value == "partition") / 2
    assert q.areas["partition"].gross_m2 == pytest.approx(half_partitions)
    assert q.warnings == ()

    # assemblies cover exactly the net area of every group
    assert sum(a.area_m2 for a in q.assemblies) == pytest.approx(sum(a.net_m2 for a in q.areas.values()))
    for a in q.assemblies:
        for l in a.layers:
            assert l.volume_m3 == pytest.approx(a.area_m2 * l.thickness_mm / 1000.0, abs=1e-5)
    # material totals equal the sum of their layers, and mass = volume x density
    for m in q.materials:
        layers = [l for a in q.assemblies for l in a.layers if l.material_id == m.material_id]
        assert m.volume_m3 == pytest.approx(sum(l.volume_m3 for l in layers), abs=1e-5)
        assert m.mass_kg == pytest.approx(m.volume_m3 * _rho(snapshot, m.material_id), rel=1e-4)


@pytest.mark.parametrize("seed", range(10))
def test_many_seeds_are_consistent(requirements_ladakh, snapshot, seed):
    spec = parse_requirements(requirements_ladakh)
    match = next(m for m in filter_templates(requirements_ladakh["mission"]["required_rooms"], 2)
                 if m.template.id == "two_floor_compact")
    layout = generate_layout(match, spec, seed)
    q = compute_quantities(_build(layout), snapshot)
    assert q.areas["roof"].gross_m2 == pytest.approx(layout.footprint_length_m * layout.footprint_width_m)
    assert q.areas["exterior_wall"].net_m2 == pytest.approx(q.areas["exterior_wall"].gross_m2 - 1.8)
    assert q.warnings == ()


# ------------------------------------------------------------------ inputs and errors
def test_without_a_snapshot_volumes_exist_but_masses_do_not():
    q = compute_quantities(_single_room())
    assert q.materials_snapshot_id is None
    assert all(m.mass_kg is None and m.volume_m3 > 0 for m in q.materials)
    assert all(l.mass_kg is None for a in q.assemblies for l in a.layers)


def test_material_missing_from_snapshot_is_an_error(snapshot):
    building = _single_room(_assemblies(wall=(("mat_unobtainium", 200.0),)))
    with pytest.raises(QuantityError) as err:
        compute_quantities(building, snapshot)
    assert err.value.code == "MATERIAL_NOT_IN_SNAPSHOT"


def test_openings_larger_than_their_surface_are_an_error(snapshot):
    layout = Layout("t", 0, 1, 1, 6.0, 4.0, 2.8, (_zone("room", 0, 0.0, 0.0, 6.0, 4.0, entrance=True),), (), (), ())
    with pytest.raises(QuantityError) as err:
        compute_quantities(_build(layout, [_window("huge", "surf_room_south", 20.0)]), snapshot)
    assert err.value.code == "OPENINGS_EXCEED_SURFACE"


def test_deterministic_and_json_serialisable(snapshot):
    building = _single_room()
    a, b = compute_quantities(building, snapshot), compute_quantities(building, snapshot)
    assert a == b
    data = json.loads(json.dumps(a.to_dict()))
    assert data["areas"]["exterior_wall"]["net_m2"] == pytest.approx(52.2)
    assert data["materials"][0]["material_id"] == "mat_plywood"
    assert data["heaters"] == []                                          # slot left for M6/M7


# ------------------------------------------------------------------ M0 fixtures (one-sided pairs)
def test_fixture_with_one_sided_partition_is_counted_once(snapshot):
    building = BuildingModel.model_validate(load_fixture("building_airlock_living.json"))
    q = compute_quantities(building, snapshot)
    assert q.areas["partition"].gross_m2 == pytest.approx(11.2)
    assert q.areas["partition"].net_m2 == pytest.approx(11.2 - 1.8)       # internal door on it
    assert any("counted once by itself" in w for w in q.warnings)


def test_fixture_slab_with_no_partner_ids_is_paired_by_inference(snapshot):
    building = BuildingModel.model_validate(load_fixture("building_two_floor_compact.json"))
    q = compute_quantities(building, snapshot)
    assert q.areas["interfloor"].gross_m2 == pytest.approx(19.2)           # not 38.4
    assert q.areas["interfloor"].net_m2 == pytest.approx(19.2 - 4.0)       # the fixture's 4.0 m2 stair void
    assert any("by inference" in w for w in q.warnings)
