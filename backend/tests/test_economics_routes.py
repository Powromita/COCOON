"""
backend/tests/test_economics_routes.py — Module M7 HTTP surface (PRD §16.1, §16.5).
"""

import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import settings
from backend.main import app

client = TestClient(app)
FIX = Path(__file__).resolve().parents[2] / "packages" / "contracts" / "fixtures" / "valid"


@pytest.fixture(autouse=True)
def _isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ECONOMICS_DIR", tmp_path)


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def _body(with_baseline=True, **extra):
    b, s = _load("building_airlock_living.json"), _load("simulation_result_completed.json")
    body = {"assumption_set_id": "econ_ladakh_v1", "occupants": 20,
            "design": {"building": b, "simulation": s, "simulated_hours": 24, "target_temperature_c": 15}}
    if with_baseline:
        bb, bs = copy.deepcopy(b), copy.deepcopy(s)
        bb["revision_id"] = "rev_airlock_living_uninsulated"
        for a in bb["assemblies"].values():
            a["layers"] = [x for x in a["layers"] if x["material_id"] != "mat_puf"] or a["layers"]
        bs.update(simulation_id="sim_baseline_001", design_revision_id=bb["revision_id"])
        bs["summary"]["heating_energy_kwh"] = 80.0
        body["baseline"] = {"building": bb, "simulation": bs, "simulated_hours": 24,
                            "target_temperature_c": 15, "kind": "standard_uninsulated_template",
                            "label": "uninsulated airlock + living"}
    body.update(extra)
    return body


def test_list_assumption_sets():
    r = client.get("/api/v1/economic-assumption-sets")
    assert r.status_code == 200
    sets = {s["id"]: s for s in r.json()["assumption_sets"]}
    s = sets["econ_ladakh_v1"]
    assert s["currency"] == "INR" and s["effective_date"] and s["source"] and s["owner"]
    assert s["scenario_assumption_set_ids"]["low"] == "econ_ladakh_v1_low"


def test_get_assumption_set_and_unknown_set():
    r = client.get("/api/v1/economic-assumption-sets/econ_ladakh_v1")
    assert r.status_code == 200
    assert r.json()["assumption_set"]["fuel"]["fuel_type"] == "kerosene"
    assert set(r.json()["m0_assumption_sets"]) == {"low", "expected", "high"}
    r = client.get("/api/v1/economic-assumption-sets/econ_nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "MISSING_REFERENCE"


def test_post_then_get_round_trip():
    r = client.post("/api/v1/economics", json=_body())
    assert r.status_code == 201, r.text
    rep = r.json()
    aid = rep["analysis_id"]
    assert aid.startswith("econ_run_")
    assert set(rep["scenarios"]) == {"low", "expected", "high"}
    exp = rep["scenarios"]["expected"]
    assert exp["result"]["schema_version"] == "4.0"
    assert exp["result"]["npv_vs_baseline_inr"] is not None
    assert "2026-09-25" in exp["currency_context"]["label"]
    assert rep["provenance"]["input_hashes"]["assumption_set"] == rep["assumption_set_checksum_sha256"]

    g = client.get(f"/api/v1/economics/{aid}")
    assert g.status_code == 200
    assert g.json() == rep
    assert (settings.ECONOMICS_DIR / f"{aid}.json").is_file()


def test_get_unknown_or_malicious_analysis_id_is_404():
    for bad in ("econ_run_000000000000", "econ_run_..%5C..%5Cx", "econ_run_../../x"):
        r = client.get(f"/api/v1/economics/{bad}")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "MISSING_REFERENCE"
    # an encoded slash never even matches the route
    assert client.get("/api/v1/economics/..%2F..%2Fsettings").status_code == 404


def test_domain_errors_use_the_standard_envelope():
    body = _body()
    body["baseline"]["simulation"]["provenance"]["weather_snapshot_id"] = "wx_elsewhere"
    r = client.post("/api/v1/economics", json=body)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "CROSS_REVISION_MISMATCH"
    assert err["trace_id"] and err["retryable"] is False


def test_unknown_assumption_set_is_rejected():
    r = client.post("/api/v1/economics", json=_body(assumption_set_id="econ_missing"))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "MISSING_REFERENCE"


def test_idempotency_key_replays_and_rejects_conflicts():
    h = {"Idempotency-Key": "demo-key-1"}
    first = client.post("/api/v1/economics", json=_body(), headers=h)
    again = client.post("/api/v1/economics", json=_body(), headers=h)
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["analysis_id"] == first.json()["analysis_id"]
    clash = client.post("/api/v1/economics", json=_body(occupants=10), headers=h)
    assert clash.status_code == 409


def test_quantity_overrides_are_written_to_the_audit_log():
    body = _body(with_baseline=False)
    body["design"]["quantity_overrides"] = [
        {"key": "heater_count", "value": 2, "reason": "standby heater required by unit SOP"}]
    r = client.post("/api/v1/economics", json=body)
    assert r.status_code == 201, r.text
    rows = [json.loads(l) for l in (settings.ECONOMICS_DIR / "audit_log.jsonl").read_text().splitlines()]
    assert rows[0]["analysis_id"] == r.json()["analysis_id"]
    assert (rows[0]["key"], rows[0]["new_value"], rows[0]["reason"]) == (
        "heater_count", 2, "standby heater required by unit SOP")


def test_override_without_reason_is_rejected():
    body = _body(with_baseline=False)
    body["design"]["quantity_overrides"] = [{"key": "heater_count", "value": 2, "reason": ""}]
    assert client.post("/api/v1/economics", json=body).status_code == 422


def test_health_reports_economics_capability():
    e = client.get("/api/health").json()["economics"]
    assert e["assumption_sets"] >= 1 and e["default_materials"] is True
