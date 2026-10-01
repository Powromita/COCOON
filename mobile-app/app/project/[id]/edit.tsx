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
import { Alert, BackHandler, StyleSheet, Text, View } from "react-native";

import { DangerButton } from "../../../components/common/DangerButton";
import { ErrorView } from "../../../components/common/ErrorView";
import { InfoBanner } from "../../../components/common/InfoBanner";
import { LoadingState } from "../../../components/common/LoadingState";
import { PrimaryButton } from "../../../components/common/PrimaryButton";
import { ScreenContainer } from "../../../components/common/ScreenContainer";
import { SecondaryButton } from "../../../components/common/SecondaryButton";
import { ReviewStep } from "../../../components/projects/wizard/ReviewStep";
import { StepShell } from "../../../components/projects/wizard/StepShell";
import type { StepState } from "../../../components/projects/wizard/WizardStepper";
import {
  ArchitecturalEnvelopeStep,
  MissionOccupancyStep,
  OptimizationStep,
  SiteConstraintsStep,
  SiteWeatherStep,
} from "../../../components/projects/wizard/Steps";
import { IS_FIXTURE_MODE } from "../../../constants/env";
import type { DraftRequirements, ProjectRecord } from "../../../database/schema/types";
import { useStartGeneration } from "../../../hooks/useCocoon";
import {
  useDeleteProject,
  useDraftAutosave,
  useMarkReady,
  useProjectRecord,
  useRenameProject,
  useRevertToDraft,
} from "../../../hooks/useProjects";
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
        message="Its saved data is damaged. It can be deleted from the project list."
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
  const renameProject = useRenameProject(projectId);
  const startGeneration = useStartGeneration(projectId);
  const isOnline = useAppStore((s) => s.isOnline);

  const deleteProject = useDeleteProject();

  const [stepIndex, setStepIndex] = useState(() => {
    const fromParam = initialStep !== undefined ? Number(initialStep) : NaN;
    return clampStepIndex(Number.isFinite(fromParam) ? fromParam : record.row.last_step);
  });
  const [submitErrors, setSubmitErrors] = useState<FieldErrors>([]);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const reverted = useRef(false);

  const defaultValues: DraftRequirements = useMemo(() => {
    // For an existing project that has saved requirements, use those.
    // For a brand-new project, start with only the project name and
    // generation options — every other field is intentionally blank so the
    // user consciously fills in each parameter.
    const saved = record.requirements ?? {};
    return {
      project_name: record.row.name,
      // Preserve any previously saved values, but don't pre-fill anything else.
      ...saved,
      economic_assumption_set_id: saved.economic_assumption_set_id ?? "expected",
      // Always keep generation options at sensible defaults if not already saved.
      generation_options: {
        count: 24,
        baseline_economics: true,
        ...(saved.generation_options ?? {}),
      },
    };
  }, [record.requirements, record.row.name]);

  const form = useForm<DraftRequirements>({
    defaultValues,
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
      if (info.name === "project_name" && typeof next.project_name === "string" && next.project_name.trim().length > 0) {
        renameProject.mutate(next.project_name.trim());
      }
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

  const goToStep = useCallback(
    async (next: number) => {
      // If attempting to advance forward, ensure all required fields in the current step are filled
      if (next > stepRef.current) {
        const currStep = stepAt(stepRef.current);
        const currentErrors = currStep.id === "review" ? [] : validateStep(currStep.id, getValues());
        if (currentErrors.length > 0) {
          Alert.alert(
            "Required Fields Incomplete",
            `Please fill in all required fields before continuing to the next step:\n• ` +
              currentErrors.map((e) => `${e.label}: ${e.message}`).join("\n• ")
          );
          return;
        }
      }
      const clamped = clampStepIndex(next);
      setStepIndex(clamped);
      if (!readOnly) {
        autosave.scheduleSave({ requirements: getValues(), step: clamped });
        await autosave.flush();
      }
    },
    [autosave, getValues, readOnly]
  );

  const handleDelete = () => {
    Alert.alert(
      "Delete Shelter Design",
      `Are you sure you want to delete "${record.row.name}" (${projectId})? All saved requirements and progress will be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteProject.mutateAsync(projectId);
              router.replace("/(tabs)/projects");
            } catch (err) {
              Alert.alert("Could not delete", String(err));
            }
          },
        },
      ]
    );
  };

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
      case "mission":
        return <MissionOccupancyStep control={control} />;
      case "constraints":
      case "design":
        return <SiteConstraintsStep control={control} />;
      case "envelope":
        return <ArchitecturalEnvelopeStep control={control} />;
      case "optimize":
        return <OptimizationStep control={control} />;
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
          title="Review & generate"
          description="Verify all mission parameters before running the COCOON generative engine."
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
              <View style={{ marginTop: spacing.xs }}>
                <DangerButton
                  label="🗑️ Delete Shelter Project"
                  onPress={handleDelete}
                  disabled={deleteProject.isPending}
                />
              </View>
            </View>
          }
        >
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
          <View style={[styles.errorNotice, { borderColor: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: 8, marginTop: spacing.md, borderWidth: 1 }]}>
            <Text style={[typography.bodyStrong, { color: colors.danger, marginBottom: 4 }]}>
              ⚠️ Please fill in all required fields to continue:
            </Text>
            {stepErrors.map((err, idx) => (
              <Text key={idx} style={[typography.caption, { color: colors.danger, marginLeft: 4, marginVertical: 1 }]}>
                • {err.label}: {err.message}
              </Text>
            ))}
          </View>
        ) : null}
      </StepShell>
    </>
  );
}

const styles = StyleSheet.create({
  readOnly: { opacity: 0.6 },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  errorNotice: { marginVertical: 8 },
});
