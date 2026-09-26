"""M6 phase 8 tests: perturbation cases and the reliability score."""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from datetime import timedelta
from types import SimpleNamespace

import pytest
from cocoon_contracts.economics import CostScenario
from cocoon_contracts.simulation import SimulationEngineMode as Mode

from design_generator import generate_designs
from optimization import reliability as rel
from optimization.objectives import OBJECTIVES, ObjectiveResult, ObjectiveValue, compute_objectives
from optimization.rc_verification import (
    EvaluationFailedError,
    EvaluatorUnavailableError,
    SimulationJob,
    VerificationSettings,
    run_checked,
    verify_candidates,
)
from optimization.reliability import (
    DEFAULT_SUPPORTED,
    Case,
    EconomicCase,
    PerturbationSpec,
    ReliabilityError,
    assess_reliability,
    build_cases,
    evaluator_support,
    scale_conductivity,
)
from optimization.tests.conftest import T0, load_fixture, user_room
from optimization.tests.standins import StandInEconomics, StandInEvaluator, default_assumptions, make_winter_weather

WX, WX_COLD = "wx_rel", "wx_rel_cold"
ALL4 = frozenset({"infiltration", "weather", "conductivity", "internal_gains"})


# ------------------------------------------------------------------ the cases, by hand
def names(cases):
    return [c.name for c in cases]


def test_default_spec_gives_the_hand_listed_cases_and_lists_what_it_cannot_run():
    cases, nt = build_cases(PerturbationSpec(), ALL4, economics_available=False)
    assert names(cases) == ["infiltration_x0.5", "infiltration_x1.5", "infiltration_x2", "conductivity_x0.9", "conductivity_x1.1",
                            "internal_gains_x0.5", "internal_gains_x1.5"]
    reasons = {n.kind: n.reason for n in nt}
    assert set(reasons) == {"door_usage", "weather", "fuel_price", "discount_rate"}
    assert "does not declare" in reasons["door_usage"] and "cannot invent weather" in reasons["weather"]
    assert "cannot edit M7" in reasons["fuel_price"] and "cannot edit M7" in reasons["discount_rate"]
    assert [c.changes for c in cases[:2]] == [{"infiltration": 0.5}, {"infiltration": 1.5}] and all(c.kind == c.name.split("_x")[0] for c in cases)


def test_an_evaluator_that_declares_nothing_only_gets_the_job_native_perturbations():
    assert evaluator_support(SimpleNamespace()) == DEFAULT_SUPPORTED == {"infiltration", "weather"}
    assert evaluator_support(SimpleNamespace(supported_perturbations=None)) == DEFAULT_SUPPORTED
    assert evaluator_support(SimpleNamespace(supported_perturbations={"door_usage"})) == {"door_usage"}
    cases, nt = build_cases(PerturbationSpec(), DEFAULT_SUPPORTED, economics_available=False)
    assert names(cases) == ["infiltration_x0.5", "infiltration_x1.5", "infiltration_x2"]
    assert {"conductivity", "internal_gains", "door_usage"} <= {n.kind for n in nt}


def test_weather_cases_are_not_run_when_the_evaluator_does_not_declare_weather():
    spec = PerturbationSpec(infiltration_factors=(), conductivity_factors=(), internal_gains_factors=(), door_usage_factors=(),
                            weather_snapshot_ids=("wx_a",))
    cases, nt = build_cases(spec, frozenset({"infiltration"}), economics_available=False)
    assert cases == [] and any(n.kind == "weather" and "does not declare that it honours weather" in n.reason for n in nt)
    assert names(build_cases(spec, frozenset({"weather"}), economics_available=False)[0]) == ["weather_wx_a"]


def test_a_kind_can_be_switched_off_and_says_so():
    cases, nt = build_cases(PerturbationSpec(infiltration_factors=(), conductivity_factors=(1.2,)), ALL4, economics_available=False)
    assert names(cases) == ["conductivity_x1.2", "internal_gains_x0.5", "internal_gains_x1.5"]
    assert any(n.kind == "infiltration" and "switched off" in n.reason for n in nt)


