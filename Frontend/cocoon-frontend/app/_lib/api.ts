/**
 * api.ts — the ONLY module that talks (or will talk) to the pipeline backend.
 *
 * Connection state is one flag:
 *
 *   NEXT_PUBLIC_API_MODE = "mock"  (default)  → returns fixtures, no network
 *   NEXT_PUBLIC_API_MODE = "live"             → hits NEXT_PUBLIC_API_BASE_URL
 *
 * The backend contract (implement these routes to go live):
 *
 *   POST /api/run                 body: RunRequest         → { run_id }
 *   GET  /api/run/:id/status                                → PipelineStatus
 *   GET  /api/run/:id/results                               → RunResults
 *   GET  /api/reference                                     → ReferenceData
 *   GET  /api/run/:id/artifact/*path                        → binary (png/csv/md)
 *
 * No component imports fetch/axios directly — they call these functions.
 */

import { MOCK_REFERENCE, MOCK_RESULTS, MOCK_STATUS_SEQUENCE } from "./fixtures";
import type {
  PipelineStatus,
  ReferenceData,
  RunRequest,
  RunResults,
} from "./types";

export const API_MODE = (process.env.NEXT_PUBLIC_API_MODE ?? "mock") as
  | "mock"
  | "live";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const IS_MOCK = API_MODE !== "live";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(`${init?.method ?? "GET"} ${path} → ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

// ---- module-scoped store for the in-flight run request --------------------
// (survives client-side navigation configure → results without a backend)

const REQUEST_KEY = "cocoon.runRequest";

export function stashRequest(req: RunRequest): void {
  try {
    sessionStorage.setItem(REQUEST_KEY, JSON.stringify(req));
  } catch {
    /* ignore */
  }
}

export function readStashedRequest(): RunRequest | null {
  try {
    const raw = sessionStorage.getItem(REQUEST_KEY);
    return raw ? (JSON.parse(raw) as RunRequest) : null;
  } catch {
    return null;
  }
}

// ---- endpoints ---------------------------------------------------------

export async function getReference(): Promise<ReferenceData> {
  if (IS_MOCK) return MOCK_REFERENCE;
  return json<ReferenceData>("/api/reference");
}

export async function startRun(req: RunRequest): Promise<{ run_id: string }> {
  if (IS_MOCK) {
    await sleep(150);
    return { run_id: MOCK_RESULTS.run_id };
  }
  return json<{ run_id: string }>("/api/run", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getStatus(
  runId: string,
  mockStep = 0,
): Promise<PipelineStatus> {
  if (IS_MOCK) {
    await sleep(600);
    const seq = MOCK_STATUS_SEQUENCE;
    return seq[Math.min(mockStep, seq.length - 1)];
  }
  return json<PipelineStatus>(`/api/run/${runId}/status`);
}

export async function getResults(runId: string): Promise<RunResults> {
  if (IS_MOCK) {
    await sleep(200);
    return MOCK_RESULTS;
  }
  return json<RunResults>(`/api/run/${runId}/results`);
}

export function artifactUrl(runId: string, path: string): string {
  if (IS_MOCK) return "#mock";
  return `${API_BASE_URL}/api/run/${runId}/artifact/${path.replace(/^\/+/, "")}`;
}
