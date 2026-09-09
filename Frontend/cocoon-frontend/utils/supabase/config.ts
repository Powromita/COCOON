/**
 * Supabase connection values, read from the public env vars.
 *
 * `@supabase/supabase-js` (and `@supabase/ssr`) expect the *bare* project URL
 * — e.g. `https://xxxx.supabase.co` — and append `/auth/v1`, `/rest/v1`, etc.
 * themselves. `.env.local` currently sets `NEXT_PUBLIC_SUPABASE_URL` with a
 * trailing `/rest/v1/`, which would send auth calls to `/rest/v1/auth/v1/*`.
 * We strip any trailing REST/auth path (and slashes) here so both work.
 */
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_URL = rawUrl
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/(rest|auth)\/v1$/, "")
  .replace(/\/+$/, "");

export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — auth will not work.",
  );
}
