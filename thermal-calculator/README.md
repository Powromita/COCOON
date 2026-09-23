# COCOON — Execution PRD
## Physics-Guided ML + ANSYS-Validated Shelter Thermal Design Platform

**Team:** ByteFiesta | **SIH 2026** | **Problem Statement ID: 26051** (DRDO — Dept. of Defence Production / IDEX)
**Tagline:** *Predict. Compare. Validate. Recommend.*

> This document supersedes the architecture assumptions in PRD v1.0 (lookup-table-first ANSYS validation) with the team's now-finalized pipeline: **Physics → ML surrogate → Selective ANSYS validation**, as shown in the submitted idea deck and system-architecture diagrams. It is the execution-level build spec: every module, every file, and the order to build them in.

---

## 1. What We're Actually Building (Confirmed Architecture)

The five-stage pipeline from the idea deck, expanded into an engineering pipeline:

```
STAGE 1: INPUT                STAGE 2: PHYSICS             STAGE 3: ML SURROGATE
─────────────────             ─────────────────             ─────────────────────
Geometry, layers,        →    Python RC model:         →    Trained OFFLINE on
contents, weather              R → U → C → Q → T(t)          thousands of physics-
                                (single scenario,               generated scenarios.
                                hourly transient loop)          Serves INSTANT
                                                                 predictions for any
                                                                 new design at runtime.

STAGE 4: ANSYS                STAGE 5: DECISION
─────────────────             ─────────────────
Validates only a small   →    Compare Python RC vs ML vs ANSYS
set of REPRESENTATIVE          (MAE, RMSE, R²) → rank designs →
or LOW-CONFIDENCE cases        recommend best + explain why
(baseline, insulated,
different material,
extreme winter)
```

**Key architectural decision — read this before building anything:**
The ML surrogate is trained on **physics-generated data** (thousands of Python RC runs across a sampled design space), *not* on ANSYS results. ANSYS is a separate, independent, high-fidelity simulation run only on a **small representative subset** of cases (or on any case the ML/physics flags as low-confidence). The three outputs are then compared against each other. This is why the deck calls it *"Selective ANSYS"* — ANSYS never sits in the interactive per-click path; it's a periodic/targeted accuracy-proofing step.

| Layer | Speed | Role |
|---|---|---|
| **Physics (RC model)** | ~seconds per design | Ground-truth-for-the-fast-path; also the data generator for ML training |
| **ML surrogate (Random Forest)** | Milliseconds per design | Makes large-scale search/comparison (100s–1000s of designs) tractable — this is what makes the optimizer feature (§8.1) possible |
| **ANSYS (PyAnsys, transient thermal FEM)** | Minutes per case | Independent validation of representative or flagged cases; produces the accuracy claim ("±0.8°C") |

---

## 2. Problem Statement (unchanged, for reference)

| Field | Detail |
|---|---|
| PS ID | 26051 |
| Title | Software Based Model Development for Design of Area Specific Shelter for Thermal Comfort Maintenance |
| Organisation | DRDO — Department of Defence Production / IDEX |
| Required outputs | (1) Predict shelter inside temperature from user inputs, (2) Predict thermal energy from solar radiation, (3) Report heat-flow from ambient/shelter temperature difference over a defined period |

---

## 3. Complete Physics Formula Reference (Authoritative — Member 3/4 version)

This supersedes the simpler formula sheet used in PRD v1.0. It is the actual spec `heat_transfer.py` and `thermal_model.py` must implement.

### 3.1 Geometry
```
A_wall  = 2(L·H + W·H)
A_roof  = L·W
A_floor = L·W
V       = L·W·H
```

### 3.2 Resistance
```
R_layer = d / k                                  # single layer
R_total = 1/h_i + Σ(d_j / k_j) + 1/h_o           # multi-layer, series, with inside/outside film coefficients
U       = 1 / R_total
```

### 3.3 Envelope heat transfer (per surface, per hour)
```
Q_wall  = U_wall  · A_wall  · (T_in − T_out)
Q_roof  = U_roof  · A_roof  · (T_in − T_out)
Q_floor = U_floor · A_floor · (T_in − T_ground)     # prefer ground temp; if unavailable, document the substitute explicitly
```

