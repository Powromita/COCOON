# COCOON authentication and project-isolation architecture

Status: accepted for implementation  
Scope: Phase 0  
Decision: Supabase Auth + Supabase Postgres metadata + FastAPI JWT verification

## 1. Security objective

Every project, optimization run, candidate, report, timeseries, building model, and generated artifact is private to its authenticated owner unless a future, explicit sharing model grants access. Possession of a resource identifier never grants access.

Authorization is enforced independently at three boundaries:

1. Next.js protects application navigation and maintains the cookie-backed Supabase session.
2. Supabase Postgres uses Row-Level Security (RLS) for every exposed user-data table.
3. FastAPI verifies the Supabase access token and checks resource ownership before starting jobs or reading artifacts.

Frontend filtering is user experience, not authorization.

## 2. System responsibilities

| Component | Owns | Must not own |
|---|---|---|
| Supabase Auth | Users, credentials, verification, recovery, sessions, future SSO/MFA | Simulation authorization by itself |
| Supabase Postgres | Profiles, ownership, projects, drafts, immutable run metadata, compact result summaries, audit metadata | Large simulation files |
| Next.js | Login UX, cookie-backed session, protected navigation, project/draft UI | Service-role credentials or final authorization decisions |
| FastAPI | JWT verification, ownership checks, job orchestration, result authorization | User passwords or browser session storage |
| COCOON pipeline | RC, optimization, economics and ANSYS computation | Authentication decisions |
| Artifact store | Building models, timeseries, reports, candidate/ANSYS bundles | Project ownership source of truth |

Initial artifact storage remains on the backend filesystem. A later phase moves durable artifacts to a private Supabase Storage bucket without changing the ownership model.

## 3. Canonical identifiers

| Identifier | Meaning | Security use |
|---|---|---|
| `auth.users.id` UUID | Canonical user identity | Project owner and request principal |
| `projects.id` UUID | Internal project primary key | Relationships and authorization |
| `projects.project_code` | Human-readable `prj_...` code | Display and API lookup only |
| `optimization_runs.id` UUID | Internal run primary key | Relationships and artifact mapping |
| `optimization_runs.optimization_code` | Existing `opt_...` code | Display and API lookup only |
| `candidate_designs.design_code` | Existing `des_...` code | Display and lookup within an authorized run |

Email addresses, timestamps, frontend state, and resource codes are never ownership proofs. The server derives the user identity from a verified JWT `sub` claim.

## 4. Initial ownership model

The first secure release supports private projects only:

```text
auth.users
  -> profiles
  -> projects (owner_id)
       -> optimization_runs (project_id, requested_by)
            -> candidate_designs (run_id)
            -> artifacts (run_id)
       -> audit_events (project_id)
```

Team sharing is intentionally deferred. When introduced, it will use a normalized `project_members(project_id, user_id, role)` relation rather than arrays or editable JWT user metadata.

## 5. Authorization invariants

- Anonymous users have no access to profiles, projects, drafts, runs, candidates, reports, timeseries, or artifacts.
- A new project owner is always the authenticated user; request bodies cannot choose `owner_id`.
- A run can be created only under a project owned by the authenticated user.
- Child-resource access is authorized through the parent run and project, not through a guessed child identifier.
- Ownership cannot be transferred through ordinary project updates.
- Project drafts are mutable; launched run input snapshots are immutable.
- Service/secret credentials exist only in trusted server environments and bypass RLS only after explicit application ownership checks.
- Cross-user lookups should normally return `404` to avoid confirming that a resource exists.
- Local caches are namespaced by user and project and cleared on logout/account change.
- All project and run mutations use audit metadata and request correlation IDs.

## 6. Endpoint authorization matrix

