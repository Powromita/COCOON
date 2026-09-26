# COCOON - Final Complete Product Requirements Document (PRD) v4.0

## Full Multi-Room, Multi-Floor Thermal Shelter Design Platform

**Team:** ByteFiesta  
**Problem Statement:** SIH 2026 - DRDO PS 26051  
**Title:** Software-Based Model Development for Design of Area-Specific Shelter for Thermal Comfort Maintenance  
**Document purpose:** Complete build specification from an empty repository to the final integrated submission  
**Target submission freeze:** 25 September 2026  
**Team size:** 6 developers  
**Status:** Final implementation baseline; supersedes prototype feature planning where this document differs

---
## 0. Document Control and Ground Rules

### 0.1 Purpose

This PRD defines the complete COCOON product, including features that already exist in the prototype and features that must be built for the final solution. A developer joining with no prior context should be able to use this document to understand:

- what the product must do;
- what the user supplies and what COCOON generates;
- how every calculation is performed;
- how modules exchange data;
- how six people can work independently;
- how modules are integrated and tested;
- which claims are allowed in the user interface and final presentation;
- what constitutes a complete final submission.

### 0.2 Source documents consolidated

This PRD consolidates and corrects:

- the internal-round prototype build PRD;
- the complete detailed PRD v3;
- the final read-only codebase audit;
- the implemented prototype README;
- the multi-room and lifecycle economics notes;
- the directional-physics improvement notes;
- the final architecture decisions made after the prototype.

### 0.3 Scientific integrity rules

The following rules are non-negotiable:

1. Do not display stored benchmark data as validation of a custom design.
2. Do not claim ANSYS ran unless it ran successfully for that exact immutable design revision.
3. Do not claim ANSYS Fluent, CFD, a graph neural network, fixed accuracy, fixed efficiency, or fixed savings unless the code and evidence support the claim.
4. Do not pass Python-predicted indoor temperatures into ANSYS as imposed temperatures. RC and ANSYS must independently solve the same scenario.
5. All economic values must come from visible, versioned assumptions.
6. ML may screen candidates, but final recommendations must be recalculated using the physics engine.
7. Structural safety is outside COCOON's current certification scope. The product optimizes thermal and lifecycle performance, not earthquake, snow-load, wind-load, fire, or foundation safety.

### 0.4 Terminology

| Term | Meaning |
|---|---|
| Zone | One room or thermal space with one calculated average air temperature |
| Surface | Wall, roof, floor, ceiling, partition, window, or door associated with a zone |
| Connection | Thermal or airflow link between two zones or between a zone and outdoors/ground |
| Candidate | One generated shelter configuration evaluated during optimization |
| Design revision | Immutable snapshot of geometry, materials, weather, schedules, and assumptions |
| RC model | Resistance-capacitance transient thermal model |
| Free-floating run | Simulation without active heating |
| Conditioned run | Simulation with thermostat/heater logic |
| Benchmark | Stored reference case with complete provenance; never a substitute for a custom run |
| Validation | Comparison of independent results for the same scenario |

---

## 1. Executive Summary

COCOON is a decision-support platform that generates and evaluates area-specific shelter designs for extreme climates. The user provides mission requirements and constraints; COCOON generates feasible single-room, multi-room, or multi-floor shelter candidates, predicts room-wise temperatures, estimates heating demand and lifecycle cost, ranks alternatives, displays the selected shelter as an interactive 3D model, and optionally validates representative designs using ANSYS MAPDL transient thermal analysis.

The final calculation hierarchy is:

> Parametric design generation -> ML screening -> multi-zone RC verification -> lifecycle economics and reliability -> final shortlist -> ANSYS validation -> explainable recommendation

### 1.1 Primary product outcomes

- Recommend a shelter rather than requiring the user to fully design one.
- Support new-shelter generation and existing-shelter evaluation.
- Model multiple rooms and multiple floors using a general N-zone solver.
- Account for orientation, directional solar gain, wind, infiltration, doors, partitions, floors, roofs, ground, occupants, equipment, and heating.
- Compare capital cost and discounted lifecycle cost.
- Provide web, mobile, CLI, offline-draft, report, and 3D visualization workflows.
- Produce traceable evidence for every recommendation.

### 1.2 Target users

- DRDO and defence field engineers;
- planners comparing deployment alternatives;
- thermal analysts validating designs;
- authorized academic/demo operators;
- maintainers managing materials, weather, costs, and benchmark cases.

### 1.3 Final product boundaries

The final submission supports rectangular parametric rooms and floors. It does not claim:

- unrestricted CAD or curved geometry generation;
- structural engineering certification;
- detailed indoor CFD or airflow streamlines;
- live cloud ANSYS using an ANSYS Student licence;
- guaranteed prediction accuracy without published validation results.

---

## 2. Current Prototype Baseline and Required Transition

### 2.1 Prototype capabilities to preserve

The current codebase already contains useful foundations:

- Python transient RC calculation;
- multi-layer wall, roof, and floor assemblies;
- U-value, R-value, capacitance, solar gain, infiltration, ground, and contents calculations;
- NASA POWER weather acquisition and archive handling;
- scenario generation and deterministic ranking;
- FastAPI execution/status/result endpoints;
- Next.js result screens and charts;
- a real PyMAPDL execution path when local ANSYS is available;
- per-run artifacts and basic job management.

### 2.2 Prototype limitations that must be removed

- single-zone/single-node physics;
- fixed one-hour explicit Euler integration;
- non-directional `GHI x window area x SHGC` solar logic;
- door count without door conduction/opening physics;
- constant exterior film coefficient despite wind data;
- no seasonal heater-demand model;
- no complete lifecycle-cost model;
- no trained production ML surrogate;
- unsafe benchmark fallback into unrelated custom results;
- unsupported frontend claims and hardcoded metrics;
- filesystem-only persistence with no durable job recovery;
- no automated tests, CI, deployment contract, or mobile application.

### 2.3 Stabilization before feature development

Before merging final features:

1. Create a protected integration branch.
2. Commit reviewed local source changes selectively.
3. Exclude `runs/`, raw solver files, caches, `__MACOSX`, videos, unrelated coursework, secrets, and generated TypeScript build information.
4. Quarantine the inconsistent legacy benchmark.
5. Remove automatic benchmark injection.
6. Remove false claims including GNN, Fluent, fixed precision, fixed efficiency, and fixed fuel savings.
7. Add `.env.example`, dependency lock files, smoke tests, and CI.
8. Confirm that the baseline backend and frontend build before physics refactoring begins.

---

## 3. Product Modes and User Journeys

### 3.1 Mode A - Design a New Shelter (primary)

The user supplies requirements, not a complete shelter drawing.

#### User inputs

- location or coordinates;
- deployment dates/season;
- mission type: living, sleeping, medical, command, storage, equipment, mixed;
- occupancy and schedules;
- maximum footprint/site dimensions;
- allowed floor count: one, two, or system-decides;
- required room types;
- comfort target;
- available materials and construction methods;
- budget and analysis period;
- heater/fuel/electricity availability;
- site orientation restrictions;
- optional maximum mass, assembly time, or logistics constraints.

#### COCOON generates

- number of rooms and floors;
- feasible room dimensions and arrangement;
- airlock placement;
- doors, partitions, staircase, windows, and orientation;
- wall, roof, floor, glazing, and insulation assemblies;
- heater capacity and control strategy;
- alternative designs and final recommendation;
- interactive 3D model and reports.

### 3.2 Mode B - Evaluate an Existing Shelter

The user supplies an existing layout and construction. COCOON calculates its performance and generates retrofit alternatives such as insulation, glazing, airlock, orientation-specific shading, airtightness, or heater improvements.

### 3.3 Mode C - Engineering Optimization

An authorized engineering user controls candidate count, seeds, constraints, objective weights, weather windows, reliability runs, and ANSYS validation. The mode exposes complete assumptions and audit artifacts.

### 3.4 Mode D - Reference Benchmark Library

This mode displays stored reference cases only. Each case must show its exact configuration, solver version, weather, timestep, mesh, metrics, creation date, and checksum. It must state: **Reference benchmark - not the current custom design**.

### 3.5 Complete primary journey

1. Create project.
2. Select new shelter or existing shelter.
3. Enter location and mission requirements.
4. Review weather source and period.
5. Enter footprint, occupancy, rooms, budget, materials, and utility constraints.
6. Generate candidate layouts.
7. View immediate ML screening only when model coverage is valid.
8. Run RC verification on shortlisted candidates.
9. Review room-wise temperature, heating, reliability, and economics.
10. Inspect selected shelter in 3D.
11. Optionally edit and re-run the selected design.
12. Submit the exact revision for ANSYS validation.
13. Review validation status and results.
14. Export design decision report and thermal specification pack.

---

## 4. Final System Architecture

```text
Web App (Next.js) ---------+
                           |
Mobile App (Expo) ---------+--> FastAPI API --> Project/Design Service
                           |                       |
CLI / Batch Tools ---------+                       +--> Weather & Material Data
                                                   +--> Layout/Scenario Generator
                                                   +--> ML Screening
                                                   +--> Multi-Zone RC Solver
                                                   +--> Optimizer & Reliability
                                                   +--> Lifecycle Economics
                                                   +--> Report/Visualization Data
                                                   +--> ANSYS Job Queue
                                                            |
                                                            v
                                                Windows PyMAPDL Worker
                                                            |
                                                            v
                                                    ANSYS Student/MAPDL

PostgreSQL/Supabase: users, projects, designs, runs, jobs, assumptions
Object/local storage: weather snapshots, timeseries, reports, contours, videos
Redis/RQ: asynchronous jobs and progress (filesystem queue allowed for local demo)
```

