"""Stage 3 (M5 prerequisites): materials without their own thickness rows get category ranges; the four legacy materials do not change."""

from __future__ import annotations

import copy
from datetime import datetime, timezone

import pytest
from cocoon_contracts.materials import MaterialSnapshot

from design_generator.candidate_generator import DEFAULT_THICKNESS_BY_CATEGORY_MM, GenerationOptions, generate_candidates
from design_generator.tests.conftest import load_fixture

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def with_new_materials():
    snap = load_fixture("material_snapshot_standard.json")
    template = copy.deepcopy(snap["materials"]["mat_stone"])
    for mid, category, density in (("mat_new_brick", "masonry", 1650.0), ("mat_new_timber", "structural", 450.0), ("mat_new_wool", "insulation", 30.0),
                                   ("mat_new_glass", "glazing", 2500.0)):
        rec = copy.deepcopy(template)
        rec.update(id=mid, category=category, display_name=mid)
        rec["properties"]["density_kg_m3"] = density
        snap["materials"][mid] = rec
    return snap


def req(ids, mass=60000.0):
    r = load_fixture("requirements_ladakh_30p.json")
    r["constraints"].update(available_material_ids=ids, maximum_mass_kg=mass)
    return r


def layers(result):
    return [(l.material_id, l.thickness_mm) for c in result.candidates for a in c.building.assemblies.values() for l in a.layers]


def test_new_materials_are_used_inside_their_category_ranges():
    snap = with_new_materials()
    result = generate_candidates(req(["mat_new_brick", "mat_new_timber", "mat_new_wool", "mat_new_glass"]), snap, seed=1, count=6, created_at=T0)
    used = layers(result)
    assert {m for m, _ in used} <= {"mat_new_brick", "mat_new_timber", "mat_new_wool"} and {"mat_new_brick", "mat_new_wool"} <= {m for m, _ in used}
    lows = {"mat_new_brick": 75, "mat_new_timber": 25, "mat_new_wool": 25}       # smallest range start over all elements
    highs = {"mat_new_brick": 500, "mat_new_timber": 250, "mat_new_wool": 250}
    assert all(lows[m] <= t <= highs[m] for m, t in used)


def test_glazing_category_is_never_a_wall_layer():
    result = generate_candidates(req(["mat_new_brick", "mat_new_glass"]), with_new_materials(), seed=2, count=3, created_at=T0)
    assert "mat_new_glass" not in {m for m, _ in layers(result)}


def test_legacy_materials_keep_their_own_rows_and_do_not_get_new_ones():
    # mat_stone has no roof row (the CSV has no stone roof); the category fallback must not give it one
    result = generate_candidates(req(["mat_stone", "mat_puf", "mat_concrete"]), with_new_materials(), seed=3, count=6, created_at=T0)
    for c in result.candidates:
        assert all(l.material_id != "mat_stone" for l in c.building.assemblies["roof"].layers) if "roof" in c.building.assemblies else True


def test_the_legacy_output_is_identical_with_and_without_the_fallback_table():
    snap = load_fixture("material_snapshot_standard.json")
    r = load_fixture("requirements_ladakh_30p.json")
    a = generate_candidates(r, snap, seed=42, count=4, created_at=T0)
    b = generate_candidates(r, snap, seed=42, count=4, created_at=T0, options=GenerationOptions(thickness_by_category_mm={}))
    assert [c.building.model_dump_json() for c in a.candidates] == [c.building.model_dump_json() for c in b.candidates]


def test_the_category_table_covers_the_three_roles():
    assert {c for (_, c) in DEFAULT_THICKNESS_BY_CATEGORY_MM} == {"masonry", "structural", "insulation"}
    assert all(lo < hi for lo, hi in DEFAULT_THICKNESS_BY_CATEGORY_MM.values())


def test_each_element_uses_its_own_category_range():
    result = generate_candidates(req(["mat_new_brick", "mat_new_timber", "mat_new_wool"]), with_new_materials(), seed=5, count=12, created_at=T0)
    seen = {}
    for c in result.candidates:
        for a in c.building.assemblies.values():
            for l in a.layers:
                if l.material_id == "mat_new_wool":
                    seen.setdefault(a.category.value, []).append(l.thickness_mm)
    limits = {"partition": (25, 50), "floor": (40, 150), "wall": (50, 250), "roof": (50, 250)}
    assert {"partition", "floor"} <= set(seen)
    for category, values in seen.items():
        lo, hi = limits[category]
        assert all(lo <= v <= hi for v in values), (category, values)
