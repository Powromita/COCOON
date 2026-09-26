"""M6 phase 4 tests: the Pareto set, against hand-made examples and a brute-force reference."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import timedelta

import numpy as np
import pytest
from cocoon_contracts.simulation import SimulationEngineMode as Mode

from optimization import objectives as ob
from optimization.constraints import ConstraintFailure, ConstraintLimits, ConstraintReport, apply_post_simulation, check_pre_simulation
from optimization.objectives import (
    OBJECTIVES,
    CandidateEvaluation,
    ObjectiveResult,
    ObjectiveSettings,
    ObjectiveValue,
    active_objectives,
    compute_objectives,
)
from optimization.pareto import ParetoError, ParetoResult, ParetoSettings, pareto_front
from optimization.rc_verification import SimulationJob, run_checked
from optimization.tests.conftest import T0

REQUIRED_DEFAULTS = dict(unmet_hours=0.0, heating_energy_kwh=1.0, peak_heating_kw=1.0)


def pt(design_id: str, **values) -> ObjectiveResult:
    """An ObjectiveResult with the required objectives filled in (overridable) and any others given."""
    v = {**REQUIRED_DEFAULTS, **values}
    vals = {n: ObjectiveValue(n, v.get(n), None if n in v else "missing") for n in OBJECTIVES}
    return ObjectiveResult(design_id, "rev_" + design_id, vals, True, (), None, False)


def points(spec: dict[str, tuple], names: tuple[str, ...]) -> list[ObjectiveResult]:
    return [pt(k, **dict(zip(names, vals))) for k, vals in spec.items()]


# ------------------------------------------------------------------ 2D by hand (both minimised)
HEAT_CAPEX = ("heating_energy_kwh", "capex_inr")
TWO_D = {"A": (1, 9), "B": (2, 7), "C": (3, 8), "D": (4, 3), "E": (5, 5), "F": (2, 7), "G": (6, 10)}


def test_two_objectives_by_hand():
    r = pareto_front(points(TWO_D, HEAT_CAPEX), HEAT_CAPEX)
    assert r.objectives == HEAT_CAPEX
    assert r.front == ("A", "B", "D", "F")                                    # input order
    assert dict(r.dominated_by) == {"C": ("B", "F"), "E": ("D",), "G": ("A", "B", "C", "D", "E", "F")}
    assert r.ties == (("B", "F"),)                                            # B and F are identical: neither beats the other
    assert dict(r.rank) == {"A": 1, "B": 1, "D": 1, "F": 1, "C": 2, "E": 2, "G": 3}
    assert r.excluded == {} and r.flagged == ()


def test_a_single_objective_gives_the_minimum_and_its_ties():
    r = pareto_front(points({"a": (3,), "b": (1,), "c": (1,), "d": (2,)}, ("heating_energy_kwh",)), ["heating_energy_kwh"])
    assert r.front == ("b", "c") and r.ties == (("b", "c"),) and dict(r.rank) == {"b": 1, "c": 1, "d": 2, "a": 3}


# ------------------------------------------------------------------ direction: a "max" objective
CAPEX_REL = ("capex_inr", "reliability")


def test_a_maximised_objective_is_handled_by_direction():
    spec = {"P": (10, 0.90), "Q": (12, 0.95), "R": (8, 0.70), "S": (12, 0.80), "T": (15, 0.99)}
    r = pareto_front(points(spec, CAPEX_REL), CAPEX_REL)
    assert r.front == ("P", "Q", "R", "T")
    assert dict(r.dominated_by) == {"S": ("P", "Q")}                          # cheaper AND more reliable / same price, more reliable


def test_flipping_every_direction_gives_the_mirror_answer():
    """Negating a min objective's values and treating them as max cannot change the front."""
    mins = points(TWO_D, HEAT_CAPEX)
    flipped = [pt(k, heating_energy_kwh=v[0], reliability=-v[1]) for k, v in TWO_D.items()]      # capex (min) -> -reliability (max)
    assert pareto_front(mins, HEAT_CAPEX).front == pareto_front(flipped, ("heating_energy_kwh", "reliability")).front


