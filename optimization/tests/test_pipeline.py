"""M6 phase 9 tests: optimize(), the public entry point."""

from __future__ import annotations

import copy
import json
from dataclasses import replace
from datetime import timedelta
from types import SimpleNamespace

import pytest
from cocoon_contracts.economics import CostScenario
from cocoon_contracts.simulation import SimulationEngineMode as Mode

from design_generator import GenerationOptions, generate_designs
from optimization import (
    EvaluatorUnavailableError,
    OptimizationError,
    OptimizationSettings,
    PerturbationSpec,
    Prediction,
    ScreeningSettings,
    optimize,
    to_error_envelope,
)
from optimization import pipeline as pl
from optimization.objectives import compute_objectives
from optimization.pareto import pareto_front
from optimization.ranking import PICKS, RankingSettings, rank_designs
from optimization.rc_verification import (
    EconomicsFailedError,
    EvaluationFailedError,
    M7EconomicsProvider,
    VerificationSettings,
    analyse_checked,
    verify_candidates,
)
from optimization.tests.conftest import T0, load_fixture
from optimization.tests.standins import StandInEconomics, StandInEvaluator, default_assumptions, make_winter_weather

WX = "wx_pipe"
COUNT = 8
SET_ID = "econ_ladakh_expected_v1"


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def reqs():
    return load_fixture("requirements_ladakh_30p.json")


@pytest.fixture(scope="module")
def evaluator(snapshot):
    return StandInEvaluator(snapshot, {WX: make_winter_weather(WX, days=14, mean_c=-35.0),
                                       "wx_pipe_cold": make_winter_weather("wx_pipe_cold", days=14, mean_c=-45.0)})


@pytest.fixture(scope="module")
def econ(snapshot):
    return StandInEconomics(snapshot, {SET_ID: default_assumptions(SET_ID)})


@pytest.fixture(scope="module")
def cands(reqs):
    return generate_designs(reqs, load_fixture("material_snapshot_standard.json"), seed=42, count=COUNT, created_at=T0).candidates


def run(reqs, snapshot, evaluator, economics, **kw):
    kw.setdefault("weather_snapshot_id", WX)
    kw.setdefault("seed", 42)
    kw.setdefault("count", COUNT)
    kw.setdefault("created_at", T0)
    return optimize(reqs, snapshot, evaluator, economics, **kw)


@pytest.fixture(scope="module")
def full(reqs, snapshot, evaluator, econ):
    return run(reqs, snapshot, evaluator, econ)


@pytest.fixture(scope="module")
def plain(reqs, snapshot, evaluator, econ):
    return run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(reliability=None))


def without_time(result):
    d = result.to_dict()
    d.pop("timings_s")
    return d


class Spy:
    """Wraps an evaluator: records every job and can fail or edit results for chosen designs."""

    def __init__(self, inner, *, fail=None, edit=None, unavailable=False):
        self.inner, self.jobs, self.fail, self.edit, self.unavailable = inner, [], fail, edit, unavailable
        self.engine_name, self.engine_version = inner.engine_name, inner.engine_version
        self.supported_perturbations = getattr(inner, "supported_perturbations", None)

    def simulate(self, job):
        if self.unavailable:
            raise EvaluatorUnavailableError("M4 is down")
        self.jobs.append(job)
        if self.fail and self.fail(job):
            raise EvaluationFailedError("boom", "RUN_FAILED")
        out = self.inner.simulate(job)
        return self.edit(job, out) if self.edit else out

    def designs_run(self):
        return {j.building.design_id for j in self.jobs}


# ------------------------------------------------------------------ the whole flow
def test_every_generated_design_ends_in_exactly_one_outcome(full, cands):
    ids = [c.building.design_id for c in cands]
    assert [o.design_id for o in full.outcomes] == ids and len(set(ids)) == COUNT
    assert all(o.status in pl.OUTCOMES for o in full.outcomes)
    assert sum(full.summary()[s] for s in pl.OUTCOMES if s in full.summary()) == COUNT and full.summary()["generated"] == COUNT
    assert full.generation.generated == COUNT and full.generation.complete and full.generation.requested == COUNT
    assert full.project_id == load_fixture("requirements_ladakh_30p.json")["project_id"]


