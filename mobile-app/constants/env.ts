/**
 * Central place that reads build-time environment configuration.
 *
 * All user-facing services use the COCOON API provider. The API address is
 * configurable per development device or deployment environment.
 *
 * EXPO_PUBLIC_* variables are inlined into the JS bundle at build time, so
 * nothing secret may ever be put in one.
 */

import { Platform } from "react-native";

export type DataProvider = "api" | "fixture";
export type AppEnvironment = "development" | "staging" | "production";

function readAppEnv(): AppEnvironment {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  return raw === "staging" || raw === "production" ? raw : "development";
}

/** Trailing slashes are stripped so paths can always be appended as "/api/...". */
function readApiUrl(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  const fallback = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
  return (raw || fallback).replace(/\/+$/, "");
}

function readTimeoutMs(): number {
  const n = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

// User-facing builds always use real service responses. Recorded fixtures remain
// available to tests through direct service construction, never as app data.
export const DATA_PROVIDER: DataProvider = "api";
export const IS_FIXTURE_MODE = false;
export const APP_ENV: AppEnvironment = readAppEnv();
export const API_URL: string | undefined = readApiUrl();
export const API_TIMEOUT_MS: number = readTimeoutMs();

/** Request logging is development-only and never includes bodies or headers. */
export const LOG_REQUESTS = APP_ENV === "development";
