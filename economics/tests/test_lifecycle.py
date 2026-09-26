"""
PRD 13.7 acceptance tests plus the lifecycle arithmetic they rest on.

    1. zero discount rate equals undiscounted summation
    2. zero annual savings produces no finite payback
    3. higher fuel price never reduces fuel expense
    4. material quantities match geometry hand checks      -> test_quantities.py
    5. 10-year totals reconcile exactly with yearly cash flows
    6. low/expected/high assumptions remain distinct and traceable
    7. all displayed currency figures identify date and assumption set
"""

import copy
import math

import pytest
from cocoon_contracts import (
    CostScenario,
    EconomicAnalysisResult,
    EconomicAssumptionSet,
    ErrorCode,
)

from economics import QuantityOverride, run_analysis
from economics.errors import EconomicsError
from economics.heating_fuel import fuel_litres
from economics.lifecycle import _payback
from economics.opex import replacement_years
from economics.tests._support import baseline_of, make_request, modify_set, point


def _run(aset, materials, req):
    return run_analysis(req, aset, materials, analysis_id="econ_run_0123456789ab", code_commit="test")


# ---------------------------------------------------------------- 1
def test_zero_discount_rate_equals_undiscounted_summation(aset, materials, building, simulation):
    s0 = modify_set(aset, lambda d: d.update(discount_rate_pct=point(0.0)))
    rep = _run(s0, materials, make_request(building, simulation))
    for o in rep.scenarios.values():
        res = o.result
        for p in res.annual_cash_flows:
            assert p.discounted_opex_inr == p.total_opex_inr
        undiscounted = (res.capex.total_capex_inr + sum(p.total_opex_inr for p in res.annual_cash_flows)
                        - o.residual_value_inr)
        assert res.lcc_inr == pytest.approx(undiscounted, rel=0, abs=1e-6)
        assert o.residual_value_pv_inr == o.residual_value_inr


# ---------------------------------------------------------------- 2
def test_zero_annual_savings_gives_no_finite_payback(aset, materials, building, simulation):
    # identical physics and operating costs, but the design buys extra glazing up front
    s = modify_set(aset, lambda d: d["maintenance"].update(fraction_of_capex_per_year=point(0.0)))
    bb, bs = baseline_of(building, simulation, simulation["summary"]["heating_energy_kwh"],
                         strip_puf=False)
    req = make_request(building, simulation, (bb, bs))
    req.design.quantity_overrides = [
        QuantityOverride(key="window_area_m2", value=6.0, reason="extra glazing specified by user")]
    rep = _run(s, materials, req)
    for o in rep.scenarios.values():
        c = o.comparison
        assert c.incremental_capex_inr > 0
        assert all(abs(x) < 1e-6 for x in c.cumulative_savings_inr)
        assert c.simple_payback_years is None
        assert c.discounted_payback_years is None
        assert c.break_even_year is None
        assert c.payback_status == "no_payback_within_analysis_period"
        assert o.result.simple_payback_years is None
        assert c.npv_vs_baseline_inr < 0


def test_payback_helper_edge_cases():
    assert _payback(100.0, [0.0] * 10) is None
    assert _payback(100.0, [-5.0] * 10) is None
    assert _payback(0.0, [0.0] * 10) == 0.0
    assert _payback(100.0, [40.0, 40.0, 40.0]) == pytest.approx(2.5)
    assert _payback(100.0, [40.0, 40.0]) is None            # never extrapolated past N


# ---------------------------------------------------------------- 3
def test_higher_fuel_price_never_reduces_fuel_expense(aset, materials, building, simulation):
    prev_fuel, prev_lcc = None, None
    for price in (40.0, 60.0, 85.0, 120.0, 200.0):
        s = modify_set(aset, lambda d, p=price: d["fuel"].update(price_inr_per_litre=point(p)))
        res = _run(s, materials, make_request(building, simulation)).scenarios["expected"].result
        fuel = [p.fuel_cost_inr for p in res.annual_cash_flows]
        if prev_fuel is not None:
            assert all(f >= g for f, g in zip(fuel, prev_fuel))
            assert res.lcc_inr >= prev_lcc
        prev_fuel, prev_lcc = fuel, res.lcc_inr


def test_fuel_conversion_formula():
    # PRD 13.4: litres = kWh / (kWh/L x efficiency)
    assert fuel_litres(970.0, 9.7, 0.5) == pytest.approx(200.0)
    with pytest.raises(EconomicsError):
        fuel_litres(100.0, 9.7, 0.0)


