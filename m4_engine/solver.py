"""
solver.py - backward-Euler integration of the zone graph (PRD 10.2, 10.13).

For zone i:   C_i dT_i/dt = sum_j G_ij (T_j - T_i) + sum_e G_e (T_e - T_i) + Q_solar,i + Q_internal,i + Q_hvac,i

    (C/dt + L) T_next = (C/dt) T_now + b_next

All zones are solved simultaneously (unconditionally stable for stiff conductances). Two terms are non-linear
(buoyant door/stair exchange); their conductance is evaluated at the start-of-step temperatures (lagged), which
keeps each step a single linear solve and the result deterministic.

HVAC modes: free-floating (no heater); ideal-load (heated zones are pinned at the setpoint whenever they would
otherwise fall below it, heater output is whatever that takes; heating only); capacity-limited (same, output
capped per heater - a capped zone floats below the setpoint and shows up as unmet hours).

Energy residual: each step the stored-energy change sum_i C_i dT_i/dt is compared with the sum of the BOUNDARY
flows (weather, ground, infiltration, doors to outdoors, solar, internal gains, heater). Inter-zone flows are
excluded, so the check fails if any inter-zone exchange were not applied equal and opposite. It verifies the
solve and the bookkeeping, not the physics of the model.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from m4_engine.network import AIR_CP_J_KGK, Network, air_density, schedule_value
from m4_engine.options import EngineOptions
from m4_engine.solar import poa_irradiance
from m4_engine.weather import StepWeather, WeatherSeries, dew_point_c

SIGMA = 5.670374419e-8
G_ACCEL = 9.81


@dataclass
class StepRecord:
    time: datetime
    t_out_c: float
    temps: np.ndarray
    heater_w: np.ndarray
    solar_w: np.ndarray
    internal_w: np.ndarray
    residual_w: float
    boundary_flow_abs_w: float


def _sky_emissivity(w: StepWeather, opts: EngineOptions) -> float | None:
    """Martin & Berdahl (1984) clear-sky emissivity with a cloud correction. None: not computable."""
    if w.cloud_pct is None and not opts.assume_clear_sky:
        return None
    td = dew_point_c(w.t_out_c, w.rh_pct)
    hour = (w.time.hour + w.time.minute / 60.0)
    eps = 0.711 + 0.0056 * td + 0.000073 * td ** 2 + 0.013 * math.cos(2.0 * math.pi * hour / 24.0)
    eps = min(max(eps, 0.4), 1.0)
    cloud = (w.cloud_pct or 0.0) / 100.0
    return eps + (1.0 - eps) * 0.8 * cloud


def _buoyant_flow(area: float, cd: float, height: float, dT: float, t_mean_k: float) -> float:
    """Volumetric exchange (m3/s) through a large opening, Brown & Solvason: (Cd A / 3) sqrt(g H |dT| / T)."""
    return cd * area / 3.0 * math.sqrt(G_ACCEL * height * abs(dT) / t_mean_k)


def _h_out(wind_ms: float, opts: EngineOptions) -> float:
    return min(opts.h_out_max_w_m2k, max(opts.h_out_min_w_m2k, opts.h_out_base_w_m2k + opts.h_out_wind_w_m2k_per_ms * wind_ms))


def run(
    net: Network,
    weather: WeatherSeries,
    opts: EngineOptions,
    *,
    mode: str,
    setpoint_c: float,
    timestep_s: int,
    initial_c,                                   # float, or one value per zone
    ground_c: float,
    capacity_w: float | None,
    gains_factor: float,
    solar_standard: str,
) -> list[StepRecord]:
    n = len(net.zones)
    dt = float(timestep_s)
    cap = np.array([z.capacity_j_k for z in net.zones])
    heated = np.array([z.heated for z in net.zones])
    heat_on = mode in ("ideal_load_conditioned", "capacity_limited_conditioned")
    cap_w = math.inf if (mode != "capacity_limited_conditioned" or capacity_w is None) else float(capacity_w)
    rho_air = air_density(weather.elevation_m, opts.air_reference_temperature_c)
    rho_cp = rho_air * AIR_CP_J_KGK

    T = np.full(n, float(initial_c)) if np.isscalar(initial_c) else np.asarray(initial_c, dtype=float).copy()
    records: list[StepRecord] = []
    poa_cache: dict[tuple, float] = {}

    for w in weather.steps:
        # ---- weather-driven terms -------------------------------------------------------------------------
        poa_cache.clear()

        def poa(az: float, tilt: float) -> float:
            key = (round(az, 3), round(tilt, 3))
            if key not in poa_cache:
                poa_cache[key] = poa_irradiance(w.time, w.ghi, w.dni, w.dhi, weather.latitude_deg, weather.longitude_deg,
                                                az, tilt, opts.ground_albedo, solar_standard)
            return poa_cache[key]

        t_out_k = w.t_out_c + 273.15
        eps_sky = _sky_emissivity(w, opts) if opts.longwave_sky else None
        t_sky_k = (eps_sky * t_out_k ** 4) ** 0.25 if eps_sky is not None else t_out_k

        L = np.zeros((n, n))
        b = np.zeros(n)                              # constant-temperature boundary contributions (W)
        q_solar = np.zeros(n)
        q_internal = np.zeros(n)
        boundary_g = np.zeros(n)                     # sum of G to fixed-temperature boundaries, for the flow check
        boundary_gt = np.zeros(n)                    # sum of G x T_boundary

        def to_boundary(i: int, g: float, tb: float) -> None:
            L[i, i] += g
            b[i] += g * tb
            boundary_g[i] += g
            boundary_gt[i] += g * tb

        def between(i: int, j: int, g: float) -> None:
            L[i, i] += g
            L[j, j] += g
            L[i, j] -= g
            L[j, i] -= g

        for e in net.outdoor:
            speed = w.wind_ms
            if w.wind_dir_deg is not None and e.tilt_deg > 45.0:
                windward = math.cos(math.radians(w.wind_dir_deg - e.azimuth_deg)) > 0.0
                speed = w.wind_ms * (1.0 if windward else opts.leeward_wind_factor)
            h = _h_out(speed, opts)
            r_nofilm = 1.0 / e.u_w_m2k - e.r_out_film
            g = e.area_m2 / (r_nofilm + 1.0 / h)
            view = (1.0 + math.cos(math.radians(e.tilt_deg))) / 2.0
            lw = e.emissivity * view * SIGMA * (t_out_k ** 4 - t_sky_k ** 4) if eps_sky is not None else 0.0
            t_sa = w.t_out_c + (e.absorptivity * poa(e.azimuth_deg, e.tilt_deg) * e.exposed_fraction - lw) / h
            to_boundary(e.zone, g, t_sa)
        for zi, g, _ in net.leaf_outdoor:
            to_boundary(zi, g, w.t_out_c)
        for zi, g, _ in net.ground:
            to_boundary(zi, g, ground_c)
        for i, z in enumerate(net.zones):
            to_boundary(i, z.infiltration_g_w_k, w.t_out_c)
        for zi, zj, g, _ in net.interzone:
            between(zi, zj, g)
        for d in net.doors:
            ta = T[d.zone_a]
            tb = w.t_out_c if d.zone_b is None else T[d.zone_b]
            vdot = _buoyant_flow(d.area_m2, d.cd, d.height_m, ta - tb, 0.5 * (ta + tb) + 273.15)
            g = rho_cp * d.open_fraction * vdot
            if d.zone_b is None:
                to_boundary(d.zone_a, g, w.t_out_c)
            else:
                between(d.zone_a, d.zone_b, g)
        for s in net.stairs:
            vdot = _buoyant_flow(s.area_m2, s.cd, s.height_m, T[s.zone_a] - T[s.zone_b],
                                 0.5 * (T[s.zone_a] + T[s.zone_b]) + 273.15)
            between(s.zone_a, s.zone_b, rho_cp * s.open_fraction * vdot)
        for ws in net.windows:
            q_solar[ws.zone] += ws.effective_area_m2 * poa(ws.azimuth_deg, ws.tilt_deg)
        for i, z in enumerate(net.zones):
            people = schedule_value(z.occupancy_schedule, w.time)
            q_internal[i] = gains_factor * (people * opts.occupant_sensible_w + schedule_value(z.equipment_schedule, w.time))

        A0 = np.diag(cap / dt) + L
        rhs0 = cap / dt * T + b + q_solar + q_internal

        # ---- solve, with the thermostat -----------------------------------------------------------------------------
        T_new = np.linalg.solve(A0, rhs0)
        q_hvac = np.zeros(n)
        if heat_on and heated.any():
            pinned: set[int] = set()
            fixed: dict[int, float] = {}
            for _ in range(3 * n + 6):
                A, rhs = A0.copy(), rhs0.copy()
                for i, q in fixed.items():
                    rhs[i] += q
                for i in pinned:
                    A[i, :] = 0.0
                    A[i, i] = 1.0
                    rhs[i] = setpoint_c
                T_try = np.linalg.solve(A, rhs)
                need = A0 @ T_try - rhs0                       # heat each zone needs to hold T_try (negative: it would cool)
                changed = False
                for i in sorted(pinned):
                    if need[i] > cap_w + 1e-9:
                        pinned.discard(i)
                        fixed[i] = cap_w
                        changed = True
                    elif need[i] < -1e-9:
                        pinned.discard(i)                      # heating only
                        changed = True
                for i in sorted(fixed):
                    if T_try[i] > setpoint_c + 1e-9:
                        del fixed[i]
                        pinned.add(i)
                        changed = True
                for i in range(n):
                    if heated[i] and i not in pinned and i not in fixed and T_try[i] < setpoint_c - 1e-9:
                        pinned.add(i)
                        changed = True
                T_new = T_try
                q_hvac = np.zeros(n)
                for i in pinned:
                    q_hvac[i] = max(0.0, need[i])
                for i, q in fixed.items():
                    q_hvac[i] = q
                if not changed:
                    break

        # ---- residual: stored energy vs boundary flows (inter-zone flows excluded) ---------------------------------
        stored = float(np.sum(cap * (T_new - T) / dt))
        boundary = float(np.sum(boundary_gt - boundary_g * T_new) + q_solar.sum() + q_internal.sum() + q_hvac.sum())
        boundary_abs = float(np.sum(np.abs(boundary_gt - boundary_g * T_new)) + q_solar.sum() + q_internal.sum() + q_hvac.sum())
        records.append(StepRecord(time=w.time, t_out_c=w.t_out_c, temps=T_new.copy(), heater_w=q_hvac, solar_w=q_solar,
                                  internal_w=q_internal, residual_w=stored - boundary, boundary_flow_abs_w=boundary_abs))
        T = T_new
    return records
