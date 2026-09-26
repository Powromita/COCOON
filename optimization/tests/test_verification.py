"""M6 phase 5 tests: verifying finalists and sizing heaters."""

from __future__ import annotations

import json
import math
import time
from collections import Counter
from dataclasses import replace
from datetime import timedelta
from types import SimpleNamespace

import pytest
from cocoon_contracts.simulation import (
    EngineMetadata,
    RecommendationState,
    SimulationEngineMode as Mode,
    SimulationOutputEngineMode,
    SimulationProvenance,
    SimulationResult,
    SimulationStatus,
    SimulationSummary,
    TimeSeriesPoint,
    ZoneSummary,
)

from design_generator import generate_designs
from optimization import rc_verification as rv
from optimization.objectives import ObjectiveSettings, compute_objectives, series_metrics
from optimization.rc_verification import (
    DEFAULT_HEATER_SIZES_KW,
    EvaluationFailedError,
    EvaluatorUnavailableError,
    M4Evaluator,
    VerificationSettings,
    round_up_to_size,
    size_heater,
    verify_candidate,
    verify_candidates,
)
from optimization.tests.conftest import T0, load_fixture, user_room
from optimization.tests.standins import StandInEvaluator, make_winter_weather

WX = "wx_v"


def settings(**kw) -> VerificationSettings:
    args = dict(weather_snapshot_id=WX, window_start=T0, window_end=T0 + timedelta(days=8), setpoint_c=15.0,
                timestep_seconds=3600, heater_fuel="kerosene")
    args.update(kw)
    return VerificationSettings(**args)


@pytest.fixture(scope="module")
def cold(snapshot):
    """Stand-in evaluator on a bitterly cold winter (-35 C mean), where heating is really needed."""
    return StandInEvaluator(snapshot, {WX: make_winter_weather(WX, days=14, mean_c=-35.0)})


@pytest.fixture(scope="module")
def cands():
    return generate_designs(load_fixture("requirements_ladakh_30p.json"), load_fixture("material_snapshot_standard.json"),
                            seed=42, count=4, created_at=T0).candidates


# ------------------------------------------------------------------ heater sizing, by hand
def ideal_result(powers: dict[str, list[float]], *, dt_s=3600, heated_zone_peaks=None) -> SimulationResult:
    n = len(next(iter(powers.values())))
    pts = [TimeSeriesPoint(timestamp=T0 + timedelta(seconds=dt_s * (k + 1)), zone_temperatures_c={z: 15.0 for z in powers},
                           ambient_temperature_c=-10.0, heating_power_w={z: powers[z][k] for z in powers}) for k in range(n)]
    zones = [ZoneSummary(zone_id=z, temperature_min_c=15.0, temperature_mean_c=15.0, temperature_max_c=15.0, comfort_hours=0.0,
                         peak_heating_kw=(heated_zone_peaks or {}).get(z)) for z in powers]
    return SimulationResult(
        schema_version="4.0", simulation_id="sim_hand", design_revision_id="rev_x",
        engine=EngineMetadata(name="cocoon_multizone_rc", version="0", mode=SimulationOutputEngineMode.IDEAL_LOAD_CONDITIONED, timestep_seconds=dt_s),
        status=SimulationStatus.COMPLETED,
        summary=SimulationSummary(heating_energy_kwh=0.0, peak_heating_kw=0.0, occupied_comfort_hours=0.0, unmet_hours=0.0, energy_residual_max_pct=0.0),
        zones=zones, time_series=pts if n else None,
        provenance=SimulationProvenance(weather_snapshot_id=WX, material_version="m", code_commit="c", created_at=T0))


POWERS = {"A": [9000.0, 4000.0, 3000.0, 2000.0], "B": [1000.0, 1200.0, 1100.0, 900.0]}


