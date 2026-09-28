/**
 * Migration 2 — real M0 contracts, generation runs, offline cache, sync queue.
 *
 * - projects.draft_format: 1 = drafts saved against the interim hand-written
 *   contracts (location/rooms/comfort/economics groups), 2 = drafts shaped
 *   like the M0 RequirementsContract on main. Existing rows keep the column
 *   default of 1, so they open read-only as "needs migration" instead of
 *   being misread as M0 data.
 * - projects.run_*: the backend generation job (optimization) started from
 *   this project, its last known status, and the backend's recommendation.
 * - api_cache: last successful API responses, for offline viewing.
 * - sync_queue: pending operations to replay when the network returns.
 * - app_meta: small key/value settings (unit preference, ...).
 */
export const MIGRATION_002_SQL = `
ALTER TABLE projects ADD COLUMN draft_format INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN run_job_id TEXT NULL;
ALTER TABLE projects ADD COLUMN run_status TEXT NULL;
ALTER TABLE projects ADD COLUMN run_started_at TEXT NULL;
ALTER TABLE projects ADD COLUMN run_error TEXT NULL;
ALTER TABLE projects ADD COLUMN recommended_design_id TEXT NULL;
ALTER TABLE projects ADD COLUMN selected_design_id TEXT NULL;
ALTER TABLE projects ADD COLUMN data_provider TEXT NULL;

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','syncing','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  permanent INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
