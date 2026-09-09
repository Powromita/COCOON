import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Browser-side Supabase client. Safe to call from Client Components; the
 * session is persisted in cookies so the server can read it too.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