def test_the_heater_is_sized_from_the_settled_peak_not_the_warm_up_burst():
    ideal = ideal_result(POWERS)
    plan = size_heater(ideal, ["A", "B"], settings(warmup_hours=1.0))            # the first hour (the 9 kW burst) is skipped; A then peaks at 4 kW
    assert plan.peak_kw_by_zone == {"A": pytest.approx(4.0), "B": pytest.approx(1.2)} and plan.settled_peak_kw == pytest.approx(4.0)
    assert plan.capacity_kw == 5.0                                                # 4.0 x 1.25 = 5.0 exactly
    raw = size_heater(ideal, ["A", "B"], settings(warmup_hours=0.0))              # nothing excluded: the 9 kW burst sizes it
    assert raw.settled_peak_kw == pytest.approx(9.0) and raw.capacity_kw == 15.0  # 11.25 -> 15
    late = size_heater(ideal, ["A", "B"], settings(warmup_hours=2.0))
    assert late.peak_kw_by_zone["A"] == pytest.approx(3.0) and late.capacity_kw == 5.0     # 3.75 -> 5


def test_one_size_for_all_heaters_set_by_the_biggest_need():
    plan = size_heater(ideal_result(POWERS), ["A", "B"], settings(warmup_hours=1.0, heater_margin=1.0))
    assert plan.capacity_kw == 5.0 and plan.zone_ids == ("A", "B")               # 4 kW need -> 5 kW heater in EVERY room (B needs only 1.2)
    assert size_heater(ideal_result(POWERS), ["A", "B"], settings(warmup_hours=1.0, heater_margin=1.5)).capacity_kw == 7.5   # 4 x 1.5 = 6 -> 7.5


def test_only_heated_rooms_count():
    plan = size_heater(ideal_result(POWERS), ["B"], settings(warmup_hours=1.0))
    assert plan.zone_ids == ("B",) and plan.settled_peak_kw == pytest.approx(1.2) and plan.capacity_kw == 2.0     # 1.5 -> 2


def test_a_building_that_needs_no_heat_still_gets_the_smallest_heater():
    plan = size_heater(ideal_result({"A": [0.0, 0.0, 0.0, 0.0]}), ["A"], settings(warmup_hours=1.0))
    assert plan.settled_peak_kw == 0.0 and plan.capacity_kw == DEFAULT_HEATER_SIZES_KW[0] == 1.0


@pytest.mark.parametrize("kw, size", [(0.2, 1.0), (1.0, 1.0), (1.0001, 2.0), (7.5, 7.5), (7.51, 10.0), (50.0, 50.0), (50.1, 100.0), (120.0, 150.0)])
def test_rounding_up_to_a_standard_size(kw, size):
    assert round_up_to_size(kw, DEFAULT_HEATER_SIZES_KW) == size


def test_sizing_needs_a_time_series_to_exclude_a_warm_up():
    no_series = ideal_result({"A": [1.0]}).model_copy(update={"time_series": None})
    with pytest.raises(EvaluationFailedError) as e:
        size_heater(no_series, ["A"], settings(warmup_hours=48.0))
    assert e.value.code == "NO_TIME_SERIES"
    with_zone_peaks = ideal_result({"A": [1.0]}, heated_zone_peaks={"A": 2.4}).model_copy(update={"time_series": None})
    plan = size_heater(with_zone_peaks, ["A"], settings(warmup_hours=0.0))       # no warm-up to exclude: the zone summary is enough
    assert plan.settled_peak_kw == 2.4 and plan.capacity_kw == 3.0               # 3.0 exactly


def test_a_short_run_swallowed_by_the_warm_up_cannot_be_sized():
    with pytest.raises(EvaluationFailedError) as e:
        size_heater(ideal_result({"A": [1000.0] * 3}), ["A"], settings(warmup_hours=48.0))       # only 3 hours of data
    assert e.value.code == "NO_TIME_SERIES" and "warm-up" in str(e.value)


def test_no_heated_room_means_nothing_to_size():
    with pytest.raises(EvaluationFailedError) as e:
        size_heater(ideal_result(POWERS), [], settings())
    assert e.value.code == "NO_HEATED_ZONE"


# ------------------------------------------------------------------ settings
@pytest.mark.parametrize("kw", [{"window_end": T0}, {"warmup_hours": -1.0}, {"warmup_hours": 24 * 8}, {"heater_margin": 0.9},
                                {"heater_sizes_kw": ()}, {"heater_sizes_kw": (2.0, 1.0)}, {"heater_sizes_kw": (1.0, 1.0)},
                                {"heater_sizes_kw": (0.0, 1.0)}, {"run_timeout_s": 0.0}, {"max_workers": 0}])
