"""Sanity checks on environment.constants and the package skeleton."""

import importlib

import pytest

from environment import constants as c


def test_reference_values():
    assert c.STEFAN_BOLTZMANN_W_m2K4 == 5.670374419e-8
    assert c.GRAVITY_m_s2 == 9.80665
    assert c.R_DRY_AIR_J_kgK == 287.05
    assert c.CP_DRY_AIR_J_kgK == 1005.0
    assert c.STANDARD_PRESSURE_Pa == 101325.0
    assert c.SOLAR_CONSTANT_W_m2 == 1361.0


def test_sea_level_density_from_constants_is_about_legacy():
    # ideal gas at 15 C, 101325 Pa -> 1.225 kg/m3 (ISA); legacy engine uses 1.2
    rho = c.STANDARD_PRESSURE_Pa / (c.R_DRY_AIR_J_kgK * c.STANDARD_TEMPERATURE_K)
    assert rho == pytest.approx(1.225, abs=1e-3)


def test_legacy_constants_mirror_engine():
    import shelter_config as sc
    import thermal_model as tm
    assert c.LEGACY_AIR_DENSITY_kg_m3 == tm.AIR_DENSITY_KG_M3
    assert c.LEGACY_AIR_CP_J_kgK == tm.AIR_SPECIFIC_HEAT_J_KGK
    ht = sc.FIXED_ASSUMPTIONS["heat_transfer"]
    assert c.LEGACY_H_INSIDE_W_m2K == ht["h_inside_W_m2K"]
    assert c.LEGACY_H_OUTSIDE_W_m2K == ht["h_outside_W_m2K"]


@pytest.mark.parametrize("module", [
    "weather", "materials", "solar", "convection", "sky",
    "airflow", "ground", "boundary", "adapters", "constants",
])
def test_skeleton_modules_import(module):
    importlib.import_module(f"environment.{module}")
