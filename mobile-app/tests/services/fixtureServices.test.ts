/**
 * Fixture providers: demo data is served honestly — never as backend
 * output, never for designs/jobs it doesn't have.
 */
jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);

import { generationPollInterval, ansysPollInterval } from "../../hooks/useCocoon";
import * as fx from "../../mocks/fixtureLoader";
import {
  FixtureAnsysService,
  FixtureCandidateService,
  FixtureCapabilitiesService,
  FixtureGenerationService,
  FixtureAuthService,
  FixtureOptimizationHistoryService,
  FixtureProjectService,
} from "../../services/fixture/FixtureServices";
import { FixtureNotFoundError } from "../../utils/errors";

describe("FixtureGenerationService — job states over time", () => {
  let now = 0;
  const svc = new FixtureGenerationService(1_000, 2_000, () => now);
  const input = { requirements: fx.getSampleRequirements(), count: 8, seed: 42, idempotencyKey: "k" };

  it("goes queued → running → completed with backend status values only", async () => {
    now = 0;
    const { jobId } = await svc.startGeneration(input);
    expect((await svc.getGenerationJob(jobId)).status).toBe("queued");
    now = 1_500;
    expect((await svc.getGenerationJob(jobId)).status).toBe("running");
    now = 3_500;
    const done = await svc.getGenerationJob(jobId);
    expect(done.status).toBe("completed");
    expect(done.recommendedDesignId).toBe(fx.getRecordedCandidates().recommended_design_id);
  });

  it("says the recorded run used the M0 sample requirements, whatever was submitted", async () => {
    expect(await svc.getSubmittedRequirements(fx.RECORDED_OPTIMIZATION_ID)).toEqual(fx.getSampleRequirements());
  });

  it("does not answer for jobs it never recorded", async () => {
    await expect(svc.getGenerationJob("opt_other")).rejects.toBeInstanceOf(FixtureNotFoundError);
  });
});

describe("job polling policy", () => {
  const job = (status: string) => ({ jobId: "j", status }) as never;

  it("polls while running or queued, and before the first response", () => {
    expect(generationPollInterval(undefined, 1000)).toBe(1000);
    expect(generationPollInterval(job("queued"), 1000)).toBe(1000);
    expect(generationPollInterval(job("running"), 1000)).toBe(1000);
  });

  it("stops polling once completed, failed or unknown", () => {
    expect(generationPollInterval(job("completed"), 1000)).toBe(false);
    expect(generationPollInterval(job("failed"), 1000)).toBe(false);
    expect(generationPollInterval(job("unknown"), 1000)).toBe(false);
  });

  it("polls ANSYS only while M8 reports an active state", () => {
    const base = { schema_version: "4.0", job_id: "ans_1", design_revision_id: "rev_1" } as const;
    expect(ansysPollInterval({ ...base, status: "SOLVING" }, 5)).toBe(5);
    expect(ansysPollInterval({ ...base, status: "COMPLETED" }, 5)).toBe(false);
    expect(ansysPollInterval({ design_revision_id: "rev_1", status: "NOT_REQUESTED" }, 5)).toBe(false);
  });
});

describe("other fixture providers", () => {
  it("candidates exist only for the recorded optimization", async () => {
    const svc = new FixtureCandidateService();
    expect((await svc.getCandidates(fx.RECORDED_OPTIMIZATION_ID)).candidates).toHaveLength(8);
    await expect(svc.getCandidates("opt_nope")).rejects.toBeInstanceOf(FixtureNotFoundError);
  });

  it("never reports the backend as connected in demo mode", async () => {
    const snap = await new FixtureCapabilitiesService().getCapabilities();
    expect(snap.backendReachable).toBe(false);
    expect(snap.entries.find((e) => e.key === "backend")?.status).toBe("NOT_CONNECTED");
    expect(snap.entries.some((e) => e.key !== "local_storage" && e.status === "AVAILABLE")).toBe(false);
  });

  it("does not simulate an ANSYS run", async () => {
    const svc = new FixtureAnsysService();
    expect((await svc.getLatestForRevision("rev_x")).status).toBe("NOT_REQUESTED");
    await expect(svc.submitValidation(fx.getRecordedDesign("des_5951c6f961b7"))).rejects.toEqual(
      expect.objectContaining({ kind: "unavailable" })
    );
  });

  it("does not fabricate reports", async () => {
    await expect(new FixtureOptimizationHistoryService().getReport()).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
  });

  it("demo history is exactly the recorded run, labelled as fixture", async () => {
    const list = await new FixtureOptimizationHistoryService().listRuns();
    expect(list.source).toBe("fixture");
    expect(list.runs.map((r) => r.optimizationId)).toEqual([fx.RECORDED_OPTIMIZATION_ID]);
  });

  it("the demo project is read-only and demo auth never signs in", async () => {
    const projects = new FixtureProjectService();
    expect((await projects.listProjects())[0].project_id).toBe(fx.getSampleProject().project_id);
    await expect(projects.createProject()).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
    const auth = new FixtureAuthService();
    expect((await auth.availability()).available).toBe(false);
    await expect(auth.signIn()).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
  });
});
