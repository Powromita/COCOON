"""
standins.py - TEST DOUBLES for M4 and M7. Never import this from production code.

StandInEvaluator follows the physics of COCOON_Multi_Room_RC_Model_Team_Guide.md in the simplest honest way:
one temperature per room, U*A conduction (each shared wall counted ONCE), infiltration rho*cp*ACH*V/3600,
window solar A*SHGC*I, occupant/equipment gains from the schedules, capacitance = room air + the inner 0.10 m of
each surface (0.05 m per side of an internal wall), and an IMPLICIT (backward-Euler) solver so it is stable.

It is deliberately crude where M4 will be precise: solar uses a simple sun-azimuth factor on GHI, internal doors
conduct but do not exchange air, ground and initial temperatures are constants. Every result carries the engine
name ``standin_lumped_rc`` and code_commit ``standin``, so ``is_development_only`` is True. Nothing produced here
is evidence about M4.
"""

from __future__ import annotations

import hashlib
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

import numpy as np

from cocoon_contracts.building import BuildingModel, OpeningType, SurfaceBoundaryType
from cocoon_contracts.economics import (
    AnnualOpexPoint,
    CapexBreakdown,
    CostScenario,
    EconomicAnalysisResult,
    EconomicAssumptionSet,
)
from cocoon_contracts.materials import MaterialSnapshot
from cocoon_contracts.simulation import (
    EngineMetadata,
    SimulationEngineMode,
    SimulationOutputEngineMode,
    SimulationProvenance,
    SimulationResult,
    SimulationStatus,
    SimulationSummary,
    TimeSeriesPoint,
    ZoneSummary,
)

from optimization.rc_verification import (
    STAND_IN_ECONOMICS_PREFIX,
    STAND_IN_ENGINE_PREFIX,
    EconomicsFailedError,
    EvaluationFailedError,
    SimulationJob,
)

RHO_AIR = 1.2          # kg/m3
CP_AIR = 1005.0        # J/(kg K)
PARTICIPATING_M = 0.10        # inner construction depth that follows the room air
PARTICIPATING_INTERNAL_M = 0.05
COMFORT_TOLERANCE_K = 0.05
FIXED_CREATED_AT = datetime(2026, 1, 1, tzinfo=timezone.utc)


