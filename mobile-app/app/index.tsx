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
import { Tag } from "../components/common/Tag";
import { API_URL, IS_FIXTURE_MODE } from "../constants/env";
import { getDb } from "../database";
import { useCapabilities } from "../hooks/useCocoon";
import { useAppStore } from "../store/app.store";
import { useTheme } from "../theme";
import { isAppErrorKind } from "../utils/errors";

type StartupState = "loading" | "ready" | "offline" | "backend_unavailable" | "not_configured" | "auth_required" | "storage_error";

const STATE_COPY: Record<StartupState, { label: string; message: string }> = {
  loading: { label: "Opening COCOON", message: "Preparing your workspace…" },
  ready: { label: "Ready", message: "Your workspace is ready." },
  offline: { label: "Try again", message: "We couldn’t load the design service. Check your connection, then try again." },
  backend_unavailable: {
    label: "Try again",
    message: "We couldn’t load the design service. Please try again in a moment.",
  },
  not_configured: {
    label: "Setup required",
    message: "COCOON needs a design service address before it can calculate results.",
  },
  auth_required: { label: "Sign in", message: "Sign in to continue to your workspace." },
  storage_error: { label: "Try again", message: "We couldn’t open your saved workspace." },
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
          <Tag label={copy.label} tone={state === "loading" ? "neutral" : state === "ready" ? "ready" : "warning"} />
        </View>
        <Text style={[typography.body, { color: colors.textPrimary, marginTop: spacing.sm }]}>{copy.message}</Text>
      </View>

      {db.isError ? <ErrorView error={db.error} onRetry={() => void db.refetch()} /> : null}
      {state === "offline" || state === "backend_unavailable" || state === "not_configured" ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {state !== "not_configured" ? <PrimaryButton label="Retry" onPress={() => void caps.refetch()} /> : null}
          <SecondaryButton label="Open saved projects" onPress={() => router.replace("/(tabs)/projects")} />
        </View>
      ) : null}

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  status: { borderWidth: 1, borderRadius: 6 },
});
