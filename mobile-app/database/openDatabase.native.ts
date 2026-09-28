/**
 * Android/iOS database open — the ONLY file in this app that imports
 * "expo-sqlite". Metro's platform-extension resolution (`.native.ts` for
 * android+ios, `.web.ts` for web — verified against expo-sqlite's own
 * async API in node_modules/expo-sqlite/build/SQLiteDatabase.d.ts before
 * writing this) guarantees openDatabase.web.ts is what a web bundle
 * resolves instead, so expo-sqlite never enters the web module graph —
 * see the M12.3 report §9 for the `expo export --platform web` proof.
 */
import * as SQLite from "expo-sqlite";

import type { DbDriver, SQLiteRunResultLike } from "./DbDriver";
import { DbOpenError } from "./DbDriver";
import { runMigrations } from "./migrations";

const DB_NAME = "cocoon.db";

function wrapDriver(db: SQLite.SQLiteDatabase): DbDriver {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params = []): Promise<SQLiteRunResultLike> => {
      const result = await db.runAsync(sql, params as SQLite.SQLiteBindParams);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindParams),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params as SQLite.SQLiteBindParams),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
    closeAsync: () => db.closeAsync(),
  };
}

/** Opens (creating if needed), sets required PRAGMAs, and migrates to the latest schema. */
export async function openProjectsDb(): Promise<DbDriver> {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    // journal_mode/foreign_keys must be set outside a transaction.
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA foreign_keys = ON;");
    const driver = wrapDriver(db);
    await runMigrations(driver);
    return driver;
  } catch (cause) {
    throw new DbOpenError(cause);
  }
}