def test_the_four_picks_are_real_eligible_designs_and_outcomes_agree(full):
    assert set(full.ranking.picks) == set(PICKS) and all(p.status == "selected" for p in full.ranking.picks.values())
    for name in PICKS:
        p = full.pick(name)
        assert p.design_id in full.ranking.eligible and name in full.outcome(p.design_id).picked_as
        assert full.candidate(p.design_id).building.design_id == p.design_id
    assert full.recommended is full.ranking.picks["best_overall"]
    assert sorted(n for o in full.outcomes for n in o.picked_as) == sorted(PICKS)
    assert all(o.status in (pl.ON_FRONT, pl.ON_FRONT_OVER_LIMIT) for o in full.outcomes if o.picked_as)


def test_a_stand_in_run_is_stamped_and_never_presented_as_validated(full):
    assert full.development_only and all(o.development_only for o in full.outcomes if o.heater_capacity_kw is not None)
    assert all(o.recommendation_state is None for o in full.outcomes if o.heater_capacity_kw is not None)      # not VERIFIED_BY_RC
    assert any("NOT verified by the real RC engine" in w for w in full.warnings)
    d = full.to_dict()
    assert d["development_only"] and "NOT verified by M4 and NOT validated by ANSYS" in d["validation"]
    assert d["schema"].startswith("PROPOSED") and "not an M0 contract" in d["schema"]


def test_a_real_named_engine_gets_verified_by_rc_and_never_validated_by_ansys(reqs, snapshot, econ):
    class Real(StandInEvaluator):
        engine_name = "cocoon_multizone_rc"

    ev = Real(snapshot, {WX: make_winter_weather(WX, days=14, mean_c=-35.0)})
    r = run(reqs, snapshot, ev, None, settings=OptimizationSettings(reliability=None))
    live = [o for o in r.outcomes if o.heater_capacity_kw is not None]
    assert live and all(o.recommendation_state == "VERIFIED_BY_RC" and not o.development_only for o in live)
    assert not r.development_only and "verified by the RC engine (M4); not validated by ANSYS" in r.to_dict()["validation"]
    assert "VALIDATED_BY_ANSYS" not in json.dumps(r.to_dict())


def test_runs_are_counted_three_per_verified_design_plus_the_reliability_runs(full):
    assert full.runs["verification"] == 3 * COUNT
    rel = full.reliability
    assert rel is not None and full.runs["reliability"] == rel.runs == 2 * len(rel.designs) * len(rel.cases)


def test_the_result_is_json_and_carries_no_building_models(full):
    text = json.dumps(full.to_dict())
    d = json.loads(text)
    assert set(d) >= {"schema", "picks", "outcomes", "constraints", "screening", "pareto", "reliability", "assumptions", "warnings", "runs"}
    assert "floors" not in text and "surfaces" not in d["outcomes"][0]
    assert len(d["outcomes"]) == COUNT and d["generation"]["requested"] == COUNT and d["engine"]["name"] == "standin_lumped_rc"


def test_a_run_is_deterministic(reqs, snapshot, evaluator, econ, full):
    again = run(reqs, snapshot, evaluator, econ)
    assert without_time(again) == without_time(full)


def test_the_seed_changes_the_designs(reqs, snapshot, evaluator, econ, full):
    other = run(reqs, snapshot, evaluator, econ, seed=7, settings=OptimizationSettings(reliability=None))
    assert {o.design_id for o in other.outcomes} != {o.design_id for o in full.outcomes}


# ------------------------------------------------------------------ cross-check against the stages called by hand
def test_optimize_gives_what_the_stages_give_when_called_one_by_one(reqs, snapshot, evaluator, econ, cands, plain):
    vs = VerificationSettings.from_requirements(reqs, weather_snapshot_id=WX)
    verified = verify_candidates(cands, evaluator, vs)
    objs, evs = [], {}
    for c, v in zip(cands, verified):
        e = analyse_checked(econ, c.building, c.quantities, v.evaluation.capacity_limited, SET_ID, CostScenario.EXPECTED)
        ev = replace(v.evaluation, quantities=c.quantities, economics=e)
        evs[c.building.design_id] = ev
        objs.append(compute_objectives(ev, vs.to_objective_settings(12.0)))
    expected = rank_designs(objs, pareto_front(objs))
    for name in PICKS:
        assert plain.pick(name).design_id == expected.picks[name].design_id
        assert plain.pick(name).value == pytest.approx(expected.picks[name].value)
    mine = {o.design_id: {k: v.value for k, v in o.values.items()} for o in plain.objectives}
    for o in objs:
        assert mine[o.design_id] == {k: v.value for k, v in o.values.items()}
    assert plain.pareto.front == pareto_front(objs).front and plain.ranking.eligible == expected.eligible
    assert {d: v.heater.capacity_kw for d, v in plain.verified.items()} == {v.design_id: v.heater.capacity_kw for v in verified}


