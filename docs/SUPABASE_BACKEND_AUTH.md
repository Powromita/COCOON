# Backend Supabase JWT authentication

FastAPI treats the Supabase access token as the only browser identity proof. All routers are protected by `require_user`; `/api/health` is intentionally public for service monitoring.

## Verification

`backend/auth.py` obtains the signing key from the project's JWKS endpoint and validates:

- An asymmetric `RS256` or `ES256` signature
- `exp`, `iat`, `sub`, `aud`, and `iss` claims
- Audience `authenticated`
- Supabase role `authenticated`
- A UUID-formatted subject

The API does not decode an unverified token, accept a user ID from request data, or use the service-role key as a browser credential. JWKS signing keys are cached for five minutes and PyJWT refreshes them when the key ID changes.

## Configuration

Copy `backend/.env.example` to `backend/.env` and provide the Supabase project URL/JWKS/issuer values. Install `backend/requirements.txt`. The API process must load the environment file through its deployment/runtime configuration.

The frontend retrieves its current Supabase access token and sends `Authorization: Bearer <token>` on every backend request. CORS explicitly permits that header.

## Authorization boundary

This phase authenticates the caller. Phase 6 connects project and run operations to Supabase ownership records so every resource lookup is authorized against the verified `AuthenticatedUser.id`. Until that integration is complete, authentication alone must not be represented as full filesystem artifact isolation.
