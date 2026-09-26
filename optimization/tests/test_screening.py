"""M6 phase 6 tests: screening with M5's predictions."""

from __future__ import annotations

import json
import random
import re
import time
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from cocoon_contracts.simulation import RecommendationState

from optimization import screening as sc
from optimization.constraints import ConstraintFailure, ConstraintReport
from optimization.screening import (
    DEFAULT_DIMENSIONS,
    DIRECT_DEV_ONLY,
    DIRECT_INCOMPLETE,
    DIRECT_OOD,
    DIRECT_UNAVAILABLE,
    EXCLUDED,
    ML_DOMINATED,
    ML_OVER_LIMIT,
    ML_SHORTLIST,
    NoModel,
    Prediction,
    Predictor,
    ScreeningError,
    ScreeningSettings,
    screen_candidates,
)

HP = ("heating_energy_kwh", "peak_heating_kw")                       # two predicted dimensions
PLAIN = ScreeningSettings(dimensions=HP, safety_margin=0.0, shortlist_size=None, min_shortlist=0)


def cand(did: str, mass: float | None = None):
    q = None if mass is None else SimpleNamespace(materials=[SimpleNamespace(mass_kg=mass)])
    return SimpleNamespace(building=SimpleNamespace(design_id=did, revision_id="rev_" + did), quantities=q)


def ok(**values) -> Prediction:
    return Prediction("ok", values, model_version="m5-test", label_source="m4")


class Table:
    """A predictor that answers from a dict (design id -> Prediction); records what it was asked."""

    def __init__(self, table):
        self.table, self.asked = table, []

    def predict(self, candidates):
        self.asked.append([c.building.design_id for c in candidates])
        return [self.table[c.building.design_id] for c in candidates]


def pop(points: dict[str, tuple], names=HP):
    cands = [cand(k) for k in points]
    return cands, Table({k: ok(**dict(zip(names, v))) for k, v in points.items()})


TWO_D = {"A": (1, 9), "B": (2, 7), "C": (3, 8), "D": (4, 3), "E": (5, 5), "F": (2, 7), "G": (6, 10)}


# ------------------------------------------------------------------ no model: everything goes to the physics
def test_without_a_model_every_candidate_goes_to_rc():
    cands = [cand(c) for c in "abc"]
    r = screen_candidates(cands, NoModel())
    assert r.to_rc == ("a", "b", "c") and r.discarded == () and not r.ml_used and r.dimensions_used == ()
    assert all(x.route == DIRECT_UNAVAILABLE and x.recommendation_state is None and x.ml_status == "model_unavailable" for x in r.records)
    assert "no trained model" in r.records[0].reason and r.summary()[DIRECT_UNAVAILABLE] == 3


def test_a_model_that_reports_unavailable_sends_everything_to_rc():
    cands = [cand(c) for c in "ab"]
    table = Table({c: Prediction("model_unavailable", None, "model file missing") for c in "ab"})
    r = screen_candidates(cands, table)
    assert r.to_rc == ("a", "b") and "model file missing" in r.records[0].reason


def test_no_model_and_protocols():
    assert isinstance(NoModel(), Predictor) and isinstance(Table({}), Predictor)


def test_a_crashing_predictor_never_blocks_the_physics():
    class Boom:
        def predict(self, candidates):
            raise RuntimeError("model file is corrupt")

    r = screen_candidates([cand("a"), cand("b")], Boom())
    assert r.to_rc == ("a", "b") and not r.ml_used and "RuntimeError" in r.warnings[0]
    assert all(x.route == DIRECT_UNAVAILABLE for x in r.records)


# ------------------------------------------------------------------ out of distribution
def test_out_of_distribution_designs_go_straight_to_rc_while_the_rest_are_screened():
    cands, table = pop({"A": (1, 9), "B": (2, 7), "C": (9, 9)})
    table.table["X"] = Prediction("out_of_distribution", None, "footprint beyond the training range", "m5-test")
    table.table["Y"] = Prediction("out_of_distribution", None, "unseen template", "m5-test")
    r = screen_candidates(cands + [cand("X"), cand("Y")], table, PLAIN)
    assert {x.design_id for x in r.records if x.route == DIRECT_OOD} == {"X", "Y"}
    assert set(r.to_rc) == {"A", "B", "X", "Y"} and r.discarded == ("C",)
    x = r.record("X")
    assert x.decision == "send_to_rc" and "footprint beyond the training range" in x.reason and x.recommendation_state is None
    assert r.ml_used                                                                    # the others really were screened


