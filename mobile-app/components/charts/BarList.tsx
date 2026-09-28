import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Already-formatted value with unit. */
  display: string;
}

/**
 * Horizontal bars as plain Views: readable on narrow screens, every bar
 * labelled with its value, zero-based so lengths compare honestly.
 */
export function BarList({ rows, color, highlightKey, highlightColor }: { rows: BarRow[]; color?: string; highlightKey?: string; highlightColor?: string }) {
  const { colors, radii, spacing, typography } = useTheme();
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.value)));
  return (
    <View>
      {rows.map((r) => {
        const pct = max > 0 ? (Math.abs(r.value) / max) * 100 : 0;
        return (
          <View key={r.key} style={{ marginBottom: spacing.sm }} accessible accessibilityLabel={`${r.label}: ${r.display}`}>
            <View style={styles.labels}>
              <Text style={[typography.caption, { color: colors.textPrimary, flex: 1 }]} numberOfLines={2}>
                {r.label}
              </Text>
              <Text style={[typography.caption, { color: colors.textPrimary, fontWeight: "600" }]}>{r.display}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm }]}>
              <View
                style={{
                  width: `${pct}%`,
                  height: 8,
                  backgroundColor: r.key === highlightKey ? highlightColor ?? colors.amber : color ?? colors.chart[0],
                  borderRadius: radii.sm,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", gap: 8, marginBottom: 2 },
  track: { height: 8, overflow: "hidden" },
});
