"""
contracts_io.py - Load and validate M0 contracts, canonical JSON and
SHA-256 hashing for frozen validation packages.
"""

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from cocoon_ansys.paths import REPO_ROOT, ensure_import_paths

ensure_import_paths()

from cocoon_contracts import (                               # noqa: E402
    AnsysJobRequest,
    AnsysValidationResult,
    BuildingModel,
    MaterialSnapshot,
    WeatherSnapshot,
)


def load_building(path) -> BuildingModel:
    return BuildingModel.model_validate_json(Path(path).read_text(encoding="utf-8"))


def load_weather(path) -> WeatherSnapshot:
    return WeatherSnapshot.model_validate_json(Path(path).read_text(encoding="utf-8"))


def load_materials(path) -> MaterialSnapshot:
    return MaterialSnapshot.model_validate_json(Path(path).read_text(encoding="utf-8"))


def canonical_json(model_or_obj) -> str:
    """Stable serialisation: the same content always hashes the same."""
    if hasattr(model_or_obj, "model_dump"):
        obj = model_or_obj.model_dump(mode="json")
    else:
        obj = model_or_obj
    return json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)


def write_json(path, model_or_obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(canonical_json(model_or_obj) + "\n", encoding="utf-8")


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def code_commit() -> str:
    """Git SHA of the checkout, with '+dirty' when there are local edits."""
    try:
        sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT,
                             capture_output=True, text=True, timeout=10).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "ansys-pipeline"],
                               cwd=REPO_ROOT, capture_output=True, text=True,
                               timeout=10).stdout.strip()
        return (sha or "unknown") + ("+dirty" if dirty else "")
    except Exception:                                          # noqa: BLE001
        return "unknown"


__all__ = [
    "AnsysJobRequest", "AnsysValidationResult", "BuildingModel",
    "MaterialSnapshot", "WeatherSnapshot",
    "load_building", "load_weather", "load_materials",
    "canonical_json", "write_json", "sha256_file", "sha256_text",
    "now_utc", "code_commit",
]
