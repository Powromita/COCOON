/**
 * Energy tab — the three DRDO-style charts, all from the backend's hourly
 * simulation series:
 *   1. Inside temperature: room air temperatures, outdoor, the target
 *      setpoint band, and the 0 °C reference.
 *   2. Solar energy: daily solar gain (peak day highlighted) and total.
 *   3. Heat flow: indoor–outdoor ΔT per room and total heater output.
 * Semantic colors: temperature green/neutral, solar navy + amber peak,
 * heat flow engineering teal.
 */
import React, { useMemo } from "react";
import { Text } from "react-native";

import {
  dailySolarEnergy,
  deltaTChart,
  hasAnyNonZero,
  temperatureChart,
  totalHeatingChart,
  type ChartSeries,
} from "../../adapters/simulation";
import { useAppStore } from "../../store/app.store";
import { useTheme } from "../../theme";
import { convertTemperature, formatDate, formatNumber, formatTemperature, formatWithUnit, humanize } from "../../utils/format";
import { BarList } from "../charts/BarList";
import { ChartCard, type LegendItem } from "../charts/ChartCard";
import { LineChart } from "../charts/LineChart";
import { AppCard } from "../common/AppCard";
import { MetricCard, MetricGrid } from "../common/MetricCard";
import { QueryView } from "../common/QueryView";
import { SectionHeader } from "../common/SectionHeader";
import type { ResultsContext } from "./ResultsContext";

/** Teal-family shades for per-room heat-flow lines. */
const TEAL_SHADES = ["#0F7A8C", "#006878", "#2FA3B5", "#5CC2D0", "#0B4F5C"];

