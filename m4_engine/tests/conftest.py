import copy
import json
import sys
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from cocoon_contracts import BuildingModel, MaterialSnapshot, SimulationEngineMode, WeatherSnapshot  # noqa: E402
from m4_engine import EngineOptions, M4Evaluator  # noqa: E402

FIXTURES = REPO_ROOT / "packages" / "packages" / "contracts" / "fixtures" / "valid"
CASES = REPO_ROOT / "ansys-pipeline" / "cases"


@pytest.fixture(scope="session")
def materials() -> MaterialSnapshot:
    return MaterialSnapshot.model_validate_json((CASES / "materials_m0_standard.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def weather48() -> WeatherSnapshot:
    return WeatherSnapshot.model_validate_json((CASES / "wx_leh_20260124T11_48h.json").read_text(encoding="utf-8"))


@pytest.fixture
def airlock_living() -> dict:
    return json.loads((CASES / "case_03_airlock_living.json").read_text(encoding="utf-8"))


@pytest.fixture
def two_floor() -> dict:
    return json.loads((CASES / "case_04_two_floor.json").read_text(encoding="utf-8"))


def make_job(building: dict | BuildingModel, weather: WeatherSnapshot, *, mode="free_floating", hours=48, setpoint=18.0,
             dt=900, initial=10.0, ground=-3.4, capacity=None, ach=0.0, extras=None):
    b = building if isinstance(building, BuildingModel) else BuildingModel.model_validate(building)
    start = weather.hourly_data[0].timestamp
    return SimpleNamespace(building=b, weather_snapshot_id=weather.snapshot_id, mode=SimulationEngineMode(mode),
                           window_start=start, window_end=start + timedelta(hours=hours), setpoint_c=setpoint,
                           timestep_seconds=dt, initial_temperature_c=initial, ground_temperature_c=ground,
                           heater_capacity_kw=capacity, air_changes_per_hour=ach, extras=extras or {})


def evaluator(materials, weather, **opt) -> M4Evaluator:
    return M4Evaluator(materials, {weather.snapshot_id: weather}, EngineOptions(**opt))


def temps(result, zone):
    return [p.zone_temperatures_c[zone] for p in result.time_series]
