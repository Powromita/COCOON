# COCOON — Demo Walkthrough

A screen-by-screen guide for showing COCOON live: what to click, what to say, and what is happening underneath at each step.

COCOON designs thermal shelters for extreme cold (Ladakh / Siachen sectors), simulates how warm each design stays, ranks the candidates, and optionally cross-checks the winner with ANSYS finite-element analysis.

> The main [README.md](README.md) is the team reference. This file is the **presenter's script**.

---

## The 30-second pitch

> "You tell COCOON where the shelter goes, how many people it holds, and your limits on weight, budget and materials. It **generates** a pool of candidate shelters, **simulates** each one hour by hour against real weather, **ranks** them on comfort, fuel, cost and weight, and then **validates** the winner with ANSYS. You get a recommendation, a 3D model and the numbers behind it."

```
 Browser (Next.js)  ──►  FastAPI backend  ──►  cocoon_pipeline
 login · wizard ·        /api/v1/...            weather → generate → simulate → price → rank → report
 results · 3D viewer     background jobs                                        └─► ANSYS (optional)
```

---

## Running the demo

```bash
# 1. Backend (from repo root)
python -m uvicorn backend.main:app --port 8000          # add --reload only while developing

# 2. Frontend
cd frontend && npm install && npm run dev                # http://localhost:3000
```

- The frontend calls `/api/backend/*`, a small Next.js proxy ([route.ts](frontend/src/app/api/backend/[...path]/route.ts)) that forwards to the backend at `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8000`).
- **Login is mock auth.** Any credentials work, and the backend runs with `COCOON_MOCK_AUTH=1` (the default), which treats every request as one fixed local user. Set `COCOON_MOCK_AUTH=0` to bring back Supabase token checks. Don't deploy with mock auth on.
- **Don't run `--reload` during a live demo.** A file save restarts the server and kills an in-flight simulation.
- ANSYS needs a local ANSYS install (Student works). Without it, leave the ANSYS toggle off and everything else still works.

---

## Screen 1 — Login (`/login`)

**Show:** the Sign In card with a pre-filled email, a password field, and the **1-Click Demo Login** button. The language toggle (EN / हिन्दी) is top-right.

**Say:** *"This is the entry point. For the demo I'll use one-click login."*

**Under the hood**
- It is a client component that fakes the sign-in with a short delay and then routes to `/dashboard`. Nothing is verified.
- Register, forgot-password and reset-password pages exist with the same style and are equally mocked.
- The language toggle uses a client-side dictionary ([hi.ts](frontend/src/lib/i18n/hi.ts)). The `<T>` component swaps strings live, with no page reload.
- The signed-in user shown in the header is a fixed stub in [session.ts](frontend/src/lib/session.ts). The `role` field is meant to gate engineering-only options.

---

## Screen 2 — Dashboard (`/dashboard`)

**Show:** the top nav (Dashboard · Projects · Shelter Configurator · Simulation Results), the current-project card with an **Open Results** button, the **How COCOON Works** panel, and the **Recent Projects** table (name, location, project ID, last updated, status, validation, actions).

**Say:** *"This is mission control. Every shelter design we have run is listed here with its status and whether ANSYS has validated it. From here I can open results, rename, delete, or start a new design."*

**Under the hood**
- The page calls `GET /api/v1/projects`. The backend scans the saved run folders (`data/pipeline_runs/opt_*`), reads each run's `status.json` and `result.json`, and keeps the latest run per project.
- Rename and delete call `PATCH` and `DELETE /api/v1/projects/{id}`. Writes are atomic, and deletes retry because OneDrive can briefly lock files on Windows.
- Status and validation badges come straight from the run files: `queued / running / completed / failed`, and a validation state such as `RC_ONLY_ANSYS_NOT_REQUESTED` or `VALIDATED_BY_ANSYS`.

---

## Screen 3 — Projects (`/projects`)

**Show:** summary counters (Total Projects, ANSYS Validated, Solving in Progress), then a card per project with its recommended structure, design template, materials and validation state. Each card has **Rename**, **Delete** and **View Simulation Results**. **New Shelter Project** starts the wizard.

**Say:** *"Same data as the dashboard, but as a project library. Each card remembers which design won and how it was validated."*

**Under the hood:** the same `/api/v1/projects` endpoint. Each project is built from its latest optimization run (`_project_from_run` in [pipeline.py](backend/routes/pipeline.py)). The "design template" is the layout family chosen by the generator, such as `airlock_living_sleeping` or `two_floor_compact`.

