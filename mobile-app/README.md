# COCOON Mobile (M12)

The Android client for the COCOON thermal-shelter platform (DRDO PS 26051). Users enter a shelter's mission
requirements. The COCOON backend generates, simulates, prices and ranks candidate designs, and the app shows
the results: room temperatures, energy, lifecycle economics, a 3D model, ANSYS validation state and provenance.

**The app is a client, not a second COCOON.** It never runs physics, ML, optimization, economics or ANSYS. It
validates input, stores drafts, calls the backend, polls jobs, caches responses and displays typed results.

Built with Expo SDK 57, React Native 0.86, TypeScript (strict), Expo Router, TanStack Query, Zustand, React Hook
Form + Zod, Expo SQLite, Expo SecureStore, Expo Notifications, Expo Font (Inter, JetBrains Mono), Expo File
System + Sharing, React Native WebView (three.js), React Native SVG and NetInfo.

---

## Quick start

```bash
cd mobile-app
npm install
cp .env.example .env.local      # optional — defaults to demo (fixture) mode
npx expo start                  # then press "a" for an Android emulator, or scan with a development build
```

Other commands:

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | `expo lint` |
| `npm test` | Jest: unit, repository (real SQL via sql.js), service, navigation tests |
| `npm run build:viewer` | Rebuilds the 3D viewer page after editing `viewer/` |
| `npm run android` | `expo run:android` — local native build (needs the Android SDK + JDK) |

---

## Data providers: fixture ↔ API

Every screen reads data through service interfaces (`services/interfaces/`). `services/registry.ts` picks one
provider per service from `EXPO_PUBLIC_DATA_PROVIDER`:

| Value | Provider | Behaviour |
|---|---|---|
| `fixture` (default) | `services/fixture/FixtureServices.ts` | Demo data. Every screen shows a **DEMO DATA** strip. No network calls. |
| `api` | `services/api/ApiServices.ts` | The FastAPI backend at `EXPO_PUBLIC_API_URL`. |

**Switching to the real backend:**

1. Start the backend from the repo root:
   `PYTHONPATH=.:packages/contracts/python python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000`
2. In `mobile-app/.env.local`:
   ```
   EXPO_PUBLIC_DATA_PROVIDER=api
   EXPO_PUBLIC_API_URL=http://10.0.2.2:8000      # Android emulator → host machine; use the LAN IP from a phone
   ```
3. Restart Expo with a clean cache: `npx expo start -c`.

Services can also migrate **one at a time**: change a single line in `services/registry.ts` from the `Fixture…`
class to the `Api…` class. No screen changes are needed.

### What the demo data is

- **`fixtures/recorded/`** holds real responses recorded from this repo's backend (main @ `1048a2c`):
  - one optimization of the M0 sample requirements (Leh, 30 occupants, 8 designs);
  - each design's BuildingModel, RC simulation and hourly timeseries;
  - each design's M7 lifecycle-economics report.

  They are genuine engine outputs, but still **demo data**, and are labelled as such.
  `fixtures/recorded/MANIFEST.json` records exactly how they were produced.
- **M0 samples** (`packages/contracts/fixtures/valid/`) are imported in place for contract instances the run
  doesn't produce (sample requirements, sample VisualizationModel, ANSYS result states).
- In demo mode, "Generate designs" replays the recorded run **whatever requirements are entered**. The
  generation and review screens say so.
- Demo mode never shows ANSYS as run and never fabricates reports. Those show "unavailable" / "coming soon".
- A backend ANSYS job with status `COMPLETED` means the MAPDL solve and comparison artifacts completed. M8
  reports descriptive RC-versus-ANSYS metrics and explicitly defines no accuracy threshold; the app therefore
  does not treat `COMPLETED` as a formal pass/fail validation or design acceptance.

---

## Architecture

```
USER → screens (app/) → hooks (React Query / Zustand) → service interfaces → fixture | API provider → COCOON backend
                                     ↘ SQLite (drafts, cache, sync queue)
```

