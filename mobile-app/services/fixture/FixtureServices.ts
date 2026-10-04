/**
 * Fixture providers — every service interface backed by fixture data
 * (mocks/fixtureLoader.ts). Used when EXPO_PUBLIC_DATA_PROVIDER=fixture.
 *
 * What the demo data is: one real optimization run recorded from the COCOON
 * backend for the M0 sample requirements (Leh, 30 occupants), plus the M0
 * package's own sample contracts. Whatever requirements the user enters,
 * "generation" returns that recorded run — the generation screen says so.
 *
 * Rules kept here: no value is invented. Where the demo data has nothing
 * (ANSYS for these designs, reports, project sync) the provider says so with
 * the same AppError kinds the API provider uses.
 */
import type { AnsysValidationResult, BuildingModel, Project, RequirementsContract, SimulationResult } from "@cocoon/contracts";

import { buildingToVisualizationModel } from "../../adapters/visualization";
import * as fx from "../../mocks/fixtureLoader";
import type {
  AnsysNotRequested,
  AnsysSubmitResponse,
  AssumptionSetsResponse,
  CandidatesResponse,
  EconomicsReport,
  ParetoResponse,
  TimeseriesResponse,
} from "../../types/backend";
import { AppError, FixtureNotFoundError } from "../../utils/errors";
import type { AnsysService } from "../interfaces/AnsysService";
import type { CandidateService } from "../interfaces/CandidateService";
import type { CapabilitiesService, CapabilitiesSnapshot, CapabilityEntry } from "../interfaces/CapabilitiesService";
import type { DesignEconomicsRequest, EconomicsService } from "../interfaces/EconomicsService";
import type { GenerationJob, GenerationService, StartGenerationInput } from "../interfaces/GenerationService";
import type { MaterialCatalog, MaterialsService } from "../interfaces/MaterialsService";
import type { AuthAvailability, AuthService, SignInResult } from "../interfaces/AuthService";
import type { OptimizationHistoryService, RunList, RunReport } from "../interfaces/OptimizationHistoryService";
import type { ProjectService } from "../interfaces/ProjectService";
import type { TemplateService } from "../interfaces/TemplateService";
import type { DesignSimulationRequest, SimulationService } from "../interfaces/SimulationService";
import type { VisualizationResult, VisualizationRequest, VisualizationService } from "../interfaces/VisualizationService";
import { checkLocalStorage, toGenerationJob } from "../shared/mappers";

/** A short, fixed latency so loading states render the same way they will against a real backend. */
export const FIXTURE_LATENCY_MS = 250;

function later<T>(produce: () => T, ms = FIXTURE_LATENCY_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(produce());
      } catch (e) {
        reject(e);
      }
    }, ms);
  });
}

function requireRecordedRun(optimizationId: string): void {
  if (optimizationId !== fx.RECORDED_OPTIMIZATION_ID) {
    throw new FixtureNotFoundError("recorded optimization", optimizationId);
  }
}

export class FixtureCapabilitiesService implements CapabilitiesService {
  async getCapabilities(): Promise<CapabilitiesSnapshot> {
    const recorded = fx.getRecordedCapabilities();
    const demo = (detail: string) => ({ status: "DEMO" as const, detail });
    const m = recorded.modules;
    const entries: CapabilityEntry[] = [
      { key: "backend", label: "COCOON backend", status: "NOT_CONNECTED", detail: "Demo mode — no backend is contacted" },
      { key: "design_generator", label: "Layout generator (M2)", ...demo("Recorded M2 output") },
      { key: "weather", label: "Weather archives (M3)", ...demo(`Recorded snapshot · ${m.m3_weather_sites?.length ?? 0} sites listed`) },
      {
        key: "physics_engine",
        label: "Physics engine (M4)",
        ...demo(`Recorded ${m.m4_engine?.name ?? "M4"} ${m.m4_engine?.version ?? ""} results`.trim()),
      },
      { key: "ml", label: "ML screening (M5)", ...demo("Not used in the recorded run") },
      { key: "optimization", label: "Optimization (M6)", ...demo("Recorded M6 ranking and Pareto front") },
      { key: "economics", label: "Economics (M7)", ...demo("Recorded M7 lifecycle reports") },
      { key: "ansys", label: "ANSYS validation (M8)", status: "NOT_CONNECTED", detail: "ANSYS cannot run in demo mode" },
      {
        key: "visualization",
        label: "3D visualization models",
        ...demo("Drawn from the recorded BuildingModel geometry"),
      },
      { key: "reports", label: "Reports (M13)", status: "NOT_SUPPORTED", detail: "No reports endpoint exists yet" },
      { key: "project_sync", label: "Project sync", status: "NOT_CONNECTED", detail: "Projects stay on this device" },
      await checkLocalStorage(),
    ];
    return {
      checkedAt: new Date().toISOString(),
      provider: "fixture",
      backendReachable: false,
      authMode: null,
      schemaVersions: recorded.schema_versions,
      weatherSites: m.m3_weather_sites ?? [],
      weatherSiteDetails: [],
      entries,
    };
  }
}