### 3.4 Thermal capacitance (mass)
```
C_layer     = density · Cp · A · d
C_contents  = m_contents · Cp_contents
C_total     = C_wall_layers + C_roof_layers + C_floor_layers + C_contents
```
> **Modeling note to carry into the PPT/report:** lumping the full envelope mass with the single indoor node is a deliberate simplification (single-zone lumped RC model). ANSYS resolves the real temperature gradient through materials; this is exactly the gap the validation step quantifies.

### 3.5 Gains
```
Q_solar    = eta_solar · A_solar · G        # G = hourly solar irradiance from weather data
Q_internal = user-defined (default 0 W, architecture keeps it configurable)
```

### 3.6 Net heat and governing equation
```
Q_loss = Q_wall + Q_roof + Q_floor
Q_net  = Q_solar + Q_internal − Q_loss

C_total · dT_in/dt = Q_net
```

### 3.7 Hourly numerical update (explicit Euler, Δt = 3600 s)
```
T_in(t+1) = T_in(t) + (Q_net(t) · 3600) / C_total
```
This loop, run once per row of the location's hourly weather data, **is** the physics engine (`thermal_model.py`).

### 3.8 Validation metrics (Python vs ML vs ANSYS)
```
MAE  = (1/n) Σ |T_a − T_b|
RMSE = sqrt[(1/n) Σ (T_a − T_b)²]
R²   = 1 − (Σ(T_a−T_b)² / Σ(T_a−mean(T_a))²)
```
Target from the deck: **±0.8 °C** accuracy claim — this must be the *measured* MAE against ANSYS on the representative cases, not an assumed number; keep it live/recomputed as the validation set grows.

---

## 4. Material Database — Status & What to Fix Before Wiring It In

You already have `SIH26051_material_database_v3_thermal_complete.csv` (16 materials, BIS/ISO/peer-reviewed sourced, correctly computed derived columns — this is good, real data, a genuine improvement over generic textbook values). Before `materials.py` consumes it:

| Action | Why |
|---|---|
| **Add Glass** | Missing entirely; needed for window/opening area in `Q_solar` and for glazed-opening heat loss. No wall/opening design is complete without it. |
| **Add solar absorptivity (α) per material/surface** | The CSV covers conduction-side properties (k, ρ, Cp) only; `Q_solar` and `eta_solar` need α (or an effective gain factor) per material/finish — this is a separate small dataset to source (BIS/ASHRAE surface property tables). |
| **Fix the one blank row** | Local granite is missing its `R_100mm_using_lambda_max/min` pair — trivial fix, recompute from existing λ_min/λ_max. |
| **Decide the h_i / h_o convection coefficients** | Not in the CSV at all — these are separate constants/functions (§3.2) and should live in `heat_transfer.py` with wind-speed-refinable defaults, not the material file. |

**Schema `materials.py` should load** (from the CSV, renamed to snake_case for code use): `material_id, category, k_typical, k_min, k_max, density_typical, density_min, density_max, cp_typical, confidence_level, source_url, alpha_typical (to be added)`.

---

## 5. Module 1 — Physics Engine (`physics_engine/`)

This is your existing `thermal_calculator/` package — keep the name and layout, it's already well designed. Below is the finalized structure with responsibilities and what each file must expose.

```
physics_engine/
└── thermal_calculator/
    ├── __init__.py
    ├── main.py                 # orchestrates one full run: load config → load data → simulate → save → plot → export for ANSYS
    ├── config.py                # dataclass/dict: geometry, layer lists (wall/roof/floor), contents, solar params, T_initial
    ├── materials.py             # load material_properties.json (generated from the CSV); lookup(material_name) -> (k, density, cp, alpha)
    ├── weather.py                # load + clean NASA POWER CSV; standardize columns: timestamp, temperature_C, solar_radiation_W_m2, wind_speed_m_s, humidity_percent
    ├── heat_transfer.py          # pure functions: r_layer(), r_total(), u_value(), q_envelope(), q_solar(), capacitance()
    ├── thermal_model.py          # ThermalModel class: prepares fixed properties once, then run_hourly_loop(weather_df) -> results DataFrame
    ├── ventilation.py            # NEW (feature 3, §8.3): opening-schedule advisor, reads the same hourly loop's T_in/T_out and flags optimal open/close windows
    ├── ansys_export.py           # writes ansys_boundary_conditions.csv (T_out, G, wind per hour) + a scenario JSON (geometry, materials, layer order) for the ANSYS team/pipeline
    ├── data/
    │   ├── material_properties.json   # generated once from the CSV (§4) — do not hand-maintain both
    │   └── weather_data.csv           # per-location hourly NASA POWER data, cleaned
    └── results/
        ├── thermal_results.csv        # timestamp, T_out, G, Q_solar, Q_wall, Q_roof, Q_floor, Q_loss, Q_internal, Q_net, T_in
        └── ansys_boundary_conditions.csv
```

