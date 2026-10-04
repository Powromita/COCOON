/**
 * API providers against recorded backend responses: request shapes and
 * response mapping, plus the explicit handling of endpoints main lacks.
 */
jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);

import {
  ApiAnsysService,
  ApiCapabilitiesService,
  ApiEconomicsService,
  ApiGenerationService,
  ApiMaterialsService,
  ApiAuthService,
  ApiOptimizationHistoryService,
  ApiProjectService,
  ApiSimulationService,
  ApiVisualizationService,
} from "../../services/api/ApiServices";
import { ApiClient } from "../../services/api/client";
import { getRunsRepository, resetDbForTests } from "../../database";
import { resetTestDb } from "../helpers/testDb";
import * as fx from "../../mocks/fixtureLoader";
import { AppError } from "../../utils/errors";

const DESIGN = "des_5951c6f961b7";

function respond(status: number, body: unknown): Response {
  return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

function api(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { method: string; url: string; body?: unknown; headers: Record<string, string> }[] = [];
  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("https://cocoon.test", "");
    const method = init.method ?? "GET";
    calls.push({ method, url: path, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> });
    const hit = routes[`${method} ${path}`];
    return hit ? respond(hit.status ?? 200, hit.body) : respond(404, { detail: "Not Found" });
  });
  return { client: new ApiClient("https://cocoon.test", undefined, fetchImpl as unknown as typeof fetch), calls };
}

describe("ApiGenerationService", () => {
  it("submits the RequirementsContract to POST /api/v1/optimizations with an Idempotency-Key", async () => {
    const { client, calls } = api({ "POST /api/v1/optimizations": { status: 201, body: fx.getRecordedCreate() } });
    const svc = new ApiGenerationService(client);
    const { jobId } = await svc.startGeneration({
      requirements: fx.getSampleRequirements(),
      count: 8,
      seed: 42,
      validateWithAnsys: true,
      idempotencyKey: "gen:prj_x:1",
    });
    expect(jobId).toBe(fx.RECORDED_OPTIMIZATION_ID);
    expect(calls[0].body).toEqual(expect.objectContaining({ count: 8, seed: 42, validate_with_ansys: true, requirements: fx.getSampleRequirements() }));
    expect(calls[0].headers["Idempotency-Key"]).toBe("gen:prj_x:1");
    // The submitted contract is remembered for the results screens.
    expect(await svc.getSubmittedRequirements(jobId)).toEqual(fx.getSampleRequirements());
  });

  it("maps the backend job status without inventing progress", async () => {
    const id = fx.RECORDED_OPTIMIZATION_ID;
    const { client } = api({ [`GET /api/v1/optimizations/${id}`]: { body: fx.getRecordedStatusCompleted() } });
    const job = await new ApiGenerationService(client).getGenerationJob(id);
    expect(job).toEqual(
      expect.objectContaining({
        status: "completed",
        recommendedDesignId: DESIGN,
        weatherSnapshotId: "wx_leh_20260101T00_168h",
        validationState: "RC_ONLY_ANSYS_NOT_REQUESTED",
      })
    );
    expect(Object.keys(job)).not.toContain("progress");
  });

  it("surfaces a failed job's backend error", async () => {
    const { client } = api({
      "GET /api/v1/optimizations/opt_1": {
        body: { optimization_id: "opt_1", status: "failed", error: { code: "VALIDATION_ERROR", message: "job interrupted by a server restart" } },
      },
    });
    const job = await new ApiGenerationService(client).getGenerationJob("opt_1");
    expect(job.status).toBe("failed");
    expect(job.error?.message).toBe("job interrupted by a server restart");
  });

  it("reports an unrecognised status as 'unknown' rather than guessing", async () => {
    const { client } = api({ "GET /api/v1/optimizations/opt_2": { body: { optimization_id: "opt_2", status: "paused" } } });
    expect((await new ApiGenerationService(client).getGenerationJob("opt_2")).status).toBe("unknown");
  });
});

