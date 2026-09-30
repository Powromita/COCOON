/** Locally saved requirements drafts, with calculation results linked to backend runs. */
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Platform, RefreshControl, Text, View } from "react-native";

import { EmptyState } from "../../components/common/EmptyState";
import { ErrorView } from "../../components/common/ErrorView";
import { InfoBanner } from "../../components/common/InfoBanner";
import { LoadingState } from "../../components/common/LoadingState";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { ProjectListRow } from "../../components/projects/ProjectListRow";
import type { ProjectListItem } from "../../database/schema/types";
import { useDeleteProject, useProjectsList, useRestoreProject } from "../../hooks/useProjects";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";

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