**Function-level contract** (what `main.py` calls, in order — this is your literal runtime flow):
```python
config      = load_config()                          # config.py
materials   = load_material_db()                     # materials.py
weather_df  = load_weather(config.location)           # weather.py

areas = compute_areas(config.L, config.W, config.H)   # heat_transfer.py
r_u   = {surface: compute_r_and_u(layers, h_i, h_o) for surface in ['wall','roof','floor']}
c_total = compute_total_capacitance(config.layers, config.contents, materials)

model = ThermalModel(areas, r_u, c_total, config.T_initial, config.eta_solar, config.A_solar)
results_df = model.run_hourly_loop(weather_df)         # thermal_model.py — implements §3.6/3.7

save_results(results_df)                               # -> results/thermal_results.csv
plot_temperature(results_df)                            # ambient vs indoor
export_for_ansys(config, results_df)                    # ansys_export.py -> results/ansys_boundary_conditions.csv
advise_ventilation(results_df, config.comfort_range)     # ventilation.py (feature 3)
```

---

## 6. Module 2 — ML Surrogate Pipeline (`ml_pipeline/`)

Trains on **physics-generated** data (not ANSYS), so it can be built and iterated on immediately without waiting on ANSYS access.

```
ml_pipeline/
├── scenario_generator.py     # samples the design space: geometry (L,W,H within realistic bounds), orientation,
│                              # material combinations per surface, layer thicknesses, location/weather window.
│                              # Use Latin Hypercube or randomized grid sampling — target ~2,000–5,000 scenarios
│                              # (deck says "thousands"; start smaller, e.g. 1,000, for the 10 Sept prototype).
├── dataset_builder.py         # for each sampled scenario: call physics_engine.thermal_calculator programmatically,
│                              # capture inputs (X) and physics outputs (Y) -> writes training_dataset.csv
├── feature_engineering.py     # turns raw scenario params into model features:
│                              #   geometry (A_wall, A_roof, A_floor, volume, aspect ratio)
│                              #   R/U values per surface, C_total, effective alpha, orientation (one-hot)
│                              #   weather summary features (mean/min/max ambient temp, total solar, mean wind)
├── train_model.py             # trains a multi-output RandomForestRegressor (scikit-learn) on:
│                              #   Y = [min_indoor_temp, max_indoor_temp, avg_indoor_temp, final_temp, avg_heat_loss]
│                              #   (full hourly profile prediction is a stretch goal — see note below)
├── evaluate_model.py           # k-fold cross-validation, feature importance, MAE/RMSE/R² vs. held-out physics runs
├── uncertainty.py               # NEW (feature 2, §8.2): confidence-gating —
│                              #   flags a query design as "low confidence" if it falls outside the training
│                              #   distribution (e.g. via a nearest-neighbor distance check or Random Forest's
│                              #   prediction-variance-across-trees as a built-in uncertainty proxy)
├── predict.py                  # serving wrapper: load(model_path) -> model; predict(design_features) -> instant result
│                              #   this is what the backend's /api/ml-predict route calls
├── models/
│   ├── rf_surrogate_v1.joblib   # serialized trained model
│   └── metadata.json             # training date, dataset size, feature list, validation scores
└── data/
    ├── scenarios_raw.csv          # every sampled scenario + its full physics output
    └── training_dataset.csv       # cleaned X/Y matrix actually used for training
```