```
mobile-app/
├── app/                      Expo Router routes (screens only)
│   ├── index.tsx             startup: DB → config → backend → auth checks
│   ├── (tabs)/               Home · Projects · New shelter · Reports (run history) · Settings
│   ├── (auth)/               login · register · forgot-password · reset-password (service unavailable on main)
│   ├── project/new.tsx       create project (blank or M0 sample template)
│   ├── project/[id]/         index = project hub, edit = 10-step requirements wizard
│   ├── generation/[jobId]    job polling
│   ├── candidates/[optimizationId]/   index (gallery) · pareto · compare
│   ├── results/[optimizationId]/[designId]   7 tabs: Overview · Rooms · Energy · Economics · 3D · Validation · Evidence
│   └── dev/m0.tsx            fixture guard diagnostics (development builds)
├── services/
│   ├── interfaces/           one interface per domain (generation, candidates, simulation, economics, …)
│   ├── api/                  ApiClient (timeouts, auth header, error normalization) + Api* providers
│   ├── fixture/              Fixture* providers
│   ├── shared/mappers.ts     response → app-model mapping shared by both providers
│   └── registry.ts           fixture/api switch
├── hooks/                    useProjects (SQLite), useCocoon (server state + polling), cachedQuery (offline)
├── adapters/                 presentation-only reshaping of contract data (never derives scientific values)
├── components/               common/, forms/, projects/wizard/, candidates/, results/, charts/, viewer/, status/
├── database/                 SQLite driver, migrations, repositories (projects, cache, sync queue, settings)
├── validation/               Zod schemas for the M0 RequirementsContract, wizard steps, option lists
├── sync/                     offline sync queue + conflict-resolution extension point
├── store/                    Zustand: connectivity, unit preference, comparison tray
├── auth/                     SecureStore token storage (auth screens: app/(auth)/, service: services/interfaces/AuthService.ts)
├── notifications/            job-completion notifications (permission, channel, once-only claim)
├── i18n/                     English/Hindi dictionary, useT(), "cocoon.lang"
├── viewer/                   three.js viewer source → bundled into components/viewer/viewerHtml.generated.ts
├── fixtures/recorded/        recorded backend responses (demo data)
└── tests/
```

### Contracts (M0)

`@cocoon/contracts` resolves to **main's generated M0 package** (`../packages/contracts/typescript/src`), through
`tsconfig.json` paths, a Metro `resolveRequest` hook and a Jest `moduleNameMapper`. That package is not modified.
App types that are *not* M0 contracts are the backend's envelopes and M6/M7 documents. They live in
`types/backend.ts` and were checked against recorded responses.

### Backend endpoints used

| Feature | Endpoint (main) |
|---|---|
| Status | `GET /api/v1/capabilities` |
| Materials | `GET /api/v1/materials` |
| Design generation (M2→M4→M7→M6 job) | `POST /api/v1/optimizations`, `GET /api/v1/optimizations/{id}` |
| Candidates / Pareto / design | `GET /api/v1/optimizations/{id}/candidates`, `/pareto`, `/designs/{design_id}` |
| Simulation | `POST /api/v1/simulations`, `GET /api/v1/simulations/{id}/timeseries` |
| Economics | `GET /api/v1/economic-assumption-sets`, `POST /api/v1/economics` |
| ANSYS | `GET /api/ansys/revisions/{rev}/latest`, `POST /api/ansys/jobs`, `GET /api/ansys/jobs/{id}` |

Not on the backend yet. The app has the interface and handles each gap honestly:

| Brief endpoint | Current handling |
|---|---|
| `GET /api/v1/optimizations` (list) | Tried first. On 404, history is built from the run IDs this device started (`run_index` table), **each re-read from `GET /api/v1/optimizations/{id}`**. The device stores IDs only, never results. |
| `/api/v1/projects` (GET list/by ID, POST, PUT) | `ProjectService` implements them. They return 404 on `main`, so the Projects screen shows REMOTE as "unavailable" and projects stay LOCAL (SQLite). |
| `GET /api/v1/optimizations/{id}/report` | Checked on demand; on 404 the app shows "PDF export coming soon". Completed runs can still be exported as JSON. |
| `/api/v1/visualizations/{rev}` | Tried first. On 404 the 3D model is assembled by **copying** the BuildingModel's zone boxes and surfaces plus the simulation's zone temperatures, labelled **GEOMETRY-DERIVED VIEW**. Windows are omitted: M0 openings have no position. |
| `/api/v1/auth/*` | `AuthService` implements login, register, forgot password and reset password. The backend runs with `AUTH_MODE disabled`, so the screens show "Authentication service unavailable". Nothing fakes a sign-in. |
| `/api/v1/generation-jobs/{id}` | Generation uses the real job endpoint, `/api/v1/optimizations/{id}`. |

