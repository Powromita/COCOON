"""
solar.py - plane-of-array irradiance for ANY surface azimuth/tilt (PRD 10.5).

Sun position: Spencer (1971) declination and equation of time. Split of GHI into beam/diffuse: measured DNI/DHI
when the weather snapshot has them, otherwise the Erbs et al. (1982) correlation. Transposition: isotropic sky
(Liu & Jordan) with a ground-reflected term. Azimuth convention is the M0 one: 0 = north, 90 = east, 180 = south,
270 = west; tilt 0 = horizontal facing up, 90 = vertical.

Disclosed simplifications: no horizon/terrain shading, no circumsolar brightening, no incidence-angle modifier on
glazing (SHGC is applied at its rated value).
"""

from __future__ import annotations

import math
from datetime import datetime

SOLAR_CONSTANT_W_M2 = 1367.0


def _declination_eot(day_of_year: int) -> tuple[float, float]:
    b = 2.0 * math.pi * (day_of_year - 1) / 365.0
    delta = (0.006918 - 0.399912 * math.cos(b) + 0.070257 * math.sin(b) - 0.006758 * math.cos(2 * b)
             + 0.000907 * math.sin(2 * b) - 0.002697 * math.cos(3 * b) + 0.00148 * math.sin(3 * b))
    eot_min = 229.18 * (0.000075 + 0.001868 * math.cos(b) - 0.032077 * math.sin(b)
                        - 0.014615 * math.cos(2 * b) - 0.04089 * math.sin(2 * b))
    return delta, eot_min


def solar_time_hours(ts: datetime, longitude_deg: float, standard: str) -> float:
    """Local solar time (h) of the instant `ts`. standard='solar': the clock already is solar time."""
    clock = ts.hour + ts.minute / 60.0 + ts.second / 3600.0
    if standard == "solar":
        return clock
    _, eot = _declination_eot(ts.timetuple().tm_yday)
    offset_h = ts.utcoffset().total_seconds() / 3600.0 if ts.utcoffset() is not None else 0.0
    return clock + (4.0 * (longitude_deg - 15.0 * offset_h) + eot) / 60.0


def sun_position(ts: datetime, latitude_deg: float, longitude_deg: float, standard: str) -> tuple[float, float, float, float]:
    """(cos zenith, declination, hour angle, day of year); angles in radians."""
    day = ts.timetuple().tm_yday
    delta, _ = _declination_eot(day)
    omega = math.radians(15.0 * (solar_time_hours(ts, longitude_deg, standard) - 12.0))
    phi = math.radians(latitude_deg)
    cosz = math.sin(phi) * math.sin(delta) + math.cos(phi) * math.cos(delta) * math.cos(omega)
    return cosz, delta, omega, day


def erbs_diffuse_fraction(kt: float) -> float:
    if kt <= 0.22:
        return 1.0 - 0.09 * kt
    if kt <= 0.80:
        return 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4
    return 0.165


def poa_irradiance(
    ts: datetime,
    ghi: float,
    dni: float | None,
    dhi: float | None,
    latitude_deg: float,
    longitude_deg: float,
    azimuth_deg: float,
    tilt_deg: float,
    albedo: float,
    standard: str,
) -> float:
    """Total irradiance (W/m2) on a plane at instant `ts`."""
    ghi = max(0.0, float(ghi))
    beta = math.radians(tilt_deg)
    gamma = math.radians(azimuth_deg - 180.0)          # Duffie-Beckman: from south, positive west
    phi = math.radians(latitude_deg)
    sky_view = (1.0 + math.cos(beta)) / 2.0
    ground_view = (1.0 - math.cos(beta)) / 2.0
    cosz, delta, omega, day = sun_position(ts, latitude_deg, longitude_deg, standard)
    if ghi <= 0.0:
        return 0.0
    if cosz <= 0.01:
        return ghi * sky_view                        # sun at the horizon: treat everything as diffuse
    if dni is not None and dhi is not None:
        beam_h, diffuse = max(0.0, dni) * cosz, max(0.0, dhi)
    else:
        g0n = SOLAR_CONSTANT_W_M2 * (1.0 + 0.033 * math.cos(2.0 * math.pi * day / 365.0))
        kt = min(1.0, ghi / (g0n * cosz))
        diffuse = erbs_diffuse_fraction(kt) * ghi
        beam_h = ghi - diffuse
    cos_theta = (math.sin(delta) * math.sin(phi) * math.cos(beta)
                 - math.sin(delta) * math.cos(phi) * math.sin(beta) * math.cos(gamma)
                 + math.cos(delta) * math.cos(phi) * math.cos(beta) * math.cos(omega)
                 + math.cos(delta) * math.sin(phi) * math.sin(beta) * math.cos(gamma) * math.cos(omega)
                 + math.cos(delta) * math.sin(beta) * math.sin(gamma) * math.sin(omega))
    rb = max(0.0, cos_theta) / max(cosz, 0.087)
    return max(0.0, beam_h * rb + diffuse * sky_view + ghi * albedo * ground_view)
