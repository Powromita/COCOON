/**
 * Validation tab — RC (M4) result and ANSYS (M8) validation, always in
 * separate, labelled cards. The app only submits and polls; ANSYS runs on
 * the backend and never receives RC-predicted temperatures.
 */
import React from "react";
import { Image, Text, View } from "react-native";

import {
  ANSYS_COMPLETED_EXPLANATION,
  ANSYS_STATUS_LABELS,
  ansysFailureCopy,
  isAnsysActive,
  isFullAnsysResult,
  validationStateLabel,
} from "../../adapters/ansys";
import { zoneResults } from "../../adapters/simulation";
import { API_URL, IS_FIXTURE_MODE } from "../../constants/env";
import { useAnsysStatus, useCapabilities, useSubmitAnsys } from "../../hooks/useCocoon";
import { capabilityStatus } from "../../services/interfaces/CapabilitiesService";
import { useAppStore } from "../../store/app.store";
import { useTheme } from "../../theme";
import { formatLocalDateTime, formatNumber, formatTemperature, humanize } from "../../utils/format";
import { AppError } from "../../utils/errors";
import { AppCard } from "../common/AppCard";
import { ErrorView } from "../common/ErrorView";
import { KeyValueRow } from "../common/KeyValueRow";
import { LoadingState } from "../common/LoadingState";
import { PrimaryButton } from "../common/PrimaryButton";
import { SectionHeader } from "../common/SectionHeader";
import { Tag } from "../common/Tag";
import type { ResultsContext } from "./ResultsContext";

const degC = (v: number | null | undefined) => (typeof v === "number" ? `${formatNumber(v, 2)} °C` : "Not reported");

