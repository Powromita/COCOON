"""
paths.py - Locations of the repo, the M0 contracts package, the RC engine
and the ANSYS executable. Everything else in cocoon_ansys resolves paths
through here so the worker can run from any working directory.
"""

import os
import sys
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent          # ansys-pipeline/
REPO_ROOT = PIPELINE_DIR.parent
CALC_DIR = REPO_ROOT / "thermal-calculator"
WEATHER_ARCHIVE_CSV = REPO_ROOT / "leh_weather_archive.csv"

CASES_DIR = PIPELINE_DIR / "cases"
EVIDENCE_DIR = PIPELINE_DIR / "evidence"
JOBS_DIR = PIPELINE_DIR / "jobs"

# PRD §6 puts the contracts at packages/contracts; the current checkout
# has them one level deeper. Accept either.
_CONTRACT_CANDIDATES = (
    REPO_ROOT / "packages" / "contracts" / "python",
    REPO_ROOT / "packages" / "packages" / "contracts" / "python",
)
_FIXTURE_CANDIDATES = tuple(p.parent / "fixtures" for p in _CONTRACT_CANDIDATES)

DEFAULT_ANSYS_EXEC = (
    r"C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe"
)


def contracts_dir() -> Path:
    for p in _CONTRACT_CANDIDATES:
        if (p / "cocoon_contracts" / "__init__.py").exists():
            return p
    raise FileNotFoundError(
        "M0 contracts package not found; expected cocoon_contracts under "
        + " or ".join(str(p) for p in _CONTRACT_CANDIDATES))


def contract_fixtures_dir() -> Path:
    for p in _FIXTURE_CANDIDATES:
        if p.exists():
            return p
    raise FileNotFoundError("M0 contract fixtures folder not found")


def ansys_executable() -> str:
    """ANSYS_EXECUTABLE_PATH (PRD §25.3) overrides the Student default."""
    return os.environ.get("ANSYS_EXECUTABLE_PATH", DEFAULT_ANSYS_EXEC)


def ensure_import_paths():
    """Make cocoon_contracts and the RC engine importable."""
    for p in (contracts_dir(), CALC_DIR):
        s = str(p)
        if s not in sys.path:
            sys.path.insert(0, s)
