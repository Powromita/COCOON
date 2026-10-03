/**
 * Mobile-only DB row and draft types. These are NOT @cocoon/contracts types:
 * they describe how an in-progress M0 RequirementsContract is stored on the
 * device (every group partial while the project is a draft). See
 * validation/schemas.ts for how a draft is checked and turned into a
 * complete RequirementsContract.
 */
import type { DesignConstraints, MissionRequirements, SiteSpecification } from "@cocoon/contracts";

/** App-only options sent alongside the requirements when generation starts (not part of the M0 contract). */
export interface DraftGenerationOptions {
  materials_snapshot_id?: string;
  /** Number of candidate designs requested from the backend. */
  count?: number;
  seed?: number;
  /** Include the standard baseline comparison in lifecycle economics. */
  baseline_economics?: boolean;
  validate_with_ansys?: boolean;
  /** A template the user picked on the review step; null/absent = automatic (every compatible template). */
  template_id?: string | null;
  /** Per room type: must it have its own room, or share one? Absent = either. Checked by the backend catalogue. */
  room_arrangement?: Record<string, "dedicated" | "shared">;
}

export interface DraftEnvelope {
  length_m?: number;
  width_m?: number;
  height_m?: number;
  wall_thickness_mm?: number;
  roof_thickness_mm?: number;
  floor_thickness_mm?: number;
  window_count?: number;
  window_width_m?: number;
  window_height_m?: number;
  window_orientation?: string;
  glazing_spec?: string;
  air_changes_per_hour?: number;
}

/** Draft of an M0 RequirementsContract — the groups mirror the contract exactly. */
export interface DraftRequirements {
  /** Custom shelter name entered in Step 1. */
  project_name?: string;
  /** UI location chosen from a real backend weather archive; not part of M0. */
  location_name?: string;
  weather_archive_site?: string;
  site?: Partial<SiteSpecification>;
  mission?: Partial<MissionRequirements>;
  constraints?: Partial<DesignConstraints>;
  envelope?: DraftEnvelope;
  economic_assumption_set_id?: string;
  generation_options?: DraftGenerationOptions;
}

export const EMPTY_DRAFT_REQUIREMENTS: DraftRequirements = {};

/** 1 = interim hand-written contracts (pre-M0), 2 = M0 RequirementsContract. */
export const CURRENT_DRAFT_FORMAT = 2;

// ---------------------------------------------------------------------------
// SQLite rows (migrations 001 + 002)
// ---------------------------------------------------------------------------

export type ProjectDbStatus = "DRAFT" | "READY";

/** Last known status of the backend generation job — mirrors GenerationJobStatus. */
export type ProjectRunStatus = "queued" | "running" | "completed" | "failed" | "unknown";

export interface ProjectRow {
  id: string;
  name: string;
  status: ProjectDbStatus;
  requirements_json: string;
  schema_version: string;
  last_step: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  draft_format: number;
  run_job_id: string | null;
  run_status: ProjectRunStatus | null;
  run_started_at: string | null;
  run_error: string | null;
  recommended_design_id: string | null;
  selected_design_id: string | null;
  /** Which provider ran the generation ("fixture" | "api") — so demo runs stay labelled as demo. */
  data_provider: string | null;
}

/** What the project list renders. */
export type ProjectDisplayStatus =
  | "DRAFT"
  | "REQUIREMENTS_COMPLETE"
  | "GENERATING"
  | "CANDIDATES_READY"
  | "FAILED"
  | "NEEDS_MIGRATION"
  | "CORRUPT";

export interface ProjectListItem {
  id: string;
  name: string;
  displayStatus: ProjectDisplayStatus;
  lastStep: number;
  updatedAt: string;
  /** Short site description from the draft, e.g. "34.153°, 77.577° · 3500 m". */
  locationLabel: string | null;
  selectedDesignId: string | null;
  runJobId: string | null;
  occupants: number | null;
  /** Maximum footprint from the requirements (m²), or null for no limit / not set. */
  maxFootprintM2: number | null;
  materialIds: string[];
  runStatus: ProjectRunStatus | null;
  dataProvider: string | null;
}

/** A single project's full record, with the JSON already parsed (or flagged corrupt). */
export interface ProjectRecord {
  row: ProjectRow;
  requirements: DraftRequirements | undefined;
  isCorrupt: boolean;
  needsMigration: boolean;
  /** True when isCorrupt or needsMigration — the editor opens read-only. */
  readOnly: boolean;
  displayStatus: ProjectDisplayStatus;
}

export interface CacheRow {
  cache_key: string;
  value_json: string;
  source: string;
  fetched_at: string;
}

export type SyncOperationStatus = "pending" | "syncing" | "failed";

export interface SyncOperation {
  id: string;
  type: string;
  projectId: string;
  payload: unknown;
  status: SyncOperationStatus;
  attempts: number;
  lastError: string | null;
  /** A permanent failure is surfaced to the user and never retried automatically. */
  permanent: boolean;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
}