def test_annual_fuel_uses_annualised_conditioned_rc_energy(aset, materials, building, simulation):
    o = _run(aset, materials, make_request(building, simulation)).scenarios["expected"]
    a = o.resolved_assumptions
    annual_kwh = simulation["summary"]["heating_energy_kwh"] * a.heating_season_days * 24 / 24
    assert o.heating_basis.annualisation_factor == pytest.approx(a.heating_season_days)
    assert o.result.annual_fuel_litres == pytest.approx(
        annual_kwh / (a.fuel_lhv_kwh_per_litre * a.heater_efficiency))


# ---------------------------------------------------------------- 5
def test_ten_year_totals_reconcile_exactly_with_yearly_cash_flows(aset, materials, building, simulation):
    s10 = modify_set(aset, lambda d: d.update(project_lifetime_years=10))
    bb, bs = baseline_of(building, simulation, 80.0)
    rep = _run(s10, materials, make_request(building, simulation, (bb, bs)))
    for o in rep.scenarios.values():
        res = o.result
        pts = res.annual_cash_flows
        assert [p.year for p in pts] == list(range(1, 11))
        for p in pts:
            parts = p.fuel_cost_inr + p.maintenance_cost_inr + p.replacement_cost_inr + p.logistics_cost_inr
            assert p.total_opex_inr == pytest.approx(parts, rel=0, abs=1e-9)
        total = sum(p.total_opex_inr for p in pts)
        total_d = sum(p.discounted_opex_inr for p in pts)
        assert o.total_opex_inr == total
        assert o.total_discounted_opex_inr == total_d
        assert o.year_details[-1].cumulative_opex_inr == pytest.approx(total, rel=0, abs=1e-6)
        assert o.year_details[-1].cumulative_discounted_opex_inr == pytest.approx(total_d, rel=0, abs=1e-6)
        assert res.lcc_inr == pytest.approx(
            res.capex.total_capex_inr + total_d - o.residual_value_pv_inr, rel=0, abs=1e-6)
        assert o.lcc_by_horizon_inr["10"] == pytest.approx(res.lcc_inr, rel=0, abs=1e-6)
        cap = res.capex
        assert cap.total_capex_inr == pytest.approx(
            cap.materials_inr + cap.labour_inr + cap.transport_inr + cap.equipment_inr)
        assert cap.total_capex_inr == pytest.approx(sum(li.amount_inr for li in o.capex_line_items))
        # NPV vs baseline is the LCC difference over the same 10-year horizon
        assert res.npv_vs_baseline_inr == pytest.approx(o.baseline_result.lcc_inr - res.lcc_inr)


def test_hand_calculated_lcc_single_cash_flow_stream(aset, materials, building, simulation):
    """Constant OPEX, no escalation, no replacements: LCC = CAPEX + A*annuity - residual PV."""
    def flat(d):
        d.update(project_lifetime_years=4, discount_rate_pct=point(10.0),
                 envelope_service_life_years=point(8), replacements=[])
        d["fuel"].update(real_escalation_pct_per_year=point(0.0))
        d["heater"].update(service_life_years=point(20))
    s = modify_set(aset, flat)
    o = _run(s, materials, make_request(building, simulation)).scenarios["expected"]
    res = o.result
    annual = res.annual_cash_flows[0].total_opex_inr
    assert all(p.total_opex_inr == pytest.approx(annual) for p in res.annual_cash_flows)
    annuity = sum(1 / 1.1 ** y for y in range(1, 5))
    # envelope: 8-year life, 4 years used -> half remains; heater: 20-year life -> 16/20 remains
    env = sum(li.amount_inr for li in o.capex_line_items if li.asset == "envelope")
    heat = sum(li.amount_inr for li in o.capex_line_items if li.asset == "heating_equipment")
    residual = env * 0.5 + heat * 16 / 20
    assert o.residual_value_inr == pytest.approx(residual)
    assert res.lcc_inr == pytest.approx(res.capex.total_capex_inr + annual * annuity - residual / 1.1 ** 4)


def test_replacement_schedule_and_residual_value(aset, materials, building, simulation):
    assert replacement_years(8, 15) == [8]
    assert replacement_years(5, 15) == [5, 10]
    assert replacement_years(15, 15) == []          # due at N: credited as residual instead
    o = _run(aset, materials, make_request(building, simulation)).scenarios["expected"]
    heater_years = [d.year for d in o.year_details if "heating equipment" in d.replacement_items]
    assert heater_years == [8]                       # expected heater life 8 y, N = 15
    seals = [d.year for d in o.year_details if "door seals and weather-stripping" in d.replacement_items]
    assert seals == [5, 10]
    heat = next(r for r in o.residual_items if r.asset == "heating_equipment")
    assert heat.last_installed_year == 8
    assert heat.remaining_fraction == pytest.approx((8 + 8 - 15) / 8)


