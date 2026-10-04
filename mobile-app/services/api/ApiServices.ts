/**
 * API providers — every service interface backed by the COCOON FastAPI
 * backend. Endpoint paths and bodies follow main @ 74ad025
 * (backend/routes/pipeline.py, economics.py, ansys.py — unchanged since 1048a2c).
 *
 * Endpoints main does not have yet — each is still called, and a 404 is
 * reported as "not_supported" rather than hidden:
 *   GET /api/v1/optimizations (list)  → history falls back to the device's index of run ids,
 *                                       each re-read from GET /api/v1/optimizations/{id}
 *   /api/v1/projects                  → projects stay local
 *   GET /api/v1/optimizations/{id}/report → "PDF export coming soon"
 *   /api/v1/visualizations/{rev}      → geometry-derived 3D view, labelled as such
 *   /api/v1/auth/*                    → "Authentication service unavailable"
 */
import type { AnsysValidationResult, BuildingModel, MaterialRecord, Project, RequirementsContract, SimulationResult } from "@cocoon/contracts";


import { buildingToVisualizationModel } from "../../adapters/visualization";
import { getCacheRepository, getRunsRepository } from "../../database";
import type { RunIndexEntry } from "../../database/repositories/RunsRepository";
import type {
  AnsysNotRequested,
  AnsysSubmitResponse,
  AssumptionSetsResponse,
  BackendCapabilities,
  CandidatesResponse,
  EconomicsReport,
  MaterialsListResponse,
  OptimizationCreateResponse,
  OptimizationStatusResponse,
  CompatibilityResult,
  ParetoResponse,
  TemplateCatalog,
  TimeseriesResponse,
} from "../../types/backend";
import { AppError, isAppErrorKind } from "../../utils/errors";
import type { AnsysService } from "../interfaces/AnsysService";
import type { CandidateService } from "../interfaces/CandidateService";
import type { CapabilitiesService, CapabilitiesSnapshot } from "../interfaces/CapabilitiesService";
import type { DesignEconomicsRequest, EconomicsService } from "../interfaces/EconomicsService";
import type { GenerationJob, GenerationService, StartGenerationInput } from "../interfaces/GenerationService";
import type { MaterialCatalog, MaterialsService } from "../interfaces/MaterialsService";
import type { AuthAvailability, AuthService, SignInResult } from "../interfaces/AuthService";
import type { OptimizationHistoryService, RunList, RunReport, RunSummary } from "../interfaces/OptimizationHistoryService";
import type { ProjectService } from "../interfaces/ProjectService";
import type { CompatibilityInput, TemplateService } from "../interfaces/TemplateService";
import type { DesignSimulationRequest, SimulationService } from "../interfaces/SimulationService";
import type { VisualizationRequest, VisualizationResult, VisualizationService } from "../interfaces/VisualizationService";
import { capabilitiesFromBackend, checkLocalStorage, toGenerationJob, toSimulationContract } from "../shared/mappers";
import type { ApiClient } from "./client";

const V1 = "/api/v1";
const ANSYS = "/api/ansys";
const enc = encodeURIComponent;
const submittedKey = (jobId: string) => `submitted-requirements:${jobId}`;

function isBackendUnavailable(error: unknown): boolean {
  if (error instanceof AppError && error.status !== undefined) {
    return error.status === 503 || error.status >= 500;
  }
  return isAppErrorKind(error, "offline", "network", "timeout", "unavailable");
}

/** Simulations are requested hourly — the resolution the results screens chart. */
export const SIMULATION_TIMESTEP_SECONDS = 3600;
/** Conditioned run: M7 prices heating from it, and it matches how M6 verified candidates. */
export const SIMULATION_MODE = "ideal_load_conditioned";

/** A 404 from an endpoint main doesn't implement becomes an explicit "not_supported". */
function notSupportedOn404(feature: string) {
  return (error: unknown): never => {
    if (isAppErrorKind(error, "not_found")) {
      throw new AppError({
        kind: "not_supported",
        message: `${feature}: endpoint not found on this backend (${error.message})`,
        status: error.status,
      });
    }
    throw error;
  };
}

export class ApiCapabilitiesService implements CapabilitiesService {
  constructor(private readonly api: ApiClient) {}

  async getCapabilities(): Promise<CapabilitiesSnapshot> {
    const [caps, local] = await Promise.all([
      this.api.get<BackendCapabilities>(`${V1}/capabilities`, { timeoutMs: 10_000 }),
      checkLocalStorage(),
    ]);
    if (!caps || typeof caps !== "object" || !caps.modules) {
      throw new AppError({ kind: "malformed", message: "GET /api/v1/capabilities returned no modules" });
    }
    return capabilitiesFromBackend(caps, local);
  }
}

