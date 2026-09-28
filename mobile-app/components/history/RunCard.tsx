import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { validationStateLabel } from "../../adapters/ansys";
import { useT } from "../../i18n";
import type { RunSummary } from "../../services/interfaces/OptimizationHistoryService";
import { useTheme } from "../../theme";
import { formatLocalDateTime, formatNumber } from "../../utils/format";
import { shareRunJson } from "../../utils/exportRun";
import { AppCard } from "../common/AppCard";
import { ErrorView } from "../common/ErrorView";
import { KeyValueRow } from "../common/KeyValueRow";
import { SecondaryButton } from "../common/SecondaryButton";
import { Tag, type TagTone } from "../common/Tag";

const STATUS: Record<RunSummary["status"], { label: string; tone: TagTone }> = {
  queued: { label: "QUEUED", tone: "warning" },
  running: { label: "RUNNING", tone: "warning" },
  completed: { label: "COMPLETED", tone: "ready" },
  failed: { label: "FAILED", tone: "danger" },
  unknown: { label: "UNKNOWN", tone: "neutral" },
  not_found: { label: "NOT FOUND ON BACKEND", tone: "neutral" },
};

/** One optimization run from history, with its actions. */
export function RunCard({ run, projectName }: { run: RunSummary; projectName?: string }) {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const router = useRouter();
  const s = STATUS[run.status];
  const completed = run.status === "completed";
  const exportJson = useMutation({ mutationFn: () => shareRunJson(run.optimizationId) });

  return (
    <AppCard>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.monoSmall, { color: colors.textSecondary }]}>OPTIMIZATION ID</Text>
          <Text style={[typography.monoStrong, { color: colors.textPrimary }]} selectable>
            {run.optimizationId}
          </Text>
        </View>
        <Tag label={t(s.label)} tone={s.tone} />
      </View>
      <View style={{ marginTop: spacing.xs }}>
        {projectName ? <KeyValueRow label="Project" value={projectName} /> : null}
        <KeyValueRow label="Project ID" value={run.projectId} mono />
        <KeyValueRow label="Created" value={formatLocalDateTime(run.createdAt)} mono />
        <KeyValueRow label="Candidates" value={formatNumber(run.candidateCount, 0)} mono />
        <KeyValueRow label="Recommended design" value={run.recommendedDesignId} mono />
        <KeyValueRow label="Validation" value={validationStateLabel(run.validationState)} last={!run.errorMessage} />
        {run.errorMessage ? <KeyValueRow label="Failure reason" value={run.errorMessage} last /> : null}
      </View>
      {run.status === "not_found" ? (
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          This device started the run, but the backend no longer has it (for example after a server reset).
        </Text>
      ) : null}

      <View style={[styles.actions, { marginTop: spacing.md }]}>
        {completed && run.recommendedDesignId ? (
          <View style={styles.action}>
            <SecondaryButton
              label={t("View results")}
              onPress={() =>
                router.push({
                  pathname: "/results/[optimizationId]/[designId]",
                  params: { optimizationId: run.optimizationId, designId: run.recommendedDesignId as string, projectId: run.projectId ?? "" },
                })
              }
            />
          </View>
        ) : null}
        {completed ? (
          <View style={styles.action}>
            <SecondaryButton
              label={t("View candidates")}
              onPress={() => router.push({ pathname: "/candidates/[optimizationId]", params: { optimizationId: run.optimizationId, projectId: run.projectId ?? "" } })}
            />
          </View>
        ) : run.status === "queued" || run.status === "running" || run.status === "failed" ? (
          <View style={styles.action}>
            <SecondaryButton
              label="View status"
              onPress={() => router.push({ pathname: "/generation/[jobId]", params: { jobId: run.optimizationId, projectId: run.projectId ?? "" } })}
            />
          </View>
        ) : null}
      </View>
      {completed ? (
        <View style={[styles.actions, { marginTop: spacing.sm }]}>
          <View style={styles.action}>
            <SecondaryButton label={exportJson.isPending ? "Preparing…" : "Export run data (JSON)"} onPress={() => exportJson.mutate()} disabled={exportJson.isPending} />
          </View>
        </View>
      ) : null}
      {exportJson.isError ? <ErrorView compact error={exportJson.error} title="Export failed" /> : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 },
});
