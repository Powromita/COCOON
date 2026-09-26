"""M6 phase 1 tests: the interfaces, the job object, and the checks on what comes back."""

from __future__ import annotations

import re
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cocoon_contracts.economics import CostScenario
from cocoon_contracts.simulation import SimulationEngineMode as Mode
from cocoon_contracts.simulation import SimulationRequest, SimulationResult, SimulationStatus

from optimization import rc_verification as rv
from optimization.rc_verification import (
    EconomicsFailedError,
    EconomicsProvider,
    EconomicsUnavailableError,
    EvaluationFailedError,
    Evaluator,
    EvaluatorUnavailableError,
    M4Evaluator,
    M7EconomicsProvider,
    SimulationJob,
    analyse_checked,
    check_result_sanity,
    is_development_only,
    is_development_only_economics,
    run_checked,
)
from optimization.tests.conftest import IST, T0, WEATHER_ID, load_fixture
from optimization.tests.standins import StandInEconomics, StandInEvaluator, default_assumptions

WEEK = timedelta(days=7)


def _job(candidate, mode=Mode.IDEAL_LOAD_CONDITIONED, **kw):
    args = dict(weather_snapshot_id=WEATHER_ID, mode=mode, window_start=T0, window_end=T0 + WEEK, setpoint_c=15.0,
                timestep_seconds=3600)
    args.update(kw)
    return SimulationJob.from_candidate(candidate, **args)


@pytest.fixture
def cand(ladakh_candidates):
    return ladakh_candidates[0]


# ------------------------------------------------------------------ the interfaces
def test_stand_ins_and_placeholders_satisfy_the_protocols(evaluator, economics):
    assert isinstance(evaluator, Evaluator) and isinstance(M4Evaluator(), Evaluator)
    assert isinstance(economics, EconomicsProvider) and isinstance(M7EconomicsProvider(), EconomicsProvider)


def test_unconnected_modules_refuse_instead_of_inventing_results(cand, ladakh_candidates):
    with pytest.raises(EvaluatorUnavailableError) as e:
        M4Evaluator().simulate(_job(cand))
    assert e.value.code == "EVALUATOR_UNAVAILABLE" and "not connected" in str(e.value) and e.value.details["needs"]
    with pytest.raises(EvaluatorUnavailableError):
        run_checked(M4Evaluator(), _job(cand))                              # not swallowed by run_checked
    with pytest.raises(EconomicsUnavailableError) as e2:
        M7EconomicsProvider().analyse(cand.building, cand.quantities, None, "econ_x", CostScenario.EXPECTED)
    assert e2.value.code == "ECONOMICS_UNAVAILABLE"


def test_no_production_file_imports_the_stand_ins():
    root = Path(rv.__file__).parent
    pattern = re.compile(r"^\s*(from|import)\s+[\w.]*standins", re.MULTILINE)
    files = list(root.glob("*.py"))
    assert files, "no production files found"
    importers = sorted(p.name for p in files if pattern.search(p.read_text(encoding="utf-8")))
    # The command line is the one documented exception: it loads them lazily, only for --evaluator/--economics standin.
    # test_boundaries.py checks that exception precisely (that file only, inside a function).
    assert importers in ([], ["__main__.py"]), f"{importers} import the stand-ins"


# ------------------------------------------------------------------ the job
def test_job_carries_what_the_request_contract_cannot(cand):
    job = _job(cand)
    assert job.setpoint_c == 15.0 and job.air_changes_per_hour == cand.extras["air_changes_per_hour"]
    assert job.building is cand.building and job.extras["template_id"] == cand.extras["template_id"]
    assert job.window_hours == 168.0


def test_to_request_builds_a_valid_m0_request(cand):
    job = _job(cand, timestep_seconds=900)
    req = job.to_request()
    assert isinstance(req, SimulationRequest)
    assert req.request_id == job.request_id() and req.request_id.startswith("sim_")
    assert req.design_revision_id == cand.building.revision_id and req.weather_snapshot_id == WEATHER_ID
    assert (req.engine.name, req.engine.mode, req.engine.timestep_seconds) == ("cocoon_multizone_rc", Mode.IDEAL_LOAD_CONDITIONED, 900)
    assert (req.time_window_start, req.time_window_end) == (T0, T0 + WEEK)
    assert (req.initial_temperature_c, req.ground_temperature_c) == (-25.0, -10.0)