### 4.1 Separation of responsibilities

| Layer | Responsibility | Must not do |
|---|---|---|
| Web/mobile | Collect inputs, display results, render 3D, poll jobs | Recalculate authoritative physics |
| Layout generator | Produce feasible geometry from requirements | Claim structural certification |
| ML | Fast screening | Issue final engineering recommendation alone |
| RC engine | Authoritative rapid thermal/energy calculation | Pretend to be FEM/CFD |
| Economics | Convert quantities and energy into lifecycle decisions | Use hidden fixed prices |
| ANSYS | Independently validate selected exact revisions | Receive RC-predicted indoor temperature as a prescribed answer |
| Benchmark library | Present reference evidence | Appear inside unrelated custom results |

---

## 5. Modular Development and Integration Contracts

All modules communicate through versioned JSON/CSV contracts. No module imports another module's internal files directly. Shared Pydantic/TypeScript schemas are the integration boundary.

### 5.1 Module map

| ID | Module | Primary owner | Inputs | Outputs | Can be developed with |
|---|---|---|---|---|---|
| M0 | Shared contracts and fixtures | Backend owner | PRD schemas | JSON Schema, Pydantic, TS types | Static fixtures |
| M1 | Repository stabilization | Integration owner | Existing repo | Clean buildable baseline | Current code |
| M2 | Requirement and layout generator | Optimization owner | Mission requirements | Candidate `BuildingModel` objects | M0 fixtures |
| M3 | Weather and materials | Physics-data owner | Location, dates, material IDs | Versioned weather/material snapshots | Cached files |
| M4 | Multi-zone physics | Physics owner | `BuildingModel`, weather, schedules | Thermal timeseries and summary | M0/M3 fixtures |
| M5 | ML surrogate | ML owner | Dataset from M4 | Model artifact, predictions, coverage | Generated CSV |
| M6 | Optimization/reliability | Optimization owner | Candidates, ML/RC outputs | Ranked shortlist/Pareto set | Mock predictor |
| M7 | Lifecycle economics | Backend/economics owner | Quantities, RC heating results, assumptions | LCC/NPV/payback/sensitivity | Static RC fixture |
| M8 | ANSYS validation | ANSYS owner | Frozen design package | Status, series, contours, metrics | Reference case package |
| M9 | Backend/jobs/database | Backend owner | All contracts | REST API and persistence | Module adapters/mocks |
| M10 | 3D viewer | Frontend owner | `VisualizationModel` and temperature series | Interactive web/mobile visualization | JSON fixture |
| M11 | Web application | Frontend owner | REST/OpenAPI | Complete web workflow | Mock API |
| M12 | Mobile application | Mobile owner | REST/OpenAPI | Complete mobile workflow | Mock API |
| M13 | Reports/benchmark evidence | Backend/ANSYS | Frozen revisions and outputs | PDF/CSV/evidence packages | Fixtures |
| M14 | QA/CI/deployment | Integration owner | All modules | Reproducible release | Test doubles |

### 5.2 Contract-first integration rule

M0 must be frozen before parallel development. Every contract includes:

- `schema_version`;
- stable IDs;
- SI units internally;
- ISO-8601 timestamps with timezone;
- `source`, `version`, and provenance;
- explicit nullability;
- validation ranges;
- error codes;
- generated example fixture.

### 5.3 Integration milestones

| Milestone | Required modules | Demonstration |
|---|---|---|
| I1 | M0, M1, M3, M4 | One building JSON produces deterministic thermal results |
| I2 | M2, M4, M6 | Requirements generate candidates and a verified shortlist |
| I3 | M7, M9 | Verified design produces lifecycle economics through API |
| I4 | M10, M11 | Web renders exact selected shelter and room temperatures |
| I5 | M5 | ML screens; OOD case safely falls back to RC |
| I6 | M8, M9 | Exact design submitted to Windows worker and status returned |
| I7 | M12 | Mobile completes project-to-results flow |
| I8 | M13, M14 | Evidence-backed report, tests, and release build pass |

---

## 6. Complete Repository Structure

This preserves the monorepo structure established in the prototype PRD while making final modules explicit.

```text
cocoon-thermal-shelter/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── pyproject.toml
├── requirements-lock.txt
│
├── packages/
│   ├── contracts/
│   │   ├── jsonschema/
│   │   │   ├── project.schema.json
│   │   │   ├── requirements.schema.json
│   │   │   ├── building.schema.json
│   │   │   ├── weather.schema.json
│   │   │   ├── simulation.schema.json
│   │   │   ├── economics.schema.json
│   │   │   ├── ansys-job.schema.json
│   │   │   └── visualization.schema.json
│   │   ├── python/cocoon_contracts/
│   │   ├── typescript/src/
│   │   └── fixtures/
│   └── api-client/
│       ├── src/generated/
│       └── package.json
│
├── physics_engine/
│   ├── __init__.py
│   ├── thermal_calculator/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── materials.py
│   │   ├── weather.py
│   │   ├── heat_transfer.py
│   │   ├── thermal_model.py
│   │   ├── legacy_single_zone.py
│   │   ├── multizone/
│   │   │   ├── graph_builder.py
│   │   │   ├── matrix_assembler.py
│   │   │   ├── implicit_solver.py
│   │   │   ├── zone_balance.py
│   │   │   ├── interzone_conduction.py
│   │   │   ├── airflow_exchange.py
│   │   │   └── hvac_control.py
│   │   ├── solar/
│   │   │   ├── solar_position.py
│   │   │   ├── irradiance.py
│   │   │   ├── window_gain.py
│   │   │   └── opaque_surface_gain.py
│   │   ├── envelope/
│   │   │   ├── assemblies.py
│   │   │   ├── convection.py
│   │   │   ├── infiltration.py
│   │   │   ├── doors.py
│   │   │   ├── ground.py
│   │   │   ├── sky_radiation.py
│   │   │   └── thermal_mass.py
│   │   ├── schedules/
│   │   ├── outputs/
│   │   └── data/
│   │       ├── material_properties.json
│   │       ├── construction_profiles.json
│   │       ├── glazing_profiles.json
│   │       └── weather_cache/
│   └── tests/
│       ├── unit/
│       ├── conservation/
│       ├── regression/
│       └── fixtures/
│
├── design_generator/
│   ├── requirement_parser.py
│   ├── template_catalog.py
│   ├── layout_generator.py
│   ├── geometry_resolver.py
│   ├── connection_detector.py
│   ├── candidate_generator.py
│   ├── constraints.py
│   ├── quantities.py
│   ├── templates/
│   │   ├── single_room.json
│   │   ├── airlock_living.json
│   │   ├── living_sleeping_storage.json
│   │   ├── command_post.json
│   │   ├── medical_post.json
│   │   └── two_floor_compact.json
│   └── tests/
│
├── ml_pipeline/
│   ├── scenario_generator.py
│   ├── dataset_builder.py
│   ├── feature_engineering.py
│   ├── split_strategy.py
│   ├── train_model.py
│   ├── evaluate_model.py
│   ├── uncertainty.py
│   ├── coverage.py
│   ├── predict.py
│   ├── models/
│   │   ├── surrogate.joblib
│   │   └── metadata.json
│   ├── data/
│   └── tests/
│
├── optimization/
│   ├── objectives.py
│   ├── constraints.py
│   ├── screening.py
│   ├── rc_verification.py
│   ├── pareto.py
│   ├── reliability.py
│   ├── ranking.py
│   └── tests/
│
├── economics/
│   ├── quantities.py
│   ├── heating_fuel.py
│   ├── capex.py
│   ├── opex.py
│   ├── lifecycle.py
│   ├── sensitivity.py
│   ├── assumptions.py
│   └── tests/
│
├── ansys_pipeline/
│   ├── geometry_builder.py
│   ├── material_mapper.py
│   ├── boundary_condition_builder.py
│   ├── mesh_config.py
│   ├── validation_package.py
│   ├── pyansys_runner.py
│   ├── contour_export.py
│   ├── result_extractor.py
│   ├── comparison.py
│   ├── worker.py
│   ├── representative_case_selector.py
│   ├── quarantined/
│   ├── benchmarks/
│   ├── results/
│   └── tests/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   ├── logging.py
│   │   │   └── errors.py
│   │   ├── api/
│   │   │   ├── dependencies.py
│   │   │   └── routes/
│   │   │       ├── auth.py
│   │   │       ├── projects.py
│   │   │       ├── requirements.py
│   │   │       ├── designs.py
│   │   │       ├── weather.py
│   │   │       ├── materials.py
│   │   │       ├── simulations.py
│   │   │       ├── optimizations.py
│   │   │       ├── economics.py
│   │   │       ├── ansys.py
│   │   │       ├── benchmarks.py
│   │   │       ├── visualization.py
│   │   │       └── reports.py
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── workers/
│   │   └── db/
│   │       ├── session.py
│   │       ├── migrations/
│   │       └── models/
│   ├── tests/
│   └── requirements.txt
│
├── frontend-web/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── new-shelter/
│   │   ├── existing-shelter/
│   │   ├── generation/
│   │   ├── results/[designId]/
│   │   ├── compare/
│   │   ├── benchmarks/
│   │   └── settings/
│   ├── components/
│   │   ├── forms/
│   │   ├── layout/
│   │   ├── results/
│   │   ├── economics/
│   │   ├── ansys/
│   │   └── viewer3d/
│   ├── lib/
│   ├── public/
│   └── tests/
│
├── mobile-app/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (tabs)/
│   │   ├── projects/
│   │   ├── design/
│   │   ├── results/
│   │   ├── compare/
│   │   ├── ansys/
│   │   └── settings/
│   ├── components/
│   ├── storage/
│   ├── sync/
│   ├── lib/
│   └── tests/
│
├── reporting/
│   ├── decision_report.py
│   ├── thermal_specification.py
│   ├── evidence_manifest.py
│   ├── charts.py
│   └── templates/
│
├── data/
│   ├── materials/
│   ├── costs/
│   ├── weather/
│   ├── benchmarks/
│   └── fixtures/
│
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── physics-model.md
│   ├── api-reference.md
│   ├── ansys-guide.md
│   ├── validation-report.md
│   ├── user-guide.md
│   └── deployment.md
│
├── scripts/
│   ├── setup_env.ps1
│   ├── setup_env.sh
│   ├── run_dev.ps1
│   ├── run_dev.sh
│   ├── generate_scenarios.py
│   ├── train_ml_model.py
│   ├── validate_ansys.py
│   └── seed_demo.py
│
└── .github/workflows/
    ├── ci.yml
    └── release.yml
```

