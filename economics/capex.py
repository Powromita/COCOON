"""
capex.py - Initial capital cost from quantities x frozen unit costs.

Every figure is a line item (quantity, unit, rate, amount) so the CAPEX can
be audited back to geometry and to the assumption set. Line items roll up
into the M0 CapexBreakdown categories:

    materials  - envelope layer materials, windows, doors, staircases
    labour     - construction labour per m2 of constructed area
    transport  - haulage of transported material + heater mass
    equipment  - heater purchase (per unit + per installed kW) and installation

Two capital "assets" are tracked for replacement and residual value:
envelope (materials + labour + transport) and heating equipment.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from cocoon_contracts import CapexBreakdown, ErrorCode
from economics.assumptions import CostUnit, ResolvedAssumptions
from economics.errors import EconomicsError
from economics.quantities import QuantityTakeoff


class CapexLineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str          # materials | labour | transport | equipment
    asset: str             # envelope | heating_equipment
    item: str
    quantity: float
    unit: str
    rate_inr: float
    amount_inr: float


class CapexResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_items: list[CapexLineItem]
    breakdown: CapexBreakdown
    envelope_cost_inr: float
    heating_equipment_cost_inr: float
    installed_heater_capacity_kw: float
    shipped_mass_kg: float


def _li(items, category, asset, item, qty, unit, rate):
    items.append(CapexLineItem(category=category, asset=asset, item=item, quantity=qty,
                               unit=unit, rate_inr=rate, amount_inr=qty * rate))


def compute_capex(q: QuantityTakeoff, a: ResolvedAssumptions) -> CapexResult:
    items: list[CapexLineItem] = []

    unpriced = sorted(m for m in q.materials if m not in a.material_costs)
    if unpriced:
        raise EconomicsError(
            ErrorCode.UNSUPPORTED_MATERIAL,
            f"assumption set '{a.set_id}' v{a.set_version} has no unit cost for {unpriced}; "
            "M7 never falls back to hidden prices",
            {"unpriced_material_ids": unpriced})

    shipped_kg = 0.0
    for mid in sorted(q.materials):
        m = q.materials[mid]
        unit, rate, transported = a.material_costs[mid]
        qty = {CostUnit.PER_M3: m.volume_m3, CostUnit.PER_M2: m.layer_area_m2,
               CostUnit.PER_KG: m.mass_kg}[unit]
        _li(items, "materials", "envelope", f"material {mid} ({m.display_name})", qty, unit.value, rate)
        if transported:
            shipped_kg += m.mass_kg

    o = q.openings
    _li(items, "materials", "envelope", "windows", o.window_area_m2, "m2", a.window_inr_per_m2)
    _li(items, "materials", "envelope", "external doors", o.external_door_count, "unit",
        a.external_door_inr_per_unit)
    _li(items, "materials", "envelope", "internal doors", o.internal_door_count, "unit",
        a.internal_door_inr_per_unit)
    _li(items, "materials", "envelope", "staircases", q.staircase_count, "unit", a.staircase_inr_per_unit)

    _li(items, "labour", "envelope", "construction labour (constructed area)",
        q.constructed_area_m2, "m2", a.labour_inr_per_m2)

    installed_kw = q.heater_design_peak_kw_total * a.heater_sizing_margin
    _li(items, "equipment", "heating_equipment", "heater units", q.heater_count, "unit",
        a.heater_purchase_inr_per_unit)
    _li(items, "equipment", "heating_equipment",
        f"heater capacity (peak x {a.heater_sizing_margin:g} margin)", installed_kw, "kW",
        a.heater_purchase_inr_per_kw)
    _li(items, "equipment", "heating_equipment", "heater installation", q.heater_count, "unit",
        a.heater_installation_inr_per_unit)

    shipped_kg += q.heater_count * a.heater_unit_mass_kg
    tonne_km_rate = a.transport_rate_inr_per_tonne_km * a.remote_logistics_multiplier
    _li(items, "transport", "envelope",
        f"haulage {a.transport_distance_km:g} km x {a.remote_logistics_multiplier:g} remote multiplier",
        shipped_kg / 1000.0 * a.transport_distance_km, "tonne-km", tonne_km_rate)

    tot = {c: 0.0 for c in ("materials", "labour", "transport", "equipment")}
    env = heat = 0.0
    for li in items:
        tot[li.category] += li.amount_inr
        if li.asset == "envelope":
            env += li.amount_inr
        else:
            heat += li.amount_inr

    breakdown = CapexBreakdown(
        materials_inr=tot["materials"], labour_inr=tot["labour"],
        transport_inr=tot["transport"], equipment_inr=tot["equipment"],
        total_capex_inr=sum(tot.values()))
    return CapexResult(line_items=items, breakdown=breakdown, envelope_cost_inr=env,
                       heating_equipment_cost_inr=heat, installed_heater_capacity_kw=installed_kw,
                       shipped_mass_kg=shipped_kg)
