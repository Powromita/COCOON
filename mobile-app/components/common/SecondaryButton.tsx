import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { minTouchTarget } from "../../theme/spacing";
import { useTheme } from "../../theme";

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function SecondaryButton({ label, onPress, disabled }: SecondaryButtonProps) {
  const { colors, radii, spacing, typography } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: colors.primary,
          borderRadius: radii.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          opacity: pressed ? 0.7 : disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[typography.bodyStrong, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
});
