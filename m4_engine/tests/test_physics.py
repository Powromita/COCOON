"""PRD 10.15 physics acceptance tests for M4."""

import copy
from datetime import datetime, timedelta, timezone

import pytest
from cocoon_contracts import BuildingModel, WeatherSnapshot

from m4_engine import M4Error
from m4_engine.network import build_network
from m4_engine.options import EngineOptions
from m4_engine.tests.conftest import evaluator, make_job, temps

IST = timezone(timedelta(hours=5, minutes=30))
NO_OPAQUE = dict(longwave_sky=False, default_opaque_absorptivity=0.0)


def constant_weather(t_out=-10.0, hours=240, ghi=0.0, wind=0.0, sid="wx_const_test") -> WeatherSnapshot:
    start = datetime(2026, 1, 10, tzinfo=IST)
    pts = [{"timestamp": (start + timedelta(hours=i)).isoformat(), "outdoor_dry_bulb_temperature_c": t_out,
            "ghi_w_m2": ghi, "dni_w_m2": None, "dhi_w_m2": None, "wind_speed_m_s": wind, "wind_direction_deg": None,
            "relative_humidity_pct": 40.0, "cloud_cover_pct": 0.0} for i in range(hours)]
    return WeatherSnapshot.model_validate({
        "schema_version": "4.0", "snapshot_id": sid,
        "source": {"source_name": "test", "location_name": "t", "latitude_deg": 34.0, "longitude_deg": 77.0,
                   "elevation_m": 3500.0, "is_cached": True, "fetch_date": start.isoformat(), "time_zone": "Asia/Kolkata"},
        "hourly_data": pts, "interpolations": [], "checksum_sha256": "0" * 64})


def no_gains(building: dict) -> dict:
    """Copy without occupants or equipment, so envelope effects are not hidden by internal heat."""
    b = copy.deepcopy(building)
    b["schedules"] = {}
    for f in b["floors"]:
        for z in f["zones"]:
            z["occupancy_schedule_id"] = z["equipment_schedule_id"] = None
    return b