# ---------------------------------------------------------------- 6
def test_low_expected_high_are_distinct_and_traceable(aset, materials, building, simulation):
    bb, bs = baseline_of(building, simulation, 80.0)
    rep = _run(aset, materials, make_request(building, simulation, (bb, bs)))
    assert set(rep.scenarios) == {"low", "expected", "high"}
    ids = {o.result.assumption_set_id for o in rep.scenarios.values()}
    assert len(ids) == 3
    lccs = {round(o.result.lcc_inr, 2) for o in rep.scenarios.values()}
    assert len(lccs) == 3
    for name, o in rep.scenarios.items():
        sc = CostScenario(name)
        m0 = rep.m0_assumption_sets[name]
        EconomicAssumptionSet.model_validate(m0.model_dump())
        assert o.result.scenario == sc and m0.scenario == sc
        assert o.result.assumption_set_id == m0.id == aset.scenario_set_id(sc)
        a = o.resolved_assumptions
        assert a.fuel_price_inr_per_litre == aset.fuel.price_inr_per_litre.pick(sc)
        assert a.discount_rate * 100 == pytest.approx(aset.discount_rate_pct.pick(sc))
        assert m0.fuel_price_inr_per_litre == a.fuel_price_inr_per_litre
        assert m0.discount_rate_pct == pytest.approx(a.discount_rate * 100)
        assert o.baseline_result.assumption_set_id == o.result.assumption_set_id
    # frozen copy of the whole set + checksum travel with the report
    assert rep.assumption_set == aset
    assert rep.assumption_set_checksum_sha256 == aset.checksum()


def test_parameter_sensitivity_reports_drivers(aset, materials, building, simulation):
    bb, bs = baseline_of(building, simulation, 80.0)
    rep = _run(aset, materials, make_request(building, simulation, (bb, bs)))
    rows = {r.parameter: r for r in rep.parameter_sensitivity}
    fuel = rows["fuel price (INR/L)"]
    assert fuel.lcc_at_low_inr < fuel.lcc_at_expected_inr < fuel.lcc_at_high_inr
    assert fuel.npv_at_low_inr < fuel.npv_at_high_inr          # dearer fuel -> larger savings
    swings = [r.lcc_swing_inr for r in rep.parameter_sensitivity]
    assert swings == sorted(swings, reverse=True)


# ---------------------------------------------------------------- 7
def test_every_currency_figure_identifies_date_and_assumption_set(aset, materials, building, simulation):
    rep = _run(aset, materials, make_request(building, simulation))
    assert rep.currency == "INR"
    for name, o in rep.scenarios.items():
        cc = o.currency_context
        assert cc.currency == "INR"
        assert cc.effective_date == aset.effective_date
        assert (cc.assumption_set_id, cc.assumption_set_version) == (aset.id, aset.version)
        assert cc.scenario_assumption_set_id == o.result.assumption_set_id
        assert aset.effective_date.strftime("%Y-%m-%d") in cc.label
        assert aset.id in cc.label and aset.version in cc.label and name in cc.label
        assert rep.m0_assumption_sets[name].effective_date == aset.effective_date


# ---------------------------------------------------------------- contract / guard rails
def test_results_are_valid_m0_economic_analysis_results(aset, materials, building, simulation):
    bb, bs = baseline_of(building, simulation, 80.0)
    rep = _run(aset, materials, make_request(building, simulation, (bb, bs)))
    for o in rep.scenarios.values():
        for r in (o.result, o.baseline_result):
            again = EconomicAnalysisResult.model_validate_json(r.model_dump_json())
            assert again.schema_version == "4.0"
            assert again.analysis_id.startswith("econ_")
        assert o.result.design_revision_id == building["revision_id"]
        assert o.baseline_result.design_revision_id == bb["revision_id"]


def test_cost_per_occupied_and_person_day(aset, materials, building, simulation):
    o = _run(aset, materials, make_request(building, simulation)).scenarios["expected"]
    a = o.resolved_assumptions
    per_day = o.result.lcc_inr / (a.project_lifetime_years * a.occupied_days_per_year)
    assert o.cost_per_occupied_day_inr == pytest.approx(per_day)
    assert o.cost_per_person_day_inr == pytest.approx(per_day / 20)


