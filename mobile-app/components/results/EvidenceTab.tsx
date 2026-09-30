/**
 * Evidence tab — where every number on the other tabs came from. Each
 * block is labelled with its provenance class: Calculated (a COCOON
 * engine), Retrieved (weather/material data), Validated (ANSYS), Demo
 * (fixture data). Nothing is labelled Measured: COCOON has no sensor input.
 */
import { SCHEMA_VERSION } from "@cocoon/contracts";
import React from "react";
import { Text, View } from "react-native";

import { validationStateLabel } from "../../adapters/ansys";
import { IS_FIXTURE_MODE } from "../../constants/env";
import { useDesignEconomics } from "../../hooks/useCocoon";
import { useTheme } from "../../theme";
import { formatLocalDateTime, formatNumber, humanize } from "../../utils/format";
import { AppCard } from "../common/AppCard";
import { KeyValueRow } from "../common/KeyValueRow";
import { SectionHeader } from "../common/SectionHeader";
import { Tag, type TagTone } from "../common/Tag";
import type { ResultsContext } from "./ResultsContext";

type Provenance = "Calculated" | "Retrieved" | "Validated" | "Demo";

function Block({ title, kind, children }: { title: string; kind: Provenance; children: React.ReactNode }) {
  const { spacing } = useTheme();
  const tone: TagTone = kind === "Demo" ? "demo" : kind === "Validated" ? "ready" : kind === "Retrieved" ? "neutral" : "accent";
  return (
    <>
      <SectionHeader title={title} right={<Tag label={IS_FIXTURE_MODE ? `${kind} · Demo` : kind} tone={IS_FIXTURE_MODE ? "demo" : tone} />} />
      <AppCard>
        <View style={{ gap: spacing.xs / 2 }}>{children}</View>
      </AppCard>
    </>
  );
}

export function EvidenceTab({ ctx }: { ctx: ResultsContext }) {
  const { colors, spacing, typography } = useTheme();
  const sim = ctx.simulation.data?.data;
  // Reuses the cached economics query if the Economics tab already loaded it.
  const econ = useDesignEconomics({
    optimizationId: ctx.optimizationId,
    designId: ctx.designId,
    building: ctx.building,
    requirements: ctx.requirements,
    weatherSnapshotId: ctx.job?.weatherSnapshotId,
    simulation: sim,
  });
  const report = econ.data?.data;
  const site = ctx.job?.siteUsed;

  return (
    <>
      <AppCard>
        <KeyValueRow label="Data source" value="COCOON calculation service" />
        <KeyValueRow label="Contract schema" value={`M0 ${SCHEMA_VERSION}`} last />
      </AppCard>

      <Block title="Weather" kind="Retrieved">
        <KeyValueRow label="Snapshot" value={ctx.job?.weatherSnapshotId ?? sim?.provenance.weather_snapshot_id} mono />
        <KeyValueRow label="Archive site" value={site?.location_name ? humanize(site.location_name) : site?.site} />
        <KeyValueRow label="Distance from project site" value={typeof site?.distance_km === "number" ? `${formatNumber(site.distance_km, 1)} km` : undefined} />
        <KeyValueRow label="Served from cache" value={site?.is_cached === undefined ? undefined : site.is_cached ? "Yes" : "No"} />
        <KeyValueRow label="Source requested" value={ctx.requirements?.site.weather_source} />
        <KeyValueRow label="Analysis window" value={ctx.requirements ? `${ctx.requirements.site.analysis_start} → ${ctx.requirements.site.analysis_end}` : undefined} last />
      </Block>

      <Block title="Design" kind="Calculated">
        <KeyValueRow label="Design" value={ctx.designId} mono />
        <KeyValueRow label="Revision" value={ctx.building?.revision_id} mono />
        <KeyValueRow label="Source" value={ctx.building ? humanize(ctx.building.source) : undefined} />
        <KeyValueRow label="Generator" value={ctx.building?.metadata.generator_version ?? undefined} />
        <KeyValueRow label="Seed" value={ctx.building?.metadata.seed?.toString()} />
        <KeyValueRow label="Created" value={formatLocalDateTime(ctx.building?.metadata.created_at)} last />
      </Block>

      <Block title="Simulation" kind="Calculated">
        <KeyValueRow label="Simulation" value={sim?.simulation_id} mono />
        <KeyValueRow label="Engine" value={sim ? `${sim.engine.name} ${sim.engine.version}` : undefined} />
        <KeyValueRow label="Solver mode" value={sim?.engine.mode} mono />
        <KeyValueRow label="Status" value={sim?.status?.toUpperCase()} mono />
        <KeyValueRow label="Material snapshot" value={sim?.provenance.material_version} mono />
        <KeyValueRow label="Code commit" value={sim?.provenance.code_commit} mono />
        <KeyValueRow label="Run at" value={formatLocalDateTime(sim?.provenance.created_at)} last />
      </Block>

      <Block title="Optimization" kind="Calculated">
        <KeyValueRow label="Job" value={ctx.optimizationId} mono />
        <KeyValueRow label="Project ID" value={ctx.requirements?.project_id ?? ctx.projectId} mono />
        <KeyValueRow label="Backend status" value={ctx.job?.status?.toUpperCase()} mono />
        <KeyValueRow label="Finished" value={formatLocalDateTime(ctx.job?.finishedAt)} />
        <KeyValueRow label="Evidence state" value={validationStateLabel(ctx.outcome?.recommendation_state)} />
        <KeyValueRow label="Development stand-in" value={ctx.outcome ? (ctx.outcome.development_only ? "Yes — not verified" : "No") : undefined} last />
      </Block>

      <Block title="Economics" kind="Calculated">
        <KeyValueRow label="Analysis" value={report?.analysis_id} mono />
        <KeyValueRow label="Assumption set" value={report?.assumption_set ? `${report.assumption_set.id} v${report.assumption_set.version}` : undefined} />
        <KeyValueRow label="Assumption checksum" value={report?.assumption_set_checksum_sha256?.slice(0, 16)} mono />
        <KeyValueRow label="M7 version" value={report?.provenance?.m7_version} />
        <KeyValueRow label="Material snapshot" value={report?.provenance?.material_snapshot_id} mono />
        <KeyValueRow label="Created" value={formatLocalDateTime(report?.created_at)} last />
        {econ.data === undefined ? (
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {econ.isError ? "Economics could not be loaded." : "Loading economics provenance…"}
          </Text>
        ) : null}
      </Block>

      {report?.provenance?.input_hashes ? (
        <Block title="Input checksums (SHA-256)" kind="Calculated">
          {Object.entries(report.provenance.input_hashes).map(([k, v], i, arr) => (
            <KeyValueRow key={k} label={humanize(k)} value={`${v.slice(0, 16)}…`} mono last={i === arr.length - 1} />
          ))}
        </Block>
      ) : null}

      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.md }]}>
        Calculated = produced by a COCOON engine. Retrieved = external data frozen into a snapshot. Validated = confirmed by an
        independent ANSYS solve. Demo = fixture data, not a live result. COCOON uses no field measurements.
      </Text>
    </>
  );
}
