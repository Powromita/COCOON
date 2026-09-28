/**
 * ProjectsRepository on real SQL (sql.js): create, draft save/load, resume
 * after a cold start, readiness gate, run lifecycle, legacy drafts.
 */
import type { DbDriver } from "../../database/DbDriver";
import { runMigrations } from "../../database/migrations";
import { ProjectsRepository } from "../../database/repositories/ProjectsRepository";
import { sampleRequirementsDraft } from "../../validation/templates";
import { createSqlJsDriver } from "./sqlJsDriver";

async function setup(): Promise<{ db: DbDriver; repo: ProjectsRepository }> {
  const db = await createSqlJsDriver();
  await runMigrations(db);
  return { db, repo: new ProjectsRepository(db) };
}

function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
}

describe("create project", () => {
  it("rejects an empty or over-long name", async () => {
    const { repo } = await setup();
    expect((await repo.createDraft("  ")).ok).toBe(false);
    expect((await repo.createDraft("x".repeat(81))).ok).toBe(false);
  });

  it("creates an M0-format draft with a prj_ id", async () => {
    const { repo } = await setup();
    const row = unwrap(await repo.createDraft("Forward post"));
    expect(row.id).toMatch(/^prj_[0-9a-f]{32}$/);
    expect(row.draft_format).toBe(2);
    const list = unwrap(await repo.listProjects());
    expect(list).toEqual([expect.objectContaining({ name: "Forward post", displayStatus: "DRAFT", locationLabel: null })]);
  });

  it("can start from a template", async () => {
    const { repo } = await setup();
    const row = unwrap(await repo.createDraft("From sample", sampleRequirementsDraft()));
    const record = unwrap(await repo.getProject(row.id));
    expect(record?.requirements?.mission?.occupants).toBe(30);
  });
});

describe("update, load and resume a draft", () => {
  it("saves partial requirements and the step, and reloads them after a cold start", async () => {
    const { db, repo } = await setup();
    const row = unwrap(await repo.createDraft("Draft"));
    unwrap(await repo.saveDraft(row.id, { site: { latitude_deg: 34.15, longitude_deg: 77.58 } }, 3));

    const coldStart = new ProjectsRepository(db);
    const record = unwrap(await coldStart.getProject(row.id));
    expect(record?.requirements).toEqual({ site: { latitude_deg: 34.15, longitude_deg: 77.58 } });
    expect(record?.row.last_step).toBe(3);
    expect(record?.readOnly).toBe(false);
    expect(unwrap(await coldStart.listProjects())[0].locationLabel).toBe("34.150°, 77.580°");
  });

  it("markReady refuses an incomplete draft with field errors, and accepts a complete one", async () => {
    const { repo } = await setup();
    const row = unwrap(await repo.createDraft("Draft"));
    const refused = await repo.markReady(row.id);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.length).toBeGreaterThan(3);

    unwrap(await repo.saveDraft(row.id, sampleRequirementsDraft(), 9));
    expect((await repo.markReady(row.id)).ok).toBe(true);
    expect(unwrap(await repo.getProject(row.id))?.displayStatus).toBe("REQUIREMENTS_COMPLETE");
  });

  it("delete is soft and can be undone", async () => {
    const { repo } = await setup();
    const row = unwrap(await repo.createDraft("Draft"));
    unwrap(await repo.deleteProject(row.id));
    expect(unwrap(await repo.listProjects())).toHaveLength(0);
    unwrap(await repo.restoreProject(row.id));
    expect(unwrap(await repo.listProjects())).toHaveLength(1);
  });
});

describe("generation run lifecycle", () => {
  it("tracks the backend job and the backend's recommendation", async () => {
    const { repo } = await setup();
    const row = unwrap(await repo.createDraft("Run"));
    unwrap(await repo.recordRunStarted(row.id, "opt_abc", "fixture"));
    expect(unwrap(await repo.getProject(row.id))?.displayStatus).toBe("GENERATING");

    unwrap(await repo.recordRunStatus(row.id, "completed", { recommendedDesignId: "des_1" }));
    unwrap(await repo.selectDesign(row.id, "des_2"));
    const record = unwrap(await repo.getProject(row.id));
    expect(record?.displayStatus).toBe("CANDIDATES_READY");
    expect(record?.row).toEqual(
      expect.objectContaining({ run_job_id: "opt_abc", recommended_design_id: "des_1", selected_design_id: "des_2", data_provider: "fixture" })
    );
  });

  it("records a failed run with its reason", async () => {
    const { repo } = await setup();
    const row = unwrap(await repo.createDraft("Run"));
    unwrap(await repo.recordRunStarted(row.id, "opt_abc", "api"));
    unwrap(await repo.recordRunStatus(row.id, "failed", { error: "weather gap too large" }));
    const record = unwrap(await repo.getProject(row.id));
    expect(record?.displayStatus).toBe("FAILED");
    expect(record?.row.run_error).toBe("weather gap too large");
  });
});

describe("legacy and damaged drafts", () => {
  it("opens pre-M0 (format 1) drafts read-only as 'needs migration'", async () => {
    const { db, repo } = await setup();
    await db.runAsync(
      "INSERT INTO projects (id, name, status, requirements_json, schema_version, last_step, created_at, updated_at, draft_format) VALUES ('old', 'Old', 'DRAFT', ?, '4.0', 1, 'a', 'a', 1);",
      [JSON.stringify({ location: { preset: "leh" } })]
    );
    const record = unwrap(await repo.getProject("old"));
    expect(record).toEqual(expect.objectContaining({ needsMigration: true, readOnly: true, displayStatus: "NEEDS_MIGRATION" }));
    expect((await repo.markReady("old")).ok).toBe(false);
  });

  it("flags unreadable JSON as corrupt instead of crashing", async () => {
    const { db, repo } = await setup();
    await db.runAsync(
      "INSERT INTO projects (id, name, status, requirements_json, schema_version, last_step, created_at, updated_at, draft_format) VALUES ('bad', 'Bad', 'DRAFT', '{nope', '4.0', 0, 'a', 'a', 2);"
    );
    expect(unwrap(await repo.getProject("bad"))?.isCorrupt).toBe(true);
    expect(unwrap(await repo.listProjects())[0].displayStatus).toBe("CORRUPT");
  });
});
