import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { NOT_AVAILABLE } from "../../utils/format";
import { useTheme } from "../../theme";

interface MetricCardProps {
  label: string;
  /** Already formatted with its unit (utils/format.ts). */
  value: string;
  caption?: string;
}

/** One labelled value. A missing value renders the standard "Not available yet" in muted text, never 0. */
export function MetricCard({ label, value, caption }: MetricCardProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const missing = value === NOT_AVAILABLE;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${caption ? `. ${caption}` : ""}`}
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
      ]}
    >
      <Text style={[typography.label, { color: colors.textSecondary }]} numberOfLines={2}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={[
          missing ? typography.mono : typography.monoStrong,
          { color: missing ? colors.textSecondary : colors.textPrimary, marginTop: spacing.xs },
        ]}
      >
        {value}
      </Text>
      {caption ? <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{caption}</Text> : null}
    </View>
  );
}

/** Two-column grid that wraps to one column on narrow screens via flexBasis. */
export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, flexGrow: 1, flexBasis: "46%", minWidth: 140 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
});