describe("ApiSimulationService / ApiEconomicsService", () => {
  it("requests an hourly conditioned RC run for the design and the run's weather snapshot", async () => {
    const sim = fx.getRecordedSimulationForDesign(DESIGN);
    const { client, calls } = api({ "POST /api/v1/simulations": { status: 201, body: sim } });
    const building = fx.getRecordedDesign(DESIGN);
    const req = fx.getSampleRequirements();
    await new ApiSimulationService(client).getForDesign({
      designId: DESIGN,
      building,
      weatherSnapshotId: "wx_leh_20260101T00_168h",
      windowStart: req.site.analysis_start,
      windowEnd: req.site.analysis_end,
      setpointC: 15,
    });
    expect(calls[0].body).toEqual(
      expect.objectContaining({ mode: "ideal_load_conditioned", timestep_seconds: 3600, weather_snapshot_id: "wx_leh_20260101T00_168h", setpoint_c: 15 })
    );
  });

  it("asks M7 to price the design (the app computes no economics)", async () => {
    const report = fx.getRecordedEconomicsForDesign(DESIGN);
    const { client, calls } = api({ "POST /api/v1/economics": { status: 201, body: report } });
    const result = await new ApiEconomicsService(client).getForDesign({
      designId: DESIGN,
      building: fx.getRecordedDesign(DESIGN),
      simulation: fx.getRecordedSimulationForDesign(DESIGN),
      assumptionSetId: "econ_ladakh_expected_v1",
      simulatedHours: 168,
    });
    expect(result.scenarios.expected.result.lcc_inr).toBe(report.scenarios.expected.result.lcc_inr);
    expect(calls[0].body).toEqual(expect.objectContaining({ assumption_set_id: "econ_ladakh_expected_v1" }));
    expect((calls[0].body as { design: Record<string, unknown> }).design).not.toHaveProperty("simulation.time_series");
  });

  it("sends M7 only M0 SimulationResult fields — the backend's extra timeseries_url is rejected by M7 (422)", async () => {
    const withExtra = { ...fx.getRecordedSimulationForDesign(DESIGN), timeseries_url: "/api/v1/simulations/x/timeseries" };
    const { client, calls } = api({
      "POST /api/v1/simulations": { status: 201, body: withExtra },
      "POST /api/v1/economics": { status: 201, body: fx.getRecordedEconomicsForDesign(DESIGN) },
    });
    const sim = await new ApiSimulationService(client).getForDesign({
      designId: DESIGN,
      building: fx.getRecordedDesign(DESIGN),
      weatherSnapshotId: "wx",
      windowStart: "2026-01-01T00:00:00+05:30",
      windowEnd: "2026-01-08T00:00:00+05:30",
      setpointC: 15,
    });
    expect(sim).not.toHaveProperty("timeseries_url");
    await new ApiEconomicsService(client).getForDesign({
      designId: DESIGN,
      building: fx.getRecordedDesign(DESIGN),
      simulation: withExtra,
      assumptionSetId: "econ_ladakh_v1",
      simulatedHours: 168,
    });
    expect(calls[1].body).not.toHaveProperty("design.simulation.timeseries_url");
  });
});

