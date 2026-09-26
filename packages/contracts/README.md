# COCOON Module M0 — Shared Contracts and Fixtures

**Authoritative Specification**: `COCOON_FINAL_IMPLEMENTATION_PRD_v4.md`
**Package Version**: `4.0.0`
**Schema Version**: `4.0`

---

## 1. What is Module M0?

Module M0 is the **single, authoritative integration boundary** for the entire COCOON shelter thermal optimization platform. It provides strongly typed data structures, semantic validation rules, compiled JSON Schema Draft 2020-12 specifications, generated TypeScript definitions, and deterministic fixtures for inter-module communication.

M0 contains **data contracts and validation only**. It deliberately excludes:
- Numerical physics solvers and ODE integration
- Geometry generation or parametric optimization algorithms
- REST API route handlers and endpoints
- Database schemas, ORMs, and persistence layers
- Network calls for weather or live data acquisition
- Economic calculation engines and NPV/payback math
- ANSYS execution scripts and PyMAPDL commands
- UI frontend components

---

## 2. Why is Module M0 Required?

COCOON is developed by a distributed multi-disciplinary team spanning optimization, multi-zone physics, surrogate ML, economics, finite-element validation (ANSYS), backend infrastructure, and 3D web/mobile frontends.

Without a frozen contract boundary:
1. Modules diverge on field naming, coordinate frames, unit conventions, and boundary assumptions.
2. Incompatible ad-hoc JSON payloads break end-to-end integration tests.
3. Physics engines receive incomplete or topologically invalid building descriptions.
4. Scientific integrity can be compromised (e.g. accidentally imposing RC predictions into ANSYS as boundary answers).

M0 enforces the **Contract-First Integration Rule** (PRD §5.2): every module communicates exclusively through versioned data contracts without importing another module's internal implementation.

---

## 3. Contract Consumer Matrix

| Contract | Primary Producer | Key Consumers | Description |
| :--- | :--- | :--- | :--- |
| `RequirementsContract` | M11 (Web), M12 (Mobile) | M2 (Layout Generator), M9 (Backend) | Mission constraints, site coordinates, comfort criteria |
| `Project` | M9 (Backend) | M11 (Web), M12 (Mobile) | Top-level project lifecycle tracking and active design |
| `BuildingModel` | M2 (Layout Generator) | M4 (Physics), M7 (Economics), M8 (ANSYS), M10 (3D) | Complete parametric geometry: floors, zones, surfaces, openings, assemblies |
| `MaterialSnapshot` | M3 (Materials DB) | M2 (Generator), M4 (Physics), M8 (ANSYS) | Thermophysical material records and assembly properties |
| `WeatherSnapshot` | M3 (Weather Engine) | M4 (Physics), M5 (ML), M8 (ANSYS) | Monotonic hourly weather timeseries with location metadata |
| `SimulationRequest` | M9 (Backend / Queue) | M4 (Multi-zone Solver) | Solver parameters, window bounds, and initial conditions |
| `SimulationResult` | M4 (Multi-zone Solver) | M5 (ML), M6 (Optimization), M7 (Economics), M10 (3D) | Zone temperatures, heating demand, comfort hours, energy balance |
| `EconomicAnalysisResult`| M7 (Lifecycle Economics) | M6 (Optimization), M11 (Web), M12 (Mobile), M13 (Reports)| CAPEX breakdown, annual discounted cash flows, LCC, payback |
| `AnsysJobRequest` | M9 (Backend Queue) | M8 (PyMAPDL Worker) | Independent validation package with strict integrity guards |
| `AnsysValidationResult` | M8 (PyMAPDL Worker) | M9 (Backend), M11 (Web), M12 (Mobile), M13 (Reports) | Finite element execution status, comparison metrics, artifacts |
| `VisualizationModel` | M9 / M2 / M4 | M10 (Three.js Viewer), M11 (Web), M12 (Mobile) | 3D bounding boxes, polygon facets, and thermal timeseries overlays |
| `ErrorEnvelope` | M9 (Backend), Solvers | M11 (Web), M12 (Mobile), CLI | Standardized machine-readable error codes and detail envelope |

---

## 4. Python Package Installation

Install the package in development (editable) mode:

```powershell
pip install -e packages/contracts/python
```

Verify the installation:

```powershell
python -c "import cocoon_contracts as cc; print('cocoon-contracts version:', cc.__version__)"
```

---

## 5. How to Import and Consume Contracts

In any COCOON module (e.g., `physics_engine`, `design_generator`, `backend`):

```python
from cocoon_contracts import (
    BuildingModel,
    RequirementsContract,
    WeatherSnapshot,
    SimulationResult,
    AnsysJobRequest,
    AnsysJobStatus,
    ErrorCode,
)

# Example: Validating an incoming JSON payload
def process_design(raw_json: dict) -> BuildingModel:
    # Strict validation: enforces SI units, ID prefixes, and topological integrity
    model = BuildingModel.model_validate(raw_json)
    return model
```

---

## 6. How to Generate Schemas and TypeScript Definitions

Pydantic v2 models are the single canonical source of truth. JSON Schemas (Draft 2020-12) and TypeScript interfaces are generated deterministically:

```powershell
python packages/contracts/scripts/generate_json_schemas.py
```

Outputs produced:
- `packages/contracts/jsonschema/*.schema.json` (12 persistent Draft 2020-12 schemas)
- `packages/contracts/typescript/src/generated.ts` (Synchronized TypeScript type declarations compiled via `json-schema-to-typescript`)

To regenerate TypeScript definitions directly:
```powershell
cd packages/contracts/typescript
npm run generate
npm run typecheck
```

---

## 7. How to Validate Fixtures

Run the fixture verification script to test all valid and invalid test fixtures:

```powershell
python packages/contracts/scripts/check_fixtures.py
```

This script:
1. Validates all fixtures in `fixtures/valid/` against Pydantic models.
2. Validates all fixtures in `fixtures/valid/` against compiled JSON Schemas using `jsonschema.Draft202012Validator`.
3. Validates all fixtures in `fixtures/invalid/` and confirms that each fails for its expected reason.

---

## 8. How to Run Tests

Run the complete pytest test suite:

```powershell
python -m pytest packages/contracts/tests -v
```

Run TypeScript compilation check:

```powershell
cd packages/contracts/typescript
npx tsc --noEmit
```

---

## 9. Contract Versioning and Evolution Rules

1. **Schema Version**: `schema_version: Literal["4.0"]` must be present on every top-level contract payload.
2. **Backward Compatibility**:
   - Fields may only be added as optional/nullable with explicit defaults.
   - Removing, renaming, or changing the type/unit of any field constitutes a breaking change and requires incrementing the major version (`5.0`).
3. **No Legacy Adapters**: New code must adhere strictly to v4.0 contracts. No compatibility shims for prototype v1/v2/v3 schemas.
4. **Mandatory ID Prefixes**:
   - `prj_`: Project
   - `des_`: Design
   - `rev_`: Design Revision
   - `wx_`: Weather Snapshot
   - `mat_`: Material Record / Snapshot
   - `sim_`: Simulation Result
   - `econ_`: Economic Assumption Set / Result
   - `ans_`: ANSYS Validation Job
   - `viz_`: Visualization Model
5. **SI Units**: All internal properties must use SI units with explicit unit suffixes (`_m`, `_m2`, `_w`, `_c`, `_inr`).