export class ApiGenerationService implements GenerationService {
  constructor(private readonly api: ApiClient) {}

  async startGeneration(input: StartGenerationInput): Promise<{ jobId: string }> {
    const body = {
      requirements: input.requirements,
      site: input.site,
      count: input.count,
      seed: input.seed,
      materials_snapshot_id: input.materialsSnapshotId ?? null,
      validate_with_ansys: input.validateWithAnsys ?? false,
      baseline_economics: input.baselineEconomics ?? true,
      template_id: input.templateId ?? null,
      room_arrangement: input.roomArrangement ?? {},
    };
    const res = await this.api.post<OptimizationCreateResponse>(`${V1}/optimizations`, body, {
      idempotencyKey: input.idempotencyKey,
    });
    // The backend keeps the request on disk but doesn't serve it back, so the
    // app remembers what it submitted.
    await (await getCacheRepository()).set(submittedKey(res.optimization_id), input.requirements, "local");
    return { jobId: res.optimization_id };
  }

  async getSubmittedRequirements(jobId: string): Promise<RequirementsContract | null> {
    const entry = await (await getCacheRepository()).get<RequirementsContract>(submittedKey(jobId));
    return entry?.value ?? null;
  }

  async getGenerationJob(jobId: string): Promise<GenerationJob> {
    return toGenerationJob(await this.api.get<OptimizationStatusResponse>(`${V1}/optimizations/${enc(jobId)}`));
  }

  async retryGeneration(jobId: string): Promise<{ jobId: string; notes: string[] }> {
    const res = await this.api.post<{ optimization_id: string; notes?: string[] }>(
      `${V1}/optimizations/${enc(jobId)}/retry`,
      {}
    );
    // The retried job ran the same requirements; keep them reachable for the results screens.
    const cache = await getCacheRepository();
    const submitted = await cache.get<RequirementsContract>(submittedKey(jobId));
    if (submitted?.value) await cache.set(submittedKey(res.optimization_id), submitted.value, "local");
    return { jobId: res.optimization_id, notes: res.notes ?? [] };
  }
}

export class ApiTemplateService implements TemplateService {
  constructor(private readonly api: ApiClient) {}

  getCatalog(): Promise<TemplateCatalog> {
    return this.api.get<TemplateCatalog>(`${V1}/templates`).catch(notSupportedOn404("Template catalogue"));
  }

  checkCompatibility(input: CompatibilityInput, signal?: AbortSignal): Promise<CompatibilityResult> {
    return this.api
      .post<CompatibilityResult>(
        `${V1}/design-compatibility`,
        {
          requirements: input.requirements,
          template_id: input.templateId ?? null,
          room_arrangement: input.roomArrangement ?? {},
          materials_snapshot_id: input.materialsSnapshotId ?? null,
        },
        { signal, timeoutMs: 15_000 }
      )
      .catch(notSupportedOn404("Compatibility check"));
  }
}

export class ApiCandidateService implements CandidateService {
  constructor(private readonly api: ApiClient) {}

  getCandidates(optimizationId: string): Promise<CandidatesResponse> {
    return this.api.get(`${V1}/optimizations/${enc(optimizationId)}/candidates`);
  }

  getPareto(optimizationId: string): Promise<ParetoResponse> {
    return this.api.get(`${V1}/optimizations/${enc(optimizationId)}/pareto`);
  }

  getDesign(optimizationId: string, designId: string): Promise<BuildingModel> {
    return this.api.get(`${V1}/optimizations/${enc(optimizationId)}/designs/${enc(designId)}`);
  }
}

export class ApiSimulationService implements SimulationService {
  constructor(private readonly api: ApiClient) {}

  /**
   * POST /api/v1/simulations. The backend derives the simulation id from a
   * hash of the inputs, so the same design + window returns the stored run.
   */
  async getForDesign(request: DesignSimulationRequest): Promise<SimulationResult> {
    const response = await this.api.post<SimulationResult>(
      `${V1}/simulations`,
      {
        building: request.building,
        weather_snapshot_id: request.weatherSnapshotId,
        mode: SIMULATION_MODE,
        window_start: request.windowStart,
        window_end: request.windowEnd,
        setpoint_c: request.setpointC,
        timestep_seconds: SIMULATION_TIMESTEP_SECONDS,
      },
      { timeoutMs: 120_000 }
    );
    return toSimulationContract(response);
  }

