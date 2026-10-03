/**
 * Requirements wizard. One React Hook Form holds the whole draft, so moving
 * between steps never loses input; every change is autosaved to SQLite
 * (debounced, and flushed on step change, backgrounding and Android back).
 * "Generate designs" validates the draft into an M0 RequirementsContract
 * and submits it to the backend. The draft is checked against the live M2
 * template catalogue as it changes (debounced); generating is only offered
 * once the backend reports a compatible template, and the backend checks
 * again before it queues anything. A refused or failed submission never
 * clears the form.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BackHandler, StyleSheet, Text, View } from "react-native";

import { ErrorView } from "../../../components/common/ErrorView";
import { FailureNotice } from "../../../components/generation/FailureNotice";
import { CompatibilityPanel } from "../../../components/projects/wizard/CompatibilityPanel";
import { InfoBanner } from "../../../components/common/InfoBanner";
import { LoadingState } from "../../../components/common/LoadingState";
import { PrimaryButton } from "../../../components/common/PrimaryButton";
import { ScreenContainer } from "../../../components/common/ScreenContainer";
import { SecondaryButton } from "../../../components/common/SecondaryButton";
import { ReviewStep } from "../../../components/projects/wizard/ReviewStep";
import { StepShell } from "../../../components/projects/wizard/StepShell";
import type { StepState } from "../../../components/projects/wizard/WizardStepper";
import {
  MissionOccupancyStep,
  OptimizationStep,
  ShelterDesignStep,
  SiteWeatherStep,
} from "../../../components/projects/wizard/Steps";
import { IS_FIXTURE_MODE } from "../../../constants/env";
import type { DraftRequirements, ProjectRecord } from "../../../database/schema/types";
import { useCompatibility, useStartGeneration } from "../../../hooks/useCocoon";
import { useDraftAutosave, useMarkReady, useProjectRecord, useRevertToDraft } from "../../../hooks/useProjects";
import { useAppStore } from "../../../store/app.store";
import { useTheme } from "../../../theme";
import { AppError } from "../../../utils/errors";
import {
  draftSchema,
  hasBlockingErrors,
  previewRequirements,
  validateAll,
  validateStep,
  type FieldErrors,
} from "../../../validation/schemas";
import { clampStepIndex, REVIEW_STEP_INDEX, stepAt, stepIndexOf, WIZARD_STEPS, type WizardStepId } from "../../../validation/steps";

export default function ProjectEditScreen() {
  const { id, step } = useLocalSearchParams<{ id: string; step?: string }>();
  const record = useProjectRecord(id);

  if (record.isError) {
    return (
      <ScreenContainer>
        <ErrorView error={record.error} onRetry={() => void record.refetch()} />
      </ScreenContainer>
    );
  }
  if (!record.data) {
    return (
      <ScreenContainer>
        <LoadingState label="Loading project…" />
      </ScreenContainer>
    );
  }
  if (record.data.isCorrupt) return <CorruptDraftView />;
  return <Wizard record={record.data} initialStep={step} />;
}

function CorruptDraftView() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <InfoBanner
        title="This draft can't be read"
        message="Its saved data is damaged. It can be deleted from the project list (long-press it)."
        tone="warning"
      />
      <View style={{ marginTop: 16 }}>
        <SecondaryButton label="Back to projects" onPress={() => router.back()} />
      </View>
    </ScreenContainer>
  );
}

function Wizard({ record, initialStep }: { record: ProjectRecord; initialStep?: string }) {
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const projectId = record.row.id;
  const readOnly = record.readOnly;

  const autosave = useDraftAutosave(projectId);
  const markReady = useMarkReady(projectId);
  const revertToDraft = useRevertToDraft(projectId);
  const startGeneration = useStartGeneration(projectId);
  const isOnline = useAppStore((s) => s.isOnline);

  const [stepIndex, setStepIndex] = useState(() => {
    const fromParam = initialStep !== undefined ? Number(initialStep) : NaN;
    return clampStepIndex(Number.isFinite(fromParam) ? fromParam : record.row.last_step);
  });
  const [submitErrors, setSubmitErrors] = useState<FieldErrors>([]);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const reverted = useRef(false);

  const form = useForm<DraftRequirements>({
    defaultValues: record.requirements ?? {},
    resolver: zodResolver(draftSchema) as never,
    mode: "onChange",
  });
  const { control, getValues, trigger } = form;
  const values = useWatch({ control }) as DraftRequirements;

  // Autosave every edit; the first edit of a READY project reverts it to DRAFT.
  const stepRef = useRef(stepIndex);
  stepRef.current = stepIndex;
  useEffect(() => {
    if (readOnly) return;
    const sub = form.watch((next, info) => {
      if (!info.name) return;
      autosave.scheduleSave({ requirements: next as DraftRequirements, step: stepRef.current });
      if (!reverted.current && record.row.status === "READY") {
        reverted.current = true;
        revertToDraft.mutate();
      }
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, readOnly]);

  // Android back: save first, then let navigation proceed.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      void autosave.flush();
      return false;
    });
    return () => sub.remove();
  }, [autosave]);

  const goToStep = useCallback(
    async (next: number) => {
      const clamped = clampStepIndex(next);
      setStepIndex(clamped);
      if (!readOnly) {
        autosave.scheduleSave({ requirements: getValues(), step: clamped });
        await autosave.flush();
      }
    },
    [autosave, getValues, readOnly]
  );

  const current = stepAt(stepIndex);
  const offlineApi = !IS_FIXTURE_MODE && isOnline === false;
  const compatInput = useMemo(
    () => ({
      requirements: previewRequirements(values, projectId),
      templateId: values.generation_options?.template_id ?? null,
      roomArrangement: values.generation_options?.room_arrangement ?? {},
      materialsSnapshotId: values.generation_options?.materials_snapshot_id,
    }),
    [values, projectId]
  );
  // Checked on the steps where it can change and on review; never while offline (an old answer must not pass for a new one).
  const compatibility = useCompatibility(
    compatInput,
    !readOnly && !offlineApi && (current.id === "mission" || current.id === "design" || current.id === "review")
  );
  const applyChange = (change: Record<string, number>) => {
    for (const [path, value] of Object.entries(change)) {
      form.setValue(path as never, value as never, { shouldValidate: true, shouldDirty: true });
    }
  };
  const selectTemplate = (templateId: string | null) =>
    form.setValue("generation_options.template_id", templateId, { shouldValidate: true, shouldDirty: true });

  const stepErrors = useMemo(() => (current.id === "review" ? [] : validateStep(current.id, values)), [current.id, values]);
  const blocking = hasBlockingErrors(stepErrors);
  const allErrors = useMemo(() => validateAll(values), [values]);
  const stepStates = useMemo<StepState[]>(
    () =>
      WIZARD_STEPS.map((s, i) => {
        if (i === stepIndex) return "current";
        if (i > stepIndex) return "upcoming";
        if (s.id === "review") return "complete";
        return allErrors.some((e) => e.step === s.id) ? "incomplete" : "complete";
      }),
    [allErrors, stepIndex]
  );

  const onGenerate = async () => {
    setSubmitError(null);
    await trigger();
    if (!readOnly) {
      autosave.scheduleSave({ requirements: getValues(), step: stepIndex });
      await autosave.flush();
    }
    try {
      await markReady.mutateAsync();
    } catch (fieldErrors) {
      setSubmitErrors(Array.isArray(fieldErrors) ? (fieldErrors as FieldErrors) : []);
      return;
    }
    setSubmitErrors([]);
    try {
      const { jobId } = await startGeneration.mutateAsync();
      router.replace({ pathname: "/generation/[jobId]", params: { jobId, projectId } });
    } catch (error) {
      if (Array.isArray(error)) setSubmitErrors(error as FieldErrors);
      else setSubmitError(error);
    }
  };

  const banner = readOnly ? (
    <View style={{ marginBottom: spacing.md }}>
      <InfoBanner
        title="Read-only: saved in an older format"
        message="This draft was created before the app moved to the M0 requirements contract. Create a new project to continue."
        tone="warning"
      />
    </View>
  ) : null;

  const stepBody = (() => {
    switch (current.id) {
      case "site":
        return <SiteWeatherStep control={control} setValue={form.setValue} />;
      case "design":
        return <ShelterDesignStep control={control} />;
      case "mission":
        return <MissionOccupancyStep control={control} />;
      case "optimize":
        return <OptimizationStep control={control} />;
      default:
        return null;
    }
  })();

  if (current.id === "review") {
    const shownErrors = submitErrors.length > 0 ? submitErrors : allErrors;
    const busy = markReady.isPending || startGeneration.isPending;
    const compatible = compatibility.data?.ok === true && !compatibility.pending;
    const categorised = submitError instanceof AppError && typeof submitError.details?.category === "string";
    return (
      <>
        <Stack.Screen options={{ title: record.row.name }} />
        <StepShell
          stepIndex={stepIndex}
          title="Review & generate"
          description="Review your inputs, then run the COCOON RC optimization to generate and rank candidate designs."
          saveStatus={autosave.status}
          lastSavedAt={autosave.lastSavedAt}
          stepStates={stepStates}
          banner={banner}
          footer={
            <View style={{ gap: spacing.sm }}>
              {shownErrors.length > 0 ? (
                <Text style={[typography.caption, { color: colors.danger }]}>
                  {shownErrors.length} item{shownErrors.length === 1 ? "" : "s"} to fix before generating.
                </Text>
              ) : null}
              {offlineApi ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  Connect to a network to run the RC calculation. Your draft has been saved.
                </Text>
              ) : null}
              {submitError && categorised ? (
                <FailureNotice
                  error={{
                    message: (submitError as AppError).backendMessage ?? (submitError as AppError).message,
                    code: (submitError as AppError).code,
                    retryable: (submitError as AppError).retryable,
                    details: (submitError as AppError).details,
                    traceId: (submitError as AppError).traceId,
                  }}
                  onEdit={(ex) => {
                    setSubmitError(null);
                    if (ex.step && ex.step !== "review") void goToStep(stepIndexOf(ex.step));
                  }}
                  onRetry={() => void onGenerate()}
                  retrying={busy}
                />
              ) : submitError ? (
                <ErrorView error={submitError} title="Design generation could not start" onRetry={() => void onGenerate()} />
              ) : null}
              {!compatible && shownErrors.length === 0 && !offlineApi ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {compatibility.pending ? "Checking your requirements against the shelter templates…" : "Generating is available once a compatible template is found."}
                </Text>
              ) : null}
              <PrimaryButton
                label={busy ? "Submitting…" : "Generate designs"}
                onPress={() => void onGenerate()}
                disabled={readOnly || busy || shownErrors.length > 0 || offlineApi || !compatible}
              />
              <View style={styles.row}>
                <View style={styles.half}>
                  <SecondaryButton label="Back" onPress={() => void goToStep(stepIndex - 1)} />
                </View>
                <View style={styles.half}>
                  <SecondaryButton
                    label="Save draft"
                    disabled={readOnly}
                    onPress={async () => {
                      autosave.scheduleSave({ requirements: getValues(), step: stepIndex });
                      await autosave.flush();
                    }}
                  />
                </View>
              </View>
            </View>
          }
        >
          <CompatibilityPanel
            result={compatibility.data}
            error={compatibility.error}
            checking={compatibility.pending}
            offline={offlineApi}
            selectedTemplateId={values.generation_options?.template_id ?? null}
            onSelectTemplate={selectTemplate}
            onRetry={() => void compatibility.refetch()}
            onEditStep={(s: WizardStepId) => void goToStep(stepIndexOf(s))}
            onApplyChange={applyChange}
          />
          <ReviewStep
            draft={values}
            errors={shownErrors}
            onEditStep={(s: WizardStepId) => void goToStep(stepIndexOf(s))}
          />
        </StepShell>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: record.row.name }} />
      <StepShell
        stepIndex={stepIndex}
        title={current.title}
        description={current.description}
        onBack={stepIndex > 0 ? () => void goToStep(stepIndex - 1) : undefined}
        onNext={() => void goToStep(stepIndex + 1)}
        nextLabel={stepIndex === REVIEW_STEP_INDEX - 1 ? "Review" : "Next"}
        nextDisabled={blocking && !readOnly}
        saveStatus={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        stepStates={stepStates}
        banner={banner}
      >
        <View pointerEvents={readOnly ? "none" : "auto"} style={readOnly ? styles.readOnly : undefined}>
          {stepBody}
        </View>
        {blocking ? (
          <Text style={[typography.caption, { color: colors.danger }]}>Fix the highlighted values to continue.</Text>
        ) : null}
        {(current.id === "mission" || current.id === "design") && compatibility.data ? (
          <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.textSecondary }]}>
            {compatibilitySummary(compatibility.data)}
            {compatibility.pending ? " (re-checking…)" : ""}
          </Text>
        ) : null}
      </StepShell>
    </>
  );
}

/** One line for the mission/design steps; the full explanation is on the review step. */
function compatibilitySummary(result: import("../../../types/backend").CompatibilityResult): string {
  const n = result.compatible_template_ids.length;
  if (n > 0) return `${n} shelter template${n === 1 ? "" : "s"} can hold these rooms so far.`;
  const conflict = result.conflicts.find((c) => c.layer !== "input") ?? result.conflicts[0];
  return conflict ? `Not compatible yet: ${conflict.message}` : "No template can hold these rooms yet — see Review for details.";
}

const styles = StyleSheet.create({
  readOnly: { opacity: 0.6 },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
});