def test_economics_are_priced_from_the_capacity_limited_run_of_the_sized_heater(reqs, snapshot, evaluator, econ):
    class Recorder(StandInEconomics):
        calls = []

        def analyse(self, building, quantities, simulation, assumption_set_id, scenario):
            Recorder.calls.append((building.design_id, simulation, assumption_set_id, scenario))
            return super().analyse(building, quantities, simulation, assumption_set_id, scenario)

    Recorder.calls = []
    rec = Recorder(snapshot, {SET_ID: default_assumptions(SET_ID)})
    r = run(reqs, snapshot, evaluator, rec, settings=OptimizationSettings(reliability=None))
    assert len(Recorder.calls) == COUNT
    for design_id, sim, set_id, scenario in Recorder.calls:
        plan = r.verified[design_id].heater
        assert sim.engine.mode.value == "capacity_limited_conditioned" and set_id == SET_ID and scenario == CostScenario.EXPECTED
        assert sim.summary.peak_heating_kw <= plan.capacity_kw * len(plan.zone_ids) + 1e-6           # cannot exceed what was installed
    assert any("priced from each design's capacity-limited run" in a for a in r.assumptions)


# ------------------------------------------------------------------ screening
def cheating_predictor(good=4):
    """First ``good`` designs look excellent, the rest terrible (by far more than any safety margin)."""
    class P:
        def predict(self, candidates):
            return [Prediction("ok", {"heating_energy_kwh": 100.0 if i < good else 300.0, "peak_heating_kw": 5.0 if i < good else 15.0},
                               None, "test-model", "m4") for i, _ in enumerate(candidates)]
    return P()


def test_ml_only_shortlists_and_the_discarded_designs_are_never_simulated(reqs, snapshot, evaluator, econ, cands):
    spy = Spy(evaluator)
    s = OptimizationSettings(screening=ScreeningSettings(dimensions=("heating_energy_kwh", "peak_heating_kw"), shortlist_size=None,
                                                         min_shortlist=0), reliability=None)
    r = run(reqs, snapshot, spy, econ, predictor=cheating_predictor(4), settings=s)
    bad = [c.building.design_id for c in cands[4:]]
    assert set(r.screening.discarded) == set(bad) and spy.designs_run() == {c.building.design_id for c in cands[:4]}
    for d in bad:
        o = r.outcome(d)
        assert o.status == pl.DISCARDED_ML and o.stage == "screening" and o.recommendation_state == "SCREENED_BY_ML" and not o.objectives
    assert r.runs["verification"] == 3 * 4 and r.summary()[pl.DISCARDED_ML] == 4
    assert all(r.pick(n).design_id not in bad for n in PICKS)                                     # ML never supplies a pick


def test_a_crashing_predictor_never_blocks_the_physics(reqs, snapshot, evaluator, econ):
    class Boom:
        def predict(self, candidates):
            raise RuntimeError("model file missing")
    r = run(reqs, snapshot, evaluator, econ, predictor=Boom(), settings=OptimizationSettings(reliability=None))
    assert r.runs["verification"] == 3 * COUNT and any("predictor failed" in w for w in r.warnings)


def test_without_a_predictor_every_design_goes_to_rc(plain):
    assert plain.screening.ml_used is False and len(plain.screening.to_rc) == COUNT and not plain.screening.discarded


# ------------------------------------------------------------------ constraints
def test_a_design_that_breaks_a_hard_constraint_is_excluded_before_any_run(reqs, snapshot, evaluator, econ):
    spy = Spy(evaluator)
    r = run(reqs, snapshot, spy, econ, settings=OptimizationSettings(reliability=None, verification={"heater_fuel": "diesel"}))
    assert spy.jobs == [] and r.runs == {"verification": 0, "reliability": 0}
    assert all(o.status == pl.EXCLUDED_CONSTRAINTS and o.failed_constraints == ("heater_fuel_allowed",) for o in r.outcomes)
    assert all("diesel" in o.reason for o in r.outcomes)
    assert all(p.status == "unavailable" for p in r.ranking.picks.values()) and r.pareto is None
    assert "no design is on the Pareto front" in r.warnings


