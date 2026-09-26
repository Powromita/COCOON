"""
analysis.py - M7 orchestration:

    BuildingModel + conditioned SimulationResult (+ baseline revision)
        -> quantities -> CAPEX -> yearly cash flows -> LCC / NPV / payback
        -> low / expected / high EconomicAnalysisResult (M0) + audit report

Pure function of its inputs: no I/O, no clock unless `now` is omitted.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from cocoon_contracts import (
    SCHEMA_VERSION,
    CostScenario,
    EconomicAnalysisResult,
    ErrorCode,
    MaterialSnapshot,
)
from economics.assumptions import SCENARIOS, LifecycleAssumptionSet, ResolvedAssumptions
from economics.errors import EconomicsError
from economics.heating_fuel import annual_heating_kwh, heating_basis, simulated_hours_of
from economics.lifecycle import DesignEconomics, compare_to_baseline, evaluate_design
from economics.models import (
    BaselineComparison,
    ComparabilityCheck,
    CurrencyContext,
    DesignInput,
    EconomicAnalysisReport,
    EconomicsRequest,
    EvaluatedRevision,
    Provenance,
    ScenarioOutcome,
)
from economics.quantities import QuantityTakeoff, apply_overrides, compute_quantities
from economics.sensitivity import parameter_sensitivity
from economics.version import M7_VERSION

METHOD_NOTES = [
    "All money is real INR at the assumption set's effective date; year 0 = CAPEX, years 1..N = operation.",
    "LCC = CAPEX + sum_y OPEX_y/(1+r)^y - residual_N/(1+r)^N (PRD 13.5).",
    "Fuel litres = annual conditioned RC heating kWh / (fuel LHV kWh/L x heater efficiency) (PRD 13.4).",
    "Annual heating kWh = simulated-window kWh x heating-season days x 24 / simulated hours, unless the "
    "simulation is a full year.",
    "Quantities come from the BuildingModel geometry; paired internal surfaces are counted once and "
    "opening areas are deducted from their parent surface.",
    "Replacements fall due at round(k x service life) while < N; residual value is straight-line remaining life.",
    "Scenario low/expected/high applies every parameter's low/expected/high value (an assumption bracket, "
    "not a cost ordering); see parameter_sensitivity for per-driver effects.",
    "Payback excludes residual value and is never extrapolated beyond the analysis period; IRR is not reported.",
]


def _hash(model) -> str:
    if isinstance(model, dict):
        data = {k: (v.model_dump(mode="json") if hasattr(v, "model_dump") else v) for k, v in model.items()}
    else:
        data = model.model_dump(mode="json")
    canon = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def _check_revision_link(d: DesignInput, role: str) -> None:
    if d.simulation.design_revision_id != d.building.revision_id:
        raise EconomicsError(
            ErrorCode.CROSS_REVISION_MISMATCH,
            f"{role} simulation '{d.simulation.simulation_id}' is for revision "
            f"'{d.simulation.design_revision_id}', not '{d.building.revision_id}'",
            {"role": role})


def _comparability(req: EconomicsRequest, aset: LifecycleAssumptionSet,
                   materials: MaterialSnapshot) -> list[ComparabilityCheck]:
    d, b = req.design, req.baseline
    ds, bs = d.simulation, b.simulation

    def c(name, dv, bv, ok=None):
        return ComparabilityCheck(check=name, design_value=str(dv), baseline_value=str(bv),
                                  passed=(dv == bv) if ok is None else ok)

    d_hours = simulated_hours_of(ds, d.simulated_hours)
    b_hours = simulated_hours_of(bs, b.simulated_hours)
    d_start = min(p.timestamp for p in ds.time_series) if ds.time_series else None
    b_start = min(p.timestamp for p in bs.time_series) if bs.time_series else None
    checks = [
        c("baseline is a different frozen revision", d.building.revision_id, b.building.revision_id,
          d.building.revision_id != b.building.revision_id),
        c("weather snapshot", ds.provenance.weather_snapshot_id, bs.provenance.weather_snapshot_id),
        c("schedules (sha256 of BuildingModel.schedules)", _hash(d.building.schedules)[:16],
          _hash(b.building.schedules)[:16]),
        c("heating target (degC)", d.target_temperature_c, b.target_temperature_c,
          d.target_temperature_c is not None and d.target_temperature_c == b.target_temperature_c),
        c("simulated window (h)", round(d_hours, 6), round(b_hours, 6)),
        c("full-year flag", d.simulation_represents_full_year, b.simulation_represents_full_year),
        c("engine", f"{ds.engine.name} {ds.engine.version} {ds.engine.mode.value}",
          f"{bs.engine.name} {bs.engine.version} {bs.engine.mode.value}"),
        c("economic framework (assumption set + materials)",
          f"{aset.id} v{aset.version} / {materials.snapshot_id}",
          f"{aset.id} v{aset.version} / {materials.snapshot_id}"),
    ]
    if d_start is not None and b_start is not None:
        checks.append(c("simulated window start", d_start.isoformat(), b_start.isoformat(),
                        d_start == b_start))
    return checks


def _currency_context(aset: LifecycleAssumptionSet, s: CostScenario) -> CurrencyContext:
    sid = aset.scenario_set_id(s)
    return CurrencyContext(
        currency="INR", effective_date=aset.effective_date, assumption_set_id=aset.id,
        assumption_set_version=aset.version, scenario_assumption_set_id=sid, scenario=s.value,
        label=(f"INR, real prices as of {aset.effective_date:%Y-%m-%d}; assumption set "
               f"{aset.id} v{aset.version}, {s.value} scenario ({sid})"))


def _m0_result(analysis_id: str, revision_id: str, a: ResolvedAssumptions, e: DesignEconomics,
               created_at: datetime, cmp=None) -> EconomicAnalysisResult:
    if e.lcc_inr < 0:
        raise EconomicsError(ErrorCode.INVALID_LIFECYCLE_RANGE,
                             f"negative LCC ({e.lcc_inr:.2f}) for revision '{revision_id}'; "
                             "residual value exceeds lifecycle outlay - check assumptions")
    return EconomicAnalysisResult(
        schema_version=SCHEMA_VERSION,
        analysis_id=analysis_id,
        design_revision_id=revision_id,
        assumption_set_id=a.scenario_set_id,
        scenario=a.scenario,
        capex=e.capex.breakdown,
        annual_cash_flows=e.cash_flows.points,
        lcc_inr=e.lcc_inr,
        npv_vs_baseline_inr=cmp["npv"] if cmp else None,
        simple_payback_years=cmp["payback"].simple_payback_years if cmp else None,
        discounted_payback_years=cmp["payback"].discounted_payback_years if cmp else None,
        break_even_year=cmp["payback"].break_even_year if cmp else None,
        annual_fuel_litres=e.annual_fuel_litres,
        created_at=created_at,
    )


def _horizons(aset: LifecycleAssumptionSet) -> list[int]:
    n = aset.project_lifetime_years
    return sorted({h for h in aset.lcc_horizons_years if 1 <= h <= n} | {n})


def run_analysis(req: EconomicsRequest, aset: LifecycleAssumptionSet, materials: MaterialSnapshot,
                 *, analysis_id: str | None = None, code_commit: str = "unknown",
                 now: datetime | None = None, only_scenarios: tuple[CostScenario, ...] | None = None,
                 with_sensitivity: bool = True) -> EconomicAnalysisReport:
    analysis_id = analysis_id or f"econ_run_{uuid.uuid4().hex[:12]}"
    created_at = now or datetime.now(timezone.utc)
    warnings: list[str] = []

    _check_revision_link(req.design, "design")
    comparability: list[ComparabilityCheck] = []
    if req.baseline is not None:
        _check_revision_link(req.baseline, "baseline")
        comparability = _comparability(req, aset, materials)
        failed = [c for c in comparability if not c.passed]
        if failed:
            raise EconomicsError(
                ErrorCode.CROSS_REVISION_MISMATCH,
                "baseline is not comparable (PRD 13.6: same weather, schedules, target, analysis "
                "period and economic framework): " + "; ".join(c.check for c in failed),
                {"failed_checks": [c.model_dump() for c in failed]})
        if req.baseline.kind == "standard_uninsulated_template":
            warnings.append(f"Baseline '{req.baseline.label}' is a STANDARD UNINSULATED TEMPLATE, "
                            "not a previously deployed shelter.")

    def takeoff(d: DesignInput) -> QuantityTakeoff:
        q = compute_quantities(d.building, materials, d.simulation)
        return apply_overrides(q, d.quantity_overrides)

    q_d = takeoff(req.design)
    q_b = takeoff(req.baseline) if req.baseline else None
    warnings += q_d.warnings + ([f"baseline: {w}" for w in q_b.warnings] if q_b else [])

    def annual_kwh(d: DesignInput, a: ResolvedAssumptions):
        basis = heating_basis(d.simulation, d.simulated_hours, d.simulation_represents_full_year,
                              a.heating_season_days)
        return basis, annual_heating_kwh(basis)

    def evaluate(a: ResolvedAssumptions, horizon: int | None = None):
        bd, kd = annual_kwh(req.design, a)
        ed = evaluate_design(q_d, a, kd, horizon)
        if req.baseline is None:
            return bd, ed, None, None
        bb, kb = annual_kwh(req.baseline, a)
        return bd, ed, bb, evaluate_design(q_b, a, kb, horizon)

    horizons = _horizons(aset)
    scenarios: dict[str, ScenarioOutcome] = {}
    for s in (only_scenarios or SCENARIOS):
        a = aset.resolve(s)
        bd, ed, bb, eb = evaluate(a)

        lcc_h = {str(h): evaluate(a, h)[1].lcc_inr for h in horizons}
        lcc_h_b = {str(h): evaluate(a, h)[3].lcc_inr for h in horizons} if eb else None

        comparison = cmp = None
        if eb is not None:
            pb = compare_to_baseline(ed, eb)
            npv = eb.lcc_inr - ed.lcc_inr
            cmp = {"npv": npv, "payback": pb}
            cum, cum_list = 0.0, []
            for pd_, pb_ in zip(ed.cash_flows.points, eb.cash_flows.points):
                cum += pb_.total_opex_inr - pd_.total_opex_inr
                cum_list.append(cum)
            comparison = BaselineComparison(
                npv_vs_baseline_inr=npv,
                incremental_capex_inr=pb.incremental_capex_inr,
                simple_payback_years=pb.simple_payback_years,
                discounted_payback_years=pb.discounted_payback_years,
                break_even_year=pb.break_even_year,
                payback_status=pb.status,
                annual_heating_reduction_kwh=eb.annual_heating_kwh - ed.annual_heating_kwh,
                annual_fuel_reduction_litres=eb.annual_fuel_litres - ed.annual_fuel_litres,
                annual_fuel_reduction_pct=(100.0 * (eb.annual_fuel_litres - ed.annual_fuel_litres)
                                           / eb.annual_fuel_litres) if eb.annual_fuel_litres > 0 else None,
                annual_fuel_transport_reduction_kg=eb.annual_fuel_mass_kg - ed.annual_fuel_mass_kg,
                annual_logistics_cost_reduction_inr_year1=(eb.cash_flows.points[0].logistics_cost_inr
                                                           - ed.cash_flows.points[0].logistics_cost_inr),
                cumulative_savings_inr=cum_list)

        occ_days = a.project_lifetime_years * a.occupied_days_per_year
        per_day = ed.lcc_inr / occ_days
        scenarios[s.value] = ScenarioOutcome(
            scenario=s.value,
            currency_context=_currency_context(aset, s),
            resolved_assumptions=a,
            heating_basis=bd,
            result=_m0_result(f"{analysis_id}_{s.value}", req.design.building.revision_id, a, ed,
                              created_at, cmp),
            capex_line_items=ed.capex.line_items,
            installed_heater_capacity_kw=ed.capex.installed_heater_capacity_kw,
            shipped_mass_kg=ed.capex.shipped_mass_kg,
            year_details=ed.cash_flows.details,
            total_opex_inr=ed.total_opex_inr,
            total_discounted_opex_inr=ed.total_discounted_opex_inr,
            residual_items=ed.cash_flows.residual_items,
            residual_value_inr=ed.cash_flows.residual_value_inr,
            residual_value_pv_inr=ed.cash_flows.residual_value_pv_inr,
            lcc_by_horizon_inr=lcc_h,
            cost_per_occupied_day_inr=per_day,
            cost_per_person_day_inr=(per_day / req.occupants) if req.occupants else None,
            baseline_heating_basis=bb,
            baseline_result=(_m0_result(f"{analysis_id}_{s.value}_baseline",
                                        req.baseline.building.revision_id, a, eb, created_at)
                             if eb else None),
            baseline_lcc_by_horizon_inr=lcc_h_b,
            comparison=comparison,
        )

    def evaluate_for_sensitivity(a: ResolvedAssumptions):
        _, ed, _, eb = evaluate(a)
        return ed.lcc_inr, (eb.lcc_inr - ed.lcc_inr) if eb else None

    if not req.occupants:
        warnings.append("occupants not provided: cost per person-day not calculated.")

    def revision(d: DesignInput, q: QuantityTakeoff, kind=None, label=None) -> EvaluatedRevision:
        return EvaluatedRevision(design_id=d.building.design_id, revision_id=d.building.revision_id,
                                 simulation_id=d.simulation.simulation_id,
                                 weather_snapshot_id=d.simulation.provenance.weather_snapshot_id,
                                 quantities=q, kind=kind, label=label)

    hashes = {"design_building": _hash(req.design.building),
              "design_simulation": _hash(req.design.simulation),
              "materials": _hash(materials),
              "assumption_set": aset.checksum()}
    if req.baseline:
        hashes["baseline_building"] = _hash(req.baseline.building)
        hashes["baseline_simulation"] = _hash(req.baseline.simulation)

    return EconomicAnalysisReport(
        analysis_id=analysis_id,
        created_at=created_at,
        currency="INR",
        assumption_set=aset,
        assumption_set_checksum_sha256=aset.checksum(),
        m0_assumption_sets={s.value: aset.to_m0(s) for s in SCENARIOS},
        occupants=req.occupants,
        design=revision(req.design, q_d),
        baseline=revision(req.baseline, q_b, req.baseline.kind, req.baseline.label) if req.baseline else None,
        comparability=comparability,
        scenarios=scenarios,
        parameter_sensitivity=parameter_sensitivity(aset, evaluate_for_sensitivity) if with_sensitivity else [],
        method_notes=METHOD_NOTES,
        warnings=warnings,
        provenance=Provenance(m7_version=M7_VERSION, contracts_schema_version=SCHEMA_VERSION,
                              code_commit=code_commit, input_hashes=hashes,
                              material_snapshot_id=materials.snapshot_id),
    )
