import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "../../i18n";
import { useTheme } from "../../theme";

/** A quiet, consistent header; connection diagnostics belong in recovery flows. */
export function AppHeader({ title }: { title: string }) {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + spacing.sm, backgroundColor: colors.surface, borderColor: colors.border, paddingHorizontal: spacing.lg },
      ]}
    >
      <Text style={[typography.monoStrong, { color: colors.primary, letterSpacing: 2, fontSize: 16 }]} accessibilityRole="header">
        COCOON
      </Text>
      <Text style={[typography.monoSmall, { color: colors.textSecondary }]}>{t("MIL-SPEC Thermal Platform")}</Text>
      <Text style={[typography.title, { color: colors.textPrimary, marginTop: spacing.sm }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
});
