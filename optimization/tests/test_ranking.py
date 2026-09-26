"""M6 phase 7 tests: the four named picks and their explanations."""

from __future__ import annotations

import json
import math
import random
from dataclasses import replace
from datetime import timedelta

import pytest
from cocoon_contracts.economics import CostScenario

from design_generator import generate_designs
from optimization.objectives import OBJECTIVES, ObjectiveResult, ObjectiveValue, compute_objectives
from optimization.pareto import pareto_front
from optimization.ranking import (
    OVERALL_WEIGHTS,
    PICKS,
    THERMAL_WEIGHTS,
    RankingError,
    RankingSettings,
    envelope_conductance,
    rank_designs,
)
from optimization.rc_verification import VerificationSettings, analyse_checked, verify_candidates
from optimization.tests.conftest import T0, load_fixture, user_room
from optimization.tests.standins import StandInEvaluator, make_winter_weather

ZERO_THERMAL = dict(unmet_hours=0.0, cold_degree_hours=0.0, overheating_degree_hours=0.0, temperature_swing_c=0.0)


def pt(design_id: str, *, within=True, dev=False, **values) -> ObjectiveResult:
    v = {**ZERO_THERMAL, **values}
    vals = {n: ObjectiveValue(n, v.get(n), None if n in v else "missing") for n in OBJECTIVES}
    return ObjectiveResult(design_id, "rev_" + design_id, vals, True, (), within, dev)


# Hand-made set. Costs are in INR, energy in kWh.
#        energy peak lcc capex mass reliability
SET = {"A": (100, 5, 900, 500, 3000, 0.9), "B": (150, 6, 700, 400, 2000, 0.5), "C": (200, 7, 800, 300, 1000, 0.7)}
NAMES = ("heating_energy_kwh", "peak_heating_kw", "lcc_inr", "capex_inr", "mass_kg", "reliability")


def make(spec=SET) -> list[ObjectiveResult]:
    return [pt(k, **dict(zip(NAMES, v))) for k, v in spec.items()]


def rank(results, settings=None, **kw):
    return rank_designs(results, pareto_front(results), settings, **kw)


# ------------------------------------------------------------------ each pick against a hand-made set
def test_each_pick_matches_a_hand_calculation():
    r = rank(make())
    assert set(r.picks) == set(PICKS)
    assert r.picks["lowest_lcc"].design_id == "B" and r.picks["lowest_lcc"].value == 700          # 700 < 800 < 900
    assert r.picks["lowest_capex"].design_id == "C" and r.picks["lowest_capex"].value == 300      # 300 < 400 < 500
    # thermal: constant objectives score 1 each (weights 3+2+2+1 = 8); energy and peak have weights 2 and 1 (total 11)
    assert r.scores["A"]["thermal"] == pytest.approx(11 / 11)
    assert r.scores["B"]["thermal"] == pytest.approx((8 + 2 * 0.5 + 1 * 0.5) / 11)
    assert r.scores["C"]["thermal"] == pytest.approx(8 / 11)
    assert r.picks["best_thermal"].design_id == "A"
    # overall: weights sum to 16; constants add 3+1+1+1 = 6
    assert r.scores["A"]["overall"] == pytest.approx((6 + 2 * 1 + 1 * 1 + 3 * 0 + 1 * 0 + 1 * 0 + 2 * 1) / 16)
    assert r.scores["B"]["overall"] == pytest.approx((6 + 2 * .5 + 1 * .5 + 3 * 1 + 1 * .5 + 1 * .5 + 2 * 0) / 16)
    assert r.scores["C"]["overall"] == pytest.approx((6 + 2 * 0 + 1 * 0 + 3 * .5 + 1 * 1 + 1 * 1 + 2 * .5) / 16)
    assert r.picks["best_overall"].design_id == "B"
    assert r.picks["best_overall"].value == pytest.approx(11.5 / 16)


def test_the_runner_up_and_the_gap_are_reported():
    p = rank(make()).picks
    assert (p["best_overall"].runner_up, p["best_overall"].gap) == ("A", pytest.approx(11.5 / 16 - 11 / 16))
    assert p["best_overall"].runner_up_value == pytest.approx(11 / 16)
    assert (p["lowest_lcc"].runner_up, p["lowest_lcc"].runner_up_value, p["lowest_lcc"].gap) == ("C", 800, 100)
    assert (p["lowest_capex"].runner_up, p["lowest_capex"].gap) == ("B", 100)


