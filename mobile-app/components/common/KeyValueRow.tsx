import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { NOT_AVAILABLE } from "../../utils/format";
import { useTheme } from "../../theme";

interface KeyValueRowProps {
  label: string;
  value: string | null | undefined;
  /** Monospace for ids and checksums. */
  mono?: boolean;
  last?: boolean;
}

export function KeyValueRow({ label, value, mono, last }: KeyValueRowProps) {
  const { colors, spacing, typography } = useTheme();
  const shown = value ?? NOT_AVAILABLE;
  const missing = shown === NOT_AVAILABLE;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${shown}`}
      style={[
        styles.row,
        { borderColor: colors.border, paddingVertical: spacing.sm, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[typography.caption, { color: colors.textBody, flex: 1 }]}>{label}</Text>
      <Text
        selectable
        style={[
          typography.caption,
          styles.value,
          { color: missing ? colors.textSecondary : colors.textPrimary, fontWeight: missing ? "400" : "600" },
          mono ? [typography.mono, { color: missing ? colors.textSecondary : colors.textPrimary }] : null,
        ]}
      >
        {shown}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  value: { flex: 1.3, textAlign: "right" },
  mono: {},
});
