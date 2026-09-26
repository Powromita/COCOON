"""
ml/tests/test_surrogate.py -- the M5 adapter (ml/surrogate.py) on a small
batch of known in-distribution candidates (dataset rows from the held-out
test weather periods, which the shipped models never saw) and hand-made
out-of-distribution ones.
"""

import copy
import sys
from pathlib import Path

import pandas as pd
import pytest

ML = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML))
import m5_build_support as bs                               # noqa: E402
import m5_features as mf                                    # noqa: E402
import m5_train_baselines as tb                              # noqa: E402
import surrogate as sg                                       # noqa: E402

N_KNOWN = 12


@pytest.fixture(scope="module")
def known():
    """(Candidate, dataset row) for rows in the held-out test periods."""
    df = tb.load()
    _, _, te = tb.split_indices(df)
    F = pd.read_csv(tb.DATA / "features.csv.gz").set_index("row_index")
    site_xy = F.groupby("site")[["latitude_deg", "elevation_m"]].first()
    rows = bs.load_rows()
    picks = df["row_index"].iloc[te].sample(N_KNOWN, random_state=1).tolist()
    out = []
    for ri in picks:
        r = rows[ri]
        p = r["params"]
        w = bs.cached_site_weather(p["site"], p["window_start"], *site_xy.loc[p["site"]])
        c = sg.Candidate(copy.deepcopy(r["building"]), w, p["setpoint_c"],
                         r["extras"]["air_changes_per_hour"], candidate_id=f"row{ri}")
        out.append((c, F.loc[ri]))
    return out


def _variant(c, **kw):
    return sg.Candidate(copy.deepcopy(c.building), copy.deepcopy(c.weather),
                        kw.get("setpoint_c", c.setpoint_c),
                        kw.get("air_changes_per_hour", c.air_changes_per_hour),
                        candidate_id=kw.get("candidate_id", c.candidate_id))


def test_in_distribution_candidates_are_predicted(known):
    res = sg.predict([c for c, _ in known])
    inside, n = 0, 0
    for (c, row), r in zip(known, res):
        assert r["ml_status"] == sg.STATUS_OK and not r["route_to_m4"] and not r["ood_reasons"]
        assert set(r["predictions"]) == set(sg.AVAILABLE_TARGETS)
        for t, p in r["predictions"].items():
            assert p["lower"] <= p["value"] <= p["upper"]
            assert p["nominal_coverage"] == 0.8
            inside += p["lower"] <= row[t] <= p["upper"]
            n += 1
    assert inside / n >= 0.6, f"only {inside}/{n} labels inside the 80 % intervals"


def test_features_match_the_training_table(known):
    a = sg._assets()
    for c, row in known:
        got = mf.extract(c.building, c.weather, a["catalogue"], c.setpoint_c, c.air_changes_per_hour)
        for k in mf.FEATURE_NAMES:
            assert got[k] == pytest.approx(row[k], rel=2e-3, abs=1e-6), k


def test_accepts_pydantic_contract_objects(known):
    sys.path.insert(0, str(tb.REPO / "packages" / "packages" / "contracts" / "python"))
    contracts = pytest.importorskip("cocoon_contracts")
    c, _ = known[0]
    cobj = sg.Candidate(contracts.BuildingModel.model_validate(c.building),
                        contracts.WeatherSnapshot.model_validate(c.weather),
                        c.setpoint_c, c.air_changes_per_hour)
    a, b = sg.predict([cobj])[0], sg.predict([c])[0]
    assert a["ml_status"] == sg.STATUS_OK
    assert a["predictions"] == b["predictions"]


def _ood_cases(c):
    cases = {}

    v = _variant(c, candidate_id="heated_airlock")          # unseen layout category
    for f in v.building["floors"]:
        for z in f["zones"]:
            z["hvac_id"] = z.get("hvac_id") or "heater_extra"
    cases[v.candidate_id] = (v, "layout")

    v = _variant(c, candidate_id="unknown_material")
    next(iter(v.building["assemblies"].values()))["layers"][0]["material_id"] = "mat_unobtainium"
    cases[v.candidate_id] = (v, "materials not in training catalogue")

    cases["hot_setpoint"] = (_variant(c, setpoint_c=30.0, candidate_id="hot_setpoint"), "setpoint_c")

    v = _variant(c, candidate_id="short_weather")
    v.weather["hourly_data"] = v.weather["hourly_data"][:48]
    cases[v.candidate_id] = (v, "hourly points")

    v = _variant(c, candidate_id="too_high")
    v.weather["source"]["elevation_m"] = 6000.0
    cases[v.candidate_id] = (v, "elevation_m")

    v = _variant(c, candidate_id="heatwave")
    for p in v.weather["hourly_data"]:
        p["outdoor_dry_bulb_temperature_c"] += 25.0
    cases[v.candidate_id] = (v, "t_mean_c")
    return cases


def test_out_of_distribution_candidates_are_refused(known):
    base = next(c for c, _ in known if "airlock" in mf.layout_signature(c.building))
    cases = _ood_cases(base)
    res = sg.predict([v for v, _ in cases.values()])
    for (cid, (_, why)), r in zip(cases.items(), res):
        assert r["candidate_id"] == cid
        assert r["ml_status"] == sg.STATUS_OOD, cid
        assert r["route_to_m4"] is True
        assert r["predictions"] is None                       # no value, no confidence
        assert any(why in reason for reason in r["ood_reasons"]), (cid, r["ood_reasons"])


def test_mixed_batch_never_runs_the_model_on_ood(known, monkeypatch):
    a = sg._assets()
    seen = []

    class Spy:
        def __init__(self, m):
            self.m = m

        def predict(self, X):
            seen.append(len(X))
            return self.m.predict(X)

    monkeypatch.setitem(a, "models", {t: Spy(m) for t, m in a["models"].items()})
    good = [c for c, _ in known[:3]]
    bad = [_variant(good[0], setpoint_c=40.0, candidate_id="bad1"),
           _variant(good[1], air_changes_per_hour=9.0, candidate_id="bad2")]
    batch = [good[0], bad[0], good[1], bad[1], good[2]]
    res = sg.predict(batch)
    assert [r["ml_status"] for r in res] == ["ok", "out_of_distribution", "ok",
                                             "out_of_distribution", "ok"]
    assert seen == [3] * len(sg.AVAILABLE_TARGETS)            # only the 3 good rows


def test_unavailable_targets_are_always_declared(known):
    res = sg.predict([known[0][0], _variant(known[0][0], setpoint_c=35.0)])
    for r in res:
        assert set(r["unavailable_targets"]) == {
            "max_occupied_zone_temperature_c", "mean_occupied_zone_temperature_c",
            "comfort_hours", "max_zone_imbalance_k"}
    assert not set(sg.UNAVAILABLE_TARGETS) & set(res[0]["predictions"])


def test_empty_batch():
    assert sg.predict([]) == []


def test_held_out_rows_are_mostly_inside_the_numeric_ranges():
    """A held-out row can sit just past a training range edge (and is then
    correctly refused); that should stay rare."""
    df = tb.load()
    _, _, te = tb.split_indices(df)
    a = sg._assets()
    X = df.iloc[te][mf.FEATURE_NAMES]
    out = sum(bool(sg._range_reasons(dict(zip(mf.FEATURE_NAMES, x)), a["ranges"]))
              for x in X.to_numpy())
    assert out / len(X) < 0.05, f"{out}/{len(X)} held-out rows fall outside the numeric ranges"