# ------------------------------------------------------------------ 4D by hand
FOUR = ("heating_energy_kwh", "peak_heating_kw", "capex_inr", "mass_kg")


def test_four_objectives_by_hand():
    spec = {"a": (1, 5, 5, 5), "b": (5, 1, 5, 5), "c": (5, 5, 1, 5), "d": (5, 5, 5, 1), "e": (6, 6, 6, 6),
            "f": (3, 3, 3, 3), "g": (3, 3, 3, 4)}
    r = pareto_front(points(spec, FOUR), FOUR)
    assert r.front == ("a", "b", "c", "d", "f")                               # each of a-d is best on one axis; f is balanced
    assert dict(r.dominated_by) == {"e": ("a", "b", "c", "d", "f", "g"), "g": ("f",)}
    assert dict(r.rank) == {"a": 1, "b": 1, "c": 1, "d": 1, "f": 1, "g": 2, "e": 3}


def test_one_design_that_is_best_everywhere_is_the_whole_front():
    spec = {"a": (1, 5, 5, 5), "b": (5, 1, 5, 5), "h": (1, 1, 1, 1)}
    r = pareto_front(points(spec, FOUR), FOUR)
    assert r.front == ("h",) and dict(r.dominated_by) == {"a": ("h",), "b": ("h",)}


# ------------------------------------------------------------------ ties, single, empty
def test_identical_designs_all_stay_on_the_front():
    r = pareto_front(points({"x": (5, 5), "y": (5, 5), "z": (5, 5)}, HEAT_CAPEX), HEAT_CAPEX)
    assert r.front == ("x", "y", "z") and r.ties == (("x", "y", "z"),) and r.dominated_by == {}
    assert set(r.rank.values()) == {1}


def test_a_single_design_is_the_front():
    r = pareto_front([pt("only", heating_energy_kwh=7.0)])
    assert r.front == ("only",) and dict(r.rank) == {"only": 1} and r.ties == () and r.excluded == {}


def test_an_empty_population_gives_an_empty_result():
    r = pareto_front([])
    assert r.front == () and r.objectives == () and r.rank == {} and r.excluded == {}


# ------------------------------------------------------------------ tolerance
def test_values_within_the_tolerance_count_as_equal():
    a = pt("a", heating_energy_kwh=100.0, capex_inr=5.0)
    b = pt("b", heating_energy_kwh=100.0004, capex_inr=4.0)                   # 0.0004 kWh worse, but cheaper
    assert pareto_front([a, b], HEAT_CAPEX).front == ("a", "b")               # exact: a is better in energy, b in capex
    tol = ParetoSettings(absolute_tolerance={"heating_energy_kwh": 0.01})
    r = pareto_front([a, b], HEAT_CAPEX, tol)
    assert r.front == ("b",) and dict(r.dominated_by) == {"a": ("b",)}        # energy is a tie, so cheaper wins
    assert r.steps["heating_energy_kwh"] == 0.01


def test_the_relative_tolerance_scales_with_the_range():
    pop = [pt("a", heating_energy_kwh=0.0, capex_inr=9.0), pt("b", heating_energy_kwh=1000.0, capex_inr=1.0),
           pt("c", heating_energy_kwh=500.0, capex_inr=1.0 + 1e-7)]
    exact = pareto_front(pop, HEAT_CAPEX, ParetoSettings(relative_tolerance=0.0))
    assert exact.front == ("a", "b", "c")                                      # b is 1e-7 cheaper than c, c is 500 kWh better: neither wins
    r = pareto_front(pop, HEAT_CAPEX, ParetoSettings(relative_tolerance=1e-6))    # capex range 8 -> step 8e-6: 1.0 and 1.0000001 tie
    assert r.steps["capex_inr"] == pytest.approx(8e-6)
    assert r.front == ("a", "c") and dict(r.dominated_by) == {"b": ("c",)}     # with the tie, c is better on energy and equal on cost


