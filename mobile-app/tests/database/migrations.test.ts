/**
 * Test A (M12.3 §13): a fresh DB reaches the latest schema version; a
 * re-run is a no-op; schema_migrations rows are correct.
 */
import { LATEST_SCHEMA_VERSION, MIGRATIONS, runMigrations } from "../../database/migrations";
import { createSqlJsDriver } from "./sqlJsDriver";

describe("migrations — A. fresh DB, idempotent re-run", () => {
  it("brings a fresh DB to the latest schema_migrations version", async () => {
    const db = await createSqlJsDriver();
    await runMigrations(db);

    const rows = await db.getAllAsync<{ version: number; applied_at: string }>(
      "SELECT * FROM schema_migrations ORDER BY version;"
    );
    expect(rows).toHaveLength(MIGRATIONS.length);
    expect(rows[rows.length - 1].version).toBe(LATEST_SCHEMA_VERSION);
    expect(rows.every((r) => typeof r.applied_at === "string" && r.applied_at.length > 0)).toBe(true);

    await db.closeAsync();
  });

  it("creates the projects table with the expected columns", async () => {
    const db = await createSqlJsDriver();
    await runMigrations(db);

    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(projects);");
    const colNames = cols.map((c) => c.name).sort();
    expect(colNames).toEqual(
      [
        "id",
        "name",
        "status",
        "requirements_json",
        "schema_version",
        "last_step",
        "created_at",
        "updated_at",
        "deleted_at",
        "draft_format",
        "run_job_id",
        "run_status",
        "run_started_at",
        "run_error",
        "recommended_design_id",
        "selected_design_id",
        "data_provider",
      ].sort()
    );

    await db.closeAsync();
  });

  it("a re-run against an already-migrated DB is a no-op", async () => {
    const db = await createSqlJsDriver();
    await runMigrations(db);
    const before = await db.getAllAsync<{ version: number; applied_at: string }>(
      "SELECT * FROM schema_migrations ORDER BY version;"
    );

    await runMigrations(db); // second run

    const after = await db.getAllAsync<{ version: number; applied_at: string }>(
      "SELECT * FROM schema_migrations ORDER BY version;"
    );
    expect(after).toEqual(before); // same rows, same applied_at — nothing re-ran

    await db.closeAsync();
  });

  it("running migrations twice does not error even with IF NOT EXISTS DDL re-applied", async () => {
    const db = await createSqlJsDriver();
    await expect(runMigrations(db)).resolves.not.toThrow();
    await expect(runMigrations(db)).resolves.not.toThrow();
    await db.closeAsync();
  });
});

describe("migrations — 002 upgrades an existing v1 database", () => {
  it("keeps v1 rows and flags them as the old draft format", async () => {
    const db = await createSqlJsDriver();
    await db.execAsync(MIGRATIONS[0].sql);
    await db.runAsync("INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?);", [new Date().toISOString()]);
    await db.runAsync(
      "INSERT INTO projects (id, name, status, requirements_json, schema_version, last_step, created_at, updated_at) VALUES ('old', 'Old', 'DRAFT', '{}', '4.0', 2, 'x', 'x');"
    );

    await runMigrations(db);

    const row = await db.getFirstAsync<{ id: string; draft_format: number; last_step: number }>("SELECT * FROM projects WHERE id = 'old';");
    expect(row).toEqual(expect.objectContaining({ id: "old", draft_format: 1, last_step: 2 }));
    const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table';");
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(["api_cache", "sync_queue", "app_meta"]));
    await db.closeAsync();
  });
});
