import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./utils/supabase/config";

/**
 * Session refresh + route protection.
 *
 * In Next.js 16 the `middleware` file convention was renamed to `proxy`
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 * The `@supabase/ssr` "middleware" cookie pattern is unchanged — it runs here.
 *
 * Responsibilities:
 *  - Refresh the Supabase session on every matched request (via `getUser()`).
 *  - Redirect unauthenticated users on protected routes to the matching auth page.
 *  - Enforce that a logged-in user's `profiles.role` matches the route group
 *    ("/individual/*" needs role 'individual', "/organization/*" needs 'organization').
 */

type Role = "individual" | "organization";

const PROTECTED: { prefix: string; role: Role; authPath: string }[] = [
  { prefix: "/individual", role: "individual", authPath: "/auth/individual" },
  { prefix: "/organization", role: "organization", authPath: "/auth/organization" },
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getUser() — getUser()
  // revalidates the token and writes the refreshed session cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const target = PROTECTED.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  );

  if (target) {
    if (!user) {
      return redirectPreservingSession(request, response, target.authPath, {
        redirectedFrom: pathname,
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role && profile.role !== target.role) {
      const correct = PROTECTED.find((p) => p.role === profile.role);
      return redirectPreservingSession(
        request,
        response,
        correct ? correct.authPath : "/",
        { error: "wrong_mode" },
      );
    }
  }

  return response;
}

/** Redirect while carrying over any refreshed auth cookies from `base`. */
function redirectPreservingSession(
  request: NextRequest,
  base: NextResponse,
  pathname: string,
  params: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = NextResponse.redirect(url);
  base.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
  return res;
}

export const config = {
  matcher: [
    "/individual",
    "/individual/:path*",
    "/organization",
    "/organization/:path*",
  ],
};
