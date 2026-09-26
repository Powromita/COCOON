# COCOON Module M0 — Contract Decisions Record

This document records architectural, typing, and validation decisions made during the implementation of Module M0 where `COCOON_FINAL_IMPLEMENTATION_PRD_v4.md` was underspecified or required reconciliation across sections.
All decisions adhere strictly to scientific integrity and avoid inventing new physics or business logic.

---

### Decision 1: Zone Dimensions & Unit Suffixes (`ZoneSize`)
- **Context**: PRD §7.2 shows example JSON with `"size_m": {"length": 1.2, "width": 4, "height": 2.8}`, whereas PRD §5.2 and Global Contract Rule #4 require explicit unit suffixes (`_m`, `_m2`).
- **Decision**: Define canonical Pydantic fields as `length_m`, `width_m`, `height_m` and configure `validation_alias=AliasChoices("length_m", "length")` (and similarly for width and height).
- **Rationale**: Guarantees that generated JSON Schemas, TypeScript interfaces, and serialized outputs strictly use SI unit suffixes (`length_m`), while seamlessly accepting incoming payloads using `length` from PRD examples.

---

### Decision 2: Mandatory `schema_version` Enforcement Without Defaults
- **Context**: Global Contract Rule #1 mandates `schema_version: Literal["4.0"]` on all top-level contracts, and the test suite requires that missing `schema_version` must fail validation.
- **Decision**: All top-level contract models define `schema_version: Literal["4.0"] = Field(...)` without a default value.
- **Rationale**: If a default value were provided, Pydantic would automatically populate `"4.0"` when omitted from input payloads, preventing detection of legacy or unversioned messages. Omitting `schema_version` now triggers a strict `Field required` validation failure.

---

### Decision 3: Strict Timezone-Awareness Validation (`AwareDatetime`)
- **Context**: PRD §5.2 requires "ISO-8601 timestamps with timezone". Python's standard `datetime.fromisoformat` accepts both naive and aware datetimes.
- **Decision**: Implemented `AwareDatetime` via an annotated Pydantic validator (`validate_timezone_aware`) that verifies `dt.tzinfo is not None and dt.tzinfo.utcoffset(dt) is not None`.
- **Rationale**: Eliminates silent timezone bugs between weather datasets (e.g. UTC from NASA POWER) and local shelter analysis windows (e.g. `+05:30` for Leh, Ladakh).

---

### Decision 4: Scientific Integrity Guard in `AnsysJobRequest`
- **Context**: PRD §0.3 Rule 4 mandates: *"Do not pass Python-predicted indoor temperatures into ANSYS as imposed temperatures. RC and ANSYS must independently solve the same scenario."*
- **Decision**: Multi-layered defense:
  1. `ContractModel` enforces `extra="forbid"`, preventing any caller from adding extra boundary condition fields (`imposed_indoor_temperature_c`, etc.).
  2. Implemented an explicit boolean guard `imposed_indoor_temp_forbidden: bool = True` in `AnsysJobRequest` with a validator that raises `ValidationError("SCIENTIFIC INTEGRITY VIOLATION...")` if an attempt is made to set it to `False`.
  3. `building_model.revision_id` must match `design_revision_id`.
  4. RC result references in `AnsysValidationResult.metrics` exist only for post-execution comparison, never as boundary conditions.
- **Rationale**: Encodes DRDO scientific integrity directly into the schema validation layer before an ANSYS job can be queued.

---

### Decision 5: Topological Consistency and Orphan Detection in `BuildingModel`
- **Context**: PRD §7.2 and §8.4 list feasibility constraints (reachability, valid surfaces, paired partitions, parent surfaces for openings).
- **Decision**: Added comprehensive validators to `BuildingModel`:
  1. Floor IDs and Floor levels must be unique.
  2. Zone IDs must be unique across all floors.
  3. Every `Surface.owning_zone_id` must exist in declared zones.
  4. Every `Surface.assembly_id` must exist in declared `assemblies` dictionary.
  5. Partition surfaces (`surface_type == "partition"`) are restricted strictly to `boundary_type in ("adjacent_zone", "adiabatic")`.
  6. Adjacent zone surfaces (`boundary_type == "adjacent_zone"`) must specify `adjacent_zone_id`, which must exist in declared zones and cannot equal `owning_zone_id`.
  7. Every `Opening.parent_surface_id` must exist in declared surfaces.
  8. Every `ZoneConnection` must link two distinct, existing zones (`zone_a_id != zone_b_id`).
- **Rationale**: Prevents physics engines (M4) and 3D viewers (M10) from receiving disconnected graphs, orphaned windows, or self-referential room loops.

---

