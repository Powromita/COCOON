import type { RequirementsContract } from "@cocoon/contracts";

import type { OptimizationJobStatus, SiteUsed } from "../../types/backend";

export interface StartGenerationInput {
  requirements: RequirementsContract;
  /** Number of candidate designs to generate (backend accepts 1..200). */
  count: number;
  seed: number;
  materialsSnapshotId?: string;
  /** Sent as Idempotency-Key so a retried submission never starts a second job. */
  idempotencyKey: string;
}

/** The backend reports only these states. "unknown" covers anything it adds later. */
export type GenerationJobStatus = OptimizationJobStatus | "unknown";

export interface GenerationJob {
  jobId: string;
  status: GenerationJobStatus;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  /** Chosen by the backend optimizer (M6) — never by the app. */
  recommendedDesignId?: string | null;
  validationState?: string;
  summary?: { generated?: number; dominated?: number; on_front?: number };
  weatherSnapshotId?: string;
  siteUsed?: SiteUsed;
  warnings?: string[];
  error?: { code?: string; message: string; retryable?: boolean };
}

/**
 * Design generation = the backend optimization job (POST /api/v1/optimizations):
 * M2 layout generation → M4 verification → M7 pricing → M6 ranking.
 */
export interface GenerationService {
  startGeneration(input: StartGenerationInput): Promise<{ jobId: string }>;
  getGenerationJob(jobId: string): Promise<GenerationJob>;
  /**
   * The RequirementsContract this job was actually run with — used by the
   * results screens for the analysis window, setpoint and occupants.
   * Returns null if it isn't known on this device.
   */
  getSubmittedRequirements(jobId: string): Promise<RequirementsContract | null>;
}
