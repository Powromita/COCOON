"""Shared helpers for the M7 tests (kept out of conftest so they can be imported)."""

import copy
import json
from pathlib import Path

from economics import EconomicsRequest, LifecycleAssumptionSet

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "packages" / "contracts" / "fixtures" / "valid"
COSTS_DIR = REPO_ROOT / "data" / "costs"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def modify_set(aset: LifecycleAssumptionSet, fn) -> LifecycleAssumptionSet:
    """Return a validated copy of `aset` after `fn(dict)` mutates its JSON form."""
    d = aset.model_dump(mode="json")
    fn(d)
    return LifecycleAssumptionSet.model_validate(d)


def point(v: float) -> dict:
    return {"low": v, "expected": v, "high": v}


def baseline_of(building: dict, simulation: dict, heating_kwh: float,
                revision_id: str = "rev_airlock_living_uninsulated", strip_puf: bool = True):
    b = copy.deepcopy(building)
    b["revision_id"] = revision_id
    if strip_puf:
        for a in b["assemblies"].values():
            kept = [layer for layer in a["layers"] if layer["material_id"] != "mat_puf"]
            a["layers"] = kept or a["layers"]
    s = copy.deepcopy(simulation)
    s["simulation_id"] = "sim_baseline_001"
    s["design_revision_id"] = revision_id
    s["summary"]["heating_energy_kwh"] = heating_kwh
    return b, s


def make_request(building: dict, simulation: dict, baseline=None, **extra) -> EconomicsRequest:
    body = {
        "assumption_set_id": "econ_ladakh_v1",
        "design": {"building": building, "simulation": simulation, "simulated_hours": 24,
                   "target_temperature_c": 15.0},
        "occupants": 20,
    }
    if baseline is not None:
        bb, bs = baseline
        body["baseline"] = {"building": bb, "simulation": bs, "simulated_hours": 24,
                            "target_temperature_c": 15.0, "kind": "standard_uninsulated_template",
                            "label": "uninsulated airlock + living"}
    for k, v in extra.items():
        body[k] = v
    return EconomicsRequest.model_validate(body)
