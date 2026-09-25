"""Package, status machine, BC and RC-adapter tests (no ANSYS launch)."""

import json

import numpy as np
import pandas as pd
import pytest

from cocoon_ansys import boundary_condition_builder as bcb
from cocoon_ansys.comparison import rc_inputs
from cocoon_ansys.contracts_io import (
    AnsysJobRequest, load_building, load_materials, load_weather)
from cocoon_ansys.geometry_builder import resolve
from cocoon_ansys.paths import CASES_DIR
from cocoon_ansys.validation_package import create_package, verify_package
from cocoon_ansys.worker import cancel, latest_status, read_status, run_job

WEATHER = CASES_DIR / "wx_leh_20260124T11_48h.json"
MATS = CASES_DIR / "materials_m0_standard.json"


def _pkg(tmp_path, case="case_03_airlock_living", hours=6):
    w = load_weather(WEATHER)
    w = w.model_copy(update={"hourly_data": w.hourly_data[:hours]})
    return create_package(load_building(CASES_DIR / f"{case}.json"), w,
                          load_materials(MATS), jobs_root=tmp_path)


def test_package_is_frozen_and_queued(tmp_path):
    req, jd = _pkg(tmp_path)
    assert read_status(jd).status.value == "QUEUED"
    assert req.imposed_indoor_temp_forbidden is True
    assert set(req.input_hashes) >= {"building.json", "weather.json", "boundary_conditions.csv"}
    verify_package(jd)
    scenario = json.loads((jd / "package" / "scenario.json").read_text(encoding="utf-8"))
    assert scenario["design_revision_id"] == req.design_revision_id
    # tampering is detected
    bc = jd / "package" / "boundary_conditions.csv"
    bc.write_text(bc.read_text(encoding="utf-8").replace("-", "+", 1), encoding="utf-8")
    with pytest.raises(RuntimeError, match="changed after queueing"):
        verify_package(jd)


def test_package_carries_no_indoor_temperature(tmp_path):
    _, jd = _pkg(tmp_path)
    cols = pd.read_csv(jd / "package" / "boundary_conditions.csv").columns
    assert not [c for c in cols if c.startswith("T_") and c not in ("T_out_C", "T_ground_C")]


def test_unavailable_when_no_ansys(tmp_path, monkeypatch):
    monkeypatch.setenv("ANSYS_EXECUTABLE_PATH", str(tmp_path / "missing" / "ANSYS.exe"))
    _, jd = _pkg(tmp_path)
    st = run_job(jd)
    assert st.status.value == "UNAVAILABLE"
    assert "not found" in st.error_reason
    assert not (jd / "_mapdl_work").exists()
    with pytest.raises(RuntimeError, match="not QUEUED"):
        run_job(jd)


def test_cancel_and_latest(tmp_path):
    req, jd = _pkg(tmp_path)
    assert latest_status("rev_does_not_exist", tmp_path)["status"] == "NOT_REQUESTED"
    assert latest_status(req.design_revision_id, tmp_path)["status"] == "QUEUED"
    assert cancel(jd).status.value == "CANCELLED"
    with pytest.raises(RuntimeError):
        cancel(jd)


def test_contract_rejects_imposed_indoor_temperature(tmp_path):
    req, _ = _pkg(tmp_path)
    body = req.model_dump(mode="json")
    body["imposed_indoor_temp_forbidden"] = False
    with pytest.raises(Exception, match="SCIENTIFIC INTEGRITY"):
        AnsysJobRequest.model_validate(body)


@pytest.fixture(scope="module")
def two_floor():
    b = load_building(CASES_DIR / "case_04_two_floor.json")
    m = resolve(b, load_materials(MATS))
    bc, assumptions = bcb.build(b, load_weather(WEATHER), m)
    return b, m, bc, assumptions


def test_bc_gains(two_floor):
    b, m, bc, a = two_floor
    w = a["occupant_sensible_W_per_person"]
    start = pd.Timestamp(bc["timestamp"].iloc[0]).hour
    occ = b.schedules["occ_sleeping"].hourly_values
    exp = [occ[(start + k) % 24] * w for k in range(len(bc))]
    assert np.allclose(bc["Qint_sleeping_f1_W"], exp)
    assert (bc.loc[bc["GHI_W_m2"] == 0, "Qsolar_living_f0_W"] == 0).all()
    assert (bc["Qsolar_airlock_f0_W"] == 0).all()                 # airlock has no window
    assert np.allclose(bc["Qfloor_living_f0_W"], bc["Qsolar_living_f0_W"] + bc["Qint_living_f0_W"])


def test_rc_inputs_match_geometry(two_floor):
    _, m, bc, _ = two_floor
    rooms, surfaces, windows, schedules = rc_inputs(m, bc, 10.0)
    assert {r.room_id for r in rooms} == set(m.zones)
    # every exterior surface: net opaque + openings == contract gross area
    for sid, s in m.surfaces.items():
        if s["boundary"] in ("outdoors", "ground"):
            opaque = next(x for x in surfaces if x.surface_id == sid).area_m2
            ops = sum(w.area_m2 for w in windows if w.window_id in
                      {o["id"] for o in m.openings.values() if o["surface_id"] == sid})
            assert opaque + ops == pytest.approx(s["contract_area_m2"])
    slab = next(x for x in surfaces if x.adjacent_room_id == "sleeping_f1")
    assert slab.room_id == "living_f0" and slab.area_m2 == pytest.approx(19.2)
    # partition door appears as its own adjacent conductance
    assert any(x.surface_id == "op_airlock_living_door" and x.boundary_type == "adjacent"
               for x in surfaces)