---

## Screen 4 — Shelter Configurator (`/shelter-configurator/step-1` … `step-5`)

A five-step wizard. A stepper across the top shows progress. The draft is kept in a context provider, so going back never loses input, and each field is validated as you type.

**Under the hood (all steps):** the form fills a single *requirements* object that matches the backend's `RequirementsContract` (field names such as `latitude_deg`, `occupants`, `maximum_footprint_m2` are visible in the labels). Step 5 posts exactly that object.

### Step 1 — Location & weather window
**Show:** four quick-start presets (Ladakh DBO, Siachen Base Camp, Leh, Kargil–Drass), latitude / longitude / elevation, analysis start and end dates, timezone, and a shelter name.
**Say:** *"Click a preset and the coordinates, altitude and an 8-day winter window fill in. The window is the stretch of weather the shelter will be tested against."*
**Under the hood:** weather is **not** fetched live. It comes from a cached 10-year hourly NASA POWER archive for Leh ([weather_archive.py](weather_archive.py)). The pipeline freezes a weather snapshot for your exact window, and if the archive doesn't cover it, the run fails rather than substitute another place.

### Step 2 — Mission & occupancy
**Show:** mission type, number of occupants, required rooms (airlock, living, sleeping, equipment, medical, storage…), target indoor temperature, and **Maximum Unmet Hours**.
**Say:** *"Who lives here and what rooms they need. The target temperature is the comfort line, and unmet hours is how long we allow it to be too cold."*
**Under the hood:** the required rooms choose a layout template (`design_generator/templates/*.json`). Occupants and equipment become internal heat gains in the simulation. Only rooms with an occupancy schedule count toward comfort.

### Step 3 — Site limits & constraints
**Show:** maximum footprint, maximum floors, budget ceiling (₹), approved materials (with **Core 4 Only** / **Select All**), allowed heating fuels, maximum total weight and maximum assembly time.
**Say:** *"These are the hard limits. A design that breaks any of them is thrown out before it is ever simulated. Choosing 'no fuel' tests a fully passive shelter."*
**Under the hood:** these become the generator's constraints (`design_generator/constraints.py`, `optimization/constraints.py`). The materials list comes from a frozen material snapshot (`GET /api/v1/materials`).

### Step 4 — Envelope & architecture
**Show:** optional fixed length / width / height, wall / roof / floor thicknesses, window count with per-window size and orientation, glazing type, and air changes per hour.
**Say:** *"Everything here is optional. Leave it empty and COCOON explores. Fill it in and it holds your choice fixed."*
**Under the hood:** these are `design_options` overrides. A preflight check ([`_preflight`](backend/routes/pipeline.py)) rejects impossible combinations early, for example a fixed length × width larger than the footprint cap.

### Step 5 — Review & launch
**Show:** a read-only summary of steps 1–4 with **Edit** links, the **Candidate Pool Count**, the **ANSYS Validation** toggle, an **Economic Assumption Set** picker, a **JSON** export of the request, and **Run Solver & Optimization**.
**Say:** *"Last look before launch. More candidates means a wider search but a longer wait. ANSYS validation is the extra cross-check on the winner."*
**Under the hood:**
1. `POST /api/v1/optimizations/preflight` checks feasibility, and the page shows what to fix.
2. `POST /api/v1/optimizations` returns an `optimization_id` straight away. The job runs on a thread pool (`MAX_PIPELINE_JOBS`, default 2).
3. The browser is sent to `/candidate-telemetry?opt=<id>`.

---

## Screen 5 — Simulation loading (`/candidate-telemetry?opt=…`)

**Show:** "Validating your shelter design", a large percentage, a flowing progress bar, and **one** status sentence at a time that fades to the next every few seconds. A smaller insight line changes more slowly beneath it. Near the end it switches to "Almost there…". On completion it becomes a checkmark and **Simulation complete**, then the results appear.

**Say:** *"While it works you see plain-language progress instead of backend logs. If it takes a few minutes, the page stays alive."*