### 6.1 Migration map from the current repository

| Current location | Target location | Rule |
|---|---|---|
| `thermal-calculator/` | `physics_engine/thermal_calculator/` | Move only after import adapters and tests pass |
| `Frontend/cocoon-frontend/` | `frontend-web/` | Preserve Git history or keep current path with an adapter during submission |
| `ansys-pipeline/` | `ansys_pipeline/` | Do not rename until Windows launch scripts are updated |
| root pipeline scripts | `backend/app/services/` or module packages | Migrate incrementally |
| `runs/` | runtime storage outside Git | Never commit |
| legacy benchmark | `ansys_pipeline/quarantined/` | Never show as valid evidence |

---
## 7. Shared Domain Model and Input Contracts

### 7.1 Project and requirements

The primary design request contains mission requirements rather than complete geometry.

```json
{
  "schema_version": "4.0",
  "project_id": "prj_uuid",
  "mode": "new_shelter",
  "site": {
    "latitude_deg": 34.1526,
    "longitude_deg": 77.5771,
    "elevation_m": 3500,
    "timezone": "Asia/Kolkata",
    "weather_source": "NASA_POWER",
    "analysis_start": "2026-01-01T00:00:00+05:30",
    "analysis_end": "2026-01-08T00:00:00+05:30"
  },
  "mission": {
    "type": "living_sleeping",
    "occupants": 30,
    "required_rooms": ["airlock", "living", "sleeping", "equipment"],
    "occupancy_schedule_id": "continuous_30",
    "target_temperature_c": 15,
    "maximum_unmet_hours": 12
  },
  "constraints": {
    "maximum_footprint_m2": 48,
    "maximum_floors": 2,
    "maximum_capex_inr": 2500000,
    "available_material_ids": ["stone", "puf", "plywood", "steel_panel"],
    "heater_fuels": ["kerosene"],
    "preferred_orientation_deg": null
  },
  "economic_assumption_set_id": "econ_ladakh_expected_v1"
}
```

### 7.2 Generated building model

Every candidate becomes a complete `BuildingModel` before it reaches physics.

```json
{
  "schema_version": "4.0",
  "design_id": "des_uuid",
  "revision_id": "rev_uuid",
  "source": "generated",
  "orientation_deg": 180,
  "floors": [
    {
      "id": "floor_0",
      "level": 0,
      "elevation_m": 0,
      "zones": [
        {
          "id": "airlock",
          "type": "airlock",
          "origin_m": {"x": 0, "y": 0, "z": 0},
          "size_m": {"length": 1.2, "width": 4, "height": 2.8},
          "occupancy_schedule_id": null,
          "equipment_schedule_id": null,
          "hvac_id": null
        },
        {
          "id": "living",
          "type": "living",
          "origin_m": {"x": 1.2, "y": 0, "z": 0},
          "size_m": {"length": 4.8, "width": 4, "height": 2.8},
          "occupancy_schedule_id": "continuous_20",
          "equipment_schedule_id": "living_equipment",
          "hvac_id": "heater_ground"
        }
      ]
    }
  ],
  "surfaces": [],
  "openings": [],
  "connections": [],
  "assemblies": {},
  "schedules": {},
  "metadata": {
    "generator_version": "layout_generator_v1",
    "seed": 42,
    "created_at": "2026-09-20T10:00:00Z"
  }
}
```

### 7.3 Surface model

Every surface must specify:

- owning zone;
- boundary type: outdoors, ground, adjacent zone, or adiabatic;
- surface type: external wall, partition, roof, floor, ceiling;
- area;
- azimuth using 0° north, 90° east, 180° south, 270° west;
- tilt: 0° upward horizontal roof, 90° vertical wall, 180° downward horizontal;
- construction assembly ID;
- adjacent zone/surface if internal;
- exposed fraction and optional shading metadata.

### 7.4 Openings and schedules

Windows store area, parent surface, U-value, SHGC, glazing ID, frame fraction, shading factor, and operability. Doors store area, U-value, connected boundary, event schedule, average opening duration, and discharge/air-exchange parameters.

Schedules are explicit timestamp/value series or reusable profiles. Occupancy, equipment, doors, heaters, and setpoints must not be hidden constants.

### 7.5 Units

Internal APIs use SI:

- metres, square metres, cubic metres;
- seconds and timezone-aware timestamps;
- watts, joules, kWh;
- °C in API/display and kelvin inside radiation calculations;
- W/(m·K), J/(kg·K), kg/m³;
- INR with assumption date and source.

---

## 8. Module M2 - Requirement and Layout Generator

### 8.1 Purpose

Generate thermally evaluable shelter structures from mission constraints. The user is not required to design every room.

### 8.2 Template catalogue

Initial templates:

1. single room;
2. airlock plus living room;
3. airlock, living, and equipment;
4. living, sleeping, and storage;
5. command post;
6. medical post;
7. compact two-floor shelter.

Templates define topology, not fixed dimensions or materials.

### 8.3 Generation logic

1. Convert occupancy and room types into minimum usable areas.
2. Select allowed topology templates.
3. Allocate rooms within the footprint.
4. Test one-floor and multi-floor alternatives when allowed.
5. Place the airlock between outdoors and the primary occupied zone.
6. Place stairs/vertical connections without room overlap.
7. Detect external and internal surfaces.
8. Place allowable windows and doors.
9. Rotate the building through permitted orientations.
10. Apply material/insulation assemblies.
11. Calculate quantities and reject invalid candidates.
12. Emit deterministic candidates using a recorded seed.

### 8.4 Feasibility constraints

- rooms cannot overlap;
- all rooms must be reachable;
- room area and dimensions must meet configured minima;
- total footprint and floor count must respect requirements;
- each opening must lie on a valid parent surface;
- internal surfaces must pair correctly between adjacent zones;
- upper zones require supported overlap below;
- staircases require allocated area and a vertical connection;
- window-to-wall ratio must stay within configurable bounds;
- materials and thicknesses must exist in the versioned database;
- generated geometry must be renderable and simulatable.

### 8.5 Existing-shelter path

Existing shelters use the same `BuildingModel`, but `source="user_defined"`. The frontend provides templates and a grid editor. The geometry resolver automatically derives surfaces and connections; the user reviews detected topology before running.

### 8.6 Outputs and acceptance

Output: 10-500 valid candidates depending on mode. Each candidate includes a validation report listing passed constraints and rejected alternatives. Fixed seed plus identical databases must reproduce identical candidates.

---

## 9. Module M3 - Weather, Climate, and Materials

### 9.1 Weather inputs

Required hourly fields:

- outdoor dry-bulb temperature;
- global horizontal irradiance (GHI);
- direct normal irradiance (DNI) and diffuse horizontal irradiance (DHI), or enough data to derive them;
- wind speed;
- wind direction where available;
- relative humidity;
- cloud information where available;
- timestamp and timezone.

### 9.2 Weather processing

1. Fetch NASA POWER or load an uploaded/cached file.
2. Normalize timestamps to the project timezone.
3. Validate gaps, duplicates, ranges, and units.
4. Interpolate only short gaps and record every interpolation.
5. If only GHI exists, decompose it using a documented `pvlib` model.
6. Derive solar position from coordinates and timestamps.
7. Create typical, worst-cold, and user-selected windows.
8. Freeze a weather snapshot and checksum for reproducibility.

### 9.3 Offline behavior

Cached weather is allowed only when the UI displays source, location, period, fetch date, and whether it is cached. A generic fallback must not be silently relabelled as the selected location.

### 9.4 Material database

Every material record includes:

- stable ID and display name;
- thermal conductivity `k`;
- density `rho`;
- specific heat `cp`;
- emissivity and solar absorptivity where applicable;
- cost unit and value where available;
- source/reference and effective date;
- valid temperature range and uncertainty when known.

Every assembly stores ordered layers, thicknesses, inside/outside surface films, and version. Costs are separate from thermal properties so they can change independently.

---

## 10. Module M4 - Multi-Zone and Multi-Floor Physics Engine

### 10.1 Model architecture