export class FixtureGenerationService implements GenerationService {
  /** jobId -> submission time. Status advances queued → running → completed with elapsed time. */
  private readonly submittedAt = new Map<string, number>();

  constructor(
    private readonly queuedMs = 1_500,
    private readonly runningMs = 4_000,
    private readonly now: () => number = Date.now
  ) {}

  async startGeneration(_input: StartGenerationInput): Promise<{ jobId: string }> {
    const created = await later(fx.getRecordedCreate);
    this.submittedAt.set(created.optimization_id, this.now());
    return { jobId: created.optimization_id };
  }

  async getGenerationJob(jobId: string): Promise<GenerationJob> {
    requireRecordedRun(jobId);
    const started = this.submittedAt.get(jobId);
    const elapsed = started === undefined ? Number.POSITIVE_INFINITY : this.now() - started;
    return later(() => {
      if (elapsed < this.queuedMs) {
        const running = fx.getRecordedStatusRunning();
        return toGenerationJob({ ...running, status: "queued", started_at: undefined });
      }
      if (elapsed < this.queuedMs + this.runningMs) return toGenerationJob(fx.getRecordedStatusRunning());
      return toGenerationJob(fx.getRecordedStatusCompleted());
    });
  }

  /** The recorded run used the M0 sample requirements, whatever the user entered. */
  async getSubmittedRequirements(jobId: string): Promise<RequirementsContract | null> {
    requireRecordedRun(jobId);
    return fx.getSampleRequirements();
  }

  async retryGeneration(_jobId: string): Promise<{ jobId: string; notes: string[] }> {
    throw new AppError({ kind: "not_supported", message: "Retrying a run needs the COCOON backend; recorded runs cannot be re-run." });
  }
}

/**
 * There is no recorded template catalogue: the catalogue and every compatibility
 * decision must come from a live M2, so the fixture provider says so instead of
 * inventing one.
 */
export class FixtureTemplateService implements TemplateService {
  async getCatalog(): Promise<never> {
    throw new AppError({ kind: "not_supported", message: "The M2 template catalogue is only available from the COCOON backend." });
  }

  async checkCompatibility(): Promise<never> {
    throw new AppError({ kind: "not_supported", message: "Compatibility checks are only available from the COCOON backend." });
  }
}

export class FixtureCandidateService implements CandidateService {
  getCandidates(optimizationId: string): Promise<CandidatesResponse> {
    return later(() => {
      requireRecordedRun(optimizationId);
      return fx.getRecordedCandidates();
    });
  }

  getPareto(optimizationId: string): Promise<ParetoResponse> {
    return later(() => {
      requireRecordedRun(optimizationId);
      return fx.getRecordedPareto();
    });
  }

  getDesign(optimizationId: string, designId: string): Promise<BuildingModel> {
    return later(() => {
      requireRecordedRun(optimizationId);
      return fx.getRecordedDesign(designId);
    });
  }
}

export class FixtureSimulationService implements SimulationService {
  getForDesign(request: DesignSimulationRequest): Promise<SimulationResult> {
    return later(() => fx.getRecordedSimulationForDesign(request.designId));
  }

  getTimeseries(simulationId: string): Promise<TimeseriesResponse> {
    return later(() => fx.getRecordedTimeseries(simulationId));
  }
}

export class FixtureEconomicsService implements EconomicsService {
  listAssumptionSets(): Promise<AssumptionSetsResponse> {
    return later(fx.getRecordedAssumptionSets);
  }

  getForDesign(request: DesignEconomicsRequest): Promise<EconomicsReport> {
    return later(() => fx.getRecordedEconomicsForDesign(request.designId));
  }
}