def test_a_single_design_has_no_runner_up():
    p = rank(make({"A": SET["A"]})).picks
    assert all(p[n].design_id == "A" and p[n].runner_up is None and p[n].gap is None for n in PICKS)


def test_all_scores_are_between_0_and_1():
    r = rank(make())
    assert all(0.0 <= s <= 1.0 for row in r.scores.values() for s in row.values())


# ------------------------------------------------------------------ weights are visible and editable
def test_the_weights_used_are_returned():
    p = rank(make()).picks
    assert p["best_overall"].weights == dict(OVERALL_WEIGHTS) and p["best_thermal"].weights == dict(THERMAL_WEIGHTS)
    assert p["lowest_lcc"].weights == {} and p["best_overall"].dropped_objectives == ()


def test_changing_the_overall_weights_changes_only_best_overall():
    base = rank(make())
    heavy = dict(OVERALL_WEIGHTS, reliability=30.0, lcc_inr=0.0, capex_inr=0.0)
    r = rank(make(), RankingSettings(overall_weights=heavy))
    assert base.picks["best_overall"].design_id == "B" and r.picks["best_overall"].design_id == "A"       # A is most reliable
    for n in ("best_thermal", "lowest_lcc", "lowest_capex"):
        assert r.picks[n] == base.picks[n]
    assert r.picks["best_overall"].weights == {n: w for n, w in heavy.items() if w > 0}          # zero weights are not reported


def test_changing_the_thermal_weights_changes_only_best_thermal():
    base = rank(make())
    only_peak_of_c = {"peak_heating_kw": 1.0}
    inverted = make({"A": SET["A"], "B": SET["B"], "C": (200, 4, 800, 300, 1000, 0.7)})       # C now has the lowest peak
    r = rank(inverted, RankingSettings(thermal_weights=only_peak_of_c))
    assert r.picks["best_thermal"].design_id == "C" and r.picks["best_thermal"].weights == only_peak_of_c
    assert rank(inverted).picks["best_thermal"].design_id == "A"                                    # default weights still favour A
    assert r.picks["lowest_lcc"] == rank(inverted).picks["lowest_lcc"]
    assert r.picks["best_overall"] == rank(inverted).picks["best_overall"] and base.picks["best_overall"].design_id == "B"


def test_zero_weight_objectives_are_not_counted_or_reported():
    r = rank(make(), RankingSettings(thermal_weights={"heating_energy_kwh": 1.0, "peak_heating_kw": 0.0}))
    assert r.picks["best_thermal"].weights == {"heating_energy_kwh": 1.0}
    assert r.picks["best_thermal"].dropped_objectives == ()


@pytest.mark.parametrize("bad", [{"nonsense": 1.0}, {"occupied_comfort_hours": 1.0}, {"lcc_inr": -1.0}, {"lcc_inr": float("nan")},
                                 {"lcc_inr": float("inf")}, {"lcc_inr": 0.0}, {}])
def test_bad_weights_are_refused(bad):
    for field_name in ("overall_weights", "thermal_weights"):
        with pytest.raises(RankingError) as e:
            RankingSettings(**{field_name: bad})
        assert e.value.code == "INVALID_SETTINGS"


# ------------------------------------------------------------------ eligibility: comfort first
def with_cheap_failure():
    return make() + [pt("D", within=False, unmet_hours=50.0, heating_energy_kwh=120, peak_heating_kw=5.5, lcc_inr=100, capex_inr=100,
                        mass_kg=500, reliability=0.6)]


def test_a_design_that_breaks_the_unmet_limit_is_never_picked_even_if_cheapest():
    results = with_cheap_failure()
    front = pareto_front(results)
    assert "D" in front.front                                                          # it IS on the Pareto front (cheapest)
    r = rank_designs(results, front)
    assert r.eligible == ("A", "B", "C") and "D" not in r.scores
    assert r.picks["lowest_lcc"].design_id == "B" and r.picks["lowest_capex"].design_id == "C"
    assert all(r.picks[n].pool_size == 3 and not r.picks[n].flagged for n in PICKS)


def test_the_comfort_filter_can_be_switched_off():
    results = with_cheap_failure()
    r = rank_designs(results, pareto_front(results), RankingSettings(require_within_unmet_limit=False))
    assert r.picks["lowest_lcc"].design_id == "D" and r.picks["lowest_capex"].design_id == "D" and "D" in r.eligible


