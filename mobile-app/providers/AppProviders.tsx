import NetInfo from "@react-native-community/netinfo";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { getMetaRepository } from "../database";
import { isLanguage, LANGUAGE_KEY } from "../i18n";
import { useAppStore } from "../store/app.store";
import { processSyncQueue } from "../sync/queue";
import { ThemeProvider } from "../theme";
import type { TemperatureUnit } from "../utils/format";

export const TEMPERATURE_UNIT_KEY = "pref.temperature_unit";

/**
 * Connectivity: NetInfo feeds both the Zustand store (for the Offline
 * banner) and React Query's onlineManager (so queries pause offline and
 * refetch on reconnect). Reconnecting also replays the sync queue.
 */
function useConnectivity() {
  const setOnline = useAppStore((s) => s.setOnline);
  useEffect(() => {
    let wasOnline: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener((net) => {
      const online = Boolean(net.isConnected) && net.isInternetReachable !== false;
      setOnline(online);
      onlineManager.setOnline(online);
      if (online && wasOnline === false) void processSyncQueue().catch(() => undefined);
      wasOnline = online;
    });
    void processSyncQueue().catch(() => undefined);
    return unsubscribe;
  }, [setOnline]);
}

/** Loads persisted UI preferences (SQLite app_meta) into the store once at startup. */
function usePreferences() {
  const setUnit = useAppStore((s) => s.setTemperatureUnit);
  const setLanguage = useAppStore((s) => s.setLanguage);
  useEffect(() => {
    void (async () => {
      try {
        const meta = await getMetaRepository();
        const unit = await meta.get(TEMPERATURE_UNIT_KEY);
        if (unit === "C" || unit === "F") setUnit(unit as TemperatureUnit);
        const lang = await meta.get(LANGUAGE_KEY);
        if (isLanguage(lang)) setLanguage(lang);
      } catch {
        // Defaults stay in place if storage is unavailable.
      }
    })();
  }, [setUnit, setLanguage]);
}

function AppRuntime({ children }: { children: React.ReactNode }) {
  useConnectivity();
  usePreferences();
  return <>{children}</>;
}

/**
 * Single composition root for cross-cutting app state. `queryClient` is
 * overridable for tests only (e.g. retry: 0).
 */
export function AppProviders({ children, queryClient: override }: { children: React.ReactNode; queryClient?: QueryClient }) {
  const [defaultClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000, networkMode: "offlineFirst" },
          mutations: { networkMode: "offlineFirst" },
        },
      })
  );
  const queryClient = override ?? defaultClient;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <AppRuntime>{children}</AppRuntime>
          </ErrorBoundary>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
