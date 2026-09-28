/**
 * Startup. Checks, in order: local database, API configuration, backend
 * capabilities (API mode), authentication. Every outcome has a visible
 * state — never a blank screen — and the user is routed on once ready.
 */
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { readAccessToken } from "../auth/tokenStore";
import { ErrorView } from "../components/common/ErrorView";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { ScreenContainer } from "../components/common/ScreenContainer";
import { SecondaryButton } from "../components/common/SecondaryButton";
import { Tag, type TagTone } from "../components/common/Tag";
import { API_URL, APP_ENV, DATA_PROVIDER, IS_FIXTURE_MODE } from "../constants/env";
import { getDb } from "../database";
import { useCapabilities } from "../hooks/useCocoon";
import { useAppStore } from "../store/app.store";
import { useTheme } from "../theme";
import { isAppErrorKind } from "../utils/errors";

type StartupState = "loading" | "ready" | "offline" | "backend_unavailable" | "not_configured" | "auth_required" | "storage_error";

const STATE_COPY: Record<StartupState, { label: string; tone: TagTone; message: string }> = {
  loading: { label: "Loading", tone: "neutral", message: "Checking the app and the COCOON backend…" },
  ready: { label: "Ready", tone: "ready", message: "All checks passed." },
  offline: { label: "Offline", tone: "warning", message: "No connection. Saved projects and cached results are available." },
  backend_unavailable: {
    label: "Backend unavailable",
    tone: "danger",
    message: "The COCOON server could not be reached. Saved projects and cached results are still available.",
  },
  not_configured: {
    label: "Backend not configured",
    tone: "danger",
    message: "This build uses the API provider but EXPO_PUBLIC_API_URL is not set.",
  },
  auth_required: { label: "Authentication required", tone: "warning", message: "Sign in to use the COCOON backend." },
  storage_error: { label: "Storage unavailable", tone: "danger", message: "Local storage could not be opened." },
};

export default function StartupScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const isOnline = useAppStore((s) => s.isOnline);

  const db = useQuery({ queryKey: ["startup", "db"], queryFn: async () => (await getDb(), true), retry: 0 });
  const configured = IS_FIXTURE_MODE || Boolean(API_URL);
  const caps = useCapabilities();
  const auth = useQuery({
    queryKey: ["startup", "auth", caps.data?.authMode],
    queryFn: async () => {
      const mode = caps.data?.authMode;
      if (!mode || mode === "disabled") return "not_required" as const;
      return (await readAccessToken()) ? ("signed_in" as const) : ("required" as const);
    },
    enabled: Boolean(caps.data),
  });

  let state: StartupState = "loading";
  if (db.isError) state = "storage_error";
  else if (!configured) state = "not_configured";
  else if (caps.isError) state = isOnline === false || isAppErrorKind(caps.error, "offline") ? "offline" : "backend_unavailable";
  else if (auth.data === "required") state = "auth_required";
  else if (db.data && caps.data && auth.data) state = "ready";

  useEffect(() => {
    if (state === "ready") router.replace("/(tabs)");
    if (state === "auth_required") router.replace("/(auth)/login");
  }, [state, router]);

  const copy = STATE_COPY[state];

  return (
    <ScreenContainer scroll>
      <View style={{ marginTop: spacing.xxl, marginBottom: spacing.xl }}>
        <Text style={[typography.display, { color: colors.textPrimary }]} accessibilityRole="header">
          COCOON
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          Thermal shelter design — DRDO PS 26051
        </Text>
      </View>

      <View style={[styles.status, { borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg }]} accessibilityLiveRegion="polite">
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {state === "loading" ? <ActivityIndicator color={colors.accent} /> : null}
          <Tag label={copy.label} tone={copy.tone} />
        </View>
        <Text style={[typography.body, { color: colors.textPrimary, marginTop: spacing.sm }]}>{copy.message}</Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          {IS_FIXTURE_MODE ? "Data: demo fixtures (no backend)" : `Backend: ${API_URL ?? "not set"}`} · {APP_ENV}
        </Text>
      </View>

      {db.isError ? <ErrorView error={db.error} onRetry={() => void db.refetch()} /> : null}
      {caps.isError && state === "backend_unavailable" ? <ErrorView compact error={caps.error} /> : null}

      {state === "offline" || state === "backend_unavailable" || state === "not_configured" ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {state !== "not_configured" ? <PrimaryButton label="Retry" onPress={() => void caps.refetch()} /> : null}
          <SecondaryButton label="Continue with saved data" onPress={() => router.replace("/(tabs)")} />
        </View>
      ) : null}

      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xl }]}>Provider: {DATA_PROVIDER}</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  status: { borderWidth: 1, borderRadius: 6 },
});
