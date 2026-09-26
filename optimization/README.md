# optimization — COCOON Module M6

Optimization and reliability (PRD v4 sections 11.7, 12, 21). It takes the shelter designs M2 generates, has the physics
engine (M4) verify the promising ones, prices them (M7), compares them on separate objectives, and names four
recommendations with the reasons. It does **not** do the physics, the costing or the ANSYS validation itself.

- **Version:** 0.10.0. All ten build phases are done; it becomes 1.0.0 once it has run against the real M4 and M7.
- **Depends on:** the M0 contracts (`cocoon_contracts`), M2's public interface (`design_generator`), `pydantic`. No other
  COCOON module is imported; M4, M5 and M7 are reached through three small interfaces (below).
- **Status:** M4 (`m4_engine/`) and M7 (`economics/provider.py`) are now connected through `cocoon_pipeline/` (see its README);
  results from that path are `development_only: false`. The 533 tests in this package still use the test doubles in
  `optimization/tests/standins.py`. Those results are stamped `development_only` everywhere and must never be shown as
  verified or validated. Nothing here is ANSYS-validated (that is M8).

## Where it sits

```
requirements ─► M2 designs ─► constraints ─► M5 screening ─► M4 verification ─► M7 economics ─► objectives ─► Pareto
                              (no run)       (optional)       3 runs / design    priced from        │           │
                                                                                 the sized heater   ▼           ▼
                                                                          reliability (perturbation runs)  four named picks
```

ML only **screens**. Every finalist is re-simulated by M4 and every number that decides a recommendation comes from M4 or
M7, never from a prediction.

## Quick start

```bash
pip install -e packages/packages/contracts/python pytest numpy       # from the repo root

python -m optimization \
  --requirements packages/packages/contracts/fixtures/valid/requirements_ladakh_30p.json \
  --materials    packages/packages/contracts/fixtures/valid/material_snapshot_standard.json \
  --weather-id wx_leh_dev --seed 42 --count 8 --out out/m6 --created-at 2026-01-01T00:00:00+05:30

python -m pytest optimization                                          # 533 tests, about 3 minutes
```

This uses the stand-in engines (the default) and prints a `DEVELOPMENT ONLY` banner. It writes `out/m6/result.json` and,
for each recommended design, `out/m6/picks/<design_id>.building.json` (the M0 `BuildingModel`). A finished example is
kept in `optimization/fixtures/example_result_standin.json` (a test regenerates it and fails if the code drifts from it).

To plug in the real engines give `module:factory`:

```
--evaluator my_m4_adapter:make_evaluator   factory(materials: MaterialSnapshot, weather_snapshot_id: str) -> Evaluator
--economics my_m7_adapter:make_economics   factory(materials: MaterialSnapshot, requirements: RequirementsContract) -> EconomicsProvider
--economics none                           no economics: capex / lifecycle cost are unknown, cost picks are unavailable
```

Other options: `--no-reliability`, `--reliability-trials N` (seeded Monte-Carlo combinations), `--reliability-max-designs N`,
`--max-runs N` (refuse a plan needing more simulator runs), `--omit-timings` (byte-reproducible file).

Exit codes: `0` a best design was found; `3` result written but no design meets the unmet-hours limit; `2` input rejected or
plan refused (a PRD 16.6 error envelope is printed to stderr); `5` M4 unreachable (envelope says `retryable: true`); `1`
unexpected failure.

## Public interface

Everything else is internal or a stage you may call on its own. See `optimization/__init__.py`.

```python
from optimization import optimize, OptimizationSettings, to_error_envelope

result = optimize(requirements, material_snapshot, evaluator, economics,
                  weather_snapshot_id="wx_...", seed=42, count=20,
                  predictor=None, created_at=None, settings=OptimizationSettings())      # -> OptimizationResult
envelope = to_error_envelope(exc)                                                         # -> ErrorEnvelope
```

| argument | meaning |
|---|---|
| `requirements`, `material_snapshot` | M0 `RequirementsContract` and `MaterialSnapshot` (or their dicts) |
| `evaluator` | M4 or a test double: `simulate(SimulationJob) -> SimulationResult` |
| `economics` | M7 or a test double, or `None` |
| `weather_snapshot_id` | the M1 weather snapshot the evaluator will use (`wx_...`); the requirements only name a weather *source* |
| `seed`, `count` | M2's seed and how many designs to generate. Same inputs, same result (for a deterministic evaluator) |
| `predictor` | M5 (`predict(candidates) -> predictions`), or `None`: every design goes to M4 |
| `settings` | `OptimizationSettings`: options for each stage, reliability spec, cost scenario, `max_runs` |