The final model is a graph:

- zone nodes store air/effective thermal states;
- envelope edges connect a zone to outdoors or ground;
- partition edges connect adjacent zones;
- floor/ceiling edges connect vertical zones;
- airflow edges represent infiltration, doors, and stairs;
- HVAC and internal gains inject/remove heat.

The engine must support `N >= 1` zones and `F >= 1` floors. It must not contain separate hardcoded functions for one-room, two-room, and two-floor cases.

### 10.2 Zone energy balance

For zone `i`:

```text
C_i dT_i/dt =
    sum_j H_ij (T_j - T_i)
  + H_i,out (T_out - T_i)
  + H_i,ground (T_ground - T_i)
  + Q_solar,i
  + Q_internal,i
  + Q_HVAC,i
  + Q_airflow,i
  - Q_longwave,i
```

Where `H = U x A` for conductive links. Internal heat exchange must be equal and opposite between connected zones.

### 10.3 Conductive assemblies

For each layer:

```text
R_layer = thickness / conductivity
R_total = R_inside_film + sum(R_layer) + R_outside_film
U = 1 / R_total
Q = U x A x delta_T
```

Windows and doors use their own U-values and net areas. Door area must be subtracted from opaque wall area.

### 10.4 Thermal capacitance

```text
C_layer = density x specific_heat x volume
C_zone = C_effective_construction + C_contents + C_air
```

The existing position-weighting model may remain as a documented calibration option, but its coefficient must be configurable and validation evidence must identify whether it was enabled. Long-term improvement is a 2R2C/multi-node construction model; it is not required to falsely claim completion.

### 10.5 Directional solar

Use the standard azimuth convention:

- north `0°`;
- east `90°`;
- south `180°`;
- west `270°`.

For every exterior surface, use `pvlib` solar position and plane-of-array irradiance. Include direct, diffuse-sky, and ground-reflected components.

```text
Q_window_solar = POA_irradiance x window_area x SHGC x shading_factor
```

Opaque solar gain uses a documented sol-air or equivalent absorbed-flux method. It must not be double-counted in both surface temperature and internal gain.

### 10.6 Dynamic exterior convection

Wind modifies the exterior film coefficient. The chosen correlation must be named in documentation, applied by surface exposure, bounded to a validated range, and covered by tests. If wind direction is available, windward and sheltered surfaces receive different exposure factors.

### 10.7 Infiltration and ventilation

Base infiltration:

```text
mass_flow = air_density x ACH x volume / 3600
Q_infiltration = mass_flow x cp_air x (T_out - T_zone)
```

ACH may be fixed from an airtightness class in the final-submission implementation. Wind/stack-derived ACH is an extension only if validated.

### 10.8 Door events

Each door has area, boundary, openings per hour, duration, and schedule. External doors exchange with outdoors; internal doors exchange between zones. Airflow energy must be equal and opposite for internal doors.

Door-event models must be labelled as empirical and configurable. Event-active simulations use a 5-15 minute timestep.

### 10.9 Vertical connections and stairs

Intermediate floors use conductive floor/ceiling edges. Open stairs/shafts use an inter-zone airflow coefficient or validated stack approximation. Only bottom-floor exposed surfaces connect to ground, and only top-floor exposed surfaces connect to the roof/outdoors.

### 10.10 Ground and long-wave sky

Ground temperature must be separate from outdoor air and must state its source or assumption. Long-wave sky radiation is enabled only when the required inputs or documented approximation exist. All temperatures in Stefan-Boltzmann calculations use kelvin. Cloud adjustment must be tested; the earlier sign-error approximation must not be reused.

### 10.11 Internal gains and schedules

Occupants, equipment, lights, and other gains use explicit schedules. Default occupant sensible gain is configurable; it must not be permanently fixed at 100 W/person without displaying the assumption.

### 10.12 HVAC modes

The engine runs:

1. **Free-floating:** no heater; measures passive performance.
2. **Ideal-load conditioned:** calculates energy required to hold the setpoint.
3. **Capacity-limited conditioned:** applies heater capacity/efficiency and reports unmet hours.

Heating demand for economics comes from conditioned simulation, not from a temperature-deficit shortcut.

### 10.13 Numerical solver

Use an implicit matrix update:

```text
(C/dt + L) T_next = (C/dt) T_current + b_next
```

Requirements:

- configurable timestep;
- simultaneous solution of all zones;
- stable behavior for stiff conductances;
- deterministic results;
- explicit energy-balance residual output;
- no acceptance of results merely because temperatures remain within arbitrary clipping bounds.

### 10.14 Physics outputs

For every timestamp and zone:

- zone temperature;
- setpoint and heater output;
- comfort status;
- solar gain by opening/direction;
- conductive flow by surface;
- inter-zone conduction;
- infiltration/door/stair airflow heat;
- internal gains;
- ground and long-wave terms;
- net energy and residual.

Summary outputs:

- min/mean/max by zone;
- occupied comfort hours;
- peak heater load;
- heating energy;
- unmet hours;
- heat-loss breakdown;
- maximum zone imbalance;
- airlock benefit versus matched no-airlock baseline.

### 10.15 Physics acceptance tests

- identical connected zones converge toward equal temperatures;
- internal heat lost equals heat gained within tolerance;
- increasing insulation reduces conduction under identical conditions;
- zero temperature difference produces zero conductive heat;
- east/west windows peak in appropriate periods;
- rotating a design changes directional solar consistently;
- only bottom-floor surfaces exchange with ground;
- only top-floor surfaces exchange through the roof;
- an external door event increases heat loss in a cold scenario;
- an airlock reduces living-zone door shock against a matched baseline;
- higher setpoint never reduces ideal heating demand;
- halving timestep produces results within defined convergence tolerance;
- energy residual stays below a documented threshold.

---

## 11. Module M5 - ML Surrogate

### 11.1 Purpose

Screen large candidate sets quickly. ML is not the source of physics truth.

### 11.2 Dataset generation

Generate thousands of valid candidate/scenario pairs using M2 and label them using M4. Store:

- design and weather snapshot IDs;
- schema/model/engine versions;
- generated features;
- RC summary targets;
- seed and failure flags.

Do not train on failed or numerically invalid cases.

### 11.3 Features

- floor and zone counts;
- footprint, volume, compactness, exposed area;
- adjacency/connection aggregates;
- envelope U-values and thermal capacitance;
- window area by orientation and SHGC;
- infiltration class and door activity;
- occupancy/internal-gain aggregates;
- heater configuration;
- weather summary and extremes;
- location/elevation;
- economic-independent physical features.

The first release may support a bounded number of templates/zones. Arbitrary geometries always remain supported by RC even when ML coverage is unavailable.

### 11.4 Targets

- minimum occupied-zone temperature;
- average occupied-zone temperature;
- maximum zone temperature;
- comfort hours;
- peak heating load;
- heating energy;
- maximum zone imbalance.

Fuel and cost should preferably be calculated downstream from predicted/verified heating energy, not learned as opaque targets.

### 11.5 Training and evaluation

- baseline: Extra Trees and Random Forest;
- optional: XGBoost only if dependency and time allow;
- split by complete scenarios/templates/weather periods, never random hourly rows;
- report MAE, RMSE, R², worst error, and metrics by region/template;
- store training ranges, dataset checksum, Git commit, engine version, hyperparameters, and metrics in `metadata.json`.

### 11.6 Coverage/OOD guard

Before inference, confirm categorical support and numeric ranges. If unsupported:

```text
ML status = out_of_distribution
Action = skip ML and run RC
```

The UI must never fabricate a confidence score. It displays measured validation coverage or a clear unavailable state.

### 11.7 Recommendation rule

ML can reduce thousands of candidates to a shortlist. Every finalist must be recalculated with M4. The final report uses RC values and records ML screening separately.

---

## 12. Module M6 - Optimization and Reliability

### 12.1 Candidate variables

- topology template and floor count;
- dimensions within constraints;
- building orientation;
- wall/roof/floor assemblies;
- insulation material and thickness;
- glazing and window placement;
- airlock/partition configuration;
- airtightness class;
- heater type/capacity where permitted.

### 12.2 Hard constraints

Invalid layouts, unavailable materials, exceeded footprint/floor/budget limits, invalid thicknesses, excessive window ratios, inaccessible rooms, or unsupported geometry are rejected before simulation.

### 12.3 Objectives

Avoid one hidden score as the only decision. Maintain separate normalized objectives:

- occupied thermal comfort;
- heating energy;
- peak capacity/unmet hours;
- capital cost;
- discounted lifecycle cost;
- material/logistics mass where data exists;
- reliability under weather/parameter variation.

Return the Pareto set plus named recommendations: best overall, best thermal, lowest lifecycle cost, and lowest capital cost. If a composite score is used, expose weights and allow engineering users to edit them.

### 12.4 Reliability

Perturb meaningful physical/economic inputs, not only ranking weights:

- weather period/extreme day;
- infiltration;
- material conductivity;
- internal gains;
- door usage;
- fuel price;
- discount rate.

Report whether the winner remains stable and which assumptions drive the decision.

---

## 13. Module M7 - Advanced Lifecycle Economics

### 13.1 Purpose

Translate verified physical results into a transparent procurement and operations decision. No cost or savings figure is universal or hardcoded as a product claim.

### 13.2 Assumption set

Each analysis freezes a versioned assumption set containing:

