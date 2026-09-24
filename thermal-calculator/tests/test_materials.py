"""Phase 1: materials, constructions, finishes, glazing, shims."""

import copy
import dataclasses
import json
import math

import numpy as np
import pandas as pd
import pytest

import golden_cases as gc
from environment import materials as em
from environment.adapters import contract_layers_to_si
from environment.materials import (
    Construction, GlazingProps, MaterialProps, hemispherical_iam, iam_ashrae,
    layered_construction, load_finishes, load_glazing_db, load_material_db,
)


@pytest.fixture(scope="module")
def db():
    return load_material_db()


@pytest.fixture(scope="module")
def finishes():
    return load_finishes()


# ------------------------------------------------------------------
# known answer: 300 mm stone masonry
# ------------------------------------------------------------------

def test_stone_300mm_known_answer(db):
    stone = db["stone_masonry"]
    # repo values are the ones the hand calculation assumes
    assert (stone.k_W_mK, stone.rho_kg_m3, stone.cp_J_kgK) == (2.3, 2500.0, 1045.0)

    c = layered_construction([("stone_masonry", 0.300)], db,
                             h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    # R = 1/2.5 + 0.3/2.3 + 1/10 = 0.4 + 0.130435 + 0.1 = 0.630435 m2K/W
    assert c.R_total_m2K_W == pytest.approx(0.4 + 0.3 / 2.3 + 0.1, abs=1e-12)
    assert c.U_W_m2K == pytest.approx(1.586, abs=0.001)          # 1.586207
    # C = 2500 * 1045 * 0.3 = 783 750 J/m2K
    assert c.C_total_J_m2K == pytest.approx(783_750.0, abs=1e-6)
    assert c.R_surfaces_m2K_W == pytest.approx(0.5, abs=1e-15)
    assert c.outer_absorptance == stone.solar_absorptance
    assert c.outer_emissivity == stone.emissivity


def test_multilayer_sums_and_arrays(db):
    layers = [("puf", 0.05), ("stone_masonry", 0.30), ("wood_timber", 0.02)]
    c = layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)

    expected_layer_R = [d / db[m].k_W_mK for m, d in layers]
    expected_layer_C = [db[m].rho_kg_m3 * db[m].cp_J_kgK * d for m, d in layers]
    assert c.layer_ids == ("puf", "stone_masonry", "wood_timber")
    assert c.thickness_m == (0.05, 0.30, 0.02)
    np.testing.assert_allclose(c.layer_R_m2K_W, expected_layer_R, rtol=0, atol=1e-14)
    np.testing.assert_allclose(c.layer_C_J_m2K, expected_layer_C, rtol=1e-15)
    assert c.R_total_m2K_W == pytest.approx(sum(expected_layer_R) + 1 / 2.5 + 1 / 10, abs=1e-12)
    assert c.U_W_m2K == 1 / c.R_total_m2K_W
    assert c.C_total_J_m2K == pytest.approx(sum(expected_layer_C), rel=1e-15)
    assert c.n_layers == 3

    arr = c.arrays()
    assert set(arr) == {"thickness_m", "layer_R_m2K_W", "layer_C_J_m2K"}
    assert all(isinstance(a, np.ndarray) and a.shape == (3,) for a in arr.values())


def test_reversing_layers_keeps_U_and_C_but_changes_outer_surface(db):
    layers = [("puf", 0.05), ("stone_masonry", 0.30)]
    fwd = layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    rev = layered_construction(layers[::-1], db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    assert rev.U_W_m2K == pytest.approx(fwd.U_W_m2K, rel=1e-14)
    assert rev.C_total_J_m2K == pytest.approx(fwd.C_total_J_m2K, rel=1e-14)
    assert fwd.outer_absorptance == db["puf"].solar_absorptance
    assert rev.outer_absorptance == db["stone_masonry"].solar_absorptance
    assert fwd.outer_absorptance != rev.outer_absorptance


def test_h_out_none_drops_exactly_the_outside_film(db):
    layers = [("concrete", 0.15), ("puf", 0.05)]
    with_film = layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    no_film = layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=None)
    assert with_film.R_total_m2K_W - no_film.R_total_m2K_W == pytest.approx(0.1, abs=1e-12)
    assert no_film.R_se_m2K_W == 0.0
    assert no_film.R_surfaces_m2K_W == pytest.approx(0.4, abs=1e-15)
    assert no_film.C_total_J_m2K == with_film.C_total_J_m2K


