"""
backend/tests/test_design_routes.py — template catalogue, compatibility, template-aware generation jobs, stages,
provenance, categorised failures and safe retries.
"""

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import settings
from backend.main import app
from design_generator.catalog import catalog_version
from design_generator.template_catalog import TEMPLATE_DIR

client = TestClient(app)
FIX = Path(__file__).resolve().parents[2] / "packages" / "packages" / "contracts" / "fixtures" / "valid"


@pytest.fixture(autouse=True)
def _isolated(tmp_path, monkeypatch):
    for name in ("PIPELINE_RUNS_DIR", "SIMULATIONS_DIR"):
        d = tmp_path / name
        d.mkdir()
        monkeypatch.setattr(settings, name, d)
    monkeypatch.setattr("backend.routes.pipeline.WeatherStore", lambda: __import__("m3_data").WeatherStore(
        snapshot_dir=tmp_path / "wx"))


def requirements() -> dict:
    return json.loads((FIX / "requirements_ladakh_30p.json").read_text(encoding="utf-8"))


def wait(opt_id, seconds=240):
    for _ in range(seconds):
        s = client.get(f"/api/v1/optimizations/{opt_id}").json()
        if s["status"] in ("completed", "failed"):
            return s
        time.sleep(1)
    raise AssertionError("optimization did not finish")


# ----- catalogue ---------------------------------------------------------------------------------------------------
def test_templates_come_from_the_m2_template_files():
    cat = client.get("/api/v1/templates").json()
    assert cat["catalog_version"] == catalog_version()
    assert [t["id"] for t in cat["templates"]] == sorted(p.stem for p in TEMPLATE_DIR.glob("*.json"))
    assert set(cat["materials"]) == {"mat_snap_himalayan_v1", "mat_snap_himalayan_v2"}
    v2 = {m["id"]: m["role"] for m in cat["materials"]["mat_snap_himalayan_v2"]}
    assert v2["mat_adobe"] is None and v2["mat_plywood"] == "structural"     # categories M2 cannot build with
    one = client.get("/api/v1/templates/two_floor_compact").json()
    assert one["floor_count"] == 2 and one["version"].startswith("tpl_")


def test_unknown_template_is_a_categorised_404():
    r = client.get("/api/v1/templates/nope")
    assert r.status_code == 404 and r.json()["error"]["details"] == {"category": "invalid_input", "field": "template_id"}
    assert r.json()["error"]["trace_id"]


# ----- compatibility -----------------------------------------------------------------------------------------------
def test_compatibility_for_complete_and_partial_requirements():
    r = client.post("/api/v1/design-compatibility", json={"requirements": requirements()}).json()
    assert r["ok"] and r["compatible_template_ids"] == ["two_floor_compact"] and r["preliminary"] is True
    partial = client.post("/api/v1/design-compatibility", json={"requirements": {
        "mission": {"type": "living", "occupants": 4, "required_rooms": ["living", "sleeping"]},
        "constraints": {"maximum_floors": 1, "maximum_footprint_m2": 40}}}).json()
    assert not partial["ok"] and partial["input_errors"]               # site etc. still missing ...
    assert "living_sleeping_storage" in partial["compatible_template_ids"]   # ... but the rooms already fit


def test_compatibility_rejects_bad_arrangement_values():
    r = client.post("/api/v1/design-compatibility", json={"requirements": requirements(),
                                                          "room_arrangement": {"sleeping": "maybe"}})
    assert r.status_code == 422


# ----- generation refuses before any work ---------------------------------------------------------------------------
def test_generate_designs_refuses_incompatible_requirements_with_a_category():
    req = requirements()
    req["constraints"]["maximum_floors"] = 1
    r = client.post("/api/v1/generate-designs", json={"requirements": req, "count": 2})
    err = r.json()["error"]
    assert r.status_code == 422 and err["details"]["category"] == "physical_infeasibility"
    assert err["details"]["m2_code"] == "INFEASIBLE_REQUIREMENTS" and err["details"]["field"] == "constraints.maximum_footprint_m2"
    assert err["details"]["compatibility"]["alternatives"]


def test_generate_designs_with_a_pinned_template_records_provenance():
    req = requirements()
    req["mission"].update(required_rooms=["living", "sleeping"], occupants=4)
    req["constraints"].update(maximum_floors=1, maximum_mass_kg=None)
    r = client.post("/api/v1/generate-designs", json={"requirements": req, "count": 3, "template_id": "single_room"}).json()
    assert r["template_ids"] == ["single_room"] and r["generated"] == 3 and r["outcome"] == "OK"
    for p in r["provenance"]:
        assert p["template_id"] == "single_room" and p["catalog_version"] == r["catalog_version"]
        assert p["template_version"].startswith("tpl_") and p["m2_validation"]["ok"] is True
        assert p["parameters"]["layout_seed"] is not None


def test_no_feasible_candidates_is_reported_with_the_rejection_tally():
    req = requirements()
    req["constraints"]["maximum_mass_kg"] = 1.0
    r = client.post("/api/v1/generate-designs", json={"requirements": req, "count": 1}).json()
    assert r["outcome"] == "NO_FEASIBLE_CANDIDATES" and r["generated"] == 0
    assert r["rejection_reasons"].get("constraints:envelope_mass_within_limit", 0) > 0


def test_optimization_refuses_a_template_that_does_not_fit_and_queues_nothing():
    r = client.post("/api/v1/optimizations", json={"requirements": requirements(), "count": 2, "template_id": "medical_post"})
    assert r.status_code == 422 and r.json()["error"]["details"]["category"] == "no_compatible_template"
    assert not [d for d in settings.PIPELINE_RUNS_DIR.iterdir() if d.name.startswith("opt_")]


