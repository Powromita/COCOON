/**
 * Generation progress. Polls the backend job (GET /api/v1/optimizations/{id})
 * until it is completed or failed, and while a requested ANSYS validation is
 * still running. The backend records real stage transitions — M2 generation,
 * M4 simulation, M7 economics, M6 ranking and M8 ANSYS are separate rows — and
 * no percentages, so none are shown. Older backends report only a status; then
 * the three-step timeline is shown instead.
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
import { STAGE_STATUS_TEXT, visibleStages } from "../../adapters/templates";
import { FailureNotice } from "../../components/generation/FailureNotice";
import { InfoBanner } from "../../components/common/InfoBanner";
import { useGenerationJob, useRetryGeneration } from "../../hooks/useCocoon";
import { useRecordRunStatus } from "../../hooks/useProjects";
import type { GenerationJob, GenerationJobStatus } from "../../services/interfaces/GenerationService";
import { getRunsRepository } from "../../database";
import { useT } from "../../i18n";
import { markJobStatusSeen } from "../../notifications/jobs";
import { useTheme } from "../../theme";
import { formatLocalDateTime, formatNumber, humanize } from "../../utils/format";
import { REVIEW_STEP_INDEX, stepIndexOf } from "../../validation/steps";

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

/** The backend's recorded stages; completed stages stay visible when a later one fails. */
function StageTimeline({ job }: { job: GenerationJob }) {
  const { colors, spacing, typography } = useTheme();
  const stages = visibleStages(job.stages);
  return (
    <AppCard>
      {stages.map((stage) => {
        const done = stage.status === "completed";
        const active = stage.status === "running" || stage.status === "queued";
        const bad = stage.status === "failed" || stage.status === "unavailable";
        const tint = bad ? colors.danger : done || active ? colors.accent : colors.border;
        return (
          <View
            key={stage.id}
            style={[styles.step, { paddingVertical: spacing.sm }]}
            accessible
            accessibilityLabel={`${stage.label}: ${STAGE_STATUS_TEXT[stage.status] ?? stage.status}`}
          >
            <View style={[styles.dot, { borderColor: tint, backgroundColor: done ? colors.accent : bad ? colors.danger : "transparent" }]}>
              {active ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyStrong, { color: done || active || bad ? colors.textPrimary : colors.textSecondary }]}>{stage.label}</Text>
              <Text style={[typography.caption, { color: bad ? colors.danger : colors.textSecondary }]}>
                {STAGE_STATUS_TEXT[stage.status] ?? humanize(stage.status)}
                {stage.finished_at && done ? ` · ${formatLocalDateTime(stage.finished_at)}` : ""}
              </Text>
            </View>
          </View>
        );
      })}
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
        Stages are reported by the backend as they finish; there is no percentage, so no progress bar is shown.
      </Text>
    </AppCard>
  );
}

export default function GenerationScreen() {
  const { jobId, projectId } = useLocalSearchParams<{ jobId: string; projectId?: string }>();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const job = useGenerationJob(jobId);
  const retry = useRetryGeneration(projectId);
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
                <FailureNotice
                  error={data.error ?? { message: "The backend did not give a reason." }}
                  generation={data.generation}
                  retrying={retry.isPending}
                  onRetry={() =>
                    retry.mutate(data.jobId, {
                      onSuccess: (res) =>
                        router.replace({ pathname: "/generation/[jobId]", params: { jobId: res.jobId, projectId: projectId ?? "" } }),
                    })
                  }
                  onEdit={
                    projectId
                      ? (ex) =>
                          router.replace({
                            pathname: "/project/[id]/edit",
                            params: { id: projectId, step: String(ex.step && ex.step !== "review" ? stepIndexOf(ex.step) : REVIEW_STEP_INDEX) },
                          })
                      : undefined
                  }
                />
                {retry.isError ? <ErrorView compact error={retry.error} title="The retry could not start" /> : null}
                {data.stages?.length ? <StageTimeline job={data} /> : null}
                {projectId ? (
                  <SecondaryButton label="Back to project" onPress={() => router.replace({ pathname: "/project/[id]", params: { id: projectId } })} />
                ) : null}
              </>
            ) : data.status === "unknown" ? (
              <ErrorView error={new Error("The backend reported a status this app does not recognise.")} title="Unknown job status" onRetry={() => void job.refetch()} />
            ) : data.stages?.length ? (
              <StageTimeline job={data} />
            ) : (
              <StatusTimeline job={data} />
            )}

            {job.isError ? <ErrorView compact error={job.error} title="Status check failed — retrying" /> : null}

            {data.status === "completed" ? (
              <>
                <SectionHeader title="Result" />
                {data.phase === "ansys_validation" ? (
                  <InfoBanner
                    title="ANSYS validation still running"
                    message="The RC results below are complete. The independent ANSYS check of the recommended design is still in progress; it is a separate status and is updated here."
                  />
                ) : data.phase === "partially_completed" ? (
                  <InfoBanner
                    tone="warning"
                    title="Partially completed"
                    message={
                      data.generation && !data.generation.complete
                        ? `Only ${data.generation.generated} of the ${data.generation.requested} requested designs passed M2 validation. The results below use those designs.`
                        : "The RC results are complete, but the ANSYS validation did not finish. The designs are not ANSYS-validated."
                    }
                  />
                ) : null}
                <AppCard>
                  <KeyValueRow label="Designs generated" value={formatNumber(data.summary?.generated, 0)} />
                  {data.generation ? (
                    <KeyValueRow
                      label="M2 layouts tried"
                      value={`${formatNumber(data.generation.attempts, 0)} (${formatNumber(data.generation.generated, 0)} passed validation)`}
                    />
                  ) : null}
                  {data.templateIds?.length ? (
                    <KeyValueRow
                      label={data.templateSelection === "manual" ? "Template (your choice)" : "Templates used"}
                      value={data.templateIds.map((t) => humanize(t)).join(", ")}
                    />
                  ) : null}
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
                  <KeyValueRow label="Weather snapshot" value={data.weatherSnapshotId} mono last={!data.catalogVersion} />
                  {data.catalogVersion ? <KeyValueRow label="Template catalogue" value={data.catalogVersion} mono last /> : null}
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