def test_weather_and_economics_cases_come_only_from_what_was_supplied():
    spec = PerturbationSpec(infiltration_factors=(), conductivity_factors=(), internal_gains_factors=(), door_usage_factors=(),
                            weather_snapshot_ids=("wx_a", "wx_b"),
                            economic_cases=(EconomicCase("dear_fuel", "fuel_price", "econ_fuel"),
                                            EconomicCase("high", "cost_scenario", None, CostScenario.HIGH)))
    cases, nt = build_cases(spec, ALL4, economics_available=True)
    assert names(cases) == ["weather_wx_a", "weather_wx_b", "fuel_price_dear_fuel", "cost_scenario_high"]
    assert [n.kind for n in nt if n.kind not in ("infiltration", "conductivity", "internal_gains", "door_usage")] == ["discount_rate"]
    assert cases[2].changes["economics"].assumption_set_id == "econ_fuel"


def test_economic_cases_without_an_economics_provider_are_not_run_and_say_so():
    spec = PerturbationSpec(economic_cases=(EconomicCase("dear_fuel", "fuel_price", "econ_fuel"),))
    cases, nt = build_cases(spec, ALL4, economics_available=False)
    assert not any(c.kind == "fuel_price" for c in cases)
    assert any(n.kind == "fuel_price" and "no economics provider" in n.reason for n in nt)


def test_monte_carlo_trials_are_seeded_bounded_and_only_use_supported_kinds():
    spec = PerturbationSpec(monte_carlo_trials=40, seed=7, weather_snapshot_ids=("wx_a",))
    a, _ = build_cases(spec, ALL4, economics_available=False)
    b, _ = build_cases(spec, ALL4, economics_available=False)
    other, _ = build_cases(replace(spec, seed=8), ALL4, economics_available=False)
    mc = [c for c in a if c.kind == "combined"]
    assert [c.name for c in mc] == [f"mc_{i:03d}" for i in range(1, 41)] and a == b and mc != [c for c in other if c.kind == "combined"]
    for c in mc:
        assert set(c.changes) <= {"infiltration", "conductivity", "internal_gains", "weather"}          # door_usage is not supported here
        assert 0.5 <= c.changes["infiltration"] <= 2.0 and 0.9 <= c.changes["conductivity"] <= 1.1
        assert 0.5 <= c.changes["internal_gains"] <= 1.5 and c.changes.get("weather", "wx_a") == "wx_a"
    assert any("weather" in c.changes for c in mc) and any("weather" not in c.changes for c in mc)      # the base weather is one of the choices


def test_a_range_that_only_lies_on_one_side_of_1_still_includes_the_base():
    spec = PerturbationSpec(infiltration_factors=(1.5,), conductivity_factors=(), internal_gains_factors=(), monte_carlo_trials=60, seed=1)
    mc = [c for c in build_cases(spec, ALL4, economics_available=False)[0] if c.kind == "combined"]
    assert all(1.0 <= c.changes["infiltration"] <= 1.5 for c in mc) and any(c.changes["infiltration"] < 1.25 for c in mc)


@pytest.mark.parametrize("kw", [dict(infiltration_factors=(0.0,)), dict(conductivity_factors=(-1.0,)), dict(internal_gains_factors=(float("nan"),)),
                                dict(door_usage_factors=(float("inf"),)), dict(weather_snapshot_ids=("standard",)), dict(monte_carlo_trials=-1),
                                dict(top_k=0), dict(max_runs=0),
                                dict(economic_cases=(EconomicCase("a", "cost_scenario", None, CostScenario.LOW),) * 2)])
def test_bad_specs_are_refused(kw):
    with pytest.raises(ReliabilityError) as e:
        PerturbationSpec(**kw)
    assert e.value.code == "INVALID_SPEC"


@pytest.mark.parametrize("args", [("x", "nonsense", "s"), ("", "fuel_price", "s"), ("x", "fuel_price", None), ("x", "discount_rate", None),
                                  ("x", "cost_scenario", None)])
def test_bad_economic_cases_are_refused(args):
    with pytest.raises(ReliabilityError):
        EconomicCase(*args)


