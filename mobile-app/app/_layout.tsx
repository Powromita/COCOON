import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { RootErrorFallback } from "../components/common/RootErrorFallback";
import { JobMonitorErrorBanner, OfflineBanner } from "../components/common/StatusBanners";
import { useJobMonitor } from "../hooks/useJobMonitor";
import { AppProviders } from "../providers/AppProviders";
import { useTheme } from "../theme";

/**
 * Root-level ErrorBoundary (expo-router convention): wraps everything,
 * including AppProviders, so a failure in a provider still shows a screen.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <RootErrorFallback error={error} retry={retry} />;
}

// Keep the native splash up until the fonts are ready (see RootLayout).
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Longest the app waits for fonts before rendering with platform fonts instead. */
const FONT_TIMEOUT_MS = 3_000;

function RootStack() {
  const { colors } = useTheme();
  useJobMonitor();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <Stack
        // The Offline banner sits inside each screen, below its header. The splash and the tab
        // container are skipped: the splash has its own status UI and each tab adds the banner itself.
        screenLayout={({ route, children }) =>
          route.name === "index" || route.name === "(tabs)" ? (
            children
          ) : (
            <View style={{ flex: 1 }}>
              <OfflineBanner />
              <JobMonitorErrorBanner />
              {children}
            </View>
          )
        }
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ title: "Sign in" }} />
        <Stack.Screen name="(auth)/register" options={{ title: "Register" }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ title: "Forgot password" }} />
        <Stack.Screen name="(auth)/reset-password" options={{ title: "Reset password" }} />
        <Stack.Screen name="project/new" options={{ title: "New project" }} />
        <Stack.Screen name="project/[id]/index" options={{ title: "Project" }} />
        <Stack.Screen name="project/[id]/edit" options={{ title: "Requirements" }} />
        <Stack.Screen name="generation/[jobId]" options={{ title: "Design generation" }} />
        <Stack.Screen name="candidates/[optimizationId]/index" options={{ title: "Candidates" }} />
        <Stack.Screen name="candidates/[optimizationId]/pareto" options={{ title: "Trade-offs" }} />
        <Stack.Screen name="candidates/[optimizationId]/compare" options={{ title: "Compare designs" }} />
        <Stack.Screen name="results/[optimizationId]/[designId]" options={{ title: "Results" }} />
        <Stack.Screen name="dev/m0" options={{ title: "M0 diagnostics" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);
  const ready = fontsLoaded || Boolean(fontError) || timedOut;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;

  return (
    <AppProviders>
      <RootStack />
    </AppProviders>
  );
}
