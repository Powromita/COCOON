"""
test_schema_generation.py - Ensures generated JSON Schemas match live Pydantic models deterministically.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
from generate_json_schemas import TOP_LEVEL_MODELS

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "jsonschema"


@pytest.mark.parametrize("filename,model_cls", list(TOP_LEVEL_MODELS.items()))
def test_schema_synchronization(filename: str, model_cls) -> None:
    schema_file = SCHEMAS_DIR / filename
    assert schema_file.exists(), f"Schema file does not exist: {schema_file}"

    # Load on-disk schema
    with schema_file.open("r", encoding="utf-8") as f:
        disk_schema = json.load(f)

    # Generate live schema from Pydantic model
    live_schema = model_cls.model_json_schema(mode="serialization")
    live_schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    live_schema["$id"] = f"https://cocoon.drdo.in/schemas/v4/{filename}"
    live_schema["description"] = (
        f"AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: {model_cls.__name__} in cocoon_contracts. "
        + live_schema.get("description", "")
    )

    # Compare serialization strings for strict determinism
    disk_str = json.dumps(disk_schema, indent=2, sort_keys=True)
    live_str = json.dumps(live_schema, indent=2, sort_keys=True)

    assert disk_str == live_str, (
        f"Schema drift detected for {filename}! Run 'python packages/contracts/scripts/generate_json_schemas.py' to synchronize."
    )
