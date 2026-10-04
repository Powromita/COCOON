# COCOON Supabase database schema

Status: Phase 2 initial schema  
Migration: `supabase/migrations/20260929000100_create_auth_project_schema.sql`

## Relationship model

```text
auth.users
  1 -> 1 profiles
  1 -> n projects
             1 -> n optimization_runs
                        1 -> n candidate_designs
                        1 -> n artifacts
             1 -> n audit_events
```

All internal relationships use UUID primary keys. Existing `prj_`, `opt_`, and `des_` identifiers remain unique display/API codes and are validated by database constraints.

## Tables

### profiles

Application metadata for one Supabase Auth user. Roles are `operator`, `engineer`, or `admin`; clearance is `pending`, `approved`, `suspended`, or `rejected`. A trigger creates a pending operator profile for each new `auth.users` row.

### projects

Private project metadata plus the mutable configurator draft. `owner_id`, the UUID identity, project code, and creation time are immutable. Draft revisions are nonnegative and support optimistic concurrency in a later phase. Archival is represented by both `status = archived` and a non-null `archived_at`.

### optimization_runs

One immutable pipeline submission under a project. The input snapshot, project, requester, candidate count, seed, code, and identity cannot change after insertion. Lifecycle and result fields remain updateable by the trusted backend. A composite foreign key ensures `projects.latest_run_id` belongs to that project.

### candidate_designs

Compact searchable summaries for candidates. A partial unique index permits only one recommended design per run. Complete BuildingModel documents remain artifacts rather than oversized table rows.

### artifacts

Metadata for a filesystem object or a future private Supabase Storage object. Paths reject parent traversal, Storage rows require a bucket, file sizes cannot be negative, and SHA-256 values use lowercase 64-character hex.

### audit_events

Append-oriented metadata for security and lifecycle events. References become null when the associated identity/resource is removed so the event itself can be retained according to the later retention policy.

## Security state after Phase 2

RLS is enabled on every application table, but Phase 2 intentionally creates no user policies. All privileges are revoked from `anon` and `authenticated`. Therefore the schema is deny-by-default until Phase 3 adds operation-specific grants, RLS policies, and two-user isolation tests.

The `private` schema contains trigger functions, is revoked from `public`, and is not exposed through the Data API.

## Immutability boundaries

Database triggers reject:

- changing a project UUID, code, owner, or creation time;
- changing a run UUID, code, project, requester, input snapshot, candidate count, seed, or creation time.

These invariants protect reproducibility even if a future API implementation contains an authorization bug.

## Indexes

Indexes support:

- owner-scoped project listing by recent update;
- project run history;
- requester audit queries;
- run candidate and artifact lookup;
- actor/project/run audit timelines;
- project-scoped idempotency;
- one recommended candidate per run.

## Applying and reverting

With Node 22+ and Docker Desktop running:

```text
npm run supabase:start
npm run supabase:reset
```

`supabase:reset` rebuilds the local database from all migrations and seed data. It is destructive to the local Supabase database only because the script passes `--local` explicitly.

Do not edit an applied migration. Add a new forward migration for corrections. Before production use, validate Phase 2 and Phase 3 together so the application is never deployed with incomplete authorization grants or policies.

## Local verification limitation

This workstation does not currently have Docker installed, so the migration cannot yet be executed against the local Supabase Postgres 17 container. Static structural verification is complete; database execution remains a required gate before Phase 2/3 changes can be promoted to a hosted environment.
