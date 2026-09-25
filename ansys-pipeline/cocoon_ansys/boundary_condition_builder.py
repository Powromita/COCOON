"""
boundary_condition_builder.py - Hourly scenario inputs shared by ANSYS and RC.

Computed ONCE per validation package from the frozen weather snapshot and
BuildingModel, written to boundary_conditions.csv, and read by BOTH
solvers, so the two models see identical forcing (PRD v4 §14.6):

    T_out            outdoor dry-bulb (weather snapshot)
    T_ground         Kusuda-Achenbach undisturbed ground temperature at
                     GROUND_DEPTH_M, climatology from the same archive
                     (thermal-calculator/ground_model.py)
    POA_<opening>    plane-of-window irradiance for every window
                     (thermal-calculator/solar.py: Erbs split +
                     isotropic-sky transposition)
    Qsolar_<zone>    sum over the zone's windows of POA x A x SHGC x shading
    Qint_<zone>      occupants x OCCUPANT_SENSIBLE_W + equipment W

Stated modelling scope (both solvers):
    * free-floating: heaters are not operated (validation of the envelope,
      PRD §14.1); hvac_id is ignored.
    * infiltration / door-opening air exchange / stair airflow are OFF:
      MAPDL conduction does not resolve airflow, so both sides are
      compared airflow-free (same practice as the single-zone evidence).
    * opaque-surface solar absorption and long-wave sky exchange are OFF.
    * window solar + internal gains are applied to the zone's floor slab
      surface in ANSYS and to the zone node in RC (lumped zone node carries
      the slab mass).

Exterior convection (PRD §14.6 "exterior convection correlation and wind
inputs"): a named, bounded, wind-speed-dependent film coefficient is
computed here (``h_out_wind_W_m2K``) and is applied on the ANSYS side to
every OPAQUE exterior wall/roof face (pyansys_runner.write_apdl), replacing
the static contract h_outside for that face only. Window/door openings
keep the static contract h_outside: their core conductivity is solved once
against a fixed U (geometry_builder._window_spec-equivalent), so it cannot
be re-targeted per hour without redesigning the opening's thermal path.
Ground-contact floors also keep the static value: "wind" is not a
meaningful boundary-layer driver for a floor-to-soil interface.

The RC side (thermal-calculator/multiroom_rc.py) has one static
U-value per surface and no per-hour BC input for it, so it keeps using the
CONTRACT's r_outside_film for every exterior surface, unchanged. This is a
disclosed, one-sided refinement: ANSYS becomes more physically realistic
here (real wind-driven convection) while RC does not, which is now an
additional, named source of the RC-vs-ANSYS gap that the validation is
meant to surface — not something papered over by forcing an average value
onto RC's static field.
"""

import math

import numpy as np
import pandas as pd

from cocoon_ansys.geometry_builder import compass_name
from cocoon_ansys.paths import WEATHER_ARCHIVE_CSV, ensure_import_paths

ensure_import_paths()

from solar import plane_of_window_irradiance                  # noqa: E402
from ground_model import climatology_parameters, kusuda_ground_temperature  # noqa: E402

OCCUPANT_SENSIBLE_W = 75.0       # W/person, seated/light activity sensible (assumption)
GROUND_DEPTH_M = 1.0
GROUND_ALBEDO = 0.2
SOLAR_TIME_STANDARD = "solar"    # NASA POWER archive is local solar time

# McAdams (1954) simple forced-convection correlation, widely used in
# building energy simulation as the "simple combined" exterior film
# coefficient (e.g. DOE-2 / early EnergyPlus SimpleCombined algorithm):
#   h = A + B*V,  V = wind speed at 10 m (m/s), h in W/(m2.K)
# Applied uniformly to every exterior opaque face (no windward/sheltered
# split): the weather snapshot does not carry wind DIRECTION (only speed),
# so per-surface exposure factors (PRD §14.6, conditional on "if wind
# direction is available") cannot be resolved honestly from this source.
WIND_CONVECTION_A_W_M2K = 5.7
WIND_CONVECTION_B_W_M2K_S_M = 3.8
WIND_CONVECTION_MIN = 5.0        # still-air floor (< A alone would be unphysical)
WIND_CONVECTION_MAX = 50.0       # gale-force cap, keeps the FE model well-posed


def wind_convection_h(wind_speed_m_s):
    h = WIND_CONVECTION_A_W_M2K + WIND_CONVECTION_B_W_M2K_S_M * np.maximum(0.0, wind_speed_m_s)
    return np.clip(h, WIND_CONVECTION_MIN, WIND_CONVECTION_MAX)


def _hourly(schedule, n_hours, start_hour):
    """Value per simulated hour from a 24-value profile or explicit points."""
    if schedule is None:
        return np.zeros(n_hours)
    if schedule.hourly_values:
        prof = schedule.hourly_values
        return np.array([prof[(start_hour + k) % 24] for k in range(n_hours)], float)
    if schedule.points:
        raise ValueError(f"schedule '{schedule.id}': explicit points are not supported "
                         "by the M8 builder yet; use hourly_values")
    return np.zeros(n_hours)


