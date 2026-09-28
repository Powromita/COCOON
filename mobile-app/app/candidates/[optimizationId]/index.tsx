/**
 * Candidate gallery — GET /api/v1/optimizations/{id}/candidates. Candidates
 * are listed in the order the backend returns them; the app never ranks
 * them itself. "Recommended" is shown only for the design the backend names.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { validationStateLabel } from "../../../adapters/ansys";
import { CandidateCard } from "../../../components/candidates/CandidateCard";
import { PrimaryButton } from "../../../components/common/PrimaryButton";
import { QueryView } from "../../../components/common/QueryView";
import { SecondaryButton } from "../../../components/common/SecondaryButton";
import { SelectField } from "../../../components/common/SelectField";
import { FixtureBanner, SourceNote } from "../../../components/common/StatusBanners";
import { useCandidates } from "../../../hooks/useCocoon";
import { useProjectRecord, useSelectDesign } from "../../../hooks/useProjects";
import { MAX_COMPARE, useAppStore } from "../../../store/app.store";
import { useTheme } from "../../../theme";

type Filter = "all" | "front";

export default function CandidatesScreen() {
  const { optimizationId, projectId } = useLocalSearchParams<{ optimizationId: string; projectId?: string }>();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const candidates = useCandidates(optimizationId);
  const project = useProjectRecord(projectId || undefined);
  const selectDesign = useSelectDesign(projectId || undefined);
  const compare = useAppStore((s) => s.compare);
  const toggleCompare = useAppStore((s) => s.toggleCompare);
  const [filter, setFilter] = useState<Filter>("all");

  const compareIds = compare.optimizationId === optimizationId ? compare.designIds : [];
  const selectedId = project.data?.row.selected_design_id ?? null;

  const openResults = (designId: string) =>
    router.push({ pathname: "/results/[optimizationId]/[designId]", params: { optimizationId, designId, projectId: projectId ?? "" } });

  return (
    <>
      <Stack.Screen options={{ title: "Candidates" }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <QueryView query={candidates} loadingLabel="Loading candidates…" isEmpty={(d) => d.data.candidates.length === 0} emptyTitle="No candidates" emptyMessage="The backend generated no feasible designs for these requirements.">
          {({ data, source, fetchedAt }) => {
            const list = filter === "front" ? data.candidates.filter((c) => c.status === "on_front") : data.candidates;
            return (
              <FlatList
                data={list}
                keyExtractor={(c) => c.design_id}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
                ListHeaderComponent={
                  <View>
                    <FixtureBanner />
                    <SourceNote source={source} fetchedAt={fetchedAt} />
                    <Text style={[typography.body, { color: colors.textPrimary }]}>
                      {data.candidates.length} designs · validation: {validationStateLabel(data.validation?.state)}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                      Listed in the order the backend returned them. All values come from the optimizer (M6), verified by the RC
                      engine (M4) and priced by M7.
                    </Text>
                    <SelectField<Filter>
                      label="Show"
                      value={filter}
                      onChange={setFilter}
                      options={[
                        { value: "all", label: `All (${data.candidates.length})` },
                        { value: "front", label: `Pareto front (${data.candidates.filter((c) => c.status === "on_front").length})` },
                      ]}
                    />
                    <View style={{ marginBottom: spacing.md }}>
                      <SecondaryButton
                        label="Trade-off chart (Pareto)"
                        onPress={() => router.push({ pathname: "/candidates/[optimizationId]/pareto", params: { optimizationId, projectId: projectId ?? "" } })}
                      />
                    </View>
                  </View>
                }
                renderItem={({ item }) => (
                  <CandidateCard
                    optimizationId={optimizationId}
                    outcome={item}
                    recommendedDesignId={data.recommended_design_id}
                    selectedDesignId={selectedId}
                    inCompare={compareIds.includes(item.design_id)}
                    compareFull={compareIds.length >= MAX_COMPARE}
                    onView={() => openResults(item.design_id)}
                    onToggleCompare={() => toggleCompare(optimizationId, item.design_id)}
                    onSelect={() => {
                      if (projectId) selectDesign.mutate(item.design_id);
                      openResults(item.design_id);
                    }}
                  />
                )}
              />
            );
          }}
        </QueryView>

        {compareIds.length > 0 ? (
          <View style={[styles.tray, { backgroundColor: colors.surface, borderColor: colors.border, padding: spacing.md }]}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              {compareIds.length} of {MAX_COMPARE} selected for comparison
            </Text>
            <PrimaryButton
              label={compareIds.length < 2 ? "Select at least 2 to compare" : `Compare ${compareIds.length} designs`}
              disabled={compareIds.length < 2}
              onPress={() => router.push({ pathname: "/candidates/[optimizationId]/compare", params: { optimizationId, projectId: projectId ?? "" } })}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tray: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: 1 },
});
