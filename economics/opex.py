"""
opex.py - Year-by-year operating cash flows, replacements and residual value.

All money is in real INR at the assumption set's effective date. Year 0 is
construction (CAPEX); operating years are 1..N.

    fuel_y        = litres x price x (1+e_fuel)^(y-1)
    logistics_y   = litres x (delivery premium x remote multiplier) x (1+e_fuel)^(y-1)
                  + fuel tonnes x mission logistics value
    maintenance_y = (fixed + fraction x CAPEX) x (1+e_maint)^(y-1)
    replacement_y = heater / envelope / listed items falling due in year y

Replacement rule: an asset with service life L is replaced in years
round(k*L) for k = 1, 2, ... while that year is < N. A replacement due
exactly at the end of the horizon is not bought; the asset is instead
credited with residual value.

Residual value (straight-line remaining life) at the end of year N:

    residual = cost_of_last_installation x max(0, (t_last + L - N) / L)
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from cocoon_contracts import AnnualOpexPoint
from economics.assumptions import ResolvedAssumptions


class YearDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int
    fuel_litres: float
    fuel_mass_kg: float
    replacement_items: list[str]
    discount_factor: float
    cumulative_opex_inr: float
    cumulative_discounted_opex_inr: float


class ResidualItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset: str
    service_life_years: float
    last_installed_year: int
    installed_cost_inr: float
    remaining_fraction: float
    residual_value_inr: float


class CashFlows(BaseModel):
    model_config = ConfigDict(extra="forbid")
    horizon_years: int
    points: list[AnnualOpexPoint]
    details: list[YearDetail]
    residual_items: list[ResidualItem]
    residual_value_inr: float
    residual_value_pv_inr: float


def replacement_years(service_life: float, horizon: int) -> list[int]:
    years, k = [], 1
    while True:
        y = int(round(k * service_life))
        if y >= horizon:
            return years
        if y >= 1 and (not years or y > years[-1]):
            years.append(y)
        k += 1


def _residual(asset: str, life: float, horizon: int, initial_cost: float,
              repl_years: list[int], repl_cost: float) -> ResidualItem:
    t_last = repl_years[-1] if repl_years else 0
    cost = repl_cost if repl_years else initial_cost
    frac = max(0.0, (t_last + life - horizon) / life)
    return ResidualItem(asset=asset, service_life_years=life, last_installed_year=t_last,
                        installed_cost_inr=cost, remaining_fraction=frac,
                        residual_value_inr=cost * frac)


def build_cash_flows(a: ResolvedAssumptions, horizon: int, annual_litres: float,
                     capex_total: float, envelope_cost: float,
                     heating_equipment_cost: float) -> CashFlows:
    r = a.discount_rate
    heater_repl = replacement_years(a.heater_service_life_years, horizon) if heating_equipment_cost > 0 else []
    heater_repl_cost = heating_equipment_cost * a.heater_replacement_cost_fraction
    env_repl = replacement_years(a.envelope_service_life_years, horizon)
    extras = [(name, interval, replacement_years(interval, horizon), cost)
              for name, interval, cost in a.replacements]

    fuel_mass_kg = annual_litres * a.fuel_density_kg_per_litre
    points: list[AnnualOpexPoint] = []
    details: list[YearDetail] = []
    cum = cum_d = 0.0
    for y in range(1, horizon + 1):
        esc_f = (1.0 + a.fuel_escalation) ** (y - 1)
        esc_m = (1.0 + a.maintenance_escalation) ** (y - 1)
        fuel = annual_litres * a.fuel_price_inr_per_litre * esc_f
        logistics = (annual_litres * a.fuel_delivery_premium_inr_per_litre * a.remote_logistics_multiplier * esc_f
                     + fuel_mass_kg / 1000.0 * a.mission_logistics_inr_per_tonne_fuel)
        maintenance = (a.maintenance_fixed_inr_per_year + a.maintenance_fraction_of_capex * capex_total) * esc_m

        replacement, what = 0.0, []
        if y in heater_repl:
            replacement += heater_repl_cost
            what.append("heating equipment")
        if y in env_repl:
            replacement += envelope_cost
            what.append("envelope")
        for name, _, yrs, cost in extras:
            if y in yrs:
                replacement += cost
                what.append(name)

        total = fuel + logistics + maintenance + replacement
        df = 1.0 / (1.0 + r) ** y
        cum += total
        cum_d += total * df
        points.append(AnnualOpexPoint(
            year=y, fuel_cost_inr=fuel, maintenance_cost_inr=maintenance,
            replacement_cost_inr=replacement, logistics_cost_inr=logistics,
            total_opex_inr=total, discounted_opex_inr=total * df))
        details.append(YearDetail(
            year=y, fuel_litres=annual_litres, fuel_mass_kg=fuel_mass_kg, replacement_items=what,
            discount_factor=df, cumulative_opex_inr=cum, cumulative_discounted_opex_inr=cum_d))

    residuals = [_residual("envelope", a.envelope_service_life_years, horizon, envelope_cost,
                           env_repl, envelope_cost)]
    if heating_equipment_cost > 0:
        residuals.append(_residual("heating_equipment", a.heater_service_life_years, horizon,
                                   heating_equipment_cost, heater_repl, heater_repl_cost))
    for name, interval, yrs, cost in extras:
        if yrs:   # before its first replacement the item is part of the envelope asset
            residuals.append(_residual(name, float(interval), horizon, cost, yrs, cost))
    residual = sum(ri.residual_value_inr for ri in residuals)
    return CashFlows(horizon_years=horizon, points=points, details=details,
                     residual_items=residuals, residual_value_inr=residual,
                     residual_value_pv_inr=residual / (1.0 + r) ** horizon)
