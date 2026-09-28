/**
 * COCOON app header: brand, platform line, and a solver status indicator
 * taken from the capabilities service — never assumed. Secondary details
 * (provider, backend, schema, check time) sit behind a tap so small screens
 * stay uncluttered.
 */
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL, IS_FIXTURE_MODE } from "../../constants/env";
import { useCapabilities } from "../../hooks/useCocoon";
import { useT } from "../../i18n";
import { capabilityStatus } from "../../services/interfaces/CapabilitiesService";
import { useAppStore } from "../../store/app.store";
import { useTheme } from "../../theme";
import { minTouchTarget } from "../../theme/spacing";
import { formatLocalDateTime } from "../../utils/format";
import { KeyValueRow } from "../common/KeyValueRow";

type SolverState = "ready" | "demo" | "offline" | "unavailable" | "checking";

export function useSolverState(): SolverState {
  const caps = useCapabilities();
  const isOnline = useAppStore((s) => s.isOnline);
  if (isOnline === false) return "offline";
  if (IS_FIXTURE_MODE) return "demo";
  if (caps.isError) return "unavailable";
  if (!caps.data) return "checking";
  return capabilityStatus(caps.data, "physics_engine") === "AVAILABLE" ? "ready" : "unavailable";
}

const LABEL: Record<SolverState, string> = {
  ready: "SOLVER ENGINE READY",
  demo: "DEMO MODE",
  offline: "OFFLINE",
  unavailable: "SOLVER OFFLINE",
  checking: "CHECKING…",
};

export function AppHeader({ title }: { title: string }) {
  const { colors, radii, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const caps = useCapabilities();
  const state = useSolverState();
  const [open, setOpen] = useState(false);

  const dot = {
    ready: colors.statusReady,
    demo: colors.amber,
    offline: colors.textSecondary,
    unavailable: colors.danger,
    checking: colors.borderStrong,
  }[state];

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + spacing.sm, backgroundColor: colors.surface, borderColor: colors.border, paddingHorizontal: spacing.lg },
      ]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.monoStrong, { color: colors.primary, letterSpacing: 2, fontSize: 16 }]} accessibilityRole="header">
            COCOON
          </Text>
          <Text style={[typography.monoSmall, { color: colors.textSecondary }]}>{t("MIL-SPEC Thermal Platform")}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t(LABEL[state])}. ${open ? "Hide" : "Show"} system details`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={[
            styles.status,
            { borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: spacing.md, minHeight: minTouchTarget - 8 },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text style={[typography.monoSmall, { color: colors.textBody }]} numberOfLines={1}>
            {t(LABEL[state])}
          </Text>
        </Pressable>
      </View>
      {open ? (
        <View style={{ marginTop: spacing.sm }}>
          <KeyValueRow label="Data" value={IS_FIXTURE_MODE ? "Demo fixtures (recorded run)" : "COCOON backend"} />
          <KeyValueRow label="Backend" value={IS_FIXTURE_MODE ? "Not contacted" : API_URL ?? "Not configured"} mono />
          <KeyValueRow label="Schema" value={caps.data?.schemaVersions.join(", ")} mono />
          <KeyValueRow label="Checked" value={caps.data ? formatLocalDateTime(caps.data.checkedAt) : undefined} mono last />
        </View>
      ) : null}
      <Text style={[typography.title, { color: colors.textPrimary, marginTop: spacing.sm }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  status: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
