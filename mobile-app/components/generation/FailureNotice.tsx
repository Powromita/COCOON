/**
 * One categorised failure (see adapters/templates.ts explainFailure): invalid
 * input points at the field, template / physical problems at the step that
 * can fix them, "no feasible candidates" lists M2's real rejection tally, and
 * service failures say it was not the user's fault and offer a retry with the
 * reference ID. Backend technical detail is never shown here.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { explainFailure, rejectionLines, type FailureExplanation } from "../../adapters/templates";
import type { GenerationSummary } from "../../types/backend";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../common/PrimaryButton";
import { SecondaryButton } from "../common/SecondaryButton";

interface FailureNoticeProps {
  error: { message: string; code?: string; retryable?: boolean; details?: Record<string, unknown>; traceId?: string };
  /** M2's generation tally, when the job got that far. */
  generation?: GenerationSummary;
  onEdit?: (explanation: FailureExplanation) => void;
  onRetry?: () => void;
  retrying?: boolean;
}

export function FailureNotice({ error, generation, onEdit, onRetry, retrying }: FailureNoticeProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const ex = explainFailure(error);
  const reasons = (error.details?.reasons as Record<string, number> | undefined) ?? generation?.rejection_reasons;
  const attempts = (error.details?.attempts as number | undefined) ?? generation?.attempts;
  const lines = ex.category === "no_feasible_candidates" ? rejectionLines(reasons).slice(0, 5) : [];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, { borderColor: colors.border, borderLeftColor: ex.action === "retry" ? colors.amber : colors.danger, borderRadius: radii.md, padding: spacing.lg, backgroundColor: colors.surface }]}
    >
      <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.xs }]}>{ex.title}</Text>
      <Text style={[typography.body, { color: colors.textSecondary }]}>{ex.message}</Text>
      {lines.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          {typeof attempts === "number" ? (
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{attempts} layouts were tried. Rejected because:</Text>
          ) : null}
          {lines.map((line) => (
            <Text key={line} style={[typography.caption, { color: colors.textPrimary }]}>
              • {line}
            </Text>
          ))}
        </View>
      ) : null}
      {ex.referenceId ? (
        <Text selectable style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          Reference ID: {ex.referenceId}
        </Text>
      ) : null}
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {ex.action === "retry" && onRetry ? (
          <PrimaryButton label={retrying ? "Retrying…" : "Retry"} onPress={onRetry} disabled={retrying} />
        ) : null}
        {onEdit ? (
          <SecondaryButton label={ex.action === "edit" ? "Change requirements" : "Review requirements"} onPress={() => onEdit(ex)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderLeftWidth: 4, marginVertical: 8 },
});