# ------------------------------------------------------------------ conductivity, by hand
def test_scaling_conductivity_by_hand():
    b = user_room()
    aid = next(iter(b.assemblies))
    asm = b.assemblies[aid].model_copy(update={"u_value_w_m2k": 0.5, "r_inside_film_m2k_w": 0.13, "r_outside_film_m2k_w": 0.04})
    b2 = b.model_copy(update={"assemblies": {**b.assemblies, aid: asm}})
    # R_total = 2.0, R_films = 0.17, R_layers = 1.83 -> conductivity x1.1 divides R_layers by 1.1
    out = scale_conductivity(b2, 1.1)
    assert out.assemblies[aid].u_value_w_m2k == pytest.approx(1.0 / (0.17 + 1.83 / 1.1)) == pytest.approx(0.54536, abs=1e-5)
    assert scale_conductivity(b2, 1.0).assemblies[aid].u_value_w_m2k == pytest.approx(0.5)
    assert scale_conductivity(b2, 2.0).assemblies[aid].u_value_w_m2k == pytest.approx(1.0 / (0.17 + 1.83 / 2.0))
    assert b2.assemblies[aid].u_value_w_m2k == 0.5                                                   # the original is untouched
    assert out.revision_id == b2.revision_id and out.openings == b2.openings                         # openings keep their own U-values


def test_a_missing_or_impossible_u_value_is_not_applicable_instead_of_guessed():
    b = user_room()
    aid = next(iter(b.assemblies))
    no_u = b.model_copy(update={"assemblies": {**b.assemblies, aid: b.assemblies[aid].model_copy(update={"u_value_w_m2k": None})}})
    with pytest.raises(rel.NotApplicable) as e:
        scale_conductivity(no_u, 1.1)
    assert e.value.code == "PERTURBATION_NOT_APPLICABLE"
    films = b.assemblies[aid].model_copy(update={"u_value_w_m2k": 5.0, "r_inside_film_m2k_w": 0.13, "r_outside_film_m2k_w": 0.13})     # 1/5 = 0.2 < 0.26
    with pytest.raises(rel.NotApplicable):
        scale_conductivity(b.model_copy(update={"assemblies": {**b.assemblies, aid: films}}), 1.1)


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def world(snapshot):
    weather = {WX: make_winter_weather(WX, days=14, mean_c=-35.0), WX_COLD: make_winter_weather(WX_COLD, days=14, mean_c=-45.0)}
    evaluator = StandInEvaluator(snapshot, weather)
    cands = generate_designs(load_fixture("requirements_ladakh_30p.json"), load_fixture("material_snapshot_standard.json"),
                             seed=42, count=4, created_at=T0).candidates
    s = VerificationSettings(weather_snapshot_id=WX, window_start=T0, window_end=T0 + timedelta(days=8), setpoint_c=15.0,
                             timestep_seconds=3600, heater_fuel="kerosene")
    return SimpleNamespace(evaluator=evaluator, cands=cands, settings=s, verified=verify_candidates(cands, evaluator, s),
                           obj=s.to_objective_settings(12.0), snapshot=snapshot)


class Spy:
    """Wraps an evaluator, records every job, can be told to fail, and remembers which case is running."""

    def __init__(self, inner, fail=None, unavailable=False):
        self.inner, self.jobs, self.case, self.fail, self.unavailable = inner, [], "base", fail, unavailable
        self.engine_name, self.engine_version = inner.engine_name, inner.engine_version
        if getattr(inner, "supported_perturbations", None) is not None:
            self.supported_perturbations = inner.supported_perturbations

    def simulate(self, job):
        if self.unavailable:
            raise EvaluatorUnavailableError("gone")
        self.jobs.append(job)
        self.case = (job.extras.get("perturbation") or {}).get("case", "base")
        if self.fail and self.fail(job):
            raise EvaluationFailedError("boom", "RUN_FAILED")
        return self.inner.simulate(job)


def assess(world, spec, *, evaluator=None, **kw):
    return assess_reliability(world.cands, world.verified, evaluator or world.evaluator, world.settings, world.obj, spec, **kw)


# ------------------------------------------------------------------ the tally, against a hand-made table
def hand_table(world, monkeypatch, spy):
    """Objectives from a table instead of physics, so the reliability scores can be computed by hand.

    designs A B C: heating energy 100/150/200 kWh, peak 5/6/7 kW, no unmet hours; but A fails the limit (50 h) when infiltration x2.
    """
    label = dict(zip((c.building.design_id for c in world.cands[:3]), "ABC"))
    energy, peak = {"A": 100.0, "B": 150.0, "C": 200.0}, {"A": 5.0, "B": 6.0, "C": 7.0}

    def fake(ev, settings):
        d = ev.building.design_id
        unmet = 50.0 if (spy.case == "infiltration_x2" and label[d] == "A") else 0.0
        v = {"unmet_hours": unmet, "heating_energy_kwh": energy[label[d]], "peak_heating_kw": peak[label[d]]}
        vals = {n: ObjectiveValue(n, v.get(n), None if n in v else "missing") for n in OBJECTIVES}
        return ObjectiveResult(d, ev.building.revision_id, vals, True, (), unmet <= 12.0, True)

    monkeypatch.setattr(rel, "compute_objectives", fake)
    return label


