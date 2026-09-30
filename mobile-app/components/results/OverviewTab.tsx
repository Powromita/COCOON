import React from "react";
import { Text, View } from "react-native";

import { summarizeBuilding } from "../../adapters/building";
import { pickLabel } from "../../adapters/candidates";
import { validationStateLabel } from "../../adapters/ansys";
import { zoneResults } from "../../adapters/simulation";
import { useAppStore } from "../../store/app.store";
import { useTheme } from "../../theme";
import { formatInr, formatTemperature, formatWithUnit, humanize, NOT_AVAILABLE } from "../../utils/format";
import { AppCard } from "../common/AppCard";
import { ErrorView } from "../common/ErrorView";
import { MetricCard, MetricGrid } from "../common/MetricCard";
import { SectionHeader } from "../common/SectionHeader";
import { Tag } from "../common/Tag";
import type { ResultsContext } from "./ResultsContext";

export function OverviewTab({ ctx }: { ctx: ResultsContext }) {
  const { colors, spacing, typography } = useTheme();
  const unit = useAppStore((s) => s.temperatureUnit);
  const b = ctx.building ? summarizeBuilding(ctx.building) : null;
  const sim = ctx.simulation.data?.data;
  const zones = sim ? zoneResults(sim) : [];
  const coldest = zones.length > 0 ? zones.reduce((a, z) => (z.minC < a.minC ? z : a)) : null;
  const o = ctx.outcome?.objectives;
  const recommended = ctx.recommendedDesignId === ctx.designId;

  return (
    <>
      <SectionHeader title="Recommendation" />
      <AppCard emphasis={recommended ? "accent" : "none"}>
        {recommended ? (
          <Tag label="Recommended by optimization engine" tone="accent" />
        ) : (
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            {ctx.recommendedDesignId
              ? `The optimizer recommends ${ctx.recommendedDesignId}, not this design.`
              : "The optimizer did not name a recommended design."}
          </Text>
        )}
        {ctx.picks.map((p) => (
          <View key={p.name} style={{ marginTop: spacing.sm }}>
            <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{pickLabel(p.name)}</Text>
            {(p.explanation ?? []).map((e) => (
              <Text key={e.sentence} style={[typography.caption, { color: colors.textPrimary }]}>
                • {e.sentence}
              </Text>
            ))}
          </View>
        ))}
        {ctx.outcome?.reason ? (
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>Optimizer: {ctx.outcome.reason}</Text>
        ) : null}
      </AppCard>

      <SectionHeader title="Geometry" caption="From the design's BuildingModel." />
      <MetricGrid>
        <MetricCard label="Floors" value={b ? String(b.floorCount) : NOT_AVAILABLE} />
        <MetricCard label="Rooms" value={b ? String(b.zones.length) : NOT_AVAILABLE} caption={b ? b.zones.map((z) => humanize(z.type)).join(", ") : undefined} />
        <MetricCard label="Floor area" value={b ? formatWithUnit(b.totalFloorAreaM2, "m²") : NOT_AVAILABLE} caption="Sum of room floor areas" />
        <MetricCard label="Window area" value={b ? formatWithUnit(b.windowAreaM2, "m²") : NOT_AVAILABLE} />
      </MetricGrid>

      <SectionHeader title="Temperature and comfort" caption="RC simulation (M4) over the analysis window." />
      {ctx.simulation.isError ? <ErrorView compact error={ctx.simulation.error} onRetry={() => void ctx.simulation.refetch()} /> : null}
      <MetricGrid>
        <MetricCard label="Occupied comfort hours" value={formatWithUnit(sim?.summary?.occupied_comfort_hours, "h", 0)} />
        <MetricCard label="Unmet hours" value={formatWithUnit(sim?.summary?.unmet_hours, "h", 1)} />
        <MetricCard
          label="Lowest room temperature"
          value={coldest ? formatTemperature(coldest.minC, unit) : NOT_AVAILABLE}
          caption={coldest ? `in ${humanize(coldest.zoneId)}` : undefined}
        />
        <MetricCard label="Heating energy" value={formatWithUnit(sim?.summary?.heating_energy_kwh, "kWh", 2)} />
      </MetricGrid>

      <SectionHeader title="Cost" caption="Priced by M7 during optimization (expected scenario)." />
      <MetricGrid>
        <MetricCard label="CAPEX" value={formatInr(o?.capex_inr)} />
        <MetricCard label="Lifecycle cost" value={formatInr(o?.lcc_inr)} />
      </MetricGrid>

      <SectionHeader title="Validation" />
      <AppCard>
        <Text style={[typography.body, { color: colors.textPrimary }]}>
          {validationStateLabel(ctx.outcome?.recommendation_state ?? ctx.job?.validationState)}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
          Run-level state: {validationStateLabel(ctx.job?.validationState)}. See the Validation tab for ANSYS.
        </Text>
      </AppCard>
    </>
  );
}
