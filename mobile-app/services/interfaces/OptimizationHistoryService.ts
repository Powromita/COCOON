import type { GenerationJobStatus } from "./GenerationService";

/** One optimization run as the backend reports it. */
export interface RunSummary {
  optimizationId: string;
  projectId: string | null;
  status: GenerationJobStatus | "not_found";
  createdAt?: string;
  finishedAt?: string;
  candidateCount?: number;
  recommendedDesignId?: string | null;
  validationState?: string;
  errorMessage?: string;
}

/**
 * Where the list came from:
 * - "backend_list"  — GET /api/v1/optimizations (not on main yet)
 * - "device_index"  — ids this device started, each re-read from GET /api/v1/optimizations/{id}
 * - "device_index_offline" — local run ids and last-known statuses because the backend is unreachable
 * - "fixture"       — the recorded demo run
 */
export type RunListSource = "backend_list" | "device_index" | "device_index_offline" | "fixture";

export interface RunList {
  source: RunListSource;
  runs: RunSummary[];
}

export interface RunReport {
  optimizationId: string;
  /** Artifact name → URL, as the backend lists them. */
  artifacts: Record<string, string>;
}

export interface OptimizationHistoryService {
  listRuns(): Promise<RunList>;
  /** GET /api/v1/optimizations/{id}/report — throws AppError "not_supported" where the backend has no report endpoint. */
  getReport(optimizationId: string): Promise<RunReport>;
}