def hand_world(world):
    return SimpleNamespace(**{**world.__dict__, "cands": world.cands[:3], "verified": world.verified[:3]})


HAND_SPEC = dict(infiltration_factors=(0.5, 2.0), conductivity_factors=(), internal_gains_factors=(), door_usage_factors=())


def test_reliability_is_the_share_of_cases_a_design_stays_in_the_top_k_by_hand(world, monkeypatch):
    w = hand_world(world)
    spy = Spy(world.evaluator)
    label = hand_table(w, monkeypatch, spy)
    ids = {v: k for k, v in label.items()}
    r = assess(w, PerturbationSpec(top_k=1, **HAND_SPEC), evaluator=spy)
    # x0.5: A wins. x2: A is over the limit and out, so B (150 kWh) beats C.
    assert r.base_winner == ids["A"] and [c.winner for c in r.cases] == [ids["A"], ids["B"]]
    d = r.designs
    assert (d[ids["A"]].reliability, d[ids["B"]].reliability, d[ids["C"]].reliability) == (0.5, 0.5, 0.0)
    assert (d[ids["A"]].best_rate, d[ids["B"]].best_rate, d[ids["C"]].best_rate) == (0.5, 0.5, 0.0)
    r2 = assess(w, PerturbationSpec(top_k=2, **HAND_SPEC), evaluator=spy)
    assert [c.top for c in r2.cases] == [(ids["A"], ids["B"]), (ids["B"], ids["C"])]
    assert (r2.designs[ids["A"]].reliability, r2.designs[ids["B"]].reliability, r2.designs[ids["C"]].reliability) == (0.5, 1.0, 0.5)


def test_the_other_rates_worst_unmet_and_sensitivity_by_hand(world, monkeypatch):
    w = hand_world(world)
    spy = Spy(world.evaluator)
    label = hand_table(w, monkeypatch, spy)
    ids = {v: k for k, v in label.items()}
    r = assess(w, PerturbationSpec(top_k=1, **HAND_SPEC), evaluator=spy)
    a = r.designs[ids["A"]]
    assert a.comfort_rate == 0.5 and a.worst_unmet_hours == 50.0 and a.cases == 2 and a.failed_cases == 0
    assert a.front_rate == 1.0                                       # still on the Pareto front (best energy) although it fails the limit
    assert r.designs[ids["B"]].comfort_rate == 1.0 and r.designs[ids["B"]].worst_unmet_hours == 0.0
    assert r.sensitivity == {"infiltration": {"cases": 2, "winner_changed_in": 1, "worst_unmet_hours": 50.0}}
    assert [set(c.eligible) for c in r.cases] == [set(ids.values()), {ids["B"], ids["C"]}]              # A is out in the x2 case
    assert all(list(c.eligible) == sorted(c.eligible) for c in r.cases)


def test_front_rate_and_winner_changes_by_hand_over_three_cases(world, monkeypatch):
    w = hand_world(world)
    spy = Spy(world.evaluator)
    label = hand_table(w, monkeypatch, spy)
    ids = {v: k for k, v in label.items()}
    spec = PerturbationSpec(top_k=1, infiltration_factors=(0.5, 0.8, 2.0), conductivity_factors=(), internal_gains_factors=(),
                            door_usage_factors=())
    r = assess(w, spec, evaluator=spy)
    assert [c.winner for c in r.cases] == [ids["A"], ids["A"], ids["B"]]
    # front: x0.5 {A}, x0.8 {A}, x2 {A, B} (A is over the limit but still best on energy; C is beaten by B every time)
    assert r.designs[ids["A"]].front_rate == 1.0 and r.designs[ids["B"]].front_rate == pytest.approx(1 / 3)
    assert r.designs[ids["C"]].front_rate == 0.0
    assert r.sensitivity["infiltration"] == {"cases": 3, "winner_changed_in": 1, "worst_unmet_hours": 50.0}       # 1 of 3, not 2 of 3


