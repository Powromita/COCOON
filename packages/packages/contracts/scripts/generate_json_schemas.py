#!/usr/bin/env python3
"""
generate_json_schemas.py - Generates JSON Schema Draft 2020-12 documents and invokes
the TypeScript generator (json-schema-to-typescript) from canonical Pydantic v2 models.

DO NOT MANUALLY EDIT OUTPUT FILES.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

# Ensure cocoon_contracts is importable
HERE = Path(__file__).resolve().parent
CONTRACTS_ROOT = HERE.parent
PYTHON_DIR = CONTRACTS_ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

import cocoon_contracts as cc


TOP_LEVEL_MODELS: dict[str, type[cc.ContractModel]] = {
    "project.schema.json": cc.Project,
    "requirements.schema.json": cc.RequirementsContract,
    "building.schema.json": cc.BuildingModel,
    "weather.schema.json": cc.WeatherSnapshot,
    "material.schema.json": cc.MaterialSnapshot,
    "simulation-request.schema.json": cc.SimulationRequest,
    "simulation.schema.json": cc.SimulationResult,
    "economics.schema.json": cc.EconomicAnalysisResult,
    "ansys-job.schema.json": cc.AnsysJobRequest,
    "ansys-validation.schema.json": cc.AnsysValidationResult,
    "visualization.schema.json": cc.VisualizationModel,
    "error.schema.json": cc.ErrorEnvelope,
}


def export_json_schemas(output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_files: list[Path] = []

    for filename, model in TOP_LEVEL_MODELS.items():
        schema: dict[str, Any] = model.model_json_schema(mode="serialization")
        schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
        schema["$id"] = f"https://cocoon.drdo.in/schemas/v4/{filename}"
        schema["description"] = (
            f"AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: {model.__name__} in cocoon_contracts. "
            + schema.get("description", "")
        )

        out_path = output_dir / filename
        out_path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        generated_files.append(out_path)
        print(f"  [JSON Schema] Generated {out_path.name}")

    return generated_files


def generate_typescript() -> None:
    ts_script = CONTRACTS_ROOT / "typescript" / "scripts" / "generate-types.js"
    ts_dir = CONTRACTS_ROOT / "typescript"
    subprocess.run(["node", str(ts_script)], cwd=str(ts_dir), check=True)


def main() -> None:
    jsonschema_dir = CONTRACTS_ROOT / "jsonschema"

    print("Generating JSON Schemas...")
    export_json_schemas(jsonschema_dir)

    print("\nGenerating TypeScript interfaces via json-schema-to-typescript...")
    generate_typescript()

    print("\nAll contracts and types generated successfully.")


if __name__ == "__main__":
    main()
