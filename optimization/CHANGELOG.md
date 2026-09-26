# Changelog — optimization (COCOON M6)

M6 was built in ten phases; each phase was tested, mutation-checked (the code deliberately broken, the tests required to
fail) and reviewed before the next started. Versions below are the package version at the end of each phase.

## 0.10.0 — phase 10: command line, documentation, fixtures, checks
- `python -m optimization`: runs the whole flow, writes `result.json` and the recommended `BuildingModel`s. Stand-in engines by
  default (with a `DEVELOPMENT ONLY` banner), `module:factory` to plug in the real M4 / M7. Exit codes 0 / 3 / 2 / 5 / 1.
- `fixtures/example_result_standin.json`: an example result; a test regenerates it and fails on drift.
- README (interfaces, stages, objectives, picks, reliability, placeholders, limitations, open questions, measured runtime).
- Boundary tests: M2 used only through its public names, no private imports across modules, the test doubles unreachable from
  the library. Made `objectives.kept_points` and the stand-in `assemble_network` public (they were imported across modules).
- Runtime measurement (README).

## 0.9.0 — phase 9: `optimize()`
- `pipeline.py`: the public entry point that chains every stage; `OptimizationSettings`, `OptimizationResult`, `DesignOutcome`,
  `to_error_envelope`. Every design ends in exactly one outcome with its stage and reason.
- Run budget checked before any simulation (`RUN_BUDGET_EXCEEDED`); an over-budget reliability stage is skipped with a warning.
- Economics priced from the capacity-limited run of the sized heater; a provider that goes away mid-run leaves no design with a stale cost.
- Reliability measured for the eligible contenders and fed back into the ranking only when every eligible design has a score.
- Result carries `development_only`, never `VALIDATED_BY_ANSYS`, and a `PROPOSED` schema marker (no M0 schema exists for it).
- Fixed while testing: a zero reliability budget raised `INVALID_SPEC` instead of skipping reliability.

## 0.8.0 — phase 8: reliability
- `reliability.py`: perturbation specification as data; one-at-a-time and seeded Monte-Carlo cases; the score is the share of
  cases a design stays in the top-k recommendations (found by peeling `best_overall`); the sized heater stays fixed.
- Kinds the evaluator does not declare it honours are listed in `not_tested`, never approximated.
- Perturbed jobs get their own request ids; the stand-in honours an internal-gains factor.
- Fixed while testing: top-k taken from the Pareto front left "second place" undefined when one design dominated the rest.

## 0.7.0 — phase 7: ranking
- `ranking.py`: `best_overall`, `best_thermal`, `lowest_lcc`, `lowest_capex` with visible, editable weights; only designs within the
  unmet-hours limit can be picked; explanations built from real fields only, each naming its sources.
- Fixed while testing: explanation crashed when the best values differed only by float noise.

## 0.6.0 — phase 6: screening
- `screening.py`: the M5 interface and a shortlist with a proven guarantee (discard only if beaten by more than twice the margin on
  every dimension); ML never blocks the physics (a crashing predictor sends everything to M4).

## 0.5.0 — phase 5: verification and heater sizing
- `rc_verification.py`: three runs per finalist; heater sized from the settled peak; runs start at the setpoint; 48 h warm-up excluded.
  A failed run excludes the design with its stage and reason and is never retried.

## 0.4.0 — phase 4: Pareto
- `pareto.py`: non-dominated set with tolerances, ties, exclusions and flags. Added a guard against a dominance cycle after a
  deliberately broken dominance rule made the rank loop run forever.

## 0.3.0 — phase 3: hard constraints
- `constraints.py`: limits checked before any run, capex after pricing, unmet hours as a flag; checks that cannot run are reported as skipped, not passed.

## 0.2.0 — phase 2: objectives
- `objectives.py`: separate objectives from runs, comparable / not comparable, warm-up exclusion, normalisation.

## 0.1.0 — phase 1: interfaces
- The M4 (`Evaluator`) and M7 (`EconomicsProvider`) interfaces with checks on what comes back; test doubles that are stamped `standin_*`.