# ----- weather ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SyntheticWeather:
    snapshot_id: str
    start: datetime
    temperature_c: tuple[float, ...]     # hourly, repeats
    ghi_w_m2: tuple[float, ...]

    def at(self, when: datetime) -> tuple[float, float]:
        i = int((when - self.start).total_seconds() // 3600) % len(self.temperature_c)
        return self.temperature_c[i], self.ghi_w_m2[i]


def make_winter_weather(snapshot_id="wx_standin_leh", days=14, mean_c=-12.0, swing_c=8.0, peak_ghi=550.0,
                        start=datetime(2026, 1, 1, tzinfo=timezone(timedelta(hours=5, minutes=30)))) -> SyntheticWeather:
    temps, ghi = [], []
    for h in range(days * 24):
        hod = h % 24
        temps.append(mean_c - swing_c * math.cos(2 * math.pi * (hod - 15) / 24))
        ghi.append(max(0.0, math.sin(math.pi * (hod - 6) / 12)) * peak_ghi if 6 <= hod <= 18 else 0.0)
    return SyntheticWeather(snapshot_id, start, tuple(temps), tuple(ghi))


def constant_weather(temperature_c: float, ghi_w_m2: float = 0.0, snapshot_id="wx_standin_const", days=60,
                     start=datetime(2026, 1, 1, tzinfo=timezone.utc)) -> SyntheticWeather:
    n = days * 24
    return SyntheticWeather(snapshot_id, start, (temperature_c,) * n, (ghi_w_m2,) * n)


# ----- the thermal network -------------------------------------------------------------------
@dataclass
class _Network:
    zone_ids: list[str]
    C: np.ndarray                 # J/K
    G_amb: np.ndarray             # W/K to outdoor air
    G_gnd: np.ndarray             # W/K to the ground
    G_int: np.ndarray             # W/K between rooms (symmetric)
    windows: list[tuple[int, float, float, float, float]]   # zone, area, SHGC, shading, azimuth
    occupants: list[list[float] | None]
    equipment_w: list[list[float] | None]
    heated: list[int]
    occupied: list[int]
    ua_total: np.ndarray          # per-room conductance to outdoors + ground + infiltration (diagnostics)


def _u_value(asm, materials: MaterialSnapshot) -> float:
    if asm.u_value_w_m2k:
        return asm.u_value_w_m2k
    r = asm.r_inside_film_m2k_w + asm.r_outside_film_m2k_w
    for l in asm.layers:
        r += l.thickness_mm / 1000.0 / _material(materials, l.material_id).properties.thermal_conductivity_w_mk
    return 1.0 / r


def _material(materials: MaterialSnapshot, material_id: str):
    rec = materials.materials.get(material_id)
    if rec is None:
        raise EvaluationFailedError(f"material '{material_id}' is not in the snapshot", "UNKNOWN_MATERIAL")
    return rec


def _capacity(asm, materials, area: float, depth_m: float) -> float:
    left, total = depth_m, 0.0
    for l in asm.layers:                       # inner -> outer
        use = min(l.thickness_mm / 1000.0, left)
        p = _material(materials, l.material_id).properties
        total += p.density_kg_m3 * p.specific_heat_j_kgk * area * use
        left -= use
        if left <= 1e-12:
            break
    return total


def assemble_network(b: BuildingModel, materials: MaterialSnapshot, ach: float, person_w: float,
              ground_is_ambient: bool) -> _Network:
    zones = [z for f in b.floors for z in f.zones]
    idx = {z.id: i for i, z in enumerate(zones)}
    n = len(zones)
    surfaces = {s.id: s for s in b.surfaces}
    opens: dict[str, list] = defaultdict(list)
    for o in b.openings:
        opens[o.parent_surface_id].append(o)
    C, G_amb, G_gnd = np.zeros(n), np.zeros(n), np.zeros(n)
    G_int = np.zeros((n, n))
    windows: list[tuple[int, float, float, float, float]] = []
    for i, z in enumerate(zones):
        vol = z.size_m.length_m * z.size_m.width_m * z.size_m.height_m
        C[i] += RHO_AIR * CP_AIR * vol
        G_amb[i] += RHO_AIR * CP_AIR * ach * vol / 3600.0

    for s in b.surfaces:
        i = idx[s.owning_zone_id]
        asm = b.assemblies[s.assembly_id]
        u = _u_value(asm, materials)
        own_open = sum(o.area_m2 for o in opens[s.id])
        depth = PARTICIPATING_INTERNAL_M if s.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE else PARTICIPATING_M
        if s.boundary_type != SurfaceBoundaryType.ADIABATIC:
            C[i] += _capacity(asm, materials, max(s.area_m2 - own_open, 0.0), depth)

        if s.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE:
            partner = surfaces.get(s.adjacent_surface_id) if s.adjacent_surface_id else None
            paired = partner is not None and partner.adjacent_surface_id == s.id
            if paired and s.id > partner.id:
                continue                                  # the shared wall is counted ONCE, by its smaller id
            j = idx[s.adjacent_zone_id]
            group = opens[s.id] + (opens[partner.id] if paired else [])
            a_net = max(s.area_m2 - sum(o.area_m2 for o in group), 0.0)
            g = u * a_net + sum(o.u_value_w_m2k * o.area_m2 for o in group if o.opening_type == OpeningType.DOOR)
            G_int[i, j] += g
            G_int[j, i] += g
        elif s.boundary_type in (SurfaceBoundaryType.OUTDOORS, SurfaceBoundaryType.GROUND):
            to_ground = s.boundary_type == SurfaceBoundaryType.GROUND and not ground_is_ambient
            target = G_gnd if to_ground else G_amb
            target[i] += u * max(s.area_m2 - own_open, 0.0)
            for o in opens[s.id]:
                target[i] += o.u_value_w_m2k * o.area_m2
                if o.opening_type == OpeningType.WINDOW:
                    windows.append((i, o.area_m2, o.shgc or 0.0, o.shading_factor if o.shading_factor is not None else 1.0,
                                    s.azimuth_deg))

    def hourly(schedule_id):
        sch = b.schedules.get(schedule_id) if schedule_id else None
        return list(sch.hourly_values) if sch is not None and sch.hourly_values else None

    occ = [hourly(z.occupancy_schedule_id) for z in zones]
    eq = [hourly(z.equipment_schedule_id) for z in zones]
    return _Network(
        [z.id for z in zones], C, G_amb, G_gnd, G_int, windows,
        [None if o is None else [v * person_w for v in o] for o in occ], eq,
        [i for i, z in enumerate(zones) if z.hvac_id], [i for i, z in enumerate(zones) if z.occupancy_schedule_id],
        G_amb + G_gnd)


def _heating(Ainv: np.ndarray, t_free: np.ndarray, heated: list[int], setpoint: float, cap_w: float | None) -> np.ndarray:
    """Power (W) that brings heated rooms with a deficit to the setpoint, coupling included; capped if asked."""
    P = np.zeros(len(t_free))
    active = [i for i in heated if t_free[i] < setpoint - 1e-9]
    while active:
        M = Ainv[np.ix_(active, active)]
        p = np.linalg.solve(M, setpoint - t_free[active])
        negative = [a for a, v in zip(active, p) if v < 0]
        if negative:
            active = [a for a in active if a not in negative]
            continue
        for a, v in zip(active, p):
            P[a] = min(v, cap_w) if cap_w is not None else v
        break
    return P


class StandInEvaluator:
    engine_name = STAND_IN_ENGINE_PREFIX + "lumped_rc"
    engine_version = "0.1.0"
    # what this stand-in honours from job.extras["perturbation"] (see optimization/reliability.py); it has no door-usage model
    supported_perturbations = frozenset({"infiltration", "weather", "conductivity", "internal_gains"})

    def __init__(self, materials: MaterialSnapshot, weather: Mapping[str, SyntheticWeather], *, person_w: float = 100.0,
                 default_ach: float = 0.7):
        self.materials = materials
        self.weather = dict(weather)
        self.person_w = person_w
        self.default_ach = default_ach

    def simulate(self, job: SimulationJob) -> SimulationResult:
        wx = self.weather.get(job.weather_snapshot_id)
        if wx is None:
            raise EvaluationFailedError(f"no weather '{job.weather_snapshot_id}' in the stand-in", "WEATHER_NOT_FOUND")
        ach = self.default_ach if job.air_changes_per_hour is None else job.air_changes_per_hour
        gains_factor = float((job.extras.get("perturbation") or {}).get("internal_gains", 1.0))
        net = assemble_network(job.building, self.materials, ach, self.person_w * gains_factor, job.ground_temperature_c is None)
        if gains_factor != 1.0:
            net.equipment_w = [None if e is None else [v * gains_factor for v in e] for e in net.equipment_w]
        n, dt = len(net.zone_ids), float(job.timestep_seconds)
        steps = int((job.window_end - job.window_start).total_seconds() // dt)
        if steps < 1:
            raise EvaluationFailedError("window shorter than one timestep", "INVALID_JOB")
        L = np.diag(net.G_amb + net.G_gnd + net.G_int.sum(axis=1)) - net.G_int
        A = np.diag(net.C / dt) + L
        Ainv = np.linalg.inv(A)
        t_gnd = job.ground_temperature_c if job.ground_temperature_c is not None else None
        free = job.mode == SimulationEngineMode.FREE_FLOATING
        cap_w = job.heater_capacity_kw * 1000.0 if job.mode == SimulationEngineMode.CAPACITY_LIMITED_CONDITIONED else None

        T = np.full(n, job.initial_temperature_c, dtype=float)
        temps, powers, gains, ambient, resid_w, resid_pct = [], [], [], [], [], 0.0
        for k in range(steps):
            when = job.window_start + timedelta(seconds=dt * k)
            t_out, ghi = wx.at(when)
            hour = when.hour + when.minute / 60.0
            q_solar = np.zeros(n)
            if ghi > 0:
                sun_az = 180.0 + 15.0 * (hour - 12.0)
                for zi, area, shgc, shade, az in net.windows:
                    q_solar[zi] += area * shgc * shade * ghi * (0.3 + 0.7 * max(0.0, math.cos(math.radians(az - sun_az))))
            q_int = np.zeros(n)
            for i in range(n):
                if net.occupants[i] is not None:
                    q_int[i] += net.occupants[i][int(when.hour) % len(net.occupants[i])]
                if net.equipment_w[i] is not None:
                    q_int[i] += net.equipment_w[i][int(when.hour) % len(net.equipment_w[i])]
            b = net.G_amb * t_out + (net.G_gnd * t_gnd if t_gnd is not None else 0.0) + q_solar + q_int
            rhs = net.C / dt * T + b
            t_free = Ainv @ rhs
            P = np.zeros(n) if free else _heating(Ainv, t_free, net.heated, job.setpoint_c, cap_w)
            T_next = t_free if not P.any() else Ainv @ (rhs + P)
            r = net.C / dt * (T_next - T) - (b + P - L @ T_next)
            resid_pct = max(resid_pct, float(np.max(np.abs(r))) / max(1.0, float(np.sum(np.abs(b) + np.abs(P)))) * 100.0)
            T = T_next
            temps.append(T.copy()); powers.append(P.copy()); gains.append(q_solar.copy())
            ambient.append(t_out); resid_w.append(float(np.max(np.abs(r))))

        temps, powers = np.array(temps), np.array(powers)
        hours = dt / 3600.0
        occ_idx = net.occupied
        ok = (temps[:, occ_idx] >= job.setpoint_c - COMFORT_TOLERANCE_K).all(axis=1) if occ_idx else np.zeros(steps, bool)
        zones = []
        for i, zid in enumerate(net.zone_ids):
            occupied = i in occ_idx
            zones.append(ZoneSummary(
                zone_id=zid, temperature_min_c=float(temps[:, i].min()), temperature_mean_c=float(temps[:, i].mean()),
                temperature_max_c=float(temps[:, i].max()),
                comfort_hours=float((temps[:, i] >= job.setpoint_c - COMFORT_TOLERANCE_K).sum() * hours) if occupied else 0.0,
                peak_heating_kw=float(powers[:, i].max() / 1000.0),
                unmet_hours=float((temps[:, i] < job.setpoint_c - COMFORT_TOLERANCE_K).sum() * hours) if occupied else 0.0))
        total_p = powers.sum(axis=1)
        summary = SimulationSummary(
            heating_energy_kwh=float(total_p.sum() * dt / 3.6e6), peak_heating_kw=float(total_p.max() / 1000.0),
            occupied_comfort_hours=float(ok.sum() * hours), unmet_hours=float((~ok).sum() * hours) if occ_idx else 0.0,
            energy_residual_max_pct=resid_pct)
        series = [
            TimeSeriesPoint(
                timestamp=job.window_start + timedelta(seconds=dt * (k + 1)),
                zone_temperatures_c={z: float(temps[k, i]) for i, z in enumerate(net.zone_ids)},
                ambient_temperature_c=float(ambient[k]),
                solar_gain_w={z: float(gains[k][i]) for i, z in enumerate(net.zone_ids)},
                heating_power_w={z: float(powers[k, i]) for i, z in enumerate(net.zone_ids)},
                energy_residual_w=resid_w[k]) for k in range(steps)]
        return SimulationResult(
            schema_version="4.0", simulation_id="sim_standin_" + job.request_id()[4:],
            design_revision_id=job.building.revision_id,
            engine=EngineMetadata(name=self.engine_name, version=self.engine_version,
                                  mode=SimulationOutputEngineMode(job.mode.value), timestep_seconds=job.timestep_seconds),
            status=SimulationStatus.COMPLETED, summary=summary, zones=zones, time_series=series,
            provenance=SimulationProvenance(weather_snapshot_id=job.weather_snapshot_id,
                                            material_version=self.materials.snapshot_id, code_commit="standin",
                                            created_at=FIXED_CREATED_AT))


# ----- economics stand-in -----------------------------------------------------------------------
def default_assumptions(set_id="econ_standin_expected_v0", **overrides) -> EconomicAssumptionSet:
    fields: dict[str, Any] = dict(
        id=set_id, version="0.0.1", effective_date=FIXED_CREATED_AT, project_lifetime_years=10, discount_rate_pct=8.0,
        fuel_price_inr_per_litre=95.0, remote_logistics_multiplier=1.25, routine_maintenance_inr_per_year=25000.0,
        source="STAND-IN placeholder, not a real cost source")
    fields.update(overrides)
    return EconomicAssumptionSet(**fields)


_SCENARIO_FACTOR = {CostScenario.LOW: 0.85, CostScenario.EXPECTED: 1.0, CostScenario.HIGH: 1.25}


class StandInEconomics:
    """Crude lifecycle cost from the bill of quantities. PLACEHOLDER numbers throughout."""

    def __init__(self, materials: MaterialSnapshot, assumption_sets: Mapping[str, EconomicAssumptionSet], *,
                 heating_season_days: float = 180.0, labour_fraction: float = 0.35, transport_inr_per_kg: float = 12.0,
                 heater_inr_per_kw: float = 12000.0):
        self.materials, self.sets = materials, dict(assumption_sets)
        self.season_days, self.labour_fraction = heating_season_days, labour_fraction
        self.transport_inr_per_kg, self.heater_inr_per_kw = transport_inr_per_kg, heater_inr_per_kw

    def analyse(self, building, quantities, simulation, assumption_set_id, scenario):
        a = self.sets.get(assumption_set_id)
        if a is None:
            raise EconomicsFailedError(f"unknown assumption set '{assumption_set_id}'", "UNKNOWN_ASSUMPTION_SET")
        if not simulation.time_series:
            raise EconomicsFailedError("stand-in economics needs the simulation time series to size the window",
                                       "MISSING_TIME_SERIES")
        f = _SCENARIO_FACTOR[scenario]
        materials_inr = 0.0
        for m in quantities.materials:
            rec = self.materials.materials[m.material_id].properties
            unit = m.volume_m3 * rec.cost_inr_per_m3 if rec.cost_inr_per_m3 is not None else \
                (m.area_m2 * rec.cost_inr_per_m2 if rec.cost_inr_per_m2 is not None else 0.0)
            materials_inr += unit * a.material_cost_multipliers.get(m.material_id, 1.0) * f
        mass = sum(m.mass_kg or 0.0 for m in quantities.materials)
        capex = CapexBreakdown(
            materials_inr=materials_inr, labour_inr=materials_inr * self.labour_fraction,
            transport_inr=mass * self.transport_inr_per_kg * a.remote_logistics_multiplier,
            equipment_inr=simulation.summary.peak_heating_kw * self.heater_inr_per_kw,
            total_capex_inr=0.0)
        capex = capex.model_copy(update={"total_capex_inr": capex.materials_inr + capex.labour_inr + capex.transport_inr
                                         + capex.equipment_inr})
        window_days = len(simulation.time_series) * simulation.engine.timestep_seconds / 86400.0
        annual_kwh = simulation.summary.heating_energy_kwh / window_days * self.season_days
        litres = annual_kwh / (a.fuel_energy_kwh_per_litre * a.heater_efficiency)
        flows, pv = [], 0.0
        for year in range(1, a.project_lifetime_years + 1):
            fuel = litres * a.fuel_price_inr_per_litre * f
            logistics = fuel * (a.remote_logistics_multiplier - 1.0)
            total = fuel + logistics + a.routine_maintenance_inr_per_year
            disc = total / (1.0 + a.discount_rate_pct / 100.0) ** year
            pv += disc
            flows.append(AnnualOpexPoint(year=year, fuel_cost_inr=fuel, maintenance_cost_inr=a.routine_maintenance_inr_per_year,
                                         replacement_cost_inr=0.0, logistics_cost_inr=logistics, total_opex_inr=total,
                                         discounted_opex_inr=disc))
        key = f"{building.revision_id}|{assumption_set_id}|{scenario.value}|{simulation.simulation_id}"
        return EconomicAnalysisResult(
            schema_version="4.0", analysis_id=f"{STAND_IN_ECONOMICS_PREFIX}_" + hashlib.sha1(key.encode()).hexdigest()[:10],
            design_revision_id=building.revision_id, assumption_set_id=assumption_set_id, scenario=scenario, capex=capex,
            annual_cash_flows=flows, lcc_inr=capex.total_capex_inr + pv, annual_fuel_litres=litres,
            created_at=FIXED_CREATED_AT)
