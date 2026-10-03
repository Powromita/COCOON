# Template-aware design generation (M2 catalogue → mobile configurator → M3–M8)

For engineers working on the COCOON backend and mobile app. It covers what was built, the API, how to run it, and
what is still open. Every example below is a real response, recorded by
`mobile-app/scripts/record-template-fixtures.py` (the same files back the mobile tests in
`mobile-app/tests/fixtures/templates/`).

## 1. What the repository actually has (audit)

| Area | Finding |
|---|---|
| Mobile | Expo SDK 57 / React Native 0.86, Expo Router, React Query, React Hook Form + Zod, SQLite drafts, `services/registry.ts` provider pattern. Always uses the API provider. |
| Backend | FastAPI (`backend/main.py`). Async jobs = `ThreadPoolExecutor` + file-persisted `status.json` under `data/pipeline_runs/` (`POST /api/v1/optimizations`). Idempotency-Key supported. |
| M2 templates | 7 JSON topology templates in `design_generator/templates/`, validated by `template_catalog.py`. A template fixes rooms, floors and links only. Shared functions are a room's `serves` list. **No version field and no active flag.** |
| M2 sizing | `requirement_parser.DEFAULT_SIZING` — placeholder room minimums, circulation 1.10, stair allowance 3 m², ceiling 2.3–3.0 m. Feasibility rule `usable(F) = F·cap − 2(F−1)·stair`. |
| M2 generation | Picked templates at random from those that fit and could not be pinned. 18 named checks, a rejection ledger, dedup by content-hash `revision_id`. |
| Pipeline order | `run_pipeline`: M3 weather → M6 `optimize()` [M2 generate → M6 constraints → M5 screening (off) → M4 RC verify → M7 economics → M6 Pareto / picks / reliability] → optional M8 ANSYS submit of the recommended revision → final report. |
| ANSYS (M8) | Local file-based job queue (`ansys-pipeline/jobs/`), one solve at a time, PyMAPDL. An unavailable ANSYS gives a real `UNAVAILABLE` state, never a faked result. |
| AWS | **None in this repository.** No boto3, SQS, S3, ECS or IaC. ANSYS and the job pool run on the API host. |
| Auth | `auth_mode: "disabled"` (local development). No users, so jobs cannot be scoped per user. |
| Mobile before this work | Room types, the 1–2 floor cap and the "structural materials" list were hardcoded. The hardcoded list was wrong for snapshot `mat_snap_himalayan_v2`, where 5 materials have categories M2 cannot build with. |

## 2. What changed

### M2 (`design_generator/`)
- `catalog.py` (new): `describe_catalog`, `describe_template`, `material_support`, `catalog_version`, `template_hash`,
  and `check_compatibility`. Everything is read from the template files, `DEFAULT_SIZING`, and the generator's own
  material pool and matching rule.
- `candidate_generator.py`: `GenerationOptions.template_ids` (an optional pin); `fitting_templates()` is the single
  matching rule used by both generation and the compatibility check; `material_pool()` is extracted (no logic change).
- `requirement_parser.py`: `parse_mission()` split out of `parse_requirements()` (no logic change), so an incomplete
  draft can be sized with the same rules.

### Pipeline (observe-only, no algorithm change)
- `optimization.optimize(..., progress=)` calls the observer as each existing timing lap ends.
- `cocoon_pipeline.PipelineConfig.progress` passes it through and adds `weather`, `ansys` and `final_report` events.

### Backend (`backend/routes/`)
- `design.py` (new): `GET /api/v1/templates`, `GET /api/v1/templates/{id}`, `POST /api/v1/design-compatibility`.
- `errors.py` (new): `details.category` on the M0 envelope, plus `classify_job_error`. Unexpected errors get a
  generic message; their detail goes to the `cocoon.api` log under the client-visible `trace_id`.
- `pipeline.py`:
  - `generate-designs` and `optimizations` take `template_id` and `room_arrangement`, and re-run the compatibility
    check before any work; nothing is queued for an incompatible request.
  - Jobs persist `compatibility.json`, `provenance.json`, `template_catalog_version`, `template_ids` and `stages`.
  - The status response adds `phase`, the live ANSYS status, and `generation`.
  - New `POST /api/v1/optimizations/{id}/retry`.

### Mobile (`mobile-app/`)
- `TemplateService` (API, plus a fixture provider that refuses rather than inventing a catalogue);
  `useTemplateCatalog` (cached for offline viewing), `useCompatibility` (debounced, never cached),
  `useRetryGeneration`.
