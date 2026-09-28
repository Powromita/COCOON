/**
 * Requirements wizard. One React Hook Form holds the whole draft, so moving
 * between steps never loses input; every change is autosaved to SQLite
 * (debounced, and flushed on step change, backgrounding and Android back).
 * "Generate designs" validates the draft into an M0 RequirementsContract
 * and submits it to the backend.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BackHandler, StyleSheet, Text, View } from "react-native";

import { ErrorView } from "../../../components/common/ErrorView";
import { InfoBanner } from "../../../components/common/InfoBanner";
import { LoadingState } from "../../../components/common/LoadingState";
import { PrimaryButton } from "../../../components/common/PrimaryButton";
import { ScreenContainer } from "../../../components/common/ScreenContainer";
import { SecondaryButton } from "../../../components/common/SecondaryButton";
import { FixtureBanner } from "../../../components/common/StatusBanners";
import { ReviewStep } from "../../../components/projects/wizard/ReviewStep";
import { StepShell } from "../../../components/projects/wizard/StepShell";
import type { StepState } from "../../../components/projects/wizard/WizardStepper";
import {
  BudgetStep,
  ComfortStep,
  FootprintStep,
  LocationStep,
  MaterialsStep,
  MissionStep,
  OccupancyStep,
  RoomsStep,
  WeatherStep,
} from "../../../components/projects/wizard/Steps";
import { IS_FIXTURE_MODE } from "../../../constants/env";
import type { DraftRequirements, ProjectRecord } from "../../../database/schema/types";
import { useStartGeneration } from "../../../hooks/useCocoon";
import { useDraftAutosave, useMarkReady, useProjectRecord, useRevertToDraft } from "../../../hooks/useProjects";
import { useAppStore } from "../../../store/app.store";
import { useTheme } from "../../../theme";
import { draftSchema, hasBlockingErrors, validateAll, validateStep, type FieldErrors } from "../../../validation/schemas";
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
      case "location":
        return <LocationStep control={control} />;
      case "weather":
        return <WeatherStep control={control} />;
      case "mission":
        return <MissionStep control={control} />;
      case "occupancy":
        return <OccupancyStep control={control} />;
      case "rooms":
        return <RoomsStep control={control} />;
      case "footprint":
        return <FootprintStep control={control} />;
      case "materials":
        return <MaterialsStep control={control} />;
      case "comfort":
        return <ComfortStep control={control} />;
      case "budget":
        return <BudgetStep control={control} />;
      default:
        return null;
    }
  })();

  if (current.id === "review") {
    const shownErrors = submitErrors.length > 0 ? submitErrors : allErrors;
    const offlineApi = !IS_FIXTURE_MODE && isOnline === false;
    const busy = markReady.isPending || startGeneration.isPending;
    return (
      <>
        <Stack.Screen options={{ title: record.row.name }} />
        <StepShell
          stepIndex={stepIndex}
          title="Review"
          description="Check the requirements, then send them to the backend to generate candidate designs."
          saveStatus={autosave.status}
          lastSavedAt={autosave.lastSavedAt}
          stepStates={stepStates}
          banner={
            <>
              {banner}
              <FixtureBanner detail="Demo mode: generation returns a recorded backend run for the M0 sample requirements (Leh, 30 occupants), not these inputs." />
            </>
          }
          footer={
            <View style={{ gap: spacing.sm }}>
              {shownErrors.length > 0 ? (
                <Text style={[typography.caption, { color: colors.danger }]}>
                  {shownErrors.length} item{shownErrors.length === 1 ? "" : "s"} to fix before generating.
                </Text>
              ) : null}
              {offlineApi ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  You’re offline. Your draft is saved; designs can be generated once you’re connected.
                </Text>
              ) : null}
              {submitError ? <ErrorView error={submitError} title="Design generation could not start" /> : null}
              <PrimaryButton
                label={busy ? "Submitting…" : "Generate designs"}
                onPress={() => void onGenerate()}
                disabled={readOnly || busy || shownErrors.length > 0 || offlineApi}
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
          <ReviewStep
            control={control}
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
      </StepShell>
    </>
  );
}

const styles = StyleSheet.create({
  readOnly: { opacity: 0.6 },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
});
