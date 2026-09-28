/**
 * Live integration test of the API providers against a running COCOON
 * backend. Skipped unless COCOON_LIVE_API_URL is set, e.g.
 *
 *   PYTHONPATH=.:packages/contracts/python python -m uvicorn backend.main:app --port 8765   (repo root)
 *   COCOON_LIVE_API_URL=http://127.0.0.1:8765 npx jest tests/integration                   (mobile-app/)
 *
 * It walks the New Shelter journey exactly as the app does, using the M0
 * sample requirements with a small design count.
 */
jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);

import {
  ApiAnsysService,
  ApiAuthService,
  ApiOptimizationHistoryService,
  ApiProjectService,
  ApiCandidateService,
  ApiCapabilitiesService,
  ApiEconomicsService,
  ApiGenerationService,
  ApiMaterialsService,
  ApiSimulationService,
  ApiVisualizationService,
} from "../../services/api/ApiServices";
import { ApiClient } from "../../services/api/client";
import { getRunsRepository } from "../../database";
import { checkVisualizationModel } from "../../adapters/visualization";
import { getSampleRequirements } from "../../mocks/fixtureLoader";

const LIVE = process.env.COCOON_LIVE_API_URL;

/**
 * The React Native Jest preset replaces global fetch with a stub, so this
 * test talks to the backend through Node's http module instead. Only the
 * parts of fetch that ApiClient uses are implemented.
 */
function nodeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require("node:http") as typeof import("node:http");
  return new Promise((resolve, reject) => {
    // No keep-alive: pooled sockets would keep Jest from exiting.
    const agent = new http.Agent({ keepAlive: false });
    const req = http.request(String(input), { method: init.method ?? "GET", headers: init.headers as Record<string, string>, agent }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response);
      });
    });
    req.on("error", reject);
    init.signal?.addEventListener("abort", () => req.destroy(new Error("aborted")));
    if (init.body) req.write(init.body);
    req.end();
  });
}
const describeLive = LIVE ? describe : describe.skip;

jest.setTimeout(300_000);

describeLive("live COCOON backend", () => {
  const client = new ApiClient(LIVE, undefined, nodeFetch as typeof fetch);

  it("runs requirements → generation → candidates → simulation → economics → 3D → ANSYS status", async () => {
    const caps = await new ApiCapabilitiesService(client).getCapabilities();
    expect(caps.backendReachable).toBe(true);
    expect(caps.entries.find((e) => e.key === "optimization")?.status).toBe("AVAILABLE");

    const catalog = await new ApiMaterialsService(client).getCatalog();
    expect(catalog.snapshots.length).toBeGreaterThan(0);

    const requirements = { ...getSampleRequirements(), project_id: `prj_live_${Date.now()}` };
    const gen = new ApiGenerationService(client);
    const { jobId } = await gen.startGeneration({ requirements, count: 4, seed: 7, idempotencyKey: `live:${requirements.project_id}` });

    let job = await gen.getGenerationJob(jobId);
    for (let i = 0; i < 100 && (job.status === "queued" || job.status === "running"); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      job = await gen.getGenerationJob(jobId);
    }
    expect(job.status).toBe("completed");
    expect(job.weatherSnapshotId).toMatch(/^wx_/);

    const cand = new ApiCandidateService(client);
    const candidates = await cand.getCandidates(jobId);
    expect(candidates.candidates.length).toBeGreaterThan(0);
    const designId = candidates.recommended_design_id ?? candidates.candidates[0].design_id;
    const pareto = await cand.getPareto(jobId);
    expect(pareto.picks.picks).toBeDefined();

    const building = await cand.getDesign(jobId, designId);
    expect(building.design_id).toBe(designId);

    const simSvc = new ApiSimulationService(client);
    const sim = await simSvc.getForDesign({
      designId,
      building,
      weatherSnapshotId: job.weatherSnapshotId as string,
      windowStart: requirements.site.analysis_start,
      windowEnd: requirements.site.analysis_end,
      setpointC: requirements.mission.target_temperature_c ?? 15,
    });
    expect(sim.status).toBe("completed");
    const ts = await simSvc.getTimeseries(sim.simulation_id);
    expect(ts.points.length).toBeGreaterThan(0);

    const econ = await new ApiEconomicsService(client).getForDesign({
      designId,
      building,
      simulation: sim,
      assumptionSetId: requirements.economic_assumption_set_id,
      occupants: requirements.mission.occupants,
      targetTemperatureC: requirements.mission.target_temperature_c,
      simulatedHours: 168,
    });
    expect(econ.scenarios.expected.result.lcc_inr).toBeGreaterThan(0);

    const viz = await new ApiVisualizationService(client).getForDesign({ building, timeseries: ts });
    expect(checkVisualizationModel(viz.model).ok).toBe(true);

    const ansys = await new ApiAnsysService(client).getLatestForRevision(building.revision_id);
    expect(ansys.status).toBe("NOT_REQUESTED");

    // History: the run is re-read from the backend (main has no list endpoint).
    await (await getRunsRepository()).record(jobId, requirements.project_id, "api");
    const history = await new ApiOptimizationHistoryService(client).listRuns();
    expect(history.source).toBe("device_index");
    expect(history.runs.find((r) => r.optimizationId === jobId)).toEqual(
      expect.objectContaining({ status: "completed", recommendedDesignId: candidates.recommended_design_id })
    );

    // Endpoints main lacks are reported honestly.
    await expect(new ApiOptimizationHistoryService(client).getReport(jobId)).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
    await expect(new ApiProjectService(client).listProjects()).rejects.toEqual(expect.objectContaining({ kind: "not_supported" }));
    const auth = await new ApiAuthService(client, new ApiCapabilitiesService(client)).availability();
    expect(auth.available).toBe(false);
  });
});