- **Rooms step:** only catalogue room types are offered. A type no template can combine with the current rooms is
  disabled, with the reason. Each room shows its M2 sizing rule. "Own room / Shared / Either" is offered only when
  the catalogue has both kinds of template; otherwise the step says which one applies.
- **Floors and materials:** floor options come from the catalogue's floor counts. Material roles come from M2; a
  material M2 cannot use is shown as unusable.
- **Review step:** `CompatibilityPanel` shows compatible templates (automatic by default, manual choice among
  compatible ones only) and conflicts in plain language, each with an Edit link to the step that owns it. Backend-verified
  alternatives apply only on tap. "Generate designs" is enabled only for a current, compatible result.
  The mission and design steps show a one-line live status.
- **Job screen:** real stage timeline, with M2 generation, M4 simulation, M7 economics, M6 ranking and M8 ANSYS as
  separate rows. `FailureNotice` handles each failure category, and Retry calls the backend retry endpoint.
  Polling continues while ANSYS is still running.
- **Schemas:** the hardcoded room enum, the 2-floor cap and the structural-material list were removed. Contract bounds
  stay. `previewRequirements()` builds the partial contract for the compatibility check.

## 3. API

All errors use the M0 envelope `{error: {code, message, details, trace_id, retryable}}`.
`details.category` is one of:
`invalid_input`, `no_compatible_template`, `physical_infeasibility`, `no_feasible_candidates`, `temporary_failure`,
`downstream_failure`, `unexpected`. When a single field is at fault, `details.field` names it as a dotted
RequirementsContract path.

### `GET /api/v1/templates`
Returns `catalog_version`, `templates[]`, `room_types[]` (sizing rules and where each type is dedicated or shared),
`floors`, `sizing`, `materials{snapshot_id: [{id, role, elements}]}` and `required_structural_elements`.
One template, abbreviated:

```json
{"id": "airlock_living", "name": "Airlock plus living room", "version": "tpl_fa6389237e97", "active": true,
 "floor_count": 1, "airlock_required": true, "dedicated_functions": ["airlock", "living"],
 "shared_functions": {"equipment": ["living"], "sleeping": ["living"], "storage": ["living"]}}
```

`version` is a content hash: templates have no version field. `active` is always true because every file is used.

### `POST /api/v1/design-compatibility`
Body: `{requirements: <full or partial RequirementsContract>, template_id?, room_arrangement?: {type: "dedicated"|"shared"}, materials_snapshot_id?}`.

The result is always HTTP 200 and preliminary: it checks rooms, floors, footprint and materials, but not room
proportions, door placement, glazing or mass. Layers are `input` → `functional` → `physical` → `materials` →
`arrangement` → `selection`. This example is the M0 sample requirements with a 20 m² footprint:

```json
{"ok": false, "stage_reached": "physical", "compatible_template_ids": [],
 "conflicts": [{"layer": "physical", "code": "INFEASIBLE_REQUIREMENTS", "field": "constraints.maximum_footprint_m2",
   "message": "rooms need 77.0 m2 (incl. circulation) but at most 34.0 m2 is usable with a 20 m2 footprint and 2 floor(s)"}],
 "alternatives": [{"template_id": "two_floor_compact", "change": {"constraints.maximum_footprint_m2": 41.5},
   "message": "Compact two-floor shelter would fit if you allow a footprint of at least 41.5 m²."}]}
```

Alternatives are offered only when no template is compatible, and each one is re-checked with the parser before it
is returned.

### `POST /api/v1/optimizations` (extended) and `POST /api/v1/generate-designs` (extended)
New optional fields: `template_id` (null = automatic, meaning every compatible template) and `room_arrangement`.
An incompatible request returns 422 and no job is created:

```json
{"error": {"code": "VALIDATION_ERROR",
  "message": "rooms need 77.0 m2 (incl. circulation) but at most 34.0 m2 is usable with a 20 m2 footprint and 2 floor(s)",
  "details": {"category": "physical_infeasibility", "field": "constraints.maximum_footprint_m2",
              "m2_code": "INFEASIBLE_REQUIREMENTS", "compatibility": {"…": "full result"}},
  "trace_id": "72b57a18-b8ba-46f6-99cf-6dce4a895dfe", "retryable": false}}
```

`generate-designs` also returns `outcome` (`OK` | `PARTIAL` | `NO_FEASIBLE_CANDIDATES`), `catalog_version`,
`template_ids` and `provenance[]`.

