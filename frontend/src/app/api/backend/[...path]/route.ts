import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: { message: "Session expired" } }, { status: 401 });

  const { path } = await context.params;
  const target = new URL(`/${path.join("/")}`, BACKEND_URL);
  target.search = request.nextUrl.search;
  const response = await fetch(target, {
    method: request.method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
  });
  return new NextResponse(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" } });
}

export const GET = forward;
export const POST = forward;
