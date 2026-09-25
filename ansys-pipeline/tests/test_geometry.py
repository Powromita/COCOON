"""Geometry resolver tests (no ANSYS needed)."""

import json

import numpy as np
import pytest

from cocoon_ansys.contracts_io import BuildingModel, load_building, load_materials
from cocoon_ansys.geometry_builder import (
    FILM_T, GeometryError, MeshConfig, resolve)
from cocoon_ansys.paths import CASES_DIR, contract_fixtures_dir

CASES = ["case_01_baseline_single", "case_02_insulated_single",
         "case_03_airlock_living", "case_04_two_floor"]


@pytest.fixture(scope="module")
def mats():
    return load_materials(CASES_DIR / "materials_m0_standard.json")


@pytest.fixture(scope="module")
def models(mats):
    return {c: resolve(load_building(CASES_DIR / f"{c}.json"), mats) for c in CASES}


@pytest.mark.parametrize("case", CASES)
def test_zone_volumes_exact(models, case):
    for z in models[case].zones.values():
        assert z["built_volume_m3"] == pytest.approx(z["volume_m3"], rel=1e-9)
        cells = z["air_cells"]
        m = models[case]
        vol = (np.diff(m.xs)[cells[:, 0]] * np.diff(m.ys)[cells[:, 1]]
               * np.diff(m.zs)[cells[:, 2]]).sum()
        assert vol == pytest.approx(z["volume_m3"], rel=1e-9)


@pytest.mark.parametrize("case", CASES)
def test_convection_area_equals_contract_net_area(models, case):
    m = models[case]
    per_surface = {}
    for f in m.bc_faces:
        per_surface[f["surface_id"]] = per_surface.get(f["surface_id"], 0.0) + f["areas"].sum()
    for sid, rec in m.surfaces.items():
        if rec["boundary"] in ("outdoors", "ground"):
            assert per_surface[sid] == pytest.approx(rec["contract_area_m2"], rel=1e-6), sid


@pytest.mark.parametrize("case", CASES)
def test_openings_exact_area_and_no_conflicts(models, case):
    m = models[case]
    for o in m.openings.values():
        assert o["area_m2"] == pytest.approx(o["contract_area_m2"], rel=1e-9)
    assert m.conflicts == {}


@pytest.mark.parametrize("case", CASES)
def test_every_zone_receives_gains(models, case):
    for z in models[case].zones.values():
        assert z["gain_area_m2"] > 0


def test_interfaces_counted_once_and_thickness(models):
    m = models["case_04_two_floor"]
    kinds = sorted((i["a"], i["b"], "xyz"[i["axis"]]) for i in m.interfaces)
    assert kinds == [("airlock_f0", "living_f0", "x"), ("living_f0", "sleeping_f1", "z")]
    slab = next(i for i in m.interfaces if i["axis"] == 2)
    assert slab["thickness_m"] == pytest.approx(2 * FILM_T + 0.125)
    # upper storey sits above the slab gap, not on the raw contract z
    assert m.zones["sleeping_f1"]["plo"][2] == pytest.approx(2.8 + slab["thickness_m"])


def test_only_ground_floor_touches_ground(models):
    m = models["case_04_two_floor"]
    ground = {f["surface_id"] for f in m.bc_faces if f["kind"] == "ground"}
    assert ground == {"surf_airlock_f0_floor", "surf_living_f0_floor"}
    roofs = {f["surface_id"] for f in m.bc_faces if f["surface_id"].endswith("_roof")}
    assert roofs == {"surf_airlock_f0_roof", "surf_sleeping_f1_roof"}


def test_node_numbering_is_consistent(models):
    m = models["case_03_airlock_living"]
    cells = m.cells()
    nn = m.node_numbers(m.element_node_gids(cells[:50]).ravel())
    assert nn.min() >= 1 and nn.max() <= len(m.node_table()[0])


def test_incomplete_building_rejected(mats):
    fx = contract_fixtures_dir() / "valid" / "building_two_floor_compact.json"
    b = BuildingModel.model_validate(json.loads(fx.read_text(encoding="utf-8")))
    with pytest.raises(GeometryError, match="no surface declares it"):
        resolve(b, mats)


def test_refinement_adds_elements(mats):
    b = load_building(CASES_DIR / "case_01_baseline_single.json")
    coarse = resolve(b, mats, MeshConfig(0.40)).summary()["elements"]
    fine = resolve(b, mats, MeshConfig(0.20)).summary()["elements"]
    assert fine > coarse
