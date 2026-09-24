"""
ground_model.py

Undisturbed ground temperature at a given depth for the RC model's
"ground" boundary, using the Kusuda-Achenbach (1965) equation:

    T(z, t) = Tm - As * exp(-z * sqrt(pi / (365 * a)))
                     * cos( 2*pi/365 * ( t - t0
                            - (z / 2) * sqrt(365 / (pi * a)) ) )

    Tm  = annual mean surface temperature   [deg C]
    As  = annual surface amplitude           [K]  (half max-min)
    t0  = day of year of the coldest surface temperature
    z   = depth                               [m]
    a   = soil thermal diffusivity            [m2/day]
    t   = day of year

Climate input:
    Long-term monthly mean 2 m air temperature from the Open-Meteo ERA5
    archive (last 10 full years), already downscaled by Open-Meteo to the
    site elevation. No separate lapse-rate correction is needed.

Why this instead of a surface "skin" temperature:
    The skin temperature is the very top of the snow/soil surface. In a
    Ladakh winter it swings with the air and drops far below air
    temperature on clear nights. A floor sitting on the ground sees soil
    ~1 m down, which is damped and lagged.

Disclosed simplifications:
    - Uses AIR climatology as a proxy for surface climatology
      (ignores snow insulation and the warming effect of the building
      above) -> tends to be conservative (too cold).
    - One homogeneous soil; default diffusivity 0.04 m2/day
      (typical moist soil ~0.03-0.06). Change it if you have
      site soil data.
    - Not a full ISO 13370 ground-floor calculation.
"""

import math

import pandas as pd

from weather import (
    DEFAULT_SITE_ELEVATION_M,
    fetch_monthly_air_climatology_open_meteo,
)


# Day of year at the middle of each month.
MID_MONTH_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349]

DEFAULT_DEPTH_M = 1.0
DEFAULT_SOIL_DIFFUSIVITY_M2_DAY = 0.04
DEFAULT_CLIMATOLOGY_YEARS = 10


def fetch_monthly_air_climatology(
    latitude,
    longitude,
    site_elevation_m=DEFAULT_SITE_ELEVATION_M,
    years=DEFAULT_CLIMATOLOGY_YEARS,
):
    """Long-term monthly mean 2 m air temperature at the site elevation.

    Returns (list_of_12_monthly_means_C, info_dict). info_dict holds the
    source and the years used, for printing and saving.
    """

    climatology = fetch_monthly_air_climatology_open_meteo(
        latitude, longitude, site_elevation_m=site_elevation_m, years=years
    )

    info = {
        "source": climatology["source"],
        "period": climatology["period"],
        "site_elevation_m": site_elevation_m,
    }

    return list(climatology["monthly_means_C"]), info


def climatology_parameters(monthly_means_C):
    """(Tm, As, t0_day) from 12 monthly mean temperatures."""

    monthly_means_C = list(monthly_means_C)

    tm = sum(monthly_means_C) / 12.0
    amplitude = (max(monthly_means_C) - min(monthly_means_C)) / 2.0
    coldest_month = monthly_means_C.index(min(monthly_means_C))

    return tm, amplitude, MID_MONTH_DOY[coldest_month]


def kusuda_ground_temperature(
    timestamps,
    annual_mean_C,
    amplitude_K,
    coldest_day_of_year,
    depth_m=DEFAULT_DEPTH_M,
    diffusivity_m2_day=DEFAULT_SOIL_DIFFUSIVITY_M2_DAY,
):
    """Ground temperature series (deg C) at `depth_m` for each
    timestamp."""

    a = diffusivity_m2_day
    damping = math.exp(-depth_m * math.sqrt(math.pi / (365.0 * a)))
    lag_days = (depth_m / 2.0) * math.sqrt(365.0 / (math.pi * a))

    series = []

    for ts in pd.to_datetime(pd.Series(timestamps)):
        day = ts.dayofyear + ts.hour / 24.0

        series.append(
            annual_mean_C
            - amplitude_K * damping * math.cos(
                2.0 * math.pi / 365.0
                * (day - coldest_day_of_year - lag_days)
            )
        )

    return series
