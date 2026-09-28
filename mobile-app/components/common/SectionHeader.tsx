import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../theme";

interface SectionHeaderProps {
  title: string;
  caption?: string;
  right?: React.ReactNode;
}

export function SectionHeader({ title, caption, right }: SectionHeaderProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.row, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
      <View style={styles.text}>
        <Text accessibilityRole="header" style={[typography.label, { color: colors.textSecondary }]}>
          {title.toUpperCase()}
        </Text>
        {caption ? <Text style={[typography.caption, { color: colors.textSecondary }]}>{caption}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  text: { flex: 1 },
});