def test_when_everything_is_out_of_distribution_nothing_is_discarded():
    cands = [cand(c) for c in "abcd"]
    r = screen_candidates(cands, Table({c: Prediction("out_of_distribution", None, "far outside") for c in "abcd"}))
    assert r.to_rc == ("a", "b", "c", "d") and r.discarded == () and not r.ml_used


# ------------------------------------------------------------------ the shortlist keeps the known best
def test_with_no_margin_the_shortlist_is_the_predicted_pareto_front():
    cands, table = pop(TWO_D)
    r = screen_candidates(cands, table, PLAIN)
    assert r.to_rc == ("A", "B", "D", "F") and r.discarded == ("C", "E", "G")
    assert r.record("C").route == ML_DOMINATED and r.record("C").dominated_by == ("B", "F")
    assert r.record("E").dominated_by == ("D",) and r.record("G").dominated_by == ("A", "B", "C", "D", "E", "F")
    assert all(x.recommendation_state == RecommendationState.SCREENED_BY_ML for x in r.records)     # ML decided each of them
    assert r.dimensions_used == HP and r.ml_used and r.record("A").ml_rank == 1 and r.record("G").ml_rank == 3
    assert r.record("A").predicted == {"heating_energy_kwh": 1.0, "peak_heating_kw": 9.0}


def test_a_safety_margin_keeps_designs_that_are_only_slightly_worse():
    cands, table = pop({"B": (1.0, 1.0), "A": (1.05, 1.05), "C": (10.0, 10.0)})
    tight = screen_candidates(cands, table, PLAIN)
    assert tight.to_rc == ("B",) and set(tight.discarded) == {"A", "C"}
    safe = screen_candidates(cands, table, replace(PLAIN, safety_margin=0.10))       # margin = 0.1 x 9 = 0.9
    assert safe.to_rc == ("B", "A") and safe.discarded == ("C",)                     # A is within the margin of B; C is not


def test_a_larger_margin_never_discards_more():
    cands, table = pop(TWO_D)
    kept = [set(screen_candidates(cands, table, replace(PLAIN, safety_margin=m)).to_rc) for m in (0.0, 0.05, 0.1, 0.2, 0.5, 0.9)]
    for smaller, larger in zip(kept, kept[1:]):
        assert smaller <= larger


def test_the_size_cap_keeps_the_best_ranked_and_says_why_the_rest_were_dropped():
    front = {f"d{i}": (float(i), float(6 - i)) for i in range(1, 7)}                # six mutually non-dominated designs
    cands, table = pop({**front, "worse": (7.0, 7.0)})
    r = screen_candidates(cands, table, replace(PLAIN, shortlist_size=3))
    assert r.to_rc == ("d1", "d2", "d3")                                              # equal rank and score: ties broken by id
    assert r.record("d4").route == ML_OVER_LIMIT and "shortlist limit of 3" in r.record("d4").reason
    assert r.record("worse").route == ML_DOMINATED


def test_the_cap_prefers_a_better_layer_over_a_better_looking_score():
    """A, B, C are non-dominated (layer 1); D is dominated by C (layer 2) yet has a smaller summed score than A or B.
    With a safety margin D is not 'safely' dominated, so the cap of 3 has to choose between four safe designs."""
    cands, table = pop({"A": (0.0, 20.0), "B": (20.0, 0.0), "C": (1.0, 1.0), "D": (2.0, 2.0)})
    r = screen_candidates(cands, table, replace(PLAIN, shortlist_size=3, safety_margin=0.10))
    assert set(r.to_rc) == {"A", "B", "C"}                                             # D loses on layer although its score beats A and B
    assert r.record("D").route == ML_OVER_LIMIT and r.record("D").dominated_by == ()   # not dominated by margin: dropped only by the cap
    assert r.record("C").ml_rank == r.record("A").ml_rank == 1 and r.record("D").ml_rank == 2