- material unit costs and units;
- labour and installation cost;
- transport distance/mode and remote logistics multiplier;
- heater purchase and installation;
- fuel type, lower heating value, price, delivery premium, and escalation;
- heater efficiency;
- routine maintenance;
- replacement schedules and costs;
- project lifetime;
- discount rate;
- residual/salvage value;
- optional downtime/mission logistics value;
- currency and effective date;
- source, owner, and low/expected/high ranges.

### 13.3 Quantity calculation

Quantities come from the generated geometry:

- net wall/partition/roof/floor areas;
- opening counts and areas;
- material volume/mass by layer;
- staircase/door/window counts;
- heater count and capacity.

Manual quantity overrides require a reason and remain in the audit log.

### 13.4 Heating and fuel conversion

Use conditioned RC heating energy:

```text
fuel_litres = heating_energy_kWh /
              (fuel_energy_kWh_per_litre x heater_efficiency)
```

Default kerosene energy may be approximately 9.7 kWh/L only as a visible, editable assumption with source. Never reuse a fixed `1500 L/year` baseline without simulating or documenting the baseline.

### 13.5 Lifecycle calculations

For analysis period `N` and discount rate `r`:

```text
LCC = CAPEX
    + sum_y[(fuel_y + maintenance_y + replacement_y + logistics_y)/(1+r)^y]
    - residual_value_N/(1+r)^N
```

Calculate:

- CAPEX;
- annual and cumulative OPEX;
- simple payback;
- discounted payback;
- net present value relative to baseline;
- lifecycle cost for selected horizons;
- break-even year;
- cost per occupied day/person-day;
- annual fuel and transport reduction;
- low/expected/high sensitivity scenarios.

IRR is optional and must be omitted when cash-flow conditions make it misleading.

### 13.6 Baseline comparison

The baseline must be another frozen design revision simulated with the same weather, schedules, target, analysis period, and economic framework. If the system uses a standard uninsulated template, that fact must be explicit.

### 13.7 Acceptance tests

- zero discount rate equals undiscounted summation;
- zero annual savings produces no finite payback;
- higher fuel price never reduces fuel expense;
- material quantities match geometry hand checks;
- 10-year totals reconcile exactly with yearly cash flows;
- low/expected/high assumptions remain distinct and traceable;
- all displayed currency figures identify date and assumption set.

---

## 14. Module M8 - ANSYS Validation Pipeline

### 14.1 Role

ANSYS MAPDL transient thermal analysis independently validates envelope and partition heat transfer for selected exact design revisions. It does not replace RC optimization and is not presented as detailed indoor airflow CFD.

### 14.2 Student/licence deployment boundary

For the academic submission, ANSYS Student runs on an authorized Windows machine for educational/project use and within installed product/model limits. Mobile and web devices never run ANSYS locally. A production organizational service requires an appropriate institutional/commercial licence and deployment review.

### 14.3 Execution architecture

```text
Web/Mobile -> POST validation job -> Backend queue
           -> Windows ANSYS worker -> PyMAPDL -> ANSYS MAPDL
           -> result package -> storage/database -> Web/Mobile
```

For the local demo, the backend and worker may run on the same Windows laptop and phones connect on the same network.

### 14.4 Frozen validation package

Before queueing, create an immutable package:

- design revision JSON;
- material snapshot;
- weather/boundary CSV;
- schedule snapshot;
- solver configuration;
- expected output timestamps;
- hashes of all inputs;
- RC result reference for later comparison, never as a boundary answer.

### 14.5 Geometry

PyMAPDL builds:

- external walls with ordered layers;
- internal partitions;
- roof and exposed floor/ground interfaces;
- intermediate floors/ceilings;
- windows/doors at supported fidelity;
- separate room/air representations or equivalent zone coupling as documented;
- named components for surfaces and zones.

Geometry generation must produce a manifest mapping logical IDs to ANSYS entities.

### 14.6 Boundary conditions

Apply the same independent scenario inputs as RC:

- initial temperatures;
- outdoor transient temperature;
- exterior convection correlation and wind inputs;
- ground boundary;
- directional solar/absorbed heat flux;
- internal heat schedules;
- indoor convection or documented equivalent air representation;
- identical start/end time and output timestamps.

Do not use fixed exterior temperature and convection simultaneously on the same surface. Do not apply all solar/internal heat to the floor merely for convenience in final evidence.

### 14.7 Mesh and convergence

- start with SOLID70 for live/coarse cases;
- use finer elements or SOLID90 only when needed and within licence limits;
- require at least one element through important thin layers or use an appropriate equivalent representation;
- perform a coarse-versus-refined mesh check on representative evidence cases;
- record nodes/elements, element type, element size, runtime, and convergence/status.

### 14.8 Outputs

```text
results/<validation_job_id>/
├── input_manifest.json
├── scenario.json
├── boundary_conditions.csv
├── solver_manifest.json
├── geometry.png
├── mesh.png
├── temperature_series.csv
├── surface_temperature_series.csv
├── heat_flux_series.csv
├── contour_frames/
├── temperature_animation.mp4
├── comparison_metrics.json
├── validation_summary.json
└── checksums.sha256
```

### 14.9 Status model

Allowed states:

```text
NOT_REQUESTED -> QUEUED -> PREPARING -> MESHING -> SOLVING
              -> EXPORTING -> COMPLETED
              -> FAILED | CANCELLED | TIMED_OUT | UNAVAILABLE
```

Failure does not erase RC/economics results. The UI must show the real state and reason.

### 14.10 Comparison

Compare matching timestamps and meaningful quantities:

- room/zone-equivalent average temperature where definitions match;
- selected interior/exterior surface temperatures;
- heat-flow trends;
- MAE, RMSE, bias, maximum absolute error, R² where meaningful;
- ranking agreement across multiple validated candidates.

Do not advertise an accuracy threshold until a representative independent test set achieves it.

### 14.11 Required evidence cases

Minimum submission evidence:

1. baseline single-zone design;
2. improved insulated single-zone design;
3. airlock plus living-room design.

Preferred additional cases:

4. representative two-floor design;
5. extreme-winter/weather case;
6. orientation or material contrast.

### 14.12 Benchmark policy

- Quarantine the inconsistent legacy package.
- Generate new benchmarks from a single reproducible run per package.
- Store only internally consistent design IDs, geometry, weather, timestamps, solver settings, and metrics.
- Recommended/claimed designs must actually be among validated designs.
- Never fall back to a benchmark inside a custom result response.

---

## 15. Module M9 - Backend, Persistence, and Jobs

### 15.1 Technology

- FastAPI and Pydantic;
- PostgreSQL/Supabase Postgres for durable production/demo-team data;
- SQLite allowed for isolated local development;
- SQLAlchemy/Alembic migrations;
- Redis + RQ/Celery for general background jobs, or a documented local queue for the submission laptop;
- object/local artifact storage behind one interface;
- OpenAPI-generated client/types.

### 15.2 Authentication and authorization

Recommended final approach: Supabase Auth with FastAPI JWT verification. A self-hosted JWT adapter is acceptable if already implemented. `AUTH_MODE=disabled` is allowed only for local development and must be visible in the UI/logs.

Roles:

- operator: create/run/view own projects;
- engineer: advanced configuration and validation;
- admin: materials, costs, benchmarks, users;
- viewer: read-only shared reports.

### 15.3 Core entities

- users;
- projects;
- requirement_sets;
- designs and immutable design_revisions;
- weather_snapshots;
- material/assembly versions;
- simulations and zone_timeseries references;
- optimization_runs and candidates;
- economic_assumption_sets/results;
- validation_jobs/results;
- reports;
- audit_events.

### 15.4 Idempotency and provenance

Every run receives a UUID. POST job endpoints accept an idempotency key. Results identify code commit, schema version, input hashes, model/engine version, and timestamps.

### 15.5 Security and reliability

- validate all paths with resolved-path containment (`Path.relative_to`), not string-prefix checks;
- restrict artifact types and sizes;
- never expose raw arbitrary filesystem paths;
- authenticate project/job access;
- rate-limit expensive runs;
- set queue capacity and timeouts;
- store job status durably so restart does not lose history;
- isolate ANSYS job folders by UUID and lock each job;
- scrub secrets and user data from logs;
- configure CORS explicitly;
- keep audit logs for assumption/design revisions.

---

## 16. REST API Contract

### 16.1 System/reference

```text
GET  /api/v1/health
GET  /api/v1/capabilities
GET  /api/v1/materials
GET  /api/v1/assemblies
GET  /api/v1/regions
GET  /api/v1/economic-assumption-sets
```

`/capabilities` reports actual runtime support: ML model loaded, ANSYS worker online, weather connectivity, auth mode, and supported schema versions.

### 16.2 Projects and requirements

```text
POST /api/v1/projects
GET  /api/v1/projects
GET  /api/v1/projects/{project_id}
POST /api/v1/projects/{project_id}/requirements
POST /api/v1/projects/{project_id}/existing-building
```

### 16.3 Design generation and editing

```text
POST /api/v1/projects/{project_id}/generate-designs
GET  /api/v1/generation-jobs/{job_id}
GET  /api/v1/projects/{project_id}/designs
GET  /api/v1/designs/{design_id}/revisions/{revision_id}
POST /api/v1/designs/{design_id}/revisions
POST /api/v1/designs/{design_id}/clone
```

### 16.4 Simulation and optimization

