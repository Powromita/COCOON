/**
 * Central place that reads build-time environment configuration.
 *
 * EXPO_PUBLIC_DATA_PROVIDER picks the provider behind every service
 * interface (see services/registry.ts):
 *   "fixture" — recorded backend responses + M0 sample fixtures (default)
 *   "api"     — the FastAPI backend at EXPO_PUBLIC_API_URL
 * The legacy value "mock" is accepted as a synonym for "fixture".
 *
 * EXPO_PUBLIC_* variables are inlined into the JS bundle at build time, so
 * nothing secret may ever be put in one.
 */

export type DataProvider = "fixture" | "api";
export type AppEnvironment = "development" | "staging" | "production";

function readDataProvider(): DataProvider {
  const raw = process.env.EXPO_PUBLIC_DATA_PROVIDER;
  return raw === "api" ? "api" : "fixture";
}

function readAppEnv(): AppEnvironment {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  return raw === "staging" || raw === "production" ? raw : "development";
}

/** Trailing slashes are stripped so paths can always be appended as "/api/...". */
function readApiUrl(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

function readTimeoutMs(): number {
  const n = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

export const DATA_PROVIDER: DataProvider = readDataProvider();
export const IS_FIXTURE_MODE = DATA_PROVIDER === "fixture";
export const APP_ENV: AppEnvironment = readAppEnv();
export const API_URL: string | undefined = readApiUrl();
export const API_TIMEOUT_MS: number = readTimeoutMs();

/** Request logging is development-only and never includes bodies or headers. */
export const LOG_REQUESTS = APP_ENV === "development";