def test_a_tolerance_can_never_empty_the_front():
    """Epsilon-dominance can form cycles; snapping to a grid cannot."""
    rng = np.random.default_rng(3)
    pop = [pt(f"d{i}", heating_energy_kwh=float(rng.uniform(0, 1)), capex_inr=float(rng.uniform(0, 1))) for i in range(60)]
    for tol in (0.0, 0.01, 0.1, 0.5, 5.0):
        r = pareto_front(pop, HEAT_CAPEX, ParetoSettings(absolute_tolerance={"heating_energy_kwh": tol, "capex_inr": tol}))
        assert len(r.front) >= 1


@pytest.mark.parametrize("kw", [{"relative_tolerance": -1.0}, {"absolute_tolerance": {"capex_inr": -0.1}}])
def test_negative_tolerances_are_rejected(kw):
    with pytest.raises(ParetoError) as e:
        ParetoSettings(**kw)
    assert e.value.code == "INVALID_SETTINGS"


def test_tolerance_for_an_unknown_objective_is_rejected():
    with pytest.raises(ParetoError) as e:
        ParetoSettings(absolute_tolerance={"nonsense": 1.0})
    assert e.value.code == "UNKNOWN_OBJECTIVE"


# ------------------------------------------------------------------ exclusions
def _not_comparable(design_id):
    vals = {n: ObjectiveValue(n, None, "missing") for n in OBJECTIVES}
    return ObjectiveResult(design_id, "rev_" + design_id, vals, False, ("unmet_hours: needs the capacity-limited run",), None, False)


def test_designs_that_cannot_be_compared_are_excluded_with_their_reason():
    pop = points({"a": (1, 2), "b": (2, 1)}, HEAT_CAPEX) + [_not_comparable("bad")]
    r = pareto_front(pop, HEAT_CAPEX)
    assert r.front == ("a", "b") and "not comparable" in r.excluded["bad"] and "capacity-limited" in r.excluded["bad"]
    assert "bad" not in r.rank and "bad" not in r.dominated_by


def test_a_named_objective_a_design_lacks_excludes_that_design():
    pop = [pt("a", heating_energy_kwh=1.0, capex_inr=5.0), pt("b", heating_energy_kwh=2.0, capex_inr=4.0), pt("nocost", heating_energy_kwh=0.5)]
    r = pareto_front(pop, HEAT_CAPEX)
    assert r.front == ("a", "b") and r.excluded == {"nocost": "no value for capex_inr"}


def test_by_default_a_gap_drops_the_objective_for_everyone_instead():
    pop = [pt("a", heating_energy_kwh=1.0, capex_inr=5.0), pt("b", heating_energy_kwh=2.0, capex_inr=4.0), pt("nocost", heating_energy_kwh=0.5)]
    r = pareto_front(pop)
    assert "capex_inr" not in r.objectives and set(r.objectives) == {"unmet_hours", "heating_energy_kwh", "peak_heating_kw"}
    assert r.excluded == {} and r.front == ("nocost",)                        # 0.5 kWh beats both on the remaining objectives


def test_default_objectives_are_those_every_comparable_design_has():
    pop = points({"a": (1, 2), "b": (2, 1)}, HEAT_CAPEX)
    assert pareto_front(pop).objectives == tuple(active_objectives(pop))
    assert pareto_front(pop).objectives[-1] == "capex_inr"


# ------------------------------------------------------------------ constraint reports
def _report(design_id, failed=(), flags=()):
    return ConstraintReport(design_id, "rev_" + design_id, (), tuple(failed), (), tuple(flags))


