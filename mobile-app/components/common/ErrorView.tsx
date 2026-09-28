import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { toUserFacingError } from "../../utils/errors";
import { useTheme } from "../../theme";
import { SecondaryButton } from "./SecondaryButton";
import { Tag } from "./Tag";

interface ErrorViewProps {
  error: unknown;
  onRetry?: () => void;
  /** Overrides the derived title, e.g. "Design generation failed". */
  title?: string;
  compact?: boolean;
}

/**
 * Human-readable error for any thrown value (see utils/errors.ts). Technical
 * detail (HTTP status, error code, trace id) sits behind a "Details" toggle;
 * stack traces are never shown.
 */
export function ErrorView({ error, onRetry, title, compact }: ErrorViewProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const [showDetail, setShowDetail] = useState(false);
  const e = toUserFacingError(error);

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.box,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: e.category === "NOT AVAILABLE" ? colors.borderStrong : e.category === "NETWORK ERROR" ? colors.amber : colors.danger,
          borderRadius: radii.md,
          padding: compact ? spacing.md : spacing.lg,
          marginVertical: spacing.sm,
        },
      ]}
    >
      <View style={{ marginBottom: spacing.xs }}>
        <Tag label={e.category} tone={e.category === "NOT AVAILABLE" ? "neutral" : e.category === "NETWORK ERROR" ? "warning" : "danger"} />
      </View>
      <Text style={[typography.subtitle, { color: colors.textPrimary }]}>{title ?? e.title}</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>{e.message}</Text>
      {e.detail ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetail }}
          onPress={() => setShowDetail((v) => !v)}
          style={{ marginTop: spacing.sm, minHeight: 32, justifyContent: "center" }}
        >
          <Text style={[typography.caption, { color: colors.accent }]}>{showDetail ? "Hide details" : "Details"}</Text>
        </Pressable>
      ) : null}
      {showDetail && e.detail ? (
        <Text selectable style={[typography.caption, styles.mono, { color: colors.textSecondary }]}>
          {e.detail}
        </Text>
      ) : null}
      {onRetry && e.retryable ? (
        <View style={{ marginTop: spacing.md }}>
          <SecondaryButton label="Retry" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderLeftWidth: 4 },
  mono: { fontFamily: "JetBrainsMono_400Regular" },
});