### `GET /api/v1/optimizations/{id}` (extended)
- `status` (unchanged values: queued | running | completed | failed).
- `phase`: queued | generating | simulation | optimization | ansys_validation | finalizing | completed |
  partially_completed | failed.
- `stages[]`: compatibility, weather, generation, simulation, economics, optimization, ansys, report. Each has
  `status` (pending | running | completed | failed | skipped | not_requested | queued | unavailable) and timestamps.
- `template_ids`, `template_selection`, `template_catalog_version`, `generation` (M2 tally), `ansys` (live M8 status),
  `retry_of`, `retried_as`.

There are no percentages. A stage is marked completed only when the pipeline reports that it finished.

### `GET /api/v1/optimizations/{id}/candidates` (extended)
Each outcome gains `provenance`: `template_id`, `template_version`, `catalog_version`, `generator_version`, `seed`,
`parameters` (layout seed, orientation, glazing, airtightness, WWR target, merged rooms) and `m2_validation`
(passed and skipped checks). The response also gains `generation` (requested, generated, attempts, rejection tally).

### `POST /api/v1/optimizations/{id}/retry` (new)
- Only a failed job can be retried.
- A requirement-caused failure (`invalid_input`, `no_compatible_template`, `physical_infeasibility`,
  `no_feasible_candidates`) gets 409 with a message to change the requirements instead.
- The request is re-validated against the current catalogue.
- Each failed job can be retried once; a repeated call returns the same new job.
- If any M8 job was submitted while the failed job ran, the retry is queued **without** ANSYS and says so in `notes`.
  This check is conservative, so a retry never starts a second solve of the same revision.

## 4. Running it

No new dependencies, environment variables or migrations.

```bash
python -m pip install -r requirements-mobile.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
cd mobile-app && npm ci && npm run android
```

- Logging: unexpected job errors are logged to the `cocoon.api` logger. Configure a handler (uvicorn's default
  logging config does) to keep them.
- Templates are cached per process (`template_catalog._load_dir`), so restart the API after editing
  `design_generator/templates/*.json`. The `catalog_version` change then shows on new jobs; old jobs keep the version
  they were checked against.
- Re-record the mobile fixtures after a catalogue or response change: `python mobile-app/scripts/record-template-fixtures.py`.

## 5. Tests (this change)

| Suite | Result |
|---|---|
| Python, full `pytest` (all testpaths) | 1265 passed, 1 failed. The failure is `backend/tests/test_ansys_routes.py::test_submit_and_run_to_completion`: Windows Application Control blocks the VTK DLLs PyMAPDL loads on this machine. It also failed before this work. |
| New Python | `design_generator/tests/test_catalog.py` (20), `backend/tests/test_design_routes.py` (14) |
| Mobile `tsc` / `expo lint` | Clean (the same 3 warnings as before) |
| Mobile jest | 36 failures, exactly the set that failed before this work (earlier drift between the wizard fields and those tests, e.g. `location_name`); no new failures. New: `tests/adapters/templates.test.ts`, `tests/services/templateServices.test.ts` (27 tests, all passing). |

## 6. Known limitations and open decisions

1. **AWS:** nothing to integrate with. The job pool and ANSYS worker run on the API host. Moving them to AWS (for
   example SQS + ECS workers, with ANSYS licences in Secrets Manager) is an infrastructure decision; the file-based job
   folders would need shared storage (S3 or EFS).
2. **Auth and per-user access:** the backend runs with auth disabled, so jobs are not scoped to users. This needs an
   identity provider decision before Phase 10's authorization can be implemented.
3. **Cancellation:** the pipeline has no cancellation point, so no `cancelled` state is reported. M8 has its own
   `POST /api/ansys/jobs/{id}/cancel`.
4. **Template metadata M2 does not define:** no template version, no active flag, no per-template parameter ranges,
   no per-template material restrictions and no dimensional limits beyond the global sizing table. None of these are
   exposed or invented. Adding `version` and `active` fields to the template JSON would let the catalogue report them.
5. **Preliminary vs. full feasibility:** compatibility does not check layout proportions, door and stair fit, glazing
   or the mass limit. Only generation does. The UI labels compatibility as preliminary, and the job screen shows M2's
   real rejection tally when nothing passes.
6. **Placeholder sizing:** all M2 sizing numbers are placeholders (see `design_generator/README.md`). The catalogue
   shows them with that note.
7. **Retry/ANSYS dedup is time-window based.** A precise rule would need M8 to accept an idempotency key per revision
   and weather snapshot.
