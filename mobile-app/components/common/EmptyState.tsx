import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";

interface EmptyStateProps {
  title: string;
  message?: string;
  children?: React.ReactNode;
}

export function EmptyState({ title, message, children }: EmptyStateProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.xs }]}>
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, textAlign: "center", marginBottom: spacing.lg },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
