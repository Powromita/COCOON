import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
}

interface ChartCardProps {
  title: string;
  caption?: string;
  legend?: LegendItem[];
  /** Screen-reader summary of what the chart shows. */
  summary: string;
  empty?: string | null;
  children?: React.ReactNode;
}

/** Frame for every chart: title, legend (text, not color alone), a text summary, and an empty state. */
export function ChartCard({ title, caption, legend, summary, empty, children }: ChartCardProps) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md }]}>
      <Text accessibilityRole="header" style={[typography.bodyStrong, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {caption ? <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>{caption}</Text> : null}
      {empty ? (
        <Text style={[typography.body, { color: colors.textSecondary, paddingVertical: spacing.lg }]}>{empty}</Text>
      ) : (
        <View accessible accessibilityLabel={summary}>
          {children}
        </View>
      )}
      {!empty && legend && legend.length > 0 ? (
        <View style={[styles.legend, { marginTop: spacing.sm }]}>
          {legend.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: item.dashed ? "transparent" : item.color, borderColor: item.color, borderStyle: item.dashed ? "dashed" : "solid" }]} />
              <Text style={[typography.caption, { color: colors.textPrimary }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 14, height: 4, borderWidth: 1.5 },
});