  getTimeseries(simulationId: string): Promise<TimeseriesResponse> {
    return this.api.get(`${V1}/simulations/${enc(simulationId)}/timeseries`);
  }
}

export class ApiEconomicsService implements EconomicsService {
  constructor(private readonly api: ApiClient) {}

  listAssumptionSets(): Promise<AssumptionSetsResponse> {
    return this.api.get(`${V1}/economic-assumption-sets`);
  }

  getForDesign(request: DesignEconomicsRequest): Promise<EconomicsReport> {
    // Exactly the M0 contract (M7 forbids extra fields); the hourly series is not needed for pricing.
    const { time_series: _omit, ...simulation } = toSimulationContract(request.simulation);
    return this.api.post<EconomicsReport>(
      `${V1}/economics`,
      {
        assumption_set_id: request.assumptionSetId,
        design: {
          building: request.building,
          simulation,
          simulated_hours: request.simulatedHours,
          target_temperature_c: request.targetTemperatureC ?? null,
        },
        occupants: request.occupants ?? null,
      },
      {
        idempotencyKey: `econ:${request.building.revision_id}:${request.simulation.simulation_id}:${request.assumptionSetId}`,
        timeoutMs: 120_000,
      }
    );
  }
}

export class ApiVisualizationService implements VisualizationService {
  constructor(private readonly api: ApiClient) {}

  async getForDesign(request: VisualizationRequest): Promise<VisualizationResult> {
    try {
      const model = await this.api.get<VisualizationResult["model"]>(
        `${V1}/visualizations/${enc(request.building.revision_id)}`
      );
      return { model, origin: "backend" };
    } catch (error) {
      if (!isAppErrorKind(error, "not_found")) throw error;
      return { model: buildingToVisualizationModel(request.building, request.timeseries), origin: "building_geometry" };
    }
  }
}

export class ApiAnsysService implements AnsysService {
  constructor(private readonly api: ApiClient) {}

  getLatestForRevision(revisionId: string): Promise<AnsysValidationResult | AnsysNotRequested> {
    return this.api.get(`${ANSYS}/revisions/${enc(revisionId)}/latest`);
  }

  submitValidation(optimizationId: string, designId: string): Promise<AnsysSubmitResponse> {
    return this.api.post(`${ANSYS}/jobs`, { optimization_id: optimizationId, design_id: designId }, { timeoutMs: 60_000 });
  }

  getJob(jobId: string): Promise<AnsysValidationResult> {
    return this.api.get(`${ANSYS}/jobs/${enc(jobId)}`);
  }
}

export class ApiMaterialsService implements MaterialsService {
  constructor(private readonly api: ApiClient) {}

  async getCatalog(): Promise<MaterialCatalog> {
    const list = await this.api.get<MaterialsListResponse>(`${V1}/materials`);
    return {
      defaultSnapshotId: list.default,
      snapshots: list.snapshots.map((s) => ({
        snapshotId: s.snapshot_id,
        checksum: s.checksum_sha256,
        materialIds: [...s.materials].sort(),
        materials: s.material_records ? Object.values(s.material_records) as MaterialRecord[] : null,
      })),
    };
  }
}

export class ApiOptimizationHistoryService implements OptimizationHistoryService {
  constructor(private readonly api: ApiClient) {}

  private async listOfflineIndex(): Promise<RunList> {
    const index = await (await getRunsRepository()).list("api");
    return {
      source: "device_index_offline",
      runs: index.map(runSummaryFromIndex),
    };
  }

  /**
   * Prefers the backend's own list. main has no GET /api/v1/optimizations,
   * so on 404/405 the runs this device started are re-read one by one from
   * GET /api/v1/optimizations/{id} — the device only supplies the ids.
   */
  async listRuns(): Promise<RunList> {
    try {
      const list = await this.api.get<unknown>(`${V1}/optimizations`);
      const items = Array.isArray(list) ? list : (list as { optimizations?: unknown }).optimizations;
      if (Array.isArray(items)) {
        return { source: "backend_list", runs: (items as OptimizationStatusResponse[]).map(runSummaryFromStatus) };
      }
      throw new AppError({ kind: "malformed", message: "GET /api/v1/optimizations returned no list" });
    } catch (error) {
      if (isBackendUnavailable(error)) return this.listOfflineIndex();
      if (!isAppErrorKind(error, "not_found") && !(error instanceof AppError && error.status === 405)) throw error;
    }
    const index = await (await getRunsRepository()).list("api");
    let usedOfflineIndex = false;
    const runs = await Promise.all(
      index.map(async (entry): Promise<RunSummary> => {
        try {
          const status = await this.api.get<OptimizationStatusResponse>(`${V1}/optimizations/${enc(entry.jobId)}`);
          return { ...runSummaryFromStatus(status), projectId: status.project_id ?? entry.projectId };
        } catch (error) {
          if (isAppErrorKind(error, "not_found")) {
            return { optimizationId: entry.jobId, projectId: entry.projectId, status: "not_found", createdAt: entry.createdAt };
          }
          if (isBackendUnavailable(error)) {
            usedOfflineIndex = true;
            return runSummaryFromIndex(entry);
          }
          throw error;
        }
      })
    );
    return { source: usedOfflineIndex ? "device_index_offline" : "device_index", runs };
  }

