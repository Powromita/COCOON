"""
60-candidate full pipeline: M2 -> M3 -> M5 -> M4 -> M7 -> M6 -> selected revision -> M8 hand-off.

Real engine throughout. Only the M8 submit call is replaced by a recorder, so no ANSYS solve is started, and what the
recorder receives is the exact frozen package input.
"""

import json
from pathlib import Path

import pytest

from m3_data import WeatherStore, standard_snapshot

from cocoon_pipeline import PipelineConfig, ansys_hook, run_pipeline

FIX = Path(__file__).resolve().parents[2] / "packages" / "packages" / "contracts" / "fixtures" / "valid"


@pytest.fixture(scope="module")
def full(tmp_path_factory):
    store = WeatherStore(snapshot_dir=tmp_path_factory.mktemp("wx"))
    materials = standard_snapshot()
    calls = []

    def record(building, weather, mats, jobs_dir=None, wait=False):
        calls.append({"building": building, "weather": weather, "materials": mats, "wait": wait})
        return {"state": ansys_hook.STATE_QUEUED, "job_id": "ans_recorded", "design_revision_id": building.revision_id, "reason": None}

    mp = pytest.MonkeyPatch()
    mp.setattr(ansys_hook, "submit", record)
    try:
        req = json.loads((FIX / "requirements_ladakh_30p.json").read_text(encoding="utf-8"))
        cfg = PipelineConfig(seed=11, count=60, use_ml="on", weather_store=store, materials=materials,
                             ansys="submit", ansys_wait=False, ansys_designs=1, persist=False)
        res = run_pipeline(req, cfg)
    finally:
        mp.undo()
    return res, calls, materials


def test_m5_screens_the_60_candidates_and_m4_verifies_the_finalists(full):
    res, _, _ = full
    opt = res.optimization
    assert len(opt.candidates) == 60
    ml = res.final_report["provenance"]["ml"]
    assert ml["used"] is True and ml["model_version"] and ml["mode"] == "on"
    assert opt.screening.ml_used is True and opt.screening.model_versions
    assert opt.development_only is False
    vc = opt.verified[res.recommended_design_id]
    assert vc.status == "verified" and vc.recommendation_state.value == "VERIFIED_BY_RC"


def test_m7_economics_priced_the_recommended_design(full):
    res, _, _ = full
    exp = res.final_report["economics"]["scenarios"]["expected"]
    assert exp["capex"]["total_capex_inr"] > 0 and exp["lcc_inr"] >= exp["capex"]["total_capex_inr"]
    assert set(res.final_report["economics"]["scenarios"]) == {"low", "expected", "high"}


def test_m8_receives_the_exact_recommended_revision(full):
    res, calls, _ = full
    assert len(calls) == 1 and calls[0]["wait"] is False
    chosen = res.optimization.candidate(res.recommended_design_id).building
    assert calls[0]["building"] is chosen or calls[0]["building"].revision_id == chosen.revision_id
    assert calls[0]["building"].design_id == res.recommended_design_id
    assert res.final_report["design"]["revision_id"].startswith(chosen.revision_id)
    assert res.validation["design_revision_id"] == chosen.revision_id


def test_m4_and_m8_share_the_same_frozen_weather_and_material_snapshots(full):
    res, calls, materials = full
    wx = res.weather_snapshot_id
    assert wx.startswith("wx_")
    assert calls[0]["weather"].snapshot_id == wx                              # M8 package weather == the snapshot M4 ran on
    assert res.optimization.weather_snapshot_id == wx
    assert res.final_report["provenance"]["weather_snapshot_id"] == wx
    vc = res.optimization.verified[res.recommended_design_id]
    seen = {getattr(r.provenance, "weather_snapshot_id", None) for r in _rc_results(vc)}
    assert seen == {wx}, seen
    assert calls[0]["materials"] is materials                                 # the caller's frozen set, not a default re-read
    assert res.final_report["provenance"]["material_snapshot_id"] == materials.snapshot_id
    assert res.final_report["provenance"]["material_checksum_sha256"] == materials.checksum_sha256


def _rc_results(vc):
    ev = getattr(vc, "evaluation", None) or getattr(vc, "evaluations", None)
    out = []
    for name in ("free_floating", "ideal_load", "capacity_limited"):
        r = getattr(ev, name, None)
        if r is not None:
            out.append(r)
    assert out, "verified candidate exposes no M4 results"
    return out
