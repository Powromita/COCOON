# Supabase environment setup

This document is the Phase 1 operator guide for COCOON authentication and per-user projects. The ownership and authorization decisions are defined in `docs/AUTH_PROJECT_ISOLATION_ARCHITECTURE.md`.

## Prerequisites

- Node.js 22 or later. The installed Supabase JavaScript packages require Node 22+.
- Docker Desktop or another Docker-compatible runtime for the local Supabase stack.
- A separate hosted Supabase project for each remote environment: development, staging, and production.
- Supabase CLI is installed as a project dependency and pinned through `package-lock.json`.

Use the repository scripts rather than a machine-global CLI:

```text
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:stop
```

The local stack is development-only and must never be exposed to external traffic.

## Local configuration

`supabase/config.toml` is safe to commit and currently configures:

- local application URL `http://localhost:3000`;
- auth callback and password-reset redirect allow-list entries for localhost and 127.0.0.1;
- mandatory email confirmation;
- 12-character passwords with lower/upper-case letters, digits, and symbols;
- refresh-token rotation;
- an 8-hour session timebox;
- a 1-hour inactivity timeout;
- anonymous sign-in disabled;
- SMS and external identity providers disabled.

Local authentication emails are captured by the Supabase local SMTP viewer rather than delivered externally.

## Safe frontend configuration

Copy `frontend/.env.example` to `frontend/.env.local` and replace the placeholders:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Only the project URL and publishable key belong in the frontend. They are public by design; data protection comes from RLS and grants.

Never add `SUPABASE_SECRET_KEY`, a service-role key, a database password, or a personal CLI access token to a `NEXT_PUBLIC_` variable.

## Backend-only configuration

Copy `backend/.env.example` to `backend/.env` and replace the placeholders:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<secret-key>
SUPABASE_PROJECT_REF=<project-ref>
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
```

`backend/.env` is ignored. The production values belong in the deployment platform's secret manager, not in the repository.

Phase 7 will make the backend read and validate these settings. Creating the template in Phase 1 does not yet activate authentication.

## Linking a hosted development project

Do not link the repository until the correct development project is known. From the repository root, an authorized operator runs:

```text
npx supabase login
npx supabase link --project-ref <development-project-ref>
```

The CLI login token and link metadata are local state and must not be committed. Before any linked destructive command, verify the target project. Never run `db reset --linked` against production.

Staging and production schema changes should be promoted by reviewed migrations and CI/CD rather than developers manually editing tables in the Supabase dashboard.

## Hosted dashboard configuration

For each environment, configure the matching site URL and exact redirects:

```text
https://<environment-domain>/auth/callback
https://<environment-domain>/reset-password
```

For the initial implementation:

- enable email/password authentication;
- require email confirmation;
- keep anonymous authentication disabled;
- leave SAML/OIDC/CAC-labelled access disabled until the actual institutional identity provider is configured;
- use environment-specific email templates and SMTP before production;
- review abuse protection and rate limits before public exposure.

## Repository layout

```text
supabase/
  config.toml       local stack configuration
  migrations/       ordered, reviewed schema migrations
  tests/            database and RLS tests
  seed.sql           synthetic local development seed data only
```

CLI state under `supabase/.temp` and `supabase/.branches`, together with all real environment files, is ignored.

## Phase 1 verification

The phase is complete when:

1. `npx supabase --version` returns the pinned CLI.
2. `supabase/config.toml` exists and contains no secrets.
3. Frontend, backend, and Supabase environment templates exist.
4. Real environment files and CLI state are ignored.
5. Environment templates themselves are not ignored.
6. `npm install` reports no dependency vulnerabilities.
7. No remote project is linked without an explicit project reference and operator approval.

## Inputs needed for Phase 4/5 remote integration

The repository can proceed through database schema and RLS work locally before remote credentials are supplied. Before live authentication is connected, provide or configure locally:

- Supabase project URL;
- project reference;
- publishable key;
- backend secret key, entered directly into `backend/.env` or the deployment secret manager;
- approved application and callback domains.

Do not paste the backend secret key into chat or commit it to Git.