def test_hard_failures_are_excluded_and_flagged_designs_stay():
    pop = points({"a": (1, 9), "b": (2, 7), "c": (0.5, 0.5)}, HEAT_CAPEX)
    reports = {"c": _report("c", failed=[ConstraintFailure("mass_within_limit", "too heavy", 9, 5)]),
               "a": _report("a", flags=[ConstraintFailure("unmet_hours_within_limit", "too many unmet hours", 50, 12)])}
    r = pareto_front(pop, HEAT_CAPEX, reports=reports)
    assert r.front == ("a", "b")                                              # c would have dominated both, but it is rejected
    assert r.excluded == {"c": "rejected by hard constraints: too heavy"}
    assert r.flagged == ("a",)


def test_flags_only_matter_for_front_members():
    pop = points({"a": (1, 1), "b": (2, 2)}, HEAT_CAPEX)
    r = pareto_front(pop, HEAT_CAPEX, reports={"b": _report("b", flags=[ConstraintFailure("x", "y")])})
    assert r.front == ("a",) and r.flagged == ()


# ------------------------------------------------------------------ input errors
def test_bad_inputs_are_refused_with_codes():
    pop = points({"a": (1, 2)}, HEAT_CAPEX)
    for kwargs, code in (({"names": ["nonsense"]}, "UNKNOWN_OBJECTIVE"), ({"names": []}, "NO_OBJECTIVES"),
                         ({"names": ["capex_inr", "capex_inr"]}, "NO_OBJECTIVES")):
        with pytest.raises(ParetoError) as e:
            pareto_front(pop, **kwargs)
        assert e.value.code == code
    with pytest.raises(ParetoError) as e:
        pareto_front([pt("a"), pt("a")])
    assert e.value.code == "DUPLICATE_DESIGN" and e.value.details["ids"] == ["a"]


# ------------------------------------------------------------------ against an independent brute-force reference
def _brute_force(results, names):
    def better_or_equal(a, b, n):
        return a <= b if OBJECTIVES[n].direction == "min" else a >= b

    def strictly(a, b, n):
        return a < b if OBJECTIVES[n].direction == "min" else a > b

    def dom(i, j):
        return all(better_or_equal(results[i][n], results[j][n], n) for n in names) and any(strictly(results[i][n], results[j][n], n) for n in names)
    ids = list(results)
    return {j: [i for i in ids if i != j and dom(i, j)] for j in ids}


@pytest.mark.parametrize("seed", range(5))
def test_matches_a_brute_force_reference_on_random_populations(seed):
    rng = np.random.default_rng(seed)
    names = ("heating_energy_kwh", "mass_kg", "reliability", "capex_inr")
    raw = {f"d{i:03d}": {n: float(rng.integers(0, 12)) for n in names} for i in range(150)}          # integers on purpose: many ties
    pop = [pt(k, **v) for k, v in raw.items()]
    r = pareto_front(pop, names)
    expected = _brute_force(raw, names)
    assert set(r.front) == {j for j, d in expected.items() if not d}
    assert {k: set(v) for k, v in r.dominated_by.items()} == {j: set(d) for j, d in expected.items() if d}
    # rank layers: rank 1 is the front; each deeper design is dominated by someone one layer up
    assert {i for i, k in r.rank.items() if k == 1} == set(r.front)
    for i, k in r.rank.items():
        if k > 1:
            assert any(r.rank[j] == k - 1 and j in r.dominated_by[i] for j in r.rank)
    assert set(r.rank) == set(raw)


def test_every_dominated_design_is_dominated_by_someone_on_the_front():
    rng = np.random.default_rng(11)
    pop = [pt(f"d{i}", heating_energy_kwh=float(rng.uniform()), capex_inr=float(rng.uniform()), mass_kg=float(rng.uniform())) for i in range(120)]
    r = pareto_front(pop, ("heating_energy_kwh", "capex_inr", "mass_kg"))
    for d, doms in r.dominated_by.items():
        assert set(doms) & set(r.front)