def test_a_design_that_breaks_the_limit_never_counts_as_top_even_if_it_would_win(world, monkeypatch):
    w = hand_world(world)
    spy = Spy(world.evaluator)
    label = hand_table(w, monkeypatch, spy)
    ids = {v: k for k, v in label.items()}
    r = assess(w, PerturbationSpec(top_k=3, **HAND_SPEC), evaluator=spy)
    assert ids["A"] not in r.cases[1].top and r.designs[ids["A"]].reliability == 0.5


def test_when_top_k_covers_every_design_the_result_says_it_only_measures_eligibility(world, monkeypatch):
    w = hand_world(world)
    spy = Spy(world.evaluator)
    hand_table(w, monkeypatch, spy)
    assert assess(w, PerturbationSpec(top_k=3, **HAND_SPEC), evaluator=spy).informative is False
    r = assess(w, PerturbationSpec(top_k=3, **HAND_SPEC), evaluator=spy)
    assert any("only measures whether" in x for x in r.warnings)
    assert assess(w, PerturbationSpec(top_k=2, **HAND_SPEC), evaluator=spy).informative is True


def test_a_failed_run_counts_as_not_best_and_is_recorded_not_retried(world, monkeypatch):
    w = hand_world(world)
    victim = w.cands[2].building.design_id                                       # C
    spy = Spy(world.evaluator, fail=lambda j: j.building.design_id == victim and j.extras["perturbation"]["case"] == "infiltration_x0.5")
    hand_table(w, monkeypatch, spy)
    r = assess(w, PerturbationSpec(top_k=3, **HAND_SPEC), evaluator=spy)
    c = r.cases[0]
    assert c.status == "evaluated" and set(c.failures) == {victim} and "RUN_FAILED" in c.failures[victim]
    assert victim not in c.top and r.designs[victim].failed_cases == 1
    calls = [j for j in spy.jobs if j.building.design_id == victim and j.extras["perturbation"]["case"] == "infiltration_x0.5"]
    assert len(calls) == 1                                                       # tried once (the ideal-load run), never retried
    assert r.runs == sum(1 for _ in spy.jobs) - 1                                # the failing run is not counted as a completed run


def test_a_case_that_fails_for_every_design_is_dropped(world):
    spy = Spy(world.evaluator, fail=lambda j: j.extras.get("perturbation", {}).get("case") == "infiltration_x2")
    r = assess(world, PerturbationSpec(top_k=2, **HAND_SPEC), evaluator=spy)
    assert [c.status for c in r.cases] == ["evaluated", "failed"]
    assert all(v.cases == 1 for v in r.designs.values())                          # scores are over the evaluated case only
    assert any("infiltration_x2" in w and "dropped" in w for w in r.warnings)


def test_an_unavailable_evaluator_stops_the_analysis(world):
    with pytest.raises(EvaluatorUnavailableError):
        assess(world, PerturbationSpec(**HAND_SPEC), evaluator=Spy(world.evaluator, unavailable=True))


def test_no_case_means_no_score_and_no_invented_number(world):
    r = assess(world, PerturbationSpec(infiltration_factors=(), conductivity_factors=(), internal_gains_factors=(), door_usage_factors=()))
    assert r.cases == () and r.reliability_by_design() == {} and all(v.reliability is None for v in r.designs.values())
    assert any("no perturbation could be run" in w for w in r.warnings)
    assert r.informative is False


def test_only_verified_designs_take_part(world):
    failed = replace(world.verified[0], status="failed", evaluation=None, heater=None)
    r = assess_reliability(world.cands, [failed] + list(world.verified[1:]), world.evaluator, world.settings, world.obj,
                           PerturbationSpec(**HAND_SPEC))
    assert failed.design_id not in r.designs and len(r.designs) == 3
    assert any("were not verified" in w and failed.design_id in w for w in r.warnings)
    with pytest.raises(ReliabilityError) as e:
        assess_reliability(world.cands, [failed], world.evaluator, world.settings, world.obj, PerturbationSpec(**HAND_SPEC))
    assert e.value.code == "NO_FINALISTS"


