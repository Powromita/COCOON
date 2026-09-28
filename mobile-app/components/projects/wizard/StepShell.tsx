import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SaveStatus } from "../../../hooks/useAutosave";
import { useTheme } from "../../../theme";
import { WIZARD_STEPS } from "../../../validation/steps";
import { PrimaryButton } from "../../common/PrimaryButton";
import { SecondaryButton } from "../../common/SecondaryButton";
import { SaveIndicator } from "../SaveIndicator";
import { useT } from "../../../i18n";
import { WizardStepper, type StepState } from "./WizardStepper";

interface StepShellProps {
  stepIndex: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  /** Rendered above the content, e.g. a read-only notice. */
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  /** Per-step state for the stepper, computed from the draft by the wizard. */
  stepStates: StepState[];
}

/** Common chrome for every wizard step: progress, keyboard handling, Back/Next, save state. */
export function StepShell({
  stepIndex,
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled,
  saveStatus,
  lastSavedAt,
  banner,
  footer,
  stepStates,
}: StepShellProps) {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const total = WIZARD_STEPS.length;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
        <WizardStepper states={stepStates} currentIndex={stepIndex} />
        <View style={[styles.meta, { marginTop: spacing.md }]}>
          <Text style={[typography.monoSmall, { color: colors.textSecondary }]}>
            {`${t("Step")} ${stepIndex + 1} ${t("of")} ${total}`.toUpperCase()}
          </Text>
          <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
        </View>
        <Text accessibilityRole="header" style={[typography.display, { color: colors.textPrimary, marginTop: spacing.xs }]}>
          {t(title)}
        </Text>
        {description ? (
          <Text style={[typography.body, { color: colors.textBody, marginBottom: spacing.lg }]}>{t(description)}</Text>
        ) : null}

        {banner}
        {children}

        <View style={{ height: spacing.md }} />

        {footer ?? (
          <View style={styles.actions}>
            <View style={styles.half}>{onBack ? <SecondaryButton label={t("Back")} onPress={onBack} /> : null}</View>
            <View style={styles.half}>
              {onNext ? <PrimaryButton label={t(nextLabel)} onPress={onNext} disabled={nextDisabled} /> : null}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