def test_the_capex_limit_is_checked_after_pricing_and_excludes_by_hand(reqs, snapshot, evaluator, econ, plain):
    capex = {o.design_id: o.value("capex_inr") for o in plain.objectives}
    cut = sorted(capex.values())[COUNT // 2]                                                       # the upper half exceeds this
    tight = copy.deepcopy(reqs)
    tight["constraints"]["maximum_capex_inr"] = cut
    r = run(tight, snapshot, evaluator, econ, settings=OptimizationSettings(reliability=None))
    over = {d for d, v in capex.items() if v > cut + 1e-6}
    assert {o.design_id for o in r.outcomes if o.status == pl.EXCLUDED_AFTER_PRICING} == over and over
    assert all(r.pick(n).design_id not in over for n in PICKS if r.pick(n).design_id)
    assert all(o.failed_constraints == ("capex_within_budget",) for o in r.outcomes if o.design_id in over)
    assert all(d not in r.pareto.front for d in over) and all(o.design_id not in over for o in r.objectives)


def test_the_capex_limit_is_reported_as_unchecked_when_there_is_no_economics(reqs, snapshot, evaluator):
    r = run(reqs, snapshot, evaluator, None, settings=OptimizationSettings(reliability=None))
    skipped = {name for rep in r.constraint_reports.values() for name, _ in rep.skipped}
    assert "capex_within_budget" in skipped and "assembly_time_within_limit" in skipped                # neither was really checked


# ------------------------------------------------------------------ failures are recorded, never retried
def test_a_failing_run_is_recorded_on_that_design_and_the_rest_carry_on(reqs, snapshot, evaluator, econ, cands):
    victim = cands[2].building.design_id
    spy = Spy(evaluator, fail=lambda j: j.building.design_id == victim and j.mode == Mode.IDEAL_LOAD_CONDITIONED)
    r = run(reqs, snapshot, spy, econ, settings=OptimizationSettings(reliability=None))
    o = r.outcome(victim)
    assert o.status == pl.FAILED_VERIFICATION and o.stage == "ideal_load" and "RUN_FAILED" in o.reason and not o.objectives
    assert sum(1 for j in spy.jobs if j.building.design_id == victim) == 2                          # free-floating, then the one failing try
    assert r.summary()[pl.FAILED_VERIFICATION] == 1 and sum(o.heater_capacity_kw is not None for o in r.outcomes) == COUNT - 1
    assert all(r.pick(n).design_id != victim for n in PICKS)


def test_an_unavailable_evaluator_raises_and_maps_to_a_retryable_envelope(reqs, snapshot, evaluator, econ):
    with pytest.raises(EvaluatorUnavailableError) as e:
        run(reqs, snapshot, Spy(evaluator, unavailable=True), econ)
    env = to_error_envelope(e.value, trace_id="t-1")
    assert env.error.code.value == "VALIDATION_ERROR" and env.error.retryable and env.error.trace_id == "t-1"
    assert env.error.details["m6_code"] == "EVALUATOR_UNAVAILABLE" and env.error.details["exception"] == "EvaluatorUnavailableError"


# ------------------------------------------------------------------ economics
def test_without_economics_cost_picks_are_unavailable_and_the_rest_still_work(reqs, snapshot, evaluator):
    r = run(reqs, snapshot, evaluator, None, settings=OptimizationSettings(reliability=None))
    assert r.pick("lowest_lcc").status == "unavailable" and r.pick("lowest_capex").status == "unavailable"
    assert r.pick("best_overall").status == "selected" and r.pick("best_thermal").status == "selected"
    assert set(r.pick("best_overall").dropped_objectives) >= {"lcc_inr", "capex_inr"}
    assert any("no economics provider was given" in w for w in r.warnings)
    assert not any("priced from" in a for a in r.assumptions)


def test_an_unconnected_m7_is_reported_and_leaves_every_design_without_a_cost(reqs, snapshot, evaluator):
    r = run(reqs, snapshot, evaluator, M7EconomicsProvider(), settings=OptimizationSettings(reliability=None))
    assert any("economics provider is unavailable" in w for w in r.warnings)
    assert r.pick("lowest_lcc").status == "unavailable" and r.pick("best_overall").status == "selected"
    assert all(o.value("lcc_inr") is None for o in r.objectives)


def test_a_partly_working_provider_leaves_no_design_with_a_stale_cost(reqs, snapshot, evaluator, econ):
    class Flaky(StandInEconomics):
        n = 0

        def analyse(self, *a):
            Flaky.n += 1
            if Flaky.n == 3:
                from optimization.rc_verification import EconomicsUnavailableError
                raise EconomicsUnavailableError("M7 went away")
            return super().analyse(*a)

    Flaky.n = 0
    r = run(reqs, snapshot, evaluator, Flaky(snapshot, {SET_ID: default_assumptions(SET_ID)}), settings=OptimizationSettings(reliability=None))
    assert Flaky.n == 3                                                                                # it was not asked again after failing
    assert all(o.value("lcc_inr") is None and o.value("capex_inr") is None for o in r.objectives)
    assert r.pick("lowest_capex").status == "unavailable" and any("economics provider is unavailable" in w for w in r.warnings)


def test_a_design_whose_economics_fail_is_recorded_and_the_others_are_priced(reqs, snapshot, evaluator, econ, cands):
    victim = cands[1].building.design_id

    class Picky(StandInEconomics):
        def analyse(self, building, quantities, simulation, assumption_set_id, scenario):
            if building.design_id == victim:
                raise EconomicsFailedError("no price for this envelope", "NO_PRICE")
            return super().analyse(building, quantities, simulation, assumption_set_id, scenario)

    r = run(reqs, snapshot, evaluator, Picky(snapshot, {SET_ID: default_assumptions(SET_ID)}), settings=OptimizationSettings(reliability=None))
    o = r.outcome(victim)
    assert o.status == pl.FAILED_ECONOMICS and o.stage == "economics" and "NO_PRICE" in o.reason
    assert r.summary()[pl.FAILED_ECONOMICS] == 1 and victim not in {x.design_id for x in r.objectives}
    assert r.pick("lowest_lcc").status == "selected"


def test_a_wrong_assumption_set_fails_every_design_and_says_where_to_look(reqs, snapshot, evaluator):
    bad = StandInEconomics(snapshot, {"econ_other": default_assumptions("econ_other")})
    r = run(reqs, snapshot, evaluator, bad, settings=OptimizationSettings(reliability=None))
    assert r.summary()[pl.FAILED_ECONOMICS] == COUNT and all(p.status == "unavailable" for p in r.ranking.picks.values())
    assert any("economics failed for every verified design" in w and SET_ID in w and "UNKNOWN_ASSUMPTION_SET" in w for w in r.warnings)


def test_the_cost_scenario_is_passed_to_economics(reqs, snapshot, evaluator, plain):
    e = StandInEconomics(snapshot, {SET_ID: default_assumptions(SET_ID)})
    hi = run(reqs, snapshot, evaluator, e, settings=OptimizationSettings(reliability=None, cost_scenario=CostScenario.HIGH))
    assert all(o.value("capex_inr") > p.value("capex_inr") for o, p in zip(hi.objectives, plain.objectives))          # HIGH costs 25 % more


# ------------------------------------------------------------------ the run budget
def test_a_plan_over_the_budget_is_refused_before_any_simulation(reqs, snapshot, evaluator, econ):
    spy = Spy(evaluator)
    with pytest.raises(OptimizationError) as e:
        run(reqs, snapshot, spy, econ, settings=OptimizationSettings(max_runs=10))
    assert e.value.code == "RUN_BUDGET_EXCEEDED" and e.value.details["runs_needed"] == 3 * COUNT and e.value.details["max_runs"] == 10
    assert spy.jobs == []
    ok = run(reqs, snapshot, spy, econ, settings=OptimizationSettings(max_runs=3 * COUNT, reliability=None))          # exactly the need is fine
    assert ok.runs["verification"] == 3 * COUNT


def test_reliability_is_skipped_not_fatal_when_the_budget_is_used_up(reqs, snapshot, evaluator, econ):
    r = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(max_runs=3 * COUNT))
    assert r.reliability is None and r.runs["reliability"] == 0 and any("reliability was skipped" in w and "used up" in w for w in r.warnings)
    assert r.pick("best_overall").status == "selected"
    r2 = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(max_runs=3 * COUNT + 5))
    assert r2.reliability is None and any("reliability was skipped" in w and "needs" in w for w in r2.warnings)
    r3 = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(max_runs=3 * COUNT + 400))
    assert r3.reliability is not None and r3.runs["reliability"] <= 400


