/**
 * ProjectsRepository — the ONLY module allowed to run SQL against the
 * `projects` table. Every method returns a Result instead of throwing for
 * expected failures (not found, validation failed, a DB error), so callers
 * never need a try/catch around a repository call.
 */
import * as Crypto from "expo-crypto";

import { SUPPORTED_SCHEMA_VERSION } from "../../utils/contracts";
import type { Result } from "../../utils/result";
import { err, ok } from "../../utils/result";
import type { FieldErrors } from "../../validation/schemas";
import { validateAll } from "../../validation/schemas";
import type { DbDriver } from "../DbDriver";
import type {
  DraftRequirements,
  ProjectDisplayStatus,
  ProjectListItem,
  ProjectRecord,
  ProjectRow,
  ProjectRunStatus,
} from "../schema/types";
import { CURRENT_DRAFT_FORMAT, EMPTY_DRAFT_REQUIREMENTS } from "../schema/types";

function validateProjectName(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Name is required.";
  if (trimmed.length > 80) return "Name must be 80 characters or fewer.";
  return undefined;
}

function toMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** M0 requires project ids with a "prj_" prefix. */
export function newProjectId(): string {
  return `prj_${Crypto.randomUUID().replace(/-/g, "")}`;
}

function parseRequirements(json: string): { requirements: DraftRequirements | undefined; isCorrupt: boolean } {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { requirements: undefined, isCorrupt: true };
    }
    return { requirements: parsed as DraftRequirements, isCorrupt: false };
  } catch {
    return { requirements: undefined, isCorrupt: true };
  }
}

function needsMigration(row: ProjectRow): boolean {
  return row.schema_version !== SUPPORTED_SCHEMA_VERSION || (row.draft_format ?? 1) < CURRENT_DRAFT_FORMAT;
}

export function displayStatusFor(row: ProjectRow, isCorrupt: boolean): ProjectDisplayStatus {
  if (isCorrupt) return "CORRUPT";
  if (needsMigration(row)) return "NEEDS_MIGRATION";
  if (row.run_status === "queued" || row.run_status === "running") return "GENERATING";
  if (row.run_status === "completed") return "CANDIDATES_READY";
  if (row.run_status === "failed") return "FAILED";
  return row.status === "READY" ? "REQUIREMENTS_COMPLETE" : "DRAFT";
}

function locationLabel(req: DraftRequirements | undefined): string | null {
  const s = req?.site;
  if (typeof s?.latitude_deg !== "number" || typeof s.longitude_deg !== "number") return null;
  const elev = typeof s.elevation_m === "number" ? ` · ${Math.round(s.elevation_m)} m` : "";
  return `${s.latitude_deg.toFixed(3)}°, ${s.longitude_deg.toFixed(3)}°${elev}`;
}

function buildRecord(row: ProjectRow): ProjectRecord {
  const { requirements, isCorrupt } = parseRequirements(row.requirements_json);
  const migrate = !isCorrupt && needsMigration(row);
  return {
    row,
    requirements,
    isCorrupt,
    needsMigration: migrate,
    readOnly: isCorrupt || migrate,
    displayStatus: displayStatusFor(row, isCorrupt),
  };
}

function rowToListItem(row: ProjectRow): ProjectListItem {
  const { requirements, isCorrupt } = parseRequirements(row.requirements_json);
  const readable = !isCorrupt && !needsMigration(row);
  const occupants = readable ? requirements?.mission?.occupants : undefined;
  const footprint = readable ? requirements?.constraints?.maximum_footprint_m2 : undefined;
  return {
    occupants: typeof occupants === "number" ? occupants : null,
    maxFootprintM2: typeof footprint === "number" ? footprint : null,
    materialIds: readable ? [...(requirements?.constraints?.available_material_ids ?? [])] : [],
    runStatus: row.run_status,
    dataProvider: row.data_provider,
    id: row.id,
    name: row.name,
    displayStatus: displayStatusFor(row, isCorrupt),
    lastStep: row.last_step,
    updatedAt: row.updated_at,
    locationLabel: isCorrupt || needsMigration(row) ? null : locationLabel(requirements),
    selectedDesignId: row.selected_design_id,
    runJobId: row.run_job_id,
  };
}

export class ProjectsRepository {
  constructor(private readonly db: DbDriver) {}

  private async update(id: string, sql: string, params: unknown[]): Promise<Result<void>> {
    try {
      const result = await this.db.runAsync(sql, [...params, id]);
      if (result.changes === 0) return err("Project not found.");
      return ok(undefined);
    } catch (cause) {
      return err(toMessage(cause));
    }
  }