def test_invalid_settings_are_rejected(kw):
    with pytest.raises(EvaluationFailedError) as e:
        settings(**kw)
    assert e.value.code == "INVALID_SETTINGS"


def test_settings_come_from_the_requirements_and_share_the_objective_target():
    s = VerificationSettings.from_requirements(load_fixture("requirements_ladakh_30p.json"), weather_snapshot_id=WX)
    assert (s.setpoint_c, s.heater_fuel, s.warmup_hours, s.heater_margin, s.start_temperature_c) == (15.0, "kerosene", 48.0, 1.25, 15.0)
    assert s.window_end - s.window_start == timedelta(days=7) and s.window_start.utcoffset() == timedelta(hours=5, minutes=30)
    o = s.to_objective_settings(12.0)
    assert (o.target_c, o.warmup_hours, o.max_unmet_hours) == (15.0, 48.0, 12.0)
    assert VerificationSettings.from_requirements(load_fixture("requirements_ladakh_30p.json"), weather_snapshot_id=WX,
                                                  initial_temperature_c=-25.0, warmup_hours=24.0).start_temperature_c == -25.0


# ------------------------------------------------------------------ verifying a real design
class Recorder:
    engine_name, engine_version = "standin_recorder", "0"

    def __init__(self, inner):
        self.inner, self.jobs = inner, []

    def simulate(self, job):
        self.jobs.append(job)
        return self.inner.simulate(job)


def test_a_design_is_run_three_ways_and_the_heater_is_sized_from_the_settled_peak(cold, cands):
    c = cands[0]
    v = verify_candidate(c, cold, settings())
    assert v.status == "verified" and v.failure is None and v.design_id == c.building.design_id
    assert [r.mode for r in v.runs] == ["free_floating", "ideal_load_conditioned", "capacity_limited_conditioned"]
    assert v.evaluation.free_floating and v.evaluation.ideal_load and v.evaluation.capacity_limited

    # independent recomputation of the sizing from the ideal-load time series
    ideal = v.evaluation.ideal_load
    skip = 48                                                                   # 48 h at 1 h steps
    heated = [z.id for f in c.building.floors for z in f.zones if z.hvac_id]
    peak = max(p.heating_power_w[z] for p in ideal.time_series[skip:] for z in heated) / 1000.0
    expected = next((s for s in DEFAULT_HEATER_SIZES_KW if peak * 1.25 <= s + 1e-9), None)
    assert v.heater.settled_peak_kw == pytest.approx(peak) and v.heater.capacity_kw == expected
    assert v.heater.zone_ids == tuple(heated) == ("living", "sleeping") and v.heater.fuel == "kerosene"
    # the capacity-limited run really used it
    limited = v.evaluation.capacity_limited
    assert max(p.heating_power_w[z] for p in limited.time_series for z in heated) <= v.heater.capacity_kw * 1000.0 + 1e-6


def test_the_warm_up_fix_the_heater_is_not_sized_by_the_cold_start_burst(cold, cands):
    fixed = verify_candidate(cands[0], cold, settings())
    naive = verify_candidate(cands[0], cold, settings(initial_temperature_c=-25.0, warmup_hours=0.0))
    assert fixed.heater.capacity_kw <= 5.0
    assert naive.heater.settled_peak_kw > 50.0 and naive.heater.capacity_kw >= 100.0        # the -25 C start burst, 20-100x too big
    assert naive.heater.capacity_kw > 20 * fixed.heater.capacity_kw


def test_every_run_gets_the_same_job_apart_from_mode_and_heater_capacity(cold, cands):
    rec = Recorder(cold)
    c = cands[0]
    s = settings(setpoint_c=16.0, ground_temperature_c=-8.0)
    v = verify_candidate(c, rec, s)
    modes = [j.mode for j in rec.jobs]
    assert modes == [Mode.FREE_FLOATING, Mode.IDEAL_LOAD_CONDITIONED, Mode.CAPACITY_LIMITED_CONDITIONED]
    for j in rec.jobs:
        assert j.building is c.building and j.weather_snapshot_id == WX and (j.window_start, j.window_end) == (s.window_start, s.window_end)
        assert (j.setpoint_c, j.timestep_seconds, j.ground_temperature_c) == (16.0, 3600, -8.0)
        assert j.initial_temperature_c == 16.0                                    # a warm start: the setpoint, not -25 C
        assert j.air_changes_per_hour == c.extras["air_changes_per_hour"]
    assert [j.heater_capacity_kw for j in rec.jobs] == [None, None, v.heater.capacity_kw]