# ------------------------------------------------------------------ reliability in the flow
def test_reliability_is_measured_for_the_eligible_designs_and_used_in_the_ranking(full, plain):
    assert full.reliability is not None and set(full.reliability.designs) == set(full.ranking.eligible)
    assert "reliability" in full.pick("best_overall").weights and "reliability" not in plain.pick("best_overall").weights
    scores = full.reliability.reliability_by_design()
    assert all(0.0 <= v <= 1.0 for v in scores.values()) and all(o.value("reliability") == scores.get(o.design_id) for o in full.objectives
                                                                    if o.design_id in scores)
    assert {n: full.pick(n).design_id for n in ("best_thermal", "lowest_lcc", "lowest_capex")} == \
        {n: plain.pick(n).design_id for n in ("best_thermal", "lowest_lcc", "lowest_capex")}                     # only best_overall may move
    assert full.reliability.seed == 42                                                                             # taken from the run's seed


def test_reliability_can_be_switched_off(plain):
    assert plain.reliability is None and plain.runs["reliability"] == 0 and plain.to_dict()["reliability"] is None


def test_when_too_many_designs_are_eligible_reliability_is_reported_but_does_not_rank(reqs, snapshot, evaluator, econ, plain):
    r = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(reliability_max_designs=2))
    top2 = sorted(plain.ranking.eligible, key=lambda d: (-plain.ranking.scores[d]["overall"], d))[:2]
    expected = set(top2) | {plain.pick(n).design_id for n in PICKS}                          # the best two by score, plus every pick
    assert set(r.reliability.designs) == expected and len(expected) < len(plain.ranking.eligible)
    assert "reliability" not in r.pick("best_overall").weights
    assert any(f"measured for {len(expected)} of the {len(plain.ranking.eligible)} eligible designs" in w and "not used to rank them" in w
               for w in r.warnings)
    assert r.pareto.front == plain.pareto.front and r.ranking.eligible == plain.ranking.eligible


