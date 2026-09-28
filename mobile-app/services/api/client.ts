/**
 * ApiClient — the only module that calls fetch() against the COCOON backend.
 *
 * - Base URL comes from EXPO_PUBLIC_API_URL (constants/env.ts); nothing is
 *   hardcoded, so a production build can never silently hit localhost.
 * - Every failure becomes an AppError (utils/errors.ts): M0 ErrorEnvelope
 *   bodies, FastAPI's own {"detail": ...} bodies, timeouts, network
 *   failures and unparseable JSON are all normalized here.
 * - Development builds log method, path, status and duration only — never
 *   headers or bodies.
 */
import type { ErrorEnvelope } from "@cocoon/contracts";

import { API_TIMEOUT_MS, API_URL, LOG_REQUESTS } from "../../constants/env";
import { AppError, type AppErrorKind } from "../../utils/errors";

export type TokenProvider = () => Promise<string | null>;

export interface RequestOptions {
  /** Sent as the Idempotency-Key header (the backend honours it on POST /optimizations and /economics). */
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function kindForStatus(status: number): AppErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  return "server";
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string";
}

/** FastAPI HTTPException bodies are {"detail": string | object}; ANSYS routes put {error, error_reason} inside. */
function detailMessage(body: unknown): string | undefined {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const parts = [d.error, d.error_reason, d.detail].filter((v): v is string => typeof v === "string");
    if (parts.length > 0) return parts.join(" — ");
    if (Array.isArray(detail)) {
      // FastAPI request-validation errors: [{loc, msg, type}]
      const msgs = (detail as { msg?: unknown }[]).map((e) => e.msg).filter((m): m is string => typeof m === "string");
      if (msgs.length > 0) return msgs.join("; ");
    }
  }
  return undefined;
}

export function errorFromResponse(status: number, body: unknown): AppError {
  if (isErrorEnvelope(body)) {
    const e = body.error;
    return new AppError({
      kind: kindForStatus(status),
      message: `HTTP ${status}: ${e.message}`,
      status,
      code: e.code,
      traceId: e.trace_id,
      retryable: e.retryable,
      backendMessage: e.message,
      details: e.details,
    });
  }
  const message = detailMessage(body);
  return new AppError({ kind: kindForStatus(status), message: `HTTP ${status}${message ? `: ${message}` : ""}`, status, backendMessage: message });
}

export class ApiClient {
  private readonly baseUrl: string | undefined;

  constructor(
    baseUrl: string | undefined = API_URL,
    private readonly tokenProvider?: TokenProvider,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)
  ) {
    // Paths always start with "/", so a trailing slash here would produce "//api/...".
    this.baseUrl = baseUrl?.replace(/\/+$/, "") || undefined;
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new AppError({ kind: "not_configured", message: "EXPO_PUBLIC_API_URL is not set." });
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    const token = this.tokenProvider ? await this.tokenProvider() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onOuterAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onOuterAbort);

    const started = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      if (timedOut) {
        throw new AppError({ kind: "timeout", message: `${method} ${path} timed out after ${timeoutMs} ms` });
      }
      throw new AppError({
        kind: "network",
        message: `${method} ${path} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (LOG_REQUESTS) {
      console.log(`[api] ${method} ${path} → ${response.status} (${Date.now() - started} ms)`);
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (response.ok) {
          throw new AppError({ kind: "malformed", message: `${method} ${path} returned non-JSON content`, status: response.status });
        }
      }
    }

    if (!response.ok) throw errorFromResponse(response.status, parsed);
    if (parsed === undefined) {
      throw new AppError({ kind: "malformed", message: `${method} ${path} returned an empty body`, status: response.status });
    }
    return parsed as T;
  }
}
