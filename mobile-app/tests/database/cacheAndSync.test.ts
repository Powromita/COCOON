/**
 * Offline cache and the sync queue, on real SQL.
 */
jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);

import { getCacheRepository, getSyncQueueRepository, resetDbForTests } from "../../database";
import { fetchWithCache } from "../../hooks/cachedQuery";
import { isPermanentFailure, processSyncQueue, type SyncHandler } from "../../sync/queue";
import { AppError } from "../../utils/errors";
import { resetTestDb } from "../helpers/testDb";

beforeEach(() => {
  resetTestDb();
  resetDbForTests();
});

describe("CacheRepository", () => {
  it("stores, reads back and clears cached results", async () => {
    const cache = await getCacheRepository();
    await cache.set("k1", { lcc: 1 }, "api", "2026-01-01T00:00:00Z");
    expect(await cache.get("k1")).toEqual({ value: { lcc: 1 }, source: "api", fetchedAt: "2026-01-01T00:00:00Z" });
    expect((await cache.stats()).entries).toBe(1);
    await cache.set("k1", { lcc: 2 }, "api");
    expect((await cache.get<{ lcc: number }>("k1"))?.value.lcc).toBe(2);
    expect(await cache.clear()).toBe(1);
    expect(await cache.get("k1")).toBeNull();
  });

  it("in fixture mode, results are never cached (demo data can't pose as a backend response)", async () => {
    const result = await fetchWithCache("demo-key", async () => ({ x: 1 }));
    expect(result.source).toBe("fixture");
    expect(await (await getCacheRepository()).get("demo-key")).toBeNull();
  });
});

describe("sync queue", () => {
  it("collapses duplicate operations into one", async () => {
    const q = await getSyncQueueRepository();
    await q.enqueue({ type: "project.upsert", projectId: "prj_1", payload: { v: 1 } });
    await q.enqueue({ type: "project.upsert", projectId: "prj_1", payload: { v: 2 } });
    const ops = await q.list();
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toEqual({ v: 2 });
  });

  it("is skipped entirely in fixture mode", async () => {
    expect((await processSyncQueue({})).skipped).toBe("fixture_mode");
  });

  it("removes successes, keeps transient failures for retry, marks permanent failures", async () => {
    const q = await getSyncQueueRepository();
    await q.enqueue({ type: "ok", projectId: "a", payload: null });
    await q.enqueue({ type: "flaky", projectId: "b", payload: null });
    await q.enqueue({ type: "unsupported", projectId: "c", payload: null });
    const handlers: Record<string, SyncHandler> = {
      ok: async () => undefined,
      flaky: async () => {
        throw new AppError({ kind: "network", message: "offline" });
      },
      unsupported: async () => {
        throw new AppError({ kind: "not_supported", message: "no endpoint" });
      },
    };

    const summary = await processSyncQueue(handlers, { enabled: true });
    expect(summary).toEqual(expect.objectContaining({ attempted: 3, succeeded: 1, failedTransient: 1, failedPermanent: 1 }));

    const left = await q.list();
    expect(left.map((o) => [o.type, o.status, o.permanent])).toEqual([
      ["flaky", "failed", false],
      ["unsupported", "failed", true],
    ]);
    // Permanent failures are not retried on the next run.
    const again = await processSyncQueue(handlers, { enabled: true });
    expect(again.attempted).toBe(1);
  });

  it("gives up after the attempt limit", () => {
    expect(isPermanentFailure(new AppError({ kind: "timeout", message: "t" }), 1)).toBe(false);
    expect(isPermanentFailure(new AppError({ kind: "timeout", message: "t" }), 5)).toBe(true);
  });
});
