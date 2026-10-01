import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "../../theme";
import { minTouchTarget } from "../../theme/spacing";

interface DangerButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
}

export function DangerButton({ label, onPress, disabled, variant = "outline" }: DangerButtonProps) {
  const { colors, radii, spacing, typography } = useTheme();

  const isOutline = variant === "outline";
  const bg = disabled
    ? colors.surface
    : isOutline
      ? colors.dangerBg
      : colors.danger;
  const fg = disabled ? colors.textSecondary : isOutline ? colors.danger : colors.textInverse;
  const border = disabled ? colors.border : colors.danger;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: radii.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[typography.bodyStrong, { color: fg }]}>{label}</Text>
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
