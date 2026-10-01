/**
 * Server-state hooks for everything the backend (or its fixture stand-in)
 * provides. Screens use these, never services directly.
 *
 * Polling (generation and ANSYS jobs) is done with React Query's
 * refetchInterval, which stops as soon as the job reaches a terminal state
 * — there are no free-running timers in screens.
 */
import type { AnsysValidationResult, BuildingModel, RequirementsContract, SimulationResult } from "@cocoon/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isAnsysActive, isFullAnsysResult } from "../adapters/ansys";
import { buildingToVisualizationModel } from "../adapters/visualization";
import { DATA_PROVIDER, IS_FIXTURE_MODE } from "../constants/env";
import { getProjectsRepository, getRunsRepository } from "../database";
import { requestNotificationPermission } from "../notifications/jobs";
import {
  ansysService,
  candidateService,
  capabilitiesService,
  economicsService,
  generationService,
  historyService,
  materialsService,
  projectService,
  simulationService,
  visualizationService,
} from "../services/registry";
import type { GenerationJob } from "../services/interfaces/GenerationService";
import type { VisualizationResult } from "../services/interfaces/VisualizationService";
import { capabilityStatus } from "../services/interfaces/CapabilitiesService";
import { kickJobMonitor } from "./useJobMonitor";
import type { AnsysNotRequested } from "../types/backend";
import { AppError } from "../utils/errors";
import { buildRequirementsContract, type FieldErrors } from "../validation/schemas";
import { useCachedQuery } from "./cachedQuery";
import { PROJECTS_LIST_QUERY_KEY, projectRecordQueryKey } from "./useProjects";

/** Poll cadence while a generation job is queued or running (the job screen). */
export const JOB_POLL_MS = 2_000;
export const ANSYS_POLL_MS = IS_FIXTURE_MODE ? 2_000 : 10_000;

export const queryKeys = {
  capabilities: ["capabilities", DATA_PROVIDER] as const,
  generationJob: (jobId: string) => ["generation", DATA_PROVIDER, jobId] as const,
  submittedRequirements: (jobId: string) => ["submitted-requirements", DATA_PROVIDER, jobId] as const,
  candidates: (optId: string) => ["candidates", DATA_PROVIDER, optId] as const,
  pareto: (optId: string) => ["pareto", DATA_PROVIDER, optId] as const,
  design: (optId: string, designId: string) => ["design", DATA_PROVIDER, optId, designId] as const,
  simulation: (optId: string, designId: string) => ["simulation", DATA_PROVIDER, optId, designId] as const,
  timeseries: (simId: string) => ["timeseries", DATA_PROVIDER, simId] as const,
  economics: (optId: string, designId: string) => ["economics", DATA_PROVIDER, optId, designId] as const,
  visualization: (revisionId: string, withSeries: boolean) =>
    ["visualization", DATA_PROVIDER, revisionId, withSeries] as const,
  ansysLatest: (revisionId: string) => ["ansys", DATA_PROVIDER, revisionId] as const,
  materials: ["materials", DATA_PROVIDER] as const,
  assumptionSets: ["assumption-sets", DATA_PROVIDER] as const,
};

export function useCapabilities() {
  return useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: () => capabilitiesService.getCapabilities(),
    staleTime: 60_000,
    retry: 0,
  });
}

export function useMaterialCatalog() {
  return useCachedQuery(queryKeys.materials, () => materialsService.getCatalog(), { staleTime: 10 * 60_000 });
}