def test_request_id_is_deterministic_and_changes_with_every_input(cand):
    base = _job(cand)
    assert base.request_id() == _job(cand).request_id()
    variants = [
        _job(cand, mode=Mode.FREE_FLOATING), _job(cand, setpoint_c=18.0), _job(cand, timestep_seconds=1800),
        _job(cand, initial_temperature_c=-10.0), _job(cand, ground_temperature_c=-5.0), _job(cand, ground_temperature_c=None),
        _job(cand, window_end=T0 + 2 * WEEK), _job(cand, weather_snapshot_id="wx_other"),
        _job(cand, heater_capacity_kw=3.0), replace(base, air_changes_per_hour=1.2),
    ]
    ids = {v.request_id() for v in variants} | {base.request_id()}
    assert len(ids) == len(variants) + 1


@pytest.mark.parametrize("changes, text", [
    ({"window_end": T0}, "after window_start"),
    ({"window_start": datetime(2026, 1, 1)}, "timezone-aware"),
    ({"timestep_seconds": 0}, "timestep"),
    ({"weather_snapshot_id": "leh"}, "wx_"),
    ({"mode": Mode.CAPACITY_LIMITED_CONDITIONED}, "needs heater_capacity_kw"),
    ({"heater_capacity_kw": -1.0}, "positive"),
    ({"air_changes_per_hour": -0.1}, "negative"),
])
def test_invalid_jobs_are_rejected_with_a_code(cand, changes, text):
    with pytest.raises(EvaluationFailedError) as e:
        _job(cand, **changes)
    assert e.value.code == "INVALID_JOB" and text in str(e.value)


def test_capacity_limited_job_with_a_capacity_is_valid(cand):
    assert _job(cand, mode=Mode.CAPACITY_LIMITED_CONDITIONED, heater_capacity_kw=2.5).heater_capacity_kw == 2.5


# ------------------------------------------------------------------ provenance
def test_stand_in_results_are_recognisable_and_real_ones_are_not(cand, evaluator):
    result = run_checked(evaluator, _job(cand))
    assert is_development_only(result) and result.engine.name.startswith("standin_")
    assert result.provenance.code_commit == "standin"
    real_shaped = SimulationResult.model_validate(load_fixture("simulation_result_completed.json"))
    assert not is_development_only(real_shaped)


# ------------------------------------------------------------------ run_checked
def test_run_checked_returns_a_good_result_unchanged(cand, evaluator):
    job = _job(cand)
    assert run_checked(evaluator, job) == evaluator.simulate(job)


class _Fixed:
    """Evaluator returning whatever it is given (to test the checks)."""
    engine_name, engine_version = "standin_fixed", "0"

    def __init__(self, result=None, exc=None):
        self.result, self.exc = result, exc

    def simulate(self, job):
        if self.exc:
            raise self.exc
        return self.result


def _good(cand, evaluator):
    return evaluator.simulate(_job(cand))


def test_a_crashing_evaluator_becomes_a_failed_run(cand):
    with pytest.raises(EvaluationFailedError) as e:
        run_checked(_Fixed(exc=RuntimeError("boom")), _job(cand))
    assert e.value.code == "EVALUATION_FAILED" and e.value.details["exception"] == "RuntimeError"


def test_result_for_another_design_is_refused(cand):
    other = SimulationResult.model_validate(load_fixture("simulation_result_completed.json"))
    with pytest.raises(EvaluationFailedError) as e:
        run_checked(_Fixed(other), _job(cand))
    assert e.value.code == "RESULT_MISMATCH" and any("design" in p for p in e.value.details["problems"])


