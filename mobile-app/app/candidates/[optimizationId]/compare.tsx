/**
 * Side-by-side comparison of 2–3 candidates. Each metric is a block — label
 * on top, one column per design below — so three designs fit a phone width
 * with no horizontal scrolling. All values are backend-reported.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { summarizeBuilding, type BuildingSummary } from "../../../adapters/building";
import { validationStateLabel } from "../../../adapters/ansys";
import { OUTCOME_STATUS_LABELS } from "../../../adapters/candidates";
import { formatObjectiveByKey } from "../../../components/candidates/objectiveFormat";
import { EmptyState } from "../../../components/common/EmptyState";
import { QueryView } from "../../../components/common/QueryView";
import { useCandidates, useDesign } from "../../../hooks/useCocoon";
import { useAppStore } from "../../../store/app.store";
import { useTheme } from "../../../theme";
import type { DesignOutcome } from "../../../types/backend";
import { formatWithUnit, humanize, NOT_AVAILABLE, shortId } from "../../../utils/format";

type Getter = (o: DesignOutcome, b: BuildingSummary | null) => string;

interface Row {
  label: string;
  get: Getter;
}

function assembly(b: BuildingSummary | null, category: string): string {
  const a = b?.assemblies.find((x) => x.category === category);
  if (!a) return NOT_AVAILABLE;
  return `${a.name}${typeof a.uValueWm2k === "number" ? `\nU ${a.uValueWm2k.toFixed(3)} W/(m²·K)` : ""}`;
}

function useSections(): { title: string; rows: Row[] }[] {
  const unit = useAppStore((s) => s.temperatureUnit);
  const obj = (key: string): Getter => (o) => formatObjectiveByKey(key, o.objectives[key], unit);
  return [
    {
      title: "Geometry",
      rows: [
        { label: "Floors", get: (_, b) => (b ? String(b.floorCount) : NOT_AVAILABLE) },
        { label: "Rooms", get: (_, b) => (b ? b.zones.map((z) => humanize(z.type)).join(", ") : NOT_AVAILABLE) },
        { label: "Floor area (sum of rooms)", get: (_, b) => (b ? formatWithUnit(b.totalFloorAreaM2, "m²") : NOT_AVAILABLE) },
        { label: "Window area", get: (_, b) => (b ? formatWithUnit(b.windowAreaM2, "m²") : NOT_AVAILABLE) },
      ],
    },
    {
      title: "Materials",
      rows: [
        { label: "Walls", get: (_, b) => assembly(b, "wall") },
        { label: "Roof", get: (_, b) => assembly(b, "roof") },
        { label: "Floor", get: (_, b) => assembly(b, "floor") },
      ],
    },
    {
      title: "Temperature and comfort",
      rows: [
        { label: "Unmet comfort hours", get: obj("unmet_hours") },
        { label: "Occupied comfort hours", get: obj("occupied_comfort_hours") },
        { label: "Passive minimum", get: obj("passive_min_temperature_c") },
        { label: "Passive median", get: obj("passive_median_temperature_c") },
        { label: "Temperature swing", get: obj("temperature_swing_c") },
      ],
    },
    {
      title: "Energy",
      rows: [
        { label: "Heating energy", get: obj("heating_energy_kwh") },
        { label: "Peak heating", get: obj("peak_heating_kw") },
      ],
    },
    {
      title: "Cost (M7, expected scenario)",
      rows: [
        { label: "CAPEX", get: obj("capex_inr") },
        { label: "Lifecycle cost", get: obj("lcc_inr") },
        { label: "Annual OPEX", get: () => "See the design's Economics tab" },
        { label: "Shipped mass", get: obj("mass_kg") },
      ],
    },
    {
      title: "Status",
      rows: [
        { label: "Optimizer status", get: (o) => OUTCOME_STATUS_LABELS[o.status] ?? humanize(o.status) },
        { label: "Evidence", get: (o) => validationStateLabel(o.recommendation_state) },
        { label: "Reliability", get: obj("reliability") },
      ],
    },
  ];
}

function DesignSummaries({ optimizationId, outcomes, children }: { optimizationId: string; outcomes: DesignOutcome[]; children: (b: (BuildingSummary | null)[]) => React.ReactNode }) {
  // Fixed-length hook calls: compare holds at most 3 designs.
  const d0 = useDesign(optimizationId, outcomes[0]?.design_id);
  const d1 = useDesign(optimizationId, outcomes[1]?.design_id);
  const d2 = useDesign(optimizationId, outcomes[2]?.design_id);
  const all = [d0, d1, d2].slice(0, outcomes.length).map((q) => (q.data ? summarizeBuilding(q.data.data) : null));
  return <>{children(all)}</>;
}

export default function CompareScreen() {
  const { optimizationId, projectId } = useLocalSearchParams<{ optimizationId: string; projectId?: string }>();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const compare = useAppStore((s) => s.compare);
  const compareIds = compare.optimizationId === optimizationId ? compare.designIds : [];
  const candidates = useCandidates(optimizationId);
  const sections = useSections();

  if (compareIds.length < 2) {
    return <EmptyState title="Nothing to compare" message="Select two or three candidates from the gallery." />;
  }

  return (
    <>
      <Stack.Screen options={{ title: "Compare designs" }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
        <QueryView query={candidates} loadingLabel="Loading candidates…">
          {({ data }) => {
            const outcomes = compareIds
              .map((id) => data.candidates.find((c) => c.design_id === id))
              .filter((o): o is DesignOutcome => Boolean(o));
            return (
              <DesignSummaries optimizationId={optimizationId} outcomes={outcomes}>
                {(buildings) => (
                  <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Comparison table, scroll sideways for more designs">
                    <View>
                      {/* Header row: design ids, tap to open results. */}
                      <View style={[styles.tr, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}>
                        <View style={[styles.labelCell, { padding: spacing.sm }]}>
                          <Text style={[typography.monoSmall, { color: colors.textSecondary }]}>METRIC</Text>
                        </View>
                        {outcomes.map((o) => (
                          <Pressable
                            key={o.design_id}
                            accessibilityRole="button"
                            accessibilityLabel={`Open results for ${o.design_id}`}
                            style={[styles.valueCell, { padding: spacing.sm }]}
                            onPress={() =>
                              router.push({ pathname: "/results/[optimizationId]/[designId]", params: { optimizationId, designId: o.design_id, projectId: projectId ?? "" } })
                            }
                          >
                            <Text style={[typography.monoStrong, { color: colors.primary }]}>{shortId(o.design_id)}</Text>
                            <Text style={[typography.monoSmall, { color: o.design_id === data.recommended_design_id ? colors.statusReady : colors.textSecondary }]}>
                              {o.design_id === data.recommended_design_id ? "RECOMMENDED" : "OPEN ›"}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {sections.map((section) => (
                        <View key={section.title}>
                          <View style={[styles.sectionRow, { backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
                            <Text style={[typography.label, { color: colors.accent }]}>{section.title.toUpperCase()}</Text>
                          </View>
                          {section.rows.map((row, ri) => (
                            <View
                              key={row.label}
                              style={[styles.tr, { borderColor: colors.border, backgroundColor: ri % 2 === 0 ? colors.surface : colors.background }]}
                            >
                              <View style={[styles.labelCell, { padding: spacing.sm }]}>
                                <Text style={[typography.caption, { color: colors.textBody }]}>{row.label}</Text>
                              </View>
                              {outcomes.map((o, i) => {
                                const v = row.get(o, buildings[i] ?? null);
                                return (
                                  <View key={o.design_id} style={[styles.valueCell, { padding: spacing.sm }]} accessible accessibilityLabel={`${row.label}, ${shortId(o.design_id)}: ${v}`}>
                                    <Text style={[typography.mono, { color: v === NOT_AVAILABLE ? colors.textSecondary : colors.textPrimary }]}>{v}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </DesignSummaries>
            );
          }}
        </QueryView>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  sectionRow: { marginTop: 8 },
  labelCell: { width: 150 },
  valueCell: { width: 140 },
});
