# Changelog — COCOON Contracts (`@cocoon/contracts`)

All notable changes to data contracts, validation rules, and schemas are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.0.0] - 2026-09-20

### Added
- **Initial Release of Module M0 (Shared Contracts and Fixtures)** for COCOON v4.0.
- **Canonical Pydantic v2 Models** in `cocoon_contracts` Python package:
  - `common`: `ContractModel` base class with `extra="forbid"`, `Vector3D`, `SourceMetadata`, `Provenance`, `Schedule`, `ValidationReport`.
  - `errors`: Standard `ErrorCode` enumeration, `ErrorDetail`, and top-level `ErrorEnvelope` matching PRD §16.6.
  - `requirements`: `RequirementsContract`, `MissionRequirements`, `SiteSpecification`, `DesignConstraints`, `ProjectMode`.
  - `project`: `Project` tracking mission lifecycle and active design references.
  - `materials`: `MaterialRecord`, `MaterialThermalProperties`, and `MaterialSnapshot`.
  - `building`: Complete parametric `BuildingModel` supporting multi-room, multi-floor structures: `Floor`, `Zone`, `Surface`, `Opening`, `ZoneConnection`, `ConstructionAssembly`, `AssemblyLayer`.
  - `weather`: `HourlyWeatherPoint`, `GapInterpolationRecord`, `WeatherSourceMetadata`, `WeatherSnapshot`.
  - `simulation`: `SimulationRequest`, `SimulationResult`, `SimulationSummary`, `ZoneSummary`, `TimeSeriesPoint`, `EngineMetadata`, and PRD §22.2 `RecommendationState` states.
  - `economics`: `EconomicAssumptionSet`, `CapexBreakdown`, `AnnualOpexPoint`, `EconomicAnalysisResult`.
  - `ansys`: `AnsysJobRequest`, `AnsysValidationResult`, `AnsysSolverConfig`, `AnsysArtifactManifest`, `AnsysComparisonMetrics`, `AnsysJobStatus`.
  - `visualization`: `VisualizationModel`, `MeshBox`, `SurfaceVisual`, `OpeningVisual`, `ZoneTemperatureSeries`, `ContourArtifactRef`.
- **JSON Schema Draft 2020-12 Specifications** (12 persistent schemas):
  - `project.schema.json`
  - `requirements.schema.json`
  - `building.schema.json`
  - `weather.schema.json`
  - `material.schema.json`
  - `simulation-request.schema.json`
  - `simulation.schema.json`
  - `economics.schema.json`
  - `ansys-job.schema.json`
  - `ansys-validation.schema.json`
  - `visualization.schema.json`
  - `error.schema.json`
- **Generated TypeScript Type Definitions** in `@cocoon/contracts` (`packages/contracts/typescript/`):
  - Deterministic schema-driven generation via `json-schema-to-typescript` and `scripts/generate-types.js`.
  - Typecheck validation with zero TypeScript errors (`npm run typecheck`).
- **Validation Engine**:
  - Mandatory `schema_version: "4.0"` constraint on top-level integration contracts (`ErrorEnvelope` preserves wire format per PRD §16.6).
  - Mandatory ID prefix validation (`prj_`, `des_`, `rev_`, `wx_`, `mat_`, `sim_`, `econ_`, `ans_`, `viz_`).
  - Strict timezone-aware ISO-8601 datetime validation (`AwareDatetime`).
  - Topological and referential integrity checking across zones, surfaces, openings, assemblies, and connections.
  - Non-negotiable scientific integrity guard forbidding imposed RC indoor temperature in ANSYS boundary conditions (`extra="forbid"` and revision lock).
  - Explicit simulation mode validation: `SimulationRequest` requires explicit solver modes (`free_floating`, `ideal_load_conditioned`, `capacity_limited_conditioned`), while `SimulationResult` allows PRD §22.1 compatibility label (`"conditioned"`).
- **Fixtures Suite**:
  - 15 deterministic valid fixtures covering all 12 top-level contracts and scenarios.
  - 20 targeted invalid fixtures testing each required failure mode with exact path and code assertions.
- **Test Suite**:
  - 77 automated unit and fixture tests with 100% pass rate.
  - `check_fixtures.py` script verifying dual Pydantic + JSON Schema Draft 2020-12 conformance.
  - `test_schema_generation.py` ensuring zero drift between Pydantic models and on-disk JSON schemas.
  - `test_schema_ts_parity.py` ensuring exact parity between Pydantic, JSON Schema, and TypeScript types.
  - `test_prd_examples.py` permanent conformance tests for PRD §7.1, §7.2, §16.6, §22.1, and placeholder rejection.