def test_mode_weather_and_zone_mismatches_are_refused(cand, evaluator):
    good = _good(cand, evaluator)
    for update, word in (({"engine": good.engine.model_copy(update={"mode": "free_floating"})}, "mode"),
                         ({"provenance": good.provenance.model_copy(update={"weather_snapshot_id": "wx_elsewhere"})}, "weather"),
                         ({"zones": good.zones[:2]}, "zone ids")):
        with pytest.raises(EvaluationFailedError) as e:
            run_checked(_Fixed(good.model_copy(update=update)), _job(cand))
        assert e.value.code == "RESULT_MISMATCH" and word in str(e.value)


def test_conditioned_label_is_accepted_for_a_specific_mode(cand, evaluator):
    good = _good(cand, evaluator)
    relabelled = good.model_copy(update={"engine": good.engine.model_copy(update={"mode": "conditioned"})})
    assert run_checked(_Fixed(relabelled), _job(cand)) is relabelled


def test_failed_status_is_refused(cand, evaluator):
    bad = _good(cand, evaluator).model_copy(update={"status": SimulationStatus.FAILED})
    with pytest.raises(EvaluationFailedError) as e:
        run_checked(_Fixed(bad), _job(cand))
    assert e.value.code == "EVALUATION_FAILED" and e.value.details["status"] == "failed"


def test_non_finite_numbers_are_refused(cand, evaluator):
    good = _good(cand, evaluator)
    for update in ({"summary": good.summary.model_copy(update={"heating_energy_kwh": float("nan")})},
                   {"zones": [good.zones[0].model_copy(update={"temperature_mean_c": float("inf")})] + good.zones[1:]}):
        with pytest.raises(EvaluationFailedError) as e:
            run_checked(_Fixed(good.model_copy(update=update)), _job(cand))
        assert e.value.code == "NON_FINITE_RESULT"


def test_absurd_temperatures_are_refused_not_clipped(cand, evaluator):
    good = _good(cand, evaluator)
    hot = good.model_copy(update={"zones": [good.zones[0].model_copy(update={"temperature_max_c": 400.0})] + good.zones[1:]})
    with pytest.raises(EvaluationFailedError) as e:
        run_checked(_Fixed(hot), _job(cand))
    assert e.value.code == "IMPLAUSIBLE_RESULT" and good.zones[0].zone_id in e.value.details["zones"]
    check_result_sanity(hot, temperature_bounds_c=(-90.0, 500.0))            # bounds are a setting


def test_a_time_series_temperature_out_of_bounds_is_caught(cand, evaluator):
    good = _good(cand, evaluator)
    p = good.time_series[3]
    broken = p.model_copy(update={"zone_temperatures_c": {**p.zone_temperatures_c, "living": -300.0}})
    bad = good.model_copy(update={"time_series": good.time_series[:3] + [broken] + good.time_series[4:]})
    with pytest.raises(EvaluationFailedError) as e:
        check_result_sanity(bad)
    assert e.value.code == "IMPLAUSIBLE_RESULT"


def test_energy_balance_that_does_not_close_is_refused(cand, evaluator):
    good = _good(cand, evaluator)
    leaky = good.model_copy(update={"summary": good.summary.model_copy(update={"energy_residual_max_pct": 5.0})})
    with pytest.raises(EvaluationFailedError) as e:
        run_checked(_Fixed(leaky), _job(cand))
    assert e.value.code == "ENERGY_RESIDUAL_TOO_LARGE"
    check_result_sanity(leaky, max_residual_pct=10.0)                       # the limit is a setting


def test_a_real_shaped_m0_result_passes_the_sanity_check():
    check_result_sanity(SimulationResult.model_validate(load_fixture("simulation_result_completed.json")))


# ------------------------------------------------------------------ economics
def _sim(cand, evaluator, **kw):
    return run_checked(evaluator, _job(cand, **kw))


