import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";

export type BannerTone = "info" | "warning";

interface InfoBannerProps {
  title: string;
  message?: string;
  tone?: BannerTone;
}

export function InfoBanner({ title, message, tone = "info" }: InfoBannerProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const [fg, bg] =
    tone === "warning"
      ? [colors.statusWarning, colors.statusWarningBg]
      : [colors.statusInfo, colors.statusInfoBg];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bg, borderRadius: radii.md, padding: spacing.md },
      ]}
    >
      <Text style={[typography.bodyStrong, { color: fg }]}>{title}</Text>
      {message ? (
        <Text style={[typography.caption, { color: fg, marginTop: spacing.xs / 2 }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
});