def test_reliability_fits_exactly_when_the_cap_equals_the_eligible_count(reqs, snapshot, evaluator, econ, plain):
    n = len(plain.ranking.eligible)
    r = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(reliability_max_designs=n))
    assert set(r.reliability.designs) == set(plain.ranking.eligible) and "reliability" in r.pick("best_overall").weights
    # one below the count: the omitted design is still assessed when it is a pick, so reliability only stops ranking if it is not
    smaller = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(reliability_max_designs=n - 1))
    by_score = sorted(plain.ranking.eligible, key=lambda d: (-plain.ranking.scores[d]["overall"], d))
    covered = set(by_score[:n - 1]) | {plain.pick(k).design_id for k in PICKS}
    assert set(smaller.reliability.designs) == covered
    assert ("reliability" in smaller.pick("best_overall").weights) == (covered == set(plain.ranking.eligible))


# ------------------------------------------------------------------ a design that breaks the unmet-hours limit
def test_a_winner_that_breaks_the_comfort_limit_stays_visible_but_loses_every_pick(reqs, snapshot, evaluator, econ, plain):
    victim = plain.pick("best_overall").design_id                                         # the design that would win

    def colder(job, result):
        if job.building.design_id != victim or job.mode != Mode.CAPACITY_LIMITED_CONDITIONED:
            return result
        pts = [p.model_copy(update={"zone_temperatures_c": {z: t - 8.0 for z, t in p.zone_temperatures_c.items()}}) for p in result.time_series]
        return result.model_copy(update={"time_series": pts})

    r = run(reqs, snapshot, Spy(evaluator, edit=colder), econ, settings=OptimizationSettings(reliability=None))
    o = r.outcome(victim)
    assert o.status == pl.ON_FRONT_OVER_LIMIT and o.objectives["unmet_hours"] == 120.0 and o.picked_as == ()      # 8 K colder: cold every hour
    assert o.reason == "not beaten on every objective, but above the unmet-hours limit, so it cannot be picked"
    assert o.flags == ("120 unmet hours, above the 12 h limit",) and victim in r.pareto.front
    assert victim not in r.ranking.eligible and all(r.pick(n).design_id != victim for n in PICKS)
    assert r.pick("best_overall").design_id != victim and r.pick("best_overall").pool_size == len(plain.ranking.eligible) - 1
    assert r.summary()[pl.ON_FRONT_OVER_LIMIT] == 1


def test_when_no_design_meets_the_limit_the_picks_say_so(reqs, snapshot, evaluator, econ):
    def colder(job, result):
        if job.mode != Mode.CAPACITY_LIMITED_CONDITIONED:
            return result
        pts = [p.model_copy(update={"zone_temperatures_c": {z: t - 8.0 for z, t in p.zone_temperatures_c.items()}}) for p in result.time_series]
        return result.model_copy(update={"time_series": pts})

    r = run(reqs, snapshot, Spy(evaluator, edit=colder), econ, settings=OptimizationSettings(reliability=None))
    assert all(r.pick(n).flagged for n in PICKS) and "no eligible design meets the unmet-hours limit" in r.warnings
    assert all(o.status == pl.ON_FRONT_OVER_LIMIT or o.status == pl.DOMINATED for o in r.outcomes)


