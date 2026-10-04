/**
 * Review-step compatibility: what the backend's M2 compatibility check says
 * about the current draft. Shows the compatible templates (automatic selection
 * by default, manual choice among compatible ones only), every conflict in
 * plain language with a link to the step that owns the field, and the
 * alternatives the backend verified — applied only when the user taps them.
 *
 * A compatible result is labelled preliminary: real candidates are still
 * generated and validated by M2, and the backend repeats this check before
 * it generates anything.
 */
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { compatibilityView, issueStep, roomLabel } from "../../../adapters/templates";
import type { CompatibilityResult } from "../../../types/backend";
import { useTheme } from "../../../theme";
import { minTouchTarget } from "../../../theme/spacing";
import { isAppErrorKind } from "../../../utils/errors";
import type { WizardStepId } from "../../../validation/steps";
import { AppCard } from "../../common/AppCard";
import { ErrorView } from "../../common/ErrorView";
import { SecondaryButton } from "../../common/SecondaryButton";
import { SectionHeader } from "../../common/SectionHeader";
import { Tag } from "../../common/Tag";

interface CompatibilityPanelProps {
  result: CompatibilityResult | undefined;
  error: unknown;
  /** True while a newer check is in flight (the shown result may be for older inputs). */
  checking: boolean;
  offline: boolean;
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string | null) => void;
  onRetry: () => void;
  onEditStep: (step: WizardStepId) => void;
  /** Applies one verified alternative, e.g. {"constraints.maximum_footprint_m2": 41.5}. */
  onApplyChange: (change: Record<string, number>) => void;
}

export function CompatibilityPanel(props: CompatibilityPanelProps) {
  const { result, error, checking, offline } = props;
  const { colors, spacing, typography } = useTheme();

  if (!result) {
    if (offline) {
      return (
        <PanelCard title="Template compatibility" tone="warning" tag="Offline">
          <Body>Connect to a network to check your requirements against the shelter templates. Your draft is saved.</Body>
        </PanelCard>
      );
    }
    if (error) {
      return (
        <ErrorView
          compact
          error={error}
          title={isAppErrorKind(error, "not_supported") ? "This server cannot check templates yet" : "Compatibility could not be checked"}
          onRetry={props.onRetry}
        />
      );
    }
    return (
      <PanelCard title="Template compatibility">
        <View style={[styles.row, { gap: spacing.sm }]} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Body>Checking your requirements against the shelter templates…</Body>
        </View>
      </PanelCard>
    );
  }

  const view = compatibilityView(result);
  const staleTag = checking ? "Re-checking…" : undefined;

  if (view.kind === "incomplete") {
    return (
      <PanelCard title="Template compatibility" tag={staleTag ?? "Incomplete"} tone="warning">
        <Body>Finish the highlighted fields to complete the check.</Body>
        {view.fittingSoFar.length > 0 ? (
          <Body>So far, {view.fittingSoFar.length} template{view.fittingSoFar.length === 1 ? "" : "s"} can hold your rooms.</Body>
        ) : null}
      </PanelCard>
    );
  }

  if (view.kind === "incompatible") {
    return (
      <PanelCard title="Template compatibility" tag={staleTag ?? "Not compatible"} tone="danger">
        <Text accessibilityRole="alert" style={[typography.bodyStrong, { color: colors.textPrimary, marginBottom: spacing.sm }]}>
          {view.headline}
        </Text>
        {view.issues.map((issue) => (
          <IssueRow key={`${issue.code}:${issue.message}`} message={issue.message} onEdit={() => props.onEditStep(issueStep(issue))} />
        ))}
        {result.conflicts.some((c) => c.layer === "selection") ? (
          <View style={{ marginTop: spacing.sm }}>
            <SecondaryButton label="Use automatic template selection" onPress={() => props.onSelectTemplate(null)} />
          </View>
        ) : null}
        {view.alternatives.length > 0 ? (
          <>
            <SectionHeader title="Supported alternatives" caption="Each was re-checked by the backend. Nothing changes until you choose one." />
            {view.alternatives.map((alt) => (
              <View key={alt.template_id} style={{ marginBottom: spacing.sm }}>
                <Body>{alt.message}</Body>
                <SecondaryButton label="Apply this change" onPress={() => props.onApplyChange(alt.change)} />
              </View>
            ))}
          </>
        ) : null}
      </PanelCard>
    );
  }

  // compatible
  const all = result.templates.filter((t) => result.compatible_template_ids.includes(t.template_id));
  return (
    <PanelCard title="Template compatibility" tag={staleTag ?? "Compatible"} tone="ready">
      <Body>{view.note}</Body>
      <Body>
        {all.length} layout template{all.length === 1 ? "" : "s"} can hold your requirements. The generator picks the best one automatically.
      </Body>
      {result.warnings.map((w) => (
        <Text key={w.code} style={[typography.caption, { color: colors.statusWarning, marginTop: spacing.xs }]}>
          {w.message}
        </Text>
      ))}
    </PanelCard>
  );
}

function sharedText(shared: Record<string, string>, floors: number): string {
  const parts = [`${floors} floor${floors === 1 ? "" : "s"}`];
  const merged = Object.keys(shared);
  if (merged.length > 0) parts.push(`${merged.map((t) => roomLabel(t).toLowerCase()).join(", ")} shared with another room`);
  else parts.push("every requested room is separate");
  return parts.join(" · ");
}

function PanelCard({ title, tag, tone, children }: { title: string; tag?: string; tone?: "ready" | "warning" | "danger"; children: React.ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <AppCard emphasis={tone === "danger" ? "demo" : "none"}>
      <View style={[styles.row, { marginBottom: 6 }]}>
        <Text accessibilityRole="header" style={[typography.label, { color: colors.textSecondary, flex: 1 }]}>
          {title.toUpperCase()}
        </Text>
        {tag ? <Tag label={tag} tone={tone ?? "neutral"} /> : null}
      </View>
      {children}
    </AppCard>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  return <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm, flexShrink: 1 }]}>{children}</Text>;
}

function IssueRow({ message, onEdit }: { message: string; onEdit: () => void }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.row, { marginBottom: spacing.xs, gap: spacing.sm }]}>
      <Text style={[typography.caption, { color: colors.danger, flex: 1 }]}>{message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit: ${message}`} onPress={onEdit} hitSlop={8} style={styles.edit}>
        <Text style={[typography.caption, { color: colors.accent, fontWeight: "600" }]}>Edit</Text>
      </Pressable>
    </View>
  );
}

function Choice({ label, detail, selected, onPress }: { label: string; detail?: string; selected: boolean; onPress: () => void }) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.surfaceAlt : colors.surface,
          borderRadius: radii.sm,
          padding: spacing.sm,
          marginBottom: spacing.xs,
        },
      ]}
    >
      <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>
        {selected ? "◉ " : "○ "}
        {label}
      </Text>
      {detail ? <Text style={[typography.caption, { color: colors.textSecondary }]}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  edit: { minHeight: minTouchTarget, minWidth: minTouchTarget, alignItems: "flex-end", justifyContent: "center" },
  choice: { borderWidth: 1.5, minHeight: minTouchTarget, justifyContent: "center" },
});