def test_the_run_budget_is_checked_before_any_run(world):
    spy = Spy(world.evaluator)
    with pytest.raises(ReliabilityError) as e:
        assess(world, PerturbationSpec(max_runs=10, **HAND_SPEC), evaluator=spy)
    assert e.value.code == "RUN_BUDGET_EXCEEDED" and e.value.details["runs_needed"] == 2 * 4 * 2 and spy.jobs == []
    assess(world, PerturbationSpec(max_runs=16, **HAND_SPEC), evaluator=spy)                    # exactly the need is fine
    assert len(spy.jobs) == 16


# ------------------------------------------------------------------ what each perturbed run really is
def test_perturbed_jobs_carry_the_change_keep_the_sized_heater_and_have_their_own_ids(world):
    spy = Spy(world.evaluator)
    assess(world, PerturbationSpec(infiltration_factors=(2.0,), conductivity_factors=(), internal_gains_factors=(), door_usage_factors=()),
           evaluator=spy)
    for cand, ver in zip(world.cands, world.verified):
        mine = [j for j in spy.jobs if j.building.design_id == cand.building.design_id]
        assert [j.mode for j in mine] == [Mode.IDEAL_LOAD_CONDITIONED, Mode.CAPACITY_LIMITED_CONDITIONED]
        base_ach = cand.extras["air_changes_per_hour"]
        assert all(j.air_changes_per_hour == pytest.approx(2.0 * base_ach) for j in mine)
        assert [j.heater_capacity_kw for j in mine] == [None, ver.heater.capacity_kw]           # the base run's heater, not a resized one
        assert all(j.extras["perturbation"] == {"case": "infiltration_x2", "infiltration": 2.0} for j in mine)
        assert all(j.weather_snapshot_id == WX and j.setpoint_c == 15.0 and j.initial_temperature_c == 15.0 for j in mine)
    base_ids = {r.request_id for v in world.verified for r in v.runs}
    assert not base_ids & {j.request_id() for j in spy.jobs} and len({j.request_id() for j in spy.jobs}) == len(spy.jobs)


def test_a_job_without_a_perturbation_keeps_its_original_id(world):
    c = world.cands[0]
    job = SimulationJob(building=c.building, weather_snapshot_id=WX, mode=Mode.FREE_FLOATING, window_start=T0, window_end=T0 + timedelta(days=1),
                        setpoint_c=15.0, extras={"anything": 1})
    key = json.dumps([c.building.revision_id, WX, "free_floating", T0.isoformat(), (T0 + timedelta(days=1)).isoformat(), 15.0, 900, -25.0, -10.0, None, None])
    assert job.request_id() == "sim_" + hashlib.sha1(key.encode()).hexdigest()[:12]
    assert replace(job, extras={"perturbation": {"case": "x"}}).request_id() != job.request_id()
    assert replace(job, extras={"perturbation": {"case": "x", "conductivity": 1.1}}).request_id() != \
        replace(job, extras={"perturbation": {"case": "x", "conductivity": 1.2}}).request_id()


def test_unsupported_kinds_are_listed_and_never_run(world):
    class Plain(StandInEvaluator):
        supported_perturbations = None
    plain = Spy(Plain(world.snapshot, {WX: make_winter_weather(WX, days=14, mean_c=-35.0)}))
    r = assess(world, PerturbationSpec(), evaluator=plain)
    assert {c.case.kind for c in r.cases} == {"infiltration"}
    assert {n.kind for n in r.not_tested} >= {"conductivity", "internal_gains", "door_usage", "weather", "fuel_price", "discount_rate"}
    assert not any("conductivity" in j.extras.get("perturbation", {}) or "internal_gains" in j.extras.get("perturbation", {}) for j in plain.jobs)


def test_door_usage_is_never_faked_even_when_asked(world):
    r = assess(world, PerturbationSpec(door_usage_factors=(0.5, 2.0), **{k: v for k, v in HAND_SPEC.items() if k != "door_usage_factors"}))
    assert "door_usage" in {n.kind for n in r.not_tested} and not any(c.case.kind == "door_usage" for c in r.cases)


