/**
 * Reports & run history. The backend is the source of truth for runs:
 * main has no list endpoint, so the list is this device's run ids, each
 * re-read from GET /api/v1/optimizations/{id}. Completed runs can be
 * reopened after navigation, refresh or restart. No report or PDF is ever
 * fabricated; demo runs are shown only in demo mode and labelled.
 */
import React from "react";
import { RefreshControl, ScrollView, Text } from "react-native";

import { EmptyState } from "../../components/common/EmptyState";
import { ErrorView } from "../../components/common/ErrorView";
import { InfoBanner } from "../../components/common/InfoBanner";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionHeader } from "../../components/common/SectionHeader";
import { FixtureBanner, SourceNote } from "../../components/common/StatusBanners";
import { RunCard } from "../../components/history/RunCard";
import { useRunHistory } from "../../hooks/useCocoon";
import { useProjectsList } from "../../hooks/useProjects";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";

const SOURCE_NOTE = {
  backend_list: "Run list from the COCOON backend.",
  device_index:
    "The backend has no run-list endpoint yet, so these are the runs started on this device. Each run’s status and results are re-read from the backend.",
  device_index_offline:
    "Live run details are unavailable. Showing only locally stored run IDs and last-known statuses; reconnect to refresh results.",
  fixture: "Recorded COCOON backend optimization run. Results are replayed for demonstration.",
} as const;

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
      <FixtureBanner />
      <InfoBanner title="PDF export coming soon" message="The COCOON backend does not produce PDF reports yet. Completed runs can be reopened here and exported as JSON." />

      <SectionHeader title={t("Recent runs")} />
      {history.isError ? <ErrorView error={history.error} onRetry={() => void history.refetch()} /> : null}
      {!history.data && !history.isError ? <LoadingState label="Loading run history…" /> : null}
      {history.data ? (
        <>
          <SourceNote
            source={history.data.data.source === "device_index_offline" ? "local" : history.data.source}
            fetchedAt={history.data.data.source === "device_index_offline" ? undefined : history.data.fetchedAt}
          />
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            {SOURCE_NOTE[history.data.data.source]}
          </Text>
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
