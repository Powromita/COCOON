import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { IS_FIXTURE_MODE } from "../../constants/env";
import { useAppStore } from "../../store/app.store";
import type { DataTruthState } from "../../types/dataTruth";
import { getDataTruthCopy } from "../../types/dataTruth";
import { formatLocalDateTime } from "../../utils/format";
import { useTheme } from "../../theme";

/** Shown whenever the device reports no connection. */
export function OfflineBanner() {
  const { colors, spacing, typography } = useTheme();
  const isOnline = useAppStore((s) => s.isOnline);
  if (isOnline !== false) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="Offline. Saved projects and cached results are available; new calculations need a connection."
      style={[styles.bar, { backgroundColor: colors.statusUnavailableBg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }]}
    >
      <Text style={[typography.label, { color: colors.statusUnavailable }]}>OFFLINE</Text>
      <Text style={[typography.caption, { color: colors.statusUnavailable, flex: 1 }]} numberOfLines={2}>
        Saved projects and cached results only — new calculations need a connection.
      </Text>
    </View>
  );
}

/** Shown when an active generation run could not be refreshed from its provider. */
export function JobMonitorErrorBanner() {
  const { colors, spacing, typography } = useTheme();
  const error = useAppStore((s) => s.jobMonitorError);
  if (!error) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`Run status unavailable. ${error}`}
      style={[styles.bar, { backgroundColor: colors.statusWarningBg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }]}
    >
      <Text style={[typography.label, { color: colors.statusWarning }]}>RUN STATUS UNAVAILABLE</Text>
      <Text style={[typography.caption, { color: colors.statusWarning, flex: 1 }]} numberOfLines={2}>
        {error}
      </Text>
    </View>
  );
}

/**
 * The fixture-mode indicator: a small, calm "DEMO DATA" strip (orange, not
 * error red). Renders nothing in API mode.
 */
export function FixtureBanner({ detail }: { detail?: string }) {
  const { colors, radii, spacing, typography } = useTheme();
  if (!IS_FIXTURE_MODE) return null;
  return (
    <View
      accessibilityLabel={`Demo data. ${detail ?? getDataTruthCopy("fixture").message}`}
      style={[
        styles.fixture,
        { backgroundColor: colors.statusDemoBg, borderRadius: radii.sm, padding: spacing.sm, marginBottom: spacing.md },
      ]}
    >
      <Text style={[typography.label, { color: colors.statusDemo }]}>DEMO DATA</Text>
      <Text style={[typography.caption, { color: colors.statusDemo, flex: 1 }]}>
        {detail ?? getDataTruthCopy("fixture").message}
      </Text>
    </View>
  );
}

/** States where a value came from: demo, live, cached (with when), or on-device. */
export function SourceNote({ source, fetchedAt }: { source: DataTruthState; fetchedAt?: string }) {
  const { colors, spacing, typography } = useTheme();
  const copy = getDataTruthCopy(source);
  const color = source === "fixture" || source === "cache" ? colors.statusDemo : colors.textSecondary;
  return (
    <Text style={[typography.caption, { color, marginBottom: spacing.sm }]}>
      {copy.label}
      {source === "cache" && fetchedAt ? ` · fetched ${formatLocalDateTime(fetchedAt)}` : ""}
      {source === "api" && fetchedAt ? ` · ${formatLocalDateTime(fetchedAt)}` : ""}
    </Text>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8 },
  fixture: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
});
