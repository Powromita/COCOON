# M7 — Lifecycle Economics

Implements PRD v4 §13. Consumes M0 contracts only (`BuildingModel`, conditioned
`SimulationResult`, `MaterialSnapshot`). Outputs one M0 `EconomicAnalysisResult`
per scenario (low / expected / high), wrapped in an `EconomicAnalysisReport`.

```text
BuildingModel ──► quantities.py ──► capex.py ─┐
SimulationResult ─► heating_fuel.py ──────────┼─► opex.py ─► lifecycle.py ─► analysis.py ─► report
LifecycleAssumptionSet (data/costs/) ─────────┘                 (baseline, NPV, payback) + sensitivity.py
```

It never imports `thermal-calculator/thermal_model.py` or any other module's
internals. `tests/test_assumptions.py` enforces this.

## API (backend/routes/economics.py)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/v1/economic-assumption-sets` | list versioned sets (id, version, date, source, owner, checksum) |
| GET  | `/api/v1/economic-assumption-sets/{id}?version=` | full set + its M0 per-scenario projections |
| POST | `/api/v1/economics` | run an analysis (optional `Idempotency-Key` header) → 201 report |
| GET  | `/api/v1/economics/{analysis_id}` | fetch a persisted report |

Minimal request:

```json
{
  "assumption_set_id": "econ_ladakh_v1",
  "occupants": 20,
  "design":   {"building": {...BuildingModel}, "simulation": {...SimulationResult},
               "simulated_hours": 24, "target_temperature_c": 15},
  "baseline": {"building": {...}, "simulation": {...}, "simulated_hours": 24,
               "target_temperature_c": 15, "kind": "standard_uninsulated_template",
               "label": "uninsulated airlock + living"}
}
```

`baseline` is optional. When present it must be a different revision with the
same weather snapshot, schedules, heating target, simulated window, engine and
economic framework (PRD §13.6), or the request fails with `CROSS_REVISION_MISMATCH`.
Errors use the M0 `ErrorEnvelope`.

## Key rules

- **Fuel:** litres = annual conditioned heating kWh / (LHV × heater efficiency).
  Free-floating runs are refused.
- **Annualisation:** window kWh × heating-season days × 24 / simulated hours.
  This is an explicit assumption. Set `simulation_represents_full_year` for
  8760-hour runs.
- **LCC:** CAPEX + Σ OPEX_y/(1+r)^y − residual_N/(1+r)^N, in real INR at the
  set's effective date.
- **Replacements:** fall due at round(k × life) while < N. Residual value uses
  straight-line remaining life.
- **Payback:** measured against the baseline. It is never extrapolated past N,
  residual value is excluded, and IRR is not reported.
- **Scenarios:** "low" applies every parameter's low value and "high" every high
  value. `parameter_sensitivity` gives the one-at-a-time drivers.
- **Quantity overrides:** need a reason, and are kept in the report and in
  `data/economics_runs/audit_log.jsonl`.
- **Currency labelling:** every scenario carries a `currency_context` with the
  currency, price date, assumption set, version and scenario.

## As M6's `EconomicsProvider`

`economics/provider.py` (`M7EconomicsProvider`, factory `make_economics`) is what `optimization` calls to price each
finalist. It accepts the base set ID or any alias (the requirements fixture's `econ_ladakh_expected_v1` is an alias of
`econ_ladakh_v1`), prices the requested scenario only, and echoes the requested ID because M6 requires that; the fully
resolved per-scenario ID stays in `provider.last_report`.

## Known limitations

- `data/costs/econ_ladakh_v1.json` holds **demonstration placeholders**, not
  procurement quotes. Replace them before any decision.
- The M0 `EconomicAssumptionSet` holds only a subset of the M7 set. The full set
  is frozen into every report, and a per-scenario M0 projection is emitted.
- The M0 `EconomicAnalysisResult` has no residual-value field.
  `lcc_inr = capex + Σ discounted_opex − residual_value_pv_inr`, and the residual
  is reported alongside the result in the M7 report.
- Openings are priced per unit/m² but carry no mass, so window and door haulage
  is not included in transport.

Run the tests with `python -m pytest economics/tests backend/tests/test_economics_routes.py`.