**Note on "full hourly profile" prediction:** the deck's Stage-3 box lists both scalar outputs (min/max/avg temp) and full profile prediction as ML outputs. For v1, predict the scalar summary stats (fast, simple, small model) and reuse the fast **Physics** run (not ML) whenever the full 24-hour curve needs to be *displayed* to the user (Stage 3 UI, §9). Only invest in full-sequence ML output (e.g. a small per-hour regressor or a lightweight sequence model) once the scalar surrogate is proven — it's a real jump in modeling complexity for a demo-timeline feature.

---

## 7. Module 3 — ANSYS Validation Pipeline (`ansys_pipeline/`)

```
ansys_pipeline/
├── representative_case_selector.py   # picks 3–5 fixed cases from the design space:
│                                     #   Baseline, High-insulation, Different-material, Extreme-winter-weather
│                                     # PLUS any case flagged low-confidence by uncertainty.py (§6)
├── boundary_condition_builder.py      # reads ansys_export.py's output (from physics_engine) and converts it
│                                     # into the exact input format PyAnsys/APDL expects (named selections,
│                                     # transient load steps per hour, material property blocks)
├── pyansys_runner.py                   # PyMechanical/PyMAPDL script: builds geometry, applies materials,
│                                     # applies transient boundary conditions, solves, extracts nodal
│                                     # temperature history for the same "indoor" reference point/volume
├── contour_export.py                   # exports a temperature-contour image/snapshot per case (for the UI's
│                                     # "visually impressive, builds credibility" contour display)
├── comparison.py                       # for each representative case: runs Physics + ML + reads ANSYS output,
│                                     # computes MAE/RMSE/R² (§3.8) pairwise (Python-vs-ANSYS, ML-vs-ANSYS)
└── results/
    ├── case_baseline/          (ANSYS output files + extracted temperature series + contour image)
    ├── case_insulated/
    ├── case_extreme_winter/
    └── comparison_report.csv    # the numbers behind the "±0.8°C" accuracy claim on the pitch deck
```

**Critical rule (carried over from the physics doc, §9 of the Member 3/4 spec):** ANSYS must **never** take the Python-predicted temperature as an input boundary condition. Both Python and ANSYS independently simulate the *same physical scenario* (same geometry, materials, weather boundary) — comparison only happens *after* both have run. This is what makes the validation meaningful rather than circular.

**Build-order reality check:** this module has the biggest external dependency (a licensed ANSYS seat + PyAnsys environment). For the 10 Sept prototype, build only `representative_case_selector.py` + `boundary_condition_builder.py`, and pre-run 1–2 cases manually/offline if a license is available; treat `pyansys_runner.py` as automatable once access is confirmed (this mirrors the Phase-0 static-validation fallback from PRD v1.0 §6.3).

---

## 8. Additional Features — What to Build, Where

### 8.1 Inverse design / auto-optimizer (highest "wow" factor)
Flips the tool from *evaluate a design* to *recommend a design*. Only tractable because the ML surrogate (§6) makes evaluating hundreds of candidate designs instant.

- **Where it lives:** `backend/app/api/routes/optimize.py` + a new `ml_pipeline/optimizer.py`
- **How it works:** user submits constraints (target comfort range, budget/weight ceiling, allowed materials) instead of a single design → `optimizer.py` generates a candidate pool (same sampling approach as `scenario_generator.py`, but constrained) → scores every candidate via `ml_pipeline/predict.py` (milliseconds each) → returns the top-N designs, with the winner optionally cross-checked against Physics and (if flagged) ANSYS.
- **Build order:** after the ML surrogate (§6) is trained and validated — it's a thin layer on top, not a new engine.

### 8.2 Confidence-gated validation
Answers "how do you know when to trust the fast number?" — a genuine technical answer, not a UI gimmick.

