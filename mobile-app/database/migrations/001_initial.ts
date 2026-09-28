/**
 * Migration 1 — schema_migrations + projects, per the M12.3 spec §7.
 * All DDL uses IF NOT EXISTS so this migration is safe to run more than
 * once (see database/migrations/index.ts's runner for how re-runs are
 * skipped anyway via the schema_migrations table itself).
 */
export const MIGRATION_001_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','READY')),
  requirements_json TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  last_step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_deleted_updated ON projects(deleted_at, updated_at DESC);
`;