**Under the hood** ([SimulationLoader.tsx](frontend/src/components/telemetry/SimulationLoader.tsx))
- The page polls `GET /api/v1/optimizations/{id}` every 2 seconds. The backend writes `status.json` with a `phase`: `starting → weather → rc_validation → ansys_validation → reporting → complete`.
- The backend does **not** report a percentage. The loader maps each phase to a range (for example ANSYS is 45–90%) and eases toward it. During ANSYS it reads the "2/3" counter in the status message.
- It never exceeds 99% until the backend says `completed`. Then it runs to 100%, shows the checkmark for about two seconds, and loads the results.
- The status text and insights are rotating copy, not live backend messages.

If the run fails, the page shows a plain failure card with the reason and suggested fixes (for example "enable concrete or plywood in Step 3"), plus links back to Step 3 and Step 4.

---

## Screen 6 — Simulation results (`/candidate-telemetry?opt=…`, after completion)

The main result page. Walk through it top to bottom.

**Executive summary** — eight tiles: minimum interior temperature, average interior temperature, ΔT achieved (worst inside vs worst outside), comfort hours and unmet hours, heating energy (kWh), estimated fuel demand (L/day), ANSYS status, and wall U-value.
**Say:** *"The headline is whether people stay warm, and what it costs in fuel to keep them that way."*

**Design & materials** — the chosen layout template, floors, dimensions and the layered wall / roof / floor assemblies.

**Inside temperature prediction** — an hourly chart with toggles: heated at setpoint, **free-floating** (no heater) and per-room (multizone) views. A passive-only run opens on the unheated view.
**Say:** *"Blue is outside. The other curve is inside. With a heater it holds the setpoint, and the free-floating view shows how much the building does on its own."*

**Solar heat gain through glazing** — daily solar energy admitted by the windows.

**Heating demand vs outdoor temperature gap** — heat flow plotted against the indoor–outdoor temperature difference. Together with the two charts above, these cover the three outputs the problem statement asks for.

**Lifecycle economics** — capital cost, fuel cost, NPV and payback, with low / expected / high scenarios, compared against a matched baseline (the same layout with its insulation layers removed).

**Top 3 recommended structures** — the four named picks (below), shown as a comparison.

**Validation (ANSYS)** — the validation state and, if ANSYS ran, the comparison against the RC model.

**3D digital twin tab** — switch from *Results* to *3D*. A WebGL viewer shows the actual solved geometry with **Exterior / Cutaway / Floor plan / Wireframe** modes, orbit controls, room labels, and a floor selector for multi-storey plans. Beside it: dimensions, the multi-layer wall specification, engineering telemetry and a logistics-feasibility panel.
**Say:** *"This isn't an illustration. It is the same geometry the simulator solved, vertex for vertex."*

Also on this page: **Download / print report** and **Delete this saved result**. Opening `/candidate-telemetry` with no `?opt=` shows the saved-simulation history, and each run can be reopened.

**Under the hood**
- When the status is `completed`, the page fetches `GET …/report` (`final_report.json`), `GET …/timeseries?which=conditioned` and `which=free_floating`, and `GET …/designs/{id}` for the 3D geometry.
- Charts are hand-rolled SVG. The 3D viewer is React Three Fiber and drei, loaded with `ssr: false`.
- The backend also writes `REPORT.md` and timeseries CSVs under `recommended/`.

---

## What the pipeline actually does

One `POST /api/v1/optimizations` runs [`cocoon_pipeline.run_pipeline`](cocoon_pipeline/runner.py). It contains no physics of its own and just calls the modules in order.

```
requirements
   │
   ├─ M3  freeze weather snapshot for the window
   ├─ M2  generate N candidate buildings (templates × dimensions × materials), reject those that break constraints
   ├─ M6  screening: fast 72 h RC run on the coldest stretch, keep a shortlist (default 20)
   ├─ M4  full multi-zone RC simulation of the shortlist (the real numbers)
   ├─ M7  price each design: CapEx, fuel, OpEx, lifecycle cost
   ├─ M6  Pareto front → four named picks → reliability test on the top few
   ├─ M8  (optional) freeze the recommended design and run ANSYS on it
   └─ report: final_report.json + REPORT.md + timeseries
```

