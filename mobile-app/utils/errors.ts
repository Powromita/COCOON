/**
 * Shared error types. Every service throws either an AppError (normalized,
 * user-presentable) or one of the fixture errors below, so screens render
 * one consistent ErrorView regardless of which provider failed.
 */
import type { ErrorCode } from "@cocoon/contracts";

export type AppErrorKind =
  | "offline"
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limited"
  | "server"
  | "unavailable"
  | "malformed"
  /** The backend has no endpoint for this yet — distinct from a 404 for a missing record. */
  | "not_supported"
  | "not_configured"
  | "fixture_missing";

export interface AppErrorInit {
  kind: AppErrorKind;
  /** Developer-facing detail — shown only in the collapsible "Details" of an ErrorView. */
  message: string;
  status?: number;
  /** M0 ErrorEnvelope code, when the backend sent one. */
  code?: ErrorCode | string;
  traceId?: string;
  retryable?: boolean;
  /** The backend's own human-readable message (M0 ErrorDetail.message), when present. */
  backendMessage?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly traceId?: string;
  readonly retryable: boolean;
  readonly backendMessage?: string;
  readonly details?: Record<string, unknown>;

  constructor(init: AppErrorInit) {
    super(init.message);
    this.name = "AppError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.traceId = init.traceId;
    this.retryable = init.retryable ?? DEFAULT_RETRYABLE[init.kind];
    this.backendMessage = init.backendMessage;
    this.details = init.details;
  }
}

const DEFAULT_RETRYABLE: Record<AppErrorKind, boolean> = {
  offline: true,
  network: true,
  timeout: true,
  unauthorized: false,
  forbidden: false,
  not_found: false,
  conflict: false,
  validation: false,
  rate_limited: true,
  server: true,
  unavailable: true,
  malformed: false,
  not_supported: false,
  not_configured: false,
  fixture_missing: false,
};

const TITLES: Record<AppErrorKind, string> = {
  offline: "You're offline",
  network: "Unable to connect to COCOON backend",
  timeout: "The server took too long to respond",
  unauthorized: "Sign-in required",
  forbidden: "Access denied",
  not_found: "Not found",
  conflict: "Not ready yet",
  validation: "The server rejected this request",
  rate_limited: "Too many requests",
  server: "COCOON server error",
  unavailable: "Service unavailable",
  malformed: "Unexpected server response",
  not_supported: "Not available on this backend yet",
  not_configured: "Backend not configured",
  fixture_missing: "Data not available",
};

const HINTS: Record<AppErrorKind, string> = {
  offline: "New calculations need a connection. Saved projects and cached results are still available.",
  network: "Check the connection and try again. Your saved results are still available offline.",
  timeout: "Try again in a moment.",
  unauthorized: "Your session has expired or you are not signed in.",
  forbidden: "Your account does not have permission for this action.",
  not_found: "The requested item no longer exists on the server.",
  conflict: "The server says this item is not in the right state for this request yet.",
  validation: "Review the inputs and try again.",
  rate_limited: "Wait a moment and try again.",
  server: "The COCOON backend reported an internal error. Try again later.",
  unavailable: "This part of COCOON is currently unavailable on the server.",
  malformed: "The server sent data this app could not read.",
  not_supported: "The connected COCOON backend does not provide this feature yet.",
  not_configured: "Set EXPO_PUBLIC_API_URL, or use EXPO_PUBLIC_DATA_PROVIDER=fixture for demo data.",
  fixture_missing: "There is no demo data for this item.",
};

/** The error class the user sees as a tag — every API error falls in exactly one. */
export type ErrorCategory =
  | "NETWORK ERROR"
  | "BACKEND ERROR"
  | "VALIDATION ERROR"
  | "PIPELINE FAILURE"
  | "AUTHENTICATION ERROR"
  | "NOT AVAILABLE"
  | "LOCAL STORAGE"
  | "APP ERROR";

const CATEGORY: Record<AppErrorKind, ErrorCategory> = {
  offline: "NETWORK ERROR",
  network: "NETWORK ERROR",
  timeout: "NETWORK ERROR",
  unauthorized: "AUTHENTICATION ERROR",
  forbidden: "AUTHENTICATION ERROR",
  not_found: "BACKEND ERROR",
  conflict: "VALIDATION ERROR",
  validation: "VALIDATION ERROR",
  rate_limited: "BACKEND ERROR",
  server: "BACKEND ERROR",
  unavailable: "BACKEND ERROR",
  malformed: "BACKEND ERROR",
  not_supported: "NOT AVAILABLE",
  not_configured: "NOT AVAILABLE",
  fixture_missing: "NOT AVAILABLE",
};