def test_accepts_legacy_dict_materials(db):
    legacy = em.load_materials(str(em.MATERIALS_PATH))
    layers = [("adobe", 0.6)]
    a = layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    b = layered_construction(layers, legacy, h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    assert a == b


def test_construction_is_frozen(db):
    c = layered_construction([("adobe", 0.3)], db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    with pytest.raises(dataclasses.FrozenInstanceError):
        c.U_W_m2K = 0.0  # type: ignore[misc]


# ------------------------------------------------------------------
# errors
# ------------------------------------------------------------------

@pytest.mark.parametrize("layers, match", [
    ([("stone_masonry", 0.0)], "thickness must be > 0"),
    ([("stone_masonry", -0.1)], "thickness must be > 0"),
    ([("stone_masonry", float("nan"))], "thickness must be > 0"),
    ([("unobtainium", 0.1)], "unknown material 'unobtainium'"),
    ([], "at least one layer"),
    ([("stone_masonry",)], r"\(material_id, thickness_m\) pair"),
])
def test_bad_layers_raise(db, layers, match):
    with pytest.raises(ValueError, match=match):
        layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)


@pytest.mark.parametrize("h_in, h_out", [(0.0, 10.0), (-1.0, 10.0), (2.5, 0.0), (2.5, -3.0)])
def test_bad_film_coefficients_raise(db, h_in, h_out):
    with pytest.raises(ValueError, match="h_(in|out)_W_m2K"):
        layered_construction([("adobe", 0.3)], db, h_in_W_m2K=h_in, h_out_W_m2K=h_out)


@pytest.mark.parametrize("kwargs, match", [
    ({"solar_absorptance": 1.2}, "solar_absorptance"),
    ({"solar_absorptance": -0.1}, "solar_absorptance"),
    ({"emissivity": 0.0}, "emissivity"),
    ({"emissivity": 1.01}, "emissivity"),
    ({"k_W_mK": 0.0}, "k_W_mK"),
    ({"rho_kg_m3": -5.0}, "rho_kg_m3"),
])
def test_material_props_validation_names_material_and_field(kwargs, match):
    base = dict(id="testmat", display_name="Test", k_W_mK=1.0, rho_kg_m3=1000.0,
                cp_J_kgK=1000.0)
    base.update(kwargs)
    with pytest.raises(ValueError, match=rf"Material 'testmat'.*{match}"):
        MaterialProps(**base)


def test_absorptance_bounds_inclusive():
    MaterialProps("m", "m", 1.0, 1.0, 1.0, emissivity=1.0, solar_absorptance=0.0)
    MaterialProps("m", "m", 1.0, 1.0, 1.0, emissivity=1.0, solar_absorptance=1.0)


def test_loaders_reject_bad_json(tmp_path):
    bad_alpha = {"x": {"thermal_conductivity": 1, "density": 1, "specific_heat": 1,
                       "solar_absorptance": 1.5}}
    missing = {"y": {"thermal_conductivity": 1, "density": 1}}
    p1, p2 = tmp_path / "a.json", tmp_path / "b.json"
    p1.write_text(json.dumps(bad_alpha))
    p2.write_text(json.dumps(missing))
    for loader in (em.load_materials, load_material_db):
        with pytest.raises(ValueError, match=r"Material 'x'.*solar_absorptance"):
            loader(p1)
        with pytest.raises(ValueError, match=r"Material 'y'.*specific_heat"):
            loader(p2)


# ------------------------------------------------------------------
# material database content
# ------------------------------------------------------------------

def test_every_material_has_cited_radiative_props(db):
    raw = json.loads(em.MATERIALS_PATH.read_text(encoding="utf-8"))
    assert set(db) == set(raw)
    for mid, m in db.items():
        assert "emissivity" in raw[mid] and "solar_absorptance" in raw[mid], mid
        for prop in ("emissivity", "solar_absorptance"):
            assert m.sources[prop] and m.sources[prop] != "not_specified", (mid, prop)
            assert m.property_status[prop] in ("typical_literature",
                                               "estimate_low_confidence"), (mid, prop)
        # k/rho/cp inherit the whole-material citation
        assert m.sources["k_W_mK"] == raw[mid]["data_source"]
        assert m.property_status["k_W_mK"] == raw[mid]["data_status"]


def test_to_legacy_dict_matches_json_numbers(db):
    raw = json.loads(em.MATERIALS_PATH.read_text(encoding="utf-8"))
    for mid, m in db.items():
        d = m.to_legacy_dict()
        for k in ("thermal_conductivity", "density", "specific_heat"):
            assert d[k] == raw[mid][k]
    assert db["adobe"].diffusivity_m2_s == pytest.approx(0.13 / (2210 * 1000))


# ------------------------------------------------------------------
# finishes
# ------------------------------------------------------------------

def test_finish_overrides_outer_surface_only(db, finishes):
    layers = [("adobe", 0.5)]
    bare = layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    washed = layered_construction(layers, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0,
                                  outer_finish="lime_whitewash", finishes=finishes)
    assert washed.outer_absorptance == finishes["lime_whitewash"].solar_absorptance
    assert washed.outer_emissivity == finishes["lime_whitewash"].emissivity
    assert washed.outer_finish == "lime_whitewash"
    assert washed.U_W_m2K == bare.U_W_m2K and washed.C_total_J_m2K == bare.C_total_J_m2K
    assert bare.outer_finish is None


def test_unknown_finish_raises(db, finishes):
    with pytest.raises(ValueError, match="Unknown outer_finish 'chrome'"):
        layered_construction([("adobe", 0.5)], db, h_in_W_m2K=2.5, h_out_W_m2K=10.0,
                             outer_finish="chrome", finishes=finishes)
    with pytest.raises(ValueError, match="pass finishes"):
        layered_construction([("adobe", 0.5)], db, h_in_W_m2K=2.5, h_out_W_m2K=10.0,
                             outer_finish="lime_whitewash")


def test_finishes_file_is_valid_and_cited(finishes):
    assert {"mud_plaster", "lime_whitewash", "dark_paint", "snow_fresh",
            "galvanised_steel_new"} <= set(finishes)
    for f in finishes.values():
        assert f.source != "not_specified"


# ------------------------------------------------------------------
# glazing
# ------------------------------------------------------------------

def test_glazing_loader_reproduces_json_and_defaults():
    raw = json.loads(em.GLAZING_PATH.read_text(encoding="utf-8"))
    g = load_glazing_db()
    assert set(g) == set(raw)
    for gid, props in g.items():
        assert props.U_W_m2K == raw[gid]["U_W_m2K"]
        assert props.SHGC == raw[gid]["SHGC"]
        assert props.iam_b0 == 0.10
        assert props.frame_fraction == 0.0 and props.glass_fraction == 1.0
        # normal incidence reproduces legacy area * SHGC * G exactly
        assert props.shgc_beam(1.0) == props.SHGC
        assert props.shgc_diffuse == pytest.approx(props.SHGC / 1.1, rel=1e-15)


def test_iam_known_values_and_edges():
    assert iam_ashrae(1.0) == 1.0
    # 60 deg: 1 - 0.1 * (2 - 1) = 0.9
    assert iam_ashrae(0.5) == pytest.approx(0.9, abs=1e-12)
    assert iam_ashrae(0.0) == 0.0            # grazing
    assert iam_ashrae(-0.3) == 0.0           # sun behind surface
    assert iam_ashrae(0.05) == 0.0           # formula negative -> clipped
    arr = iam_ashrae(np.array([1.0, 0.5, -1.0]))
    np.testing.assert_allclose(arr, [1.0, 0.9, 0.0])
    assert iam_ashrae(0.3, b0=0.0) == 1.0


def test_hemispherical_iam_closed_form_matches_integral():
    for b0 in (0.0, 0.05, 0.10, 0.2):
        n = 200_000
        th = (np.arange(n) + 0.5) * (math.pi / 2) / n
        numeric = 2 * np.sum(iam_ashrae(np.cos(th), b0) * np.sin(th) * np.cos(th)) * (math.pi / 2) / n
        assert hemispherical_iam(b0) == pytest.approx(numeric, abs=1e-8)
    assert hemispherical_iam(0.1) == pytest.approx(1 / 1.1)


def test_glazing_validation():
    with pytest.raises(ValueError, match="SHGC"):
        GlazingProps("g", "g", U_W_m2K=2.8, SHGC=1.2)
    with pytest.raises(ValueError, match="frame_fraction"):
        GlazingProps("g", "g", U_W_m2K=2.8, SHGC=0.7, frame_fraction=1.5)
    g = GlazingProps("g", "g", U_W_m2K=2.8, SHGC=0.7, shgc_diffuse=0.6, frame_fraction=0.2)
    assert g.shgc_diffuse == 0.6 and g.glass_fraction == pytest.approx(0.8)


# ------------------------------------------------------------------
# shims: old import paths == new implementation
# ------------------------------------------------------------------

def test_old_import_paths_are_the_moved_functions():
    import heat_transfer
    import materials as old_materials
    import thermal_model

    assert heat_transfer.layer_resistance is em.layer_resistance
    assert heat_transfer.total_resistance is em.total_resistance
    assert heat_transfer.calculate_u_value is em.calculate_u_value
    assert heat_transfer.calculate_layer_capacitance is em.calculate_layer_capacitance
    assert thermal_model.total_resistance is em.total_resistance
    assert thermal_model.calculate_layer_capacitance is em.calculate_layer_capacitance
    assert old_materials.load_materials is em.load_materials
    assert old_materials.get_material is em.get_material
    assert old_materials.get_material_display_name is em.get_material_display_name
    # Person 1's functions stay in heat_transfer, untouched
    assert heat_transfer.resistance_to_interior.__module__ == "heat_transfer"
    assert heat_transfer.position_weight.__module__ == "heat_transfer"


def test_shim_results_identical_for_every_material(db):
    import heat_transfer
    import materials as old_materials
    import thermal_model

    legacy = old_materials.load_materials(str(em.MATERIALS_PATH))
    assert legacy == em.load_materials(str(em.MATERIALS_PATH))

    for mid in legacy:
        assert old_materials.get_material(legacy, mid.upper()) is legacy[mid]
        prepared = thermal_model.prepare_layers(
            [{"material": mid, "thickness_mm": 237}], legacy)
        R_old = heat_transfer.total_resistance(prepared, 2.5, 10.0)
        con = layered_construction(contract_layers_to_si(
            [{"material": mid, "thickness_mm": 237}]), db,
            h_in_W_m2K=2.5, h_out_W_m2K=10.0)
        # same operation order -> bit-for-bit
        assert con.R_total_m2K_W == R_old, mid
        assert con.U_W_m2K == heat_transfer.calculate_u_value(R_old), mid
        assert con.layer_C_J_m2K[0] == pytest.approx(
            heat_transfer.calculate_layer_capacitance(
                1.0, 0.237, legacy[mid]["density"], legacy[mid]["specific_heat"]),
            rel=1e-15), mid


def test_multilayer_matches_legacy_construction_properties(db):
    import materials as old_materials
    import thermal_model

    legacy = old_materials.load_materials(str(em.MATERIALS_PATH))
    contract = [{"material": "puf", "thickness_mm": 80},
                {"material": "adobe", "thickness_mm": 400}]
    props = thermal_model.calculate_construction_properties(
        thermal_model.prepare_layers(contract, legacy), 1.0, 2.5, 10.0)
    con = layered_construction(contract_layers_to_si(contract), db,
                               h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    assert con.R_total_m2K_W == props["resistance_m2K_W"]
    assert con.U_W_m2K == props["U_W_m2K"]
    assert con.C_total_J_m2K == pytest.approx(props["lumped_capacitance_J_K"], rel=1e-15)


# ------------------------------------------------------------------
# adapters
# ------------------------------------------------------------------

def test_contract_layers_to_si():
    assert contract_layers_to_si([{"material": " PUF ", "thickness_mm": 50},
                                  {"material": "stone_masonry", "thickness_mm": 300.0}]) \
        == [("puf", 0.05), ("stone_masonry", 0.3)]
    assert contract_layers_to_si([]) == []
    for bad in ([{"material": "puf"}], [{"thickness_mm": 5}],
                [{"material": "puf", "thickness_mm": 0}],
                [{"material": "puf", "thickness_mm": "thick"}]):
        with pytest.raises(ValueError, match="Layer 0"):
            contract_layers_to_si(bad)


# ------------------------------------------------------------------
# legacy physics ignores the new radiative fields
# ------------------------------------------------------------------

def test_radiative_fields_have_no_effect_in_legacy():
    from engine_adapter import get_materials

    case = gc.cases()[0]
    base = copy.deepcopy(get_materials())
    tweaked = copy.deepcopy(base)
    for m in tweaked.values():
        m["solar_absorptance"] = 0.01
        m["emissivity"] = 0.02

    h1, _ = gc.run_case(case, materials=base)
    h2, _ = gc.run_case(case, materials=tweaked)
    pd.testing.assert_frame_equal(h1, h2, check_exact=True)


# ------------------------------------------------------------------
# PPGI default finish for PUF-outermost constructions (defaults layer)
# ------------------------------------------------------------------

from environment.adapters import (  # noqa: E402
    DEFAULT_FINISH_BY_OUTER_MATERIAL, construction_from_contract, default_outer_finish,
)


def test_ppgi_finish_and_colour_variants(finishes):
    base = finishes["prepainted_steel_sheet"]
    light, medium, dark = (finishes[f"prepainted_steel_sheet_{c}"]
                           for c in ("light", "medium", "dark"))
    assert light.solar_absorptance < medium.solar_absorptance < dark.solar_absorptance
    assert (base.solar_absorptance, base.emissivity) == \
        (medium.solar_absorptance, medium.emissivity)          # default = medium
    for f in (base, light, medium, dark):
        assert 0.85 <= f.emissivity <= 0.90
        assert "Levinson_2007" in f.source


def test_puf_outermost_defaults_to_ppgi(db, finishes):
    wall = [{"material": "puf", "thickness_mm": 80},
            {"material": "stone_masonry", "thickness_mm": 300}]
    c = construction_from_contract(wall, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0,
                                   finishes=finishes)
    ppgi = finishes["prepainted_steel_sheet"]
    assert c.outer_finish == "prepainted_steel_sheet"
    assert (c.outer_absorptance, c.outer_emissivity) == (ppgi.solar_absorptance, ppgi.emissivity)
    # finish is radiative only: U and C equal the bare construction
    bare = layered_construction(contract_layers_to_si(wall), db,
                                h_in_W_m2K=2.5, h_out_W_m2K=10.0)
    assert (c.U_W_m2K, c.C_total_J_m2K) == (bare.U_W_m2K, bare.C_total_J_m2K)
    # loads the finish table itself when none is passed
    assert construction_from_contract(wall, db, h_in_W_m2K=2.5,
                                      h_out_W_m2K=10.0).outer_finish == "prepainted_steel_sheet"


def test_explicit_finish_overrides_ppgi_default(db, finishes):
    wall = [{"material": "puf", "thickness_mm": 80},
            {"material": "stone_masonry", "thickness_mm": 300}]
    c = construction_from_contract(wall, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0,
                                   outer_finish="prepainted_steel_sheet_dark",
                                   finishes=finishes)
    assert c.outer_finish == "prepainted_steel_sheet_dark"
    assert c.outer_absorptance == finishes["prepainted_steel_sheet_dark"].solar_absorptance
    assert default_outer_finish([("puf", 0.08)], "lime_whitewash") == "lime_whitewash"


def test_non_puf_outer_layer_unaffected(db, finishes):
    for wall in ([{"material": "stone_masonry", "thickness_mm": 300},
                  {"material": "puf", "thickness_mm": 80}],          # PUF inside
                 [{"material": "adobe", "thickness_mm": 500}]):
        c = construction_from_contract(wall, db, h_in_W_m2K=2.5, h_out_W_m2K=10.0,
                                       finishes=finishes)
        outer = db[wall[0]["material"]]
        assert c.outer_finish is None
        assert (c.outer_absorptance, c.outer_emissivity) == \
            (outer.solar_absorptance, outer.emissivity)
    assert default_outer_finish([]) is None
    assert set(DEFAULT_FINISH_BY_OUTER_MATERIAL) == {"puf"}


def test_ppgi_default_does_not_touch_legacy_engine():
    """The legacy engine never builds constructions via the adapter; its
    PUF-outermost golden designs are covered by test_golden. Guard that the
    engine module does not import the finish machinery."""
    import thermal_model
    src = open(thermal_model.__file__, encoding="utf-8").read()
    assert "finish" not in src and "adapters" not in src