| Module | Folder | What it does |
|---|---|---|
| **M2** Design generator | [design_generator/](design_generator) | Turns requirements into valid `BuildingModel`s: layouts from templates, dimensions, assemblies, windows and doors |
| **M3** Weather | [weather_archive.py](weather_archive.py) | Cached NASA POWER hourly data. Gives typical, worst-case and explicit windows |
| **M4** RC thermal engine | [m4_engine/](m4_engine) | One thermal node per room. Conduction (U×A), thermal mass, solar through glazing, infiltration, ground, occupants and a sized heater. Deterministic |
| **M5** ML screening | [ml/](ml) | Optional. Only discards candidates and never supplies a final number |
| **M6** Optimizer | [optimization/](optimization) | Pareto front, four picks and reliability |
| **M7** Economics | [economics/](economics) | CapEx, fuel and OpEx, NPV, payback and sensitivity, from versioned assumption sets |
| **M8** ANSYS validation | [ansys-pipeline/](ansys-pipeline) | Independent transient-thermal FEM check of the chosen design |

**The four picks** (`optimization/ranking.py`): `best_overall` (weighted comfort, energy, cost, mass, reliability), `best_thermal`, `lowest_lcc` and `lowest_capex`. There is no hidden single score. Objectives are kept separate and each pick comes with its reasons. A design missing a required value is marked "not comparable" and never silently scored 0.

**Reliability** (`optimization/reliability.py`): perturbs infiltration, conductivity, internal gains and so on, and measures how often a design stays among the top recommendations. A perturbation the engine can't honour is reported as not run, not approximated.

**The independence rule for ANSYS:** ANSYS receives only geometry, materials and hourly forcing, never an RC-predicted temperature. That is what makes the comparison a real validation.

---

## ANSYS validation (M8)

- Off by default. The toggle in Step 5 turns it on (`validate_with_ansys`), and the result carries `VALIDATED_BY_ANSYS` only if the ANSYS job actually completed.
- It builds a conforming hex mesh (one air block per room, wall stacks, partitions, slabs, windows and doors), applies the same hourly weather, ground and solar loads, runs a chunked transient solve with PyMAPDL, then compares zone temperatures with the RC result.
- Evidence from completed reference jobs (single room, insulated, airlock + living, two-floor) is in [ansys-pipeline/evidence/](ansys-pipeline/evidence) with a report.
- Expect minutes, not seconds. A 48-hour window solves in roughly 2–4 minutes for simple designs, and a large multi-floor design with many openings is much slower.

---

## API cheat sheet

| Endpoint | Used by |
|---|---|
| `POST /api/v1/optimizations/preflight` | Step 5 feasibility check |
| `POST /api/v1/optimizations` | Launch a run (returns an ID immediately) |
| `GET /api/v1/optimizations` · `…/{id}` | History list and loader polling |
| `GET …/{id}/report` · `/timeseries` · `/candidates` · `/pareto` · `/designs/{id}` | Results, charts, 3D |
| `GET /api/v1/projects` · `PATCH` / `DELETE …/{id}` | Dashboard and Projects |
| `GET /api/v1/materials` · `/capabilities` · `/economic-assumption-sets` | Wizard reference data |
| `POST /api/v1/economics` · `GET …/{id}` | Standalone lifecycle analysis |
| `/api/ansys/jobs…` | ANSYS job queue (submit, status, cancel, artifacts) |

Interactive API docs are at `http://localhost:8000/docs` while the backend is running.

---

## Honest limits to mention if asked

- **Auth is mocked.** There are no real accounts or per-user data separation right now.
- **Benchmark Library and Reports pages** (`/benchmark-library`, `/reports`) are placeholders marked "in development" and are not in the main nav. The candidate dossier route (`/candidate-telemetry/[id]`) for non-run IDs uses sample data.
- **Loader percentages are approximate.** They follow backend phases, not real ANSYS progress.
- **ML screening is not used to produce results.** Every number shown comes from the RC engine, or from ANSYS where that ran.
- The RC engine is a lumped-parameter model. ANSYS is the higher-fidelity check, and agreement between them is reported, not assumed.

---

## Suggested 5-minute demo order

1. **Login** → one click (10 s)
2. **Dashboard / Projects** → show an existing completed project (30 s)
3. **Configurator** → pick the Ladakh DBO preset, keep defaults, change one thing in Step 3 (a lower weight cap) (60 s)
4. **Step 5** → set a small candidate pool, ANSYS off for speed, launch (15 s)
5. **Loader** → explain the phases while it runs (60 s)
6. **Results** → summary tiles, temperature chart, free-floating vs heated, economics (90 s)
7. **3D tab** → cutaway, then floor plan (30 s)
8. **Close** → "and the winner can be cross-checked by ANSYS, independently of our own model" (10 s)

For a smooth demo, run the pipeline once beforehand so a finished project is already on the dashboard if the live run takes too long.
