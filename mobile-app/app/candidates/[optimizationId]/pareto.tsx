/**
 * Pareto view — GET /api/v1/optimizations/{id}/pareto plus the candidate
 * objective values. Axes are chosen from the objectives the backend lists;
 * front membership and the named picks (with their explanation sentences)
 * are the backend's. Nothing is re-ranked here.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { objectiveDef, pickLabel } from "../../../adapters/candidates";
import { formatObjectiveByKey, objectiveAxisLabel } from "../../../components/candidates/objectiveFormat";
import { ChartCard } from "../../../components/charts/ChartCard";
import { ScatterChart, type ScatterPoint } from "../../../components/charts/ScatterChart";
import { AppCard } from "../../../components/common/AppCard";
import { ErrorView } from "../../../components/common/ErrorView";
import { KeyValueRow } from "../../../components/common/KeyValueRow";
import { LoadingState } from "../../../components/common/LoadingState";
import { SecondaryButton } from "../../../components/common/SecondaryButton";
import { SectionHeader } from "../../../components/common/SectionHeader";
import { SelectField } from "../../../components/common/SelectField";
import { Tag } from "../../../components/common/Tag";
import { useCandidates, usePareto } from "../../../hooks/useCocoon";
import { useAppStore } from "../../../store/app.store";
import { useTheme } from "../../../theme";
import type { DesignOutcome } from "../../../types/backend";
import { convertTemperature, formatNumber } from "../../../utils/format";

function varies(outcomes: DesignOutcome[], key: string): boolean {
  return new Set(outcomes.map((o) => o.objectives[key])).size > 1;
}

export default function ParetoScreen() {
  const { optimizationId, projectId } = useLocalSearchParams<{ optimizationId: string; projectId?: string }>();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const unit = useAppStore((s) => s.temperatureUnit);
  const pareto = usePareto(optimizationId);
  const candidates = useCandidates(optimizationId);
  const [xKey, setXKey] = useState<string | null>(null);
  const [yKey, setYKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const outcomes = useMemo(() => candidates.data?.data.candidates ?? [], [candidates.data]);
  const objectives = pareto.data?.data.pareto?.objectives ?? [];

  // Defaults: a cost axis and the first thermal objective that actually differs between designs.
  const defaultX = objectives.find((k) => objectiveDef(k)?.kind === "inr" && varies(outcomes, k)) ?? objectives[0];
  const defaultY = objectives.find((k) => objectiveDef(k)?.kind !== "inr" && varies(outcomes, k)) ?? objectives[1];
  const xk = xKey ?? defaultX;
  const yk = yKey ?? defaultY;

  const points: ScatterPoint[] = useMemo(() => {
    if (!xk || !yk) return [];
    const front = new Set(pareto.data?.data.pareto?.front ?? []);
    const rec = candidates.data?.data.recommended_design_id;
    const toDisplay = (key: string, v: number) => {
      const k = objectiveDef(key)?.kind;
      return k === "temperature" ? convertTemperature(v, unit) : k === "temperature_delta" && unit === "F" ? v * 1.8 : v;
    };
    return outcomes.flatMap((o) => {
      const x = o.objectives[xk];
      const y = o.objectives[yk];
      if (typeof x !== "number" || typeof y !== "number") return [];
      const kind: ScatterPoint["kind"] = o.design_id === rec ? "recommended" : front.has(o.design_id) ? "front" : "other";
      return [{ id: o.design_id, x: toDisplay(xk, x), y: toDisplay(yk, y), kind, label: o.design_id }];
    });
  }, [outcomes, xk, yk, pareto.data, candidates.data, unit]);

  if (pareto.isError || candidates.isError) {
    const retry = () => {
      void pareto.refetch();
      void candidates.refetch();
    };
    return (
      <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>
        <ErrorView error={pareto.error ?? candidates.error} onRetry={retry} />
      </View>
    );
  }
  if (!pareto.data || !candidates.data) return <LoadingState label="Loading trade-offs…" />;

  const axisOptions = objectives.map((k) => ({ value: k, label: objectiveDef(k)?.label ?? k }));
  const sel = outcomes.find((o) => o.design_id === selected);
  const picks = Object.values(pareto.data.data.picks.picks);

  return (
    <>
      <Stack.Screen options={{ title: "Trade-offs" }} />
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
        <SelectField label="Horizontal axis" options={axisOptions} value={xk} onChange={setXKey} />
        <SelectField label="Vertical axis" options={axisOptions} value={yk} onChange={setYKey} />
        {xk && yk ? (
          <ChartCard
            title={`${objectiveDef(yk)?.label ?? yk} vs ${objectiveDef(xk)?.label ?? xk}`}
            caption="Tap a point for details. Lower is better for both unless the objective says otherwise."
            summary={`Scatter of ${points.length} designs. ${points.filter((p) => p.kind !== "other").length} are on the Pareto front.`}
            empty={points.length === 0 ? "The designs have no values for these objectives." : null}
            legend={[
              { label: "Recommended (square)", color: colors.chart[1] },
              { label: "Pareto front", color: colors.chart[0] },
              { label: "Dominated (hollow)", color: colors.chartAmbient, dashed: true },
            ]}
          >
            <ScatterChart points={points} xLabel={objectiveAxisLabel(xk, unit)} yLabel={objectiveAxisLabel(yk, unit)} selectedId={selected} onSelect={setSelected} />
          </ChartCard>
        ) : null}

        {sel && xk && yk ? (
          <AppCard emphasis="accent">
            <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} selectable>
              {sel.design_id}
            </Text>
            <KeyValueRow label={objectiveDef(xk)?.label ?? xk} value={formatObjectiveByKey(xk, sel.objectives[xk], unit)} />
            <KeyValueRow label={objectiveDef(yk)?.label ?? yk} value={formatObjectiveByKey(yk, sel.objectives[yk], unit)} />
            <KeyValueRow label="Pareto rank" value={formatNumber(pareto.data.data.pareto?.rank[sel.design_id], 0)} last />
            <View style={{ marginTop: spacing.sm }}>
              <SecondaryButton
                label="Open results"
                onPress={() =>
                  router.push({ pathname: "/results/[optimizationId]/[designId]", params: { optimizationId, designId: sel.design_id, projectId: projectId ?? "" } })
                }
              />
            </View>
          </AppCard>
        ) : null}

        <SectionHeader title="Optimizer picks" caption="Chosen and explained by the backend (M6)." />
        {picks.map((pick) => (
          <AppCard key={pick.name}>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", flexWrap: "wrap" }}>
              <Tag label={pickLabel(pick.name)} tone="ready" />
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} selectable>
                {pick.design_id ?? "No eligible design"}
              </Text>
            </View>
            <Text style={[typography.caption, { color: colors.textSecondary, marginVertical: spacing.xs }]}>{pick.reason}</Text>
            {(pick.explanation ?? []).map((e) => (
              <Text key={e.sentence} style={[typography.caption, { color: colors.textPrimary, marginBottom: 2 }]}>
                • {e.sentence}
              </Text>
            ))}
            {pick.runner_up ? (
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>Runner-up: {pick.runner_up}</Text>
            ) : null}
          </AppCard>
        ))}
        {(pareto.data.data.picks.warnings ?? []).map((w) => (
          <Text key={w} style={[typography.caption, { color: colors.statusWarning }]}>
            Warning: {w}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}