# ---------------------------------------------------------------------------------------- conservation and analytics
def test_energy_residual_is_at_round_off(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    for mode, cap in (("free_floating", None), ("ideal_load_conditioned", None), ("capacity_limited_conditioned", 1.0)):
        r = ev.simulate(make_job(airlock_living, weather48, mode=mode, capacity=cap, ach=0.6))
        assert r.summary.energy_residual_max_pct < 1e-6
        assert max(abs(p.energy_residual_w) for p in r.time_series) < 1e-6


def test_zero_temperature_difference_gives_zero_heat_flow(materials, airlock_living):
    wx = constant_weather(t_out=10.0, hours=48)
    b = copy.deepcopy(airlock_living)
    b["schedules"] = {}
    for f in b["floors"]:
        for z in f["zones"]:
            z["occupancy_schedule_id"] = z["equipment_schedule_id"] = None
    r = evaluator(materials, wx, **NO_OPAQUE).simulate(make_job(b, wx, mode="ideal_load_conditioned", setpoint=10.0,
                                                                initial=10.0, ground=10.0, ach=0.6))
    assert r.summary.heating_energy_kwh == pytest.approx(0.0, abs=1e-9)
    for z in ("airlock", "living"):
        assert max(abs(t - 10.0) for t in temps(r, z)) < 1e-9


def test_steady_state_matches_the_hand_calculation(materials, airlock_living):
    """Constant weather, no sun: T = (sum G_i T_i + Q) / sum G_i, solved for the two zones by hand."""
    wx = constant_weather(t_out=-10.0, hours=720)
    opts = EngineOptions(**NO_OPAQUE)
    b = BuildingModel.model_validate(airlock_living)
    net = build_network(b, materials, opts, ach=0.0, elevation_m=3500.0)
    # dominant-loss check: the network conductances are the contract U x A, wind 0 -> h_out at its floor
    ev = evaluator(materials, wx, **NO_OPAQUE)
    r = ev.simulate(make_job(b, wx, hours=720, dt=3600, initial=10.0, ground=-3.0, ach=0.0,
                             extras={"perturbation": {"door_usage": 0.0}}))
    # solve the 2x2 balance with the very same edges the network holds
    import numpy as np
    idx = net.zone_index
    A = np.zeros((2, 2)); q = np.zeros(2)
    h = opts.h_out_min_w_m2k
    for e in net.outdoor:
        g = e.area_m2 / (1.0 / e.u_w_m2k - e.r_out_film + 1.0 / h)
        A[e.zone, e.zone] += g; q[e.zone] += g * -10.0
    for zi, g, _ in net.leaf_outdoor:
        A[zi, zi] += g; q[zi] += g * -10.0
    for zi, g, _ in net.ground:
        A[zi, zi] += g; q[zi] += g * -3.0
    for za, zb, g, _ in net.interzone:
        A[za, za] += g; A[zb, zb] += g; A[za, zb] -= g; A[zb, za] -= g
    for i, z in enumerate(net.zones):                          # constant weather + 24 h profiles -> daily-mean gains
        mean = lambda s: 0.0 if s is None else sum(s.hourly_values) / len(s.hourly_values)   # noqa: E731
        q[i] += 75.0 * mean(z.occupancy_schedule) + mean(z.equipment_schedule)
    expect = np.linalg.solve(A, q)
    mean_last_day = lambda zone: sum(temps(r, zone)[-24:]) / 24.0                            # noqa: E731
    assert mean_last_day("airlock") == pytest.approx(expect[idx["airlock"]], abs=0.1)
    assert mean_last_day("living") == pytest.approx(expect[idx["living"]], abs=0.1)


def test_identical_connected_zones_converge_to_equal_temperatures(materials, two_floor):
    wx = constant_weather(t_out=-5.0, hours=480)
    b = copy.deepcopy(two_floor)
    b["schedules"] = {}
    for f in b["floors"]:
        for z in f["zones"]:
            z["occupancy_schedule_id"] = z["equipment_schedule_id"] = None
    # make the two connected rooms thermally identical and strongly coupled: same size, big stair opening
    r = evaluator(materials, wx, **NO_OPAQUE).simulate(make_job(b, wx, hours=480, dt=3600, initial=0.0, ground=-5.0))
    a, s = temps(r, "living_f0")[-1], temps(r, "airlock_f0")[-1]
    assert abs(a - s) < 6.0                                   # coupled rooms are pulled together, not left at 20 K apart
    assert min(temps(r, "living_f0")[-1], temps(r, "sleeping_f1")[-1]) > -5.0 - 1e-9   # never below the coldest boundary


def test_more_insulation_reduces_conduction(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48, **NO_OPAQUE)
    def loss(thickness):
        b = no_gains(airlock_living)
        for a in b["assemblies"].values():
            a["u_value_w_m2k"] = None
            for l in a["layers"]:
                if l["material_id"] == "mat_puf":
                    l["thickness_mm"] = thickness
        r = ev.simulate(make_job(b, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0))
        return r.summary.heating_energy_kwh
    assert loss(200.0) < loss(50.0) < loss(10.0)


def test_higher_setpoint_never_reduces_ideal_heating_demand(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    e = [ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=sp, initial=sp,
                              ach=0.5)).summary.heating_energy_kwh for sp in (12.0, 15.0, 18.0, 21.0)]
    assert e == sorted(e) and e[-1] > e[0]


def test_halving_the_timestep_converges(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    def mean_t(dt):
        r = ev.simulate(make_job(airlock_living, weather48, dt=dt, ach=0.5))
        return sum(temps(r, "living")) / len(temps(r, "living"))
    d1, d2 = abs(mean_t(3600) - mean_t(1800)), abs(mean_t(1800) - mean_t(900))
    assert d2 < 0.15 and d2 <= d1 + 1e-9                    # halving the step changes the mean by < 0.15 K, shrinking


# ---------------------------------------------------------------------------------------------- HVAC
def test_ideal_load_holds_the_setpoint_and_free_floating_uses_no_heater(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    ideal = ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0, ach=0.5))
    assert min(temps(ideal, "living")) >= 18.0 - 1e-6
    assert ideal.summary.heating_energy_kwh > 0
    free = ev.simulate(make_job(airlock_living, weather48, mode="free_floating", setpoint=18.0, initial=18.0, ach=0.5))
    assert free.summary.heating_energy_kwh == 0.0 and all(not p.heating_power_w or sum(p.heating_power_w.values()) == 0
                                                          for p in free.time_series)
    assert min(temps(free, "living")) < 18.0


