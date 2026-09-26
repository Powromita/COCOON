import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from cocoon_contracts import MaterialSnapshot  # noqa: E402
from economics import LifecycleAssumptionSet, load_assumption_set  # noqa: E402
from economics.tests._support import COSTS_DIR, load_fixture  # noqa: E402


@pytest.fixture
def aset() -> LifecycleAssumptionSet:
    s = load_assumption_set(COSTS_DIR, "econ_ladakh_v1")
    assert s is not None
    return s


@pytest.fixture
def materials() -> MaterialSnapshot:
    return MaterialSnapshot.model_validate(load_fixture("material_snapshot_standard.json"))


@pytest.fixture
def building() -> dict:
    return load_fixture("building_airlock_living.json")


@pytest.fixture
def simulation() -> dict:
    return load_fixture("simulation_result_completed.json")


@pytest.fixture
def two_floor() -> dict:
    return load_fixture("building_two_floor_compact.json")