def test_when_nothing_meets_the_limit_every_pick_says_so():
    results = [pt(k, within=False, unmet_hours=20.0 + i, **dict(zip(NAMES[:0], ())), **dict(zip(NAMES, v)))
               for i, (k, v) in enumerate(SET.items())]
    r = rank(results)
    assert all(r.picks[n].flagged and r.picks[n].pool_size == 3 for n in PICKS)
    assert any("no design on the front meets the unmet-hours limit" in w for w in r.warnings)
    assert all(any("breaks it" in e.sentence for e in r.picks[n].explanation) for n in PICKS)


def test_an_unknown_unmet_status_is_not_treated_as_passing():
    results = [pt("A", within=None, **dict(zip(NAMES, SET["A"]))), pt("B", **dict(zip(NAMES, SET["B"])))]
    r = rank(results)
    assert r.eligible == ("B",)


# ------------------------------------------------------------------ missing economics
def no_costs(spec=SET):
    return [pt(k, **{n: x for n, x in zip(NAMES, v) if n not in ("lcc_inr", "capex_inr")}) for k, v in spec.items()]


def test_picks_that_need_economics_are_unavailable_without_it():
    r = rank(no_costs())
    for n in ("lowest_lcc", "lowest_capex"):
        p = r.picks[n]
        assert p.status == "unavailable" and p.design_id is None and "economics" in p.reason and p.explanation == ()
    o = r.picks["best_overall"]
    assert o.status == "selected" and set(o.dropped_objectives) == {"lcc_inr", "capex_inr"}
    assert "lcc_inr" not in o.weights and "capex_inr" not in o.weights
    assert "not counted" in o.reason and any("without lcc_inr" in w for w in r.warnings)
    assert r.picks["best_thermal"].dropped_objectives == ()


def test_a_design_with_no_cost_is_skipped_by_the_cost_picks_only():
    results = make()
    results[1] = pt("B", **{n: x for n, x in zip(NAMES, SET["B"]) if n not in ("lcc_inr", "capex_inr")})      # B loses its costs (B was cheapest lcc)
    r = rank(results)
    assert r.picks["lowest_lcc"].design_id == "C" and r.picks["lowest_capex"].design_id == "C"
    assert any("lowest_lcc ignores 1 design(s) with no lcc_inr" in w for w in r.warnings)
    assert "lcc_inr" in r.picks["best_overall"].dropped_objectives                                          # cannot score B on cost, so nobody is


def test_no_comparable_design_gives_four_unavailable_picks():
    r = rank_designs([], pareto_front([]))
    assert set(r.picks) == set(PICKS) and all(p.status == "unavailable" for p in r.picks.values()) and r.eligible == ()
    assert r.warnings


# ------------------------------------------------------------------ determinism
def test_ties_break_on_the_design_id():
    same = {"Z": SET["B"], "M": SET["B"], "A": SET["B"]}
    p = rank(make(same)).picks
    assert all(p[n].design_id == "A" for n in PICKS)


@pytest.mark.parametrize("seed", range(6))
def test_input_order_does_not_change_the_answer(seed):
    results = make() + [pt("E", heating_energy_kwh=160, peak_heating_kw=5.5, lcc_inr=760, capex_inr=380, mass_kg=1500, reliability=0.6)]
    base = rank(results)
    shuffled = results[:]
    random.Random(seed).shuffle(shuffled)
    other = rank(shuffled)
    assert {n: base.picks[n].design_id for n in PICKS} == {n: other.picks[n].design_id for n in PICKS}
    assert {k: v for k, v in base.scores.items()} == {k: v for k, v in other.scores.items()}


def test_the_result_can_be_written_as_json():
    r = rank(with_cheap_failure())
    d = json.loads(json.dumps(r.to_dict()))
    assert set(d["picks"]) == set(PICKS) and d["eligible"] == ["A", "B", "C"]
    assert d["picks"]["best_overall"]["explanation"] == [] or "sources" in d["picks"]["best_overall"]["explanation"][0]


def test_development_only_designs_say_so():
    results = [pt(k, dev=True, **dict(zip(NAMES, v))) for k, v in SET.items()]
    p = rank(results).picks
    assert all(p[n].development_only and p[n].explanation[0].sentence.startswith("These numbers come from a development stand-in")
               for n in PICKS)
    assert not any(rank(make()).picks[n].development_only for n in PICKS)