describe("ApiAnsysService", () => {
  it("reads the latest revision state without changing NOT_REQUESTED into a failure", async () => {
    const revisionId = fx.getRecordedDesign(DESIGN).revision_id;
    const notRequested = { design_revision_id: revisionId, status: "NOT_REQUESTED" };
    const { client, calls } = api({
      [`GET /api/ansys/revisions/${revisionId}/latest`]: { body: notRequested },
    });

    await expect(new ApiAnsysService(client).getLatestForRevision(revisionId)).resolves.toEqual(notRequested);
    expect(calls).toEqual([
      expect.objectContaining({ method: "GET", url: `/api/ansys/revisions/${revisionId}/latest` }),
    ]);
  });

  it("submits the authoritative building to the backend and preserves the execution status", async () => {
    const building = fx.getRecordedDesign(DESIGN);
    const submission = {
      job_id: "ans_test_1",
      status: "QUEUED",
      design_revision_id: building.revision_id,
      status_url: "/api/ansys/jobs/ans_test_1",
    };
    const { client, calls } = api({
      "POST /api/ansys/jobs": { status: 201, body: submission },
      "GET /api/ansys/jobs/ans_test_1": {
        body: {
          schema_version: "4.0",
          job_id: submission.job_id,
          design_revision_id: building.revision_id,
          status: "COMPLETED",
          metrics: { mae_c: 1.2, rmse_c: 1.5, max_abs_error_c: 2.4, bias_c: -0.5, r_squared: 0.91 },
          artifacts: { artifacts: {}, checksums_sha256: {} },
        },
      },
    });
    const service = new ApiAnsysService(client);

    await expect(service.submitValidation("opt_test", building.design_id)).resolves.toEqual(submission);
    expect(calls[0]).toEqual(expect.objectContaining({
      method: "POST",
      url: "/api/ansys/jobs",
      body: { optimization_id: "opt_test", design_id: building.design_id },
    }));
    await expect(service.getJob(submission.job_id)).resolves.toEqual(
      expect.objectContaining({ status: "COMPLETED", metrics: expect.objectContaining({ mae_c: 1.2 }) })
    );
    expect(calls[1]).toEqual(expect.objectContaining({ method: "GET", url: "/api/ansys/jobs/ans_test_1" }));
  });
});

describe("endpoints main does not have yet", () => {
  it("visualization falls back to the BuildingModel geometry, labelled as such", async () => {
    const { client } = api({});
    const result = await new ApiVisualizationService(client).getForDesign({ building: fx.getRecordedDesign(DESIGN) });
    expect(result.origin).toBe("building_geometry");
    expect(result.model.design_revision_id).toBe(fx.getRecordedDesign(DESIGN).revision_id);
  });

  it("reports become 'not_supported', never a fake report", async () => {
    const { client } = api({});
    await expect(new ApiOptimizationHistoryService(client).getReport("opt_1")).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
  });

  it("projects: every call reports 'not_supported' instead of pretending", async () => {
    const { client } = api({});
    const svc = new ApiProjectService(client);
    await expect(svc.listProjects()).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
    await expect(svc.upsertProject(fx.getSampleProject())).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
  });

  it("auth: unavailable, with the backend's real reason, and sign-in never succeeds", async () => {
    const { client } = api({ "GET /api/v1/capabilities": { body: fx.getRecordedCapabilities() } });
    const auth = new ApiAuthService(client, new ApiCapabilitiesService(client));
    const a = await auth.availability();
    expect(a.available).toBe(false);
    expect(a.reason).toMatch(/AUTH_MODE disabled/);
    await expect(auth.signIn("a@b.c", "pw")).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
  });

  it("materials list exposes ids only — no invented properties", async () => {
    const { client } = api({ "GET /api/v1/materials": { body: fx.getRecordedMaterialsList() } });
    const catalog = await new ApiMaterialsService(client).getCatalog();
    expect(catalog.snapshots[0].materials).toBeNull();
    expect(catalog.snapshots[0].materialIds.length).toBeGreaterThan(0);
  });
});

describe("ApiCapabilitiesService", () => {
  it("maps the backend's module report and marks missing endpoints as not supported", async () => {
    const { client } = api({ "GET /api/v1/capabilities": { body: fx.getRecordedCapabilities() } });
    const snap = await new ApiCapabilitiesService(client).getCapabilities();
    const status = Object.fromEntries(snap.entries.map((e) => [e.key, e.status]));
    expect(status).toEqual(
      expect.objectContaining({
        backend: "AVAILABLE",
        physics_engine: "AVAILABLE",
        optimization: "AVAILABLE",
        economics: "AVAILABLE",
        reports: "NOT_SUPPORTED",
        visualization: "NOT_SUPPORTED",
        project_sync: "NOT_SUPPORTED",
      })
    );
    expect(snap.weatherSites).toContain("leh");
    expect(snap.authMode).toBe("disabled");
  });

  it("rejects a malformed capabilities response", async () => {
    const { client } = api({ "GET /api/v1/capabilities": { body: { hello: "world" } } });
    await expect(new ApiCapabilitiesService(client).getCapabilities()).rejects.toBeInstanceOf(AppError);
  });
});