```text
POST /api/v1/simulations
GET  /api/v1/simulations/{simulation_id}
GET  /api/v1/simulations/{simulation_id}/timeseries
POST /api/v1/optimizations
GET  /api/v1/optimizations/{optimization_id}
GET  /api/v1/optimizations/{optimization_id}/candidates
GET  /api/v1/optimizations/{optimization_id}/pareto
```

### 16.5 Economics, validation, visualization, and reports

```text
POST /api/v1/economics
GET  /api/v1/economics/{analysis_id}
POST /api/v1/ansys/jobs
GET  /api/v1/ansys/jobs/{job_id}
GET  /api/v1/ansys/jobs/{job_id}/artifacts
GET  /api/v1/visualizations/{revision_id}
GET  /api/v1/benchmarks
GET  /api/v1/benchmarks/{benchmark_id}
POST /api/v1/reports
GET  /api/v1/reports/{report_id}
```

### 16.6 Standard error envelope

```json
{
  "error": {
    "code": "DESIGN_OUTSIDE_ML_COVERAGE",
    "message": "ML screening was skipped; RC verification was started.",
    "details": {},
    "trace_id": "uuid",
    "retryable": false
  }
}
```

---

## 17. Module M10 - Interactive 3D Visualization

### 17.1 Principle

The selected shelter is always visible without ANSYS. The regular 3D model is generated from the same `BuildingModel` used by physics. ANSYS supplies separate validation contours only after a successful exact-design run.

### 17.2 Technology

- Web: Three.js through React Three Fiber and Drei.
- Mobile: shared web viewer in a controlled WebView for the submission to maximize parity and reliability, or native `expo-gl` only if already proven stable.
- Geometry: box meshes per zone/surface/opening, grouped by floor.

### 17.3 Viewer functions

- orbit, pan, zoom, reset camera;
- floor selector and exploded-floor view;
- hide/show roof and floors;
- room selection and metadata panel;
- doors, windows, material layers, dimensions, and north arrow;
- design mode and thermal mode;
- temperature legend and timestamp slider/playback;
- isolate room/surface;
- before/after or candidate comparison;
- accessible fallback list/2D plan.

### 17.4 Thermal coloring

RC mode colors each zone/surface using its corresponding timeseries. It must be labelled **Multi-zone RC visualization**. It must not visually imply nodal FEM detail.

ANSYS mode displays actual exported contour images/video and optional downsampled mesh results labelled **ANSYS MAPDL validation for revision X**.

### 17.5 Visualization model

The backend returns stable positions, dimensions, material IDs, floor groups, opening transforms, zone temperatures, surface temperatures where available, timestamps, and source (`geometry`, `rc`, `ansys`). Web and mobile consume the same payload.

---

## 18. Module M11 - Web Application

### 18.1 Technology and design system

- existing Next.js App Router application;
- TypeScript and Tailwind;
- React Query/SWR for API state;
- React Hook Form + schema validation;
- Recharts for plots;
- project palette: base `#0E1420`, secondary `#1B2434/#F4F5F7`, accents `#3E7CB1` and `#E8934A`;
- responsive, keyboard accessible, and explicit loading/error/empty states.

### 18.2 Required screens

1. Landing and capability status.
2. Login/register.
3. Project dashboard.
4. New shelter requirements wizard.
5. Existing shelter editor.
6. Candidate generation progress.
7. Candidate gallery/Pareto comparison.
8. Design result with tabs: Overview, Rooms, Energy, Economics, 3D, Validation, Evidence.
9. Advanced engineering controls.
10. Reference benchmark library.
11. Reports/history/settings.

### 18.3 Result truth states

Every card/chart indicates source:

- calculated by RC;
- screened by ML;
- verified by RC;
- validated by ANSYS;
- reference benchmark;
- mock/demo fixture (development only).

Mock results must never render as a completed real run in production.

---

## 19. Module M12 - Complete Mobile Application

### 19.1 Technology

- Expo React Native with Expo Router;
- shared generated API client and types;
- secure token storage;
- SQLite/AsyncStorage for drafts and cached metadata;
- same backend as web.

### 19.2 Required mobile screens

1. Authentication/operator identity.
2. Project list and sync state.
3. New project.
4. New-vs-existing shelter selection.
5. Location/weather.
6. Mission, occupancy, rooms, footprint, floors, budget, and materials.
7. Generated candidate list.
8. Simulation/optimization progress.
9. Results overview.
10. Room temperature charts.
11. Interactive 3D viewer.
12. Economics and comparison.
13. ANSYS status/results.
14. Project history and reports.
15. Settings, units, cache, and logout.

### 19.3 Offline behavior

Offline mobile supports:

- creation/editing of drafts;
- cached materials and previously downloaded weather;
- viewing previously downloaded results/reports;
- queued submission when connectivity returns;
- visible `LOCAL_DRAFT`, `PENDING_SYNC`, `SYNCED`, `CONFLICT`, and `FAILED` states.

Heavy RC batches, ML training, optimization, and ANSYS run on backend/worker systems. Offline draft support is not a claim that ANSYS runs offline on the phone.

### 19.4 Conflict handling

Each draft has `updated_at` and revision. On conflict, never silently overwrite. Offer keep local, keep server, or duplicate project.

---

## 20. Module M13 - Reports, Specifications, and Evidence

### 20.1 Report types

1. **Design Decision Report** - requirements, alternatives, ranking, economics, risks, and recommendation.
2. **Thermal Analysis Report** - equations/model version, inputs, room-wise results, heat flows, energy balance, and assumptions.
3. **Validation Report** - frozen scenario, ANSYS configuration, mesh, contours, series, metrics, limitations, and checksums.
4. **Thermal Specification Pack** - geometry, assemblies, quantities, openings, orientation, and performance targets.
5. **CSV/JSON export** - machine-readable inputs and results.

### 20.2 Blueprint wording

The earlier PRD called the PDF a construction blueprint. The final product must instead call it a **conceptual thermal specification/parametric layout** unless a qualified structural workflow is added. It must contain this notice:

> This output is optimized for thermal performance and lifecycle decision support. It is not a structural, fire-safety, geotechnical, electrical, or construction certification. Qualified engineering review is required before construction.

### 20.3 Report contents

- project/design/revision IDs;
- generation time and software versions;
- user requirements;
- exact geometry and 2D floor layouts;
- 3D images;
- materials/assemblies and quantities;
- weather and assumption provenance;
- free-floating and conditioned results;
- room-wise charts and heat-loss breakdown;
- lifecycle cash flows and sensitivity;
- recommendation and plain-language explanation;
- validation state and exact evidence links;
- known limitations and required follow-up checks.

### 20.4 Evidence manifest

Every report has a machine-readable manifest listing input/result hashes and whether each result is ML, RC, ANSYS, derived economics, or reference data.

---

## 21. End-to-End Processing Logic

### 21.1 New shelter

```text
1. Validate requirement request.
2. Freeze weather, material, cost, and schedule snapshots.
3. Generate feasible topologies/layouts.
4. Expand materials, orientation, openings, and insulation candidates.
5. Reject hard-constraint violations.
6. If ML model covers the candidate domain, screen candidates.
7. Otherwise or additionally, run RC directly.
8. Run RC on every finalist in free-floating and conditioned modes.
9. Calculate quantities and lifecycle economics.
10. Run reliability variations on the shortlist.
11. Build Pareto set and explainable recommendations.
12. Save immutable winning revision.
13. Render 3D and all charts from this revision.
14. If requested, send the same revision to ANSYS.
15. Compare independent outputs and attach validation.
16. Generate reports and evidence manifest.
```

### 21.2 Existing shelter

```text
1. Validate/resolve user geometry and connections.
2. Simulate existing baseline.
3. Identify dominant heat losses and comfort failures.
4. Generate retrofit candidates.
5. Run the same ML/RC/economics/reliability pipeline.
6. Compare before versus after.
7. Optionally validate selected retrofit in ANSYS.
```

### 21.3 Recommendation explanation

The explanation must identify concrete drivers, for example:

- south-facing glazing increased useful winter solar gain;
- airlock reduced living-zone door-event losses;
- compact two-floor footprint reduced exposed wall area but increased stair exchange;
- roof insulation reduced the largest conductive loss;
- higher CAPEX was recovered under the selected fuel/logistics assumptions.

No generic claim is accepted without corresponding result fields.

---

## 22. Output Contract

### 22.1 Simulation summary example

```json
{
  "schema_version": "4.0",
  "simulation_id": "sim_uuid",
  "design_revision_id": "rev_uuid",
  "engine": {
    "name": "cocoon_multizone_rc",
    "version": "1.0.0",
    "mode": "conditioned",
    "timestep_seconds": 900
  },
  "status": "completed",
  "summary": {
    "heating_energy_kwh": 0,
    "peak_heating_kw": 0,
    "occupied_comfort_hours": 0,
    "unmet_hours": 0,
    "energy_residual_max_pct": 0
  },
  "zones": [
    {
      "zone_id": "living",
      "temperature_min_c": 0,
      "temperature_mean_c": 0,
      "temperature_max_c": 0,
      "comfort_hours": 0
    }
  ],
  "provenance": {
    "weather_snapshot_id": "wx_uuid",
    "material_version": "materials_v1",
    "code_commit": "git_sha",
    "created_at": "ISO_8601"
  }
}
```

Zeros above are schema examples, not expected performance claims.

### 22.2 Recommendation states

```text
SCREENED_BY_ML
VERIFIED_BY_RC
VALIDATED_BY_ANSYS
RC_ONLY_ANSYS_NOT_REQUESTED
RC_ONLY_ANSYS_UNAVAILABLE
REFERENCE_BENCHMARK
```

