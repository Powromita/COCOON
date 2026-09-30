/**
 * Results for one candidate design, in seven tabs. The header always states
 * the project, the candidate, the simulation status and where the data came
 * from. The selected tab is part of the route (?tab=...), so back
 * navigation and deep links keep context.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { picksForDesign } from "../../../adapters/candidates";
import { FixtureBanner, SourceNote } from "../../../components/common/StatusBanners";
import { SegmentedTabs, type TabDef } from "../../../components/common/SegmentedTabs";
import { Tag } from "../../../components/common/Tag";
import type { ResultsContext } from "../../../components/results/ResultsContext";
import { EconomicsTab } from "../../../components/results/EconomicsTab";
import { EnergyTab } from "../../../components/results/EnergyTab";
import { EvidenceTab } from "../../../components/results/EvidenceTab";
import { OverviewTab } from "../../../components/results/OverviewTab";
import { RoomsTab } from "../../../components/results/RoomsTab";
import { ValidationTab } from "../../../components/results/ValidationTab";
import { ViewerTab } from "../../../components/results/ViewerTab";
import {
  useCandidates,
  useDesign,
  useDesignSimulation,
  useGenerationJob,
  usePareto,
  useSubmittedRequirements,
  useTimeseries,
} from "../../../hooks/useCocoon";
import { useProjectRecord } from "../../../hooks/useProjects";
import { useT } from "../../../i18n";
import { useTheme } from "../../../theme";
import { humanize } from "../../../utils/format";

type TabKey = "overview" | "rooms" | "energy" | "economics" | "viewer" | "validation" | "evidence";

const TAB_DEFS: TabDef<TabKey>[] = [
  { key: "overview", label: "Overview" },
  { key: "rooms", label: "Rooms" },
  { key: "energy", label: "Energy" },
  { key: "economics", label: "Economics" },
  { key: "viewer", label: "3D" },
  { key: "validation", label: "Validation" },
  { key: "evidence", label: "Evidence" },
];

export default function ResultsScreen() {
  const params = useLocalSearchParams<{ optimizationId: string; designId: string; projectId?: string; tab?: string }>();
  const { optimizationId, designId } = params;
  const projectId = params.projectId || undefined;
  const tab: TabKey = TAB_DEFS.some((d) => d.key === params.tab) ? (params.tab as TabKey) : "overview";
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const TABS = TAB_DEFS.map((d) => ({ ...d, label: t(d.label) }));

  const project = useProjectRecord(projectId);
  const job = useGenerationJob(optimizationId);
  const requirements = useSubmittedRequirements(optimizationId);
  const design = useDesign(optimizationId, designId);
  const candidates = useCandidates(optimizationId);
  const pareto = usePareto(optimizationId);
  const building = design.data?.data;
  const simulation = useDesignSimulation({
    optimizationId,
    designId,
    building,
    requirements: requirements.data,
    weatherSnapshotId: job.data?.weatherSnapshotId,
  });
  const timeseries = useTimeseries(simulation.data?.data.simulation_id);

  const ctx: ResultsContext = {
    projectId,
    optimizationId,
    designId,
    building,
    outcome: candidates.data?.data.candidates.find((c) => c.design_id === designId),
    recommendedDesignId: candidates.data?.data.recommended_design_id,
    picks: picksForDesign(pareto.data?.data, designId),
    requirements: requirements.data,
    job: job.data,
    simulation,
    timeseries,
  };

  const simStatus = simulation.isError
    ? "Simulation unavailable"
    : simulation.data
      ? `Simulation ${humanize(simulation.data.data.status)}`
      : "Loading simulation…";

  return (
    <>
      <Stack.Screen options={{ title: designId }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.context, { backgroundColor: colors.surface, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }]}>
          <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
            {project.data ? `Project: ${project.data.row.name}` : "Project: not linked"}
          </Text>
          <View style={styles.contextRow}>
            <Text style={[typography.bodyStrong, { color: colors.textPrimary, flexShrink: 1 }]} selectable numberOfLines={1}>
              {designId}
            </Text>
            {ctx.recommendedDesignId === designId ? <Tag label="Recommended" tone="accent" /> : null}
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>{simStatus}</Text>
        </View>
        <SegmentedTabs tabs={TABS} active={tab} onChange={(key) => router.setParams({ tab: key })} />
        {tab === "viewer" ? (
          // The 3D viewer manages its own layout (WebView must not sit inside a ScrollView).
          <View style={[styles.flex, { padding: spacing.md }]}>
            <FixtureBanner />
            <ViewerTab ctx={ctx} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
            <FixtureBanner />
            {simulation.data ? <SourceNote source={simulation.data.source} fetchedAt={simulation.data.fetchedAt} /> : null}
            {tab === "overview" ? <OverviewTab ctx={ctx} /> : null}
            {tab === "rooms" ? <RoomsTab ctx={ctx} /> : null}
            {tab === "energy" ? <EnergyTab ctx={ctx} /> : null}
            {tab === "economics" ? <EconomicsTab ctx={ctx} /> : null}
            {tab === "validation" ? <ValidationTab ctx={ctx} /> : null}
            {tab === "evidence" ? <EvidenceTab ctx={ctx} /> : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  context: { borderBottomWidth: StyleSheet.hairlineWidth },
  contextRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
