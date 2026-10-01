/** Locally saved requirements drafts, with calculation results linked to backend runs. */
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/common/EmptyState";
import { ErrorView } from "../../components/common/ErrorView";
import { InfoBanner } from "../../components/common/InfoBanner";
import { LoadingState } from "../../components/common/LoadingState";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { TextField } from "../../components/common/TextField";
import { ProjectListRow } from "../../components/projects/ProjectListRow";
import { RenameProjectModal } from "../../components/projects/RenameProjectModal";
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
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const { data, isLoading, isError, error, refetch, isRefetching } = useProjectsList();
  const deleteProject = useDeleteProject();
  const restoreProject = useRestoreProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [undoTarget, setUndoTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const filteredData = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.locationLabel && p.locationLabel.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  if (Platform.OS === "web") {
    return (
      <View style={{ padding: spacing.lg }}>
        <InfoBanner title="Mobile app only" message="Local project storage is available in the Android app, not in the web preview." />
      </View>
    );
  }

  const confirmDelete = (item: ProjectListItem) => {
    Alert.alert("Delete Shelter Project", `Are you sure you want to delete "${item.name}"? This action cannot be undone.`, [
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

  const manageProject = (item: ProjectListItem) => {
    Alert.alert("Manage project", `“${item.name}”`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Rename",
        onPress: () => setRenameTarget({ id: item.id, name: item.name }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDelete(item),
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
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.md }}>
              <PrimaryButton label={t("New shelter project")} onPress={() => router.push("/project/new")} />
              <View style={{ marginTop: spacing.md }}>
                <TextField
                  label="Search Projects"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Filter by name, sector location, or ID…"
                  helperText={searchQuery ? `Showing ${filteredData.length} of ${data.length} projects` : undefined}
                />
              </View>
              <SectionHeader
                title={`${t("SAVED SHELTERS")} (${filteredData.length})`}
                caption="Tap card to open. Tap delete or long-press to manage."
              />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title={searchQuery ? "No matching projects" : "No local projects yet"}
              message={
                searchQuery
                  ? "Try searching with a different shelter name or sector location."
                  : "Create a project to describe a shelter and generate designs."
              }
            />
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing.xs }}>
              <ProjectListRow
                item={item}
                origin="LOCAL"
                onPress={() => router.push({ pathname: "/project/[id]", params: { id: item.id } })}
                onLongPress={() => manageProject(item)}
                onDelete={() => confirmDelete(item)}
              />
            </View>
          )}
        />
      ) : null}

      {renameTarget ? (
        <RenameProjectModal
          visible={Boolean(renameTarget)}
          projectId={renameTarget.id}
          initialName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
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
