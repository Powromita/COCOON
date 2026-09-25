"""
Pytest configuration for the Person-2 environment tests.

The project is not an installed package: pipeline modules live at the
repo root (engine_adapter, shelter_config, weather_archive, ...) and the
engine lives in thermal-calculator/ (a hyphenated dir, imported via
sys.path). Mirror that here so tests import exactly what the pipeline
imports.
"""

import socket
import sys
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
TC_DIR = TESTS_DIR.parent
REPO_ROOT = TC_DIR.parent

for p in (TESTS_DIR, TC_DIR, REPO_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Tests are offline by rule: any socket connection attempt fails."""

    def _blocked(*_args, **_kwargs):
        raise RuntimeError("network access is disabled in tests")

    monkeypatch.setattr(socket.socket, "connect", _blocked)
    monkeypatch.setattr(socket, "create_connection", _blocked)