`OptimizationResult` (a dataclass; `to_dict()` gives plain JSON): `picks` (`ranking`), `outcomes` (one per generated
design), `pareto`, `verified` (heater plan and run records per design), `objectives`, `constraint_reports`, `screening`,
`reliability`, `generation`, `runs`, `assumptions`, `warnings`, `development_only`, `timings_s`. Helpers: `result.pick(name)`,
`result.recommended`, `result.outcome(design_id)`, `result.candidate(design_id)` (the M2 candidate, with its `BuildingModel`).

**Errors.** `optimize` raises: `OptimizationError` (`INVALID_SETTINGS`, `NO_CANDIDATES`, `RUN_BUDGET_EXCEEDED`), M2's errors for
requirements that cannot be met, pydantic's `ValidationError` for malformed inputs, and `EvaluatorUnavailableError` when M4 cannot
be reached. Anything that goes wrong for **one design** is recorded on that design and never retried. `to_error_envelope`
maps everything onto the closed M0 `ErrorCode` list: M2 errors keep M2's mapping; M6's own errors become `VALIDATION_ERROR`
with the specific code in `details["m6_code"]`; `retryable` is true for an unreachable M4 / M7.

## What M6 needs from the other modules

**M4 — `Evaluator`** (`rc_verification.py`). One method, deterministic for a given job:

```python
engine_name: str; engine_version: str          # a name starting "standin_" marks a test double
def simulate(self, job: SimulationJob) -> SimulationResult
```

