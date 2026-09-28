/**
 * Shared sql.js-backed database for tests that render screens or call the
 * database singleton. Use with:
 *
 *   jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);
 */
import type { DbDriver } from "../../database/DbDriver";
import { runMigrations } from "../../database/migrations";
import { createSqlJsDriver } from "../database/sqlJsDriver";

let current: Promise<DbDriver> | null = null;

export const openDatabaseMock = {
  openProjectsDb: async (): Promise<DbDriver> => {
    if (!current) {
      current = (async () => {
        const db = await createSqlJsDriver();
        await runMigrations(db);
        return db;
      })();
    }
    return current;
  },
};

/** Gives the next test a fresh, empty database. */
export function resetTestDb(): void {
  current = null;
}
