/**
 * Sync queue processor. Operations are stored durably in SQLite
 * (SyncQueueRepository) and replayed when the network returns.
 *
 * - Transient failures (offline, timeout, 5xx, 429) stay queued and are
 *   retried on the next run, up to MAX_ATTEMPTS.
 * - Permanent failures (4xx, endpoint not supported, malformed payload) are
 *   marked permanent and shown to the user in Settings — never retried
 *   silently.
 * - The UNIQUE dedupe key means the same logical operation is never
 *   submitted twice.
 *
 * Only operations that are safe to replay later belong here. Backend
 * calculations (design generation, simulations) are never queued: they
 * need a connection and the UI says so.
 */
import type { Project } from "@cocoon/contracts";

import { IS_FIXTURE_MODE } from "../constants/env";
import { getSyncQueueRepository } from "../database";
import type { SyncOperation } from "../database/schema/types";
import { projectService } from "../services/registry";
import { AppError } from "../utils/errors";

export const MAX_ATTEMPTS = 5;

export type SyncHandler = (operation: SyncOperation) => Promise<void>;

export const SYNC_HANDLERS: Record<string, SyncHandler> = {
  "project.upsert": async (op) => {
    await projectService.upsertProject(op.payload as Project);
  },
};

const PERMANENT_KINDS = new Set(["validation", "not_found", "not_supported", "forbidden", "malformed", "conflict", "not_configured"]);

export function isPermanentFailure(error: unknown, attempts: number): boolean {
  if (attempts >= MAX_ATTEMPTS) return true;
  if (error instanceof AppError) return PERMANENT_KINDS.has(error.kind);
  return false;
}

export interface SyncRunSummary {
  attempted: number;
  succeeded: number;
  failedTransient: number;
  failedPermanent: number;
  skipped: "fixture_mode" | "already_running" | null;
}

let running = false;

/**
 * Processes every runnable operation once, in order. Safe to call
 * repeatedly — concurrent calls are skipped. Disabled in fixture mode:
 * there is no backend to sync to.
 */
export async function processSyncQueue(
  handlers: Record<string, SyncHandler> = SYNC_HANDLERS,
  options: { enabled?: boolean } = {}
): Promise<SyncRunSummary> {
  const summary: SyncRunSummary = { attempted: 0, succeeded: 0, failedTransient: 0, failedPermanent: 0, skipped: null };
  if (!(options.enabled ?? !IS_FIXTURE_MODE)) return { ...summary, skipped: "fixture_mode" };
  if (running) return { ...summary, skipped: "already_running" };
  running = true;
  try {
    const repo = await getSyncQueueRepository();
    await repo.resetInterrupted();
    for (const op of await repo.listRunnable()) {
      const handler = handlers[op.type];
      summary.attempted += 1;
      if (!handler) {
        await repo.markFailed(op.id, `No handler for operation type "${op.type}"`, true);
        summary.failedPermanent += 1;
        continue;
      }
      await repo.markSyncing(op.id);
      try {
        await handler(op);
        await repo.remove(op.id);
        summary.succeeded += 1;
      } catch (error) {
        const permanent = isPermanentFailure(error, op.attempts + 1);
        await repo.markFailed(op.id, error instanceof Error ? error.message : String(error), permanent);
        if (permanent) summary.failedPermanent += 1;
        else summary.failedTransient += 1;
      }
    }
    return summary;
  } finally {
    running = false;
  }
}

export async function enqueueProjectSync(project: Project): Promise<void> {
  const repo = await getSyncQueueRepository();
  await repo.enqueue({ type: "project.upsert", projectId: project.project_id, payload: project });
}