export function useAssumptionSets() {
  return useCachedQuery(queryKeys.assumptionSets, () => economicsService.listAssumptionSets(), {
    staleTime: 10 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface StartGenerationResult {
  jobId: string;
}

/**
 * Validates the draft into an M0 RequirementsContract, submits it, and
 * records the job on the project. Rejects with FieldErrors when the draft
 * is incomplete, or an AppError from the backend.
 */
export function useStartGeneration(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<StartGenerationResult, FieldErrors | Error, void>({
    mutationFn: async () => {
      const repo = await getProjectsRepository();
      const recordResult = await repo.getProject(projectId as string);
      if (!recordResult.ok) throw new Error(recordResult.error);
      const record = recordResult.data;
      if (!record) throw new Error("Project not found.");
      if (record.readOnly) throw new Error("This project was saved in an older format and cannot be submitted.");

      const draft = record.requirements ?? {};
      const contract = buildRequirementsContract(draft, record.row.id);
      if (!contract.ok) throw contract.error;

      const opts = draft.generation_options ?? {};
      // Same draft version + same previous job → same key, so a retried tap never starts a second job.
      const idempotencyKey = `gen:${record.row.id}:${record.row.updated_at}:${record.row.run_job_id ?? "first"}`;
      const { jobId } = await generationService.startGeneration({
        requirements: contract.data,
        site: draft.weather_archive_site,
        count: opts.count ?? 24,
        seed: opts.seed ?? 42,
        materialsSnapshotId: opts.materials_snapshot_id,
        validateWithAnsys: opts.validate_with_ansys ?? false,
        baselineEconomics: opts.baseline_economics ?? true,
        idempotencyKey,
      });

      const saved = await repo.recordRunStarted(record.row.id, jobId, DATA_PROVIDER);
      if (!saved.ok) throw new Error(saved.error);
      // The device's index of runs it started (history + notifications); results stay on the backend.
      await (await getRunsRepository()).record(jobId, record.row.id, DATA_PROVIDER);
      // Ask once, at the moment it becomes useful; denial is respected and shown in Settings.
      void requestNotificationPermission().catch(() => undefined);
      kickJobMonitor();
      return { jobId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROJECTS_LIST_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: projectRecordQueryKey(projectId) });
    },
  });
}

/** Poll while the job is unknown yet, queued or running; stop at any terminal state. */
export function generationPollInterval(job: GenerationJob | undefined, intervalMs: number = JOB_POLL_MS): number | false {
  if (job === undefined) return intervalMs;
  return job.status === "queued" || job.status === "running" ? intervalMs : false;
}

/** Poll ANSYS only while M8 reports an active state. */
export function ansysPollInterval(
  status: AnsysValidationResult | AnsysNotRequested | undefined,
  intervalMs: number = ANSYS_POLL_MS
): number | false {
  return status && isFullAnsysResult(status) && isAnsysActive(status.status) ? intervalMs : false;
}

export function useGenerationJob(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.generationJob(jobId ?? ""),
    queryFn: () => generationService.getGenerationJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => generationPollInterval(query.state.data),
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export function useSubmittedRequirements(jobId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.submittedRequirements(jobId ?? ""),
    queryFn: () => generationService.getSubmittedRequirements(jobId as string),
    enabled: Boolean(jobId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export function useCandidates(optimizationId: string | undefined) {
  return useCachedQuery(queryKeys.candidates(optimizationId ?? ""), () => candidateService.getCandidates(optimizationId as string), {
    enabled: Boolean(optimizationId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function usePareto(optimizationId: string | undefined) {
  return useCachedQuery(queryKeys.pareto(optimizationId ?? ""), () => candidateService.getPareto(optimizationId as string), {
    enabled: Boolean(optimizationId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useDesign(optimizationId: string | undefined, designId: string | undefined) {
  return useCachedQuery(
    queryKeys.design(optimizationId ?? "", designId ?? ""),
    () => candidateService.getDesign(optimizationId as string, designId as string),
    { enabled: Boolean(optimizationId && designId), staleTime: Number.POSITIVE_INFINITY }
  );
}

// ---------------------------------------------------------------------------
// Per-design results: simulation → timeseries → economics → visualization
// ---------------------------------------------------------------------------

function windowHours(req: RequirementsContract): number {
  return (Date.parse(req.site.analysis_end) - Date.parse(req.site.analysis_start)) / 3_600_000;
}

export interface DesignResultInputs {
  optimizationId: string;
  designId: string;
  building: BuildingModel | undefined;
  requirements: RequirementsContract | null | undefined;
  weatherSnapshotId: string | undefined;
}

export function useDesignSimulation(inputs: DesignResultInputs) {
  const { optimizationId, designId, building, requirements, weatherSnapshotId } = inputs;
  return useCachedQuery(
    queryKeys.simulation(optimizationId, designId),
    () => {
      if (!building || !requirements || !weatherSnapshotId) {
        throw new AppError({ kind: "fixture_missing", message: "Simulation inputs are incomplete." });
      }
      return simulationService.getForDesign({
        designId,
        building,
        weatherSnapshotId,
        windowStart: requirements.site.analysis_start,
        windowEnd: requirements.site.analysis_end,
        setpointC: requirements.mission.target_temperature_c ?? 15,
      });
    },
    { enabled: Boolean(building && requirements && weatherSnapshotId), staleTime: Number.POSITIVE_INFINITY }
  );
}

export function useTimeseries(simulationId: string | undefined) {
  return useCachedQuery(queryKeys.timeseries(simulationId ?? ""), () => simulationService.getTimeseries(simulationId as string), {
    enabled: Boolean(simulationId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useDesignEconomics(
  inputs: DesignResultInputs & { simulation: SimulationResult | undefined }
) {
  const { optimizationId, designId, building, requirements, simulation } = inputs;
  return useCachedQuery(
    queryKeys.economics(optimizationId, designId),
    () => {
      if (!building || !requirements || !simulation) {
        throw new AppError({ kind: "fixture_missing", message: "Economics inputs are incomplete." });
      }
      return economicsService.getForDesign({
        designId,
        building,
        simulation,
        assumptionSetId: requirements.economic_assumption_set_id,
        occupants: requirements.mission.occupants,
        targetTemperatureC: requirements.mission.target_temperature_c,
        simulatedHours: windowHours(requirements),
      });
    },
    { enabled: Boolean(building && requirements && simulation), staleTime: Number.POSITIVE_INFINITY }
  );
}

export function useVisualization(building: BuildingModel | undefined, timeseries: Parameters<typeof visualizationService.getForDesign>[0]["timeseries"]) {
  const caps = useCapabilities();
  return useQuery<VisualizationResult>({
    queryKey: queryKeys.visualization(building?.revision_id ?? "", Boolean(timeseries)),
    queryFn: async () => {
      const model = building as BuildingModel;
      if (IS_FIXTURE_MODE) return visualizationService.getForDesign({ building: model, timeseries });
      const visualizationCapability = capabilityStatus(caps.data, "visualization");
      if (
        caps.isError ||
        (caps.data?.backendReachable && visualizationCapability !== undefined && visualizationCapability !== "AVAILABLE")
      ) {
        return {
          model: buildingToVisualizationModel(model, timeseries),
          origin: "building_geometry",
        };
      }
      return visualizationService.getForDesign({ building: model, timeseries });
    },
    enabled: Boolean(building) && (IS_FIXTURE_MODE || caps.isSuccess || caps.isError),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// ---------------------------------------------------------------------------
// ANSYS (M8)
// ---------------------------------------------------------------------------

export function useAnsysStatus(revisionId: string | undefined) {
  return useQuery<AnsysValidationResult | AnsysNotRequested>({
    queryKey: queryKeys.ansysLatest(revisionId ?? ""),
    queryFn: () => ansysService.getLatestForRevision(revisionId as string),
    enabled: Boolean(revisionId),
    refetchInterval: (query) => ansysPollInterval(query.state.data),
    retry: 1,
  });
}

export function useSubmitAnsys(building: BuildingModel | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ansysService.submitValidation(building as BuildingModel),
    onSuccess: () => {
      if (building) void queryClient.invalidateQueries({ queryKey: queryKeys.ansysLatest(building.revision_id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Run history and reports
// ---------------------------------------------------------------------------

export function useRunHistory() {
  return useCachedQuery(["run-history", DATA_PROVIDER], () => historyService.listRuns(), { staleTime: 15_000 });
}

export function useRunReport(optimizationId: string | undefined) {
  return useQuery({
    queryKey: ["run-report", DATA_PROVIDER, optimizationId],
    queryFn: () => historyService.getReport(optimizationId as string),
    enabled: Boolean(optimizationId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });
}

// ---------------------------------------------------------------------------
// Remote / demo projects (the ProjectService). Local projects: hooks/useProjects.ts.
// ---------------------------------------------------------------------------

export function useServiceProjects(enabled = true) {
  return useCachedQuery(["service-projects", DATA_PROVIDER], () => projectService.listProjects(), {
    staleTime: 60_000,
    retry: 0,
    enabled,
  });
}
