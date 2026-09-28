import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useT } from "../../../i18n";
import { useTheme } from "../../../theme";
import { WIZARD_STEPS } from "../../../validation/steps";

export type StepState = "complete" | "incomplete" | "current" | "upcoming";

/**
 * The 10-step progress row. Completed = green check, current = navy,
 * visited-but-incomplete = amber "!", upcoming = neutral. Every state is
 * also spelled out for screen readers — never color alone.
 */
export function WizardStepper({ states, currentIndex }: { states: StepState[]; currentIndex: number }) {
  const { colors, typography } = useTheme();
  const t = useT();
  const total = WIZARD_STEPS.length;
  const summary = WIZARD_STEPS.map((s, i) => `${t(s.title)}: ${states[i] ?? "upcoming"}`).join(", ");

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`${t("Step")} ${currentIndex + 1} ${t("of")} ${total}. ${summary}`}>
      <View style={styles.row}>
        {WIZARD_STEPS.map((step, i) => {
          const state = states[i] ?? "upcoming";
          const [bg, fg, border] =
            state === "complete"
              ? [colors.statusReady, colors.textInverse, colors.statusReady]
              : state === "current"
                ? [colors.primary, colors.primaryText, colors.primary]
                : state === "incomplete"
                  ? [colors.statusWarningBg, colors.statusWarning, colors.amber]
                  : [colors.surface, colors.textSecondary, colors.border];
          return (
            <React.Fragment key={step.id}>
              {i > 0 ? (
                <View style={[styles.link, { backgroundColor: i <= currentIndex ? colors.statusReady : colors.border }]} />
              ) : null}
              <View style={[styles.node, { backgroundColor: bg, borderColor: border }]}>
                <Text style={[typography.monoSmall, { color: fg, fontWeight: "700" }]}>
                  {state === "complete" ? "✓" : state === "incomplete" ? "!" : String(i + 1)}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  link: { flex: 1, height: 2, minWidth: 2 },
});