export function EnergyTab({ ctx }: { ctx: ResultsContext }) {
  const { colors, spacing, typography } = useTheme();
  const unit = useAppStore((s) => s.temperatureUnit);
  const sim = ctx.simulation.data?.data;
  const toDisplay = useMemo(() => (v: number) => convertTemperature(v, unit), [unit]);
  const target = ctx.requirements?.mission.target_temperature_c;
  const heatLossSentences = ctx.picks.flatMap((p) => (p.explanation ?? []).filter((e) => /heat-loss|heat loss/i.test(e.sentence)));

  const roomColor = (s: ChartSeries, i: number) =>
    s.key === "__ambient" ? { color: colors.chartAmbient, dashed: true } : { color: i === 1 ? colors.chartTemperature : colors.chart[(i + 1) % colors.chart.length] };
  const legendFor = (series: ChartSeries[], styleOf: (s: ChartSeries, i: number) => { color: string; dashed?: boolean }): LegendItem[] =>
    series.map((s, i) => ({ label: s.key === "__ambient" ? "Outdoor" : humanize(s.label), ...styleOf(s, i) }));

  return (
    <>
      <SectionHeader title="Energy balance summary" caption="RC simulation (M4) over the analysis window." />
      <MetricGrid>
        <MetricCard label="Heating energy" value={formatWithUnit(sim?.summary?.heating_energy_kwh, "kWh", 2)} />
        <MetricCard label="Peak heating" value={formatWithUnit(sim?.summary?.peak_heating_kw, "kW", 2)} />
        <MetricCard
          label="Energy residual"
          value={sim?.summary ? `${formatNumber(sim.summary.energy_residual_max_pct, 6)} %` : formatNumber(undefined)}
          caption="Worst-case solver residual (M4)"
        />
        <MetricCard label="Timestep" value={sim ? formatWithUnit(sim.engine.timestep_seconds / 60, "min", 0) : formatNumber(undefined)} />
      </MetricGrid>

      <QueryView query={ctx.timeseries} loadingLabel="Loading hourly results…">
        {({ data: ts }) => {
          const temp = temperatureChart(ts);
          const days = dailySolarEnergy(ts);
          // The peak is chosen among full days only, so a partial first/last day can't win or lose unfairly.
          const fullDays = days.filter((d) => d.hours >= 24);
          const peak = (fullDays.length > 0 ? fullDays : days).reduce<(typeof days)[number] | null>((a, d) => (a === null || d.kwh > a.kwh ? d : a), null);
          const totalSolar = days.reduce((s, d) => s + d.kwh, 0);
          const dT = deltaTChart(ts);
          const heat = totalHeatingChart(ts);
          const refLines = [
            { value: toDisplay(0), color: colors.textSecondary, label: `0 °C`, dashed: true },
            ...(typeof target === "number" ? [{ value: toDisplay(target), color: colors.statusReady, label: `Target ${formatTemperature(target, unit, 0)}` }] : []),
          ];
          return (
            <>
              <ChartCard
                title="Inside temperature"
                caption={
                  typeof target === "number"
                    ? `Shaded: at or above the ${formatTemperature(target, unit, 0)} target setpoint from the requirements.`
                    : "No target temperature was set, so no comfort band is drawn."
                }
                summary={`Air temperature of ${temp.series.length - 1} rooms and outdoor temperature over ${ts.points.length} steps.`}
                legend={legendFor(temp.series, roomColor)}
                empty={temp.series.length <= 1 ? "The timeseries has no room temperatures." : null}
              >
                <LineChart
                  timestamps={temp.timestamps}
                  series={temp.series}
                  yLabel={`°${unit}`}
                  transform={toDisplay}
                  styleFor={roomColor}
                  refLines={refLines}
                  band={typeof target === "number" ? { from: toDisplay(target), color: colors.chartComfortBand } : undefined}
                />
              </ChartCard>

              <ChartCard
                title="Solar energy through glazing"
                caption={
                  days.length > 0
                    ? `Total ${formatWithUnit(totalSolar, "kWh", 1)} · peak day ${peak ? formatDate(peak.day) : "N/A"} (amber). Summed from the simulation's hourly solar gain; each hour counts toward the day it began.`
                    : undefined
                }
                summary={`Daily solar energy for ${days.length} days, total ${formatNumber(totalSolar, 1)} kWh.`}
                empty={days.length === 0 ? "Solar gain is not reported in this timeseries." : totalSolar === 0 ? "Solar gain was zero throughout this window." : null}
              >
                <BarList
                  color={colors.chartSolar}
                  highlightKey={peak?.day}
                  highlightColor={colors.chartSolarHighlight}
                  rows={days.map((d) => ({
                    key: d.day,
                    label: d.hours < 24 ? `${formatDate(d.day)} (partial: ${formatNumber(d.hours, 0)} h)` : formatDate(d.day),
                    value: d.kwh,
                    display: formatWithUnit(d.kwh, "kWh", 2),
                  }))}
                />
              </ChartCard>

              <ChartCard
                title="Heat flow: indoor–outdoor ΔT"
                caption="Room air temperature minus outdoor temperature (K), from the hourly series."
                summary={`Temperature difference between each of ${dT.series.length} rooms and outdoors over ${ts.points.length} steps.`}
                legend={dT.series.map((s, i) => ({ label: humanize(s.label), color: TEAL_SHADES[i % TEAL_SHADES.length] }))}
                empty={dT.series.length === 0 ? "The timeseries has no room temperatures." : null}
              >
                <LineChart
                  timestamps={dT.timestamps}
                  series={dT.series}
                  yLabel={unit === "F" ? "ΔT (°F)" : "ΔT (K)"}
                  transform={unit === "F" ? (v) => v * 1.8 : undefined}
                  styleFor={(_, i) => ({ color: TEAL_SHADES[i % TEAL_SHADES.length] })}
                />
              </ChartCard>

              <ChartCard
                title="Heater output"
                caption="Summed over all rooms (W)."
                summary={`Total heating power over ${ts.points.length} steps.`}
                legend={[{ label: "All rooms", color: colors.chartHeatFlow }]}
                empty={!hasAnyNonZero(heat) ? "No heating was needed during this window (heater output 0 W throughout, as reported)." : null}
              >
                <LineChart timestamps={heat.timestamps} series={heat.series} yLabel="W" styleFor={() => ({ color: colors.chartHeatFlow })} />
              </ChartCard>
            </>
          );
        }}
      </QueryView>

      <SectionHeader title="Heat flow by path" />
      <AppCard>
        <Text style={[typography.body, { color: colors.textBody }]}>
          Wall, roof, ground and window heat flows are not part of the M0 SimulationResult, so they are not shown.
        </Text>
        {heatLossSentences.length > 0 ? (
          <>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
              The optimizer’s explanation for this design includes:
            </Text>
            {heatLossSentences.map((e) => (
              <Text key={e.sentence} style={[typography.caption, { color: colors.textPrimary, marginTop: 2 }]}>
                • {e.sentence}
              </Text>
            ))}
          </>
        ) : null}
      </AppCard>
    </>
  );
}
