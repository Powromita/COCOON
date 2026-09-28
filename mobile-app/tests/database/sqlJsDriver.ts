/**
 * Test-only DbDriver implementation backed by sql.js (pure WASM SQLite,
 * no native addon — see the M12.3 spec's "Test DB strategy"). Never
 * imported by production code; production uses
 * database/openDatabase.native.ts (real expo-sqlite).
 */
import initSqlJs, { type Database } from "sql.js";

import type { DbDriver, SQLiteRunResultLike } from "../../database/DbDriver";

let sqlJsModulePromise: ReturnType<typeof initSqlJs> | null = null;

function getSqlJsModule() {
  if (!sqlJsModulePromise) {
    sqlJsModulePromise = initSqlJs();
  }
  return sqlJsModulePromise;
}

/** Creates a fresh in-memory sql.js-backed DbDriver — one per test for isolation. */
export async function createSqlJsDriver(): Promise<DbDriver> {
  const SQL = await getSqlJsModule();
  const db: Database = new SQL.Database();

  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []): Promise<SQLiteRunResultLike> {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as (string | number | null)[]);
        stmt.step();
      } finally {
        stmt.free();
      }
      const idResult = db.exec("SELECT last_insert_rowid() AS id;");
      const lastInsertRowId = (idResult[0]?.values?.[0]?.[0] as number) ?? 0;
      return { changes: db.getRowsModified(), lastInsertRowId };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      const rows: T[] = [];
      try {
        stmt.bind(params as (string | number | null)[]);
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T);
        }
      } finally {
        stmt.free();
      }
      return rows;
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const stmt = db.prepare(sql);
      let row: T | null = null;
      try {
        stmt.bind(params as (string | number | null)[]);
        if (stmt.step()) row = stmt.getAsObject() as T;
      } finally {
        stmt.free();
      }
      return row;
    },
    async withTransactionAsync(task) {
      db.exec("BEGIN;");
      try {
        await task();
        db.exec("COMMIT;");
      } catch (cause) {
        db.exec("ROLLBACK;");
        throw cause;
      }
    },
    async closeAsync() {
      db.close();
    },
  };
}