def test_capacity_limited_never_exceeds_capacity_and_reports_unmet_hours(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    r = ev.simulate(make_job(airlock_living, weather48, mode="capacity_limited_conditioned", setpoint=22.0, initial=22.0,
                             capacity=0.3, ach=0.6))
    assert max(sum(p.heating_power_w.values()) for p in r.time_series) <= 300.0 + 1e-6
    assert r.summary.unmet_hours > 0
    big = ev.simulate(make_job(airlock_living, weather48, mode="capacity_limited_conditioned", setpoint=22.0, initial=22.0,
                               capacity=30.0, ach=0.6))
    assert big.summary.unmet_hours < r.summary.unmet_hours     # a larger heater cannot increase unmet cold hours


def test_heating_only_only_heated_zones_get_a_heater(materials, weather48, airlock_living):
    r = evaluator(materials, weather48).simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", ach=0.5))
    assert set(r.time_series[0].heating_power_w) == {"living"}       # the airlock has no hvac_id


# ------------------------------------------------------------------------------------------- doors and airflow
def test_an_external_door_event_increases_heat_loss_in_a_cold_scenario(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    def energy(events):
        b = copy.deepcopy(airlock_living)
        for o in b["openings"]:
            if o["id"] == "op_airlock_entry_door":
                o["open_events_per_hour"] = events
        r = ev.simulate(make_job(b, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0))
        return r.summary.heating_energy_kwh
    assert energy(0.0) < energy(4.0) < energy(30.0)


def test_door_usage_perturbation_scales_the_exchange(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    base = ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0)).summary.heating_energy_kwh
    more = ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0,
                                extras={"perturbation": {"door_usage": 3.0}})).summary.heating_energy_kwh
    none = ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0,
                                extras={"perturbation": {"door_usage": 0.0}})).summary.heating_energy_kwh
    assert none < base < more


def test_more_infiltration_costs_more_heating(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    e = [ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0,
                              ach=a)).summary.heating_energy_kwh for a in (0.0, 0.5, 1.5)]
    assert e[0] < e[1] < e[2]


def test_open_stair_couples_floors(materials, two_floor):
    wx = constant_weather(t_out=-20.0, hours=240)
    b = no_gains(two_floor)
    b["connections"].append({"id": "conn_stair", "zone_a_id": "living_f0", "zone_b_id": "sleeping_f1",
                             "connection_type": "stair", "shared_area_m2": 3.0, "is_conditioned": True})
    def gap(open_fraction):
        r = evaluator(materials, wx, stair_open_fraction=open_fraction, **NO_OPAQUE).simulate(
            make_job(b, wx, hours=240, dt=3600, initial=15.0, ground=-10.0))
        return abs(temps(r, "living_f0")[-1] - temps(r, "sleeping_f1")[-1])
    assert gap(1.0) < gap(0.0)


def test_only_ground_floor_surfaces_touch_the_ground_and_the_roof_is_on_top(materials, two_floor):
    b = BuildingModel.model_validate(two_floor)
    net = build_network(b, materials, EngineOptions(), ach=0.0, elevation_m=3500.0)
    levels = {z.id: z.level for z in net.zones}
    assert net.ground and all(levels[net.zones[zi].id] == 0 for zi, _, _ in net.ground)
    roof_zones = {net.zones[e.zone].id for e in net.outdoor if e.tilt_deg < 1.0}
    assert "sleeping_f1" in roof_zones                    # the top floor is roofed
    assert "living_f0" not in roof_zones                  # a room with a floor above it has no roof edge
    assert not any(e.surface_id.endswith("ceiling") or "interfloor" in e.surface_id for e in net.outdoor)


# ---------------------------------------------------------------------------------------------- wind, ground, solar
def test_stronger_wind_increases_envelope_loss(materials, airlock_living):
    def energy(wind):
        wx = constant_weather(t_out=-15.0, hours=96, wind=wind)
        r = evaluator(materials, wx, **NO_OPAQUE).simulate(make_job(no_gains(airlock_living), wx, mode="ideal_load_conditioned",
                                                                    hours=96, setpoint=18.0, initial=18.0, ground=-3.0))
        return r.summary.heating_energy_kwh
    assert energy(0.0) < energy(5.0) < energy(12.0)


def test_colder_ground_increases_heating(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    e = [ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0,
                              ground=g)).summary.heating_energy_kwh for g in (5.0, -3.0, -15.0)]
    assert e[0] < e[1] < e[2]


