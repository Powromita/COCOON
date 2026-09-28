/**
 * RunsRepository — the device's index of optimization runs it started
 * (see migration 003). Never stores run results.
 */
import type { DbDriver } from "../DbDriver";

export interface RunIndexEntry {
  jobId: string;
  projectId: string | null;
  dataProvider: string;
  createdAt: string;
  lastStatus: string | null;
  lastCheckedAt: string | null;
  notifiedStatus: string | null;
}

interface Row {
  job_id: string;
  project_id: string | null;
  data_provider: string;
  created_at: string;
  last_status: string | null;
  last_checked_at: string | null;
  notified_status: string | null;
}

const toEntry = (r: Row): RunIndexEntry => ({
  jobId: r.job_id,
  projectId: r.project_id,
  dataProvider: r.data_provider,
  createdAt: r.created_at,
  lastStatus: r.last_status,
  lastCheckedAt: r.last_checked_at,
  notifiedStatus: r.notified_status,
});

export class RunsRepository {
  constructor(private readonly db: DbDriver) {}

  async record(jobId: string, projectId: string | null, dataProvider: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO run_index (job_id, project_id, data_provider, created_at, last_status) VALUES (?, ?, ?, ?, 'queued')
       ON CONFLICT(job_id) DO UPDATE SET project_id = COALESCE(excluded.project_id, run_index.project_id);`,
      [jobId, projectId, dataProvider, new Date().toISOString()]
    );
  }

  async list(dataProvider?: string): Promise<RunIndexEntry[]> {
    const rows = dataProvider
      ? await this.db.getAllAsync<Row>("SELECT * FROM run_index WHERE data_provider = ? ORDER BY created_at DESC;", [dataProvider])
      : await this.db.getAllAsync<Row>("SELECT * FROM run_index ORDER BY created_at DESC;");
    return rows.map(toEntry);
  }

  async get(jobId: string): Promise<RunIndexEntry | null> {
    const row = await this.db.getFirstAsync<Row>("SELECT * FROM run_index WHERE job_id = ?;", [jobId]);
    return row ? toEntry(row) : null;
  }

  /** Runs whose last known status is not terminal — the ones the job monitor keeps checking. */
  async listActive(dataProvider: string): Promise<RunIndexEntry[]> {
    const rows = await this.db.getAllAsync<Row>(
      "SELECT * FROM run_index WHERE data_provider = ? AND (last_status IS NULL OR last_status IN ('queued','running')) ORDER BY created_at ASC;",
      [dataProvider]
    );
    return rows.map(toEntry);
  }

  async updateStatus(jobId: string, status: string): Promise<void> {
    await this.db.runAsync("UPDATE run_index SET last_status = ?, last_checked_at = ? WHERE job_id = ?;", [
      status,
      new Date().toISOString(),
      jobId,
    ]);
  }

  /**
   * Marks that the user has been told about `status` for this run (by a
   * notification, or by seeing it on screen). Returns true only the first
   * time — callers notify only when this returns true.
   */
  async claimNotification(jobId: string, status: string): Promise<boolean> {
    const result = await this.db.runAsync(
      "UPDATE run_index SET notified_status = ? WHERE job_id = ? AND (notified_status IS NULL OR notified_status != ?);",
      [status, jobId, status]
    );
    return result.changes > 0;
  }
}
