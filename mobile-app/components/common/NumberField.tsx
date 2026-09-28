import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { minTouchTarget } from "../../theme/spacing";
import { useTheme } from "../../theme";

interface NumberFieldProps {
  label: string;
  /** undefined/null = empty field, distinct from 0. */
  value: number | null | undefined;
  onChangeValue: (value: number | undefined) => void;
  unit?: string;
  error?: string;
  helperText?: string;
  /** Show "✓ Valid" when the field has a value and no error. */
  showValid?: boolean;
  required?: boolean;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  placeholder?: string;
  onBlur?: () => void;
}

function parse(text: string): number | undefined {
  if (text === "" || text === "-" || text === "." || text === "-.") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Numeric input that keeps the user's own text while typing ("34.", "-0.")
 * and only reports parsed numbers upward. External value changes (e.g. a
 * loaded draft) replace the text unless it already represents that value.
 */
export function NumberField({
  label,
  value,
  onChangeValue,
  unit,
  error,
  helperText,
  required,
  allowDecimal = true,
  allowNegative = false,
  placeholder,
  onBlur,
  showValid,
}: NumberFieldProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const [text, setText] = useState(value === undefined || value === null ? "" : String(value));
  const lastReported = useRef<number | undefined>(value ?? undefined);

  useEffect(() => {
    const incoming = value ?? undefined;
    if (incoming !== lastReported.current) {
      lastReported.current = incoming;
      setText(incoming === undefined ? "" : String(incoming));
    }
  }, [value]);

  const pattern = new RegExp(`^${allowNegative ? "-?" : ""}\\d*${allowDecimal ? "(\\.\\d*)?" : ""}$`);

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        {label.toUpperCase()}
        {unit ? ` (${unit})` : ""}
        {required ? " *" : ""}
      </Text>
      <TextInput
        accessibilityLabel={`${label}${unit ? ` in ${unit}` : ""}${required ? ", required" : ""}`}
        accessibilityHint={error ?? helperText}
        value={text}
        onChangeText={(raw) => {
          const cleaned = raw.replace(",", ".").replace(/\s/g, "");
          if (!pattern.test(cleaned)) return;
          setText(cleaned);
          const n = parse(cleaned);
          lastReported.current = n;
          onChangeValue(n);
        }}
        onBlur={onBlur}
        keyboardType={allowDecimal ? "decimal-pad" : "number-pad"}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          typography.monoStrong,
          {
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radii.sm,
            padding: spacing.md,
            minHeight: minTouchTarget,
          },
        ]}
      />
      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : showValid && text !== "" ? (
        <Text style={[typography.caption, { color: colors.statusReady, marginTop: spacing.xs }]}>
          ✓ Valid{helperText ? ` · ${helperText}` : ""}
        </Text>
      ) : helperText ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1.5 },
});
