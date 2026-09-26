"""PRD 13.3 / 13.7: material quantities match geometry hand checks."""

import copy

import pytest
from cocoon_contracts import BuildingModel, ErrorCode, SimulationResult

from economics.errors import EconomicsError
from economics.models import QuantityOverride
from economics.quantities import apply_overrides, compute_quantities


def _q(building, materials, simulation=None):
    sim = SimulationResult.model_validate(simulation) if simulation else None
    return compute_quantities(BuildingModel.model_validate(building), materials, sim)


def test_airlock_living_areas_match_hand_check(building, materials, simulation):
    q = _q(building, materials, simulation)
    # walls: airlock 11.2 + 3.36 + 3.36, living 11.2 + 13.44 + 13.44 = 56.0 m2 gross;
    # minus entry door 1.8 and living window 2.4 = 51.8 m2 net
    assert q.areas["wall"].gross_m2 == pytest.approx(56.0)
    assert q.areas["wall"].openings_m2 == pytest.approx(4.2)
    assert q.areas["wall"].net_m2 == pytest.approx(51.8)
    # partition 11.2 m2 minus the 1.8 m2 airlock->living door
    assert q.areas["partition"].net_m2 == pytest.approx(9.4)
    assert q.areas["roof"].net_m2 == pytest.approx(4.8 + 19.2)
    assert q.areas["floor"].net_m2 == pytest.approx(4.8 + 19.2)
    assert q.floor_area_m2 == pytest.approx(1.2 * 4.0 + 4.8 * 4.0)
    assert q.constructed_area_m2 == pytest.approx(56.0 + 11.2 + 24.0 + 24.0)


def test_airlock_living_material_volumes_and_masses(building, materials, simulation):
    q = _q(building, materials, simulation)
    # PUF: wall 51.8*0.05 + partition 9.4*0.05 + roof 24*0.08 + floor 24*0.05
    puf = 51.8 * 0.05 + 9.4 * 0.05 + 24.0 * 0.08 + 24.0 * 0.05
    assert q.materials["mat_puf"].volume_m3 == pytest.approx(puf)
    assert q.materials["mat_puf"].mass_kg == pytest.approx(puf * 35.0)
    assert q.materials["mat_stone"].volume_m3 == pytest.approx(51.8 * 0.15)
    assert q.materials["mat_stone"].mass_kg == pytest.approx(51.8 * 0.15 * 2300.0)
    # plywood: partition 2 x 12 mm on 9.4 m2 + roof 80 mm on 24 m2
    assert q.materials["mat_plywood"].volume_m3 == pytest.approx(9.4 * 0.024 + 24.0 * 0.08)
    assert q.materials["mat_concrete"].volume_m3 == pytest.approx(24.0 * 0.10)
    # per-layer rows sum to the per-material totals
    assert sum(l.volume_m3 for l in q.layers if l.material_id == "mat_puf") == pytest.approx(puf)
    assert q.total_material_mass_kg == pytest.approx(sum(m.mass_kg for m in q.materials.values()))


def test_opening_stair_and_heater_counts(building, materials, simulation):
    q = _q(building, materials, simulation)
    o = q.openings
    assert (o.window_count, o.window_area_m2) == (1, pytest.approx(2.4))
    assert (o.external_door_count, o.internal_door_count) == (1, 1)
    assert q.staircase_count == 0
    assert q.heater_count == 1
    assert q.heaters[0].hvac_id == "heater_ground"
    assert q.heaters[0].zone_ids == ["living"]
    assert q.heater_design_peak_kw_total == pytest.approx(4.8)   # living zone peak


def test_two_floor_slab_described_from_both_sides_is_counted_once(two_floor, materials):
    q = _q(two_floor, materials)
    # living_f0 ceiling and sleeping_f1 floor are the same 19.2 m2 slab
    assert q.areas["intermediate_floor"].surface_count == 1
    assert q.areas["intermediate_floor"].gross_m2 == pytest.approx(19.2)
    assert len(q.deduplicated_surface_ids) == 1
    assert q.materials["mat_plywood"].volume_m3 == pytest.approx(19.2 * 0.025)
    assert q.staircase_count == 1
    assert q.heater_count == 2 and q.floor_count == 2


def test_explicit_adjacent_surface_pair_is_counted_once(building, materials):
    b = copy.deepcopy(building)
    part = next(s for s in b["surfaces"] if s["id"] == "surf_partition_airlock_living")
    twin = dict(part, id="surf_partition_living_side", owning_zone_id="living",
                adjacent_zone_id="airlock", adjacent_surface_id=part["id"])
    part["adjacent_surface_id"] = twin["id"]
    b["surfaces"].append(twin)
    q = _q(b, materials)
    assert q.areas["partition"].surface_count == 1
    assert q.areas["partition"].net_m2 == pytest.approx(9.4)


def test_openings_larger_than_parent_surface_are_rejected(building, materials):
    b = copy.deepcopy(building)
    for op in b["openings"]:
        if op["id"] == "op_living_south_window":
            op["area_m2"] = 50.0
    with pytest.raises(EconomicsError) as e:
        _q(b, materials)
    assert e.value.code == ErrorCode.ZONE_GEOMETRY_INVALID


def test_material_missing_from_snapshot_is_rejected(building, materials):
    b = copy.deepcopy(building)
    b["assemblies"]["asm_wall_insulated"]["layers"].append({"material_id": "mat_unobtainium",
                                                            "thickness_mm": 10})
    with pytest.raises(EconomicsError) as e:
        _q(b, materials)
    assert e.value.code == ErrorCode.UNSUPPORTED_MATERIAL


def test_overrides_need_a_reason_and_are_recorded(building, materials, simulation):
    with pytest.raises(ValueError):
        QuantityOverride(key="heater_count", value=2, reason="")
    q = _q(building, materials, simulation)
    q2 = apply_overrides(q, [QuantityOverride(key="heater_count", value=2,
                                              reason="second heater for redundancy per unit SOP")])
    assert q.heater_count == 1 and q2.heater_count == 2          # original untouched
    rec = q2.overrides_applied[0]
    assert (rec.key, rec.original_value, rec.new_value) == ("heater_count", 1, 2)
    assert "redundancy" in rec.reason


def test_unknown_override_key_is_rejected(building, materials):
    q = _q(building, materials)
    with pytest.raises(EconomicsError):
        apply_overrides(q, [QuantityOverride(key="wall_area_fudge", value=1, reason="because I said")])
