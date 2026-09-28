import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { summarizeBuilding } from "../../adapters/building";
import { validationStateLabel } from "../../adapters/ansys";
import { candidateBadges, pickLabel, type CandidateBadge } from "../../adapters/candidates";
import { useDesign } from "../../hooks/useCocoon";
import { useT } from "../../i18n";
import { useAppStore } from "../../store/app.store";
import type { DesignOutcome } from "../../types/backend";
import { useTheme } from "../../theme";
import { formatInr, formatNumber, formatTemperature, formatWithUnit, humanize, NOT_AVAILABLE } from "../../utils/format";
import { AppCard } from "../common/AppCard";
import { SecondaryButton } from "../common/SecondaryButton";
import { Tag, type TagTone } from "../common/Tag";

const BADGE_TONE: Record<CandidateBadge, TagTone> = {
  RECOMMENDED: "accent",
  PARETO: "ready",
  SELECTED: "info",
  DOMINATED: "neutral",
  "BUDGET EXCLUDED": "warning",
  REJECTED: "danger",
};

interface CandidateCardProps {
  optimizationId: string;
  outcome: DesignOutcome;
  recommendedDesignId: string | null | undefined;
  selectedDesignId: string | null;
  inCompare: boolean;
  compareFull: boolean;
  onView: () => void;
  onToggleCompare: () => void;
  onSelect: () => void;
}

function Metric({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();
  const missing = value === NOT_AVAILABLE;
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[typography.monoSmall, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <Text style={[missing ? typography.mono : typography.monoStrong, { color: missing ? colors.textSecondary : colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

/** One M6 candidate: backend-reported metrics, status badges and its BuildingModel geometry. */
export function CandidateCard({
  optimizationId,
  outcome,
  recommendedDesignId,
  selectedDesignId,
  inCompare,
  compareFull,
  onView,
  onToggleCompare,
  onSelect,
}: CandidateCardProps) {
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const unit = useAppStore((s) => s.temperatureUnit);
  const design = useDesign(optimizationId, outcome.design_id);
  const summary = design.data ? summarizeBuilding(design.data.data) : null;
  const o = outcome.objectives;
  const badges = candidateBadges(outcome, recommendedDesignId, selectedDesignId);
  const selected = badges.includes("SELECTED");

  return (
    <AppCard emphasis={badges.includes("RECOMMENDED") ? "accent" : "none"}>
      <Text style={[typography.monoSmall, { color: colors.textSecondary }]}>DESIGN ID</Text>
      <Text style={[typography.monoStrong, { color: colors.textPrimary }]} selectable>
        {outcome.design_id}
      </Text>
      <View style={[styles.tags, { marginVertical: spacing.sm }]}>
        {badges.map((b) => (
          <Tag key={b} label={b} tone={BADGE_TONE[b]} />
        ))}
        {outcome.picked_as.map((p) => (
          <Tag key={p} label={pickLabel(p).toUpperCase()} tone="info" />
        ))}
        {outcome.development_only ? <Tag label="DEVELOPMENT STAND-IN" tone="danger" /> : null}
      </View>
      {badges.includes("RECOMMENDED") ? (
        <Text style={[typography.caption, { color: colors.accent, marginBottom: spacing.sm }]}>Recommended by optimization engine (M6)</Text>
      ) : null}

      <View style={[styles.grid, { borderColor: colors.border }]}>
        <Metric label="Thermal (passive min)" value={formatTemperature(o.passive_min_temperature_c, unit)} />
        <Metric label="Unmet hours" value={formatWithUnit(o.unmet_hours, "h")} />
        <Metric label="Heating energy" value={formatWithUnit(o.heating_energy_kwh, "kWh", 2)} />
        <Metric label="Peak heating" value={formatWithUnit(o.peak_heating_kw, "kW", 2)} />
        <Metric label="CAPEX" value={formatInr(o.capex_inr, { compact: true })} />
        <Metric label="Lifecycle cost" value={formatInr(o.lcc_inr, { compact: true })} />
      </View>

      <Text style={[typography.caption, { color: colors.textBody, marginTop: spacing.sm }]}>
        Validation: {validationStateLabel(outcome.recommendation_state)}
      </Text>
      <Text style={[typography.caption, { color: colors.textBody }]}>
        {summary
          ? `${summary.floorCount} floor${summary.floorCount === 1 ? "" : "s"} · ${summary.zones.length} rooms · ${formatNumber(summary.totalFloorAreaM2, 1)} m² · reliability ${formatNumber(o.reliability, 2)}`
          : design.isError
            ? "Geometry could not be loaded"
            : "Loading geometry…"}
      </Text>
      {outcome.failed_constraints.length > 0 ? (
        <Text style={[typography.caption, { color: colors.statusWarning }]}>
          Failed checks: {outcome.failed_constraints.map(humanize).join(", ")}
        </Text>
      ) : null}
      {outcome.reason ? (
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Optimizer: {outcome.reason}</Text>
      ) : null}

      <View style={[styles.actions, { marginTop: spacing.md }]}>
        <View style={styles.action}>
          <SecondaryButton label={t("View")} onPress={onView} />
        </View>
        <View style={styles.action}>
          <SecondaryButton label={inCompare ? "Remove" : t("Compare")} onPress={onToggleCompare} disabled={!inCompare && compareFull} />
        </View>
        <View style={styles.action}>
          <SecondaryButton label={selected ? "Selected" : t("Select")} onPress={onSelect} disabled={selected} />
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, rowGap: 10 },
  metric: { width: "50%", paddingRight: 8 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1 },
});