# ------------------------------------------------------------------ explanations use real fields only
def test_leadership_sentences_quote_the_real_numbers_and_only_real_leaders():
    p = rank(make()).picks
    text = {n: [e.sentence for e in p[n].explanation] for n in PICKS}
    assert "Lowest lifecycle cost of the 3 eligible designs: 700 INR (next best 800 INR)." in text["lowest_lcc"]
    assert "Lowest capital cost of the 3 eligible designs: 300 INR (next best 400 INR)." in text["lowest_capex"]
    assert "Lowest heating energy of the 3 eligible designs: 100 kWh (next best 150 kWh)." in text["best_thermal"]
    assert "Highest reliability score of the 3 eligible designs: 0.9 0..1 (next best 0.7 0..1)." not in text["best_thermal"]
    # B leads only in lifecycle cost; it must not be credited with leading anything else
    assert not any("Lowest heating energy" in s for s in text["best_overall"])
    assert any("Lowest lifecycle cost" in s for s in text["best_overall"])


def test_a_maximised_objective_is_worded_as_highest_and_reliability_is_quoted():
    heavy = RankingSettings(overall_weights=dict(OVERALL_WEIGHTS, reliability=30.0, lcc_inr=0.0, capex_inr=0.0))
    p = rank(make(), heavy).picks
    text = [e.sentence for e in p["best_overall"].explanation]
    assert p["best_overall"].design_id == "A"
    assert "Highest reliability score of the 3 eligible designs: 0.9 0..1 (next best 0.7 0..1)." in text
    assert "Stays the best choice in 90% of the perturbation tests." in text
    assert not any("reliability" in e.sentence for e in p["best_thermal"].explanation)          # not part of the thermal pick
    no_rel = rank(no_reliability := [pt(k, **{n: x for n, x in zip(NAMES, v) if n != "reliability"}) for k, v in SET.items()])
    assert not any("perturbation" in e.sentence for e in no_rel.picks["best_overall"].explanation)


def test_the_comfort_verdict_quotes_whether_the_limit_is_met():
    ok = [e.sentence for e in rank(make()).picks["lowest_lcc"].explanation]
    assert "0 unmet comfort hours, within the requirement's limit." in ok
    results = [pt(k, within=False, unmet_hours=20.0 + i, **dict(zip(NAMES, v))) for i, (k, v) in enumerate(SET.items())]
    bad = rank(results).picks["lowest_lcc"]
    assert f"{20.0 + 1:.3g} unmet comfort hours, ABOVE the requirement's limit." in [e.sentence for e in bad.explanation]      # B has 21 h


def test_at_most_three_leadership_sentences_are_given():
    spec = {"A": dict(unmet_hours=0.0, cold_degree_hours=0.0, overheating_degree_hours=0.0, temperature_swing_c=0.0,
                      heating_energy_kwh=100, peak_heating_kw=5, mass_kg=1000, lcc_inr=900, capex_inr=500, reliability=0.5),
            "B": dict(unmet_hours=1.0, cold_degree_hours=1.0, overheating_degree_hours=1.0, temperature_swing_c=1.0,
                      heating_energy_kwh=150, peak_heating_kw=6, mass_kg=2000, lcc_inr=700, capex_inr=400, reliability=0.9)}
    results = [pt(k, **v) for k, v in spec.items()]
    p = rank(results, RankingSettings(require_within_unmet_limit=False)).picks["best_thermal"]
    assert p.design_id == "A"
    leaders = [e for e in p.explanation if e.sentence.startswith(("Lowest", "Highest"))]
    assert len(leaders) == 3                                                       # A leads six thermal objectives; three are quoted


def test_a_leader_sentence_is_dropped_when_every_design_ties():
    same = {k: (100, 5, 900, 500, 3000, 0.9) for k in "ABC"}
    text = [e.sentence for e in rank(make(same)).picks["lowest_lcc"].explanation]
    assert not any("Lowest" in s for s in text)


def test_every_sentence_names_its_sources_and_they_are_real_fields():
    for p in rank(make()).picks.values():
        for e in p.explanation:
            assert e.sources and all(isinstance(s, str) and s for s in e.sources)
            for s in e.sources:
                if s.startswith("objectives."):
                    assert s.split(".")[1] in OBJECTIVES or s.split(".")[1] in ("within_unmet_limit", "development_only")