def test_the_cap_gives_the_same_designs_whatever_the_input_order():
    front = {f"d{i}": (float(i), float(6 - i)) for i in range(1, 7)}
    picks = set()
    for seed in range(5):
        items = list(front.items())
        random.Random(seed).shuffle(items)
        cands, table = pop(dict(items))
        picks.add(tuple(sorted(screen_candidates(cands, table, replace(PLAIN, shortlist_size=3)).to_rc)))
    assert picks == {("d1", "d2", "d3")}


def test_the_minimum_shortlist_is_topped_up_from_the_best_of_the_rest():
    cands, table = pop({"best": (0.0, 0.0), "p": (10.0, 12.0), "q": (11.0, 11.0), "r": (12.0, 10.0), "s": (14.0, 14.0)})
    r = screen_candidates(cands, table, replace(PLAIN, safety_margin=0.1, min_shortlist=4))
    assert set(r.to_rc) == {"best", "p", "q", "r"} and r.discarded == ("s",)          # the worst design is the one left out
    assert r.record("best").reason == "shortlisted for RC verification"
    for d in ("p", "q", "r"):
        assert r.record(d).route == ML_SHORTLIST and "minimum shortlist" in r.record(d).reason


def test_a_single_candidate_is_shortlisted():
    cands, table = pop({"only": (1.0, 1.0)})
    assert screen_candidates(cands, table, PLAIN).to_rc == ("only",)


def test_identical_predictions_all_go_to_rc():
    cands, table = pop({"x": (5.0, 5.0), "y": (5.0, 5.0), "z": (5.0, 5.0)})
    r = screen_candidates(cands, table, PLAIN)
    assert r.to_rc == ("x", "y", "z")


# ------------------------------------------------------------------ the safety margin really is a safety margin
@pytest.mark.parametrize("seed", range(8))
@pytest.mark.parametrize("margin", [0.05, 0.10, 0.25])
def test_if_predictions_are_within_the_margin_of_the_truth_the_true_best_is_never_discarded(seed, margin):
    """The discard rule implies TRUE dominance whenever every prediction is within one margin of the truth."""
    names = ("heating_energy_kwh", "peak_heating_kw", "comfort_hours")                # comfort_hours is maximised
    rng = np.random.default_rng(seed)
    n = 60
    pred = {f"d{i:02d}": {k: float(rng.uniform(0, 100)) for k in names} for i in range(n)}
    spans = {k: max(v[k] for v in pred.values()) - min(v[k] for v in pred.values()) for k in names}
    m = {k: margin * spans[k] for k in names}
    truth = {d: {k: v[k] + float(rng.uniform(-1, 1)) * m[k] * 0.999999 for k in names} for d, v in pred.items()}

    def better(a, b):                                                                 # a is at least as good as b everywhere, better somewhere
        sgn = {"heating_energy_kwh": 1, "peak_heating_kw": 1, "comfort_hours": -1}
        le = all(sgn[k] * a[k] <= sgn[k] * b[k] for k in names)
        lt = any(sgn[k] * a[k] < sgn[k] * b[k] for k in names)
        return le and lt

    true_front = {d for d in truth if not any(better(truth[o], truth[d]) for o in truth if o != d)}
    cands = [cand(d) for d in pred]
    table = Table({d: ok(**v) for d, v in pred.items()})
    r = screen_candidates(cands, table, ScreeningSettings(dimensions=names, safety_margin=margin, shortlist_size=None, min_shortlist=0))
    assert true_front <= set(r.to_rc), sorted(true_front - set(r.to_rc))
    assert len(r.discarded) > 0 or margin >= 0.25                                     # and it still discards clearly worse designs


# ------------------------------------------------------------------ known dimensions (mass)
def test_mass_is_known_exactly_and_used_alongside_the_predictions():
    cands = [cand("X", 100.0), cand("Y", 50.0), cand("Z", 200.0)]
    table = Table({"X": ok(heating_energy_kwh=1.0), "Y": ok(heating_energy_kwh=2.0), "Z": ok(heating_energy_kwh=3.0)})
    r = screen_candidates(cands, table, ScreeningSettings(dimensions=("heating_energy_kwh", "mass_kg"), safety_margin=0.0,
                                                          shortlist_size=None, min_shortlist=0))
    assert r.dimensions_used == ("heating_energy_kwh", "mass_kg")
    assert r.to_rc == ("X", "Y") and r.discarded == ("Z",)
    assert r.record("Z").dominated_by == ("X", "Y")                                   # Z is heavier AND predicted worse than both
    assert r.record("Y").predicted == {"heating_energy_kwh": 2.0, "mass_kg": 50.0}


