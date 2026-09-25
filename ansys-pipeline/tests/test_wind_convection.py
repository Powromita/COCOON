import numpy as np

from cocoon_ansys.boundary_condition_builder import (
    WIND_CONVECTION_MAX, WIND_CONVECTION_MIN, wind_convection_h)


def test_bounded():
    v = np.array([-5.0, 0.0, 1.0, 5.0, 20.0, 1000.0])
    h = wind_convection_h(v)
    assert (h >= WIND_CONVECTION_MIN).all()
    assert (h <= WIND_CONVECTION_MAX).all()


def test_monotonic_in_wind_speed():
    v = np.linspace(0.0, 15.0, 50)
    h = wind_convection_h(v)
    assert (np.diff(h) >= 0).all()


def test_negative_wind_treated_as_calm():
    assert wind_convection_h(np.array([-3.0])) == wind_convection_h(np.array([0.0]))