def test_the_explanations_use_the_real_economics_and_extras_of_the_pick(plain, full):
    p = plain.pick("lowest_lcc")
    e = plain.candidate(p.design_id)
    money = next(x for x in p.explanation if x.sources[0] == "economics.capex.total_capex_inr")
    lcc = plain.outcome(p.design_id).objectives["lcc_inr"]
    assert f"{lcc:,.0f}" in money.sentence
    assert any(x.sources[0] == "objectives.unmet_hours" for x in p.explanation) and e.building.design_id == p.design_id
    heat = next(x for x in plain.pick("best_overall").explanation if x.sources[0] == "building.assemblies[*].u_value_w_m2k")
    assert "extras.air_changes_per_hour" in heat.sources                                          # the design's own ACH was passed through


# ------------------------------------------------------------------ every setting reaches the stage it belongs to
def test_a_dominated_design_names_the_design_that_beats_it_and_it_really_does(plain):
    dominated = [o for o in plain.outcomes if o.status == pl.DOMINATED]
    assert dominated
    by_id = {r.design_id: r for r in plain.objectives}
    for o in dominated:
        assert o.dominated_by == tuple(plain.pareto.dominated_by[o.design_id]) and o.dominated_by
        assert o.reason == f"beaten on every objective by {', '.join(o.dominated_by)}"
        for d in o.dominated_by:
            assert d in plain.pareto.front
            assert all(by_id[d].value(n) <= by_id[o.design_id].value(n) + 1e-9 for n in plain.pareto.objectives)      # never worse
            assert any(by_id[d].value(n) < by_id[o.design_id].value(n) - 1e-9 for n in plain.pareto.objectives)       # better somewhere
    assert all(o.dominated_by == () for o in plain.outcomes if o.status != pl.DOMINATED)


def test_objective_overrides_reach_the_objectives(reqs, snapshot, evaluator, econ, plain):
    def overheating(margin):
        r = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(reliability=None, objective={"overheating_margin_c": margin}))
        return [o.value("overheating_degree_hours") for o in r.objectives]
    default, tight, medium, loose = [o.value("overheating_degree_hours") for o in plain.objectives], overheating(0.5), overheating(2.0), overheating(100.0)
    assert set(default) == {0.0} and set(loose) == {0.0}                                # the default limit (target + 9 C) is never reached
    assert all(t >= m - 1e-9 for t, m in zip(tight, medium)) and sum(t > 0 for t in tight) >= 5 and tight[1] > medium[1] > 0
    with pytest.raises(Exception) as e:
        run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(reliability=None, objective={"overheating_margin_c": -1.0}))
    assert e.value.code == "INVALID_SETTINGS"


def test_ranking_settings_reach_the_picks(reqs, snapshot, evaluator, econ, plain):
    r = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(
        reliability=None, ranking=RankingSettings(overall_weights={"capex_inr": 1.0})))
    assert r.pick("best_overall").weights == {"capex_inr": 1.0} and r.pick("best_overall").design_id == r.pick("lowest_capex").design_id
    assert r.pick("best_overall").design_id != plain.pick("best_overall").design_id                 # a different design than with the defaults
    assert r.pick("lowest_lcc").design_id == plain.pick("lowest_lcc").design_id


def test_pareto_settings_reach_the_front(reqs, snapshot, evaluator, econ, plain):
    from optimization.pareto import ParetoSettings
    loose = ParetoSettings(relative_tolerance=1.0)
    r = run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(reliability=None, pareto=loose))
    assert r.pareto.front == pareto_front(list(r.objectives), settings=loose).front and r.pareto.front != plain.pareto.front
    assert r.summary().get(pl.DOMINATED, 0) != plain.summary().get(pl.DOMINATED, 0)


def test_created_at_reaches_the_designs_metadata(reqs, snapshot, evaluator, econ, full):
    assert {c.building.metadata.created_at for c in full.candidates} == {T0}
    later = T0 + timedelta(days=30)
    r = run(reqs, snapshot, evaluator, econ, created_at=later, settings=OptimizationSettings(reliability=None))
    assert {c.building.metadata.created_at for c in r.candidates} == {later}
    assert [c.building.design_id for c in r.candidates] == [c.building.design_id for c in full.candidates]     # ids do not depend on it


# ------------------------------------------------------------------ settings and errors
@pytest.mark.parametrize("kw,code", [(dict(count=0), "INVALID_SETTINGS"), (dict(weather_snapshot_id="standard"), "INVALID_SETTINGS")])
def test_bad_arguments_are_refused(reqs, snapshot, evaluator, econ, kw, code):
    with pytest.raises(OptimizationError) as e:
        run(reqs, snapshot, evaluator, econ, **kw)
    assert e.value.code == code


