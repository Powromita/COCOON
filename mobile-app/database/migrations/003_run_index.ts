/**
 * Migration 3 — run index.
 *
 * main's backend has no endpoint that lists optimizations, so the device
 * remembers which optimization ids it started. This is an INDEX only: each
 * run's status, candidates and results are always re-read from the backend
 * (GET /api/v1/optimizations/{id}) — the backend stays the source of truth.
 *
 * notified_status records the terminal status a notification was already
 * shown (or seen on screen) for, so a run never notifies twice.
 */
export const MIGRATION_003_SQL = `
CREATE TABLE IF NOT EXISTS run_index (
  job_id TEXT PRIMARY KEY,
  project_id TEXT NULL,
  data_provider TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_status TEXT NULL,
  last_checked_at TEXT NULL,
  notified_status TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_index_created ON run_index(created_at DESC);

INSERT OR IGNORE INTO run_index (job_id, project_id, data_provider, created_at, last_status)
  SELECT run_job_id, id, COALESCE(data_provider, 'fixture'), COALESCE(run_started_at, updated_at), run_status
  FROM projects WHERE run_job_id IS NOT NULL;
`;