def test_the_stand_in_really_responds_to_each_supported_perturbation(world):
    c, v = world.cands[0], world.verified[0]

    def energy(case):
        job = rel._job(c, world.settings, case, Mode.IDEAL_LOAD_CONDITIONED, None)
        return run_checked(world.evaluator, job).summary.heating_energy_kwh
    base = v.evaluation.ideal_load.summary.heating_energy_kwh
    assert energy(Case("a", "infiltration", {"infiltration": 2.0})) > base                    # more leakage, more heating
    assert energy(Case("a", "infiltration", {"infiltration": 0.5})) < base
    assert energy(Case("c", "conductivity", {"conductivity": 1.5})) > base                    # worse insulation
    assert energy(Case("c", "conductivity", {"conductivity": 0.7})) < base
    assert energy(Case("g", "internal_gains", {"internal_gains": 2.0})) < base                # more free heat
    assert energy(Case("w", "weather", {"weather": WX_COLD})) > base                          # colder winter
    assert energy(Case("n", "infiltration", {"infiltration": 1.0})) == pytest.approx(base)    # x1 changes nothing


def test_scaling_infiltration_needs_the_designs_own_ach(world):
    stub = SimpleNamespace(building=world.cands[0].building, extras={}, quantities=None)
    with pytest.raises(rel.NotApplicable):
        rel._job(stub, world.settings, Case("i", "infiltration", {"infiltration": 2.0}), Mode.IDEAL_LOAD_CONDITIONED, None)
    r = assess_reliability([stub], [replace(world.verified[0])], world.evaluator, world.settings, world.obj, PerturbationSpec(**HAND_SPEC))
    assert all(c.status == "failed" for c in r.cases) and all("PERTURBATION_NOT_APPLICABLE" in c.failures[world.verified[0].design_id] for c in r.cases)


# ------------------------------------------------------------------ economics cases
class EconSpy(StandInEconomics):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.calls = []

    def analyse(self, building, quantities, simulation, assumption_set_id, scenario):
        self.calls.append((assumption_set_id, scenario))
        return super().analyse(building, quantities, simulation, assumption_set_id, scenario)


def test_economic_cases_use_the_supplied_assumption_set_and_scenario(world):
    sets = {"econ_standin_expected_v0": default_assumptions(), "econ_fuel_dear": default_assumptions("econ_fuel_dear", fuel_price_inr_per_litre=190.0),
            "econ_disc_high": default_assumptions("econ_disc_high", discount_rate_pct=14.0)}
    econ = EconSpy(world.snapshot, sets)
    spec = PerturbationSpec(infiltration_factors=(), conductivity_factors=(), internal_gains_factors=(), door_usage_factors=(),
                            economic_cases=(EconomicCase("dear", "fuel_price", "econ_fuel_dear"), EconomicCase("high", "discount_rate", "econ_disc_high"),
                                            EconomicCase("high_cost", "cost_scenario", None, CostScenario.HIGH)))
    r = assess(world, spec, economics=econ, assumption_set_id="econ_standin_expected_v0")
    assert [c.case.name for c in r.cases] == ["fuel_price_dear", "discount_rate_high", "cost_scenario_high_cost"]
    n = len(world.cands)
    base_calls, rest = econ.calls[:n], econ.calls[n:]                                # the base population is priced first
    assert set(base_calls) == {("econ_standin_expected_v0", CostScenario.EXPECTED)}
    assert rest == [("econ_fuel_dear", CostScenario.EXPECTED)] * n + [("econ_disc_high", CostScenario.EXPECTED)] * n \
        + [("econ_standin_expected_v0", CostScenario.HIGH)] * n
    assert not {"fuel_price", "discount_rate"} & {x.kind for x in r.not_tested}
    assert all(c.status == "evaluated" for c in r.cases)


def test_an_unknown_assumption_set_is_a_recorded_failure(world):
    econ = StandInEconomics(world.snapshot, {"econ_standin_expected_v0": default_assumptions()})
    spec = PerturbationSpec(infiltration_factors=(), conductivity_factors=(), internal_gains_factors=(), door_usage_factors=(),
                            economic_cases=(EconomicCase("ghost", "fuel_price", "econ_missing"),))
    r = assess(world, spec, economics=econ, assumption_set_id="econ_standin_expected_v0")
    assert r.cases[0].status == "failed" and all("UNKNOWN_ASSUMPTION_SET" in f for f in r.cases[0].failures.values())


# ------------------------------------------------------------------ the real pipeline, end to end
@pytest.fixture(scope="module")
def full(world):
    return assess(world, PerturbationSpec(monte_carlo_trials=6, seed=3, weather_snapshot_ids=(WX_COLD,), top_k=2))