def ground_series(timestamps, archive_csv=WEATHER_ARCHIVE_CSV, depth_m=GROUND_DEPTH_M):
    arch = pd.read_csv(archive_csv, parse_dates=["timestamp"])
    monthly = arch.groupby(arch["timestamp"].dt.month)["temperature_C"].mean()
    monthly_means = [float(monthly.loc[m]) for m in range(1, 13)]
    params = climatology_parameters(monthly_means)
    if isinstance(params, dict):
        mean_c = params.get("annual_mean_C")
        amp = params.get("amplitude_K")
        cold = params.get("coldest_day_of_year")
    else:
        mean_c, amp, cold = params
    series = kusuda_ground_temperature(timestamps, mean_c, amp, cold, depth_m=depth_m)
    return [float(v) for v in series], {"annual_mean_C": mean_c, "amplitude_K": amp,
                                        "coldest_day_of_year": cold, "depth_m": depth_m,
                                        "source": "Kusuda-Achenbach, monthly means of "
                                                  "leh_weather_archive.csv"}


def build(building, weather, model):
    """Return (DataFrame of hourly inputs, assumptions dict)."""
    pts = weather.hourly_data
    n = len(pts)
    for a, b in zip(pts[:-1], pts[1:]):
        if (b.timestamp - a.timestamp).total_seconds() != 3600:
            raise ValueError("weather snapshot must be gap-free hourly for ANSYS validation")
    ts_naive = [p.timestamp.replace(tzinfo=None) for p in pts]
    df = pd.DataFrame({
        "timestamp": [p.timestamp.isoformat() for p in pts],
        "elapsed_start_s": np.arange(n) * 3600.0,
        "T_out_C": [p.outdoor_dry_bulb_temperature_c for p in pts],
        "GHI_W_m2": [p.ghi_w_m2 for p in pts],
        "wind_m_s": [p.wind_speed_m_s for p in pts],
    })
    tg, ground_meta = ground_series(ts_naive)
    df["T_ground_C"] = tg
    df["h_out_wind_W_m2K"] = wind_convection_h(df["wind_m_s"].to_numpy())

    src = weather.source
    utc_off = pts[0].timestamp.utcoffset().total_seconds() / 3600.0
    poa_cache = {}
    solar_by_zone = {z: np.zeros(n) for z in model.zones}
    for oid, o in model.openings.items():
        if o["type"] != "window" or o["shgc"] <= 0:
            continue
        surf = model.surfaces[o["surface_id"]]
        if surf["boundary"] not in ("outdoors",):
            continue
        if surf["axis"] == 2:
            orient = "horizontal"
        else:
            orient = compass_name(surf["azimuth_deg"])
        if orient not in poa_cache:
            poa_cache[orient] = np.array(plane_of_window_irradiance(
                ts_naive, df["GHI_W_m2"].tolist(), src.latitude_deg, src.longitude_deg,
                orient, time_standard=SOLAR_TIME_STANDARD, utc_offset_h=utc_off,
                albedo=GROUND_ALBEDO), float)
        poa = poa_cache[orient]
        df[f"POA_{oid}_W_m2"] = poa
        solar_by_zone[o["zone_id"]] += poa * o["area_m2"] * o["shgc"] * o["shading_factor"]

    zone_objs = {z.id: z for f in building.floors for z in f.zones}
    start_hour = pts[0].timestamp.hour
    for zid in model.zones:
        z = zone_objs[zid]
        occ = _hourly(building.schedules.get(z.occupancy_schedule_id)
                      if z.occupancy_schedule_id else None, n, start_hour)
        eq = _hourly(building.schedules.get(z.equipment_schedule_id)
                     if z.equipment_schedule_id else None, n, start_hour)
        df[f"Qsolar_{zid}_W"] = solar_by_zone[zid]
        df[f"Qint_{zid}_W"] = occ * OCCUPANT_SENSIBLE_W + eq
        df[f"Qfloor_{zid}_W"] = df[f"Qsolar_{zid}_W"] + df[f"Qint_{zid}_W"]

    assumptions = {
        "occupant_sensible_W_per_person": OCCUPANT_SENSIBLE_W,
        "ground": ground_meta,
        "exterior_convection": {
            "correlation": "McAdams (1954) simple combined: "
                          f"h = {WIND_CONVECTION_A_W_M2K} + {WIND_CONVECTION_B_W_M2K_S_M}*V "
                          f"[{WIND_CONVECTION_MIN}, {WIND_CONVECTION_MAX}] W/m2K, V = 10 m wind speed",
            "applied_to": "ANSYS opaque exterior wall/roof faces only (per-hour table); "
                          "openings and ground floors keep the static contract h_outside; "
                          "RC keeps the static contract h_outside on every exterior surface "
                          "(no per-hour U input) - a disclosed, ANSYS-only refinement",
            "windward_sheltered_split": "not applied: weather snapshot has no wind_direction_deg",
        },
        "solar": {"model": "Erbs diffuse split + isotropic sky (thermal-calculator/solar.py)",
                  "time_standard": SOLAR_TIME_STANDARD, "albedo": GROUND_ALBEDO,
                  "note": "archive timestamps are local solar time labelled +05:30"},
        "hvac": "free-floating; heaters not operated",
        "airflow": "infiltration, door-opening and stair airflow excluded on both sides",
        "opaque_solar_and_sky_longwave": "excluded on both sides",
        "gain_application": "ANSYS: heat flux on the zone floor slab top face; "
                            "RC: added to the zone node",
        "loads_within_hour": "hourly-constant (value of hour k held over (t_k, t_k+1])",
    }
    return df, assumptions
