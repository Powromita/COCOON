/**
 * Job-completion notifications: once per run and status, respecting
 * permission and "already seen on screen"; and the foreground job monitor.
 */
jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);

import * as Notifications from "expo-notifications";

import { getProjectsRepository, getRunsRepository, resetDbForTests } from "../../database";
import { checkActiveRuns } from "../../hooks/useJobMonitor";
import * as fx from "../../mocks/fixtureLoader";
import { markJobStatusSeen, noticeContent, notifyJobFinished } from "../../notifications/jobs";
import { generationService } from "../../services/registry";
import { useAppStore } from "../../store/app.store";
import { resetTestDb } from "../helpers/testDb";

const N = Notifications as unknown as { __scheduled: { content: { title: string } }[]; __setPermission: (p: string) => void };

beforeEach(() => {
  resetTestDb();
  resetDbForTests();
  useAppStore.setState({ jobMonitorError: null });
  N.__scheduled.length = 0;
  N.__setPermission("granted");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("notifyJobFinished", () => {
  it("notifies once per run and terminal status — never twice", async () => {
    await (await getRunsRepository()).record("opt_a", "prj_1", "api");
    expect(await notifyJobFinished({ jobId: "opt_a", projectId: "prj_1", status: "completed", demo: false })).toBe(true);
    expect(await notifyJobFinished({ jobId: "opt_a", projectId: "prj_1", status: "completed", demo: false })).toBe(false);
    expect(N.__scheduled).toHaveLength(1);
    expect(N.__scheduled[0].content.title).toBe("COCOON design generation complete");
  });

  it("stays silent for a result already seen on screen", async () => {
    await (await getRunsRepository()).record("opt_b", null, "api");
    await markJobStatusSeen("opt_b", "failed");
    expect(await notifyJobFinished({ jobId: "opt_b", projectId: null, status: "failed", demo: false })).toBe(false);
    expect(N.__scheduled).toHaveLength(0);
  });

  it("respects denied permission", async () => {
    N.__setPermission("denied");
    await (await getRunsRepository()).record("opt_c", null, "api");
    expect(await notifyJobFinished({ jobId: "opt_c", projectId: null, status: "completed", demo: false })).toBe(false);
    expect(N.__scheduled).toHaveLength(0);
  });

  it("labels demo runs and failures", () => {
    expect(noticeContent({ jobId: "x", projectId: null, status: "completed", demo: true }).title).toBe(
      "COCOON design generation complete (demo data)"
    );
    expect(noticeContent({ jobId: "x", projectId: null, status: "failed", demo: false }).title).toBe("COCOON design generation failed");
  });
});

describe("job monitor pass", () => {
  it("re-reads active runs, mirrors the backend status onto the project, and notifies on completion", async () => {
    const repo = await getProjectsRepository();
    const created = await repo.createDraft("Monitored");
    if (!created.ok) throw new Error(created.error);
    // Fixture provider: a run the service has no submission time for reports as completed.
    await (await getRunsRepository()).record(fx.RECORDED_OPTIMIZATION_ID, created.data.id, "fixture");

    expect(await checkActiveRuns()).toBe(0);
    const run = await (await getRunsRepository()).get(fx.RECORDED_OPTIMIZATION_ID);
    expect(run?.lastStatus).toBe("completed");
    const project = await repo.getProject(created.data.id);
    expect(project.ok && project.data?.displayStatus).toBe("CANDIDATES_READY");
    expect(N.__scheduled).toHaveLength(1);

    // A second pass finds nothing active and does not notify again.
    expect(await checkActiveRuns()).toBe(0);
    expect(N.__scheduled).toHaveLength(1);
  });

  it("surfaces a refresh failure and clears it after a successful retry", async () => {
    await (await getRunsRepository()).record(fx.RECORDED_OPTIMIZATION_ID, null, "fixture");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(generationService, "getGenerationJob").mockRejectedValueOnce(new Error("provider unavailable"));

    expect(await checkActiveRuns()).toBe(1);
    expect(useAppStore.getState().jobMonitorError).toMatch(/Unable to refresh/);

    expect(await checkActiveRuns()).toBe(0);
    expect(useAppStore.getState().jobMonitorError).toBeNull();
  });
});
