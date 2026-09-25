"""
backend/tests/test_ansys_routes.py — Module M8 HTTP integration surface.

The solve-to-COMPLETED path needs a real ANSYS Student install and is
slow (~1-2 min even at the smallest mesh), so it is skipped automatically
when ansys-mapdl-core can't launch MAPDL. Everything else (submission
validation, path-traversal safety, 404s, the honest NOT_REQUESTED state)
runs anywhere and needs no ANSYS.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import settings
from backend.main import app

client = TestClient(app)


def _ansys_available():
    try:
        from ansys.mapdl.core import launch_mapdl  # noqa: F401
        return Path(
            __import__("os").environ.get(
                "ANSYS_EXECUTABLE_PATH",
                r"C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe")
        ).exists()
    except ImportError:
        return False


def test_health_reports_ansys_capability():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert "ansys" in body
    assert body["ansys"]["max_ansys_workers"] >= 1
    assert isinstance(body["ansys"]["available"], bool)


def test_api_survives_when_the_ansys_stack_cannot_import(monkeypatch):
    """An upstream import failure must degrade ONLY the ANSYS endpoints (503
    with the real reason, /api/health reports it) - never take the API down."""
    import backend.routes.ansys as ansys_route
    monkeypatch.setattr(ansys_route, "IMPORT_ERROR", "ImportError: simulated upstream break")

    health = client.get("/api/health").json()
    assert health["ok"] is True
    assert health["ansys"]["available"] is False
    assert "simulated upstream break" in health["ansys"]["unavailable_reason"]

    r = client.post("/api/ansys/jobs", json={"case": "case_03_airlock_living"})
    assert r.status_code == 503
    assert r.json()["detail"]["status"] == "UNAVAILABLE"
    assert "simulated upstream break" in r.json()["detail"]["error_reason"]
    assert client.get("/api/ansys/revisions/rev_x/latest").status_code == 503
    assert client.get("/api/ansys/jobs").status_code == 503

    # things that never needed the M8 stack keep working, and unknown ids are still 404
    assert client.get("/api/ansys/cases").status_code == 200
    assert client.get("/api/ansys/jobs/not-a-real-job").status_code == 404


def test_list_cases_includes_evidence_fixtures():
    r = client.get("/api/ansys/cases")
    assert r.status_code == 200
    cases = r.json()["cases"]
    assert "case_03_airlock_living" in cases
    assert cases["case_03_airlock_living"] == "/api/ansys/cases/case_03_airlock_living"


def test_get_case_returns_a_valid_building_model():
    r = client.get("/api/ansys/cases/case_03_airlock_living")
    assert r.status_code == 200
    body = r.json()
    assert body["schema_version"] == "4.0"
    assert body["design_id"].startswith("des_")


def test_case_path_traversal_blocked():
    r = client.get("/api/ansys/cases/..%2F..%2F..%2Fetc%2Fpasswd")
    assert r.status_code == 404
    r = client.get("/api/ansys/cases/unknown_case_xyz")
    assert r.status_code == 404


def test_submit_requires_case_or_building():
    r = client.post("/api/ansys/jobs", json={})
    assert r.status_code == 422


def test_submit_rejects_invalid_case_name():
    r = client.post("/api/ansys/jobs", json={"case": "../../etc/passwd"})
    assert r.status_code == 422


def test_submit_rejects_malformed_building():
    r = client.post("/api/ansys/jobs", json={"building": {"not": "a building model"}})
    assert r.status_code == 422


def test_unknown_job_is_404():
    assert client.get("/api/ansys/jobs/not-a-real-job").status_code == 404
    assert client.get("/api/ansys/jobs/not-a-real-job/artifacts").status_code == 404
    assert client.post("/api/ansys/jobs/not-a-real-job/cancel").status_code == 404


def test_job_artifact_path_traversal_blocked(tmp_path, monkeypatch):
    """A job_id that resolves outside ANSYS_JOBS_DIR must never be served."""
    r = client.get("/api/ansys/jobs/..%2F..%2F..%2Fwindows%2Fwin.ini")
    assert r.status_code == 404


def test_unknown_revision_is_not_requested_never_a_benchmark():
    r = client.get("/api/ansys/revisions/rev_totally_made_up/latest")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "NOT_REQUESTED"
    assert "mae_c" not in body and "MAE" not in str(body)


@pytest.mark.skipif(not _ansys_available(), reason="no local ANSYS/MAPDL install")
def test_submit_and_run_to_completion(tmp_path, monkeypatch):
    # backend.routes.ansys does `from .. import settings` (the module object),
    # so patching the attribute here is visible to every settings.ANSYS_JOBS_DIR
    # lookup the route makes.
    monkeypatch.setattr(settings, "ANSYS_JOBS_DIR", tmp_path)

    r = client.post("/api/ansys/jobs", json={
        "case": "case_01_baseline_single", "hours": 3,
        "element_size_m": 0.4, "timeout_seconds": 120})
    assert r.status_code == 201
    job_id = r.json()["job_id"]

    import time
    status = None
    for _ in range(90):
        st = client.get(f"/api/ansys/jobs/{job_id}").json()
        status = st["status"]
        if status in ("COMPLETED", "FAILED", "UNAVAILABLE", "TIMED_OUT"):
            break
        time.sleep(2)
    assert status == "COMPLETED", status

    arts = client.get(f"/api/ansys/jobs/{job_id}/artifacts").json()["artifacts"]
    assert "temperature_series_csv" in arts
    body = client.get(arts["temperature_series_csv"]).content
    assert len(body) > 0
