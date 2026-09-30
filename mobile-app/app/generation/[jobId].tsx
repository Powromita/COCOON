/**
 * Generation progress. Polls the backend job (GET /api/v1/optimizations/{id})
 * until it is completed or failed. The backend reports only a status and
 * timestamps — no stages or percentages — so that is all this screen shows.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { validationStateLabel } from "../../adapters/ansys";
import { AppCard } from "../../components/common/AppCard";
import { ErrorView } from "../../components/common/ErrorView";
import { KeyValueRow } from "../../components/common/KeyValueRow";
import { LoadingState } from "../../components/common/LoadingState";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SecondaryButton } from "../../components/common/SecondaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { Tag } from "../../components/common/Tag";
import { useGenerationJob } from "../../hooks/useCocoon";
import { useRecordRunStatus } from "../../hooks/useProjects";
import type { GenerationJob, GenerationJobStatus } from "../../services/interfaces/GenerationService";
import { getRunsRepository } from "../../database";
import { useT } from "../../i18n";
import { markJobStatusSeen } from "../../notifications/jobs";
import { useTheme } from "../../theme";
import { PipelineFailure } from "../../utils/errors";
import { formatLocalDateTime, formatNumber, humanize } from "../../utils/format";
import { REVIEW_STEP_INDEX } from "../../validation/steps";

const ORDER: GenerationJobStatus[] = ["queued", "running", "completed"];

function StatusTimeline({ job }: { job: GenerationJob }) {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const reached = ORDER.indexOf(job.status);
  const rows: { status: GenerationJobStatus; label: string; at?: string }[] = [
    { status: "queued", label: t("QUEUED"), at: job.createdAt },
    { status: "running", label: t("Running COCOON thermal pipeline"), at: job.startedAt },
    { status: "completed", label: t("COMPLETED"), at: job.status === "completed" ? job.finishedAt : undefined },
  ];
  return (
    <AppCard>
      {rows.map((row, i) => {
        const done = job.status !== "failed" && reached >= i;
        const active = job.status === row.status && row.status !== "completed";
        return (
          <View key={row.status} style={[styles.step, { paddingVertical: spacing.sm }]} accessible accessibilityLabel={`${row.label}: ${done ? (active ? "in progress" : "done") : "waiting"}`}>
            <View style={[styles.dot, { borderColor: done ? colors.accent : colors.border, backgroundColor: done && !active ? colors.accent : "transparent" }]}>
              {active ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyStrong, { color: done ? colors.textPrimary : colors.textSecondary }]}>{row.label}</Text>
              {row.at ? <Text style={[typography.caption, { color: colors.textSecondary }]}>{formatLocalDateTime(row.at)}</Text> : null}
            </View>
          </View>
        );
      })}
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
        The backend reports status only, not a percentage, so no progress bar is shown.
      </Text>
    </AppCard>
  );
}

function failureGuidance(job: GenerationJob): string[] {
  const raw = job.error?.details?.reasons;
  const reasons = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const guidance: string[] = [];
  const wallCount = reasons["composition:no_materials_for_wall"];
  const layoutCount = reasons["layout:NO_FEASIBLE_LAYOUT"];
  if (typeof wallCount === "number" && wallCount > 0) {
    guidance.push(`The selected materials could not form a structural wall (${wallCount} attempts). Include stone, plywood, or concrete; insulation such as PUF can be added alongside it.`);
  }
  if (typeof layoutCount === "number" && layoutCount > 0) {
    guidance.push(`The requested room layout could not be placed (${layoutCount} attempts). Try one floor, keep only the rooms you need, and use a practical footprint limit.`);
  }
  if (guidance.length === 0 && job.error?.code === "VALIDATION_ERROR") {
    guidance.push("Review the permitted materials and include at least one structural option, such as stone, plywood, or concrete. Insulation such as PUF can be selected with it.");
  }
  return guidance;
}

export default function GenerationScreen() {
  const { jobId, projectId } = useLocalSearchParams<{ jobId: string; projectId?: string }>();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const job = useGenerationJob(jobId);
  const recordStatus = useRecordRunStatus(projectId);
  const lastRecorded = useRef<string | null>(null);

  // Mirror the backend's status onto the local project and the run index, so lists stay accurate offline.
  // A terminal status seen here is claimed, so the job monitor won't also send a notification for it.
  const data = job.data;
  useEffect(() => {
    if (!data) return;
    const key = `${data.status}:${data.recommendedDesignId ?? ""}`;
    if (lastRecorded.current === key) return;
    lastRecorded.current = key;
    if (projectId) {
      recordStatus.mutate({
        status: data.status,
        recommendedDesignId: data.recommendedDesignId,
        error: data.error?.message ?? null,
      });
    }
    void getRunsRepository()
      .then((runs) => runs.updateStatus(data.jobId, data.status))
      .catch(() => undefined);
    if (data.status === "completed" || data.status === "failed") {
      void markJobStatusSeen(data.jobId, data.status).catch(() => undefined);
      AccessibilityInfo.announceForAccessibility(
        data.status === "completed" ? "Design generation complete." : "Design generation failed."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, data?.status, data?.recommendedDesignId]);

  return (
    <>
      <Stack.Screen options={{ title: "Design generation" }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
        <KeyValueRow label="Job" value={jobId} mono last />

        {job.isError && !data ? <ErrorView error={job.error} onRetry={() => void job.refetch()} /> : null}
        {!data && !job.isError ? <LoadingState label="Contacting the backend…" /> : null}

        {data ? (
          <>
            {data.status === "failed" ? (
              <>
                <ErrorView error={new PipelineFailure(data.error?.message ?? "The backend did not give a reason.", data.error?.code)} />
                <AppCard>
                  <KeyValueRow label="Reason" value={data.error?.message ?? "Not reported"} />
                  <KeyValueRow label="Error code" value={data.error?.code ?? "Not reported"} mono last />
                </AppCard>
                {failureGuidance(data).map((hint) => (
                  <Text key={hint} style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>{hint}</Text>
                ))}
                <View style={{ gap: spacing.sm }}>
                  {projectId ? (
                    <PrimaryButton
                      label="Retry from review"
                      onPress={() => router.replace({ pathname: "/project/[id]/edit", params: { id: projectId, step: String(REVIEW_STEP_INDEX) } })}
                    />
                  ) : null}
                  {projectId ? (
                    <SecondaryButton label="Back to project" onPress={() => router.replace({ pathname: "/project/[id]", params: { id: projectId } })} />
                  ) : null}
                </View>
              </>
            ) : data.status === "unknown" ? (
              <ErrorView error={new Error("The backend reported a status this app does not recognise.")} title="Unknown job status" onRetry={() => void job.refetch()} />
            ) : (
              <StatusTimeline job={data} />
            )}

            {job.isError ? <ErrorView compact error={job.error} title="Status check failed — retrying" /> : null}

            {data.status === "completed" ? (
              <>
                <SectionHeader title="Result" />
                <AppCard>
                  <KeyValueRow label="Designs generated" value={formatNumber(data.summary?.generated, 0)} />
                  <KeyValueRow label="On the Pareto front" value={formatNumber(data.summary?.on_front, 0)} />
                  <KeyValueRow label="Dominated" value={formatNumber(data.summary?.dominated, 0)} />
                  <KeyValueRow label="Recommended by optimizer" value={data.recommendedDesignId ?? "None"} mono />
                  <KeyValueRow label="Validation state" value={validationStateLabel(data.validationState)} />
                  <KeyValueRow
                    label="Weather used"
                    value={
                      data.siteUsed
                        ? `${humanize(data.siteUsed.location_name ?? data.siteUsed.site ?? "Unknown site")}${
                            typeof data.siteUsed.distance_km === "number" ? ` · ${formatNumber(data.siteUsed.distance_km, 1)} km from site` : ""
                          }`
                        : undefined
                    }
                  />
                  <KeyValueRow label="Weather snapshot" value={data.weatherSnapshotId} mono last />
                </AppCard>
                {(data.warnings ?? []).map((w) => (
                  <View key={w} style={{ marginBottom: spacing.sm }}>
                    <Tag label="Backend warning" tone="warning" />
                    <Text style={[typography.caption, { color: colors.textPrimary, marginTop: 2 }]}>{w}</Text>
                  </View>
                ))}
                <PrimaryButton
                  label="View candidates"
                  onPress={() =>
                    router.replace({ pathname: "/candidates/[optimizationId]", params: { optimizationId: data.jobId, projectId: projectId ?? "" } })
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
