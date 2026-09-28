import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { minTouchTarget } from "../../theme/spacing";
import { useTheme } from "../../theme";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  error?: string;
  required?: boolean;
  /** true = the field is a set of independently-toggleable checkboxes rather than a single choice. */
  multiple?: boolean;
  selectedValues?: T[];
  onToggle?: (value: T) => void;
}

/** A chip-style select — avoids pulling in a picker/dropdown library. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  required,
  multiple,
  selectedValues,
  onToggle,
}: SelectFieldProps<T>) {
  const { colors, radii, spacing, typography } = useTheme();

  const isSelected = (opt: T) => (multiple ? (selectedValues ?? []).includes(opt) : value === opt);

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        {label.toUpperCase()}
        {required ? " *" : ""}
      </Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const selected = isSelected(opt.value);
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => (multiple ? onToggle?.(opt.value) : onChange(opt.value))}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary : colors.surfaceAlt,
                  borderColor: selected ? colors.primary : colors.border,
                  borderRadius: radii.pill,
                  paddingHorizontal: spacing.md,
                  minHeight: minTouchTarget * 0.7,
                },
              ]}
            >
              <Text style={[typography.bodyStrong, { color: selected ? colors.primaryText : colors.textPrimary }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