/**
 * A generation job the backend reports as failed. Its message is the
 * backend's own (M0 ErrorDetail) and is always shown to the user.
 */
export class PipelineFailure extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "PipelineFailure";
  }
}

export interface UserFacingError {
  category: ErrorCategory;
  title: string;
  message: string;
  retryable: boolean;
  /** Technical detail for the collapsible section — never a stack trace. */
  detail?: string;
}

/** Turns anything thrown into text safe to show a user. Never exposes stack traces. */
export function toUserFacingError(error: unknown): UserFacingError {
  if (error instanceof AppError) {
    const detailParts = [
      error.status ? `HTTP ${error.status}` : undefined,
      error.code,
      error.traceId ? `trace ${error.traceId}` : undefined,
    ].filter(Boolean);
    return {
      category: CATEGORY[error.kind],
      title: TITLES[error.kind],
      // Backend validation messages (e.g. M2's infeasible-requirements text) are written for users.
      message: error.backendMessage && error.kind === "validation" ? error.backendMessage : HINTS[error.kind],
      retryable: error.retryable,
      detail: [detailParts.join(" · "), error.backendMessage && error.kind !== "validation" ? error.backendMessage : undefined]
        .filter(Boolean)
        .join("\n") || undefined,
    };
  }
  if (error instanceof PipelineFailure) {
    return { category: "PIPELINE FAILURE", title: "Design generation failed", message: error.message, retryable: false, detail: error.code };
  }
  if (error instanceof FixtureNotFoundError || error instanceof InvalidFixtureError) {
    return { category: "NOT AVAILABLE", title: TITLES.fixture_missing, message: error.message, retryable: false };
  }
  // database/DbDriver.ts errors (matched by name to keep this module dependency-free).
  if (error instanceof Error && (error.name === "DbOpenError" || error.name === "DbUnavailableOnWebError")) {
    return {
      category: "LOCAL STORAGE",
      title: "Local storage unavailable",
      message:
        error.name === "DbUnavailableOnWebError"
          ? "Saved projects are only available in the mobile app."
          : "Saved projects could not be opened on this device. Try again; if it keeps failing, restart the app.",
      retryable: error.name === "DbOpenError",
      detail: error.message,
    };
  }
  if (error instanceof BackendNotConfiguredError) {
    return { category: "NOT AVAILABLE", title: TITLES.not_configured, message: HINTS.not_configured, retryable: false, detail: error.message };
  }
  return {
    category: "APP ERROR",
    title: "Unexpected app error",
    // Show the actual message — more useful than a generic line. Never a stack trace.
    message: error instanceof Error && error.message ? error.message : "An unexpected error occurred.",
    retryable: true,
  };
}

export function isAppErrorKind(error: unknown, ...kinds: AppErrorKind[]): error is AppError {
  return error instanceof AppError && kinds.includes(error.kind);
}

/** Thrown when EXPO_PUBLIC_DATA_PROVIDER=api but EXPO_PUBLIC_API_URL is not set. */
export class BackendNotConfiguredError extends Error {
  constructor(serviceName: string) {
    super(`${serviceName} needs EXPO_PUBLIC_API_URL — the COCOON backend URL is not configured.`);
    this.name = "BackendNotConfiguredError";
  }
}

/** Thrown by fixture services when no fixture exists for a requested id. */
export class FixtureNotFoundError extends Error {
  constructor(fixtureName: string, id?: string) {
    super(
      id
        ? `No demo fixture named "${fixtureName}" is available for id "${id}".`
        : `No demo fixture named "${fixtureName}" is available.`
    );
    this.name = "FixtureNotFoundError";
  }
}

/**
 * Thrown by the fixture runtime guard (mocks/fixtureRegistry.ts) when a
 * fixture file exists but fails a minimal structural/schema-version check.
 */
export class InvalidFixtureError extends Error {
  constructor(fixtureName: string, reason: string) {
    super(`Fixture "${fixtureName}" failed validation: ${reason}`);
    this.name = "InvalidFixtureError";
  }
}