def test_a_full_run_scores_every_design_between_0_and_1(world, full):
    assert set(full.designs) == {c.building.design_id for c in world.cands}
    assert all(0.0 <= r.reliability <= 1.0 for r in full.designs.values())
    assert all(r.cases == len(full.cases) == 3 + 2 + 2 + 1 + 6 for r in full.designs.values())
    assert full.runs == 2 * len(world.cands) * len(full.cases) and full.development_only and full.informative
    assert {n.kind for n in full.not_tested} == {"door_usage", "fuel_price", "discount_rate"}
    assert set(full.sensitivity) == {"infiltration", "conductivity", "internal_gains", "weather"}
    assert full.base_winner in full.designs


def test_the_base_winner_is_what_ranking_recommends_for_the_same_designs(world, full):
    from optimization.pareto import pareto_front
    from optimization.ranking import rank_designs
    base = [compute_objectives(v.evaluation, world.obj) for v in world.verified]
    pick = rank_designs(base, pareto_front(base)).picks["best_overall"]
    assert pick.status == "selected" and full.base_winner == pick.design_id
    assert rel._rank(base, rel.RankingSettings(), 1)[0] == pick.design_id


def test_peeling_gives_each_next_recommendation_as_if_the_earlier_ones_were_unavailable(world):
    from optimization.pareto import pareto_front
    from optimization.ranking import rank_designs
    base = [compute_objectives(v.evaluation, world.obj) for v in world.verified]
    winner, top, eligible, _ = rel._rank(base, rel.RankingSettings(), 3)
    assert top[0] == winner and len(set(top)) == len(top) == 3
    rest = [r for r in base if r.design_id != top[0]]
    assert top[1] == rank_designs(rest, pareto_front(rest)).picks["best_overall"].design_id
    assert set(top) <= set(eligible)
    assert rel._rank(base, rel.RankingSettings(), 99)[1][:3] == top and len(rel._rank(base, rel.RankingSettings(), 99)[1]) <= len(base)


def test_a_full_run_is_deterministic(world, full):
    again = assess(world, PerturbationSpec(monte_carlo_trials=6, seed=3, weather_snapshot_ids=(WX_COLD,), top_k=2))
    assert again.to_dict() == full.to_dict()


def test_the_result_is_json(full):
    d = json.loads(json.dumps(full.to_dict()))
    assert d["top_k"] == 2 and len(d["cases"]) == 14 and d["cases"][0]["changes"] == {"infiltration": 0.5}


def test_apply_fills_the_reliability_objective(world, full):
    evals = {v.design_id: v.evaluation for v in world.verified}
    out = full.apply(evals)
    for k, e in out.items():
        assert e.reliability == full.designs[k].reliability and evals[k].reliability is None                 # the input is not modified
        o = compute_objectives(e, world.obj)
        assert o.value("reliability") == full.designs[k].reliability
    partial = replace(full, designs={k: v for k, v in list(full.designs.items())[:1]}).apply(evals)
    assert sum(e.reliability is not None for e in partial.values()) == 1
    stored = {k: replace(e, reliability=0.42) for k, e in evals.items()}
    kept = replace(full, designs={k: v for k, v in list(full.designs.items())[:1]}).apply(stored)
    scored = next(iter(full.designs))
    assert kept[scored].reliability == full.designs[scored].reliability
    assert all(e.reliability == 0.42 for k, e in kept.items() if k != scored)                     # unscored designs keep what they had


def test_reliability_never_feeds_on_itself(world):
    r = assess(world, PerturbationSpec(top_k=2, **HAND_SPEC))
    assert all(c.status == "evaluated" for c in r.cases)
    again = assess_reliability(world.cands, [replace(v, evaluation=replace(v.evaluation, reliability=0.99)) for v in world.verified],
                               world.evaluator, world.settings, world.obj, PerturbationSpec(top_k=2, **HAND_SPEC))
    assert again.to_dict() == r.to_dict()                                                                    # a stored reliability changes nothing


def test_perturbing_leaves_the_candidates_untouched(world):
    before = [c.building.model_dump_json() for c in world.cands]
    assess(world, PerturbationSpec(monte_carlo_trials=3, seed=1))
    assert [c.building.model_dump_json() for c in world.cands] == before
