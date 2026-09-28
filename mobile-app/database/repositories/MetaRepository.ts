/** MetaRepository — small key/value app settings (unit preference, ...). */
import type { DbDriver } from "../DbDriver";

export class MetaRepository {
  constructor(private readonly db: DbDriver) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = ?;", [key]);
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
      [key, value]
    );
  }
}