  async createDraft(name: string, requirements: DraftRequirements = EMPTY_DRAFT_REQUIREMENTS): Promise<Result<ProjectRow>> {
    const nameError = validateProjectName(name);
    if (nameError) return err(nameError);

    const now = new Date().toISOString();
    const row: ProjectRow = {
      id: newProjectId(),
      name: name.trim(),
      status: "DRAFT",
      requirements_json: JSON.stringify(requirements),
      schema_version: SUPPORTED_SCHEMA_VERSION,
      last_step: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      draft_format: CURRENT_DRAFT_FORMAT,
      run_job_id: null,
      run_status: null,
      run_started_at: null,
      run_error: null,
      recommended_design_id: null,
      selected_design_id: null,
      data_provider: null,
    };

    try {
      await this.db.runAsync(
        `INSERT INTO projects
           (id, name, status, requirements_json, schema_version, last_step, created_at, updated_at, deleted_at, draft_format)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          row.id,
          row.name,
          row.status,
          row.requirements_json,
          row.schema_version,
          row.last_step,
          row.created_at,
          row.updated_at,
          row.deleted_at,
          row.draft_format,
        ]
      );
      return ok(row);
    } catch (cause) {
      return err(toMessage(cause));
    }
  }

  async listProjects(): Promise<Result<ProjectListItem[]>> {
    try {
      const rows = await this.db.getAllAsync<ProjectRow>(
        "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC;"
      );
      return ok(rows.map(rowToListItem));
    } catch (cause) {
      return err(toMessage(cause));
    }
  }

  async getProject(id: string): Promise<Result<ProjectRecord | null>> {
    try {
      const row = await this.db.getFirstAsync<ProjectRow>(
        "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL;",
        [id]
      );
      return ok(row ? buildRecord(row) : null);
    } catch (cause) {
      return err(toMessage(cause));
    }
  }

  saveDraft(id: string, requirements: DraftRequirements, lastStep: number): Promise<Result<void>> {
    return this.update(
      id,
      "UPDATE projects SET requirements_json = ?, last_step = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL;",
      [JSON.stringify(requirements), lastStep, new Date().toISOString()]
    );
  }

  /** Succeeds only if the draft is a complete, valid RequirementsContract — see validation/schemas.ts. */
  async markReady(id: string): Promise<Result<void, FieldErrors>> {
    const rootError = (message: string): FieldErrors => [
      { step: "review", field: "_root", label: "Project", message, kind: "invalid" },
    ];

    const recordResult = await this.getProject(id);
    if (!recordResult.ok) return err(rootError(recordResult.error));
    if (!recordResult.data) return err(rootError("Project not found."));

    const record = recordResult.data;
    if (record.isCorrupt) return err(rootError("This draft is corrupted and cannot be marked ready."));
    if (record.needsMigration) return err(rootError("This draft was saved in an older format and needs migration."));

    const fieldErrors = validateAll(record.requirements ?? {});
    if (fieldErrors.length > 0) return err(fieldErrors);

    const result = await this.update(
      id,
      "UPDATE projects SET status = 'READY', updated_at = ? WHERE id = ? AND deleted_at IS NULL;",
      [new Date().toISOString()]
    );
    return result.ok ? ok(undefined) : err(rootError(result.error));
  }

  /** READY -> DRAFT, used when the user edits a READY project. */
  revertToDraft(id: string): Promise<Result<void>> {
    return this.update(id, "UPDATE projects SET status = 'DRAFT', updated_at = ? WHERE id = ? AND deleted_at IS NULL;", [
      new Date().toISOString(),
    ]);
  }

  renameProject(id: string, name: string): Promise<Result<void>> {
    const nameError = validateProjectName(name);
    if (nameError) return Promise.resolve(err(nameError));
    return this.update(id, "UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL;", [
      name.trim(),
      new Date().toISOString(),
    ]);
  }

  /** Soft delete — see restoreProject for the Undo path. */
  deleteProject(id: string): Promise<Result<void>> {
    const now = new Date().toISOString();
    return this.update(id, "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL;", [
      now,
      now,
    ]);
  }

  restoreProject(id: string): Promise<Result<void>> {
    return this.update(id, "UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?;", [new Date().toISOString()]);
  }

  /** Records a submitted backend generation job against the project. */
  recordRunStarted(id: string, jobId: string, dataProvider: string): Promise<Result<void>> {
    const now = new Date().toISOString();
    return this.update(
      id,
      `UPDATE projects SET run_job_id = ?, run_status = 'queued', run_started_at = ?, run_error = NULL,
         recommended_design_id = NULL, selected_design_id = NULL, data_provider = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL;`,
      [jobId, now, dataProvider, now]
    );
  }

  /** Stores the latest job status the backend reported. Only ever called with backend-reported values. */
  recordRunStatus(
    id: string,
    status: ProjectRunStatus,
    extras: { recommendedDesignId?: string | null; error?: string | null } = {}
  ): Promise<Result<void>> {
    return this.update(
      id,
      `UPDATE projects SET run_status = ?, recommended_design_id = COALESCE(?, recommended_design_id),
         run_error = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL;`,
      [status, extras.recommendedDesignId ?? null, extras.error ?? null, new Date().toISOString()]
    );
  }

  selectDesign(id: string, designId: string | null): Promise<Result<void>> {
    return this.update(
      id,
      "UPDATE projects SET selected_design_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL;",
      [designId, new Date().toISOString()]
    );
  }
}
