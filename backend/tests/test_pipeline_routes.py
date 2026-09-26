"""
backend/tests/test_pipeline_routes.py — the integrated /api/v1 surface (capabilities, weather, generation,
simulation, and the asynchronous optimisation job).
"""

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import settings
from backend.main import app

client = TestClient(app)
FIX = Path(__file__).resolve().parents[2] / "packages" / "packages" / "contracts" / "fixtures" / "valid"
WINDOW = {"window_start": "2026-01-01T00:00:00+05:30", "window_end": "2026-01-03T00:00:00+05:30"}


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


def wait(opt_id, seconds=180):
    for _ in range(seconds):
        s = client.get(f"/api/v1/optimizations/{opt_id}").json()
        if s["status"] in ("completed", "failed"):
            return s
        time.sleep(1)
    raise AssertionError("optimization did not finish")


def test_capabilities_report_real_module_status():
    c = client.get("/api/v1/capabilities").json()
    assert c["schema_versions"] == ["4.0"] and c["auth_mode"] == "disabled"
    assert c["modules"]["m4_engine"]["name"] == "cocoon_multizone_rc"
    assert "leh" in c["modules"]["m3_weather_sites"] and c["modules"]["m2_design_generator"] is True


def test_materials_lists_the_snapshots():
    m = client.get("/api/v1/materials").json()
    ids = {s["snapshot_id"] for s in m["snapshots"]}
    assert {"mat_snap_himalayan_v1", "mat_snap_himalayan_v2"} <= ids and m["default"] == "mat_snap_himalayan_v1"


def test_weather_snapshot_create_and_list():
    r = client.post("/api/v1/weather-snapshots", json={"site": "leh", "start": "2026-01-01T00:00:00", "end": "2026-01-08T00:00:00"})
    assert r.status_code == 201 and r.json()["hours"] == 168 and r.json()["is_cached"] is True
    assert r.json()["snapshot_id"] in client.get("/api/v1/weather-snapshots").json()["snapshots"]
    bad = client.post("/api/v1/weather-snapshots", json={"site": "atlantis", "start": "2026-01-01T00:00:00", "end": "2026-01-02T00:00:00"})
    assert bad.status_code == 422 and bad.json()["error"]["details"]["weather_code"] == "WEATHER_SITE_UNKNOWN"


def test_generate_designs_returns_valid_building_models():
    r = client.post("/api/v1/generate-designs", json={"requirements": requirements(), "count": 3, "seed": 42})
    assert r.status_code == 200
    body = r.json()
    assert body["generated"] == 3 and body["candidates"][0]["building"]["schema_version"] == "4.0"
    again = client.post("/api/v1/generate-designs", json={"requirements": requirements(), "count": 3, "seed": 42}).json()
    assert [c["design_id"] for c in body["candidates"]] == [c["design_id"] for c in again["candidates"]]


def test_generate_designs_infeasible_requirements_use_the_error_envelope():
    req = requirements()
    req["constraints"]["maximum_footprint_m2"] = 5.0
    r = client.post("/api/v1/generate-designs", json={"requirements": req, "count": 2})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR" and r.json()["error"]["details"]["m2_code"] == "INFEASIBLE_REQUIREMENTS"


def _building():
    return client.post("/api/v1/generate-designs", json={"requirements": requirements(), "count": 1, "seed": 42}).json()["candidates"][0]["building"]


def test_simulation_round_trip():
    client.post("/api/v1/weather-snapshots", json={"site": "leh", "start": "2026-01-01T00:00:00", "end": "2026-01-08T00:00:00"})
    body = {"building": _building(), "weather_snapshot_id": "wx_leh_20260101T00_168h", "mode": "ideal_load_conditioned",
            "setpoint_c": 15, "air_changes_per_hour": 0.7, **WINDOW}
    r = client.post("/api/v1/simulations", json=body)
    assert r.status_code == 201, r.text
    sim = r.json()
    assert sim["engine"]["name"] == "cocoon_multizone_rc" and sim["status"] == "completed"
    assert sim["summary"]["energy_residual_max_pct"] < 1e-6 and sim["time_series"] is None
    got = client.get(f"/api/v1/simulations/{sim['simulation_id']}")
    assert got.status_code == 200 and got.json()["summary"] == sim["summary"]
    ts = client.get(f"/api/v1/simulations/{sim['simulation_id']}/timeseries").json()
    assert len(ts["points"]) == 192 and ts["timestep_seconds"] == 900
    again = client.post("/api/v1/simulations", json=body).json()
    assert again["simulation_id"] == sim["simulation_id"]                     # deterministic id over everything that matters


