import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";

export type TagTone = "neutral" | "ready" | "demo" | "warning" | "danger" | "accent" | "info";

/** Small text label. Always carries words, so meaning never depends on color alone. */
export function Tag({ label, tone = "neutral" }: { label: string; tone?: TagTone }) {
  const { colors, radii, spacing, typography } = useTheme();
  const [fg, bg] = {
    neutral: [colors.statusUnavailable, colors.statusUnavailableBg],
    ready: [colors.statusReady, colors.statusReadyBg],
    demo: [colors.statusDemo, colors.statusDemoBg],
    warning: [colors.statusWarning, colors.statusWarningBg],
    danger: [colors.danger, colors.dangerBg],
    accent: [colors.primaryText, colors.accent],
    info: [colors.statusInfo, colors.statusInfoBg],
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 }]}>
      <Text style={[typography.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: "flex-start" },
});
