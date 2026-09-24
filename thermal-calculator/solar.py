"""
solar.py

Plane-of-window irradiance from global horizontal irradiance (GHI),
replacing the old fixed orientation factors.

Steps for every hourly record:
  1. Solar position (declination, equation of time, hour angle,
     zenith, azimuth) - Spencer (1971) / Duffie & Beckman.
  2. Split GHI into beam (DNI) and diffuse (DHI) using the Erbs et
     al. (1982) correlation on the clearness index kt.
  3. Transpose to the window plane with the isotropic-sky model
     (Liu & Jordan): beam * cos(incidence) + diffuse sky view
     + ground-reflected (albedo).

Why this matters in Ladakh: in winter the sun is low, so a vertical
south window can receive MORE than GHI on clear days (the old model
capped it at 1.0 x GHI), while east/west/north windows receive far
less beam than a fixed 0.6 / 0.3 factor implies at most hours.

Time convention:
  NASA POWER is requested with time-standard=LST, which is LOCAL
  SOLAR TIME: solar noon is 12:00. Station data (e.g. IMD) is
  normally Indian Standard Time (UTC+5:30), which is converted
  using longitude and the equation of time.
  Hourly values are treated as averages over the hour, so the sun
  position is evaluated at the middle of each hour.

Disclosed simplifications: isotropic sky (no circumsolar /
horizon brightening), no terrain/horizon shading by mountains,
single ground albedo (snow in winter is ~0.6-0.8, bare ground
~0.2; set it to match the season).
"""

import math

import pandas as pd


SOLAR_CONSTANT_W_M2 = 1367.0

# Surface azimuth in degrees, measured from south, positive toward
# west (Duffie & Beckman convention). Tilt from horizontal.
ORIENTATIONS = {
    "south": (0.0, 90.0),
    "east": (-90.0, 90.0),
    "west": (90.0, 90.0),
    "north": (180.0, 90.0),
    "horizontal": (0.0, 0.0),
}


def _solar_hour(ts, longitude_deg, time_standard, utc_offset_h, eot_min):
    """Local solar time in hours for the middle of the record hour."""

    clock = ts.hour + ts.minute / 60.0 + 0.5

    if time_standard == "solar":
        return clock

    # Standard clock time -> solar time.
    standard_meridian = 15.0 * utc_offset_h
    correction_min = 4.0 * (longitude_deg - standard_meridian) + eot_min

    return clock + correction_min / 60.0


def plane_of_window_irradiance(
    timestamps,
    ghi_W_m2,
    latitude_deg,
    longitude_deg,
    orientation,
    time_standard="solar",
    utc_offset_h=5.5,
    albedo=0.2,
):
    """Irradiance (W/m2) on a window plane for each record."""

    surface_azimuth, tilt = ORIENTATIONS[orientation]
    beta = math.radians(tilt)
    gamma = math.radians(surface_azimuth)
    phi = math.radians(latitude_deg)

    output = []

    for ts, ghi in zip(pd.to_datetime(pd.Series(timestamps)), ghi_W_m2):

        ghi = 0.0 if ghi is None or ghi != ghi else max(0.0, float(ghi))

        day = ts.dayofyear
        B = 2.0 * math.pi * (day - 1) / 365.0

        # Declination (rad) and equation of time (min), Spencer.
        delta = (
            0.006918 - 0.399912 * math.cos(B) + 0.070257 * math.sin(B)
            - 0.006758 * math.cos(2 * B) + 0.000907 * math.sin(2 * B)
            - 0.002697 * math.cos(3 * B) + 0.00148 * math.sin(3 * B)
        )
        eot = 229.18 * (
            0.000075 + 0.001868 * math.cos(B) - 0.032077 * math.sin(B)
            - 0.014615 * math.cos(2 * B) - 0.04089 * math.sin(2 * B)
        )

        solar_time = _solar_hour(
            ts, longitude_deg, time_standard, utc_offset_h, eot
        )
        omega = math.radians(15.0 * (solar_time - 12.0))

        cos_zenith = (
            math.sin(phi) * math.sin(delta)
            + math.cos(phi) * math.cos(delta) * math.cos(omega)
        )

        if ghi <= 0.0 or cos_zenith <= 0.01:
            # Sun below/at horizon: only diffuse light, if any.
            output.append(ghi * (1 + math.cos(beta)) / 2.0)
            continue

        # Extraterrestrial horizontal irradiance -> clearness index.
        g0n = SOLAR_CONSTANT_W_M2 * (1 + 0.033 * math.cos(2 * math.pi * day / 365.0))
        kt = min(1.0, ghi / (g0n * cos_zenith))

        # Erbs diffuse fraction.
        if kt <= 0.22:
            fd = 1.0 - 0.09 * kt
        elif kt <= 0.80:
            fd = (
                0.9511 - 0.1604 * kt + 4.388 * kt ** 2
                - 16.638 * kt ** 3 + 12.336 * kt ** 4
            )
        else:
            fd = 0.165

        dhi = fd * ghi
        beam_horizontal = ghi - dhi

        # Angle of incidence on the tilted/oriented plane.
        cos_theta = (
            math.sin(delta) * math.sin(phi) * math.cos(beta)
            - math.sin(delta) * math.cos(phi) * math.sin(beta) * math.cos(gamma)
            + math.cos(delta) * math.cos(phi) * math.cos(beta) * math.cos(omega)
            + math.cos(delta) * math.sin(phi) * math.sin(beta)
            * math.cos(gamma) * math.cos(omega)
            + math.cos(delta) * math.sin(beta) * math.sin(gamma) * math.sin(omega)
        )

        # Beam ratio, limited near sunrise/sunset.
        rb = max(0.0, cos_theta) / max(cos_zenith, 0.087)

        poa = (
            beam_horizontal * rb
            + dhi * (1 + math.cos(beta)) / 2.0
            + ghi * albedo * (1 - math.cos(beta)) / 2.0
        )

        output.append(max(0.0, poa))

    return output