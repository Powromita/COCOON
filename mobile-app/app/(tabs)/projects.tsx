/**
 * Projects — three origins, never mixed:
 *   LOCAL  — saved on this device (SQLite), editable, the working set.
 *   REMOTE — from the backend's project service (API mode). main has no
 *            project endpoint, so this section says so instead of looking empty.
 *   DEMO   — demo mode only: the M0 package's sample project, read-only.
 */
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Platform, RefreshControl, Text, View } from "react-native";

import { projectToListItem } from "../../adapters/project";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorView } from "../../components/common/ErrorView";
import { InfoBanner } from "../../components/common/InfoBanner";
import { LoadingState } from "../../components/common/LoadingState";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { ProjectListRow } from "../../components/projects/ProjectListRow";
import { IS_FIXTURE_MODE } from "../../constants/env";
import type { ProjectListItem } from "../../database/schema/types";
import { useServiceProjects } from "../../hooks/useCocoon";
import { useCreateDraft, useDeleteProject, useProjectsList, useRestoreProject } from "../../hooks/useProjects";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";
import { isAppErrorKind } from "../../utils/errors";
import { sampleRequirementsDraft } from "../../validation/templates";

function UndoSnackbar({ name, onUndo }: { name: string; onUndo: () => void }) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        left: spacing.lg,
        right: spacing.lg,
        bottom: spacing.lg,
        backgroundColor: colors.textPrimary,
        borderRadius: radii.md,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text style={[typography.body, { color: colors.textInverse, flex: 1 }]} numberOfLines={1}>
        Deleted “{name}”
      </Text>
      <Text accessibilityRole="button" onPress={onUndo} style={[typography.bodyStrong, { color: colors.textInverse, padding: spacing.sm }]}>
        UNDO
      </Text>
    </View>
  );
}

function ServiceProjectsSection() {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const router = useRouter();
  const projects = useServiceProjects(IS_FIXTURE_MODE);
  const createDraft = useCreateDraft();
  const origin = "DEMO";

  const useTemplate = () =>
    Alert.alert("Demo project", "Demo projects are read-only. Start a new local project pre-filled with this sample?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Use as template",
        onPress: async () => {
          const created = await createDraft.mutateAsync({ name: "Leh sample (from demo)", requirements: sampleRequirementsDraft() });
          router.push({ pathname: "/project/[id]/edit", params: { id: created.id, step: "0" } });
        },
      },
    ]);

  if (!IS_FIXTURE_MODE) {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="REMOTE · COCOON backend" caption="Server project storage is not available on this backend." />
        <InfoBanner title="Remote projects unavailable" message="The connected COCOON backend has no project-listing endpoint. Projects created in this app are saved locally on this device." />
      </View>
    );
  }

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader
        title={`${t(origin)} · ${IS_FIXTURE_MODE ? "sample data" : "COCOON backend"}`}
        caption="Read-only example from the M0 contracts package."
      />
      {projects.isError ? (
        isAppErrorKind(projects.error, "not_supported") ? (
          <InfoBanner title="Demo project unavailable" message="The recorded sample project could not be loaded. You can still create a local project." />
        ) : (
          <ErrorView compact error={projects.error} onRetry={() => void projects.refetch()} />
        )
      ) : !projects.data ? (
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading…</Text>
      ) : projects.data.data.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textSecondary }]}>No projects on the backend.</Text>
      ) : (
        projects.data.data.map((p) => (
          <ProjectListRow key={p.project_id} item={projectToListItem(p)} origin={origin} onPress={useTemplate} />
        ))
      )}
    </View>
  );
}

export default function ProjectsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const t = useT();
  const { data, isLoading, isError, error, refetch, isRefetching } = useProjectsList();
  const deleteProject = useDeleteProject();
  const restoreProject = useRestoreProject();
  const [undoTarget, setUndoTarget] = useState<{ id: string; name: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={{ padding: spacing.lg }}>
        <InfoBanner title="Mobile app only" message="Local project storage is available in the Android app, not in the web preview." />
      </View>
    );
  }

  const confirmDelete = (item: ProjectListItem) => {
    Alert.alert("Delete project?", `“${item.name}” and its saved draft will be removed from this device.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteProject.mutateAsync(item.id);
          setUndoTarget({ id: item.id, name: item.name });
          if (undoTimer.current) clearTimeout(undoTimer.current);
          undoTimer.current = setTimeout(() => setUndoTarget(null), 5000);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading ? <LoadingState label="Loading projects…" /> : null}
      {isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorView error={error} onRetry={() => void refetch()} />
        </View>
      ) : null}
      {data ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListHeaderComponent={
            <View>
              <PrimaryButton label={t("New project")} onPress={() => router.push("/project/new")} />
              <SectionHeader title={`${t("LOCAL")} · this device`} caption="Long-press a project to delete it." />
            </View>
          }
          ListEmptyComponent={<EmptyState title="No local projects yet" message="Create a project to describe a shelter and generate designs." />}
          ListFooterComponent={<ServiceProjectsSection />}
          renderItem={({ item }) => (
            <ProjectListRow
              item={item}
              origin="LOCAL"
              onPress={() => router.push({ pathname: "/project/[id]", params: { id: item.id } })}
              onLongPress={() => confirmDelete(item)}
            />
          )}
        />
      ) : null}
      {undoTarget ? (
        <UndoSnackbar
          name={undoTarget.name}
          onUndo={async () => {
            if (undoTimer.current) clearTimeout(undoTimer.current);
            await restoreProject.mutateAsync(undoTarget.id);
            setUndoTarget(null);
          }}
        />
      ) : null}
    </View>
  );
}
