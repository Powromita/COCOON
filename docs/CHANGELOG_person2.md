# Person 2 (M3 + parts of M4) — environment physics changelog

## Phase 0 — scaffolding and safety net

- `thermal-calculator/environment/` package skeleton: `constants.py` (sourced SI
  constants + `LEGACY_*` mirrors of engine values), `adapters.py` (physics switch),
  empty stubs for weather, materials, solar, convection, sky, airflow, ground, boundary.
- Physics switch: optional config keys `physics_level` ("legacy" default | "enhanced")
  and `physics_features` (per-feature bool overrides). Validated by
  `shelter_config.validate` (never inserted); resolved in `engine_adapter.simulate`
  (new optional `physics_level=` kwarg). Enabling a feature that is not implemented yet
  raises `NotImplementedError` — nothing silently falls back to legacy.
- pytest: repo-root `pytest.ini` (testpaths = `thermal-calculator/tests`),
  `conftest.py` (sys.path mirror of the pipeline, network blocked in every test),
  `requirements-dev.txt`.
- Golden regression: 7 cases (legacy `config.SHELTER_CONFIG` on the 48 h worst-case and
  168 h typical windows; 5 seed-2026 optimizer designs on the typical window). Frozen
  weather slices + ground mean + design JSON are replayed, so engine drift and
  weather-loader drift are tested separately. Tolerance 1e-9 on every hourly column and
  key scalar properties. Generated from the unmodified engine
  (`tests/make_golden.py`).
- No behaviour change: solver, calibration, backend contract, frontend and
  ansys-pipeline untouched.
