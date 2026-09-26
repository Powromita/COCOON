"""
cocoon_pipeline against the REAL M2, M3, M4, M6 and M7 (no stand-ins). Small counts keep it fast.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from cocoon_contracts import RequirementsContract
from m3_data import WeatherError, WeatherStore

from cocoon_pipeline import PipelineConfig, run_pipeline
from cocoon_pipeline import ansys_hook
from cocoon_pipeline.__main__ import main as cli_main

FIX = Path(__file__).resolve().parents[2] / "packages" / "packages" / "contracts" / "fixtures" / "valid"


def requirements() -> dict:
    return json.loads((FIX / "requirements_ladakh_30p.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def store(tmp_path_factory):
    return WeatherStore(snapshot_dir=tmp_path_factory.mktemp("wx"))


@pytest.fixture(scope="module")
def run(store, tmp_path_factory):
    runs = tmp_path_factory.mktemp("runs")
    cfg = PipelineConfig(seed=42, count=6, persist=True, run_id="opt_000000000001", runs_dir=runs, weather_store=store)
    return run_pipeline(requirements(), cfg), runs / "opt_000000000001"


def test_end_to_end_uses_the_real_engine_and_recommends_a_design(run):
    res, d = run
    opt = res.optimization
    assert opt.development_only is False
    assert opt.engine["name"] == "cocoon_multizone_rc"
    assert res.recommended_design_id and res.recommended_design_id == opt.recommended.design_id
    assert res.recommended_design_id in {c.building.design_id for c in opt.candidates}
    assert res.validation["state"] == "RC_ONLY_ANSYS_NOT_REQUESTED"
    assert res.weather_snapshot_id == "wx_leh_20260101T00_168h"
    assert res.site_used["site"] == "leh" and res.site_used["chosen"] == "nearest_cached_site" and res.site_used["is_cached"] is True


def test_persisted_files_are_what_the_backend_reads(run):
    res, d = run
    doc = json.loads((d / "result.json").read_text(encoding="utf-8"))
    assert doc["recommended_design_id"] == res.recommended_design_id
    assert doc["validation"]["state"] == "RC_ONLY_ANSYS_NOT_REQUESTED"
    assert {"outcomes", "pareto", "picks", "summary"} <= set(doc["optimization"])
    for c in res.optimization.candidates:
        assert (d / "candidates" / f"{c.building.design_id}.building.json").is_file()
    assert not (d / "status.json").exists()                          # owned by the backend
    assert not list(d.rglob("*.tmp"))


def test_final_report_has_every_section_and_real_economics(run):
    res, d = run
    r = res.final_report
    assert {"provenance", "input", "recommendation", "design", "performance", "economics", "picks", "alternatives", "reliability",
            "validation", "warnings", "placeholders", "notice"} <= set(r)
    assert r["design"]["design_id"] == res.recommended_design_id and r["design"]["zones"] and r["design"]["assemblies"]
    assert r["performance"]["conditioned_with_sized_heater"]["zones"] and r["performance"]["free_floating"]["zones"]
    exp = r["economics"]["scenarios"]["expected"]
    assert exp["capex"]["total_capex_inr"] > 0 and exp["lcc_inr"] >= exp["capex"]["total_capex_inr"]
    assert set(r["economics"]["scenarios"]) == {"low", "expected", "high"} and r["economics"]["sensitivity"]
    assert r["economics"]["baseline"] is not None and exp["npv_vs_baseline_inr"] is not None       # matched uninsulated baseline
    assert r["performance"]["matched_uninsulated_baseline"]["conditioned"]["summary"]["heating_energy_kwh"] >=         r["performance"]["conditioned_with_sized_heater"]["summary"]["heating_energy_kwh"]
    assert "not a structural" in r["notice"] and r["provenance"]["code_commit"]
    for f in ("final_report.json", "REPORT.md", "recommended/timeseries_conditioned.csv", "recommended/timeseries_free_floating.csv"):
        assert (d / f).is_file(), f
    assert json.loads((d / "final_report.json").read_text(encoding="utf-8"))["design"]["design_id"] == res.recommended_design_id
    assert res.recommended_design_id in (d / "REPORT.md").read_text(encoding="utf-8")


def test_final_report_can_be_switched_off(store):
    assert run_pipeline(requirements(), PipelineConfig(count=2, weather_store=store, final_report=False)).final_report is None


def test_deterministic(store):
    a = run_pipeline(requirements(), PipelineConfig(seed=7, count=4, weather_store=store))
    b = run_pipeline(requirements(), PipelineConfig(seed=7, count=4, weather_store=store))
    assert [o.to_dict() for o in a.optimization.outcomes] == [o.to_dict() for o in b.optimization.outcomes]
    assert a.optimization.ranking.to_dict() == b.optimization.ranking.to_dict()
    assert a.recommended_design_id == b.recommended_design_id


def test_missing_weather_window_raises_and_writes_nothing(store, tmp_path):
    req = requirements()
    req["site"]["analysis_start"], req["site"]["analysis_end"] = "2035-01-01T00:00:00+05:30", "2035-01-08T00:00:00+05:30"
    cfg = PipelineConfig(count=2, persist=True, run_id="opt_000000000002", runs_dir=tmp_path, weather_store=store)
    with pytest.raises(WeatherError) as e:
        run_pipeline(req, cfg)
    assert e.value.code == "WEATHER_WINDOW_EMPTY"
    assert not (tmp_path / "opt_000000000002").exists()


def test_unknown_site_is_refused_not_replaced(store):
    with pytest.raises(WeatherError) as e:
        run_pipeline(requirements(), PipelineConfig(count=2, site="atlantis", weather_store=store))
    assert e.value.code == "WEATHER_SITE_UNKNOWN"


def test_accepts_a_requirements_contract_object(store):
    res = run_pipeline(RequirementsContract.model_validate(requirements()), PipelineConfig(count=2, weather_store=store))
    assert res.optimization.summary()["generated"] == 2


def test_config_rejects_bad_choices(tmp_path):
    with pytest.raises(ValueError):
        PipelineConfig(ansys="maybe")
    with pytest.raises(ValueError):
        PipelineConfig(count=0)
    with pytest.raises(ValueError):
        PipelineConfig(persist=True)


def test_importing_the_package_does_not_import_ansys():
    code = ("import sys, cocoon_pipeline; "
            "bad = [m for m in sys.modules if m.startswith(('cocoon_ansys', 'ansys'))]; "
            "sys.exit(1 if bad else 0)")
    proc = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr


def test_ansys_submit_reports_unavailable_with_the_reason(monkeypatch, store):
    monkeypatch.setattr(ansys_hook, "submit", lambda *a, **k: {"state": ansys_hook.STATE_UNAVAILABLE, "job_id": None,
                                                                "reason": "ImportError: no ansys"})
    res = run_pipeline(requirements(), PipelineConfig(count=2, ansys="submit", weather_store=store))
    assert res.validation["state"] == "RC_ONLY_ANSYS_UNAVAILABLE" and res.validation["reason"] == "ImportError: no ansys"


def test_ansys_submit_without_the_worker_is_unavailable_not_faked(monkeypatch, store):
    real = ansys_hook.submit
    monkeypatch.setitem(sys.modules, "cocoon_ansys", None)           # makes `import cocoon_ansys...` raise ImportError
    monkeypatch.setitem(sys.modules, "cocoon_ansys.validation_package", None)
    res = run_pipeline(requirements(), PipelineConfig(count=2, ansys="submit", weather_store=store))
    assert real is ansys_hook.submit
    assert res.validation["state"] == "RC_ONLY_ANSYS_UNAVAILABLE" and res.validation["reason"] and res.validation["job_id"] is None


def test_cli_prints_the_named_picks(capsys, tmp_path):
    rc = cli_main(["--requirements", str(FIX / "requirements_ladakh_30p.json"), "--count", "3", "--out", str(tmp_path / "opt_000000000003")])
    out = capsys.readouterr().out
    assert rc == 0 and "best_overall" in out and "lowest_capex" in out and "timings_s:" in out
    assert (tmp_path / "opt_000000000003" / "result.json").is_file()


def test_cli_rejects_infeasible_requirements_with_an_envelope(capsys, tmp_path):
    req = requirements()
    req["constraints"]["maximum_footprint_m2"] = 5.0
    p = tmp_path / "req.json"
    p.write_text(json.dumps(req), encoding="utf-8")
    assert cli_main(["--requirements", str(p), "--count", "2"]) == 2
    assert "INFEASIBLE_REQUIREMENTS" in capsys.readouterr().err


# ---- M5 screening -------------------------------------------------------------------------------------------------------
def test_ml_is_off_for_small_runs(run):
    ml = run[0].final_report["provenance"]["ml"]
    assert ml["used"] is False and "fewer than" in ml["reason"]


def test_stale_ml_model_is_refused():
    from ml.m6_predictor import M5Predictor
    v1 = Path(__file__).resolve().parents[2] / "data" / "m5_dataset_v1" / "model" / "m5_baseline_v1"
    p = M5Predictor(object(), 15.0, v1)                                   # labelled by engine 0.1.0, not the installed M4
    assert p.available is False and "retrain" in p.reason
    assert [x.status for x in p.predict([object()])] == ["model_unavailable"]


def test_ml_on_screens_but_every_finalist_is_verified_by_m4(store):
    res = run_pipeline(requirements(), PipelineConfig(count=10, seed=3, use_ml="on", weather_store=store))
    ml = res.final_report["provenance"]["ml"]
    assert ml["used"] is True and ml["model_version"]
    vc = res.optimization.verified[res.recommended_design_id]
    assert vc.status == "verified" and vc.recommendation_state.value == "VERIFIED_BY_RC"
    assert res.optimization.development_only is False


# ---- M4 vs ANSYS comparison, on an existing evidence job (no new solve) -----------------------------------------------------
def test_m4_vs_ansys_comparison_on_an_evidence_job():
    import glob
    from cocoon_pipeline.ansys_stage import compare_m4_with_ansys
    jobs = sorted(glob.glob(str(Path(__file__).resolve().parents[2] / "ansys-pipeline" / "evidence" / "case_02_insulated_single" / "ans_*")))
    if not jobs:
        pytest.skip("evidence job folder not present")
    r = compare_m4_with_ansys(Path(jobs[0]))
    assert r["compared"] and r["pooled"]["mae_c"] < 0.6 and "heating and heater control" in r["not_covered"]
