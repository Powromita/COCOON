import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";
import { PrimaryButton } from "./PrimaryButton";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.xs }]}>
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.textSecondary, textAlign: "center", marginBottom: spacing.lg },
        ]}
      >
        {message}
      </Text>
      {onRetry ? <PrimaryButton label="Retry" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
