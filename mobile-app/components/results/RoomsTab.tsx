import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { findZone, materialsForZone } from "../../adapters/building";
import { comfortLabel, temperatureChart, zoneResults } from "../../adapters/simulation";
import { useAppStore } from "../../store/app.store";
import { useTheme } from "../../theme";
import { convertTemperature, formatNumber, formatTemperature, formatWithUnit, humanize } from "../../utils/format";
import { ChartCard } from "../charts/ChartCard";
import { LineChart } from "../charts/LineChart";
import { AppCard } from "../common/AppCard";
import { KeyValueRow } from "../common/KeyValueRow";
import { QueryView } from "../common/QueryView";
import { SectionHeader } from "../common/SectionHeader";
import { Tag } from "../common/Tag";
import type { ResultsContext } from "./ResultsContext";

export function RoomsTab({ ctx }: { ctx: ResultsContext }) {
  const { colors, spacing, typography } = useTheme();
  const unit = useAppStore((s) => s.temperatureUnit);
  const [open, setOpen] = useState<string | null>(null);
  const tsChart = useMemo(() => (ctx.timeseries.data ? temperatureChart(ctx.timeseries.data.data) : null), [ctx.timeseries.data]);
  const toDisplay = useMemo(() => (v: number) => convertTemperature(v, unit), [unit]);

  return (
    <QueryView query={ctx.simulation} loadingLabel="Loading simulation…" isEmpty={(d) => d.data.zones.length === 0} emptyTitle="No rooms reported">
      {({ data: sim }) => (
        <>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            Per-room results from the RC engine ({sim.engine.name} {sim.engine.version}, {humanize(sim.engine.mode)}). Tap a room for
            details.
          </Text>
          {zoneResults(sim).map((z) => {
            const comfort = comfortLabel(z.unmetHours);
            const expanded = open === z.zoneId;
            const geo = ctx.building ? findZone(ctx.building, z.zoneId) : undefined;
            const zoneSeries = tsChart?.series.filter((s) => s.key === "__ambient" || s.key === z.zoneId) ?? [];
            return (
              <AppCard key={z.zoneId}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${humanize(z.zoneId)}, mean ${formatTemperature(z.meanC, unit)}, ${comfort.label}`}
                  onPress={() => setOpen(expanded ? null : z.zoneId)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={[typography.subtitle, { color: colors.textPrimary, flex: 1 }]}>{humanize(z.zoneId)}</Text>
                    <Tag label={comfort.label} tone={comfort.tone === "ok" ? "ready" : comfort.tone === "warn" ? "warning" : "neutral"} />
                  </View>
                  <Text style={[typography.body, { color: colors.textPrimary, marginTop: spacing.xs }]}>
                    {formatTemperature(z.meanC, unit)} mean · {formatTemperature(z.minC, unit)} min · {formatTemperature(z.maxC, unit)} max
                  </Text>
                  <Text style={[typography.caption, { color: colors.accent, marginTop: spacing.xs }]}>{expanded ? "Hide details" : "Show details"}</Text>
                </Pressable>
                {expanded ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <KeyValueRow label="Comfort hours" value={formatWithUnit(z.comfortHours, "h", 0)} />
                    <KeyValueRow label="Unmet hours" value={formatWithUnit(z.unmetHours, "h", 1)} />
                    <KeyValueRow label="Peak heater output" value={z.peakHeatingKw === null ? "Not reported" : formatWithUnit(z.peakHeatingKw, "kW", 2)} />
                    <KeyValueRow
                      label="Size (L × W × H)"
                      value={geo ? `${formatNumber(geo.lengthM, 2)} × ${formatNumber(geo.widthM, 2)} × ${formatNumber(geo.heightM, 2)} m` : undefined}
                    />
                    <KeyValueRow label="Floor" value={geo ? String(geo.floorLevel) : undefined} />
                    <KeyValueRow label="Envelope materials" value={ctx.building ? materialsForZone(ctx.building, z.zoneId).join(", ") : undefined} last />
                    {zoneSeries.length > 1 && tsChart ? (
                      <View style={{ marginTop: spacing.md }}>
                        <ChartCard
                          title="Temperature over time"
                          summary={`${humanize(z.zoneId)} air temperature and outdoor temperature over ${tsChart.timestamps.length} hourly steps.`}
                          legend={[
                            { label: humanize(z.zoneId), color: colors.chart[0] },
                            { label: "Outdoor", color: colors.chartAmbient, dashed: true },
                          ]}
                        >
                          <LineChart
                            timestamps={tsChart.timestamps}
                            series={zoneSeries}
                            transform={toDisplay}
                            yLabel={`°${unit}`}
                            styleFor={(s) => (s.key === "__ambient" ? { color: colors.chartAmbient, dashed: true } : { color: colors.chart[0] })}
                          />
                        </ChartCard>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </AppCard>
            );
          })}

          <SectionHeader title="Inter-zone connections" caption="From the BuildingModel. The simulation contract does not report heat exchanged between rooms." />
          <AppCard>
            {(ctx.building?.connections ?? []).length === 0 ? (
              <Text style={[typography.caption, { color: colors.textSecondary }]}>No connections listed.</Text>
            ) : (
              ctx.building?.connections.map((c, i, arr) => (
                <KeyValueRow
                  key={c.id}
                  label={`${humanize(c.zone_a_id)} ↔ ${humanize(c.zone_b_id)}`}
                  value={`${humanize(c.connection_type)}${typeof c.shared_area_m2 === "number" ? ` · ${formatNumber(c.shared_area_m2, 1)} m²` : ""}`}
                  last={i === arr.length - 1}
                />
              ))
            )}
          </AppCard>
        </>
      )}
    </QueryView>
  );
}