The final UI/report must display the correct state.

---

## 23. Non-Functional Requirements

### 23.1 Performance

- basic API responses under 500 ms excluding jobs;
- ML inference target under 1 second on supported hardware, measured not hardcoded;
- single-candidate RC target under 2 seconds for a 24-hour/15-minute small model;
- optimization streams/polls progress and never blocks the request thread;
- 3D first useful render target under 3 seconds on supported devices;
- mobile remains responsive while polling or downloading results.

Targets are measured in release notes and may vary by hardware/scenario.

### 23.2 Reliability

- deterministic runs for fixed seed/versioned inputs;
- durable project/job status across backend restart;
- retry for transient weather/storage failures;
- no automatic retry of invalid physics inputs;
- atomic result publication: incomplete artifacts never appear completed;
- ANSYS failure never corrupts RC results.

### 23.3 Security and privacy

- no secrets in Git;
- TLS for deployed traffic;
- role-based access and project ownership;
- rate limiting and input size limits;
- sanitized filenames and safe artifact serving;
- minimal personal data;
- logs avoid sensitive tokens/inputs;
- dependency scanning and pinned versions.

### 23.4 Accessibility and usability

- keyboard navigation and screen-reader labels on web;
- color legends not dependent on color alone;
- metric/imperial display conversion without changing stored SI data;
- clear assumptions and tooltips;
- simple and advanced views;
- English required; Hindi optional if translated consistently.

### 23.5 Observability

- structured logs with trace, project, run, and job IDs;
- duration/status for every stage;
- model/engine version in results;
- worker heartbeat and ANSYS availability;
- error tracking without exposing confidential data.

---

## 24. Testing Strategy

### 24.1 Unit tests

- geometry/surface/adjacency resolution;
- R/U/C calculations and units;
- directional irradiance and orientation;
- inter-zone conservation;
- implicit solver;
- doors/infiltration/HVAC schedules;
- fuel and lifecycle calculations;
- feature engineering and OOD detection;
- API schema validation;
- report arithmetic.

### 24.2 Property/metamorphic tests

- rotation by 360° returns equivalent geometry/solar results;
- internal connections conserve energy;
- adding resistance does not increase conductive loss;
- larger heater capacity cannot increase unmet cold hours under identical control;
- identical inputs and versions produce identical outputs;
- costs scale consistently with quantities/unit prices.

### 24.3 Regression tests

Keep versioned small fixtures for:

- single room;
- airlock plus living;
- two-floor four-zone shelter;
- directional-window case;
- no-solar/no-internal-gain analytic case;
- existing-shelter retrofit.

Changes beyond tolerance require an explanation and fixture version update.

### 24.4 Integration tests

- requirements -> candidate -> RC -> economics -> report;
- custom design without ANSYS returns `NOT_REQUESTED`, not benchmark;
- ANSYS queue/status/artifact flow with fake worker;
- exact design revision linkage;
- database restart/recovery;
- OpenAPI clients compile for web/mobile;
- offline mobile draft sync/conflict.

### 24.5 Build/release checks

- Python lint/type/test;
- frontend lint/type/unit/production build;
- mobile type/test/Expo build check;
- migration up/down test on temporary DB;
- Docker/local startup smoke test;
- secrets/generated-artifact scan;
- evidence/report checksum validation.

---

## 25. Deployment Architecture

### 25.1 Submission/demo deployment

- Next.js web on laptop or web host;
- FastAPI on the ANSYS Windows laptop or reachable server;
- PostgreSQL/Supabase or local SQLite for a single-machine backup mode;
- local artifact storage with periodic export;
- Expo app configured to a selectable API base URL;
- ANSYS Student worker on the Windows laptop;
- cached weather and demo fixtures for network resilience.

### 25.2 Production-oriented deployment

- hosted web CDN;
- containerized FastAPI services;
- managed PostgreSQL and Redis;
- object storage;
- authorized/licensed Windows ANSYS worker pool;
- monitoring/backups and private network controls.

Do not include ANSYS Student inside a production/cloud Docker image. The worker is an external Windows service with an allowed licence.

### 25.3 Environment variables

Minimum documented keys:

```text
APP_ENV
API_BASE_URL
DATABASE_URL
REDIS_URL
ARTIFACT_STORAGE_ROOT
CORS_ORIGINS
AUTH_MODE
SUPABASE_URL
SUPABASE_JWT_AUDIENCE
NASA_POWER_BASE_URL
ANSYS_ENABLED
ANSYS_WORKER_TOKEN
ANSYS_EXECUTABLE_PATH
ANSYS_JOB_ROOT
MAX_GENERAL_WORKERS
MAX_ANSYS_WORKERS
RUN_TIMEOUT_SECONDS
```

Secrets are never committed. `.env.example` contains descriptions/placeholders only.

---

## 26. Build from Scratch - Ordered Implementation Plan

### Phase 0 - Stabilize and freeze contracts

1. Clean repository and Git ignore rules.
2. Quarantine legacy benchmarks.
3. Remove false UI claims and unsafe fallback.
4. Add dependency/environment documentation.
5. Make current frontend/backend build.
6. Implement M0 schemas, fixtures, IDs, units, errors, OpenAPI/types.

**Exit:** baseline CI passes and every team member can work against fixtures.

### Phase 1 - Data and physics foundation

1. Implement versioned materials/weather snapshots.
2. Implement building graph resolver.
3. Implement N-zone implicit solver.
4. Add directional solar, wind, openings, ground, schedules, HVAC.
5. Add conservation/regression tests.

**Exit:** single-room, airlock, and two-floor fixtures pass.

### Phase 2 - Generation, optimization, economics

1. Implement requirement parser and layout templates.
2. Generate valid candidates and quantities.
3. Implement multi-objective ranking/Pareto.
4. Add conditioned heating and lifecycle economics.
5. Add reliability variations.

**Exit:** a requirement request produces explainable verified recommendations.

### Phase 3 - Backend, web, and 3D

1. Add durable project/design/run/job entities.
2. Implement APIs and job progress.
3. Wire Next.js to real APIs.
4. Implement candidate/results/economics screens.
5. Build exact geometry 3D viewer and RC coloring.

**Exit:** complete new-shelter workflow works in web without ANSYS.

### Phase 4 - ML

1. Generate/version dataset.
2. Train baselines and evaluate by scenario groups.
3. Store metadata and coverage boundaries.
4. Integrate OOD fallback.
5. Verify every finalist with RC.

**Exit:** ML safely accelerates supported candidate screening.

### Phase 5 - ANSYS and evidence

1. Manually establish one correct baseline.
2. Build exact geometry/BC/material mapping.
3. Add unique worker/job folders.
4. Export series/contours/manifest.
5. Run required evidence cases and compare.
6. Integrate honest status/results in frontend.

**Exit:** exact-revision validation is reproducible and auditable.

### Phase 6 - Mobile and offline

1. Implement auth/projects/requirements.
2. Add candidate/results/economics screens.
3. Embed shared 3D viewer.
4. Add offline drafts/cache/sync.
5. Integrate ANSYS remote status/artifacts.

**Exit:** mobile completes the end-to-end user journey.

### Phase 7 - Reports, QA, and release

1. Generate reports/specification/evidence manifest.
2. Complete tests and production builds.
3. Seed demo projects and backup video.
4. Verify claims against evidence.
5. Tag/freeze the release.

---

## 27. Six-Person Independent Work Plan

### Person 1 - Multi-zone physics lead

Owns M4 graph, matrix solver, conduction, HVAC, energy balance, and physics tests. Consumes M0 schemas and M3 fixtures. Publishes `SimulationResult` only.

### Person 2 - Weather, solar, airflow, and material lead

Owns M3 plus directional solar, wind convection, infiltration, doors, stairs, ground, sky options, and associated tests. Does not edit solver internals without Person 1 review.

### Person 3 - ML and optimization lead

Owns M2, M5, and M6 candidate generation, dataset, training, OOD, Pareto/reliability. Uses the M4 public adapter; does not import private physics functions.

### Person 4 - ANSYS and validation lead

Owns M8 Windows worker, geometry/BC/material mapping, evidence cases, contours, metrics, and validation documentation. Does not edit recommendation values directly.

### Person 5 - Backend, database, economics, reports

Owns M7, M9, M13, persistence, APIs, job orchestration, auth, economics, and reports. Maintains OpenAPI and contract generation.

### Person 6 - Web, mobile, and 3D integration

Owns M10, M11, M12, design system, charts, 3D, offline state, and user journeys. Uses generated clients/fixtures rather than duplicating formulas.

### Integration responsibility

One rotating daily integrator reviews contract changes, merges only green branches, updates fixtures, and records blockers. Domain owners approve changes to their contracts.

### Branch strategy

```text
main                     protected stable submission
integration/final        daily integrated branch
feature/contracts
feature/physics
feature/weather-solar
feature/generator-ml
feature/ansys
feature/backend-economics
feature/web-mobile-3d
```

Every pull request must state changed contracts, migrations, tests, screenshots/artifacts, and rollback impact.

---

## 28. Submission Schedule: 18-25 September 2026

This is an aggressive final-submission schedule. Work in vertical slices and protect a demonstrable fallback.