def test_a_dimension_not_known_for_every_candidate_is_dropped_with_a_warning():
    cands = [cand("X", 100.0), cand("Y", None), cand("Z", 200.0)]
    table = Table({"X": ok(heating_energy_kwh=1.0), "Y": ok(heating_energy_kwh=2.0), "Z": ok(heating_energy_kwh=3.0)})
    r = screen_candidates(cands, table, ScreeningSettings(dimensions=("heating_energy_kwh", "mass_kg"), safety_margin=0.0,
                                                          shortlist_size=None, min_shortlist=0))
    assert r.dimensions_used == ("heating_energy_kwh",) and r.to_rc == ("X",) and "mass_kg" in r.warnings[0]


def test_with_no_usable_dimension_everything_goes_to_rc():
    cands = [cand("X"), cand("Y")]                                                    # no quantities, and only mass asked for
    table = Table({"X": Prediction("ok", {}, model_version="v"), "Y": Prediction("ok", {}, model_version="v")})
    r = screen_candidates(cands, table, ScreeningSettings(dimensions=("mass_kg",)))
    assert r.to_rc == ("X", "Y") and {x.route for x in r.records} == {"direct_no_common_dimension"} and not r.ml_used


# ------------------------------------------------------------------ predictions that cannot be trusted
def test_an_incomplete_or_non_finite_prediction_goes_to_rc():
    cands = [cand("A"), cand("B"), cand("C"), cand("D")]
    table = Table({"A": ok(heating_energy_kwh=1.0, peak_heating_kw=1.0), "B": ok(heating_energy_kwh=2.0),
                   "C": ok(heating_energy_kwh=float("nan"), peak_heating_kw=1.0), "D": ok(heating_energy_kwh=9.0, peak_heating_kw=9.0)})
    r = screen_candidates(cands, table, PLAIN)
    assert r.record("B").route == DIRECT_INCOMPLETE and "peak_heating_kw" in r.record("B").reason
    assert r.record("C").route == DIRECT_INCOMPLETE
    assert set(r.to_rc) == {"A", "B", "C"} and r.discarded == ("D",)


def test_predictions_from_a_development_model_are_ignored_by_default():
    cands = [cand("A"), cand("B")]
    table = Table({"A": Prediction("ok", {"heating_energy_kwh": 1.0, "peak_heating_kw": 1.0}, None, "dev-1", "stand_in"),
                   "B": Prediction("ok", {"heating_energy_kwh": 9.0, "peak_heating_kw": 9.0}, None, "dev-1", "stand_in")})
    r = screen_candidates(cands, table, PLAIN)
    assert r.to_rc == ("A", "B") and {x.route for x in r.records} == {DIRECT_DEV_ONLY} and not r.ml_used and not r.development_only
    allowed = screen_candidates(cands, table, replace(PLAIN, allow_development_predictions=True))
    assert allowed.to_rc == ("A",) and allowed.discarded == ("B",) and allowed.development_only and allowed.ml_used


def test_a_predictor_that_breaks_the_interface_is_refused():
    class Short:
        def predict(self, candidates):
            return [ok(heating_energy_kwh=1.0, peak_heating_kw=1.0)]

    with pytest.raises(ScreeningError) as e:
        screen_candidates([cand("a"), cand("b")], Short(), PLAIN)
    assert e.value.code == "PREDICTOR_MISMATCH"
    with pytest.raises(ScreeningError) as e2:
        screen_candidates([cand("a")], Table({"a": Prediction("maybe", None)}), PLAIN)
    assert e2.value.code == "UNKNOWN_PREDICTION_STATUS"