| Endpoint/resource | Anonymous | Authenticated owner | Other authenticated user | Additional rule |
|---|---:|---:|---:|---|
| Auth callback/reset | Allowed | Allowed | Allowed | Token/code validation required |
| `GET /api/v1/projects` | Denied | Own rows only | Cannot see owner rows | Database RLS plus API filtering |
| Create project | Denied | Allowed | N/A | Server assigns owner |
| Read/update/archive project | Denied | Allowed | Denied | Ownership cannot change |
| Save configurator draft | Denied | Allowed | Denied | Optimistic revision check |
| Optimization preflight | Denied | Allowed | Denied | Project ownership and draft validation |
| `POST /api/v1/optimizations` | Denied | Allowed | Denied | Clearance/role, idempotency and project ownership |
| List/get optimization | Denied | Allowed | Denied | Resolve run through owned project |
| Candidates/Pareto | Denied | Allowed | Denied | Resolve through owned run |
| Building model | Denied | Allowed | Denied | Candidate must belong to owned run |
| Report/timeseries | Denied | Allowed | Denied | Resolve artifact through owned run |
| Request ANSYS | Denied | Role-dependent | Denied | Engineer/admin capability |
| Administrative approval | Denied | Denied | Denied | Admin-only trusted server operation |

## 7. Authentication and request flow

```text
Browser signs in with Supabase Auth
  -> Supabase establishes a cookie-backed session
  -> Next.js protects application routes and refreshes the session
  -> API client sends the access token in Authorization: Bearer
  -> FastAPI verifies signature, issuer, audience and expiry
  -> FastAPI extracts the user UUID from `sub`
  -> database/resource lookup includes ownership
  -> authorized operation executes
```

Access and refresh tokens must never appear in query strings, logs, reports, analytics, local project records, or error messages.

## 8. Data placement

Postgres stores searchable and transactional data:

- application profiles and controlled roles;
- project metadata and current draft;
- immutable run input snapshot and lifecycle status;
- compact candidate/result summaries;
- artifact metadata, checksums and audit events.

Artifact storage holds large or generated data:

- complete BuildingModel JSON;
- timeseries CSV/JSON;
- candidate bundles;
- final reports;
- ANSYS inputs, meshes and output images.

The initial filesystem namespace is:

```text
data/pipeline_runs/<user-uuid>/<project-uuid>/<run-uuid>/
```

Paths are resolved from trusted database records and normalized under the configured artifact root. User-supplied path fragments are never used directly.

## 9. Configuration boundary

Frontend-safe configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_BASE_URL`

Backend-only configuration:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWKS_URL`
- `SUPABASE_PROJECT_REF`

The secret/service key must never use a `NEXT_PUBLIC_` prefix, appear in a tracked file, or be returned to the browser.

## 10. Migration strategy

Existing filesystem runs have no trustworthy owner. They will not be exposed automatically after authentication is enabled.

- Disposable development runs are deleted or left outside the authenticated index.
- Valuable historical runs require an administrator-reviewed manifest mapping each run to a target user and project.
- Migration validates result files, creates project/run records, moves artifacts into the owner namespace, records checksums, and emits an audit event.
- A two-user access test is mandatory for every migrated batch.

## 11. Rollback strategy

Each database phase is delivered as a reversible migration. Application rollout uses compatibility stages:

1. Add tables and policies without reading them in production.
2. Enable real authentication while existing simulation execution remains unchanged.
3. Dual-record new project/run metadata while filesystem outputs remain authoritative.
4. Switch reads to ownership-aware records after reconciliation.
5. Remove global filesystem scanning only after the two-user isolation suite passes.

Rollback may return application reads to the last compatible schema, but production must never fall back to unauthenticated global project access. Any emergency local `AUTH_MODE=disabled` is development-only, visibly marked, and rejected outside a local environment.

## 12. Required security acceptance test

User A creates a project, saves a draft, launches a run, and reads every result. User B then attempts to list or directly fetch A's project UUID, `prj_` code, `opt_` code, `des_` code, report, timeseries, building model, and artifact path. Every attempt must reveal no data. The same test is repeated with A and B reversed at the RLS, FastAPI, and browser layers.