The backend reports only `queued / running / completed / failed` for jobs, so the generation screen shows status
and timestamps, never a percentage.

### Run history

**Reports** (bottom tab) lists runs with Optimization ID, Project ID, created time, status, candidate count and
recommended design:
- **Actions:** View results, View candidates, and **Download JSON**. The JSON holds the backend's own status,
  candidate and Pareto documents, labelled demo or live, and is shared via the Android share sheet.
- PDF reports are not available from this backend. The app explains the limitation and does not repeatedly
  call a missing PDF endpoint from the run card.
- **Persistence:** completed runs stay reachable after navigating away, refreshing or restarting, because every
  run is re-read from the backend.
- **Demo runs:** appear only in demo mode, never mixed into live history.

### Job polling and notifications

- The generation screen polls every **2 s** while a job is `queued` or `running`, and stops at `completed` or
  `failed` or when the screen closes. It shows QUEUED / "Running COCOON thermal pipeline" / COMPLETED / FAILED,
  never a percentage (the backend reports none).
- A foreground job monitor (`hooks/useJobMonitor.ts`) re-checks active runs every 5 s while the app is open,
  and immediately on return to the foreground. It raises one local notification per run and terminal status:
  "COCOON design generation complete" or "…failed".
- If an active run cannot be refreshed, the app shows a **RUN STATUS UNAVAILABLE** banner and keeps retrying
  while foregrounded; this is distinct from the device's **OFFLINE** state.
- **No duplicates:** each run notifies at most once per terminal status, claimed atomically in SQLite, and a
  result already seen on screen doesn't notify.
- **Permission:** requested when the first job starts. If it's denied, Settings says so.
- **Expo Go:** Expo Go on Android no longer includes `expo-notifications` (removed in SDK 53), and importing
  it there crashes the app. So the module is loaded lazily (`notifications/module.ts`) and never in Expo Go:
  the app runs normally there and Settings says notifications need a development build or the APK.
- **Limitation:** there is no polling while the app is closed. Android background tasks run at most every ~15
  minutes and aren't guaranteed, so a run that finishes while the app is closed is announced when it's next
  opened.

### Language

English and Hindi (हिन्दी), in Settings. The choice is saved under the key `cocoon.lang`, the same key the web
frontend uses. Missing translations fall back to English. IDs, units and engineering values are never translated.

### Design system

A white-based "MIL-SPEC Thermal Platform" look, adapted from `stitch-exports/alpine_mission_thermal/DESIGN.md`:
- **Colors:** white surfaces on `#F8F9FF`, navy `#00236F`/`#1E3A8A` for actions, engineering teal `#0F7A8C`
  for heat flow, amber `#D97706` for thermal/solar/demo, green `#059669` for valid/comfort, red `#BA1A1A` for
  failures only. Tokens live in `theme/colors.ts`.
- **Type:** Inter for interface text; JetBrains Mono for IDs, coordinates, temperatures, units and timestamps.
- **Shape:** cards 10 px radius, buttons 8 px, fully rounded status badges.
- **Status:** always has a text label, never color alone.

### Offline

- Drafts, projects and the last successful API responses (`api_cache`) are stored in SQLite.
- When a request fails because the device is offline or the server is unreachable, cached data is shown and
  labelled **Cached** with its fetch time.
- Fixture data is never cached, so it can't later appear as a backend response.
- The **Offline** banner comes from NetInfo. React Query pauses and refetches on reconnect, and the sync queue replays.
- If the backend cannot be reached, Reports can still show the device's local run IDs and last-known statuses.
  This is a local index only; it does not imply that run details were cached or freshly retrieved.
