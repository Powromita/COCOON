/**
 * Central place that reads build-time environment configuration.
 *
 * All user-facing services use the COCOON API provider. The API address is
 * configurable per development device or deployment environment.
 *
 * EXPO_PUBLIC_* variables are inlined into the JS bundle at build time, so
 * nothing secret may ever be put in one.
 */
import Constants from "expo-constants";
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
  if (process.env.NODE_ENV === "test") {
    return raw ? raw.replace(/\/+$/, "") : undefined;
  }

  // If raw is an explicit LAN or public IP (e.g. 192.168.x.x or https://), use it directly
  if (raw && !raw.includes("10.0.2.2") && !raw.includes("localhost")) {
    return raw.replace(/\/+$/, "");
  }

  // When running in Expo Go on a physical phone or Wi-Fi network, dynamically
  // resolve the computer's LAN IP from the Expo connection URI:
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ??
      (Constants as any).manifest?.debuggerHost;
    if (hostUri && typeof hostUri === "string") {
      const hostIp = hostUri.split(":")[0];
      if (hostIp && hostIp !== "localhost" && hostIp !== "127.0.0.1") {
        return `http://${hostIp}:8000`;
      }
    }
  } catch {
    // Ignore and fallback
  }

  const fallback = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
  return (raw || fallback).replace(/\/+$/, "");
}

function readTimeoutMs(): number {
  const n = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

export const DATA_PROVIDER: DataProvider =
  process.env.NODE_ENV === "test" && !process.env.EXPO_PUBLIC_DATA_PROVIDER
    ? "fixture"
    : process.env.EXPO_PUBLIC_DATA_PROVIDER === "fixture"
    ? "fixture"
    : "api";
export const IS_FIXTURE_MODE = DATA_PROVIDER === "fixture";
export const APP_ENV: AppEnvironment = readAppEnv();
export const API_URL: string | undefined = readApiUrl();
export const API_TIMEOUT_MS: number = readTimeoutMs();

/** Request logging is development-only and never includes bodies or headers. */
export const LOG_REQUESTS = APP_ENV === "development";
