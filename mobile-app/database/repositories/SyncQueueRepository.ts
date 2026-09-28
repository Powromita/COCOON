/**
 * SyncQueueRepository — durable storage for operations waiting for the
 * network (see sync/queue.ts for the processor). `dedupe_key` is UNIQUE, so
 * enqueueing the same logical operation twice replaces its payload instead
 * of creating a duplicate submission.
 */
import * as Crypto from "expo-crypto";

import type { DbDriver } from "../DbDriver";
import type { SyncOperation, SyncOperationStatus } from "../schema/types";

interface SyncRow {
  id: string;
  type: string;
  project_id: string;
  payload_json: string;
  status: SyncOperationStatus;
  attempts: number;
  last_error: string | null;
  permanent: number;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
}

function toOperation(row: SyncRow): SyncOperation {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }
  return {
    id: row.id,
    type: row.type,
    projectId: row.project_id,
    payload,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    permanent: row.permanent === 1,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface EnqueueInput {
  type: string;
  projectId: string;
  payload: unknown;
  /** Operations with the same key collapse into one; defaults to `${type}:${projectId}`. */
  dedupeKey?: string;
}

export class SyncQueueRepository {
  constructor(private readonly db: DbDriver) {}

  async enqueue(input: EnqueueInput): Promise<SyncOperation> {
    const now = new Date().toISOString();
    const dedupeKey = input.dedupeKey ?? `${input.type}:${input.projectId}`;
    await this.db.runAsync(
      `INSERT INTO sync_queue (id, type, project_id, payload_json, status, attempts, last_error, permanent, dedupe_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, NULL, 0, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO UPDATE SET payload_json = excluded.payload_json, status = 'pending',
         attempts = 0, last_error = NULL, permanent = 0, updated_at = excluded.updated_at;`,
      [Crypto.randomUUID(), input.type, input.projectId, JSON.stringify(input.payload), dedupeKey, now, now]
    );
    const row = await this.db.getFirstAsync<SyncRow>("SELECT * FROM sync_queue WHERE dedupe_key = ?;", [dedupeKey]);
    if (!row) throw new Error("Sync operation was not stored.");
    return toOperation(row);
  }

  async list(): Promise<SyncOperation[]> {
    const rows = await this.db.getAllAsync<SyncRow>("SELECT * FROM sync_queue ORDER BY created_at ASC;");
    return rows.map(toOperation);
  }

  /** Operations due for an attempt: pending, or failed-but-transient. Never permanent failures. */
  async listRunnable(): Promise<SyncOperation[]> {
    const rows = await this.db.getAllAsync<SyncRow>(
      "SELECT * FROM sync_queue WHERE permanent = 0 AND status IN ('pending','failed') ORDER BY created_at ASC;"
    );
    return rows.map(toOperation);
  }

  async markSyncing(id: string): Promise<void> {
    await this.db.runAsync(
      "UPDATE sync_queue SET status = 'syncing', attempts = attempts + 1, updated_at = ? WHERE id = ?;",
      [new Date().toISOString(), id]
    );
  }

  async markFailed(id: string, error: string, permanent: boolean): Promise<void> {
    await this.db.runAsync(
      "UPDATE sync_queue SET status = 'failed', last_error = ?, permanent = ?, updated_at = ? WHERE id = ?;",
      [error, permanent ? 1 : 0, new Date().toISOString(), id]
    );
  }

  async remove(id: string): Promise<void> {
    await this.db.runAsync("DELETE FROM sync_queue WHERE id = ?;", [id]);
  }

  /** Puts stale 'syncing' rows (e.g. the app was killed mid-request) back to pending. */
  async resetInterrupted(): Promise<void> {
    await this.db.runAsync("UPDATE sync_queue SET status = 'pending' WHERE status = 'syncing';");
  }
}