- New calculations are never queued: generating designs needs a connection, and the Review screen says so.

### ANSYS interpretation

The Validation tab displays solver execution state and descriptive RC-versus-ANSYS metrics separately. A
`COMPLETED` solver job means MAPDL and its comparison artifacts completed; it is **not** a formal validation
pass. M8 currently defines no accuracy tolerance or pass/fail acceptance criterion. When ANSYS is unavailable,
the app shows a user-readable reason and keeps backend technical detail behind the error-details control.

### Backend capability boundaries

Projects and requirements drafts are stored locally in SQLite; this backend does not expose project listing or
project persistence endpoints. Optimization history falls back to the device's persisted run-ID index because the
backend has no optimization-list endpoint. There is no backend PDF report or visualization-model endpoint:
the app exports actual run status/candidate/Pareto JSON and labels its building-geometry viewer as
geometry-derived. These limitations are not represented as successful backend features.

---

## Testing

```bash
npm test                        # Jest reports the current test count; live-backend test is skipped by default
```

- **Validation:** every wizard rule and the round trip of the M0 sample into an identical `RequirementsContract`.
- **Services:** API client error normalization (401…503, timeout, malformed, offline) and API providers against
  recorded responses (request bodies, mapping, missing endpoints). Fixture providers: job states and nothing
  fabricated.
- **Database:** real SQL via sql.js — migrations, including upgrading a v1 database; create/update/load/resume
  drafts; run lifecycle; cache; sync queue.
- **Job polling:** polling policy for running, completed, failed and unknown jobs. The timeout is covered in the API client tests.
- **Visualization:** VisualizationModel assembly and validation, viewer message protocol, and a self-contained viewer page.
- **Navigation:** new project → wizard, resume draft, generation → candidates → results, tab switching.

**Live end-to-end test** against a running backend: it walks the whole journey through the API providers.

```bash
COCOON_LIVE_API_URL=http://127.0.0.1:8765 npx jest tests/integration
```

---

## Android build (EAS)

`app.config.ts` (replaces `app.json`):
- The Android package / iOS bundle ID default to `com.bytefiesta.cocoon`. Override them per build with
  `COCOON_ANDROID_PACKAGE` / `COCOON_IOS_BUNDLE_ID`, for example as EAS environment variables. Changing the ID
  after a release creates a different app.
- package `com.bytefiesta.cocoon`, version `1.0.0` / versionCode `1`, portrait;
- permissions limited to `INTERNET`, `ACCESS_NETWORK_STATE` and `POST_NOTIFICATIONS` (camera, microphone and
  storage are explicitly removed);
- white adaptive icon (navy/teal shelter mark), monochrome themed icon, notification icon, white splash, light UI only.

`eas.json` profiles (all produce an **APK**):

| Profile | Data | Notes |
|---|---|---|
| `preview` | fixture | Demo APK, no backend needed. |
| `staging` | api | Set `EXPO_PUBLIC_API_URL` as an EAS environment variable (`preview` environment). |
| `production` | api | Set `EXPO_PUBLIC_API_URL` in the EAS `production` environment. It must be `https://`: release builds block cleartext HTTP. |

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Status (verified): `expo-doctor` passes 21/21; `expo export --platform android` builds a 6.1 MB Hermes bundle;
`expo prebuild` generates a correct manifest.

**No APK has been built.** The build machine has no Android SDK or JDK (so no local build), and EAS reports
"Not logged in". To build:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview     # demo APK, no backend needed
```

## Known gaps

- **Backend endpoints:** projects, a run list, reports, visualizations and auth are not on the backend yet. The
  app has typed services for each and reports each gap honestly (table above).
- **Notifications while closed:** not delivered while the app is closed (see the limitation above).
- **Modes:** Existing Shelter and Engineering modes are not in the mobile app yet (New Shelter only).
- **Wizard fields:** per-room dimensions, a comfort-band maximum and an annual-OPEX budget are not in the M0
  RequirementsContract, so the wizard does not collect them.
- **Heat flow by path** (wall/roof/ground/window) is not part of the M0 SimulationResult.
- **Hindi coverage:** navigation, headers, wizard and key labels; other text falls back to English.
