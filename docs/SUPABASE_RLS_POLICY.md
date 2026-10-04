# COCOON Row-Level Security policy

Status: Phase 3 private-owner policy  
Migration: `supabase/migrations/20260929000200_add_private_owner_rls.sql`  
Test: `supabase/tests/project_isolation_rls.test.sql`

## Effective permissions

| Resource | Anonymous | Authenticated owner | Other user | Trusted service role |
|---|---|---|---|---|
| Profile | None | Read; update display name, organization and appointment | None | Full |
| Project | None | Read, create, update/archive | None | Full |
| Optimization run | None | Read | None | Full |
| Candidate summary | None | Read | None | Full |
| Artifact metadata | None | Read | None | Full |
| Audit event | None | Read owned-project events and own unscoped events | None | Full |

Direct project deletion is not granted. Runs, candidates, artifacts, and audit events are not directly writable by browser users. The trusted FastAPI service will perform those writes only after verifying the Supabase JWT, project ownership, role/clearance, and request state.

## Ownership helpers

Two `security definer` functions live in the non-exposed `private` schema:

- `private.user_owns_project(uuid)` compares the project owner to the current JWT subject.
- `private.user_owns_run(uuid)` follows run -> project -> owner.

They set an empty search path, fully qualify referenced objects, return only a boolean, and are executable only by `authenticated` and `service_role`. This avoids recursive RLS policy chains and keeps child-resource policies consistent.

## Column restrictions

RLS controls rows while grants control operations and columns. Authenticated users cannot update `profiles.application_role` or `profiles.clearance_status`, even on their own row. They also cannot update project identity, project code, owner, or creation time. Database triggers provide a second immutability layer.

## Test coverage

The pgTAP transaction creates two synthetic Supabase users with separate projects, runs, candidates, artifacts, and audit events. It then proves:

- anonymous users cannot read profiles, projects, or runs;
- User A sees only A's profile and resource graph;
- User A can update and create an owned project;
- User A cannot update or claim User B's project;
- users cannot directly delete projects;
- safe self-profile fields can be updated;
- users cannot elevate their own role;
- users cannot directly create runs, candidates, artifacts, or audit events;
- the ownership helper rejects the other user's project.

The test is transaction-wrapped and rolls back all synthetic identities and resources.

## Running the tests

With Node 22+ and Docker Desktop running:

```text
npm run supabase:start
npm run supabase:reset
npx supabase test db
```

The test suite is a required CI and deployment gate. This workstation has no Docker/Postgres runtime, so the SQL is authored and statically checked but has not yet been executed here.