def test_economics_round_trip_and_hand_check(cand, evaluator, economics):
    sim = _sim(cand, evaluator)
    econ = analyse_checked(economics, cand.building, cand.quantities, sim, "econ_standin_expected_v0")
    assert is_development_only_economics(econ) and econ.design_revision_id == cand.building.revision_id
    a = default_assumptions()
    c = econ.capex
    assert c.total_capex_inr == pytest.approx(c.materials_inr + c.labour_inr + c.transport_inr + c.equipment_inr)
    assert c.labour_inr == pytest.approx(0.35 * c.materials_inr)
    mass = sum(m.mass_kg for m in cand.quantities.materials)
    assert c.transport_inr == pytest.approx(mass * 12.0 * 1.25)
    assert c.equipment_inr == pytest.approx(sim.summary.peak_heating_kw * 12000.0)
    days = len(sim.time_series) * sim.engine.timestep_seconds / 86400.0
    litres = sim.summary.heating_energy_kwh / days * 180.0 / (9.7 * 0.85)
    assert econ.annual_fuel_litres == pytest.approx(litres)
    year1 = econ.annual_cash_flows[0]
    assert year1.fuel_cost_inr == pytest.approx(litres * 95.0)
    assert year1.logistics_cost_inr == pytest.approx(year1.fuel_cost_inr * 0.25)
    assert year1.total_opex_inr == pytest.approx(year1.fuel_cost_inr + year1.logistics_cost_inr + 25000.0)
    assert year1.discounted_opex_inr == pytest.approx(year1.total_opex_inr / 1.08)
    assert econ.lcc_inr == pytest.approx(c.total_capex_inr + sum(p.discounted_opex_inr for p in econ.annual_cash_flows))
    assert len(econ.annual_cash_flows) == a.project_lifetime_years


def test_scenarios_are_ordered_low_expected_high(cand, evaluator, snapshot):
    econ = StandInEconomics(snapshot, {"econ_standin_expected_v0": default_assumptions()})
    sim = _sim(cand, evaluator)
    lcc = {s: analyse_checked(econ, cand.building, cand.quantities, sim, "econ_standin_expected_v0", s).lcc_inr
           for s in CostScenario}
    assert lcc[CostScenario.LOW] < lcc[CostScenario.EXPECTED] < lcc[CostScenario.HIGH]


def test_economics_needs_a_known_assumption_set_and_a_time_series(cand, evaluator, economics):
    sim = _sim(cand, evaluator)
    with pytest.raises(EconomicsFailedError) as e:
        analyse_checked(economics, cand.building, cand.quantities, sim, "econ_unknown")
    assert e.value.code == "UNKNOWN_ASSUMPTION_SET"
    with pytest.raises(EconomicsFailedError) as e2:
        analyse_checked(economics, cand.building, cand.quantities, sim.model_copy(update={"time_series": None}),
                        "econ_standin_expected_v0")
    assert e2.value.code == "MISSING_TIME_SERIES"


class _FixedEcon:
    def __init__(self, result=None, exc=None):
        self.result, self.exc = result, exc

    def analyse(self, *args):
        if self.exc:
            raise self.exc
        return self.result


def test_inconsistent_economics_is_refused(cand, evaluator, economics):
    sim = _sim(cand, evaluator)
    good = analyse_checked(economics, cand.building, cand.quantities, sim, "econ_standin_expected_v0")
    cases = {
        "design revision": good.model_copy(update={"design_revision_id": "rev_other"}),
        "assumption set": good.model_copy(update={"assumption_set_id": "econ_other"}),
        "scenario": good.model_copy(update={"scenario": CostScenario.HIGH}),
        "capex total": good.model_copy(update={"capex": good.capex.model_copy(update={"total_capex_inr": 1.0})}),
        "below capex": good.model_copy(update={"lcc_inr": good.capex.total_capex_inr / 2}),
        "years": good.model_copy(update={"annual_cash_flows": good.annual_cash_flows[1:]}),
    }
    for word, bad in cases.items():
        with pytest.raises(EconomicsFailedError) as e:
            analyse_checked(_FixedEcon(bad), cand.building, cand.quantities, sim, "econ_standin_expected_v0")
        assert e.value.code == "ECONOMICS_INCONSISTENT" and word.split()[0] in " ".join(e.value.details["problems"]), word


def test_a_crashing_economics_provider_becomes_a_failed_analysis(cand, evaluator):
    with pytest.raises(EconomicsFailedError) as e:
        analyse_checked(_FixedEcon(exc=RuntimeError("x")), cand.building, cand.quantities, _sim(cand, evaluator), "econ_a")
    assert e.value.code == "ECONOMICS_FAILED"
