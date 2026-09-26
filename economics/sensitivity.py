"""
sensitivity.py - Low/expected/high scenarios and one-at-a-time drivers
(PRD Section 13.5, FR-016).

Scenario runs (low / expected / high) are produced by analysis.py from the
frozen set. This module adds a one-at-a-time (tornado) view: starting from
the expected scenario, each uncertain parameter alone is moved to its low
and high value, showing which assumptions actually drive LCC and NPV.
"""

from __future__ import annotations

from typing import Callable

from cocoon_contracts import CostScenario
from economics.assumptions import LifecycleAssumptionSet, ResolvedAssumptions
from economics.models import SensitivityRow

# ResolvedAssumptions attribute -> display name
DRIVERS: dict[str, str] = {
    "discount_rate": "discount rate (fraction)",
    "fuel_price_inr_per_litre": "fuel price (INR/L)",
    "fuel_escalation": "fuel real escalation (fraction/yr)",
    "fuel_delivery_premium_inr_per_litre": "fuel delivery premium (INR/L)",
    "fuel_lhv_kwh_per_litre": "fuel LHV (kWh/L)",
    "heater_efficiency": "heater efficiency",
    "heating_season_days": "heating season (days/yr)",
    "labour_inr_per_m2": "construction labour (INR/m2)",
    "transport_distance_km": "transport distance (km)",
    "remote_logistics_multiplier": "remote logistics multiplier",
    "maintenance_fraction_of_capex": "maintenance (fraction of CAPEX/yr)",
    "heater_service_life_years": "heater service life (yr)",
    "envelope_service_life_years": "envelope service life (yr)",
}

Evaluator = Callable[[ResolvedAssumptions], tuple[float, float | None]]


def parameter_sensitivity(aset: LifecycleAssumptionSet, evaluate: Evaluator) -> list[SensitivityRow]:
    """`evaluate(resolved) -> (design LCC, NPV vs baseline or None)`."""
    lo = aset.resolve(CostScenario.LOW)
    ex = aset.resolve(CostScenario.EXPECTED)
    hi = aset.resolve(CostScenario.HIGH)
    lcc_ex, npv_ex = evaluate(ex)
    rows: list[SensitivityRow] = []
    for attr, name in DRIVERS.items():
        v_lo, v_ex, v_hi = getattr(lo, attr), getattr(ex, attr), getattr(hi, attr)
        if v_lo == v_hi:
            continue
        lcc_lo, npv_lo = evaluate(ex.model_copy(update={attr: v_lo}))
        lcc_hi, npv_hi = evaluate(ex.model_copy(update={attr: v_hi}))
        rows.append(SensitivityRow(
            parameter=name, low_value=v_lo, expected_value=v_ex, high_value=v_hi,
            lcc_at_low_inr=lcc_lo, lcc_at_expected_inr=lcc_ex, lcc_at_high_inr=lcc_hi,
            npv_at_low_inr=npv_lo, npv_at_expected_inr=npv_ex, npv_at_high_inr=npv_hi,
            lcc_swing_inr=abs(lcc_hi - lcc_lo)))
    rows.sort(key=lambda r: r.lcc_swing_inr, reverse=True)
    return rows