# ----- the job: stages, provenance, failures, retry ------------------------------------------------------------------
def test_optimization_job_reports_real_stages_and_provenance():
    r = client.post("/api/v1/optimizations", json={"requirements": requirements(), "count": 3, "seed": 42})
    assert r.status_code == 201 and r.json()["template_ids"] == ["two_floor_compact"]
    oid = r.json()["optimization_id"]
    s = wait(oid)
    assert s["status"] == "completed" and s["phase"] in ("completed", "partially_completed")
    assert s["template_catalog_version"] == catalog_version() and s["template_selection"] == "automatic"
    stages = {st["id"]: st["status"] for st in s["stages"]}
    assert stages["compatibility"] == stages["weather"] == stages["generation"] == "completed"
    assert stages["simulation"] == stages["economics"] == stages["optimization"] == "completed"
    assert stages["ansys"] == "not_requested"
    d = settings.PIPELINE_RUNS_DIR / oid
    assert json.loads((d / "compatibility.json").read_text())["ok"] is True
    cands = client.get(f"/api/v1/optimizations/{oid}/candidates").json()
    assert cands["generation"]["generated"] == len(cands["candidates"])
    for c in cands["candidates"]:
        assert c["provenance"]["template_id"] == "two_floor_compact" and c["provenance"]["revision_id"] == c["revision_id"]


def test_failed_job_marks_the_stage_and_categorises_user_fixable_errors():
    req = requirements()
    req["site"]["analysis_start"], req["site"]["analysis_end"] = "2035-01-01T00:00:00+05:30", "2035-01-08T00:00:00+05:30"
    oid = client.post("/api/v1/optimizations", json={"requirements": req, "count": 2}).json()["optimization_id"]
    s = wait(oid)
    assert s["status"] == "failed" and s["phase"] == "failed"
    assert s["error"]["details"]["category"] == "invalid_input" and s["error"]["details"]["field"] == "site.analysis_start"
    stages = {st["id"]: st["status"] for st in s["stages"]}
    assert stages["weather"] == "failed" and stages["generation"] == "skipped"
    # a requirement problem is not retried blindly
    r = client.post(f"/api/v1/optimizations/{oid}/retry")
    assert r.status_code == 409 and r.json()["error"]["details"]["category"] == "invalid_input"


def _interrupted_job(oid: str) -> Path:
    d = settings.PIPELINE_RUNS_DIR / oid
    d.mkdir()
    body = {"requirements": requirements(), "count": 2, "seed": 5}
    (d / "request.json").write_text(json.dumps(body), encoding="utf-8")
    (d / "status.json").write_text(json.dumps({"status": "running", "optimization_id": oid,
                                               "started_at": "2026-01-01T00:00:00+00:00"}), encoding="utf-8")
    return d


def test_interrupted_job_is_temporary_and_retries_exactly_once():
    oid = "opt_bbbbbbbbbbbb"
    _interrupted_job(oid)
    s = client.get(f"/api/v1/optimizations/{oid}").json()
    assert s["status"] == "failed" and s["error"]["details"]["category"] == "temporary_failure" and s["error"]["retryable"]
    first = client.post(f"/api/v1/optimizations/{oid}/retry")
    again = client.post(f"/api/v1/optimizations/{oid}/retry")
    assert first.status_code == 201 and again.status_code == 200 and again.json()["replayed"] is True
    new_id = first.json()["optimization_id"]
    assert again.json()["optimization_id"] == new_id
    s2 = wait(new_id)
    assert s2["retry_of"] == oid and s2["status"] == "completed"


def test_only_failed_jobs_can_be_retried():
    assert client.post("/api/v1/optimizations/opt_000000000000/retry").status_code == 404
    oid = client.post("/api/v1/optimizations", json={"requirements": requirements(), "count": 2}).json()["optimization_id"]
    wait(oid)
    assert client.post(f"/api/v1/optimizations/{oid}/retry").status_code == 409


def test_retry_does_not_resubmit_ansys_when_a_solve_may_already_exist(monkeypatch, tmp_path):
    from backend.routes import pipeline
    oid = "opt_cccccccccccc"
    d = _interrupted_job(oid)
    body = json.loads((d / "request.json").read_text())
    (d / "request.json").write_text(json.dumps({**body, "validate_with_ansys": True}), encoding="utf-8")
    ansys_dir = tmp_path / "ansys"
    (ansys_dir / "jobs" / "ans_x").mkdir(parents=True)
    (ansys_dir / "jobs" / "ans_x" / "request.json").write_text(json.dumps({"submitted_at": "2026-01-01T00:00:01+00:00"}))
    monkeypatch.setattr(settings, "ANSYS_PIPELINE_DIR", ansys_dir)
    queued = []
    monkeypatch.setattr(pipeline, "_queue", lambda body, compat, retry_of=None: queued.append(body) or "opt_dddddddddddd")
    r = client.post(f"/api/v1/optimizations/{oid}/retry").json()
    assert queued[0].validate_with_ansys is False and r["notes"]


def test_unexpected_errors_hide_technical_detail():
    from backend.routes.errors import GENERIC_MESSAGE, classify_job_error
    err = {"code": "VALIDATION_ERROR", "message": "KeyError: 'C:\\\\secret\\\\path'", "trace_id": "t1",
           "details": {"m6_code": "KeyError", "exception": "KeyError"}}
    out = classify_job_error(err, ["compatibility", "weather"])
    assert out["message"] == GENERIC_MESSAGE and "secret" not in json.dumps(out) and out["trace_id"] == "t1"
    later = classify_job_error(err, ["compatibility", "weather", "generation"])
    assert later["details"]["category"] == "downstream_failure" and "secret" not in json.dumps(later)
