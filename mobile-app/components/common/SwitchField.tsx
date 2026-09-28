import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { useTheme } from "../../theme";

interface SwitchFieldProps {
  label: string;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  helperText?: string;
  error?: string;
}

export function SwitchField({ label, value, onChange, helperText, error }: SwitchFieldProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.row}>
        <Text style={[typography.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
        <Switch
          value={value ?? false}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text>
      ) : helperText ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 48 },
});
