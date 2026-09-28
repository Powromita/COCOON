import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { minTouchTarget } from "../../theme/spacing";
import { useTheme } from "../../theme";

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  helperText?: string;
  /** Show "✓ Valid" when the field has a value and no error. */
  showValid?: boolean;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words";
  secureTextEntry?: boolean;
}

export function TextField({
  label,
  value,
  onChangeText,
  error,
  helperText,
  required,
  multiline,
  placeholder,
  maxLength,
  autoCapitalize,
  secureTextEntry,
  showValid,
}: TextFieldProps) {
  const { colors, radii, spacing, typography } = useTheme();

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        {label.toUpperCase()}
        {required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        accessibilityLabel={`${label}${required ? ", required" : ""}`}
        accessibilityHint={error ?? helperText}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radii.sm,
            padding: spacing.md,
            minHeight: multiline ? 96 : minTouchTarget,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
      />
      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : showValid && value.trim() !== "" ? (
        <Text style={[typography.caption, { color: colors.statusReady, marginTop: spacing.xs }]}>
          ✓ Valid{helperText ? ` · ${helperText}` : ""}
        </Text>
      ) : helperText ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1.5 },
});
