/**
 * Reports & run history. The backend is the source of truth for runs:
 * The list is read from the COCOON service. Completed runs can be
 * reopened after navigation, refresh or restart. No report or PDF is ever
 * fabricated.
 */
import React from "react";
import { RefreshControl, ScrollView, Text } from "react-native";

import { EmptyState } from "../../components/common/EmptyState";
import { ErrorView } from "../../components/common/ErrorView";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionHeader } from "../../components/common/SectionHeader";
import { SourceNote } from "../../components/common/StatusBanners";
import { RunCard } from "../../components/history/RunCard";
import { useRunHistory } from "../../hooks/useCocoon";
import { useProjectsList } from "../../hooks/useProjects";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";

export default function ReportsScreen() {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const history = useRunHistory();
  const projects = useProjectsList();
  const nameOf = (id: string | null) => (id ? projects.data?.find((p) => p.id === id)?.name : undefined);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
      refreshControl={<RefreshControl refreshing={history.isRefetching} onRefresh={() => void history.refetch()} />}
    >
      <SectionHeader title={t("Recent runs")} />
      {history.isError ? <ErrorView error={history.error} onRetry={() => void history.refetch()} /> : null}
      {!history.data && !history.isError ? <LoadingState label="Loading run history…" /> : null}
      {history.data ? (
        <>
          <SourceNote
            source={history.data.data.source === "device_index_offline" ? "local" : history.data.source}
            fetchedAt={history.data.data.source === "device_index_offline" ? undefined : history.data.fetchedAt}
          />
          {history.data.data.runs.length === 0 ? (
            <EmptyState title="No runs yet" message="Generate designs from a project; completed runs appear here and stay available." />
          ) : (
            history.data.data.runs.map((run) => <RunCard key={run.optimizationId} run={run} projectName={nameOf(run.projectId)} />)
          )}
        </>
      ) : null}
    </ScrollView>
  );
}
