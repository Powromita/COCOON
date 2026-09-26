"""The stand-in evaluator is the test bed for M6, so its physics is checked here (against hand calculations).

This validates the stand-in only. It says nothing about the real M4.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from cocoon_contracts.simulation import SimulationEngineMode as Mode

from optimization.rc_verification import SimulationJob, run_checked
from optimization.tests.conftest import T0, load_fixture, user_room
from optimization.tests.standins import (
    CP_AIR,
    RHO_AIR,
    StandInEvaluator,
    assemble_network,
    constant_weather,
    make_winter_weather,
)

COLD = "wx_standin_const"
ACH = 0.7


@pytest.fixture(scope="module")
def cold_eval(snapshot):
    return StandInEvaluator(snapshot, {COLD: constant_weather(-10.0, 0.0)})


def _job(building, mode, *, setpoint=18.0, days=30, wx=COLD, **kw):
    return SimulationJob(building=building, weather_snapshot_id=wx, mode=mode, window_start=T0,
                         window_end=T0 + timedelta(days=days), setpoint_c=setpoint, timestep_seconds=3600,
                         air_changes_per_hour=ACH, **kw)


def _ua_plus_infiltration(building) -> float:
    """Whole-room conductance to the outside (walls, roof, floor to ground, infiltration), from the assemblies."""
    u = {a.category.value: a.u_value_w_m2k for a in building.assemblies.values()}
    z = building.floors[0].zones[0].size_m
    walls = 2 * (z.length_m + z.width_m) * z.height_m
    plan = z.length_m * z.width_m
    infiltration = RHO_AIR * CP_AIR * ACH * plan * z.height_m / 3600.0
    return walls * u["wall"] + plan * u["roof"] + plan * u["floor"] + infiltration


# ------------------------------------------------------------------ steady state against the hand formula
def test_free_floating_room_settles_at_outdoor_plus_gain_over_conductance(cold_eval, snapshot):
    room = user_room(occupants=5)                                    # 5 people x 100 W = 500 W
    # time constant is about 5 days (stone walls store a lot of heat), so run long enough to settle
    result = run_checked(cold_eval, _job(room, Mode.FREE_FLOATING, days=58))
    expected = -10.0 + 500.0 / _ua_plus_infiltration(room)
    assert result.time_series[-1].zone_temperatures_c["room"] == pytest.approx(expected, abs=0.05)
    assert result.summary.heating_energy_kwh == 0.0 and result.summary.peak_heating_kw == 0.0


def test_ideal_load_holds_the_setpoint_and_the_power_matches_the_hand_formula(cold_eval):
    room = user_room(occupants=5)
    result = run_checked(cold_eval, _job(room, Mode.IDEAL_LOAD_CONDITIONED, setpoint=18.0))
    expected_w = _ua_plus_infiltration(room) * (18.0 - (-10.0)) - 500.0
    last = result.time_series[-1]
    assert last.zone_temperatures_c["room"] == pytest.approx(18.0, abs=1e-6)
    assert last.heating_power_w["room"] == pytest.approx(expected_w, rel=1e-4)
    assert result.summary.unmet_hours == 0.0


def test_hand_formula_uses_the_stand_ins_own_conductances(cold_eval, snapshot):
    room = user_room(occupants=5)
    net = assemble_network(room, snapshot, ACH, 100.0, ground_is_ambient=False)
    assert float(net.G_amb[0] + net.G_gnd[0]) == pytest.approx(_ua_plus_infiltration(room), rel=1e-9)


# ------------------------------------------------------------------ physical behaviour
def test_more_insulation_means_less_heating(cold_eval):
    thin = user_room(wall=(("mat_stone", 200), ("mat_puf", 50)), roof=(("mat_plywood", 100), ("mat_puf", 50)))
    thick = user_room(wall=(("mat_stone", 200), ("mat_puf", 250)), roof=(("mat_plywood", 100), ("mat_puf", 250)))
    e = {k: run_checked(cold_eval, _job(b, Mode.IDEAL_LOAD_CONDITIONED)).summary.heating_energy_kwh
         for k, b in (("thin", thin), ("thick", thick))}
    assert e["thick"] < e["thin"]


def test_a_higher_setpoint_never_lowers_the_heating_demand(cold_eval):
    room = user_room()
    energy = [run_checked(cold_eval, _job(room, Mode.IDEAL_LOAD_CONDITIONED, setpoint=s)).summary.heating_energy_kwh
              for s in (5.0, 10.0, 15.0, 18.0, 21.0)]
    assert energy == sorted(energy) and energy[0] < energy[-1]


def test_colder_weather_means_more_heating(snapshot):
    ev = StandInEvaluator(snapshot, {"wx_a": constant_weather(-5.0, snapshot_id="wx_a"), "wx_b": constant_weather(-25.0, snapshot_id="wx_b")})
    room = user_room()
    mild, harsh = (run_checked(ev, _job(room, Mode.IDEAL_LOAD_CONDITIONED, wx=w)).summary.heating_energy_kwh for w in ("wx_a", "wx_b"))
    assert harsh > mild


def test_heater_only_runs_when_a_zone_is_below_the_setpoint(cold_eval):
    hot = constant_weather(30.0, snapshot_id="wx_hot")
    ev = StandInEvaluator(cold_eval.materials, {"wx_hot": hot})
    result = run_checked(ev, _job(user_room(), Mode.IDEAL_LOAD_CONDITIONED, setpoint=18.0, days=20, wx="wx_hot", initial_temperature_c=30.0))
    assert result.summary.heating_energy_kwh == 0.0


def test_a_south_window_gathers_more_sun_than_a_north_one(snapshot):
    ev = StandInEvaluator(snapshot, {"wx_sun": make_winter_weather("wx_sun", days=7)})
    total = {}
    for face in ("south", "north"):
        room = user_room(windows=[{"zone": "room", "face": face, "width_m": 1.2, "height_m": 1.2, "count": 2}])
        res = run_checked(ev, _job(room, Mode.FREE_FLOATING, days=7, wx="wx_sun", initial_temperature_c=0.0))
        total[face] = sum(p.solar_gain_w["room"] for p in res.time_series)
    assert total["south"] > total["north"] > 0


def test_turning_the_building_turns_the_solar_gain(snapshot):
    ev = StandInEvaluator(snapshot, {"wx_sun": make_winter_weather("wx_sun", days=7)})
    total = {}
    for orientation in (180, 0):                                     # the same south-side window now faces north
        room = user_room(orientation=orientation, windows=[{"zone": "room", "face": "south", "count": 2}])
        res = run_checked(ev, _job(room, Mode.FREE_FLOATING, days=7, wx="wx_sun", initial_temperature_c=0.0))
        total[orientation] = sum(p.solar_gain_w["room"] for p in res.time_series)
    assert total[180] > total[0]


# ------------------------------------------------------------------ capacity-limited mode
def test_capacity_limited_mode_caps_the_power_and_reports_unmet_hours(cold_eval):
    room = user_room(occupants=5)
    ideal = run_checked(cold_eval, _job(room, Mode.IDEAL_LOAD_CONDITIONED))
    steady_kw = ideal.time_series[-1].heating_power_w["room"] / 1000.0
    small = run_checked(cold_eval, _job(room, Mode.CAPACITY_LIMITED_CONDITIONED, heater_capacity_kw=steady_kw / 2))
    assert max(p.heating_power_w["room"] for p in small.time_series) <= steady_kw / 2 * 1000.0 + 1e-6
    assert small.summary.unmet_hours > ideal.summary.unmet_hours == 0.0
    assert small.summary.heating_energy_kwh < ideal.summary.heating_energy_kwh


def test_a_big_enough_heater_reproduces_the_ideal_load(cold_eval):
    room = user_room()
    ideal = run_checked(cold_eval, _job(room, Mode.IDEAL_LOAD_CONDITIONED))
    big = run_checked(cold_eval, _job(room, Mode.CAPACITY_LIMITED_CONDITIONED, heater_capacity_kw=ideal.summary.peak_heating_kw * 2))
    assert big.summary.heating_energy_kwh == pytest.approx(ideal.summary.heating_energy_kwh)
    assert big.summary.unmet_hours == ideal.summary.unmet_hours


# ------------------------------------------------------------------ conservation, determinism, real M2 designs
def test_the_energy_balance_closes_to_rounding(evaluator, ladakh_candidates):
    for c in ladakh_candidates[:2]:
        for mode, cap in ((Mode.FREE_FLOATING, None), (Mode.IDEAL_LOAD_CONDITIONED, None), (Mode.CAPACITY_LIMITED_CONDITIONED, 2.0)):
            job = SimulationJob.from_candidate(c, weather_snapshot_id="wx_standin_leh", mode=mode, window_start=T0,
                                               window_end=T0 + timedelta(days=5), setpoint_c=15.0, timestep_seconds=3600,
                                               heater_capacity_kw=cap)
            assert run_checked(evaluator, job).summary.energy_residual_max_pct < 1e-6


def test_heat_supplied_equals_heat_lost_at_steady_state_in_a_two_room_building(snapshot):
    """Room A is heated, room B is not; they share a wall. At steady state P_A = losses of A + B to the outside."""
    from design_generator import resolve_user_geometry
    shelter = {
        "zones": [{"id": "A", "type": "living", "floor_level": 0, "origin_m": {"x": 0.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0, "height_m": 2.8}},
                  {"id": "B", "type": "storage", "floor_level": 0, "origin_m": {"x": 4.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0, "height_m": 2.8}}],
        "assemblies": {"wall": [["mat_stone", 200], ["mat_puf", 100]], "roof": [["mat_plywood", 100], ["mat_puf", 100]],
                       "floor": [["mat_stone", 150], ["mat_puf", 50]], "partition": [["mat_plywood", 12], ["mat_puf", 50], ["mat_plywood", 12]]},
        "occupants": {"A": 4}, "heater_zones": ["A"],
    }
    building = resolve_user_geometry(shelter, load_fixture("material_snapshot_standard.json"), created_at=T0).building
    ev = StandInEvaluator(snapshot, {COLD: constant_weather(-10.0)})
    res = run_checked(ev, _job(building, Mode.IDEAL_LOAD_CONDITIONED, setpoint=18.0, days=40))
    last = res.time_series[-1]
    net = assemble_network(building, snapshot, ACH, 100.0, ground_is_ambient=False)
    t = [last.zone_temperatures_c[z] for z in net.zone_ids]
    losses = sum(float(net.G_amb[i] + net.G_gnd[i]) * (t[i] + 10.0) for i in range(2))
    gains = 4 * 100.0
    assert last.heating_power_w["A"] + gains == pytest.approx(losses, rel=1e-4)
    assert -10.0 < t[1] < t[0] == pytest.approx(18.0, abs=1e-6)          # the unheated room sits between


def test_same_job_same_answer(evaluator, ladakh_candidates):
    job = SimulationJob.from_candidate(ladakh_candidates[0], weather_snapshot_id="wx_standin_leh", mode=Mode.IDEAL_LOAD_CONDITIONED,
                                       window_start=T0, window_end=T0 + timedelta(days=3), setpoint_c=15.0, timestep_seconds=3600)
    assert evaluator.simulate(job).model_dump() == evaluator.simulate(job).model_dump()


def test_a_real_m2_design_gives_a_sensible_picture(evaluator, ladakh_candidates):
    c = ladakh_candidates[0]
    kw = dict(weather_snapshot_id="wx_standin_leh", window_start=T0, window_end=T0 + timedelta(days=7), setpoint_c=15.0, timestep_seconds=3600)
    free = run_checked(evaluator, SimulationJob.from_candidate(c, mode=Mode.FREE_FLOATING, **kw))
    ideal = run_checked(evaluator, SimulationJob.from_candidate(c, mode=Mode.IDEAL_LOAD_CONDITIONED, **kw))
    zones = {z.id for f in c.building.floors for z in f.zones}
    assert {z.zone_id for z in ideal.zones} == zones and len(ideal.time_series) == 168
    assert free.summary.unmet_hours > 0 and ideal.summary.unmet_hours == 0.0        # cold without a heater, comfortable with
    assert ideal.summary.heating_energy_kwh > 0
    heated = {z.zone_id for z in ideal.zones if z.peak_heating_kw > 0}
    assert heated <= {"living", "sleeping"}                                        # only rooms that have a heater draw power


def test_unknown_weather_is_a_failed_run(snapshot, ladakh_candidates):
    from optimization.rc_verification import EvaluationFailedError
    ev = StandInEvaluator(snapshot, {})
    job = SimulationJob.from_candidate(ladakh_candidates[0], weather_snapshot_id="wx_missing", mode=Mode.FREE_FLOATING,
                                       window_start=T0, window_end=T0 + timedelta(days=1), setpoint_c=15.0)
    with pytest.raises(EvaluationFailedError) as e:
        run_checked(ev, job)
    assert e.value.code == "WEATHER_NOT_FOUND"


# ------------------------------------------------------------------ hand checks that pin down the two subtle conductances
def test_the_floor_exchanges_heat_with_the_ground_not_the_air(snapshot):
    """Ground at +5 C, air at -10 C: the steady temperature must sit between them by the U*A weights."""
    room = user_room(occupants=5)
    u = {a.category.value: a.u_value_w_m2k for a in room.assemblies.values()}
    z = room.floors[0].zones[0].size_m
    plan = z.length_m * z.width_m
    g_floor = plan * u["floor"]
    g_air = 2 * (z.length_m + z.width_m) * z.height_m * u["wall"] + plan * u["roof"] + \
        RHO_AIR * CP_AIR * ACH * plan * z.height_m / 3600.0
    expected = (500.0 + g_air * (-10.0) + g_floor * 5.0) / (g_air + g_floor)
    ev = StandInEvaluator(snapshot, {COLD: constant_weather(-10.0)})
    result = run_checked(ev, _job(room, Mode.FREE_FLOATING, days=58, ground_temperature_c=5.0))
    assert result.time_series[-1].zone_temperatures_c["room"] == pytest.approx(expected, abs=0.02)
    # with no ground temperature the floor falls back to the air temperature
    same = run_checked(ev, _job(room, Mode.FREE_FLOATING, days=58, ground_temperature_c=None))
    assert same.time_series[-1].zone_temperatures_c["room"] == pytest.approx(-10.0 + 500.0 / _ua_plus_infiltration(room), abs=0.02)


def test_a_shared_wall_conducts_exactly_once(snapshot):
    """Heated room A next to unheated room B: B's steady temperature follows from U*A of the shared wall and of B's
    own outside surfaces. Counting the shared wall twice (or not at all) would move it."""
    from design_generator import resolve_user_geometry
    shelter = {
        "zones": [{"id": "A", "type": "living", "floor_level": 0, "origin_m": {"x": 0.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0, "height_m": 2.8}},
                  {"id": "B", "type": "storage", "floor_level": 0, "origin_m": {"x": 4.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0, "height_m": 2.8}}],
        "assemblies": {"wall": [["mat_stone", 200], ["mat_puf", 100]], "roof": [["mat_plywood", 100], ["mat_puf", 100]],
                       "floor": [["mat_stone", 150], ["mat_puf", 50]], "partition": [["mat_plywood", 12], ["mat_puf", 50], ["mat_plywood", 12]]},
        "occupants": {"A": 4}, "heater_zones": ["A"],
    }
    building = resolve_user_geometry(shelter, load_fixture("material_snapshot_standard.json"), created_at=T0).building
    u = {a.category.value: a.u_value_w_m2k for a in building.assemblies.values()}
    g_ab = u["partition"] * (4.0 * 2.8)                                   # one wall, 4 m x 2.8 m
    # B: outside walls east + south + north (3 x 11.2 m2), roof and floor 16 m2 each (ground is -10 C here), infiltration
    g_b = 3 * 11.2 * u["wall"] + 16.0 * u["roof"] + 16.0 * u["floor"] + RHO_AIR * CP_AIR * ACH * (16.0 * 2.8) / 3600.0
    expected_b = (g_ab * 18.0 + g_b * (-10.0)) / (g_ab + g_b)
    ev = StandInEvaluator(snapshot, {COLD: constant_weather(-10.0)})
    res = run_checked(ev, _job(building, Mode.IDEAL_LOAD_CONDITIONED, setpoint=18.0, days=58))
    assert res.time_series[-1].zone_temperatures_c["B"] == pytest.approx(expected_b, abs=0.02)
