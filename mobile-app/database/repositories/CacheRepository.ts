/**
 * CacheRepository — last successful API responses, kept so results stay
 * viewable offline. Entries are always shown with their fetch time and a
 * "cached" label (see hooks/cachedQuery.ts); they are never presented as
 * fresh results.
 */
import type { DbDriver } from "../DbDriver";
import type { CacheRow } from "../schema/types";

export interface CacheEntry<T> {
  value: T;
  source: string;
  fetchedAt: string;
}

export class CacheRepository {
  constructor(private readonly db: DbDriver) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const row = await this.db.getFirstAsync<CacheRow>("SELECT * FROM api_cache WHERE cache_key = ?;", [key]);
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value_json) as T, source: row.source, fetchedAt: row.fetched_at };
    } catch {
      // A corrupt entry is treated as absent and removed.
      await this.db.runAsync("DELETE FROM api_cache WHERE cache_key = ?;", [key]);
      return null;
    }
  }

  async set(key: string, value: unknown, source: string, fetchedAt: string = new Date().toISOString()): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO api_cache (cache_key, value_json, source, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET value_json = excluded.value_json, source = excluded.source,
         fetched_at = excluded.fetched_at;`,
      [key, JSON.stringify(value), source, fetchedAt]
    );
  }

  async clear(): Promise<number> {
    const result = await this.db.runAsync("DELETE FROM api_cache;");
    return result.changes;
  }

  async stats(): Promise<{ entries: number; bytes: number }> {
    const row = await this.db.getFirstAsync<{ entries: number; bytes: number | null }>(
      "SELECT COUNT(*) AS entries, SUM(LENGTH(value_json)) AS bytes FROM api_cache;"
    );
    return { entries: row?.entries ?? 0, bytes: row?.bytes ?? 0 };
  }
}