- **Where it lives:** `ml_pipeline/uncertainty.py` (§6), surfaced via a `confidence` field on every `/api/ml-predict` response
- **How it works:** compute an out-of-distribution signal (nearest-neighbor distance to training scenarios, or variance across the Random Forest's individual trees) → if above a threshold, the backend automatically queues the design for `ansys_pipeline` validation instead of only offering it as an optional button.
- **UI impact:** Stage 3/4 (§9) needs a "Confidence: High / Medium — auto-validating with ANSYS" state, not just a static "Get Validated Result" button.

### 8.3 Ventilation / operational advisor
Cheap to add (reuses the existing hourly loop) and backed by a citable external reference (the FHNW Ladakh report you found, showing optimized opening schedules cut "too cold" hours by up to ~5%).

- **Where it lives:** `physics_engine/thermal_calculator/ventilation.py`
- **How it works:** after the hourly `T_in`/`T_out` series is computed, scan for hours where opening/closing a vent or door would measurably help (e.g. flag "open south-facing opening once ambient > X°C", "close by Y pm in winter") using simple threshold heuristics derived from the reference study, refinable later.
- **Output:** a short text list of operational tips shown alongside Stage 6's recommendation (§9), and included in the exported report.

### 8.4 Logistics/cost-aware ranking
Answers "which is warmest given what we can actually get up there" — directly relevant to the defence deployment context every source you've gathered emphasizes.

- **Where it lives:** `backend/app/services/ranking_service.py`
- **How it works:** extend the material database (§4) with optional cost/weight/transportability fields per material (sourced later — flag as a data-gap now, similar to Glass/absorptivity); compute a weighted score = `w1·thermal_performance + w2·(1/cost) + w3·(1/weight) + w4·transportability`, with weights exposed as a simple slider/config the user can adjust.
- **Build order:** last — depends on new material metadata fields that don't exist yet, and is additive to the existing comparison table (§9, Stage 5) rather than a new pipeline.

---

## 9. Module 4 — Backend API (`backend/`)

```
backend/
├── app/
│   ├── main.py                       # FastAPI app instance, router registration, startup: load ML model into memory
│   ├── core/
│   │   ├── config.py                  # env vars, paths to physics_engine/, ml_pipeline/models/, ansys_pipeline/results/
│   │   └── security.py                # NEW (§9.5): password hashing (passlib/bcrypt), JWT create_access_token()/decode_token()
│   ├── api/
│   │   ├── deps.py                     # shared dependencies (DB session, loaded ML model singleton, get_current_user — §9.5)
│   │   └── routes/
│   │       ├── auth.py                  # NEW (§9.5): POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me
│   │       ├── weather.py               # GET /api/weather?location=
│   │       ├── materials.py             # GET /api/materials
│   │       ├── simulate.py               # POST /api/quick-simulate (calls physics_engine)
│   │       │                             # POST /api/ml-predict (calls ml_pipeline.predict, returns confidence — §8.2)
│   │       ├── validate.py               # POST /api/detailed-simulate (queues/returns ansys_pipeline result)
│   │       │                             # GET  /api/ansys-status/{job_id}
│   │       ├── compare.py                # POST /api/compare (multi-design comparison table)
│   │       ├── optimize.py               # POST /api/optimize (inverse design — §8.1)
│   │       ├── ventilation.py             # GET  /api/ventilation-advice/{session_id} (§8.3)
│   │       └── report.py                  # GET  /api/report/{session_id} (PDF/CSV export)
│   ├── schemas/                          # Pydantic models: UserCreate, UserOut, Token (§9.5), ShelterDesignIn, SimulationResultOut, CompareRequest, OptimizeRequest, etc.
│   ├── services/
│   │   ├── report_service.py              # assembles PDF/CSV from stored results
│   │   └── ranking_service.py             # §8.4
│   └── db/
│       ├── models.py                      # SQLAlchemy models: User (§9.5), Location, Material, ShelterDesign, SimulationResult, ComparisonSession, AnsysCase
│       └── session.py                      # SQLite (prototype) / PostgreSQL (production) session factory
├── tests/
│   └── test_routes.py
└── requirements.txt
```

### Updated API contract

`Auth` column: **Public** = no token required. **User** = requires a valid JWT (`Depends(get_current_user)`, §9.5); the route also filters/tags results by the calling user's `user_id`.

| Route | Purpose | Backing module | Auth |
|---|---|---|---|
| `POST /api/auth/signup` | Create account | `api/routes/auth.py` (§9.5) | Public |
| `POST /api/auth/login` | Exchange credentials for a JWT | `api/routes/auth.py` (§9.5) | Public |
| `GET /api/auth/me` | Current user's profile | `api/routes/auth.py` (§9.5) | User |
| `GET /api/weather?location=` | Cached/pre-loaded weather | `physics_engine/thermal_calculator/weather.py` | Public |
| `GET /api/materials` | Material property library | `physics_engine/thermal_calculator/materials.py` (§4) | Public |
| `POST /api/quick-simulate` | Full physics run for one design | `physics_engine` | User — saved `ShelterDesign`/`SimulationResult` rows are tagged with `user_id` |
| `POST /api/ml-predict` | Instant surrogate prediction + confidence | `ml_pipeline/predict.py`, `uncertainty.py` | User |
| `POST /api/detailed-simulate` | Resolve/trigger ANSYS validation | `ansys_pipeline` | User |
| `GET /api/ansys-status/{job_id}` | Poll async ANSYS job | `ansys_pipeline/pyansys_runner.py` | User — job must belong to the caller |
| `POST /api/compare` | Multi-design comparison table | `db/models.py` (ComparisonSession) | User |
| `GET /api/my-designs` | NEW (§9.5): list the caller's saved `ShelterDesign` + `ComparisonSession` history | `db/models.py` | User |
| `POST /api/optimize` | Inverse design / auto-optimizer | `ml_pipeline/optimizer.py` (§8.1) | User |
| `GET /api/ventilation-advice/{session_id}` | Opening-schedule tips | `physics_engine/thermal_calculator/ventilation.py` (§8.3) | User — session must belong to the caller |
| `GET /api/report/{session_id}` | PDF/CSV export | `services/report_service.py` | User — session must belong to the caller |

**Ownership check, not just a valid token:** for every `{session_id}`/`{job_id}` route, `get_current_user` proves *who* is asking, but the route handler still must check `session.user_id == current_user.id` before returning data — otherwise any logged-in user could read another user's results by guessing an ID.

---

## 9.5 Authentication & Per-User Data (NEW)

Purpose: when a user opens the app, they should see **their own** saved designs, comparisons, and simulation history — not a shared, anonymous pool. This is JWT-based auth (no OAuth/social login, no password reset flow — out of scope for the prototype) plus a `user_id` foreign key threaded through the data model.

### 9.5.1 Flow
1. `POST /api/auth/signup` — `{email, password, name}` → hash password (bcrypt via passlib) → create `User` row → return a JWT (auto-login on signup).
2. `POST /api/auth/login` — `{email, password}` → verify hash → return `{access_token, token_type: "bearer"}`.
3. Every protected route requires `Authorization: Bearer <token>`; `deps.get_current_user()` decodes the JWT, loads the `User` row, and raises `401` if the token is missing/expired/invalid.
4. Frontend stores the token in Streamlit `session_state` (not on disk) and attaches it to every `api_client.py` call; on `401` the frontend clears the token and routes back to the login page.

### 9.5.2 Schema additions (`backend/app/db/models.py`)

This is the piece not yet defined anywhere in the doc — adding it now so `models.py` has a concrete spec to build against:

```python
class User(Base):
    __tablename__ = "users"
    id             = Column(Integer, primary_key=True)
    email          = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name           = Column(String, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    designs        = relationship("ShelterDesign", back_populates="owner")
    comparisons    = relationship("ComparisonSession", back_populates="owner")
```

`ShelterDesign` and `ComparisonSession` (already listed as entities in §11) each gain:
```python
user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
owner   = relationship("User", back_populates="designs")   # or "comparisons"
```

`SimulationResult` doesn't need its own `user_id` — it already hangs off a `ShelterDesign`, and that design's `user_id` is enough to resolve ownership. `Location`, `Material`, and `AnsysCase` stay global/shared reference tables — they're not user-owned data, so they don't get a `user_id`.

### 9.5.3 What this changes elsewhere in the doc
- **§10 Frontend:** needs a login/signup page and a "My Designs" view (below).
- **§13 Build sequence:** auth has to exist before any route that writes `ShelterDesign`/`ComparisonSession` rows, since those rows now require a `user_id` — see the updated build order.
- **Dependencies to add to `backend/requirements.txt`:** `passlib[bcrypt]`, `python-jose[cryptography]`, `python-multipart` (form-encoded login).

### 9.5.4 Explicitly out of scope for the prototype
Social login, password reset/email verification, role-based permissions (admin vs. regular user), and refresh-token rotation. A single long-lived access token (e.g. 24h expiry) is sufficient for a hackathon demo login.

---

## 10. Module 5 — Frontend (`frontend/streamlit_app/`)

```
frontend/
└── streamlit_app/
    ├── Home.py                       # Landing — redirects to Login if session_state has no token (§9.5)
    ├── pages/
    │   ├── 0_Login.py                 # NEW (§9.5): login + signup forms, calls /api/auth/login and /api/auth/signup,
    │   │                              #   stores {access_token, user} in st.session_state on success
    │   ├── 1_Input_Form.py            # Stage 2: geometry, layers, materials, comfort target
    │   ├── 2_Instant_Result.py         # Stage 3: physics graph + ML instant stats + confidence badge (§8.2)
    │   ├── 3_Validated_Result.py       # Stage 4: ANSYS graph + contour image + deviation %
    │   ├── 4_Comparison.py             # Stage 5: multi-design table, best-option badge
    │   ├── 5_Recommendation.py         # Stage 6: summary card, physical explanation, ventilation tips (§8.3), export
    │   ├── 6_Optimizer.py              # NEW: inverse design — constraints in, ranked designs out (§8.1)
    │   └── 7_My_Designs.py             # NEW (§9.5): calls GET /api/my-designs — the logged-in user's saved
    │                                  #   ShelterDesigns and ComparisonSessions, with a link back into
    │                                  #   Stage 3/4/5 pages to revisit a past result
    ├── components/
    │   ├── api_client.py               # thin wrapper around backend routes; attaches
    │   │                              #   `Authorization: Bearer {st.session_state.access_token}` to every call;
    │   │                              #   on a 401 response, clears session_state and st.switch_page("pages/0_Login.py")
    │   ├── auth_guard.py                # NEW (§9.5): call at the top of every page except 0_Login.py —
    │   │                              #   if no valid token in session_state, st.switch_page to Login
    │   ├── charts.py                    # ambient-vs-indoor plot, comparison bar chart
    │   └── forms.py                     # reusable geometry/material-layer input widgets
    └── assets/
        └── style.css (optional)
```

Each page (besides Login and My Designs) maps 1:1 to a user-flow stage from PRD v1.0 §9 — no new UX invention needed, just wiring these pages to the new/updated API routes above. Every page other than `0_Login.py` opens by calling `auth_guard.py`, so an unauthenticated user is bounced to login before seeing any input form or result.

---

## 11. Module 6 — Data Layer (`data/`)

```
data/
├── material_database/
│   ├── SIH26051_material_database_v3_thermal_complete.csv   # source of truth (fix gaps per §4)
│   └── material_properties.json                              # generated for physics_engine consumption
├── weather/
│   ├── leh_hourly.csv
│   ├── kargil_hourly.csv
│   └── nubra_hourly.csv
└── db/
    └── thermoshelter.db (SQLite, prototype)
```

**Core entities (SQLAlchemy models, `backend/app/db/models.py`):**
`User` (§9.5 — email, hashed_password, name), `Location`, `Material` (extended with α, and later cost/weight/transportability — §8.4), `ShelterDesign` (now carries `user_id`), `SimulationResult` (physics + ML + ANSYS fields, nullable until each stage runs), `ComparisonSession` (now carries `user_id`), `AnsysCase` (the representative-case library, §7).

---

## 12. Full Repository Layout (top level)

```
thermoshelter/
├── README.md
├── docker-compose.yml
├── .env.example
├── backend/                  (§9)
├── physics_engine/           (§5 — your existing thermal_calculator/)
├── ml_pipeline/               (§6)
├── ansys_pipeline/             (§7)
├── frontend/                    (§10)
├── data/                          (§11)
├── docs/
│   ├── PRD.md (this file)
│   └── formula_reference.md (§3, standalone for quick lookup)
└── scripts/
    ├── setup_env.sh
    ├── build_ml_dataset.sh        # runs scenario_generator.py -> dataset_builder.py -> train_model.py end to end
    └── run_dev.sh                  # starts backend (uvicorn) + frontend (streamlit) together
```

---

## 13. Build Sequence (what to build, in what order)

| Order | What | Depends on | Notes |
|---|---|---|---|
| 1 | Physics engine (`physics_engine/`) | Material CSV fixes (§4), weather CSVs | Everything else calls this — build and unit-test it first |
| 2 | Auth (`User` model, `/api/auth/*`, `get_current_user`, §9.5) | Nothing else | Build before step 3 — `ShelterDesign`/`ComparisonSession` now require `user_id`, so retrofitting auth after those tables exist means a migration, not just new code |
| 3 | Backend `quick-simulate` + `weather` + `materials` routes | Steps 1, 2 | Gets Stages 1–3 of the UI working end to end, with results tagged to the logged-in user |
| 4 | Frontend Login/Signup page + Stages 1–3 (Streamlit) | Step 3 | First demoable slice — login gate in front of everything else |
| 5 | ML pipeline: scenario generation → dataset → training (§6) | Step 1 | Can run in parallel with steps 2–4 |
| 6 | Backend `ml-predict` route + confidence gating (§8.2) | Step 5 | |
| 7 | Comparison table + Stage 5 UI + `My Designs` page (§9.5) | Steps 3, 6 | |
| 8 | ANSYS representative-case pipeline (§7) | Licensed ANSYS access (external dependency — flag early) | If access isn't confirmed in time, fall back to 1–2 manually pre-run cases for the demo, per PRD v1.0 §6.3 Phase 0 |
| 9 | Stage 4 (validated result) UI + deviation reporting | Step 8 | |
| 10 | Optimizer (§8.1) | Step 5/6 | |
| 11 | Ventilation advisor (§8.3), logistics ranking (§8.4) | Steps 1, 5 respectively | Lower priority — add once the core loop is solid |
| 12 | Recommendation/report export (Stage 6) | All of the above | |

---

## 14. Team Ownership

| Owner | Module(s) |
|---|---|
| Member 3 (Physics) | Formula correctness (§3), `heat_transfer.py`, `thermal_model.py`, ventilation heuristics (§8.3) |
| Member 4 (Python/backend) | `physics_engine/` orchestration, `backend/` API, database models, auth (`core/security.py`, `routes/auth.py`, §9.5) |
| ML owner | `ml_pipeline/` — scenario generation, training, uncertainty, optimizer |
| ANSYS owner | `ansys_pipeline/` — PyAnsys scripting, representative-case validation, comparison metrics |
| Frontend owner | `frontend/streamlit_app/` — all six stage pages |
| Whole team | Material database cleanup (§4), pitch deck, demo rehearsal |

---

## 15. Success / Validation Metrics

- **Accuracy claim on the deck ("±0.8°C"):** must equal the live-computed MAE from `ansys_pipeline/comparison.py` on the representative cases (§3.8) — recompute and update this number as more ANSYS cases are run; never hardcode it.
- **ML surrogate quality:** report R² and RMSE against held-out physics scenarios (not seen during training) from `ml_pipeline/evaluate_model.py`.
- **Demo-readiness:** Stages 1–3 + comparison table working end to end is the non-negotiable floor for 10 Sept; ANSYS (Stage 4) and optimizer (§8.1) are the differentiators to layer on if time allows.

---

## 16. Known Gaps / Risks Carried Forward

| Gap | Action |
|---|---|
| Material database missing Glass and α (§4) | Source before wiring into `Q_solar` |
| ANSYS license/access timeline uncertain | Keep `ansys_pipeline` code buildable/testable against a mocked case even without live access; fall back to pre-run static cases for the demo |
| ML trained on physics, not ANSYS — surrogate can only ever be as accurate as the physics model it learns from | Make this explicit on the research/limitations slide; ANSYS comparison exists precisely to quantify this ceiling |
| Full-hourly-curve ML prediction is a stretch goal, not v1 | Serve the curve from Physics directly (§6 note); don't over-promise ML curve prediction in the demo |
| Cost/weight/transportability data for logistics ranking (§8.4) doesn't exist yet | Treat as a roadmap item, source before implementing the ranking service |
| Auth was added after §11's entity list was drafted (§9.5) | Build `User` + `user_id` FKs *before* any other table with data to migrate exists — see updated build order (§13, step 2) |
| No password reset / email verification / social login in scope | Fine for a demo login; call this out explicitly if a judge asks about production-readiness |
