import React from "react";
import { Text, View } from "react-native";

import { useRunReport } from "../../hooks/useCocoon";
import type { FinalReportData } from "../../services/interfaces/OptimizationHistoryService";
import { useTheme } from "../../theme";
import { formatInr, formatNumber, formatWithUnit, humanize } from "../../utils/format";
import { AppCard } from "../common/AppCard";
import { KeyValueRow } from "../common/KeyValueRow";
import { SectionHeader } from "../common/SectionHeader";

const years = (v: number | null | undefined) => (v === null || v === undefined ? "No payback" : `${formatNumber(v, 1)} yr`);

/**
 * What the website's report view shows beyond the per-design tabs: why this design, the sized heater, the wall /
 * roof / floor build-ups, unheated vs heated comparison and the cost scenarios. Hidden when the backend has no
 * report for this run yet (not finished, or an older backend).
 */
export function ReportSection({ optimizationId }: { optimizationId: string }) {
  const { colors, spacing, typography } = useTheme();
  const report = useRunReport(optimizationId).data?.report;
  if (!report) return null;
  const { design, performance, economics, recommendation }: FinalReportData = report;
  const heater = design?.heater_plan;
  const free = performance?.free_floating?.summary;
  const heated = performance?.conditioned_with_sized_heater?.summary;
  const scenarios = Object.entries(economics?.scenarios ?? {});

  return (
    <>
      {recommendation?.why?.length ? (
        <>
          <SectionHeader title="Why this design" />
          <AppCard>
            {recommendation.why.map((w) => (
              <Text key={w.sentence} style={[typography.caption, { color: colors.textPrimary }]}>
                • {w.sentence}
              </Text>
            ))}
          </AppCard>
        </>
      ) : null}

      {design ? (
        <>
          <SectionHeader title="Design and heater" caption="From the run's final report." />
          <AppCard>
            <KeyValueRow label="Template" value={design.template ? humanize(design.template) : undefined} />
            <KeyValueRow label="Orientation" value={formatWithUnit(design.orientation_deg, "°", 0)} />
            <KeyValueRow label="Glazing" value={design.glazing ? humanize(design.glazing) : undefined} />
            <KeyValueRow label="Air changes" value={formatWithUnit(design.air_changes_per_hour, "ACH", 2)} />
            <KeyValueRow
              label="Heater"
              value={heater ? `${formatWithUnit(heater.capacity_kw_each, "kW", 2)} each${heater.fuel ? ` · ${humanize(heater.fuel)}` : ""}` : "No heater planned"}
              last
            />
          </AppCard>
        </>
      ) : null}

      {design?.assemblies?.length ? (
        <>
          <SectionHeader title="Wall, roof and floor build-ups" caption="Layers listed inside to outside." />
          {design.assemblies.map((a) => (
            <AppCard key={a.id}>
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{a.name}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                U-value {formatWithUnit(a.u_value_w_m2k, "W/m²K", 2)}
                {a.used_for?.length ? ` · ${a.used_for.map(humanize).join(", ")}` : ""}
              </Text>
              <View style={{ marginTop: spacing.xs }}>
                {(a.layers_inner_to_outer ?? []).map((l, i) => (
                  <Text key={`${l.material}-${i}`} style={[typography.caption, { color: colors.textPrimary }]}>
                    {i + 1}. {l.name ?? humanize(l.material)} — {formatNumber(l.thickness_mm, 0)} mm
                  </Text>
                ))}
              </View>
            </AppCard>
          ))}
        </>
      ) : null}

      {free || heated ? (
        <>
          <SectionHeader title="Unheated vs heated" caption="Same design with and without the sized heater." />
          <AppCard>
            <KeyValueRow label="Unmet hours (unheated)" value={formatWithUnit(free?.unmet_hours, "h", 0)} />
            <KeyValueRow label="Unmet hours (heated)" value={formatWithUnit(heated?.unmet_hours, "h", 0)} />
            <KeyValueRow label="Heating energy (heated)" value={formatWithUnit(heated?.heating_energy_kwh, "kWh", 1)} last />
          </AppCard>
        </>
      ) : null}

      {scenarios.length > 0 ? (
        <>
          <SectionHeader title="Cost scenarios" caption="Expected, conservative and optimistic price paths." />
          {scenarios.map(([name, s]) => (
            <AppCard key={name}>
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{humanize(name)}</Text>
              <KeyValueRow label="CAPEX" value={formatInr(s.capex?.total_capex_inr)} />
              <KeyValueRow label="Lifecycle cost" value={formatInr(s.lcc_inr)} />
              <KeyValueRow label="Fuel per year" value={formatWithUnit(s.annual_fuel_litres, "L", 0)} />
              <KeyValueRow label="NPV vs baseline" value={formatInr(s.npv_vs_baseline_inr)} />
              <KeyValueRow label="Simple payback" value={years(s.simple_payback_years)} />
              <KeyValueRow label="Discounted payback" value={years(s.discounted_payback_years)} last />
            </AppCard>
          ))}
        </>
      ) : null}
    </>
  );
}
