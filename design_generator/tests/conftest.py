"""Shared paths and fixture loaders for design_generator tests."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from cocoon_contracts.building import (
    AssemblyCategory,
    AssemblyLayer,
    BuildingMetadata,
    BuildingModel,
    BuildingSource,
    ConstructionAssembly,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "packages" / "packages" / "contracts" / "fixtures"


def load_fixture(name: str, kind: str = "valid") -> dict:
    return json.loads((FIXTURES / kind / name).read_text(encoding="utf-8"))


@pytest.fixture
def requirements_ladakh() -> dict:
    return load_fixture("requirements_ladakh_30p.json")


@pytest.fixture
def material_snapshot() -> dict:
    return load_fixture("material_snapshot_standard.json")


def make_building(geometry, openings=(), connections=(), assemblies=None) -> BuildingModel:
    """Wrap resolver output in a real BuildingModel so every contract validator runs."""
    from design_generator.geometry_resolver import AssemblyIds

    ids = AssemblyIds()
    cats = {ids.wall: "wall", ids.roof: "roof", ids.ground_floor: "floor",
            ids.interfloor: "floor", ids.partition: "partition"}
    if assemblies is None:
        assemblies = {
            aid: ConstructionAssembly(id=aid, name=aid, category=AssemblyCategory(cat),
                                      layers=[AssemblyLayer(material_id="mat_stone", thickness_mm=200.0)])
            for aid, cat in cats.items()
        }
    return BuildingModel(
        schema_version="4.0", design_id="des_t", revision_id="rev_t", source=BuildingSource.GENERATED,
        orientation_deg=geometry.orientation_deg, floors=list(geometry.floors), surfaces=list(geometry.surfaces),
        openings=list(openings), connections=list(connections), assemblies=assemblies, schedules={},
        metadata=BuildingMetadata(created_at=datetime(2026, 1, 1, tzinfo=timezone.utc)),
    )