def test_the_unmet_sentence_is_omitted_when_unmet_hours_is_missing():
    results = [ObjectiveResult(r.design_id, r.revision_id, {**r.values, "unmet_hours": ObjectiveValue("unmet_hours", None, "no run")},
                               True, (), True, False) for r in make()]
    p = rank_designs(results, pareto_front(results, names=["heating_energy_kwh", "lcc_inr"])).picks
    assert p["lowest_lcc"].status == "selected"
    assert not any("unmet comfort hours" in e.sentence for e in p["lowest_lcc"].explanation)


# ------------------------------------------------------------------ heat-loss paths, by hand
def test_envelope_conductance_of_a_plain_room_by_hand(snapshot):
    b = user_room()                                                     # 6 x 4 x 2.8 m, no windows, no door
    ua = envelope_conductance(b)
    u = {a.category.value if hasattr(a.category, "value") else a.category: a.u_value_w_m2k for a in b.assemblies.values()}
    assert ua["walls"] == pytest.approx(u["wall"] * 2 * (6 + 4) * 2.8)              # 56 m2
    assert ua["roof"] == pytest.approx(u["roof"] * 24.0) and ua["floor"] == pytest.approx(u["floor"] * 24.0)
    assert ua["windows"] == 0.0 and ua["doors"] == 0.0 and "infiltration" not in ua


def test_windows_are_taken_out_of_the_wall_and_counted_separately():
    b = user_room(windows=[{"zone": "room", "face": "south", "width_m": 1.2, "height_m": 1.2, "count": 2}])
    ua = envelope_conductance(b)
    u_wall = next(a.u_value_w_m2k for a in b.assemblies.values() if str(getattr(a.category, "value", a.category)) == "wall")
    win = [o for o in b.openings]
    assert sum(o.area_m2 for o in win) == pytest.approx(2.88)
    assert ua["windows"] == pytest.approx(sum(o.u_value_w_m2k * o.area_m2 for o in win))
    assert ua["walls"] == pytest.approx(u_wall * (56.0 - 2.88))


def test_infiltration_uses_the_air_change_rate_and_the_volume():
    b = user_room()
    ua = envelope_conductance(b, ach=2.0)
    assert ua["infiltration"] == pytest.approx(1.2 * 1005.0 * 2.0 * (6 * 4 * 2.8) / 3600.0)
    assert ua["infiltration"] == pytest.approx(45.02, abs=0.01)                   # 1206 J/m3K x 2 /h x 67.2 m3 / 3600 s
    assert envelope_conductance(b, ach=0.0)["infiltration"] == 0.0


def test_a_missing_u_value_gives_no_conductance_instead_of_a_guess():
    b = user_room()
    a0 = next(iter(b.assemblies))
    broken = b.model_copy(update={"assemblies": {**b.assemblies, a0: b.assemblies[a0].model_copy(update={"u_value_w_m2k": None})}})
    used = {s.assembly_id for s in b.surfaces}
    if a0 in used:
        assert envelope_conductance(broken) is None


# ------------------------------------------------------------------ the whole pipeline on real M2 designs
WX = "wx_rank"


@pytest.fixture(scope="module")
def pipeline(snapshot, economics):
    cold = StandInEvaluator(snapshot, {WX: make_winter_weather(WX, days=14, mean_c=-35.0)})
    cands = generate_designs(load_fixture("requirements_ladakh_30p.json"), load_fixture("material_snapshot_standard.json"),
                             seed=42, count=4, created_at=T0).candidates
    s = VerificationSettings(weather_snapshot_id=WX, window_start=T0, window_end=T0 + timedelta(days=8), setpoint_c=15.0,
                             timestep_seconds=3600, heater_fuel="kerosene")
    verified = verify_candidates(cands, cold, s)
    out, evals, extras = [], {}, {}
    for c, v in zip(cands, verified):
        assert v.status == "verified"
        econ = analyse_checked(economics, c.building, c.quantities, v.evaluation.capacity_limited, "econ_standin_expected_v0",
                               CostScenario.EXPECTED)
        ev = replace(v.evaluation, quantities=c.quantities, economics=econ)
        out.append(compute_objectives(ev, s.to_objective_settings(12.0)))
        evals[c.building.design_id], extras[c.building.design_id] = ev, c.extras
    return out, evals, extras, cands