`SimulationJob`: `building`, `weather_snapshot_id`, `mode` (free_floating / ideal_load_conditioned / capacity_limited_conditioned),
`window_start/end`, `setpoint_c`, `timestep_seconds`, `initial_temperature_c`, `ground_temperature_c`, `heater_capacity_kw`
(each heated room's heater, capacity-limited mode only), `air_changes_per_hour`, `extras`. Three of these cannot be carried by
the M0 `SimulationRequest` today (setpoint, heater capacity, ACH) — see *Open questions*. The result must contain the zone
temperature and per-zone heating-power **time series**: objectives, heater sizing and the warm-up exclusion are computed from
them. `run_checked` refuses a result that belongs to another design, is not finite, is outside -90..90 °C, or whose energy
residual exceeds 1 %.

An evaluator may also declare `supported_perturbations = {"infiltration", "weather", "conductivity", "internal_gains",
"door_usage"}`; only the kinds it declares (default: infiltration and weather, which the job itself carries) are used by the
reliability tests. Job extras `perturbation` carries `internal_gains` / `door_usage` factors.

**M7 — `EconomicsProvider`**: `analyse(building, quantities, simulation, assumption_set_id, scenario) -> EconomicAnalysisResult`.
M6 passes the design's **capacity-limited run** (see *Heaters* for why). `analyse_checked` refuses a result for another design,
capex that does not equal its parts, lifecycle cost below capex, or cash-flow years that are not 1..N.

**M5 — `Predictor`** (`screening.py`): `predict(candidates) -> [Prediction]`, one per candidate in order. `Prediction(status,
values, reason, model_version, label_source)`, `status` one of `ok`, `out_of_distribution`, `model_unavailable`. `values` may hold
`min/mean/max_occupied_temperature_c`, `comfort_hours`, `peak_heating_kw`, `heating_energy_kwh`, `max_zone_imbalance_c`. Anything
except a complete `ok` prediction from a real (`label_source="m4"`) model sends the design straight to M4. A predictor that
crashes is treated as unavailable. Until M5 is trained, use `predictor=None`.

**M2**: only `generate_designs` and its public types (`Candidate`, `GenerationOptions`, errors). A test enforces this.

## What happens to a design

1. **Generate** (M2): valid candidates or a recorded rejection per attempt. Fewer than `count` is a warning; none is `NO_CANDIDATES`.
2. **Hard constraints, before any run** (`constraints.py`): M2 validation, footprint, floors, allowed materials, mass, heater
   fuel. A failure excludes the design with the reason. `capex_within_budget` needs a price, so it is checked after step 5;
   `assembly_time_within_limit` is **never** checked (no assembly-time model exists) and is reported as skipped, not passed.
3. **Screen** (M5, optional): a design is discarded only if another is better by more than twice the safety margin on every
   dimension. If every prediction is within one margin of the truth, a truly Pareto-optimal design cannot be discarded.
4. **Verify** (M4): free-floating, ideal-load, size the heater, capacity-limited (3 runs). Runs start at the setpoint and
   the first 48 h are ignored (see *Heaters*).
5. **Price** (M7) and re-check capex. A design whose economics fail is recorded (`failed_economics`) and left out.
6. **Objectives and Pareto** (`objectives.py`, `pareto.py`).
7. **Pick** (`ranking.py`) from the Pareto front, among designs within the unmet-hours limit.
8. **Reliability** (`reliability.py`) for the contenders; then the picks are re-ranked with it if **every** eligible design has a
   score, otherwise it is reported but not used.

### Comfort

The requirement's `target_temperature_c` is the cold limit; the requirement's `maximum_unmet_hours` is the pass/fail. A design
that exceeds it is **flagged** (kept visible, marked, never picked), not deleted. The overheating limit is target + 9 °C
(placeholder). Ranking is by balanced comfort, not mean temperature: cold degree-hours, overheating degree-hours and the
largest temperature swing are separate objectives.

### Heaters

M6 chooses the heater, the user does not. Each heated room gets one heater; one size is used for all, sized from the
ideal-load run's **settled** peak (after the 48 h warm-up) × 1.25, rounded up to a standard size. Warm-up matters: a run that starts
at −25 °C spends its first hours re-heating the building, and that burst (about 170 kW for the Ladakh example) would size an
absurd heater. Economics are priced from the **capacity-limited** run because the M0 economics interface carries only a
`SimulationResult`, not a heater plan; that run cannot draw more than the installed heaters. The plan itself (rooms, size, fuel)
is returned beside the price. M7 should price equipment from the plan (open question).

## Objectives

Each is kept separate; there is no hidden single score. Required for a design to be comparable: the first, fifth and sixth.

| objective | unit | better | comes from |
|---|---|---|---|
| `unmet_hours` | h | lower | capacity-limited run: hours an occupied room is below the target; pass/fail against the requirement |
| `cold_degree_hours` | K·h | lower | capacity-limited time series |
| `overheating_degree_hours` | K·h | lower | capacity-limited time series |
| `temperature_swing_c` | K | lower | largest max−min of any occupied room |
| `heating_energy_kwh` | kWh | lower | ideal-load run, warm-up excluded |
| `peak_heating_kw` | kW | lower | ideal-load run, warm-up excluded |
| `capex_inr`, `lcc_inr` | INR | lower | M7 |
| `mass_kg` | kg | lower | M2 bill of quantities |
| `reliability` | 0..1 | higher | perturbation tests |

Information only (never ranked): `occupied_comfort_hours`, `passive_min_temperature_c`, `passive_median_temperature_c`.
The Pareto set uses the objectives **every** comparable design has, so one missing cost cannot silently remove cost for all.

## The four picks

| pick | rule |
|---|---|
| `best_overall` | highest weighted score over all objectives (below) |
| `best_thermal` | highest weighted score over the comfort and heating objectives only |
| `lowest_lcc` | smallest lifecycle cost |
| `lowest_capex` | smallest capital cost |

Weights (placeholders, editable in `RankingSettings`, returned with every pick together with any objective dropped because a
design lacks it): thermal — unmet 3, cold 2, overheating 2, swing 1, energy 2, peak 1; overall — unmet 3, cold 1, overheating 1,
swing 1, energy 2, peak 1, lifecycle cost 3, capex 1, mass 1, reliability 2. Scores are min-max over the eligible designs, so they
compare designs within one run, not absolute quality. Ties break on design id. A pick that needs economics is `unavailable`
without it. Each pick carries its runner-up, the gap, and **explanations built only from real fields**, each naming its
sources; a sentence whose data is missing is omitted. The "largest heat-loss path" is computed from the design's U-values,
areas and air-change rate (steady state) and says so, because the M0 result has no heat-loss breakdown.

## Reliability

The score is the share of perturbed cases in which a design is still among the top-`k` recommendations (found by taking the
`best_overall` pick, removing it and picking again). The sized heater stays fixed, so a colder case can push a design over the
unmet-hours limit and out. Cases: one-at-a-time plus seeded Monte-Carlo combinations.

| kind | how | needs |
|---|---|---|
| infiltration | air changes per hour × factor | the design's own ACH |
| conductivity | every opaque assembly's layer conductivity × factor (from its own U-value and film resistances) | evaluator declares it |
| internal gains | occupant and equipment gains × factor | evaluator declares it |
| weather | another weather snapshot you supply | evaluator declares it |
| door usage | door opening frequency × factor | evaluator declares it (no stand-in does) |
| fuel price, discount rate, cost scenario | another assumption set / scenario you supply | economics provider |

A kind that cannot be run is listed in `not_tested` with the reason; it is never approximated. A failed run counts as "not
recommended" in that case and is not retried; an unavailable evaluator raises. The default factors are placeholders.

## The result

Every generated design ends in exactly one **outcome** with its stage and reason:

| status | meaning |
|---|---|
| `excluded_by_constraints` | broke a hard limit before any run |
| `discarded_by_ml` | M5 was sure another design beats it (`SCREENED_BY_ML`); never simulated |
| `failed_verification` | an M4 run failed or was untrustworthy (stage and code given) |
| `failed_economics` | M7 could not price it |
| `excluded_after_pricing` | broke the capex limit once priced |
| `not_comparable` | lacks a required objective |
| `dominated` | beaten on every objective (by which design) |
| `on_front` | not beaten; may be a pick |
| `on_front_over_unmet_limit` | not beaten, but above the unmet-hours limit, so it cannot be picked |

**Recommendation state.** Finalists verified by a real M4 carry `VERIFIED_BY_RC`; stand-in results carry none and
`development_only`. M6 never sets `VALIDATED_BY_ANSYS`.

**Proposed M0 schema.** There is no M0 contract for M6's output yet; `to_dict()` carries `"schema": "PROPOSED cocoon.m6.optimization_result 0
(not an M0 contract)"`. Its top level: `project_id, seed, weather_snapshot_id, assumption_set_id, engine, development_only,
validation, generation, summary, runs, picks, outcomes, constraints, screening, pareto, reliability, assumptions, warnings,
timings_s`. It is meant as the starting point for that contract, not as one.

## Settings marked PLACEHOLDER (review with the team)

| setting | default | where |
|---|---|---|
| overheating limit above target | 9 °C | `ObjectiveSettings.overheating_margin_c` |
| warm-up ignored | 48 h | `VerificationSettings.warmup_hours` |
| heater margin | 1.25 × settled peak | `VerificationSettings.heater_margin` |
| standard heater sizes | 1, 2, 3, 5, 7.5, 10, 15, 20, 30, 50 kW | `DEFAULT_HEATER_SIZES_KW` |
| simulation time step | 900 s | `VerificationSettings.timestep_seconds` |
| ground temperature | −10 °C | `VerificationSettings.ground_temperature_c` |
| screening safety margin / shortlist | 10 % of range / 5–20 designs | `ScreeningSettings` |
| pick weights | see above | `ranking.py` |
| reliability factors | infiltration ×0.5/1.5/2, conductivity ×0.9/1.1, gains ×0.5/1.5, doors ×0.5/2; top-3 | `PerturbationSpec` |
| contenders assessed for reliability | 8 | `OptimizationSettings.reliability_max_designs` |

## Limitations

- **Never run on the real M4 or M7.** Everything tested used stand-ins; the physics-dependent behaviour is unverified until then.
  The stand-in is crude on purpose: in the Ladakh example the best design needs **0 kWh** once settled, because 30 occupants
  give 3 kW of free heat. Do not read stand-in numbers as engineering results.
- **The Pareto front is large.** With about ten objectives most designs are unbeaten (7 of 8 in the example). The front is not a
  shortlist; the four picks are. Tolerances can be set in `ParetoSettings`.
- **Cost of a run.** Verification is 3 M4 runs per design; reliability adds 2 per design per case. With no trained M5 model every
  design goes to M4 (500 designs = 1,500 runs). `max_runs` refuses a plan that is too big; it does not shrink one.
- **Timeouts are cooperative.** A run that finishes late is marked failed; M6 cannot interrupt a running M4. The adapter must
  enforce its own timeout.
- **Screening is O(n²)** in the number of candidates (measured below).
- **One heater size for all rooms**, standard sizes are placeholders, and a design with no heated room fails.
- **Reliability is relative to the designs assessed**, and door usage, and weather / fuel-price / discount cases, only run when supplied.
- **No assembly-time model**, so `max_assembly_time_hours` is reported as skipped.

## Open questions for the other owners

- **M4:** how to call it (function or command line); how `setpoint_c`, `heater_capacity_kw` and `air_changes_per_hour` reach it
  (the M0 request has none of them); how it treats initial conditions; how shared walls and doors are represented; time per
  design; which perturbations it can honour; its own timeout.
- **M7:** price equipment from the heater plan rather than a run's peak; accept assumption-set variants for the reliability cases.
- **M5:** the `Prediction` contract above, the target list, and the model's coverage checks.
- **M0:** a schema for M6's output; ACH and setpoint fields; error codes for "evaluator unavailable" and "run budget exceeded"
  (today both travel in `details["m6_code"]` under `VALIDATION_ERROR`).
- **Team:** review every placeholder above, especially the pick weights.

## Runtime

Measured on Windows 11, Python 3.14, 16 logical CPUs, one process, with the **stand-in** M4 / M7 (`optimization/tests/standins.py`).
Indicative only: the machine's speed varied up to about 3× between identical repeats (M2 generating the same 50 designs took
3.2 s, 9.9 s and 10.2 s), so read each figure as a range, not a promise.

| designs (Ladakh example) | total | M2 generation | verification (3 runs per design) |
|---|---|---|---|
| 8 | 1.3 s | 0.4 s | 0.8 s (24 runs) |
| 50 | 26–41 s | 3–10 s | 22–31 s (150 runs) |
| 200 | 77–157 s | 34–39 s | 37–115 s (600 runs) |

- **A stand-in run costs 35–200 ms**, so verification dominates. The real M4's time per run is unknown (open question), and total
  time is about `runs × M4 seconds per run`; M6's own work is small.
- **M6's own stages at 200 designs:** constraints 0.02 s, objectives 0.5–1.8 s, Pareto 0.03–0.13 s, ranking negligible.
- **Reliability** adds `2 × contenders × cases` runs (default: at most 8 contenders × 7 cases; 126–140 runs in the examples), about
  4–24 s with the stand-in.
- **Screening** (synthetic predictions, quadratic in the number of candidates): 100 → 0.014 s, 500 → 0.4 s, 2,000 → 7 s.
- **Pareto over ten objectives** (random data): 100 → 0.008 s, 500 → 0.17 s, 2,000 → 4.5 s.

Run count for a plan: `3 × designs sent to M4 + 2 × contenders × cases`. Without a trained M5 model every design is sent to M4.
Set `max_runs` to refuse a plan that is too big.

## Tests

`python -m pytest optimization` — 533 tests (M2's 350 are run with `python -m pytest design_generator`; together 883, all passing). Besides unit tests, hand-calculated checks and an independent cross-check of
`optimize()` against the stages called one by one, every phase was **mutation-checked**: the code was deliberately broken and the
tests had to fail each time; survivors were closed with new tests (more than 130 breakages in phases 6 to 9 alone: 19, 29, 37 and 51). A boundary test
enforces that M6 imports other modules only through their public names and that the test doubles are never reachable from the library.

## Files

| file | role |
|---|---|
| `pipeline.py` | `optimize()`, `OptimizationSettings`, `OptimizationResult`, `to_error_envelope` |
| `rc_verification.py` | the M4 / M7 interfaces, run checks, heater sizing, verification |
| `objectives.py` | objectives from runs, comparability, normalisation |
| `constraints.py` | hard constraints and the unmet-hours flag |
| `pareto.py` | the non-dominated set with tolerances |
| `screening.py` | the M5 interface and the safe shortlist |
| `ranking.py` | the four picks and their explanations |
| `reliability.py` | perturbation cases and the reliability score |
| `__main__.py` | the command line |
| `fixtures/example_result_standin.json` | an example result (stand-ins) |
| `tests/` | tests, plus `standins.py` (development test doubles) |
