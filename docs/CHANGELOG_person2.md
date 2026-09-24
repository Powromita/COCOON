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

## Phase 1 — materials and constructions

- MOVED (logic unchanged) into `environment/materials.py`: `load_materials`, `get_material`,
  `get_material_display_name` (from `materials.py`) and `layer_resistance`, `total_resistance`,
  `calculate_u_value`, `calculate_layer_capacitance` (from `heat_transfer.py`). Old modules are
  re-export shims; `thermal_model.py`, `main.py`, `engine_adapter.py` and `ansys-pipeline/`
  import unchanged. Person 1's `prepare_layers`, `calculate_construction_properties`,
  `resistance_to_interior`, `position_weight` and the coupling constant are untouched.
- New typed API: `MaterialProps` / `load_material_db` (validated; per-property sources and
  status; `to_legacy_dict()`), `SurfaceFinish` / `load_finishes`, `Construction` /
  `layered_construction` (outer→inner, metres, `h_out_W_m2K=None` for ground contact, optional
  `outer_finish`; R summed in the legacy order so it equals `total_resistance` bit-for-bit).
- Glazing: `GlazingProps` / `load_glazing_db` with optional `iam_b0` (default 0.10),
  `shgc_diffuse` (default SHGC/(1+b0), closed form), `frame_fraction` (default 0);
  `iam_ashrae`, `hemispherical_iam`. `glazing_profiles.json` unchanged.
- `adapters.contract_layers_to_si`: the single mm→m conversion point.
- Data: `emissivity` / `solar_absorptance` + citations added to every material (additions only;
  k/ρ/cp untouched); new `data/surface_finishes.json` (9 cited finishes).
- `docs/materials_review_person2.md`: suspected errors (adobe, rammed earth, concrete naming,
  PUF), surface-film sensitivity, proposed additional materials — for team decision.
- Follow-ups: `prepainted_steel_sheet` (PPGI) finish with light/medium/dark variants (cited; ε 0.87);
  PUF-outermost constructions default to PPGI medium via `adapters.default_outer_finish` /
  `construction_from_contract` (defaults layer only). Review doc gained §6 film coefficients
  (for Persons 1 and 4), §7 data-correction procedure (worked example, nothing changed) and
  §8 SOURCES TO VERIFY.
- Legacy results unchanged (golden passes at 1e-9; radiative fields proven inert in legacy).