def test_real_designs_get_four_picks_with_explanations_built_from_their_own_numbers(pipeline):
    results, evals, extras, _ = pipeline
    r = rank_designs(results, pareto_front(results), evaluations=evals, extras=extras)
    assert all(p.status == "selected" and p.development_only for p in r.picks.values())
    by_id = {o.design_id: o for o in results}
    lcc = r.picks["lowest_lcc"]
    e = evals[lcc.design_id].economics
    assert lcc.value == pytest.approx(e.lcc_inr) == pytest.approx(min(o.value("lcc_inr") for o in results if o.design_id in r.eligible))
    money = next(x for x in lcc.explanation if x.sources[0] == "economics.capex.total_capex_inr")
    assert f"{e.capex.total_capex_inr:,.0f}" in money.sentence or f"{e.capex.total_capex_inr:.3g}" in money.sentence
    assert f"{e.lcc_inr:,.0f}" in money.sentence and f"over {len(e.annual_cash_flows)} years" in money.sentence
    unmet = next(x for x in lcc.explanation if x.sources[0] == "objectives.unmet_hours")
    assert f"{by_id[lcc.design_id].value('unmet_hours'):.3g} unmet comfort hours" in unmet.sentence
    for n in PICKS:
        assert r.picks[n].design_id in r.eligible


def test_the_fuel_share_is_the_real_fuel_share(pipeline):
    results, evals, extras, _ = pipeline
    r = rank_designs(results, pareto_front(results), evaluations=evals, extras=extras)
    pick = r.picks["lowest_capex"]
    e = evals[pick.design_id].economics
    opex = sum(p.total_opex_inr for p in e.annual_cash_flows)
    fuel = sum(p.fuel_cost_inr for p in e.annual_cash_flows)
    sentence = next(x.sentence for x in pick.explanation if x.sources[0] == "economics.capex.total_capex_inr")
    if opex > 0:
        assert f"Fuel is {fuel / opex:.0%} of operating cost." in sentence
    else:
        assert "Fuel is" not in sentence


def test_heat_loss_and_window_sentences_are_computed_and_labelled(pipeline):
    results, evals, extras, _ = pipeline
    r = rank_designs(results, pareto_front(results), evaluations=evals, extras=extras)
    p = r.picks["best_overall"]
    loss = next(x for x in p.explanation if x.sources[0] == "building.assemblies[*].u_value_w_m2k")
    ua = envelope_conductance(evals[p.design_id].building, extras[p.design_id].get("air_changes_per_hour"))
    top = max(ua, key=ua.get)
    assert f"Largest steady heat-loss path: {top}" in loss.sentence and "not from the simulation" in loss.sentence
    assert f"{ua[top] / sum(ua.values()):.0%}" in loss.sentence
    if "air_changes_per_hour" in extras[p.design_id]:
        assert "extras.air_changes_per_hour" in loss.sources


def test_without_evaluations_only_result_based_sentences_remain(pipeline):
    results, _, _, _ = pipeline
    r = rank_designs(results, pareto_front(results))
    for pick in r.picks.values():
        assert all(x.sources[0].startswith("objectives.") for x in pick.explanation)


def test_without_economics_the_cost_sentence_is_omitted_and_no_number_is_invented(pipeline):
    results, evals, extras, _ = pipeline
    stripped = {k: replace(v, economics=None) for k, v in evals.items()}
    r = rank_designs(results, pareto_front(results), evaluations=stripped, extras=extras)
    for pick in r.picks.values():
        assert not any(x.sources[0].startswith("economics.") for x in pick.explanation)
        assert not any("INR" in x.sentence and x.sources[0] != "objectives.lcc_inr" and x.sources[0] != "objectives.capex_inr"
                       for x in pick.explanation)


def test_the_airlock_sentence_appears_only_when_the_simulation_measured_it(pipeline):
    results, evals, extras, _ = pipeline
    r = rank_designs(results, pareto_front(results), evaluations=evals, extras=extras)
    assert not any(x.sources[0].startswith("simulation.") for p in r.picks.values() for x in p.explanation)   # the stand-in leaves it None
    pick = r.picks["best_thermal"].design_id
    ev = evals[pick]
    summary = ev.capacity_limited.summary.model_copy(update={"airlock_benefit_vs_baseline_pct": 12.5})
    with_benefit = replace(ev, capacity_limited=ev.capacity_limited.model_copy(update={"summary": summary}))
    r2 = rank_designs(results, pareto_front(results), evaluations={**evals, pick: with_benefit}, extras=extras)
    assert any("The airlock cuts heating by 12.5% against a matched baseline without one." == x.sentence
               for x in r2.picks["best_thermal"].explanation)
