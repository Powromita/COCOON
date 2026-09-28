import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
