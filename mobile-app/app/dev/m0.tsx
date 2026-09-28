/**
 * Developer diagnostics: the runtime guard result for every fixture (M0
 * samples and the recorded backend run) and the recording's provenance.
 * Renders failures inline — it never throws.
 */
import React from "react";
import { ScrollView, Text, View } from "react-native";

import { AppCard } from "../../components/common/AppCard";
import { KeyValueRow } from "../../components/common/KeyValueRow";
import { SectionHeader } from "../../components/common/SectionHeader";
import { FixtureBanner } from "../../components/common/StatusBanners";
import { Tag } from "../../components/common/Tag";
import { FIXTURE_DIAGNOSTICS, RECORDED_MANIFEST } from "../../mocks/fixtureLoader";
import { useTheme } from "../../theme";

export default function M0DiagnosticsScreen() {
  const { colors, spacing, typography } = useTheme();
  const failed = FIXTURE_DIAGNOSTICS.filter((d) => !d.check.ok).length;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
      <FixtureBanner detail="Everything on this screen is fixture data: M0 samples and one recorded backend run." />
      <Text style={[typography.body, { color: colors.textPrimary }]}>
        {FIXTURE_DIAGNOSTICS.length} fixtures · {failed === 0 ? "all passed the runtime guard" : `${failed} failed`}
      </Text>

      <SectionHeader title="Recorded run" />
      <AppCard>
        <KeyValueRow label="Optimization" value={RECORDED_MANIFEST.optimization_id} mono />
        <KeyValueRow label="Recorded" value={RECORDED_MANIFEST.recorded_at} />
        <KeyValueRow label="Backend" value={RECORDED_MANIFEST.backend_commit} last />
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>{RECORDED_MANIFEST.how}</Text>
      </AppCard>

      <SectionHeader title="Guard results" caption="Required keys present and schema_version 4.0 — not full JSON Schema validation." />
      {FIXTURE_DIAGNOSTICS.map((d) => (
        <AppCard key={d.name} emphasis={d.check.ok ? "none" : "demo"}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={[typography.caption, { color: colors.textPrimary, flex: 1, fontFamily: "monospace" }]}>{d.name}</Text>
            <Tag label={d.check.ok ? "OK" : "Failed"} tone={d.check.ok ? "ready" : "danger"} />
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>schema_version: {d.schemaVersion}</Text>
          {!d.check.ok ? <Text style={[typography.caption, { color: colors.danger }]}>{d.check.reason}</Text> : null}
        </AppCard>
      ))}
    </ScrollView>
  );
}
