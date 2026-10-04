# Frontend authentication

COCOON uses `@supabase/ssr` so authentication sessions are shared between the browser, Next.js Proxy, Route Handlers, and Server Components.

## Configuration

Copy `frontend/.env.example` to `frontend/.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`: the project URL from Supabase project settings.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the publishable/anon browser key. Never use the service-role key here.

In Supabase Authentication URL configuration, set the site URL to the deployed frontend URL and allow these redirect URLs:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/reset-password`
- The equivalent production URLs.

Email confirmation must remain enabled. Signup metadata creates a `profiles` row through the database trigger; users cannot choose their application role or clearance status.

## Flow

1. `/register` creates the Supabase Auth identity and sends a confirmation email.
2. `/auth/callback` exchanges the one-time PKCE code for a cookie-backed session.
3. `/login` authenticates with email and password and accepts only safe local `next` paths.
4. `src/proxy.ts` refreshes session cookies and redirects unauthenticated requests.
5. The protected `(app)` layout verifies the user again with `auth.getUser()` before rendering.
6. The header sign-out button revokes the browser session and returns to `/login`.
7. Password recovery sends a Supabase recovery link to `/reset-password`; changing the password signs out the recovery session.

The Proxy check improves navigation behavior but is not the data-authorization boundary. Database RLS remains responsible for per-user project isolation.

Institutional SSO/CAC remains disabled until an identity provider and its Supabase provider configuration are supplied.
