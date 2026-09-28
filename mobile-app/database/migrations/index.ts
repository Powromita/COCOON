import type { DbDriver } from "../DbDriver";
import { MIGRATION_001_SQL } from "./001_initial";
import { MIGRATION_002_SQL } from "./002_m0_runs_cache_sync";
import { MIGRATION_003_SQL } from "./003_run_index";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Ordered by version — add new migrations here, never edit a shipped one. */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: "initial", sql: MIGRATION_001_SQL },
  { version: 2, name: "m0_runs_cache_sync", sql: MIGRATION_002_SQL },
  { version: 3, name: "run_index", sql: MIGRATION_003_SQL },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/**
 * Runs every not-yet-applied migration, each inside its own transaction.
 * Idempotent: re-running against a DB that's already at the latest
 * version does nothing. Each migration and its schema_migrations row are
 * committed in one transaction, so a migration is either fully applied and
 * recorded or not applied at all (002's ALTER TABLEs rely on this).
 */
export async function runMigrations(db: DbDriver): Promise<void> {
  // Bootstraps the tracking table itself — safe to run on every open.
  await db.execAsync(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);"
  );

  const appliedRows = await db.getAllAsync<{ version: number }>("SELECT version FROM schema_migrations;");
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  const pending = MIGRATIONS.filter((m) => !appliedVersions.has(m.version)).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.runAsync("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);", [
        migration.version,
        new Date().toISOString(),
      ]);
    });
  }
}