def test_simulation_errors_use_the_envelope():
    body = {"building": _building(), "weather_snapshot_id": "wx_nowhere_20260101T00_168h", "mode": "free_floating", **WINDOW}
    r = client.post("/api/v1/simulations", json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "MISSING_REFERENCE"
    client.post("/api/v1/weather-snapshots", json={"site": "leh", "start": "2026-01-01T00:00:00", "end": "2026-01-08T00:00:00"})
    body.update(weather_snapshot_id="wx_leh_20260101T00_168h", mode="capacity_limited_conditioned")
    assert client.post("/api/v1/simulations", json=body).status_code == 422          # needs heater_capacity_kw
    body.update(mode="free_floating", window_start="2026-01-01T00:00:00")
    assert client.post("/api/v1/simulations", json=body).status_code == 422          # naive timestamp
    assert client.get("/api/v1/simulations/sim_000000000000").status_code == 404
    assert client.get("/api/v1/simulations/../x").status_code == 404


def test_optimization_runs_in_the_background_and_exposes_its_results():
    r = client.post("/api/v1/optimizations", json={"requirements": requirements(), "count": 3, "seed": 42})
    assert r.status_code == 201
    oid = r.json()["optimization_id"]
    assert r.json()["status"] == "queued"
    s = wait(oid)
    assert s["status"] == "completed", s
    assert s["validation"]["state"] == "RC_ONLY_ANSYS_NOT_REQUESTED" and s["recommended_design_id"]
    assert s["result"]["optimization"]["development_only"] is False
    cands = client.get(f"/api/v1/optimizations/{oid}/candidates").json()
    assert len(cands["candidates"]) == 3 and cands["recommended_design_id"] == s["recommended_design_id"]
    par = client.get(f"/api/v1/optimizations/{oid}/pareto").json()
    assert par["pareto"]["front"] and "best_overall" in par["picks"]["picks"]
    b = client.get(f"/api/v1/optimizations/{oid}/designs/{s['recommended_design_id']}")
    assert b.status_code == 200 and b.json()["design_id"] == s["recommended_design_id"]
    assert client.get(f"/api/v1/optimizations/{oid}/designs/des_nope").status_code == 404
    assert client.get(f"/api/v1/optimizations/{oid}/designs/..%2Fresult").status_code == 404


def test_unfinished_and_unknown_optimizations():
    assert client.get("/api/v1/optimizations/opt_000000000000").status_code == 404
    assert client.get("/api/v1/optimizations/not-an-id").status_code == 404
    d = settings.PIPELINE_RUNS_DIR / "opt_aaaaaaaaaaaa"
    d.mkdir()
    (d / "status.json").write_text(json.dumps({"status": "running", "optimization_id": "opt_aaaaaaaaaaaa"}), encoding="utf-8")
    s = client.get("/api/v1/optimizations/opt_aaaaaaaaaaaa").json()          # nothing is running it: a restart happened
    assert s["status"] == "failed" and "restart" in s["error"]["message"] and s["error"]["retryable"] is True
    r = client.get("/api/v1/optimizations/opt_aaaaaaaaaaaa/pareto")
    assert r.status_code == 409 and r.json()["error"]["details"]["status"] == "failed"


def test_optimization_idempotency_key():
    h = {"Idempotency-Key": "k1"}
    body = {"requirements": requirements(), "count": 2, "seed": 3}
    first = client.post("/api/v1/optimizations", json=body, headers=h)
    again = client.post("/api/v1/optimizations", json=body, headers=h)
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["optimization_id"] == first.json()["optimization_id"] and again.json()["replayed"] is True
    assert client.post("/api/v1/optimizations", json={**body, "seed": 4}, headers=h).status_code == 409
    wait(first.json()["optimization_id"])


def test_a_failing_optimization_is_recorded_not_lost():
    req = requirements()
    req["site"]["analysis_start"], req["site"]["analysis_end"] = "2035-01-01T00:00:00+05:30", "2035-01-08T00:00:00+05:30"
    oid = client.post("/api/v1/optimizations", json={"requirements": req, "count": 2}).json()["optimization_id"]
    s = wait(oid)
    assert s["status"] == "failed" and s["error"]["code"] == "VALIDATION_ERROR" and "WEATHER_WINDOW_EMPTY" in json.dumps(s["error"])


def test_request_validation():
    assert client.post("/api/v1/optimizations", json={"requirements": requirements(), "count": 0}).status_code == 422
    assert client.post("/api/v1/optimizations", json={"count": 3}).status_code == 422
    assert client.post("/api/v1/generate-designs", json={"requirements": requirements(), "count": 100000}).status_code == 422
