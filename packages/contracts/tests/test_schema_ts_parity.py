"""
test_schema_ts_parity.py - Automated tests verifying Python, JSON Schema, and TypeScript parity,
reference resolution, and regeneration determinism.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
import pytest
from jsonschema.validators import Draft202012Validator
from referencing import Registry, Resource

import cocoon_contracts as cc
from cocoon_contracts.project import Project
from cocoon_contracts.requirements import RequirementsContract
from cocoon_contracts.building import BuildingModel
from cocoon_contracts.weather import WeatherSnapshot
from cocoon_contracts.materials import MaterialSnapshot
from cocoon_contracts.simulation import SimulationRequest, SimulationResult
from cocoon_contracts.economics import EconomicAnalysisResult
from cocoon_contracts.ansys import AnsysJobRequest, AnsysValidationResult
from cocoon_contracts.visualization import VisualizationModel
from cocoon_contracts.errors import ErrorEnvelope

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "jsonschema"
TS_DIR = Path(__file__).resolve().parent.parent / "typescript"
TS_GENERATED_FILE = TS_DIR / "src" / "generated.ts"

ALL_MODELS = [
    Project,
    RequirementsContract,
    BuildingModel,
    WeatherSnapshot,
    MaterialSnapshot,
    SimulationRequest,
    SimulationResult,
    EconomicAnalysisResult,
    AnsysJobRequest,
    AnsysValidationResult,
    VisualizationModel,
    ErrorEnvelope,
]


def test_typescript_regeneration_produces_no_diff():
    """Regenerating TypeScript definitions from schemas must produce zero git diff."""
    assert TS_GENERATED_FILE.exists(), f"TypeScript generated file missing: {TS_GENERATED_FILE}"
    initial_content = TS_GENERATED_FILE.read_text(encoding="utf-8")

    # Run generator script
    gen_script = TS_DIR / "scripts" / "generate-types.js"
    res = subprocess.run(["node", str(gen_script)], cwd=str(TS_DIR), capture_output=True, text=True)
    assert res.returncode == 0, f"TypeScript generator failed: {res.stderr}"

    regenerated_content = TS_GENERATED_FILE.read_text(encoding="utf-8")
    assert initial_content == regenerated_content, "TypeScript generator is not deterministic or produced diff!"


@pytest.mark.parametrize("model_cls", ALL_MODELS)
def test_python_json_schema_required_fields_parity(model_cls):
    """Pydantic required fields must match JSON Schema required array exactly."""
    schema = model_cls.model_json_schema(mode="serialization")
    schema_required = set(schema.get("required", []))

    pydantic_required = set()
    for field_name, field_info in model_cls.model_fields.items():
        if field_info.is_required():
            pydantic_required.add(field_name)

    assert pydantic_required == schema_required, (
        f"Parity mismatch for {model_cls.__name__}!\n"
        f"Pydantic required: {pydantic_required}\n"
        f"JSON Schema required: {schema_required}"
    )


def test_json_schema_draft_2020_12_meta_validation():
    """All 12 persisted schemas must pass Draft202012Validator.check_schema."""
    schema_files = list(SCHEMAS_DIR.glob("*.schema.json"))
    assert len(schema_files) == 12, f"Expected 12 schemas, found {len(schema_files)}"

    for path in schema_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        assert "draft/2020-12" in data.get("$schema", "")
        Draft202012Validator.check_schema(data)


def test_json_schema_refs_resolve():
    """All $ref pointers across all 12 schemas must resolve cleanly."""
    schema_files = list(SCHEMAS_DIR.glob("*.schema.json"))

    for path in schema_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        resource = Resource.from_contents(data)
        registry = Registry().with_resource(data.get("$id", f"urn:{path.name}"), resource)
        validator = Draft202012Validator(data, registry=registry)

        def find_refs(obj):
            refs = []
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if k == "$ref":
                        refs.append(v)
                    else:
                        refs.extend(find_refs(v))
            elif isinstance(obj, list):
                for item in obj:
                    refs.extend(find_refs(item))
            return refs

        refs = find_refs(data)
        defs = data.get("$defs", {})
        for ref in refs:
            if ref.startswith("#/$defs/"):
                target = ref[len("#/$defs/"):]
                assert target in defs, f"Unresolved ref {ref} in {path.name}"
