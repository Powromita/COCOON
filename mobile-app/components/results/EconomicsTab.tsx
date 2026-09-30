import React, { useState } from "react";
import { Text, View } from "react-native";

import { expectedScenario, firstYear, scenarios, sensitivityBySwing } from "../../adapters/economics";
import { useDesignEconomics } from "../../hooks/useCocoon";
import { useTheme } from "../../theme";
import { formatInr, formatWithUnit, humanize, NOT_AVAILABLE } from "../../utils/format";
import { BarList } from "../charts/BarList";
import { ChartCard } from "../charts/ChartCard";
import { AppCard } from "../common/AppCard";
import { KeyValueRow } from "../common/KeyValueRow";
import { MetricCard, MetricGrid } from "../common/MetricCard";
import { QueryView } from "../common/QueryView";
import { SectionHeader } from "../common/SectionHeader";
import { SelectField } from "../common/SelectField";
import { SourceNote } from "../common/StatusBanners";
import { Tag } from "../common/Tag";
import type { ResultsContext } from "./ResultsContext";

const years = (v: number | null | undefined) => (typeof v === "number" ? formatWithUnit(v, "years", 1) : NOT_AVAILABLE);

export function EconomicsTab({ ctx }: { ctx: ResultsContext }) {
  const { colors, spacing, typography } = useTheme();
  const economics = useDesignEconomics({
    optimizationId: ctx.optimizationId,
    designId: ctx.designId,
    building: ctx.building,
    requirements: ctx.requirements,
    weatherSnapshotId: ctx.job?.weatherSnapshotId,
    simulation: ctx.simulation.data?.data,
  });
  const [scenarioKey, setScenarioKey] = useState<string | null>(null);

  return (
    <QueryView query={economics} loadingLabel="Requesting lifecycle economics from M7…" errorTitle="Economics unavailable">
      {({ data: report, source, fetchedAt }) => {
        const all = scenarios(report);
        const active = all.find((s) => s.scenario === scenarioKey) ?? expectedScenario(report);
        if (!active) return <Text style={[typography.body, { color: colors.textSecondary }]}>The report contains no scenarios.</Text>;
        const r = active.result;
        const y1 = firstYear(r);
        return (
          <>
            <SourceNote source={source} fetchedAt={fetchedAt} />
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>{active.currency_context.label}</Text>
            <SelectField
              label="Scenario"
              value={active.scenario}
              onChange={setScenarioKey}
              options={all.map((s) => ({ value: s.scenario, label: humanize(s.scenario) }))}
            />

            <MetricGrid>
              <MetricCard label="CAPEX" value={formatInr(r.capex.total_capex_inr)} />
              <MetricCard label="Lifecycle cost" value={formatInr(r.lcc_inr)} caption="CAPEX + discounted OPEX" />
              <MetricCard label="Annual fuel cost" value={formatInr(y1?.fuel_cost_inr)} caption={y1 ? `Year ${y1.year}` : undefined} />
              <MetricCard label="Annual OPEX" value={formatInr(y1?.total_opex_inr)} caption={y1 ? `Year ${y1.year}, undiscounted` : undefined} />
              <MetricCard label="Annual fuel" value={formatWithUnit(r.annual_fuel_litres, "L", 0)} />
              <MetricCard
                label="NPV vs baseline"
                value={formatInr(r.npv_vs_baseline_inr)}
                caption={r.npv_vs_baseline_inr === null || r.npv_vs_baseline_inr === undefined ? "No baseline design was supplied to M7" : undefined}
              />
              <MetricCard label="Simple payback" value={years(r.simple_payback_years)} />
            </MetricGrid>
            <AppCard>
              <KeyValueRow label="Discounted payback" value={years(r.discounted_payback_years)} />
              <KeyValueRow label="Break-even year" value={r.break_even_year ? String(r.break_even_year) : NOT_AVAILABLE} />
              <KeyValueRow label="Installed heater" value={formatWithUnit(active.installed_heater_capacity_kw, "kW", 1)} />
              <KeyValueRow label="Shipped mass" value={formatWithUnit(active.shipped_mass_kg, "kg", 0)} last />
            </AppCard>

            <ChartCard title="CAPEX breakdown" summary={`CAPEX ${formatInr(r.capex.total_capex_inr)} split into materials, labour, transport and equipment.`}>
              <BarList
                rows={[
                  { key: "m", label: "Materials", value: r.capex.materials_inr, display: formatInr(r.capex.materials_inr) },
                  { key: "l", label: "Labour", value: r.capex.labour_inr, display: formatInr(r.capex.labour_inr) },
                  { key: "t", label: "Transport", value: r.capex.transport_inr, display: formatInr(r.capex.transport_inr) },
                  { key: "e", label: "Equipment", value: r.capex.equipment_inr, display: formatInr(r.capex.equipment_inr) },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="Operating cost by year"
              caption="Total undiscounted OPEX per operating year."
              summary={`${r.annual_cash_flows.length} years of operating cost.`}
              empty={r.annual_cash_flows.length === 0 ? "No yearly cash flows in the report." : null}
            >
              <BarList
                color={colors.chart[1]}
                rows={[...r.annual_cash_flows]
                  .sort((a, b) => a.year - b.year)
                  .map((y) => ({ key: String(y.year), label: `Year ${y.year}`, value: y.total_opex_inr, display: formatInr(y.total_opex_inr) }))}
              />
            </ChartCard>

            <ChartCard
              title="Lifecycle-cost sensitivity"
              caption="Change in lifecycle cost between each parameter's low and high value (M7)."
              summary={`${report.parameter_sensitivity.length} parameters ranked by lifecycle-cost swing.`}
              empty={report.parameter_sensitivity.length === 0 ? "The report has no sensitivity analysis." : null}
            >
              <BarList
                color={colors.chart[2]}
                rows={sensitivityBySwing(report.parameter_sensitivity).map((row) => ({
                  key: row.parameter,
                  label: `${row.parameter} (${row.low_value}–${row.high_value})`,
                  value: row.lcc_swing_inr,
                  display: formatInr(row.lcc_swing_inr, { compact: true }),
                }))}
              />
            </ChartCard>

            {report.warnings.length > 0 ? (
              <>
                <SectionHeader title="Warnings from M7" />
                {report.warnings.map((w) => (
                  <View key={w} style={{ marginBottom: spacing.xs }}>
                    <Tag label="Warning" tone="warning" />
                    <Text style={[typography.caption, { color: colors.textPrimary }]}>{w}</Text>
                  </View>
                ))}
              </>
            ) : null}
            {report.method_notes && report.method_notes.length > 0 ? (
              <>
                <SectionHeader title="Method notes" />
                {report.method_notes.map((n) => (
                  <Text key={n} style={[typography.caption, { color: colors.textSecondary, marginBottom: 4 }]}>
                    • {n}
                  </Text>
                ))}
              </>
            ) : null}
          </>
        );
      }}
    </QueryView>
  );
}
