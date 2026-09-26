"""Shared fixtures for optimization tests. Uses only M0 fixtures and M2's PUBLIC interface."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from cocoon_contracts.materials import MaterialSnapshot

from design_generator import generate_designs, resolve_user_geometry
from optimization.tests.standins import (
    StandInEconomics,
    StandInEvaluator,
    default_assumptions,
    make_winter_weather,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "packages" / "packages" / "contracts" / "fixtures"
IST = timezone(timedelta(hours=5, minutes=30))
T0 = datetime(2026, 1, 1, tzinfo=IST)
WEATHER_ID = "wx_standin_leh"


def load_fixture(name: str, kind: str = "valid") -> dict:
    return json.loads((FIXTURES / kind / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def snapshot() -> MaterialSnapshot:
    return MaterialSnapshot.model_validate(load_fixture("material_snapshot_standard.json"))


@pytest.fixture(scope="session")
def weather():
    return make_winter_weather(WEATHER_ID)


@pytest.fixture(scope="session")
def evaluator(snapshot, weather):
    return StandInEvaluator(snapshot, {WEATHER_ID: weather})


@pytest.fixture(scope="session")
def economics(snapshot):
    return StandInEconomics(snapshot, {"econ_standin_expected_v0": default_assumptions()})


@pytest.fixture(scope="session")
def ladakh_candidates():
    """Real M2 candidates for the Ladakh request (through M2's public interface)."""
    result = generate_designs(load_fixture("requirements_ladakh_30p.json"), load_fixture("material_snapshot_standard.json"),
                              seed=42, count=4, created_at=T0)
    assert result.complete
    return result.candidates


def user_room(snapshot_dict=None, *, windows=None, occupants=5, heater=True, wall=(("mat_stone", 200), ("mat_puf", 100)),
              roof=(("mat_plywood", 100), ("mat_puf", 100)), floor=(("mat_stone", 150), ("mat_puf", 50)),
              orientation=180, size=(6.0, 4.0, 2.8)):
    """One room built through M2's existing-shelter path (no entrance door, so conduction is easy to hand-check)."""
    length, width, height = size
    shelter = {
        "orientation_deg": orientation,
        "zones": [{"id": "room", "type": "living", "floor_level": 0, "origin_m": {"x": 0.0, "y": 0.0},
                   "size_m": {"length_m": length, "width_m": width, "height_m": height}}],
        "windows": windows or [],
        "assemblies": {"wall": [list(x) for x in wall], "roof": [list(x) for x in roof], "floor": [list(x) for x in floor]},
        "occupants": {"room": occupants} if occupants else {},
        "heater_zones": ["room"] if heater else [],
    }
    return resolve_user_geometry(shelter, snapshot_dict or load_fixture("material_snapshot_standard.json"),
                                 created_at=T0).building
