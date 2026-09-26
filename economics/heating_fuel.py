"""
heating_fuel.py - Conditioned RC heating energy -> annual fuel (PRD Section 13.4).

    fuel_litres = heating_energy_kWh / (fuel_energy_kWh_per_litre x heater_efficiency)

The SimulationResult reports heating energy for the simulated window only
(e.g. a 48 h cold window or a week), so it is annualised explicitly:

    annual_kWh = window_kWh x (heating_season_days x 24 / simulated_hours)

heating_season_days is a visible assumption in the frozen set. When the
simulation already covers a full year, the caller says so and no scaling is
applied. Free-floating runs are refused: economics must use conditioned
heating demand, never a temperature-deficit shortcut (PRD 10.12).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from cocoon_contracts import ErrorCode, SimulationResult, SimulationStatus
from economics.errors import EconomicsError

CONDITIONED_MODES = {"ideal_load_conditioned", "capacity_limited_conditioned", "conditioned"}
HOURS_PER_YEAR = 8760.0


class HeatingBasis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    simulation_id: str
    engine_name: str
    engine_version: str
    engine_mode: str
    simulated_hours: float
    simulated_heating_energy_kwh: float
    simulated_peak_heating_kw: float
    simulation_represents_full_year: bool
    annualisation_factor: float
    method: str


def simulated_hours_of(sim: SimulationResult, declared_hours: float | None) -> float:
    """Window length from the timeseries when present; must agree with any declared value."""
    derived = None
    ts = sim.time_series or []
    if len(ts) >= 2:
        stamps = sorted(p.timestamp for p in ts)
        span_h = (stamps[-1] - stamps[0]).total_seconds() / 3600.0
        derived = span_h + sim.engine.timestep_seconds / 3600.0
    if derived is not None and declared_hours is not None:
        if abs(derived - declared_hours) > max(1e-6, sim.engine.timestep_seconds / 3600.0):
            raise EconomicsError(
                ErrorCode.VALIDATION_ERROR,
                f"declared simulated_hours={declared_hours} disagrees with the simulation "
                f"timeseries span ({derived:.3f} h)", {"simulation_id": sim.simulation_id})
    hours = derived if derived is not None else declared_hours
    if hours is None or hours <= 0:
        raise EconomicsError(
            ErrorCode.VALIDATION_ERROR,
            "cannot annualise heating energy: SimulationResult has no time_series; "
            "provide simulated_hours for the simulated window",
            {"simulation_id": sim.simulation_id})
    return float(hours)


def heating_basis(sim: SimulationResult, declared_hours: float | None,
                  full_year: bool, heating_season_days: float) -> HeatingBasis:
    if sim.status != SimulationStatus.COMPLETED or sim.summary is None:
        raise EconomicsError(ErrorCode.VALIDATION_ERROR,
                             f"simulation '{sim.simulation_id}' is not completed",
                             {"status": sim.status.value})
    mode = sim.engine.mode.value
    if mode not in CONDITIONED_MODES:
        raise EconomicsError(
            ErrorCode.VALIDATION_ERROR,
            f"simulation '{sim.simulation_id}' is '{mode}'; economics requires a conditioned "
            "RC run (PRD 10.12)", {"engine_mode": mode})
    hours = simulated_hours_of(sim, declared_hours)
    if full_year:
        if hours < HOURS_PER_YEAR - 24:
            raise EconomicsError(
                ErrorCode.VALIDATION_ERROR,
                f"simulation_represents_full_year=true but only {hours:.1f} h were simulated")
        factor = HOURS_PER_YEAR / hours
        method = "full-year conditioned RC run, normalised to 8760 h"
    else:
        factor = heating_season_days * 24.0 / hours
        method = (f"conditioned RC window of {hours:.1f} h scaled to "
                  f"{heating_season_days:g} heating-season days/year")
    return HeatingBasis(
        simulation_id=sim.simulation_id,
        engine_name=sim.engine.name,
        engine_version=sim.engine.version,
        engine_mode=mode,
        simulated_hours=hours,
        simulated_heating_energy_kwh=sim.summary.heating_energy_kwh,
        simulated_peak_heating_kw=sim.summary.peak_heating_kw,
        simulation_represents_full_year=full_year,
        annualisation_factor=factor,
        method=method,
    )


def annual_heating_kwh(basis: HeatingBasis) -> float:
    return basis.simulated_heating_energy_kwh * basis.annualisation_factor


def fuel_litres(heating_kwh: float, lhv_kwh_per_litre: float, efficiency: float) -> float:
    if lhv_kwh_per_litre <= 0 or not (0 < efficiency <= 1):
        raise EconomicsError(ErrorCode.INVALID_LIFECYCLE_RANGE,
                             "fuel LHV must be > 0 and heater efficiency in (0, 1]")
    return heating_kwh / (lhv_kwh_per_litre * efficiency)
