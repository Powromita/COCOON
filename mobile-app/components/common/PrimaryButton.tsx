import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { minTouchTarget } from "../../theme/spacing";
import { useTheme } from "../../theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  const { colors, radii, spacing, typography } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: disabled ? colors.border : colors.primary,
          borderRadius: radii.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[typography.bodyStrong, { color: colors.primaryText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});
