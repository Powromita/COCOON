import React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../../theme";

interface AppCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** Highlights the card edge, e.g. for the backend-recommended candidate. */
  emphasis?: "none" | "accent" | "demo";
  style?: StyleProp<ViewStyle>;
}

/** Flat bordered surface — the basic container for grouped content. */
export function AppCard({ children, onPress, onLongPress, accessibilityLabel, emphasis = "none", style }: AppCardProps) {
  const { colors, radii, spacing } = useTheme();
  const borderColor = emphasis === "accent" ? colors.accent : emphasis === "demo" ? colors.statusDemo : colors.border;
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor,
    borderWidth: emphasis === "none" ? 1 : 1.5,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  };

  if (!onPress && !onLongPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}
