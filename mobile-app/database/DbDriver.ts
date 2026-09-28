/**
 * DbDriver — the minimal async SQLite surface the migration runner and
 * ProjectsRepository depend on. Shaped to match expo-sqlite's own
 * SQLiteDatabase API exactly (verified against
 * node_modules/expo-sqlite/build/SQLiteDatabase.d.ts before writing this),
 * so the production driver (database/openDatabase.native.ts) is a very
 * thin wrapper.
 *
 * Test code implements this same interface against sql.js (pure WASM
 * SQLite, no native addon) — see tests/database/sqlJsDriver.ts — so
 * repository/migration tests run real SQL, not a hand-rolled fake.
 */

export type SQLiteBindParams = unknown[];

export interface SQLiteRunResultLike {
  changes: number;
  lastInsertRowId: number;
}

export interface DbDriver {
  /** DDL / PRAGMA / multi-statement execution, no bound params, no result rows. */
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SQLiteBindParams): Promise<SQLiteRunResultLike>;
  getAllAsync<T>(sql: string, params?: SQLiteBindParams): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SQLiteBindParams): Promise<T | null>;
  /** Wraps `task` in BEGIN/COMMIT, rolling back if `task` throws. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

/** Thrown by database/openDatabase.web.ts — expo-sqlite has no web implementation. */
export class DbUnavailableOnWebError extends Error {
  constructor() {
    super("Local project storage (SQLite) is only available in the mobile app, not on web.");
    this.name = "DbUnavailableOnWebError";
  }
}

/** Thrown/wrapped when opening or migrating the database fails for any other reason. */
export class DbOpenError extends Error {
  constructor(cause: unknown) {
    super(`Local storage unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "DbOpenError";
    this.cause = cause;
  }
}