def test_run_records_carry_provenance(cold, cands):
    v = verify_candidate(cands[0], cold, settings())
    assert {r.engine_name for r in v.runs} == {"standin_lumped_rc"} and {r.engine_version for r in v.runs} == {"0.1.0"}
    assert all(r.request_id.startswith("sim_") and r.simulation_id.startswith("sim_standin_") and r.timestep_seconds == 3600 for r in v.runs)
    assert [r.heater_capacity_kw for r in v.runs] == [None, None, v.heater.capacity_kw]
    assert len({r.request_id for r in v.runs}) == 3


def test_a_stand_in_never_claims_to_be_verified_by_rc(cold, cands):
    v = verify_candidate(cands[0], cold, settings())
    assert v.development_only and v.recommendation_state is None


def test_a_real_named_engine_gets_verified_by_rc(snapshot, cands):
    class RealNamed(StandInEvaluator):
        engine_name = "cocoon_multizone_rc"

    ev = RealNamed(snapshot, {WX: make_winter_weather(WX, days=14, mean_c=-35.0)})
    v = verify_candidate(cands[0], ev, settings())
    assert v.status == "verified" and not v.development_only and v.recommendation_state == RecommendationState.VERIFIED_BY_RC


def test_the_verified_evaluation_feeds_the_objectives(cold, cands):
    s = settings()
    v = verify_candidate(cands[0], cold, s)
    o = compute_objectives(v.evaluation, s.to_objective_settings(12.0))
    assert o.comparable and o.within_unmet_limit is True and o.development_only
    assert o.value("unmet_hours") == 0.0                                         # the sized heater holds the target after the warm-up
    assert o.value("peak_heating_kw") >= v.heater.settled_peak_kw - 1e-9          # building peak covers the biggest single room
    assert o.value("peak_heating_kw") < 20.0                                     # not the cold-start burst
    assert compute_objectives(v.evaluation, ObjectiveSettings(15.0, 12.0)).value("peak_heating_kw") > 0   # without warm-up exclusion also computes


def test_a_higher_setpoint_never_lowers_the_heating_demand_or_the_heater(cold, cands):
    energy, capacity = [], []
    for sp in (10.0, 13.0, 16.0, 19.0):
        s = settings(setpoint_c=sp)
        v = verify_candidate(cands[2], cold, s)
        energy.append(series_metrics(v.evaluation.ideal_load, ["living", "sleeping"], s.to_objective_settings(12.0))["heating_energy_kwh"])
        capacity.append(v.heater.capacity_kw)
    assert energy == sorted(energy) and energy[0] < energy[-1]
    assert capacity == sorted(capacity)


def test_free_floating_can_be_skipped(cold, cands):
    v = verify_candidate(cands[0], cold, settings(include_free_floating=False))
    assert [r.mode for r in v.runs] == ["ideal_load_conditioned", "capacity_limited_conditioned"] and v.evaluation.free_floating is None


def test_it_accepts_anything_shaped_like_a_candidate(cold, cands):
    bare = SimpleNamespace(building=cands[0].building)                          # no extras, no quantities
    v = verify_candidate(bare, cold, settings())
    assert v.status == "verified" and v.evaluation.quantities is None


# ------------------------------------------------------------------ failures are recorded, never retried
class Flaky:
    engine_name, engine_version = "standin_flaky", "0"

    def __init__(self, inner, design_id, mode, *, corrupt=False, exc=None):
        self.inner, self.design_id, self.mode, self.corrupt, self.exc = inner, design_id, mode, corrupt, exc
        self.calls: Counter = Counter()

    def simulate(self, job):
        self.calls[(job.building.design_id, job.mode)] += 1
        if job.building.design_id == self.design_id and job.mode == self.mode:
            if self.corrupt:
                r = self.inner.simulate(job)
                return r.model_copy(update={"summary": r.summary.model_copy(update={"heating_energy_kwh": float("nan")})})
            raise self.exc or EvaluationFailedError("solver diverged", "EVALUATION_FAILED")
        return self.inner.simulate(job)