@pytest.mark.parametrize("kw", [dict(reliability_max_designs=0), dict(max_runs=0), dict(verification={"nonsense": 1}),
                                dict(verification={"setpoint_c": 20.0}), dict(verification={"weather_snapshot_id": "wx_other"})])
def test_bad_settings_are_refused(kw):
    with pytest.raises(OptimizationError) as e:
        OptimizationSettings(**kw)
    assert e.value.code == "INVALID_SETTINGS"


def test_verification_overrides_reach_the_runs(reqs, snapshot, evaluator, econ):
    spy = Spy(evaluator)
    run(reqs, snapshot, spy, econ, settings=OptimizationSettings(reliability=None, verification={"timestep_seconds": 7200, "ground_temperature_c": -5.0}))
    assert {j.timestep_seconds for j in spy.jobs} == {7200} and {j.ground_temperature_c for j in spy.jobs} == {-5.0}
    assert {j.setpoint_c for j in spy.jobs} == {15.0} and {j.weather_snapshot_id for j in spy.jobs} == {WX}      # the requirement's target


def test_requirements_that_cannot_be_met_raise_the_m2_error_and_map_to_its_envelope(reqs, snapshot, evaluator, econ):
    bad = copy.deepcopy(reqs)
    bad["mission"]["occupants"] = 400
    bad["constraints"]["maximum_footprint_m2"] = 20.0
    with pytest.raises(Exception) as e:
        run(bad, snapshot, evaluator, econ)
    env = to_error_envelope(e.value)
    assert env.error.details["m2_code"] in ("INFEASIBLE_REQUIREMENTS", "NO_TEMPLATE_FITS", "REQUIREMENT_ERROR")


def test_no_valid_design_is_an_error_with_the_reasons(reqs, snapshot, evaluator, econ):
    impossible = copy.deepcopy(reqs)
    impossible["constraints"]["maximum_mass_kg"] = 50.0                                   # M2 rejects every envelope this heavy
    spy = Spy(evaluator)
    with pytest.raises(OptimizationError) as e:
        run(impossible, snapshot, spy, econ, count=2, settings=OptimizationSettings(generation=GenerationOptions(max_attempts=6)))
    assert e.value.code == "NO_CANDIDATES" and e.value.details["attempts"] <= 6 and e.value.details["reasons"] and spy.jobs == []
    env = to_error_envelope(e.value)
    assert env.error.details["m6_code"] == "NO_CANDIDATES" and env.error.details["reasons"]


def test_invalid_requirements_map_to_a_validation_envelope(snapshot, evaluator, econ):
    with pytest.raises(Exception) as e:
        run({"schema_version": "4.0"}, snapshot, evaluator, econ)
    env = to_error_envelope(e.value)
    assert env.error.code.value == "VALIDATION_ERROR" and env.error.details["errors"] and env.error.details["m6_code"] == "VALIDATION_ERROR"


def test_m6_errors_travel_in_the_closed_error_list(reqs, snapshot, evaluator, econ):
    with pytest.raises(OptimizationError) as e:
        run(reqs, snapshot, evaluator, econ, settings=OptimizationSettings(max_runs=1))
    env = to_error_envelope(e.value)
    assert env.error.code.value == "VALIDATION_ERROR" and env.error.details["m6_code"] == "RUN_BUDGET_EXCEEDED" and not env.error.retryable
    assert env.error.details["runs_needed"] == 3 * COUNT and json.loads(env.model_dump_json())["error"]["details"]["max_runs"] == 1


def test_an_incomplete_generation_is_a_warning_not_an_error(reqs, snapshot, evaluator, econ):
    r = run(reqs, snapshot, evaluator, econ, count=3, settings=OptimizationSettings(
        reliability=None, generation=GenerationOptions(max_attempts=8)))                # 8 attempts give exactly 1 valid design of the 3 asked for
    assert r.generation.attempts == 8 and len(r.candidates) == 1 and not r.generation.complete and r.generation.requested == 3
    assert any("only 1 of the 3 requested designs could be generated" in w for w in r.warnings)
    assert r.pick("best_overall").status == "selected" and r.to_dict()["generation"]["complete"] is False


def test_the_public_names_import_from_the_package():
    import optimization
    assert set(optimization.__all__) >= {"optimize", "to_error_envelope", "OptimizationResult", "Evaluator", "EconomicsProvider", "Predictor"}
    assert all(hasattr(optimization, n) for n in optimization.__all__)