def test_fuel_and_transport_reduction_vs_baseline(aset, materials, building, simulation):
    bb, bs = baseline_of(building, simulation, 80.0)
    o = _run(aset, materials, make_request(building, simulation, (bb, bs))).scenarios["expected"]
    c = o.comparison
    a = o.resolved_assumptions
    kwh_saved = (80.0 - simulation["summary"]["heating_energy_kwh"]) * a.heating_season_days
    assert c.annual_heating_reduction_kwh == pytest.approx(kwh_saved)
    litres = kwh_saved / (a.fuel_lhv_kwh_per_litre * a.heater_efficiency)
    assert c.annual_fuel_reduction_litres == pytest.approx(litres)
    assert c.annual_fuel_transport_reduction_kg == pytest.approx(litres * a.fuel_density_kg_per_litre)
    assert c.annual_logistics_cost_reduction_inr_year1 > 0


def test_baseline_must_share_weather_schedules_target_and_period(aset, materials, building, simulation):
    bb, bs = baseline_of(building, simulation, 80.0)
    bs2 = copy.deepcopy(bs)
    bs2["provenance"]["weather_snapshot_id"] = "wx_somewhere_else"
    with pytest.raises(EconomicsError) as e:
        _run(aset, materials, make_request(building, simulation, (bb, bs2)))
    assert e.value.code == ErrorCode.CROSS_REVISION_MISMATCH
    assert any(c["check"] == "weather snapshot" for c in e.value.details["failed_checks"])

    bb2 = copy.deepcopy(bb)
    bb2["schedules"] = {}
    with pytest.raises(EconomicsError):
        _run(aset, materials, make_request(building, simulation, (bb2, bs)))

    req = make_request(building, simulation, (bb, bs))
    req.baseline.target_temperature_c = 18.0
    with pytest.raises(EconomicsError):
        _run(aset, materials, req)

    req = make_request(building, simulation, (bb, bs))
    req.baseline.simulated_hours = 48
    with pytest.raises(EconomicsError):
        _run(aset, materials, req)


def test_baseline_must_be_a_different_revision(aset, materials, building, simulation):
    bb, bs = baseline_of(building, simulation, 80.0, revision_id=building["revision_id"])
    with pytest.raises(EconomicsError) as e:
        _run(aset, materials, make_request(building, simulation, (bb, bs)))
    assert e.value.code == ErrorCode.CROSS_REVISION_MISMATCH


def test_uninsulated_template_baseline_is_declared(aset, materials, building, simulation):
    bb, bs = baseline_of(building, simulation, 80.0)
    rep = _run(aset, materials, make_request(building, simulation, (bb, bs)))
    assert rep.baseline.kind == "standard_uninsulated_template"
    assert any("STANDARD UNINSULATED TEMPLATE" in w for w in rep.warnings)
    assert all(c.passed for c in rep.comparability)


def test_simulation_must_belong_to_the_revision(aset, materials, building, simulation):
    s = copy.deepcopy(simulation)
    s["design_revision_id"] = "rev_someone_else"
    with pytest.raises(EconomicsError) as e:
        _run(aset, materials, make_request(building, s))
    assert e.value.code == ErrorCode.CROSS_REVISION_MISMATCH


def test_free_floating_simulation_is_refused(aset, materials, building, simulation):
    s = copy.deepcopy(simulation)
    s["engine"]["mode"] = "free_floating"
    with pytest.raises(EconomicsError) as e:
        _run(aset, materials, make_request(building, s))
    assert "conditioned" in e.value.message


def test_unannualisable_simulation_is_refused(aset, materials, building, simulation):
    req = make_request(building, simulation)
    req.design.simulated_hours = None
    with pytest.raises(EconomicsError) as e:
        _run(aset, materials, req)
    assert "simulated_hours" in e.value.message


def test_unpriced_material_is_refused_not_guessed(aset, materials, building, simulation):
    s = modify_set(aset, lambda d: d["materials"].pop("mat_stone"))
    with pytest.raises(EconomicsError) as e:
        _run(s, materials, make_request(building, simulation))
    assert e.value.code == ErrorCode.UNSUPPORTED_MATERIAL
    assert e.value.details["unpriced_material_ids"] == ["mat_stone"]


def test_report_is_deterministic_for_fixed_inputs(aset, materials, building, simulation):
    from datetime import datetime, timezone
    now = datetime(2026, 9, 25, tzinfo=timezone.utc)
    req = make_request(building, simulation)
    a = run_analysis(req, aset, materials, analysis_id="econ_run_aaaaaaaaaaaa", code_commit="x", now=now)
    b = run_analysis(req, aset, materials, analysis_id="econ_run_aaaaaaaaaaaa", code_commit="x", now=now)
    a_json, b_json = a.model_dump_json(), b.model_dump_json()
    # override timestamps are the only clock-dependent fields and there are none here
    assert a_json == b_json
    assert not math.isnan(a.scenarios["expected"].result.lcc_inr)
