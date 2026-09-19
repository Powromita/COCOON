# COCOON
### Physics-Guided ML + ANSYS-Validated Shelter Thermal Design Platform

**Team:** ByteFiesta | **SIH 2026** | **Problem Statement ID: 26051**
**Organization:** DRDO — Department of Defence Production / IDEX
**Tagline:** Predict. Compare. Validate. Recommend.

---

## Table of Contents

1. [What is COCOON?](#what-is-cocoon)
2. [The Problem Being Solved](#the-problem-being-solved)
3. [System Architecture Overview](#system-architecture-overview)
4. [How It Works — End to End](#how-it-works--end-to-end)
5. [The 11-Stage Pipeline](#the-11-stage-pipeline)
6. [Frontend Web App](#frontend-web-app)
7. [Backend API](#backend-api)
8. [Thermal Calculator Engine](#thermal-calculator-engine)
9. [Optimizer and Reliability](#optimizer-and-reliability)
10. [ANSYS FEM Validation Pipeline](#ansys-fem-validation-pipeline)
11. [Weather Data System](#weather-data-system)
12. [Materials and Data Files](#materials-and-data-files)
13. [Feature Reports (DRDO Outputs)](#feature-reports-drdo-outputs)
14. [Two User Modes Explained](#two-user-modes-explained)
15. [API Reference](#api-reference)
16. [Directory Structure](#directory-structure)
17. [Running the Project Locally](#running-the-project-locally)
18. [Technology Stack](#technology-stack)
19. [Physics Formulas Used](#physics-formulas-used)
20. [Standards Compliance](#standards-compliance)

---

## What is COCOON?

COCOON is a **full-stack scientific software platform** that designs, simulates, and validates **thermal shelters for extreme cold-climate environments** (specifically Leh, Ladakh — 3,500m altitude, -18 degrees C ambient).

It was built as a **DRDO/IDEX challenge submission** to answer three mandated deliverables:

| DRDO Output | What it means |
|---|---|
| **Output 1** | Predict the inside temperature of a shelter over time |
| **Output 2** | Predict solar thermal energy harvested through the glazing |
| **Output 3** | Report heat flow vs ambient/shelter temperature difference over a period |

COCOON does not just run one simulation. It generates and evaluates **50 to 200 candidate shelter designs**, ranks them by a multi-objective comfort score, cross-validates with **ANSYS FEM**, and recommends the best one with a written justification. The whole workflow is exposed as a **professional web interface** with two user modes (Individual/Household and Organization/Engineer).

---

## The Problem Being Solved

Designing a shelter for **sub-zero Himalayan conditions** is hard because:

- Material choices (adobe vs stone vs PUF insulation) dramatically affect survivability
- Geometry (length, width, height, aspect ratio, surface-to-volume ratio) interacts with thermal mass
- Window area (WWR) trades solar gain against nighttime heat loss
- No single design wins across all conditions: stability, survivability, and deployability all matter

COCOON automates the design-and-evaluate loop, replacing manual engineering guesswork with a **physics simulation engine + optimization + FEM validation** pipeline.

---

## System Architecture Overview

```
+--------------------------------------------------------------------------+
|                         COCOON ARCHITECTURE                              |
|                                                                          |
|  USER BROWSER                                                            |
|  +------------------------------------------+                           |
|  |  Next.js 16 Web App (TypeScript+Tailwind) |                           |
|  |  +-- Home (mode picker)                   |                           |
|  |  +-- /individual/configure -> results     |                           |
|  |  +-- /organization/configure -> results   |                           |
|  +--------------------+---------------------+                           |
|                        | HTTP REST (JSON)                                 |
|  +---------------------v--------------------+                           |
|  |         FastAPI Backend (Python)          |                           |
|  |  POST /api/run -> start subprocess        |                           |
|  |  GET  /api/run/{id}/status -> progress    |                           |
|  |  GET  /api/run/{id}/results -> final JSON |                           |
|  |  GET  /api/reference -> materials         |                           |
|  +---------------------+--------------------+                           |
|                        | subprocess (CLI)                                 |
|  +---------------------v--------------------+                           |
|  |       run_pipeline.py  (11 Stages)        |                           |
|  |  Stage  1: Weather Archive (NASA POWER)   |                           |
|  |  Stage  5: Scenario Generator             |                           |
|  |  Stage  6: Design Ranker (RC simulation)  |                           |
|  |  Stage  7: Reliability Analysis           |                           |
|  |  Stage  8: ANSYS FEM Validation (opt.)    |                           |
|  |  Stage  9: Recommendation Engine          |                           |
|  |  Stage  4: Feature Reports (DRDO outputs) |                           |
|  |  Stage 10: Report Bundle                  |                           |
|  |  Stage 11: results.json assembly          |                           |
|  +---------------------+--------------------+                           |
|                        |                                                  |
|  +---------------------v--------------------+                           |
|  |      thermal-calculator/ (RC Engine)      |                           |
|  |  thermal_model.py  -> transient ODE loop  |                           |
|  |  heat_transfer.py  -> U, R, C, Q formulas |                           |
|  |  solar_analysis.py -> SHGC + solar gains  |                           |
|  |  heat_flow_analysis.py -> per-path losses |                           |
|  |  materials.py      -> material property DB|                           |
|  +------------------------------------------+                           |
+--------------------------------------------------------------------------+
```

The pipeline has **three simulation layers**, each serving a different purpose:

| Layer | Tool | Speed | Role |
|---|---|---|---|
| Physics RC Model | thermal_model.py | seconds per design | Ground-truth for the fast path; simulates transient heat flow |
| Optimizer RC Loop | design_ranker.py | seconds per design | Ranks 50 to 200 candidates |
| ANSYS FEM | ansys-pipeline/ | minutes per case | Independent 3D validation of top designs (optional) |

---

## How It Works — End to End

### Individual Mode (Simplified)

1. User enters shelter size (L x W x H), window count, door count, and occupancy level (heater setting, air changes)
2. Frontend builds an `OptimizeRunRequest` and POSTs to `/api/run`
3. Backend spawns `run_pipeline.py optimize ...` as a subprocess
4. Pipeline generates **50 candidate designs** varying materials, thicknesses, and glazing
5. Each candidate is simulated using the RC thermal engine against a **72-hour typical winter weather window**
6. Designs are ranked by a **comfort score** (not just mean temperature)
7. A **reliability analysis** runs 400 Monte Carlo trials to find the robust shortlist
8. The **best design** is selected and its full feature report computed
9. Frontend polls `/status` and renders results when done

### Organization Mode (Expert)

1. User enters **full engineering configuration**: custom multi-layer wall/roof/floor assemblies, exact material thicknesses, glazing U-values and SHGC, heat transfer coefficients (h_i, h_o), infiltration ACH, ground temperature mode, internal heat gains, initial temperature
2. This runs as a **single mode simulation** — evaluating exactly one specified design
3. All three DRDO feature outputs are computed and rendered with full charts

---

## The 11-Stage Pipeline

`run_pipeline.py` is the spine. Every run creates a timestamped folder `runs/<UTC-timestamp>/` and writes all artifacts there. Each stage reads only from that folder.

```
Stage  1 | weather_archive.py     | Load 10-year NASA POWER archive for Leh;
         |                        | extract a "typical" and "worst-case" seasonal window
---------+------------------------+----------------------------------------------------
Stage  5 | scenario_generator.py  | Generate N buildable candidate designs (default 50)
         |                        | from the constraint CSV files; each design is a full
         |                        | wall/roof/floor layered assembly + geometry + glazing
---------+------------------------+----------------------------------------------------
Stage  6 | design_ranker.py       | Run the RC thermal engine on every candidate;
         |                        | rank by comfort score; save top 5 and full CSV
---------+------------------------+----------------------------------------------------
Stage  7 | optimizer_reliability  | 4-part reliability analysis:
         | .py                    |   1. Sensitivity: 400 Monte Carlo weight perturbations
         |                        |   2. Worst-case weather: coldest real NASA slice
         |                        |   3. Pareto front: swing vs T_min vs in-band %
         |                        |   4. Logistics: mass, cost, transportability
---------+------------------------+----------------------------------------------------
Stage  8 | validate_top_designs   | (Optional) ANSYS FEM 3D transient thermal on top 2
         | _ansys.py              | designs; compare MAE/RMSE vs RC model; rank by FEM
---------+------------------------+----------------------------------------------------
Stage  9 | recommend.py           | Convert evidence -> single stated choice with
         |                        | written justification (thermal tie -> logistics)
---------+------------------------+----------------------------------------------------
Stage  4 | feature_reports.py     | Full DRDO outputs for chosen + runner-up:
         |                        |   Feature 1: hourly indoor temperature prediction
         |                        |   Feature 2: solar thermal energy analysis
         |                        |   Feature 3: heat flow by path (wall/roof/floor/window)
         |                        |   + comfort, heating demand, highlights
---------+------------------------+----------------------------------------------------
Stage 10 | report_bundle.py       | Build a human-readable REPORT.md with all numbers
---------+------------------------+----------------------------------------------------
Stage 11 | web_results.py         | Assemble the final results.json consumed by the
         |                        | frontend (shape: RunResults in types.ts)
```

**Non-critical stages** (ANSYS, runner-up features) are logged and the pipeline continues on failure.

---

## Frontend Web App

**Location:** `Frontend/cocoon-frontend/`
**Framework:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4

### Pages and Routes

| Route | Purpose |
|---|---|
| `/` | **Home / Mode Picker** — selects Individual or Organization mode |
| `/individual/configure` | Simplified form: geometry, presets, occupancy; triggers optimize run |
| `/individual/results` | Results display for optimize run |
| `/organization/configure` | Full engineering form with layer builder, all thermal coefficients |
| `/organization/results` | Results display for single-design run |

### Key Components (19 total in `app/_components/`)

| Component | What it does |
|---|---|
| `LayerBuilder.tsx` | Add multi-layer composite wall/roof/floor assemblies with live U-value preview |
| `IndividualLayerInput.tsx` | Simplified material picker using preset names, not raw values |
| `SiteComfortEnvFields.tsx` | Season, comfort target, band, analysis hours |
| `OptimizerFields.tsx` | Design count, seed, trials for the optimizer |
| `RunProgress.tsx` | Live pipeline stage tracker (polls `/status` every 2 seconds) |
| `TemperatureChart.tsx` | Indoor vs outdoor hourly temperature chart (DRDO Output 1) |
| `SolarEnergyPanel.tsx` | Solar thermal metrics and daily bars (DRDO Output 2) |
| `HeatFlowPanel.tsx` | Heat loss by path, stacked chart (DRDO Output 3) |
| `ReliabilityPanel.tsx` | Sensitivity %, Pareto front, worst-case weather verdict |
| `DesignComparisonTable.tsx` | All ranked designs table with material labels |
| `AnsysValidationPanel.tsx` | RC vs ANSYS comparison table + contour image |
| `LogisticsPanel.tsx` | Envelope mass, cost, transportability per shortlisted design |
| `RecommendationCard.tsx` | Final "chosen design" card with justification text |
| `ResolvedConfigStrip.tsx` | U-values, total capacitance, infiltration UA strip |
| `SiteHeader.tsx` | Nav bar with mode label, breadcrumbs, language switcher |
| `LanguageSwitcher.tsx` | English / Hindi toggle (persisted in localStorage) |

### Internationalization (i18n)

Every user-facing string is stored in `app/_lib/i18n.tsx` under a short key, with both **English** and **Hindi** translations. Numbers, units (degrees C, W/m2K, mm), and standard names (ISO, ANSYS, NASA) are intentionally identical in both languages. The language selection is persisted with `localStorage`.

### Lib Utilities

| File | Purpose |
|---|---|
| `_lib/types.ts` | All TypeScript interfaces mirroring the backend Pydantic models and pipeline JSON output |
| `_lib/api.ts` | All network calls: `startRun`, `pollStatus`, `fetchResults`, `fetchReference` |
| `_lib/buildRequest.ts` | Transforms form state into a `RunRequest` object for the API |
| `_lib/useRun.ts` | React hook that manages run lifecycle: idle, running, polling, done/failed |
| `_lib/fixtures.ts` | Static mock result data for UI development without a backend |
| `_lib/demoRequest.ts` | Demo request payload for the "try it" button |

---

## Backend API

**Location:** `backend/`
**Framework:** FastAPI, Python 3.10+
**Start command:** `uvicorn backend.main:app --reload --port 8000`

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check: confirms pipeline script exists, shows runs dir and worker count |
| POST | `/api/run` | Start a new run. Body: RunRequest JSON. Returns `{run_id}` |
| GET | `/api/run/{run_id}/status` | Poll pipeline progress. Returns PipelineStatus with per-stage phase |
| GET | `/api/run/{run_id}/results` | Get final results.json (409 if still running, 422 if failed) |
| GET | `/api/run/{run_id}/artifact/{path}` | Download any artifact file from the run folder |
| GET | `/api/reference` | Material properties, glazing profiles, and ratio constraints |

### Key Backend Files

| File | Role |
|---|---|
| `backend/main.py` | FastAPI app creation, CORS middleware, router registration, startup sweep of stale runs |
| `backend/settings.py` | All configuration: paths, CORS origins, worker limits, TTL. All overridable via env vars |
| `backend/models.py` | Pydantic models mirroring types.ts: ShelterConfig, OptimizeSpec, RunRequest, PipelineStatus |
| `backend/pipeline_bridge.py` | Translates a RunRequest into CLI argv for run_pipeline.py; translates PIPELINE_STATUS.json into PipelineStatus |
| `backend/jobs.py` | Thread-pool job manager: submits subprocess, tracks state (queued/running/exited), enforces timeout |
| `backend/routes/run.py` | All /api/run/* route handlers |
| `backend/routes/reference.py` | /api/reference route — reads from thermal-calculator/data/ |
| `backend/reference_cache.py` | Caches reference data (materials, glazing) to avoid repeated file reads |

### Configuration via Environment Variables

| Env Var | Default | Meaning |
|---|---|---|
| `COCOON_RUNS_DIR` | `<repo>/runs` | Where run folders are written |
| `COCOON_PIPELINE_PYTHON` | current Python | Interpreter used to spawn run_pipeline.py |
| `COCOON_MAX_WORKERS` | 2 | Max concurrent pipeline subprocesses |
| `COCOON_RUN_TTL_HOURS` | 168 (7 days) | Auto-sweep old run folders on startup |
| `COCOON_RUN_TIMEOUT_S` | 2400 (40 min) | Hard-kill a stuck subprocess |
| `COCOON_CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |

---

## Thermal Calculator Engine

**Location:** `thermal-calculator/`

This is the **core physics simulation engine**. It implements a **transient RC (Resistance-Capacitance) thermal model** — the same mathematical approach used in ISO 13790 dynamic building energy simulation.

### How the RC Model Works

Think of the shelter as a single electrical circuit analogy:
- **Thermal resistance (R)** = how hard it is for heat to flow through a material (like electrical resistance)
- **Thermal capacitance (C)** = how much heat the material can store (like a capacitor)
- **Temperature (T)** = voltage
- **Heat flow (Q)** = current

The simulation solves this ODE at each hourly time step:

```
C_total x dT_in/dt = Q_solar + Q_internal - Q_wall - Q_roof - Q_floor - Q_window - Q_infiltration
```

### Files in the Engine

| File | Purpose |
|---|---|
| `thermal_model.py` | Main simulation loop. Hourly explicit Euler integration. Returns per-hour DataFrame |
| `heat_transfer.py` | All physics formulas: total_resistance, calculate_u_value, calculate_heat_transfer, calculate_solar_gain, calculate_layer_capacitance, position_weight, resistance_to_interior |
| `solar_analysis.py` | Solar thermal calculations: SHGC-weighted gain, capacity factor, solar-temperature correlation |
| `heat_flow_analysis.py` | Heat flow by path: per-hour per-surface breakdown |
| `materials.py` | Loads data/material_properties.json: thermal conductivity, density, specific heat for all 8 materials |
| `weather.py` | Weather data cleaning and normalization |
| `user_input.py` | Command-line interface for standalone use |
| `config.py` | Standalone configuration constants |
| `main.py` | Standalone entry point |

### Position-Weighted Thermal Capacitance

A critical innovation in this model addresses a known flaw in lumped-node RC models:

> A layer sitting behind thick insulation barely exchanges heat with the indoor air across a multi-day cold spell. Lumping its full mass onto the indoor node makes the shelter look far more thermally stable than it actually is.

Each layer's capacitance is **exponentially weighted** by its thermal distance from the interior:

```
weight = exp(-R_layer_to_interior / Rc)
```

Where `Rc = 0.8 m2K/W` (calibrated against ANSYS 3D validation). This gives:

| Configuration | Unweighted MAE | Weighted MAE |
|---|---|---|
| Mass-inside wall | 0.66 C | **0.31 C** |
| Insulation-inside wall | 3.75 C | **0.53 C** |

Both weighted results are within the plus/minus 0.8 C target.

### Air Infiltration

Infiltration is modeled as:

```
Q_infiltration = rho_air x Cp_air x (ACH x V / 3600) x (T_in - T_out)
```

Default ACH = 0.7 (moderately-sealed shelter). This is often the **largest heat loss path** in a real shelter.

### Layer Ordering Convention

**Index 0 = outermost layer.** External insulation goes first (cold-climate passive-solar strategy): insulation on the outside keeps the structural thermal mass exposed to indoor air so stored solar heat is available to stabilize indoor temperature overnight.

---

## Optimizer and Reliability

### Scenario Generator (scenario_generator.py)

Generates a **pool of buildable random shelter designs** from two CSV constraint files:

- `shelter_ratios_recommended.csv` — bounds on aspect ratio, A/V ratio, WWR, ceiling height, floor area
- `shelter_elements_dimensions__1_.csv` — per-element material options, layer roles (structural/insulation), and realistic thickness ranges

**Design rules enforced:**
- Every wall/roof/floor = one structural layer + optional insulation layer (never random slabs)
- Insulation goes on the **outside face** (passive solar cold-climate approach)
- Assembly thickness clamped to buildable envelope: Walls 250–650 mm, Roof 180–450 mm, Floor 130–400 mm
- Cold-climate glazing preference: triple (38%) over double (50%) over single (12%)
- Fixed geometry mode: user pins box dimensions + opening counts; pipeline designs only the envelope

### Design Ranker (design_ranker.py)

Runs the RC engine on every candidate and ranks by a **balanced comfort score**:

```
score = 100
      - 3.0 x |T_median - TARGET|         (centered on the comfort target)
      - 1.5 x (T_max - T_min)             (thermal stability, less swing = better)
      - 4.0 x max(0, COLD_LIMIT - T_min)  (worst-hour survivability)
      - 2.0 x max(0, T_max - HEAT_LIMIT)  (no daytime overheating)
      + 20.0 x fraction_hours_in_band     (time inside 15-24 C comfort band)
```

Default targets: TARGET = 18 C, comfort band 15–24 C, COLD_LIMIT = 15 C, HEAT_LIMIT = 28 C.

> **Why not rank by mean temperature?** Ranking by T_avg rewards thin, low-mass, over-glazed shelters that bake at midday and crash at night. Their average looks warm but the lived experience is terrible.

### Reliability Analysis (optimizer_reliability.py)

Makes the "best design" claim defensible with 4 sub-analyses:

1. **Sensitivity Analysis** — Perturbs the 5 comfort-score weights by ±jitter for `--trials` (default 400) Monte Carlo trials. Reports how often each design lands in the top 3 across perturbations. Produces a robust shortlist if no single design dominates.

2. **Worst-Case Weather** — Pulls the coldest contiguous N-hour slice from the full 10-year NASA archive and re-ranks. A design that wins on the typical day but fails the worst cold spell is not recommended.

3. **Pareto Front** — Finds designs not dominated on all three objectives: high T_min (warmth), low swing (stability), high hours-in-band (comfort). Exposes tradeoffs the scalar score hides.

4. **Logistics Profile** — From `shelter_material_logistics.csv`: estimates envelope mass (tonnes), material cost, and transportability (1 to 5 score). Used to break thermal ties.

### Recommendation (recommend.py)

Converts the multi-stage evidence into a **single stated choice**:

- If ANSYS ran: check whether shortlisted designs are thermally indistinguishable (spread < RC-vs-ANSYS MAE). If tie, pick lightest/most-transportable.
- If no ANSYS: check if comfort-score spread < 4.0 points. If tie, use logistics.
- Otherwise: pick highest comfort score whose ANSYS rank is 2 or less.
- Output: `recommendation.json` with `chosen_design_id`, `runner_up_id`, `thermal_tie` flag, and written `justification` string.

---

## ANSYS FEM Validation Pipeline

**Location:** `ansys-pipeline/`

An independent high-fidelity validation that cross-checks the RC model's predictions using **ANSYS Mechanical APDL (PyMAPDL)**.

> The ANSYS model is **not in the interactive path** — it validates representative cases and produces the accuracy numbers behind the plus/minus 0.8 C claim.

### RC Model vs ANSYS Model

| RC Model | ANSYS Model |
|---|---|
| Single lumped indoor-air node | Solid indoor-air volume, near-isothermal via k=50 W/mK |
| 1D per-surface heat flow | 3D conduction with full geometry |
| Position-weighted capacitance | Real temperature gradient through each material |
| Sol-air boundary at exterior | Sol-air temperature applied as exterior film boundary condition |
| Inside film: 1/h_i resistance | 20mm inside-film layer: k = 0.02 x h_i |

### Files

| File | Role |
|---|---|
| `geometry_builder.py` | Builds multi-layer shelter geometry and mesh in MAPDL from SHELTER_CONFIG |
| `pyansys_runner.py` | Orchestrates one case: geometry, materials, mesh, transient BCs, solve, extract |
| `comparison.py` | Re-runs the Python RC engine on the same weather window, computes MAE/RMSE/R2 vs ANSYS |
| `validate_weighted_capacitance.py` | Calibration script for the CAPACITANCE_COUPLING_RESISTANCE_M2K_W constant |
| `VALIDATION_FINDINGS.md` | Detailed validation findings, MAE tables, and calibration history |

### Validation Results

| Configuration | RC MAE (unweighted) | RC MAE (position-weighted) |
|---|---|---|
| Mass-inside wall (standard) | 0.66 C | **0.31 C** (pass) |
| Insulation-inside wall | 3.75 C | **0.53 C** (pass) |

Target: plus/minus 0.8 C. Both configurations pass with position-weighted capacitance.

---

## Weather Data System

**Location:** `weather_archive.py` and `leh_weather_merged.xlsx` and `leh_weather_archive.csv`

### Data Source

**10-year NASA POWER archive for Leh, Ladakh (34.1526 N, 77.5771 E), 2016–2026**

Hourly data (~92,000 rows):

| Raw Column | Pipeline Column | Description |
|---|---|---|
| T2M | temperature_C | 2-metre air temperature (C) |
| ALLSKY_SFC_SW_DWN | solar_radiation_W_m2 | Surface solar irradiance (W/m2) |
| WS10M | wind_speed_m_s | 10-metre wind speed (m/s) |
| RH2M | humidity_percent | Relative humidity (%) |

### Weather Windows

| Window Type | Function | Use |
|---|---|---|
| Typical window | typical_window() — median-temperature N-hour seasonal slice | RC optimizer ranking (Stage 6) |
| Worst-case window | worst_case_window() — coldest contiguous N-hour slice | Reliability analysis (Stage 7) |
| Date-range slice | date_range() — explicit start/end | ANSYS validation cases |

On first call, the xlsx is parsed and cached to `leh_weather_archive.csv`. Subsequent calls read the cache. The `annual_mean_air_C()` function computes the ground temperature proxy.

---

## Materials and Data Files

### Material Properties (thermal-calculator/data/material_properties.json)

8 materials are available:

| Material ID | Display Name | Typical Use |
|---|---|---|
| adobe | Adobe/Mud Brick | Traditional Himalayan wall construction |
| rammed_earth | Rammed Earth | Dense earthen walls |
| straw_clay | Straw-Clay | Low-cost insulating infill |
| stone_masonry | Stone Masonry | High thermal mass structural |
| wood_timber | Wood/Timber | Lightweight structural |
| concrete | Plain Concrete | Medium mass structural |
| reinforced_concrete | Reinforced Concrete | High-strength structural |
| puf | PUF Insulation | Polyurethane foam, primary insulation layer |

Properties for each: **thermal conductivity** (W/mK), **density** (kg/m3), **specific heat** (J/kgK).

### Glazing Profiles (thermal-calculator/data/glazing_profiles.json)

| Glazing Type | U-value (W/m2K) | SHGC |
|---|---|---|
| single | ~5.8 | 0.86 |
| double | ~2.8 | 0.76 |
| triple | ~1.8 | 0.68 |

Triple glazing is **strongly preferred** in the optimizer (weight 0.38 vs double 0.50 vs single 0.12).

### Constraint CSV Files

**shelter_ratios_recommended.csv** — geometry constraint bounds: Length-to-Width Aspect Ratio, Surface Area-to-Volume Ratio (A/V), Window-to-Wall Ratio (WWR %), Ceiling Height (m), Floor Area (m2).

**shelter_elements_dimensions__1_.csv** — per-element material options with realistic thickness ranges and layer roles (structural/insulation).

**shelter_material_logistics.csv** — deployability data: envelope mass (tonnes), cost, transportability score (1–5).

---

## Feature Reports (DRDO Outputs)

`feature_reports.py` runs three DRDO-mandated analyses on the simulated hourly output:

### Feature 1 — Indoor Temperature Prediction

- Hourly indoor vs outdoor temperature time series
- T_min, T_max, T_mean, T_median, T_final
- Chart: indoor and outdoor temperature vs time (PNG)
- CSV: temperature.csv

### Feature 2 — Solar Thermal Energy

- Total solar energy through glazing (Wh and MJ)
- Peak irradiance (W/m2) and peak gain (W)
- Capacity factor (%)
- Daily MJ array and hourly gain (kW) array
- Solar-temperature correlation coefficient
- Chart: daily solar energy bars (PNG)

### Feature 3 — Heat Flow vs Temperature Difference

- Total heat loss (Wh), peak and average hourly loss (W)
- Heat loss split by path (%): wall / roof / floor / window / infiltration
- Per-hour per-path loss array (for stacked chart)
- Peak and average indoor–outdoor temperature difference
- Chart: stacked heat flow by path vs time (PNG)

### Additional Outputs

| Output | Content |
|---|---|
| Comfort | Hours in band %, hours below/above band %, frost-free %, comfort score |
| Heating demand | Supplemental heat to hold the comfort band (kWh/day, kWh total, litres kerosene/day) |
| Highlights | 5 plain-language derived facts: frost risk, solar yield, air quality, stability, thermal mass |
| Resolved properties | U_wall, U_roof, U_floor (W/m2K), C_total (MJ/K), infiltration UA (W/K), envelope mass (t) |
| Config echo | Human-readable summary of the design simulated |

---

## Two User Modes Explained

### Individual / Household Mode (MOD_01)

**Target user:** Non-engineer — villager, relief worker, NGO staff.

**What you provide:**
- Shelter dimensions (L x W x H in metres)
- Number of windows and doors
- Occupancy level (heater: Off/Low/Med/High — maps to internal heat gain in watts)
- Air changes per hour (preset: tight/normal/drafty)

**What COCOON does:**
- Runs the optimizer with 50 candidate designs
- Tries all material combinations for your box size
- Returns the **best design** with predicted indoor temperatures

**Estimation time:** Under 60 seconds (pipeline typically runs 2–5 minutes for 50 designs)

### Organization / Engineer Mode (MOD_02)

**Target user:** Defense engineer, DRDO analyst, structural engineer.

**What you provide:**
- Full multi-layer wall assembly (e.g., PUF 90mm + Stone Masonry 400mm)
- Full roof assembly, floor assembly
- Exact glazing U-value and SHGC
- Heat transfer coefficients: h_inside (W/m2K), h_outside (W/m2K)
- Air changes per hour (exact value)
- Ground temperature mode (annual mean or manual)
- Internal heat gain (W)
- Initial indoor temperature (C)
- Contents mass and specific heat

**What COCOON does:**
- Simulates your exact design (single-design mode)
- Returns all three DRDO outputs with full charts and data

**Solver accuracy:** FEM convergence 10^-4 (when ANSYS is enabled)

---

## API Reference

### POST /api/run — Single Design (Organization Mode)

```json
{
  "mode": "single",
  "config": {
    "geometry": {"length_m": 6.0, "width_m": 4.0, "height_m": 2.7},
    "walls": [
      {"material": "puf", "thickness_mm": 90},
      {"material": "stone_masonry", "thickness_mm": 400}
    ],
    "roof": [
      {"material": "puf", "thickness_mm": 80},
      {"material": "concrete", "thickness_mm": 150}
    ],
    "floor": [{"material": "stone_masonry", "thickness_mm": 200}],
    "windows": {"area_m2": 2.4, "U_W_m2K": 1.8, "SHGC": 0.68, "glazing_type": "triple"},
    "contents": {"mass_kg": 200, "specific_heat_J_kgK": 900},
    "heat_transfer": {"h_inside_W_m2K": 8.0, "h_outside_W_m2K": 25.0},
    "air_changes_per_hour": 0.7,
    "ground_temperature_mode": "annual_mean",
    "ground_temperature_C": 3.2,
    "internal_heat_gain_W": 150,
    "initial_temperature_C": 5.0
  },
  "window": {"season": "winter", "typical_hours": 72, "worst_hours": 48},
  "comfort": {"target_C": 18, "band_lo_C": 15, "band_hi_C": 24}
}
```

### POST /api/run — Optimize (Individual Mode)

```json
{
  "mode": "optimize",
  "window": {"season": "winter", "typical_hours": 72, "worst_hours": 48},
  "comfort": {"target_C": 18, "band_lo_C": 15, "band_hi_C": 24},
  "optimize": {
    "designs": 50,
    "seed": 0,
    "trials": 400,
    "geometry": {"length_m": 5.0, "width_m": 3.5, "height_m": 2.5},
    "window_count": 2,
    "window_width_m": 1.2,
    "window_height_m": 1.4,
    "door_count": 1,
    "internal_heat_gain_W": 200,
    "air_changes_per_hour": 0.7,
    "allowed_materials": ["adobe", "rammed_earth", "stone_masonry", "puf"],
    "run_ansys": false,
    "ansys_hours": 24,
    "ansys_designs": 2
  }
}
```

**Response:** `{"run_id": "20260910T043000Z-ab12"}`

### GET /api/run/{run_id}/status

```json
{
  "run_id": "20260910T043000Z-ab12",
  "done": false,
  "failed": false,
  "stages": [
    {"stage": "1_weather", "phase": "ok", "note": "..."},
    {"stage": "5_pool", "phase": "ok", "note": "50 designs"},
    {"stage": "6_rank", "phase": "running"},
    {"stage": "7_reliability", "phase": "pending"}
  ]
}
```

Stage phases: `pending` | `running` | `ok` | `failed` | `skipped`

---

## Directory Structure

```
COCOON/
|
+-- Frontend/cocoon-frontend/         # Next.js web application
|   +-- app/
|   |   +-- page.tsx                  # Home / mode picker
|   |   +-- layout.tsx                # Root layout
|   |   +-- globals.css               # Global styles
|   |   +-- _components/              # 19 React components
|   |   +-- _lib/                     # Types, API, i18n, hooks
|   |   +-- individual/               # /individual/* pages
|   |   +-- organization/             # /organization/* pages
|   +-- package.json
|   +-- tailwind.config.ts
|   +-- next.config.ts
|
+-- backend/                          # FastAPI REST API
|   +-- main.py                       # App + CORS + startup
|   +-- settings.py                   # Configuration
|   +-- models.py                     # Pydantic models
|   +-- pipeline_bridge.py            # CLI translation + status parsing
|   +-- jobs.py                       # Job/subprocess manager
|   +-- routes/run.py                 # /api/run/* endpoints
|   +-- routes/reference.py           # /api/reference endpoint
|
+-- thermal-calculator/               # RC physics engine
|   +-- thermal_model.py              # Main transient simulation loop
|   +-- heat_transfer.py              # Physics formulas (U, R, C, Q)
|   +-- solar_analysis.py             # Solar thermal analysis
|   +-- heat_flow_analysis.py         # Heat flow by path
|   +-- materials.py                  # Material DB loader
|   +-- weather.py                    # Weather data cleaning
|   +-- data/
|   |   +-- material_properties.json  # 8 materials (k, density, Cp)
|   |   +-- glazing_profiles.json     # 3 glazing types (U, SHGC)
|   +-- README.md                     # Full physics PRD and formula reference
|
+-- ansys-pipeline/                   # ANSYS FEM validation
|   +-- geometry_builder.py           # MAPDL geometry builder
|   +-- pyansys_runner.py             # Transient FEM orchestrator
|   +-- comparison.py                 # RC vs ANSYS comparison
|   +-- validate_weighted_capacitance.py
|   +-- VALIDATION_FINDINGS.md        # Full validation report
|   +-- results/                      # Per-case validation outputs
|
+-- run_pipeline.py                   # The 11-stage pipeline spine
+-- scenario_generator.py             # Candidate shelter design generator
+-- design_ranker.py                  # RC simulation + comfort scoring
+-- optimizer_reliability.py          # 4-part reliability analysis
+-- recommend.py                      # Evidence -> single recommendation
+-- feature_reports.py                # DRDO outputs 1, 2, 3 + extras
+-- web_results.py                    # Assemble results.json
+-- report_bundle.py                  # REPORT.md builder
+-- weather_archive.py                # 10-year NASA POWER archive loader
+-- engine_adapter.py                 # Thin adapter: ShelterConfig dict -> engine call
+-- shelter_config.py                 # ShelterConfig dict builder
|
+-- leh_weather_merged.xlsx           # 10-year NASA POWER data (raw)
+-- leh_weather_archive.csv           # Cached cleaned hourly archive
+-- shelter_ratios_recommended.csv    # Geometry constraint bounds
+-- shelter_elements_dimensions__1_.csv # Material + thickness options
+-- shelter_material_logistics.csv    # Mass, cost, transportability
|
+-- runs/                             # Per-run output folders
|   +-- <UTC-timestamp>/
|       +-- request.json
|       +-- PIPELINE_STATUS.json
|       +-- designs_pool.json
|       +-- optimization_results.csv
|       +-- evaluated_typical.json
|       +-- shortlist.json
|       +-- logistics.csv
|       +-- recommendation.json
|       +-- results.json              # Final frontend payload
|       +-- REPORT.md
|       +-- features/
|           +-- chosen/
|           |   +-- temperature.csv
|           |   +-- temperature.png
|           |   +-- (solar, heatflow charts and CSVs)
|           +-- runner_up/
|
+-- results/                          # Persistent cross-run results
+-- Data Science/                     # ML experiments and notebooks
+-- .gitignore
```

---

## Running the Project Locally

### Prerequisites

- Python 3.10+
- Node.js 18+
- (Optional) ANSYS Mechanical APDL + ansys-mapdl-core for FEM validation

### Backend Setup

```bash
# From the repo root
pip install fastapi uvicorn pydantic pandas numpy matplotlib tqdm openpyxl

# Start the API server
uvicorn backend.main:app --reload --port 8000
```

Check health: `http://localhost:8000/api/health`

### Frontend Setup

```bash
cd Frontend/cocoon-frontend
npm install
npm run dev
```

Visit: `http://localhost:3000`

### Run the Pipeline Directly (CLI)

```bash
# Optimize mode — find best design
python run_pipeline.py optimize --designs 50 --season winter

# With ANSYS validation (requires ANSYS Student license)
python run_pipeline.py optimize --designs 50 --ansys --ansys-hours 24 --ansys-designs 2

# Single design — evaluate a specific config
python run_pipeline.py single --config my_shelter.json

# With a fixed geometry (equivalent to Individual mode)
python run_pipeline.py optimize --fixed-design fixed_design.json --designs 50
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4 |
| Backend API | Python 3.10+, FastAPI, Uvicorn, Pydantic v2 |
| Physics Engine | Pure Python (NumPy, Pandas, Matplotlib) |
| Optimization | NumPy random, explicit Euler ODE integration |
| FEM Validation | ANSYS Mechanical APDL via PyMAPDL (ansys-mapdl-core) |
| Weather Data | NASA POWER API (10-year export), openpyxl for xlsx parsing |
| Charting | Matplotlib (server-side PNG generation) |

---

## Physics Formulas Used

### Geometry

```
A_wall  = 2(L x H + W x H)
A_roof  = L x W
A_floor = L x W
V       = L x W x H
```

### Thermal Resistance and U-value

```
R_layer = d / k
R_total = 1/h_i + sum(d_j / k_j) + 1/h_o
U       = 1 / R_total
```

### Envelope Heat Transfer (per surface, per hour)

```
Q_wall   = U_wall   x A_wall   x (T_in - T_out)
Q_roof   = U_roof   x A_roof   x (T_in - T_out)
Q_floor  = U_floor  x A_floor  x (T_in - T_ground)
Q_window = U_window x A_window x (T_in - T_out)
```

### Solar Gain

```
Q_solar = SHGC x A_window x G        (G = hourly solar irradiance in W/m2)
```

### Air Infiltration

```
Q_infiltration = rho_air x Cp_air x (ACH x V / 3600) x (T_in - T_out)
```

### Thermal Capacitance (Position-Weighted)

```
weight   = exp(-R_layer_to_interior / Rc)    (Rc = 0.8 m2K/W)
C_layer  = rho x Cp x A x d x weight
C_total  = sum(C_wall_layers) + sum(C_roof_layers) + sum(C_floor_layers) + C_contents
```

### Governing Equation (Explicit Euler, dt = 3600 s)

```
Q_net      = Q_solar + Q_internal - Q_wall - Q_roof - Q_floor - Q_window - Q_infiltration
T_in(t+1) = T_in(t) + (Q_net x dt) / C_total
```

---

## Standards Compliance

| Standard | Applied To |
|---|---|
| ISO 13790 | Dynamic thermal simulation method (RC model approach) |
| ASHRAE 55 | Comfort limits (15–24 C band, 18 C target) |
| EN 12831 | Peak heating demand calculation |

---

*Built for Smart India Hackathon 2026 — DRDO Problem Statement 26051.*
*Developed by Team ByteFiesta.*