def test_a_failed_run_excludes_that_design_with_the_stage_and_reason_and_is_not_retried(cold, cands):
    target = cands[1].building.design_id
    flaky = Flaky(cold, target, Mode.IDEAL_LOAD_CONDITIONED)
    out = verify_candidates(cands, flaky, settings())
    assert [v.status for v in out] == ["verified", "failed", "verified", "verified"]        # the others carry on, in input order
    bad = out[1]
    assert bad.failure.stage == "ideal_load" and bad.failure.code == "EVALUATION_FAILED" and "diverged" in bad.failure.message
    assert bad.evaluation is None and bad.heater is None and bad.recommendation_state is None
    assert [r.mode for r in bad.runs] == ["free_floating"]                                    # what did run is on record
    assert flaky.calls[(target, Mode.IDEAL_LOAD_CONDITIONED)] == 1                            # never retried
    assert flaky.calls[(target, Mode.CAPACITY_LIMITED_CONDITIONED)] == 0                      # and nothing after the failure


def test_an_untrustworthy_result_is_a_failure_too(cold, cands):
    v = verify_candidate(cands[0], Flaky(cold, cands[0].building.design_id, Mode.FREE_FLOATING, corrupt=True), settings())
    assert v.status == "failed" and v.failure.stage == "free_floating" and v.failure.code == "NON_FINITE_RESULT"


def test_a_failure_in_the_last_run_is_reported_at_that_stage(cold, cands):
    v = verify_candidate(cands[0], Flaky(cold, cands[0].building.design_id, Mode.CAPACITY_LIMITED_CONDITIONED), settings())
    assert v.failure.stage == "capacity_limited" and len(v.runs) == 2


def test_a_run_that_is_too_slow_is_a_failed_run(cold, cands):
    class Slow:
        engine_name, engine_version = "standin_slow", "0"

        def simulate(self, job):
            time.sleep(0.15)
            return cold.simulate(job)

    v = verify_candidate(cands[0], Slow(), settings(run_timeout_s=0.05))
    assert v.status == "failed" and v.failure.code == "TIMED_OUT" and v.failure.stage == "free_floating"
    assert verify_candidate(cands[0], Slow(), settings(run_timeout_s=30.0)).status == "verified"


def test_an_unavailable_evaluator_stops_the_whole_batch(cands):
    with pytest.raises(EvaluatorUnavailableError):
        verify_candidate(cands[0], M4Evaluator(), settings())
    with pytest.raises(EvaluatorUnavailableError):
        verify_candidates(cands, M4Evaluator(), settings())
    with pytest.raises(EvaluatorUnavailableError):
        verify_candidates(cands, M4Evaluator(), settings(max_workers=3))


def test_a_building_with_no_heated_room_fails_before_any_run(cold):
    rec = Recorder(cold)
    v = verify_candidate(SimpleNamespace(building=user_room(heater=False)), rec, settings())
    assert v.status == "failed" and (v.failure.stage, v.failure.code) == ("setup", "NO_HEATED_ZONE") and rec.jobs == [] and v.runs == ()


# ------------------------------------------------------------------ batches
def test_workers_change_speed_not_results(cold, cands):
    sequential = verify_candidates(cands, cold, settings(max_workers=1))
    parallel = verify_candidates(cands, cold, settings(max_workers=4))
    assert sequential == parallel and [v.design_id for v in parallel] == [c.building.design_id for c in cands]


def test_verification_is_deterministic(cold, cands):
    assert verify_candidates(cands, cold, settings()) == verify_candidates(cands, cold, settings())


def test_an_empty_batch_is_fine(cold):
    assert verify_candidates([], cold, settings()) == [] and verify_candidates([], cold, settings(max_workers=4)) == []


def test_to_dict_is_json_and_omits_the_bulky_results(cold, cands):
    ok = verify_candidate(cands[0], cold, settings()).to_dict()
    bad = verify_candidate(SimpleNamespace(building=user_room(heater=False)), cold, settings()).to_dict()
    json.dumps([ok, bad])
    assert ok["status"] == "verified" and ok["heater"]["capacity_kw"] > 0 and ok["failure"] is None and len(ok["runs"]) == 3
    assert bad["status"] == "failed" and bad["failure"]["code"] == "NO_HEATED_ZONE" and bad["heater"] is None
    assert "evaluation" not in ok