describe("ApiOptimizationHistoryService — backend is the source of truth", () => {
  it("without a list endpoint, re-reads each run this device started from GET /optimizations/{id}", async () => {
    resetTestDb();
    resetDbForTests();
    const runs = await getRunsRepository();
    await runs.record(fx.RECORDED_OPTIMIZATION_ID, "prj_local_1", "api");
    await runs.record("opt_gone", "prj_local_2", "api");
    await runs.record("opt_demo_only", null, "fixture");

    const { client, calls } = api({
      [`GET /api/v1/optimizations/${fx.RECORDED_OPTIMIZATION_ID}`]: { body: fx.getRecordedStatusCompleted() },
    });
    const list = await new ApiOptimizationHistoryService(client).listRuns();
    expect(list.source).toBe("device_index");
    const byId = Object.fromEntries(list.runs.map((r) => [r.optimizationId, r]));
    // Values come from the backend's status document, not the device.
    expect(byId[fx.RECORDED_OPTIMIZATION_ID]).toEqual(
      expect.objectContaining({ status: "completed", candidateCount: 8, recommendedDesignId: fx.getRecordedCandidates().recommended_design_id })
    );
    expect(byId.opt_gone.status).toBe("not_found");
    // Demo runs never appear in live history.
    expect(byId.opt_demo_only).toBeUndefined();
    expect(calls[0].url).toBe("/api/v1/optimizations");
  });

  it("uses the backend's own list when it exists", async () => {
    const { client } = api({ "GET /api/v1/optimizations": { body: [fx.getRecordedStatusCompleted()] } });
    const list = await new ApiOptimizationHistoryService(client).listRuns();
    expect(list.source).toBe("backend_list");
    expect(list.runs).toHaveLength(1);
  });

  it("treats an unsupported 405 list route as device-index history, not an offline result", async () => {
    resetTestDb();
    resetDbForTests();
    const runId = fx.RECORDED_OPTIMIZATION_ID;
    await (await getRunsRepository()).record(runId, "prj_local_1", "api");
    const { client } = api({
      "GET /api/v1/optimizations": { status: 405, body: { detail: "Method Not Allowed" } },
      [`GET /api/v1/optimizations/${runId}`]: { body: fx.getRecordedStatusCompleted() },
    });

    const list = await new ApiOptimizationHistoryService(client).listRuns();
    expect(list.source).toBe("device_index");
    expect(list.runs[0]).toEqual(expect.objectContaining({ optimizationId: runId, status: "completed" }));
  });

  it("keeps the device's last-known run status available when the backend is unreachable", async () => {
    resetTestDb();
    resetDbForTests();
    const runs = await getRunsRepository();
    await runs.record("opt_local_completed", "prj_local_1", "api");
    await runs.updateStatus("opt_local_completed", "completed");
    await runs.record("opt_local_running", "prj_local_2", "api");
    await runs.updateStatus("opt_local_running", "running");

    const fetchImpl = jest.fn(async () => {
      throw new Error("Network is offline");
    });
    const service = new ApiOptimizationHistoryService(
      new ApiClient("https://cocoon.test", undefined, fetchImpl as unknown as typeof fetch)
    );
    const list = await service.listRuns();

    expect(list.source).toBe("device_index_offline");
    expect(list.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ optimizationId: "opt_local_completed", status: "completed", projectId: "prj_local_1" }),
        expect.objectContaining({ optimizationId: "opt_local_running", status: "running", projectId: "prj_local_2" }),
      ])
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