  getReport(optimizationId: string): Promise<RunReport> {
    return this.api
      .get<{ artifacts?: Record<string, string> }>(`${V1}/optimizations/${enc(optimizationId)}/report`)
      .then((r) => ({ optimizationId, artifacts: r.artifacts ?? {} }))
      .catch(notSupportedOn404("Reports"));
  }
}

export class ApiProjectService implements ProjectService {
  constructor(private readonly api: ApiClient) {}

  listProjects(): Promise<Project[]> {
    return this.api
      .get<Project[] | { projects: Project[] }>(`${V1}/projects`)
      .then((r) => (Array.isArray(r) ? r : r.projects))
      .catch(notSupportedOn404("Projects"));
  }

  getProject(projectId: string): Promise<Project> {
    return this.api.get<Project>(`${V1}/projects/${enc(projectId)}`).catch(notSupportedOn404("Projects"));
  }

  createProject(project: Project): Promise<Project> {
    return this.api
      .post<Project>(`${V1}/projects`, project, { idempotencyKey: `project:create:${project.project_id}` })
      .catch(notSupportedOn404("Projects"));
  }

  updateProject(project: Project): Promise<Project> {
    return this.api
      .put<Project>(`${V1}/projects/${enc(project.project_id)}`, project)
      .catch(notSupportedOn404("Projects"));
  }

  async upsertProject(project: Project): Promise<void> {
    await this.updateProject(project).catch((error: unknown) => {
      if (isAppErrorKind(error, "not_supported")) throw error;
      if (isAppErrorKind(error, "not_found")) return this.createProject(project);
      throw error;
    });
  }
}

export class ApiAuthService implements AuthService {
  constructor(private readonly api: ApiClient, private readonly capabilities: CapabilitiesService) {}

  async availability(): Promise<AuthAvailability> {
    try {
      const caps = await this.capabilities.getCapabilities();
      if (caps.authMode === "disabled") {
        return { available: false, reason: "This COCOON backend runs without authentication (AUTH_MODE disabled); there is nothing to sign in to." };
      }
    } catch {
      return { available: false, reason: "The COCOON backend could not be reached." };
    }
    return { available: false, reason: "The backend does not expose an authentication endpoint this app supports yet." };
  }

  signIn(email: string, password: string): Promise<SignInResult> {
    return this.api
      .post<{ access_token: string }>(`${V1}/auth/login`, { email, password })
      .then((r) => ({ accessToken: r.access_token }))
      .catch(notSupportedOn404("Authentication"));
  }

  async register(input: { name: string; email: string; password: string }): Promise<void> {
    await this.api.post(`${V1}/auth/register`, input).catch(notSupportedOn404("Authentication"));
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.api.post(`${V1}/auth/forgot-password`, { email }).catch(notSupportedOn404("Authentication"));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.api.post(`${V1}/auth/reset-password`, { token, new_password: newPassword }).catch(notSupportedOn404("Authentication"));
  }
}

function runSummaryFromStatus(s: OptimizationStatusResponse): RunSummary {
  const job = toGenerationJob(s);
  return {
    optimizationId: job.jobId,
    projectId: s.project_id ?? null,
    status: job.status,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    candidateCount: job.summary?.generated,
    recommendedDesignId: job.recommendedDesignId,
    validationState: job.validationState,
    errorMessage: job.error?.message,
  };
}

const KNOWN_RUN_STATUSES = new Set(["queued", "running", "completed", "failed", "unknown"]);

function runSummaryFromIndex(entry: RunIndexEntry): RunSummary {
  return {
    optimizationId: entry.jobId,
    projectId: entry.projectId,
    status:
      entry.lastStatus && KNOWN_RUN_STATUSES.has(entry.lastStatus)
        ? (entry.lastStatus as RunSummary["status"])
        : "unknown",
    createdAt: entry.createdAt,
  };
}
