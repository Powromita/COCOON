"""
lifecycle.py - Lifecycle cost and baseline comparison (PRD Section 13.5).

    LCC = CAPEX
        + sum_y[(fuel_y + maintenance_y + replacement_y + logistics_y) / (1+r)^y]
        - residual_value_N / (1+r)^N

Baseline comparison (design vs. baseline, same frozen assumptions):

    savings_y            = baseline_opex_y - design_opex_y
    incremental CAPEX    = design_capex - baseline_capex
    NPV vs baseline      = LCC_baseline - LCC_design   (> 0: the design is cheaper)
    simple payback       = first (fractional) year where cumulative savings
                           >= incremental CAPEX, linear within the year
    discounted payback   = same on discounted savings
    break-even year      = first year-end at which cumulative discounted
                           savings >= incremental CAPEX

Payback is never extrapolated past the analysis period and residual value
is excluded from payback (it is only realised at N); NPV includes it.
If the design costs no more up front, payback is 0 and break-even is year 1.
No finite payback exists when cumulative savings never recover the
incremental CAPEX within the horizon (e.g. zero annual savings).
IRR is deliberately not reported (PRD 13.5: optional, often misleading).
"""

from __future__ import annotations

import math

from pydantic import BaseModel, ConfigDict

from economics.assumptions import ResolvedAssumptions
from economics.capex import CapexResult, compute_capex
from economics.heating_fuel import fuel_litres
from economics.opex import CashFlows, build_cash_flows
from economics.quantities import QuantityTakeoff


class DesignEconomics(BaseModel):
    """One design x one scenario x one horizon."""
    model_config = ConfigDict(extra="forbid")
    horizon_years: int
    annual_heating_kwh: float
    annual_fuel_litres: float
    annual_fuel_mass_kg: float
    capex: CapexResult
    cash_flows: CashFlows
    total_opex_inr: float
    total_discounted_opex_inr: float
    lcc_inr: float


class PaybackResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    incremental_capex_inr: float
    simple_payback_years: float | None
    discounted_payback_years: float | None
    break_even_year: int | None
    status: str


def evaluate_design(q: QuantityTakeoff, a: ResolvedAssumptions, annual_heating_kwh: float,
                    horizon: int | None = None) -> DesignEconomics:
    horizon = horizon or a.project_lifetime_years
    litres = fuel_litres(annual_heating_kwh, a.fuel_lhv_kwh_per_litre, a.heater_efficiency)
    capex = compute_capex(q, a)
    cf = build_cash_flows(a, horizon, litres, capex.breakdown.total_capex_inr,
                          capex.envelope_cost_inr, capex.heating_equipment_cost_inr)
    total = sum(p.total_opex_inr for p in cf.points)
    total_d = sum(p.discounted_opex_inr for p in cf.points)
    lcc = capex.breakdown.total_capex_inr + total_d - cf.residual_value_pv_inr
    return DesignEconomics(
        horizon_years=horizon, annual_heating_kwh=annual_heating_kwh, annual_fuel_litres=litres,
        annual_fuel_mass_kg=litres * a.fuel_density_kg_per_litre, capex=capex, cash_flows=cf,
        total_opex_inr=total, total_discounted_opex_inr=total_d, lcc_inr=lcc)


def _payback(incremental: float, savings: list[float]) -> float | None:
    if incremental <= 0:
        return 0.0
    cum = 0.0
    for i, s in enumerate(savings, start=1):
        if s > 0 and cum + s >= incremental:
            return (i - 1) + (incremental - cum) / s
        cum += s
    return None


def compare_to_baseline(design: DesignEconomics, baseline: DesignEconomics) -> PaybackResult:
    if design.horizon_years != baseline.horizon_years:
        raise ValueError("design and baseline must share the analysis period")
    inc = design.capex.breakdown.total_capex_inr - baseline.capex.breakdown.total_capex_inr
    savings = [b.total_opex_inr - d.total_opex_inr
               for d, b in zip(design.cash_flows.points, baseline.cash_flows.points)]
    savings_d = [b.discounted_opex_inr - d.discounted_opex_inr
                 for d, b in zip(design.cash_flows.points, baseline.cash_flows.points)]
    simple = _payback(inc, savings)
    disc = _payback(inc, savings_d)
    if disc is None:
        be = None
    elif disc == 0.0:
        be = 1
    else:
        be = max(1, math.ceil(disc - 1e-9))
    if inc <= 0:
        status = "design_costs_no_more_upfront"
    elif simple is None:
        status = "no_payback_within_analysis_period"
    else:
        status = "pays_back"
    return PaybackResult(incremental_capex_inr=inc, simple_payback_years=simple,
                         discounted_payback_years=disc, break_even_year=be, status=status)