# ------------------------------------------------------------------ constraints
def test_candidates_rejected_by_hard_constraints_are_not_screened_or_verified():
    cands, table = pop({"A": (1, 1), "B": (2, 2), "C": (0.5, 0.5)})
    bad = ConstraintReport("C", "rev_C", (), (ConstraintFailure("mass_within_limit", "too heavy", 9, 5),))
    r = screen_candidates(cands, table, PLAIN, reports={"C": bad})
    assert r.excluded == ("C",) and r.to_rc == ("A",) and r.record("C").route == EXCLUDED and "too heavy" in r.record("C").reason
    assert table.asked == [["A", "B"]]                                               # the predictor never saw the rejected design
    assert r.record("C").recommendation_state is None


# ------------------------------------------------------------------ predictions stay separate from real results
def test_predictions_are_kept_apart_from_verified_values():
    source = Path(sc.__file__).read_text(encoding="utf-8")
    assert not re.search(r"^\s*(from|import)\s+optimization\.objectives", source, re.MULTILINE)   # cannot build an ObjectiveResult
    cands, table = pop(TWO_D)
    r = screen_candidates(cands, table, PLAIN)
    assert set(r.predictions) == set(TWO_D) and all(isinstance(v, dict) for v in r.predictions.values())
    assert not hasattr(r.records[0], "objectives") and not hasattr(r, "objectives")
    assert {x.recommendation_state for x in r.records} == {RecommendationState.SCREENED_BY_ML}


def test_model_versions_are_recorded():
    cands, table = pop(TWO_D)
    assert screen_candidates(cands, table, PLAIN).model_versions == ("m5-test",)


# ------------------------------------------------------------------ settings, inputs, determinism
@pytest.mark.parametrize("kw", [{"dimensions": ()}, {"dimensions": ("heating_energy_kwh", "heating_energy_kwh")}, {"dimensions": ("nope",)},
                                {"safety_margin": -0.1}, {"safety_margin": 1.0}, {"shortlist_size": 0}, {"min_shortlist": -1},
                                {"shortlist_size": 3, "min_shortlist": 4}])
def test_invalid_settings_are_rejected(kw):
    with pytest.raises(ScreeningError) as e:
        ScreeningSettings(**kw)
    assert e.value.code == "INVALID_SETTINGS"


def test_defaults_are_the_documented_ones():
    s = ScreeningSettings()
    assert (s.dimensions, s.safety_margin, s.shortlist_size, s.min_shortlist, s.allow_development_predictions) == \
           (DEFAULT_DIMENSIONS, 0.10, 20, 5, False)


def test_duplicate_design_ids_are_refused():
    with pytest.raises(ScreeningError) as e:
        screen_candidates([cand("a"), cand("a")], NoModel())
    assert e.value.code == "DUPLICATE_DESIGN"


def test_empty_input():
    r = screen_candidates([], NoModel())
    assert r.records == () and r.to_rc == () and not r.ml_used and r.summary()["candidates"] == 0


def test_the_input_order_does_not_change_who_is_screened_in():
    cands, table = pop(TWO_D)
    base = screen_candidates(cands, table, PLAIN)
    shuffled = list(cands)
    random.Random(4).shuffle(shuffled)
    other = screen_candidates(shuffled, table, PLAIN)
    assert set(base.to_rc) == set(other.to_rc) and set(base.discarded) == set(other.discarded)
    assert [r.design_id for r in other.records] == [c.building.design_id for c in shuffled]     # records follow the input order
    assert screen_candidates(cands, table, PLAIN) == base


def test_to_dict_is_json():
    cands, table = pop(TWO_D)
    d = screen_candidates(cands, table, PLAIN).to_dict()
    json.dumps(d)
    assert d["ml_used"] and d["summary"]["send_to_rc"] == 4 and d["records"][0]["recommendation_state"] == "SCREENED_BY_ML"


def test_a_few_hundred_candidates_are_screened_quickly():
    rng = np.random.default_rng(1)
    points = {f"d{i:03d}": (float(rng.uniform()), float(rng.uniform())) for i in range(400)}
    cands, table = pop(points)
    started = time.perf_counter()
    r = screen_candidates(cands, table, ScreeningSettings(dimensions=HP))
    assert time.perf_counter() - started < 5.0 and len(r.to_rc) <= 20
