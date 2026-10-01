/**
 * Project hub — the anchor of the New Shelter journey. Shows where the
 * project is (draft → generating → candidates → selected design) and offers
 * the next step, so no result is ever more than two taps away.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { AppCard } from "../../../components/common/AppCard";
import { DangerButton } from "../../../components/common/DangerButton";
import { ErrorView } from "../../../components/common/ErrorView";
import { KeyValueRow } from "../../../components/common/KeyValueRow";
import { LoadingState } from "../../../components/common/LoadingState";
import { PrimaryButton } from "../../../components/common/PrimaryButton";
import { SecondaryButton } from "../../../components/common/SecondaryButton";
import { SectionHeader } from "../../../components/common/SectionHeader";
import { Tag } from "../../../components/common/Tag";
import { ProjectStatusBadge } from "../../../components/projects/ProjectStatusBadge";
import { RenameProjectModal } from "../../../components/projects/RenameProjectModal";
import { useDeleteProject, useProjectRecord } from "../../../hooks/useProjects";
import { useTheme } from "../../../theme";
import { formatLocalDateTime, humanize } from "../../../utils/format";
import { validateAll } from "../../../validation/schemas";
import { REVIEW_STEP_INDEX, WIZARD_STEPS } from "../../../validation/steps";

export default function ProjectHubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const record = useProjectRecord(id);
  const deleteProject = useDeleteProject();
  const [isRenameOpen, setIsRenameOpen] = useState(false);

  if (record.isError) {
    return (
      <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>
        <ErrorView error={record.error} onRetry={() => void record.refetch()} />
      </View>
    );
  }
  if (!record.data) return <LoadingState label="Loading project…" />;

  const { row, requirements, displayStatus, readOnly } = record.data;
  const missing = readOnly ? [] : validateAll(requirements ?? {});
  const site = requirements?.site;
  const mission = requirements?.mission;
  const lastStepTitle = WIZARD_STEPS[Math.min(row.last_step, REVIEW_STEP_INDEX)]?.title;

  const openWizard = (step: number) => router.push({ pathname: "/project/[id]/edit", params: { id: row.id, step: String(step) } });

  const handleDelete = () => {
    Alert.alert(
      "Delete Shelter Design",
      `Are you sure you want to delete "${row.name}" (${row.id})? This will remove all saved requirements and generated candidates.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteProject.mutateAsync(row.id);
              router.replace("/(tabs)/projects");
            } catch (err) {
              Alert.alert("Could not delete", String(err));
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: row.name }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
          <Text style={[typography.title, { color: colors.textPrimary, flex: 1 }]} accessibilityRole="header">
            {row.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsRenameOpen(true)}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
          >
            <Text style={[typography.caption, { color: colors.primary, fontWeight: "600" }]}>✏️ Rename</Text>
          </Pressable>
          <ProjectStatusBadge status={displayStatus} />
        </View>

        {readOnly ? (
          <AppCard>
            <Text style={[typography.body, { color: colors.textPrimary }]}>
              This saved project uses an older format. Create a new project to run a design calculation.
            </Text>
          </AppCard>
        ) : null}

        <SectionHeader title="Requirements" caption={missing.length > 0 ? `${missing.length} item${missing.length === 1 ? "" : "s"} to complete` : "Ready"} />
        <AppCard>
          <KeyValueRow
            label="Location"
            value={requirements?.location_name ?? (typeof site?.elevation_m === "number" ? `${Math.round(site.elevation_m)} m elevation` : undefined)}
          />
          <KeyValueRow label="Purpose" value={mission?.type ? humanize(mission.type) : undefined} />
          <KeyValueRow label="Occupants" value={typeof mission?.occupants === "number" ? String(mission.occupants) : undefined} />
          <KeyValueRow
            label="Rooms"
            value={mission?.required_rooms && mission.required_rooms.length > 0 ? mission.required_rooms.map(humanize).join(", ") : undefined}
          />
          <KeyValueRow label="Last updated" value={formatLocalDateTime(row.updated_at)} last />
        </AppCard>
        {!readOnly ? (
          <View style={{ gap: spacing.sm }}>
            <SecondaryButton
              label={missing.length > 0 ? `Continue requirements (${lastStepTitle})` : "Edit requirements"}
              onPress={() => openWizard(missing.length > 0 ? row.last_step : 0)}
            />
            <PrimaryButton
              label={row.run_job_id ? "Review and generate again" : "Review and generate designs"}
              onPress={() => openWizard(REVIEW_STEP_INDEX)}
            />
          </View>
        ) : null}

        <SectionHeader title="Designs" />
        {!row.run_job_id ? (
          <Text style={[typography.body, { color: colors.textSecondary }]}>No designs have been generated for this project yet.</Text>
        ) : (
          <AppCard>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs, flexWrap: "wrap" }}>
              <Tag label={humanize(row.run_status ?? "Design run")} tone={row.run_status === "completed" ? "ready" : "neutral"} />
            </View>
            <KeyValueRow label="Job" value={row.run_job_id} mono />
            <KeyValueRow label="Last known status" value={row.run_status ? humanize(row.run_status) : undefined} />
            <KeyValueRow label="Started" value={formatLocalDateTime(row.run_started_at)} />
            <KeyValueRow label="Recommended by optimizer" value={row.recommended_design_id} mono />
            <KeyValueRow label="Your selection" value={row.selected_design_id ?? "None yet"} mono last />
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {row.run_status === "completed" ? (
                <PrimaryButton
                  label="Browse candidates"
                  onPress={() =>
                    router.push({ pathname: "/candidates/[optimizationId]", params: { optimizationId: row.run_job_id as string, projectId: row.id } })
                  }
                />
              ) : (
                <PrimaryButton
                  label="View generation status"
                  onPress={() => router.push({ pathname: "/generation/[jobId]", params: { jobId: row.run_job_id as string, projectId: row.id } })}
                />
              )}
              {row.selected_design_id && row.run_status === "completed" ? (
                <SecondaryButton
                  label="Open selected design"
                  onPress={() =>
                    router.push({
                      pathname: "/results/[optimizationId]/[designId]",
                      params: { optimizationId: row.run_job_id as string, designId: row.selected_design_id as string, projectId: row.id },
                    })
                  }
                />
              ) : null}
            </View>
          </AppCard>
        )}

        <SectionHeader title="Project actions" caption="Manage or delete this shelter project." />
        <View style={{ marginTop: spacing.xs, marginBottom: spacing.xxl }}>
          <DangerButton
            label="🗑️ Delete Shelter Project"
            onPress={handleDelete}
            disabled={deleteProject.isPending}
          />
        </View>
      </ScrollView>

      {isRenameOpen ? (
        <RenameProjectModal
          visible={isRenameOpen}
          projectId={row.id}
          initialName={row.name}
          onClose={() => setIsRenameOpen(false)}
        />
      ) : null}
    </>
  );
}
