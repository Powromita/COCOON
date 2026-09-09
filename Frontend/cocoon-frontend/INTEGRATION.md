# Connecting the frontend to the COCOON pipeline

The UI is **connection-ready but not connected**. It currently runs off
typed fixtures (`app/_lib/fixtures.ts`). Flipping one env var switches it
to the real pipeline — no component changes.

## The one switch

```
# .env.local
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## What the backend must expose (see `app/_lib/api.ts`)

| Route | Body / params | Returns | Source in pipeline |
|---|---|---|---|
| `POST /api/run` | `RunRequest` | `{ run_id }` | `run_pipeline.py` (spawn a run into `runs/<id>/`) |
| `GET /api/run/:id/status` | — | `PipelineStatus` | `runs/<id>/PIPELINE_STATUS.json` (+ `done`/`failed` flags) |
| `GET /api/run/:id/results` | — | `RunResults` | parsed `optimization_results.csv` + `shortlist.json` + `recommendation.json` + `ansys_validation_summary.csv` + `features/<id>/*.json` + `logistics.csv` |
| `GET /api/reference` | — | `ReferenceData` | `material_properties.json`, `glazing_profiles.json`, `shelter_ratios_recommended.csv` |
| `GET /api/run/:id/artifact/*path` | — | binary (png/csv/md) | files under `runs/<id>/` |

All request/response shapes are defined in **`app/_lib/types.ts`** — the
single source of truth. Mirror them on the backend.

## Data flow (already wired)

```
configure page  --(<form> onSubmit)-->  buildRunRequest()  -->  stashRequest() (sessionStorage)
                                                                      |
results page  <ResultsProvider>  -->  useRun()  -->  api.startRun → poll api.getStatus → api.getResults
                                                                      |
   every panel  -->  useResults()  -->  { results, isReal, phase, status }
```

- `RunProgress` shows the live stage list while polling.
- Panels show fixture data until `isReal` flips true, each marked with a
  `MockNote` banner until then.

## To go live — checklist

1. Build the 5 routes above (FastAPI, or Next route handlers shelling to Python).
2. `POST /api/run` should validate the body against `shelter_config.validate()`
   before spawning, and return `422` with field errors on failure
   (the UI surfaces `ApiError.message`).
3. Set the two env vars, restart `next dev`.
4. The "extra" UI bits still to reconcile: the ML tabs, the "Daily Fuel
   Equivalent" card, the heater Off/Low/Med/High dropdown, and the
   "ANSYS Fluent 3D" / "NASA earth-skin" copy — none are backed by the
   pipeline. Hide or implement.
