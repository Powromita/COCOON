"""M6 phase 2 tests: objectives, checked against hand calculations."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from cocoon_contracts.economics import CostScenario
from cocoon_contracts.simulation import (
    EngineMetadata,
    SimulationEngineMode as Mode,
    SimulationOutputEngineMode,
    SimulationProvenance,
    SimulationResult,
    SimulationStatus,
    SimulationSummary,
    TimeSeriesPoint,
    ZoneSummary,
)

from design_generator import resolve_user_geometry
from optimization import objectives as ob
from optimization.objectives import (
    OBJECTIVES,
    CandidateEvaluation,
    ObjectiveError,
    ObjectiveSettings,
    active_objectives,
    compute_objectives,
    normalise,
    series_metrics,
    split_comparable,
)
from optimization.rc_verification import SimulationJob, analyse_checked, run_checked
from optimization.tests.conftest import T0, WEATHER_ID, load_fixture, user_room

SETTINGS = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0)          # hot limit 24 C

# The hand-checkable example: room "A" is occupied, room "B" is not.
A_TEMPS = [10.0, 14.0, 15.0, 16.0, 26.0, 25.0]
B_TEMPS = [-20.0, -20.0, 30.0, 30.0, 30.0, 30.0]                            # must be ignored for comfort
A_POWER = [3000.0, 2000.0, 1000.0, 0.0, 0.0, 0.0]
B_POWER = [500.0, 0.0, 0.0, 0.0, 0.0, 0.0]


def two_room_building():
    shelter = {
        "zones": [{"id": "A", "type": "living", "floor_level": 0, "origin_m": {"x": 0.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0}},
                  {"id": "B", "type": "storage", "floor_level": 0, "origin_m": {"x": 4.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0}}],
        "assemblies": {"wall": [["mat_stone", 200]], "roof": [["mat_plywood", 100]], "floor": [["mat_stone", 150]],
                       "partition": [["mat_plywood", 12]]},
        "occupants": {"A": 4},
    }
    return resolve_user_geometry(shelter, load_fixture("material_snapshot_standard.json"), created_at=T0).building


@pytest.fixture(scope="module")
def building():
    return two_room_building()


def hand_result(building, *, dt_s=3600, mode=Mode.CAPACITY_LIMITED_CONDITIONED, engine="cocoon_multizone_rc", series=True,
                summary=None, a=A_TEMPS, b=B_TEMPS, pa=A_POWER, pb=B_POWER):
    s = dict(heating_energy_kwh=0.0, peak_heating_kw=0.0, occupied_comfort_hours=0.0, unmet_hours=0.0, energy_residual_max_pct=0.0)
    s.update(summary or {})
    points = [TimeSeriesPoint(timestamp=T0 + timedelta(seconds=dt_s * (k + 1)), zone_temperatures_c={"A": a[k], "B": b[k]},
                              ambient_temperature_c=-10.0, heating_power_w={"A": pa[k], "B": pb[k]}) for k in range(len(a))]
    return SimulationResult(
        schema_version="4.0", simulation_id="sim_hand", design_revision_id=building.revision_id,
        engine=EngineMetadata(name=engine, version="0", mode=SimulationOutputEngineMode(mode.value), timestep_seconds=dt_s),
        status=SimulationStatus.COMPLETED, summary=SimulationSummary(**s),
        zones=[ZoneSummary(zone_id=z, temperature_min_c=-1.0, temperature_mean_c=0.0, temperature_max_c=1.0, comfort_hours=0.0)
               for z in ("A", "B")],
        time_series=points if series else None,
        provenance=SimulationProvenance(weather_snapshot_id="wx_test", material_version="m", code_commit="c", created_at=T0))


def evaluation(building, **kw):
    r = hand_result(building)
    defaults = dict(capacity_limited=r, ideal_load=r)
    defaults.update(kw)
    return CandidateEvaluation(building=building, **defaults)


# ------------------------------------------------------------------ registry and settings
def test_the_registry_has_directions_roles_and_requirements():
    assert list(OBJECTIVES) == ["unmet_hours", "cold_degree_hours", "overheating_degree_hours", "temperature_swing_c",
                                "heating_energy_kwh", "peak_heating_kw", "capex_inr", "lcc_inr", "mass_kg", "reliability",
                                "occupied_comfort_hours", "passive_min_temperature_c", "passive_median_temperature_c"]
    assert {n for n, d in OBJECTIVES.items() if d.direction == "max"} == {"reliability", "occupied_comfort_hours",
                                                                          "passive_min_temperature_c", "passive_median_temperature_c"}
    assert {n for n, d in OBJECTIVES.items() if d.required} == {"unmet_hours", "heating_energy_kwh", "peak_heating_kw"}
    assert {n for n, d in OBJECTIVES.items() if d.role == "info"} == {"occupied_comfort_hours", "passive_min_temperature_c",
                                                                      "passive_median_temperature_c"}
    assert all(d.unit and d.source and d.description for d in OBJECTIVES.values())


def test_settings_come_from_the_requirements():
    s = ObjectiveSettings.from_requirements(load_fixture("requirements_ladakh_30p.json"))
    assert (s.target_c, s.max_unmet_hours, s.hot_limit_c, s.warmup_hours) == (15.0, 12.0, 24.0, 0.0)
    assert ObjectiveSettings.from_requirements(load_fixture("requirements_ladakh_30p.json"), overheating_margin_c=6.0, warmup_hours=48).hot_limit_c == 21.0


@pytest.mark.parametrize("kw", [{"max_unmet_hours": -1.0}, {"warmup_hours": -1.0}, {"overheating_margin_c": 0.0}])
def test_invalid_settings_are_rejected(kw):
    with pytest.raises(ObjectiveError) as e:
        ObjectiveSettings(**{"target_c": 15.0, "max_unmet_hours": 12.0, **kw})
    assert e.value.code == "INVALID_SETTINGS"


# ------------------------------------------------------------------ hand-calculated metrics
def test_metrics_by_hand_without_warm_up(building):
    m = series_metrics(hand_result(building), ["A"], SETTINGS)
    assert m["cold_degree_hours"] == pytest.approx(5 + 1)                    # 15-10 and 15-14
    assert m["overheating_degree_hours"] == pytest.approx(2 + 1)              # 26-24 and 25-24
    assert m["temperature_swing_c"] == pytest.approx(26 - 10)
    assert m["unmet_hours"] == pytest.approx(2.0)                             # 10 and 14 are below 14.95
    assert m["occupied_comfort_hours"] == pytest.approx(4.0)
    assert m["heating_energy_kwh"] == pytest.approx((3500 + 2000 + 1000) / 1000)   # B's power counts for energy
    assert m["peak_heating_kw"] == pytest.approx(3.5)
    assert m["min_temperature_c"] == 10.0 and m["median_temperature_c"] == pytest.approx(15.5)


def test_the_unoccupied_room_never_counts_for_comfort(building):
    quiet_b = hand_result(building, b=[15.0] * 6)
    wild_b = hand_result(building, b=[-90.0, 80.0, -90.0, 80.0, -90.0, 80.0])
    for key in ("cold_degree_hours", "overheating_degree_hours", "temperature_swing_c", "unmet_hours"):
        assert series_metrics(quiet_b, ["A"], SETTINGS)[key] == series_metrics(wild_b, ["A"], SETTINGS)[key]


def test_metrics_by_hand_with_a_two_hour_warm_up(building):
    s = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=2.0)
    m = series_metrics(hand_result(building), ["A"], s)                        # keeps A = 15, 16, 26, 25
    assert m["cold_degree_hours"] == 0.0
    assert m["overheating_degree_hours"] == pytest.approx(3.0)
    assert m["temperature_swing_c"] == pytest.approx(11.0)
    assert m["unmet_hours"] == 0.0 and m["occupied_comfort_hours"] == pytest.approx(4.0)
    assert m["heating_energy_kwh"] == pytest.approx(1.0) and m["peak_heating_kw"] == pytest.approx(1.0)


def test_half_hour_steps_scale_the_hour_based_metrics_only(building):
    m = series_metrics(hand_result(building, dt_s=1800), ["A"], SETTINGS)
    assert m["cold_degree_hours"] == pytest.approx(3.0) and m["overheating_degree_hours"] == pytest.approx(1.5)
    assert m["unmet_hours"] == pytest.approx(1.0) and m["heating_energy_kwh"] == pytest.approx(3.25)
    assert m["peak_heating_kw"] == pytest.approx(3.5) and m["temperature_swing_c"] == pytest.approx(16.0)
    s = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=2.0)      # 2 h = 4 half-hour steps skipped
    late = series_metrics(hand_result(building, dt_s=1800), ["A"], s)
    assert late["overheating_degree_hours"] == pytest.approx(1.5) and late["temperature_swing_c"] == pytest.approx(1.0)
    assert late["heating_energy_kwh"] == 0.0


def test_a_warm_up_longer_than_the_run_cannot_be_computed(building):
    s = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=6.0)
    with pytest.raises(ObjectiveError) as e:
        series_metrics(hand_result(building), ["A"], s)
    assert e.value.code == "NO_TIME_SERIES" and "warm-up" in str(e.value)


# ------------------------------------------------------------------ one candidate
def test_objectives_for_the_hand_example(building):
    r = compute_objectives(evaluation(building), SETTINGS)
    v = {n: r.value(n) for n in OBJECTIVES}
    # with no warm-up the contract summary is the source for unmet, energy and peak; the series gives the rest
    assert v["unmet_hours"] == 0.0 and v["heating_energy_kwh"] == 0.0 and v["peak_heating_kw"] == 0.0     # the hand summary is all zeros
    assert v["cold_degree_hours"] == pytest.approx(6.0) and v["overheating_degree_hours"] == pytest.approx(3.0)
    assert v["temperature_swing_c"] == pytest.approx(16.0)
    assert r.comparable and r.not_comparable_reasons == () and r.within_unmet_limit is True
    assert list(r.values) == list(OBJECTIVES)                                 # registry order


def test_the_contract_summary_is_used_when_there_is_no_warm_up(building):
    summary = {"unmet_hours": 7.0, "occupied_comfort_hours": 3.0, "heating_energy_kwh": 42.0, "peak_heating_kw": 9.5}
    res = hand_result(building, summary=summary)
    r = compute_objectives(CandidateEvaluation(building=building, capacity_limited=res, ideal_load=res), SETTINGS)
    assert (r.value("unmet_hours"), r.value("occupied_comfort_hours")) == (7.0, 3.0)
    assert (r.value("heating_energy_kwh"), r.value("peak_heating_kw")) == (42.0, 9.5)


def test_with_a_warm_up_the_series_replaces_the_summary(building):
    summary = {"unmet_hours": 7.0, "heating_energy_kwh": 42.0, "peak_heating_kw": 9.5}
    res = hand_result(building, summary=summary)
    s = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=2.0)
    r = compute_objectives(CandidateEvaluation(building=building, capacity_limited=res, ideal_load=res), s)
    assert (r.value("unmet_hours"), r.value("heating_energy_kwh"), r.value("peak_heating_kw")) == (0.0, pytest.approx(1.0), pytest.approx(1.0))
    assert "warm-up 2 h excluded" in r.values["heating_energy_kwh"].note


def test_a_warm_up_without_a_time_series_makes_the_candidate_not_comparable(building):
    res = hand_result(building, series=False, summary={"unmet_hours": 1.0, "heating_energy_kwh": 5.0, "peak_heating_kw": 2.0})
    s = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=24.0)
    r = compute_objectives(CandidateEvaluation(building=building, capacity_limited=res, ideal_load=res), s)
    assert not r.comparable and len(r.not_comparable_reasons) == 3
    assert all("no time series" in x for x in r.not_comparable_reasons)
    assert r.value("unmet_hours") is None and r.within_unmet_limit is None


def test_missing_runs_make_a_candidate_not_comparable_with_reasons(building):
    r = compute_objectives(CandidateEvaluation(building=building), SETTINGS)
    assert not r.comparable
    assert [x.split(":")[0] for x in r.not_comparable_reasons] == ["unmet_hours", "heating_energy_kwh", "peak_heating_kw"]
    assert "capacity-limited" in r.not_comparable_reasons[0] and "ideal-load" in r.not_comparable_reasons[1]
    only_cap = compute_objectives(CandidateEvaluation(building=building, capacity_limited=hand_result(building)), SETTINGS)
    assert not only_cap.comparable and len(only_cap.not_comparable_reasons) == 2       # still needs the ideal-load run


def test_optional_objectives_may_be_missing(building):
    r = compute_objectives(evaluation(building), SETTINGS)
    assert r.comparable
    for name in ("capex_inr", "lcc_inr", "mass_kg", "reliability", "passive_min_temperature_c"):
        assert r.value(name) is None and r.values[name].reason


@pytest.mark.parametrize("unmet, ok", [(0.0, True), (12.0, True), (12.0000001, False), (40.0, False)])
def test_the_users_unmet_limit_is_a_pass_fail_flag(building, unmet, ok):
    res = hand_result(building, summary={"unmet_hours": unmet})
    r = compute_objectives(CandidateEvaluation(building=building, capacity_limited=res, ideal_load=res), SETTINGS)
    assert r.within_unmet_limit is ok and r.value("unmet_hours") == unmet


def test_a_result_for_another_design_is_refused(building):
    other = user_room()
    with pytest.raises(ObjectiveError) as e:
        CandidateEvaluation(building=other, capacity_limited=hand_result(building))
    assert e.value.code == "EVALUATION_MISMATCH" and e.value.details["field"] == "capacity_limited"


def test_reliability_must_be_a_fraction(building):
    with pytest.raises(ObjectiveError):
        evaluation(building, reliability=1.5)
    assert compute_objectives(evaluation(building, reliability=0.8), SETTINGS).value("reliability") == 0.8


def test_a_non_finite_value_becomes_missing_not_a_number(building):
    good = hand_result(building)
    bad = good.model_copy(update={"summary": good.summary.model_copy(update={"heating_energy_kwh": float("nan")})})
    r = compute_objectives(CandidateEvaluation(building=building, capacity_limited=good, ideal_load=bad), SETTINGS)
    assert r.value("heating_energy_kwh") is None and "not finite" in r.values["heating_energy_kwh"].reason and not r.comparable


def test_a_building_without_an_occupied_room_has_no_comfort_objectives():
    room = user_room(occupants=0)
    res = hand_result(room, a=[16.0] * 3, b=[16.0] * 3, pa=[1000.0] * 3, pb=[0.0] * 3)
    res = res.model_copy(update={"zones": res.zones[:1]})
    assert room.floors[0].zones[0].occupancy_schedule_id is None
    r = compute_objectives(CandidateEvaluation(building=room, capacity_limited=res, ideal_load=res), SETTINGS)
    assert r.value("cold_degree_hours") is None and "no occupied room" in r.values["cold_degree_hours"].reason
    assert r.value("heating_energy_kwh") == 0.0 and r.value("unmet_hours") == 0.0     # from the summary


# ------------------------------------------------------------------ economics, mass, passive
def test_economics_and_mass_are_taken_from_their_sources(ladakh_candidates, evaluator, economics):
    c = ladakh_candidates[0]
    job = lambda mode, **k: SimulationJob.from_candidate(c, weather_snapshot_id=WEATHER_ID, mode=mode, window_start=T0,
                                                         window_end=T0 + timedelta(days=4), setpoint_c=15.0, timestep_seconds=3600, **k)
    ideal = run_checked(evaluator, job(Mode.IDEAL_LOAD_CONDITIONED))
    econ = analyse_checked(economics, c.building, c.quantities, ideal, "econ_standin_expected_v0", CostScenario.EXPECTED)
    r = compute_objectives(CandidateEvaluation(building=c.building, quantities=c.quantities, ideal_load=ideal,
                                               capacity_limited=ideal, economics=econ), SETTINGS)
    assert r.value("capex_inr") == econ.capex.total_capex_inr and r.value("lcc_inr") == econ.lcc_inr
    assert r.value("mass_kg") == pytest.approx(sum(m.mass_kg for m in c.quantities.materials))
    assert r.value("lcc_inr") > r.value("capex_inr") > 0


def test_mass_can_be_unknown(building):
    class Q:                                            # duck-typed Quantities
        materials = [type("M", (), {"mass_kg": 10.0})(), type("M", (), {"mass_kg": None})()]

    r = compute_objectives(evaluation(building, quantities=Q()), SETTINGS)
    assert r.value("mass_kg") is None and "unknown" in r.values["mass_kg"].reason
    assert compute_objectives(evaluation(building), SETTINGS).values["mass_kg"].reason == "no bill of quantities"


def test_passive_metrics_come_from_the_free_running_room(building):
    free = hand_result(building, mode=Mode.FREE_FLOATING)
    r = compute_objectives(evaluation(building, free_floating=free), SETTINGS)
    assert r.value("passive_min_temperature_c") == 10.0 and r.value("passive_median_temperature_c") == pytest.approx(15.5)
    assert "settled" in r.values["passive_min_temperature_c"].note
    warm = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=2.0)
    assert compute_objectives(evaluation(building, free_floating=free), warm).value("passive_min_temperature_c") == 15.0


# ------------------------------------------------------------------ populations
def _fake(design_id, **values):
    """An ObjectiveResult built directly from values (the rest missing)."""
    vals = {n: ob.ObjectiveValue(n, values.get(n), None if n in values else "missing") for n in OBJECTIVES}
    required_ok = all(vals[n].value is not None for n, d in OBJECTIVES.items() if d.required)
    return ob.ObjectiveResult(design_id, "rev_" + design_id, vals, required_ok, () if required_ok else ("x",), None, False)


REQ = dict(unmet_hours=0.0, heating_energy_kwh=100.0, peak_heating_kw=5.0)


def test_normalise_is_direction_aware_and_min_max(building):
    a = _fake("a", **{**REQ, "heating_energy_kwh": 100.0, "reliability": 0.2})
    b = _fake("b", **{**REQ, "heating_energy_kwh": 300.0, "reliability": 0.6})
    c = _fake("c", **{**REQ, "heating_energy_kwh": 200.0, "reliability": 1.0})
    s = normalise([a, b, c], ["heating_energy_kwh", "reliability", "unmet_hours"])
    assert s["a"]["heating_energy_kwh"] == pytest.approx(1.0) and s["b"]["heating_energy_kwh"] == pytest.approx(0.0)
    assert s["c"]["heating_energy_kwh"] == pytest.approx(0.5)                                                                     # min: lower is better
    assert s["a"]["reliability"] == pytest.approx(0.0) and s["b"]["reliability"] == pytest.approx(0.5)
    assert s["c"]["reliability"] == pytest.approx(1.0)                                                                            # max: higher is better
    assert all(s[k]["unmet_hours"] == 1.0 for k in "abc")                     # identical values cannot separate designs


def test_normalise_refuses_gaps_and_unknown_names():
    a, b = _fake("a", **REQ), _fake("b", **REQ)
    with pytest.raises(ObjectiveError) as e:
        normalise([a, b], ["capex_inr"])
    assert e.value.code == "MISSING_OBJECTIVE" and e.value.details["objective"] == "capex_inr"
    with pytest.raises(ObjectiveError) as e2:
        normalise([a, b], ["nonsense"])
    assert e2.value.code == "UNKNOWN_OBJECTIVE"


def test_active_objectives_are_those_every_comparable_design_has():
    a = _fake("a", **REQ, capex_inr=1.0, lcc_inr=2.0)
    b = _fake("b", **REQ, capex_inr=3.0)                                       # no lcc
    c = _fake("c", unmet_hours=0.0)                                            # not comparable: gaps must not count against the rest
    assert not c.comparable
    assert active_objectives([a, b, c]) == ["unmet_hours", "heating_energy_kwh", "peak_heating_kw", "capex_inr"]
    assert active_objectives([a]) == ["unmet_hours", "heating_energy_kwh", "peak_heating_kw", "capex_inr", "lcc_inr"]
    assert active_objectives([c]) == [] and active_objectives([]) == []
    assert active_objectives([_fake("d", **REQ, occupied_comfort_hours=3.0)], role="info") == ["occupied_comfort_hours"]


def test_split_comparable_keeps_the_reasons():
    ok, bad = _fake("ok", **REQ), _fake("bad", unmet_hours=1.0)
    comparable, excluded = split_comparable([ok, bad])
    assert comparable == [ok] and excluded == [bad] and excluded[0].not_comparable_reasons


# ------------------------------------------------------------------ provenance and output
def test_stand_in_inputs_mark_the_result_development_only(building, ladakh_candidates, evaluator, economics):
    real_named = evaluation(building)
    assert compute_objectives(real_named, SETTINGS).development_only is False
    stand_in = evaluation(building, free_floating=hand_result(building, engine="standin_hand"))
    assert compute_objectives(stand_in, SETTINGS).development_only is True
    c = ladakh_candidates[0]
    sim = run_checked(evaluator, SimulationJob.from_candidate(c, weather_snapshot_id=WEATHER_ID, mode=Mode.IDEAL_LOAD_CONDITIONED,
                                                              window_start=T0, window_end=T0 + timedelta(days=2), setpoint_c=15.0, timestep_seconds=3600))
    econ = analyse_checked(economics, c.building, c.quantities, sim, "econ_standin_expected_v0")
    only_econ = CandidateEvaluation(building=c.building, ideal_load=None, economics=econ)
    assert compute_objectives(only_econ, SETTINGS).development_only is True


def test_to_dict_is_json_and_carries_units_and_directions(building):
    d = compute_objectives(evaluation(building), SETTINGS).to_dict()
    json.dumps(d)
    assert d["values"]["unmet_hours"]["unit"] == "h" and d["values"]["reliability"]["direction"] == "max"
    assert d["values"]["capex_inr"]["reason"] and d["comparable"] is True


# ------------------------------------------------------------------ with a real M2 design and the stand-in
def test_a_real_design_gives_consistent_objectives_and_the_warm_up_matters(ladakh_candidates, evaluator, economics):
    c = ladakh_candidates[0]
    kw = dict(weather_snapshot_id=WEATHER_ID, window_start=T0, window_end=T0 + timedelta(days=10), setpoint_c=15.0, timestep_seconds=3600)
    free = run_checked(evaluator, SimulationJob.from_candidate(c, mode=Mode.FREE_FLOATING, **kw))
    ideal = run_checked(evaluator, SimulationJob.from_candidate(c, mode=Mode.IDEAL_LOAD_CONDITIONED, **kw))
    limited = run_checked(evaluator, SimulationJob.from_candidate(c, mode=Mode.CAPACITY_LIMITED_CONDITIONED, heater_capacity_kw=30.0, **kw))
    econ = analyse_checked(economics, c.building, c.quantities, ideal, "econ_standin_expected_v0")
    ev = CandidateEvaluation(building=c.building, quantities=c.quantities, free_floating=free, ideal_load=ideal,
                             capacity_limited=limited, economics=econ)
    occupied = list(ev.occupied_zone_ids)
    assert set(occupied) == {"living", "sleeping"}

    # my series-based numbers agree with the engine's own summary when nothing is excluded
    m = series_metrics(ideal, occupied, SETTINGS)
    assert m["heating_energy_kwh"] == pytest.approx(ideal.summary.heating_energy_kwh)
    assert m["peak_heating_kw"] == pytest.approx(ideal.summary.peak_heating_kw)
    ml = series_metrics(limited, occupied, SETTINGS)
    assert ml["unmet_hours"] == pytest.approx(limited.summary.unmet_hours)
    assert ml["occupied_comfort_hours"] == pytest.approx(limited.summary.occupied_comfort_hours)

    raw = compute_objectives(ev, SETTINGS)
    settled = compute_objectives(ev, ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=48.0))
    assert raw.comparable and settled.comparable and raw.development_only
    assert raw.value("peak_heating_kw") > 100.0                                 # the cold-start burst
    assert settled.value("peak_heating_kw") < 0.2 * raw.value("peak_heating_kw")  # gone once the warm-up is excluded
    assert settled.value("heating_energy_kwh") < raw.value("heating_energy_kwh")
    assert settled.value("unmet_hours") <= raw.value("unmet_hours")
    assert settled.within_unmet_limit is True
    assert all(settled.value(n) is not None for n in ("cold_degree_hours", "overheating_degree_hours", "temperature_swing_c",
                                                      "capex_inr", "lcc_inr", "mass_kg", "passive_min_temperature_c"))


def _population(snapshot, ladakh_candidates, mean_c):
    from optimization.tests.standins import StandInEvaluator, make_winter_weather
    ev = StandInEvaluator(snapshot, {"wx_pop": make_winter_weather("wx_pop", days=14, mean_c=mean_c)})
    kw = dict(weather_snapshot_id="wx_pop", window_start=T0, window_end=T0 + timedelta(days=8), setpoint_c=15.0, timestep_seconds=3600)
    settings = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=48.0)
    out = []
    for c in ladakh_candidates:
        ideal = run_checked(ev, SimulationJob.from_candidate(c, mode=Mode.IDEAL_LOAD_CONDITIONED, **kw))
        limited = run_checked(ev, SimulationJob.from_candidate(c, mode=Mode.CAPACITY_LIMITED_CONDITIONED, heater_capacity_kw=30.0, **kw))
        out.append(compute_objectives(CandidateEvaluation(building=c.building, quantities=c.quantities, ideal_load=ideal,
                                                          capacity_limited=limited), settings))
    return out


def test_in_a_bitterly_cold_week_designs_differ_in_heating(snapshot, ladakh_candidates):
    results = _population(snapshot, ladakh_candidates, mean_c=-35.0)
    assert all(r.comparable for r in results)
    assert len({round(r.value("heating_energy_kwh")) for r in results}) >= 3
    assert len({round(r.value("peak_heating_kw"), 2) for r in results}) >= 3
    names = active_objectives(results)
    assert {"unmet_hours", "heating_energy_kwh", "peak_heating_kw", "mass_kg"} <= set(names)
    scores = normalise(results, names)
    assert all(0.0 <= v <= 1.0 for s in scores.values() for v in s.values())
    best = max(results, key=lambda r: scores[r.design_id]["heating_energy_kwh"])
    assert best.value("heating_energy_kwh") == min(r.value("heating_energy_kwh") for r in results)


def test_when_heating_is_zero_overheating_and_swing_still_tell_designs_apart(snapshot, ladakh_candidates):
    """At -12 C the occupants and the sun heat every design: heating energy cannot separate them, overheating can."""
    results = _population(snapshot, ladakh_candidates, mean_c=-12.0)
    assert {r.value("heating_energy_kwh") for r in results} == {0.0}
    over = [r.value("overheating_degree_hours") for r in results]
    assert max(over) > 10 * min(over) > 0                               # one design overheats far more than another
    assert len({round(r.value("temperature_swing_c"), 1) for r in results}) >= 2
    scores = normalise(results, ["heating_energy_kwh", "overheating_degree_hours"])
    assert all(v["heating_energy_kwh"] == 1.0 for v in scores.values())   # a constant objective separates nobody
    assert min(v["overheating_degree_hours"] for v in scores.values()) == pytest.approx(0.0)


def test_two_occupied_rooms_add_up_and_the_swing_is_the_worst_room(building):
    """Both rooms occupied: degree-hours add across rooms; the swing is the largest of the rooms."""
    m = series_metrics(hand_result(building), ["A", "B"], SETTINGS)
    assert m["cold_degree_hours"] == pytest.approx(6 + (35 + 35))            # A: 5+1 ; B: 15-(-20) twice
    assert m["overheating_degree_hours"] == pytest.approx(3 + 4 * 6)          # A: 2+1 ; B: 30-24 four times
    assert m["temperature_swing_c"] == pytest.approx(50.0)                    # B: 30-(-20); A only 16
    assert m["min_temperature_c"] == -20.0
    assert m["unmet_hours"] == pytest.approx(2.0)                             # hours 1 and 2: both rooms are cold, each hour counts once
    assert m["occupied_comfort_hours"] == pytest.approx(4.0)                  # hours 3-6: every occupied room is at or above the target
