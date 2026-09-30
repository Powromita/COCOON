import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text } from "react-native";

import { PrimaryButton } from "../../components/common/PrimaryButton";
import { SectionHeader } from "../../components/common/SectionHeader";
import { RunCard } from "../../components/history/RunCard";
import { ProjectListRow } from "../../components/projects/ProjectListRow";
import { useRunHistory } from "../../hooks/useCocoon";
import { useProjectsList } from "../../hooks/useProjects";
import { useT } from "../../i18n";
import { useTheme } from "../../theme";

export default function HomeScreen() {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const t = useT();
  const projects = useProjectsList();
  const history = useRunHistory();
  const recent = (projects.data ?? []).slice(0, 3);
  const runs = (history.data?.data.runs ?? []).slice(0, 2);

  const link = (label: string, onPress: () => void) => (
    <Text accessibilityRole="link" style={[typography.caption, { color: colors.accent, fontWeight: "600", padding: spacing.xs }]} onPress={onPress}>
      {label} ›
    </Text>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
      <Text style={[typography.title, { color: colors.primary, marginBottom: spacing.xs }]}>
        Predict. Compare. Validate. Recommend.
      </Text>
      <Text style={[typography.body, { color: colors.textBody, marginBottom: spacing.md }]}>
        {t("Enter mission requirements; the COCOON backend generates, simulates, prices and ranks shelter designs.")}
      </Text>
      <PrimaryButton label={t("New shelter")} onPress={() => router.push("/project/new")} />

      <SectionHeader title={t("Recent projects")} right={recent.length > 0 ? link("All", () => router.push("/(tabs)/projects")) : undefined} />
      {projects.isError ? (
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Saved projects could not be loaded. See the Projects tab.</Text>
      ) : recent.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSecondary }]}>{projects.data ? "No projects yet." : "Loading…"}</Text>
      ) : (
        recent.map((p) => <ProjectListRow key={p.id} item={p} compact onPress={() => router.push({ pathname: "/project/[id]", params: { id: p.id } })} />)
      )}

      <SectionHeader title={t("Recent runs")} right={runs.length > 0 ? link("History", () => router.push("/(tabs)/reports")) : undefined} />
      {runs.length === 0 ? (
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          {history.data ? "No design runs yet." : history.isError ? "Run history is unavailable right now." : "Loading…"}
        </Text>
      ) : (
        runs.map((r) => <RunCard key={r.optimizationId} run={r} />)
      )}

    </ScrollView>
  );
}