export function ValidationTab({ ctx }: { ctx: ResultsContext }) {
  const { colors, spacing, typography } = useTheme();
  const unit = useAppStore((s) => s.temperatureUnit);
  const revision = ctx.building?.revision_id;
  const ansys = useAnsysStatus(revision);
  const submit = useSubmitAnsys(ctx.optimizationId, ctx.designId, ctx.building);
  const caps = useCapabilities();
  const ansysCapability = capabilityStatus(caps.data, "ansys");
  const sim = ctx.simulation.data?.data;

  const status = ansys.data?.status;
  const full = ansys.data && isFullAnsysResult(ansys.data) ? ansys.data : null;
  const failureCopy = status ? ansysFailureCopy(status) : null;

  return (
    <>
      <SectionHeader title="Evidence state" />
      <AppCard>
        <Text style={[typography.body, { color: colors.textPrimary }]}>
          {validationStateLabel(ctx.outcome?.recommendation_state ?? sim?.recommendation_state)}
        </Text>
      </AppCard>

      <SectionHeader title="Physics engine result (RC, M4)" caption="Calculated by the COCOON RC model — not ANSYS." />
      <AppCard>
        {sim ? (
          zoneResults(sim).map((z, i, arr) => (
            <KeyValueRow key={z.zoneId} label={`${humanize(z.zoneId)} mean`} value={formatTemperature(z.meanC, unit)} last={i === arr.length - 1} />
          ))
        ) : ctx.simulation.isError ? (
          <ErrorView compact error={ctx.simulation.error} />
        ) : (
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading…</Text>
        )}
      </AppCard>

      <SectionHeader title="ANSYS validation (FEM, M8)" caption="An independent finite-element solve of the same scenario." />
      <AppCard>
        {ansys.isError ? <ErrorView compact error={ansys.error} onRetry={() => void ansys.refetch()} /> : null}
        {!ansys.data && !ansys.isError ? <LoadingState label="Checking ANSYS status…" /> : null}
        {status ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
            <Text style={[typography.bodyStrong, { color: colors.textPrimary, flex: 1 }]}>Status</Text>
            <Tag
              label={ANSYS_STATUS_LABELS[status]}
              tone={status === "COMPLETED" ? "ready" : isAnsysActive(status) ? "warning" : status === "NOT_REQUESTED" ? "neutral" : "danger"}
            />
          </View>
        ) : null}

        {status === "NOT_REQUESTED" ? (
          <>
            <View style={{ backgroundColor: colors.statusInfoBg, borderRadius: 8, padding: spacing.md, marginBottom: spacing.md }}>
              <Text style={[typography.bodyStrong, { color: colors.statusInfo }]}>ANSYS validation not requested.</Text>
              <Text style={[typography.caption, { color: colors.textBody, marginTop: 2 }]}>
                This result was produced by the COCOON RC thermal engine. This is informational — nothing has failed.
              </Text>
            </View>
            {ansysCapability && ansysCapability !== "AVAILABLE" ? (
              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                ANSYS validation is currently unavailable
                {IS_FIXTURE_MODE ? " in demo mode." : " on this backend."}
              </Text>
            ) : null}
            <PrimaryButton
              label={submit.isPending ? "Submitting…" : "Request ANSYS validation"}
              onPress={() => submit.mutate()}
              disabled={!ctx.building || submit.isPending || (ansysCapability !== undefined && ansysCapability !== "AVAILABLE")}
            />
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
              A full solve can take many minutes on the backend. You can leave this screen; the status is checked again when you return.
            </Text>
          </>
        ) : null}

        {failureCopy ? (
          <>
            <ErrorView
              compact
              title={failureCopy.title}
              error={
                new AppError({
                  kind: "unavailable",
                  message: failureCopy.message,
                  backendMessage: full?.error_reason ?? undefined,
                })
              }
            />
            <PrimaryButton
              label={submit.isPending ? "Submitting…" : "Retry ANSYS validation"}
              onPress={() => submit.mutate()}
              disabled={!ctx.building || submit.isPending || (ansysCapability !== undefined && ansysCapability !== "AVAILABLE")}
            />
          </>
        ) : null}

        {submit.isError ? <ErrorView compact error={submit.error} title="Validation could not be requested" /> : null}

        {status === "COMPLETED" ? (
          <View
            accessibilityRole="alert"
            accessibilityLabel={ANSYS_COMPLETED_EXPLANATION}
            style={{ backgroundColor: colors.statusWarningBg, borderRadius: 8, padding: spacing.md, marginBottom: spacing.md }}
          >
            <Text style={[typography.caption, { color: colors.statusWarning }]}>{ANSYS_COMPLETED_EXPLANATION}</Text>
          </View>
        ) : null}

        {status && isAnsysActive(status) ? (
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            Running on the backend. This page checks the status every few seconds while it is open.
          </Text>
        ) : null}

        {full ? (
          <>
            <KeyValueRow label="Job" value={full.job_id} mono />
            <KeyValueRow label="Started" value={formatLocalDateTime(full.started_at)} />
            <KeyValueRow label="Completed" value={formatLocalDateTime(full.completed_at)} last />
          </>
        ) : null}
      </AppCard>

      {full?.status === "COMPLETED" ? (
        <>
          <SectionHeader title="Difference: ANSYS vs RC" caption="Agreement metrics reported by M8." />
          <AppCard>
            <KeyValueRow label="Mean absolute error" value={degC(full.metrics?.mae_c)} />
            <KeyValueRow label="RMSE" value={degC(full.metrics?.rmse_c)} />
            <KeyValueRow label="Maximum absolute error" value={degC(full.metrics?.max_abs_error_c)} />
            <KeyValueRow label="Mean bias (ANSYS − RC)" value={degC(full.metrics?.bias_c)} />
            <KeyValueRow label="R²" value={formatNumber(full.metrics?.r_squared, 3)} last />
          </AppCard>
          <SectionHeader title="Artifacts" />
          <AppCard>
            {Object.entries(full.artifacts?.artifacts ?? {}).map(([name, path], i, arr) => (
              <View key={name}>
                <KeyValueRow label={humanize(name)} value={path} mono last={i === arr.length - 1} />
                {!IS_FIXTURE_MODE && API_URL && /\.png$/i.test(path) ? (
                  <Image
                    accessibilityLabel={`ANSYS contour image ${humanize(name)}`}
                    source={{ uri: `${API_URL}/api/ansys/jobs/${encodeURIComponent(full.job_id)}/artifact/${path}` }}
                    style={{ width: "100%", aspectRatio: 4 / 3, marginVertical: spacing.sm }}
                    resizeMode="contain"
                  />
                ) : null}
              </View>
            ))}
            {Object.keys(full.artifacts?.artifacts ?? {}).length === 0 ? (
              <Text style={[typography.caption, { color: colors.textSecondary }]}>No artifacts were listed.</Text>
            ) : null}
          </AppCard>
        </>
      ) : null}
    </>
  );
}