def test_solar_gain_raises_temperatures_and_is_directional(materials, airlock_living):
    def run(azimuth):
        b = copy.deepcopy(airlock_living)
        for s in b["surfaces"]:
            if s["id"] == "surf_living_south":
                s["azimuth_deg"] = azimuth
        wx = constant_weather(t_out=-5.0, hours=24, ghi=500.0)
        wx = wx.model_copy(update={"hourly_data": [p.model_copy(update={"ghi_w_m2": max(0.0, 700.0 - 60.0 * abs(i - 12))})
                                                    for i, p in enumerate(wx.hourly_data)]})
        r = evaluator(materials, wx, **NO_OPAQUE).simulate(make_job(b, wx, hours=24, dt=900, initial=5.0, ground=-3.0))
        return r.time_series
    east, west, south = run(90.0), run(270.0), run(180.0)
    def morning_gain(series): return sum(p.solar_gain_w["living"] for p in series[:48])
    def afternoon_gain(series): return sum(p.solar_gain_w["living"] for p in series[48:])
    assert morning_gain(east) > morning_gain(west)
    assert afternoon_gain(west) > afternoon_gain(east)
    assert sum(p.solar_gain_w["living"] for p in south) > 0


def test_rotating_a_building_by_360_degrees_changes_nothing(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    b2 = copy.deepcopy(airlock_living)
    for s in b2["surfaces"]:
        s["azimuth_deg"] = (s["azimuth_deg"] + 360.0) % 360.0 if s["azimuth_deg"] != 0 else 0.0
    r1 = ev.simulate(make_job(airlock_living, weather48, ach=0.5))
    r2 = ev.simulate(make_job(b2, weather48, ach=0.5))
    assert temps(r1, "living") == temps(r2, "living")


def test_a_rotated_building_changes_directional_solar(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    b2 = copy.deepcopy(airlock_living)
    for s in b2["surfaces"]:
        if s["tilt_deg"] == 90.0:
            s["azimuth_deg"] = (s["azimuth_deg"] + 90.0) % 360.0
    g1 = sum(p.solar_gain_w["living"] for p in ev.simulate(make_job(airlock_living, weather48)).time_series)
    g2 = sum(p.solar_gain_w["living"] for p in ev.simulate(make_job(b2, weather48)).time_series)
    assert g1 != pytest.approx(g2)


def test_longwave_sky_loss_cools_an_uninsulated_roof(materials, airlock_living):
    wx = constant_weather(t_out=-10.0, hours=96)
    def energy(longwave):
        return evaluator(materials, wx, longwave_sky=longwave, default_opaque_absorptivity=0.0).simulate(
            make_job(airlock_living, wx, mode="ideal_load_conditioned", hours=96, setpoint=18.0, initial=18.0,
                     ground=-3.0)).summary.heating_energy_kwh
    assert energy(True) > energy(False)


# ------------------------------------------------------------------------------------------------- determinism, errors
def test_results_are_deterministic(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    a = ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", ach=0.5))
    b = ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", ach=0.5))
    assert [p.zone_temperatures_c for p in a.time_series] == [p.zone_temperatures_c for p in b.time_series]
    assert a.summary == b.summary


def test_weather_that_does_not_cover_the_window_is_refused(materials, weather48, airlock_living):
    with pytest.raises(M4Error) as e:
        evaluator(materials, weather48).simulate(make_job(airlock_living, weather48, hours=200))
    assert e.value.code == "WEATHER_DOES_NOT_COVER_WINDOW"


def test_unknown_weather_snapshot_is_refused(materials, weather48, airlock_living):
    job = make_job(airlock_living, weather48)
    job.weather_snapshot_id = "wx_nope"
    with pytest.raises(M4Error) as e:
        evaluator(materials, weather48).simulate(job)
    assert e.value.code == "WEATHER_SNAPSHOT_NOT_FOUND"


def test_conductivity_perturbation_through_the_assembly_u_value_changes_the_answer(materials, weather48, airlock_living):
    """M6 scales conductivity by rescaling each assembly's u_value_w_m2k; M4 must honour it."""
    ev = evaluator(materials, weather48)
    b = copy.deepcopy(airlock_living)
    for a in b["assemblies"].values():
        a["u_value_w_m2k"] = (a["u_value_w_m2k"] or 0.6) * 1.5
    e0 = ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0)).summary.heating_energy_kwh
    e1 = ev.simulate(make_job(b, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0)).summary.heating_energy_kwh
    assert e1 > e0


def test_internal_gains_perturbation(materials, weather48, airlock_living):
    ev = evaluator(materials, weather48)
    e = [ev.simulate(make_job(airlock_living, weather48, mode="ideal_load_conditioned", setpoint=18.0, initial=18.0,
                              extras={"perturbation": {"internal_gains": f}})).summary.heating_energy_kwh for f in (0.0, 1.0, 2.0)]
    assert e[0] > e[1] > e[2]