def test_order_of_the_input_does_not_change_the_front():
    pop = points(TWO_D, HEAT_CAPEX)
    forward = pareto_front(pop, HEAT_CAPEX)
    backward = pareto_front(list(reversed(pop)), HEAT_CAPEX)
    assert set(forward.front) == set(backward.front) and dict(forward.rank) == dict(backward.rank)
    assert backward.front == tuple(reversed(forward.front))                  # each keeps ITS input order


def test_adding_a_dominated_design_changes_nothing_and_a_dominating_one_takes_over():
    pop = points(TWO_D, HEAT_CAPEX)
    base = pareto_front(pop, HEAT_CAPEX)
    worse = pareto_front(pop + [pt("Z", heating_energy_kwh=9.0, capex_inr=11.0)], HEAT_CAPEX)
    assert worse.front == base.front and worse.dominated_by["Z"]
    better = pareto_front(pop + [pt("Z", heating_energy_kwh=0.0, capex_inr=0.0)], HEAT_CAPEX)
    assert better.front == ("Z",)


def test_to_dict_is_json():
    d = pareto_front(points(TWO_D, HEAT_CAPEX), HEAT_CAPEX).to_dict()
    json.dumps(d)
    assert d["front"] == ["A", "B", "D", "F"] and d["ties"] == [["B", "F"]] and d["rank"]["G"] == 3


# ------------------------------------------------------------------ with real M2 designs and the stand-in
def test_a_real_population_has_a_valid_front_and_respects_the_constraints(snapshot, ladakh_candidates):
    from optimization.tests.standins import StandInEvaluator, make_winter_weather
    ev = StandInEvaluator(snapshot, {"wx_p": make_winter_weather("wx_p", days=14, mean_c=-35.0)})
    kw = dict(weather_snapshot_id="wx_p", window_start=T0, window_end=T0 + timedelta(days=8), setpoint_c=15.0, timestep_seconds=3600)
    settings = ObjectiveSettings(target_c=15.0, max_unmet_hours=12.0, warmup_hours=48.0)
    results, reports = [], {}
    for c in ladakh_candidates:
        ideal = run_checked(ev, SimulationJob.from_candidate(c, mode=Mode.IDEAL_LOAD_CONDITIONED, **kw))
        limited = run_checked(ev, SimulationJob.from_candidate(c, mode=Mode.CAPACITY_LIMITED_CONDITIONED, heater_capacity_kw=30.0, **kw))
        o = compute_objectives(CandidateEvaluation(building=c.building, quantities=c.quantities, ideal_load=ideal, capacity_limited=limited), settings)
        results.append(o)
        reports[c.building.design_id] = check_pre_simulation(c.building, ConstraintLimits(maximum_mass_kg=12000.0), quantities=c.quantities)
    heavy = {d for d, rep in reports.items() if not rep.ok}
    assert heavy and len(heavy) < len(results)                               # the mass limit rejects some, not all
    r = pareto_front(results, reports=reports)
    assert set(r.excluded) == heavy and all("mass_within_limit" not in v or "kg" in v for v in r.excluded.values())
    assert set(r.rank) == {o.design_id for o in results} - heavy and r.front
    for d, doms in r.dominated_by.items():
        assert set(doms) & set(r.front)
    assert {"heating_energy_kwh", "mass_kg"} <= set(r.objectives)


def test_broken_dominance_raises_instead_of_looping_forever(monkeypatch):
    """A mutation of the dominance rule once made every design dominate its identical twin, so nothing was
    undominated and the layer-peeling loop never ended. It must fail loudly instead."""
    from optimization import pareto as pareto_module
    monkeypatch.setattr(pareto_module, "_dominates", lambda u, v: all(a <= b for a, b in zip(u, v)))       # forgets 'strictly better'
    with pytest.raises(ParetoError) as e:
        pareto_front(points({"x": (5, 5), "y": (5, 5)}, HEAT_CAPEX), HEAT_CAPEX)
    assert e.value.code == "DOMINANCE_CYCLE"