export class FixtureVisualizationService implements VisualizationService {
  getForDesign(request: VisualizationRequest): Promise<VisualizationResult> {
    return later(() => ({
      model: buildingToVisualizationModel(request.building, request.timeseries),
      origin: "building_geometry" as const,
    }));
  }
}

export class FixtureAnsysService implements AnsysService {
  /** The recorded run did not request ANSYS — the backend reported RC_ONLY_ANSYS_NOT_REQUESTED. */
  getLatestForRevision(revisionId: string): Promise<AnsysValidationResult | AnsysNotRequested> {
    return later(() => ({ design_revision_id: revisionId, status: "NOT_REQUESTED" as const }));
  }

  async submitValidation(_optimizationId: string, _designId: string): Promise<AnsysSubmitResponse> {
    throw new AppError({
      kind: "unavailable",
      message: "ANSYS validation cannot run in demo mode.",
      backendMessage: "ANSYS validation is currently unavailable in demo mode. Connect to a COCOON backend with ANSYS installed.",
    });
  }

  async getJob(jobId: string): Promise<AnsysValidationResult> {
    throw new FixtureNotFoundError("ANSYS job", jobId);
  }
}

export class FixtureMaterialsService implements MaterialsService {
  getCatalog(): Promise<MaterialCatalog> {
    return later(() => {
      const list = fx.getRecordedMaterialsList();
      return {
        defaultSnapshotId: list.default,
        snapshots: fx.getAllMaterialSnapshots().map((s) => ({
          snapshotId: s.snapshot_id,
          checksum: s.checksum_sha256,
          materialIds: Object.keys(s.materials).sort(),
          materials: Object.values(s.materials),
        })),
      };
    });
  }
}

export class FixtureOptimizationHistoryService implements OptimizationHistoryService {
  /** Demo history is the one recorded run — never mixed with backend runs. */
  listRuns(): Promise<RunList> {
    return later(() => {
      const status = fx.getRecordedStatusCompleted();
      const job = toGenerationJob(status);
      return {
        source: "fixture" as const,
        runs: [
          {
            optimizationId: job.jobId,
            projectId: status.project_id ?? null,
            status: job.status,
            createdAt: job.createdAt,
            finishedAt: job.finishedAt,
            candidateCount: job.summary?.generated,
            recommendedDesignId: job.recommendedDesignId,
            validationState: job.validationState,
          },
        ],
      };
    });
  }

  async getReport(): Promise<RunReport> {
    throw new AppError({
      kind: "not_supported",
      message: "No report endpoint exists yet.",
      backendMessage: "PDF export is coming soon — the COCOON backend does not produce reports yet.",
    });
  }
}

const DEMO_READ_ONLY = () =>
  new AppError({ kind: "not_supported", message: "Demo projects are read-only.", backendMessage: "Demo projects are read-only." });

export class FixtureProjectService implements ProjectService {
  /** The M0 package's sample project, shown as a DEMO project. */
  listProjects(): Promise<Project[]> {
    return later(() => [fx.getSampleProject()]);
  }

  getProject(projectId: string): Promise<Project> {
    return later(() => {
      const p = fx.getSampleProject();
      if (p.project_id !== projectId) throw new FixtureNotFoundError("demo project", projectId);
      return p;
    });
  }

  async createProject(): Promise<Project> {
    throw DEMO_READ_ONLY();
  }

  async updateProject(): Promise<Project> {
    throw DEMO_READ_ONLY();
  }

  async upsertProject(): Promise<void> {
    throw new AppError({ kind: "not_supported", message: "Project sync is not available in demo mode." });
  }
}

export class FixtureAuthService implements AuthService {
  async availability(): Promise<AuthAvailability> {
    return { available: false, reason: "Demo mode does not use sign-in; no identity service is connected." };
  }

  private unavailable(): never {
    throw new AppError({
      kind: "not_supported",
      message: "Authentication is not available in demo mode.",
      backendMessage: "Authentication service unavailable in demo mode.",
    });
  }

  async signIn(): Promise<SignInResult> {
    this.unavailable();
  }

  async register(): Promise<void> {
    this.unavailable();
  }

  async requestPasswordReset(): Promise<void> {
    this.unavailable();
  }

  async resetPassword(): Promise<void> {
    this.unavailable();
  }
}