### Decision 6: Finite State Machine Consistency in `AnsysValidationResult`
- **Context**: PRD §14.9 specifies the allowed ANSYS job lifecycle states:
  `NOT_REQUESTED -> QUEUED -> PREPARING -> MESHING -> SOLVING -> EXPORTING -> COMPLETED -> FAILED | CANCELLED | TIMED_OUT | UNAVAILABLE`.
- **Decision**:
  - When `status == "COMPLETED"`, `artifacts` (manifest) and `completed_at` must not be null.
  - When `status` is in `("FAILED", "UNAVAILABLE", "TIMED_OUT")`, an `error_reason` string must be provided.
- **Rationale**: Guarantees that completed validations always provide artifact links for evidence audit, and failures always provide transparent explanations for the user interface.

---

### Decision 7: Separation of Request and Output Simulation Engine Modes
- **Context**: PRD §10.12 mandates three explicit solver execution modes: `free_floating`, `ideal_load_conditioned`, and `capacity_limited_conditioned`. In PRD §22.1, the output example uses the broader umbrella label `"mode": "conditioned"`.
- **Decision**:
  - `SimulationRequest.engine.mode` strictly requires `SimulationEngineMode` (`free_floating`, `ideal_load_conditioned`, `capacity_limited_conditioned`). Generic `"conditioned"` is rejected on requests.
  - `SimulationResult.engine.mode` uses `SimulationOutputEngineMode`, which accepts the specific executed solver mode or `"conditioned"` for PRD §22.1 compatibility.
- **Rationale**: Solvers require explicit numerical instructions, while downstream dashboards and reporting summaries can accept the broader category.

---

### Decision 8: Documentation Placeholder Timestamp in PRD §22.1
- **Context**: PRD §22.1 writes `"created_at": "ISO_8601"` as placeholder documentation syntax.
- **Decision**: The model strictly requires `AwareDatetime` (e.g. `"2026-09-20T10:00:00Z"`). Literal placeholder `"ISO_8601"` is rejected by validation. A normalized PRD fixture `simulation_result_normalized_prd.json` is provided and tested.
- **Rationale**: Upholds DRDO scientific integrity rule requiring real, timezone-aware audit timestamps across all operational contracts.

---

### Decision 9: Additional Persisted Integration Schemas (12 Schemas Total)
- **Context**: The PRD outlines 8 primary schemas in §7, §14, §17, and §22. However, runtime integrations for Materials (M3), Simulation Requests (M4), ANSYS Results (M8), and Error Handling (M9/§16.6) need deterministic JSON Schemas.
- **Decision**: Persist 4 additional schemas in `packages/contracts/jsonschema/`:
  1. `material.schema.json` -> `MaterialSnapshot`
  2. `simulation-request.schema.json` -> `SimulationRequest`
  3. `ansys-validation.schema.json` -> `AnsysValidationResult`
  4. `error.schema.json` -> `ErrorEnvelope`
- **Rationale**: Provides 100% persisted JSON Schema coverage for all 12 platform contracts.

---

### Decision 10: ErrorEnvelope Wire Shape Exception
- **Context**: PRD §16.6 specifies the standard HTTP error envelope wire shape as `{"error": {"code": "...", "message": "...", "details": {...}, "trace_id": "...", "retryable": false}}`. It does not contain `schema_version`.
- **Decision**: `ErrorEnvelope` does not require `schema_version`. It matches PRD §16.6 verbatim.
- **Rationale**: Standard HTTP error handlers and client interceptors expect the exact RFC/PRD error shape without extra envelope boilerplate.

---

### Decision 11: Explicit Required Collections to Prevent Optionality Drift
- **Context**: Pydantic's `default_factory=list` creates optionality drift where TypeScript interfaces emit non-optional arrays while Python allows omitting them.
- **Decision**: In `Floor.zones`, `BuildingModel.surfaces`, `openings`, `connections`, `assemblies`, `schedules`, `SimulationResult.zones`, and `VisualizationModel.boxes`, `surfaces`, `openings`, fields are explicitly required in Pydantic without default factories. Explicit empty collections (`[]` or `{}`) must be provided.
- **Rationale**: Enforces exact structural parity between Python, JSON Schema Draft 2020-12, and TypeScript. Producers are forced to be explicit about empty collections.

---

### Decision 12: Schema-Derived TypeScript Generation via `json-schema-to-typescript`
- **Context**: Hand-coded TypeScript interfaces drift from canonical Pydantic schemas.
- **Decision**: Configured `json-schema-to-typescript` as a local devDependency in `packages/contracts/typescript/`. `npm run generate` and `generate_json_schemas.py` compile all 12 Draft 2020-12 JSON Schemas directly into `src/generated.ts`.
- **Rationale**: Guarantees that TypeScript types are 100% derived from the canonical JSON Schemas with zero handwritten duplication.