| Date | Team-wide target | Required proof |
|---|---|---|
| Sep 18 | Phase 0 stabilization and contracts | CI baseline, fixtures, no false benchmark/claims |
| Sep 19 | Building graph + weather/material interfaces | single and two-floor models resolve correctly |
| Sep 20 | Multi-zone solver + directional physics | conservation and orientation tests pass |
| Sep 21 | Generator + conditioned heating + economics | requirements produce ranked/economic candidates |
| Sep 22 | Backend/web/3D integration + dataset generation | full web journey without ANSYS |
| Sep 23 | ML integration + mobile core + ANSYS baseline | OOD fallback, mobile results, valid contour |
| Sep 24 | Required evidence cases + reports + full QA | end-to-end rehearsal and report package |
| Sep 25 | Freeze, bug fixes, APK/web build, backup demo | tagged release; no new features |

### Deadline protection order

If blocked, protect in this order:

1. truthful, stable RC new-shelter workflow;
2. multi-room/two-floor verified example;
3. economics and explainable recommendation;
4. exact 3D selected shelter;
5. complete mobile journey;
6. at least one correct ANSYS evidence case plus honest statuses;
7. ML screening only if genuinely trained/evaluated;
8. additional ANSYS cases and advanced effects.

Do not replace unfinished functionality with fabricated results.

---

## 29. Release Acceptance Criteria

### 29.1 Functional

- New Shelter Mode generates valid structures from requirements.
- Existing Shelter Mode accepts and evaluates manual geometry.
- At least single-room, multi-room airlock, and two-floor examples run through the general solver.
- Direction changes solar results.
- Free-floating and conditioned results are distinct.
- Heating demand drives economics.
- User can compare candidates and see why one was selected.
- Exact selected shelter appears in interactive 3D on web and mobile.
- ANSYS job runs remotely on the configured Windows worker or shows truthful unavailable state.
- Benchmark content is separate and labelled.
- Reports contain assumptions, limitations, and provenance.

### 29.2 Scientific

- energy conservation tests pass;
- timestep convergence is documented;
- no unsupported accuracy/efficiency/savings claims remain;
- ML metrics come from held-out scenario groups;
- OOD fallback works;
- ANSYS comparison uses the same independent scenario inputs;
- recommended validated claim refers only to an actually validated revision.

### 29.3 Engineering

- backend/frontend/mobile builds pass;
- CI and core tests pass;
- clean checkout setup is documented;
- jobs and result IDs do not collide;
- generated/runtime data is not tracked;
- no secrets exist in repository;
- demo works with cached weather and ANSYS-unavailable fallback.

---

## 30. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope exceeds remaining time | Incomplete integration | Contract-first vertical slices; freeze Sep 25; prioritize deadline order |
| Incorrect multi-zone equations | Misleading outputs | Matrix conservation tests, analytic fixtures, timestep convergence |
| Layout generator creates invalid buildings | Physics/3D failure | Template topology, hard constraints, geometry validator |
| ML not accurate/ready | False confidence | Feature flag, publish metrics, OOD guard, RC fallback |
| ANSYS Student/worker unavailable | No live validation | RC remains complete; truthful unavailable state; separately labelled reproducible evidence cases |
| ANSYS Student model limit | Solve failure | simplified geometry, coarse mesh, representative cases, record counts |
| MAPDL cannot model detailed airflow | Overclaim | validate conduction/envelope only; RC handles zone airflow; Fluent is future work |
| Weather API/network failure | Demo blocked | versioned cached snapshots and visible cached status |
| Cost assumptions disputed | Weak economics | editable versioned sources and sensitivity ranges |
| 3D/mobile performance | Poor demo | simplified geometry, shared viewer, downsampled data, 2D fallback |
| Team merge conflicts | Lost time | path ownership, generated contracts, daily integration, small PRs |
| Prototype mock/benchmark confusion | Integrity failure | remove production fixtures/fallback; source labels and evidence manifest |

---

## 31. Future Extensions (Not Required for Final Claim)

- detailed CFD using an appropriately licensed ANSYS Fluent workflow;
- arbitrary polygon/CAD/BIM import;
- structural, snow-load, seismic, and foundation analysis;
- sensor/IoT calibration and digital twin;
- automatic real-time operational control;
- probabilistic Bayesian calibration;
- graph neural network after a suitable dataset exists;
- distributed licensed ANSYS worker pool;
- additional climates and languages;
- carbon/embodied-energy lifecycle assessment.

---

## 32. Final Demonstration Script Boundary

The release is complete when the team can demonstrate, without hidden manual substitution:

> Create a Ladakh project on mobile or web -> enter mission requirements for 30 occupants -> allow up to two floors -> generate feasible shelters -> screen candidates -> verify finalists with the multi-zone RC engine -> view airlock/living/upper-floor temperatures -> compare heating energy and lifecycle cost -> inspect the exact selected shelter in 3D -> submit its immutable revision to the Windows ANSYS worker -> view real status and exact-design contours when available -> download the decision and evidence report.

The final message of COCOON is:

> **COCOON converts area, climate, mission, and logistics requirements into explainable thermal shelter decisions - quickly explored with ML, verified with multi-zone physics, validated selectively with ANSYS, and justified over the full lifecycle.**

---

## Appendix A - Formal Requirement Index

| ID | Requirement | Priority | Owner/module | Verification |
|---|---|---|---|---|
| FR-001 | The system shall create and persist projects and immutable design revisions. | P0 | M9 | API/integration test |
| FR-002 | The system shall generate shelter candidates from mission requirements. | P0 | M2 | Generation fixture |
| FR-003 | The system shall accept existing shelter geometry for evaluation. | P0 | M2/M11 | End-to-end test |
| FR-004 | The system shall support one or more rooms using one general zone model. | P0 | M4 | Single/multi-zone tests |
| FR-005 | The system shall support multiple floors and vertical connections. | P0 | M2/M4 | Two-floor fixture |
| FR-006 | The system shall calculate directional solar gain by surface/opening orientation. | P0 | M3/M4 | Solar orientation tests |
| FR-007 | The system shall calculate envelope, opening, ground, infiltration, and inter-zone heat flow. | P0 | M4 | Unit/conservation tests |
| FR-008 | The system shall model external/internal door events and staircase exchange. | P0 | M4 | Event tests |
| FR-009 | The system shall run free-floating and conditioned simulations. | P0 | M4 | Scenario comparison |
| FR-010 | The system shall calculate room-wise temperature, comfort, heating energy, and peak load. | P0 | M4 | Output validation |
| FR-011 | The system shall screen supported candidates with a measured ML surrogate. | P1 | M5 | Held-out evaluation |
| FR-012 | The system shall skip ML and use RC when coverage is invalid. | P0 | M5/M6 | OOD test |
| FR-013 | The system shall re-run all finalists using RC. | P0 | M6 | Pipeline test |
| FR-014 | The system shall expose separate objectives and a Pareto set. | P0 | M6 | Ranking fixture |
| FR-015 | The system shall calculate CAPEX, OPEX, LCC, NPV, and payback from versioned assumptions. | P0 | M7 | Hand-calculation tests |
| FR-016 | The system shall perform low/expected/high economic sensitivity analysis. | P0 | M7 | Scenario tests |
| FR-017 | The system shall submit exact immutable design revisions to an ANSYS worker. | P0 | M8/M9 | Job contract test |
| FR-018 | The system shall compare independent RC and ANSYS outputs for matching scenarios. | P0 | M8 | Evidence case |
| FR-019 | The system shall never substitute benchmark results for a custom run. | P0 | M8/M9/M11 | Negative integration test |
| FR-020 | The system shall display the selected shelter as interactive 3D geometry. | P0 | M10 | Visual/E2E test |
| FR-021 | The system shall display RC and ANSYS visualizations with distinct source labels. | P0 | M10/M11 | UI assertion |
| FR-022 | The web app shall support the complete new and existing shelter workflows. | P0 | M11 | Browser E2E |
| FR-023 | The mobile app shall support project input, candidates, results, economics, 3D, validation, and reports. | P0 | M12 | Device E2E |
| FR-024 | The mobile app shall support offline drafts, cached results, and conflict-safe synchronization. | P0 | M12 | Offline/sync tests |
| FR-025 | The system shall generate decision, thermal, validation, and machine-readable reports. | P0 | M13 | Report validation |
| FR-026 | Every result shall include input and software provenance. | P0 | M0/M9/M13 | Manifest test |
| FR-027 | The system shall provide real job progress and truthful failure/unavailable states. | P0 | M9 | State-transition tests |
| FR-028 | The system shall provide role-based access in deployed mode. | P1 | M9 | Authorization tests |
| FR-029 | The system shall operate using cached weather when network access is unavailable. | P0 | M3 | Offline test |
| FR-030 | The system shall preserve CLI/batch operation for debugging and dataset generation. | P1 | M4/M5 | CLI smoke test |

Priority meaning: P0 is required for the claimed final workflow; P1 is required for production completeness but may be feature-flagged in the submission only if the UI and report state the limitation honestly.

---

## Appendix B - Module Handoff Checklist

Before a module is marked ready for integration, its owner must provide:

- versioned public interface and schemas;
- one valid fixture and one invalid/error fixture;
- unit tests and documented tolerances;
- no dependency on another module's private files;
- deterministic seed/version behavior where applicable;
- changelog/migration note for contract changes;
- example command or API call;
- structured error codes;
- performance measurement on the submission machine;
- documentation of assumptions and known limitations.

The receiving module owner verifies the fixture through the public interface before merge. A screenshot alone is not integration evidence.


