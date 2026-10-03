/**
 * Template catalogue, compatibility, template-aware submission, retry and the
 * stage-aware job mapping — request shapes and response mapping only.
 */
jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);

import { render, screen } from "@testing-library/react-native";
import React from "react";

import { FailureNotice } from "../../components/generation/FailureNotice";
import { resetDbForTests } from "../../database";
import { ANSYS_POLL_MS, generationPollInterval, JOB_POLL_MS } from "../../hooks/useCocoon";
import { ApiGenerationService, ApiTemplateService } from "../../services/api/ApiServices";
import { ApiClient } from "../../services/api/client";
import { FixtureTemplateService } from "../../services/fixture/FixtureServices";
import { toGenerationJob } from "../../services/shared/mappers";
import * as fx from "../../mocks/fixtureLoader";
import { AppError } from "../../utils/errors";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { resetTestDb } from "../helpers/testDb";

const themed = (el: React.ReactElement) => render(React.createElement(ThemeProvider, null, el));

const catalog = require("../fixtures/templates/catalog.json");
const refused = require("../fixtures/templates/error_physical_infeasibility.json");

function respond(status: number, body: unknown): Response {
  return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

function api(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("https://cocoon.test", "");
    const method = init.method ?? "GET";
    calls.push({ method, url: path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const hit = routes[`${method} ${path}`];
    return hit ? respond(hit.status ?? 200, hit.body) : respond(404, { detail: "Not Found" });
  });
  return { client: new ApiClient("https://cocoon.test", undefined, fetchImpl as unknown as typeof fetch), calls };
}

beforeEach(async () => {
  resetTestDb();
  resetDbForTests();
});

describe("ApiTemplateService", () => {
  it("reads the catalogue from GET /api/v1/templates verbatim", async () => {
    const { client } = api({ "GET /api/v1/templates": { body: catalog } });
    expect(await new ApiTemplateService(client).getCatalog()).toEqual(catalog);
  });

  it("posts the draft, the template choice and the arrangement to the compatibility check", async () => {
    const result = require("../fixtures/templates/compatibility_sample_ok.json");
    const { client, calls } = api({ "POST /api/v1/design-compatibility": { body: result } });
    const out = await new ApiTemplateService(client).checkCompatibility({
      requirements: { mission: { required_rooms: ["living"] } },
      templateId: "two_floor_compact",
      roomArrangement: { sleeping: "dedicated" },
    });
    expect(out.ok).toBe(true);
    expect(calls[0].body).toEqual({
      requirements: { mission: { required_rooms: ["living"] } },
      template_id: "two_floor_compact",
      room_arrangement: { sleeping: "dedicated" },
      materials_snapshot_id: null,
    });
  });

  it("an older backend without the endpoint is 'not_supported', never a guessed catalogue", async () => {
    const { client } = api({});
    await expect(new ApiTemplateService(client).getCatalog()).rejects.toMatchObject({ kind: "not_supported" });
  });

  it("the fixture provider refuses to invent a catalogue", async () => {
    await expect(new FixtureTemplateService().getCatalog()).rejects.toBeInstanceOf(AppError);
  });
});

describe("template-aware generation", () => {
  it("sends the chosen template and arrangement with the job", async () => {
    const { client, calls } = api({ "POST /api/v1/optimizations": { status: 201, body: fx.getRecordedCreate() } });
    await new ApiGenerationService(client).startGeneration({
      requirements: fx.getSampleRequirements(),
      count: 4,
      seed: 1,
      idempotencyKey: "k",
      templateId: null,
      roomArrangement: { sleeping: "dedicated" },
    });
    expect(calls[0].body).toEqual(expect.objectContaining({ template_id: null, room_arrangement: { sleeping: "dedicated" } }));
  });

  it("a refused submission keeps the backend's category, field and trace id", async () => {
    const { client } = api({ "POST /api/v1/optimizations": { status: 422, body: refused } });
    const error = await new ApiGenerationService(client)
      .startGeneration({ requirements: fx.getSampleRequirements(), count: 4, seed: 1, idempotencyKey: "k2" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).details?.category).toBe("physical_infeasibility");
    expect((error as AppError).details?.field).toBe("constraints.maximum_footprint_m2");
    expect((error as AppError).traceId).toBe(refused.error.trace_id);
  });

  it("retries through POST /optimizations/{id}/retry and returns the new job", async () => {
    const { client, calls } = api({
      "POST /api/v1/optimizations/opt_aaaaaaaaaaaa/retry": { status: 201, body: { optimization_id: "opt_bbbbbbbbbbbb", notes: [] } },
    });
    const res = await new ApiGenerationService(client).retryGeneration("opt_aaaaaaaaaaaa");
    expect(res).toEqual({ jobId: "opt_bbbbbbbbbbbb", notes: [] });
    expect(calls[0].method).toBe("POST");
  });
});

describe("stage-aware job status", () => {
  const status = {
    optimization_id: "opt_aaaaaaaaaaaa",
    status: "completed" as const,
    phase: "ansys_validation" as const,
    template_ids: ["two_floor_compact"],
    template_selection: "automatic" as const,
    template_catalog_version: "cat_x",
    stages: [
      { id: "generation", label: "Candidate generation and validation (M2)", status: "completed" as const },
      { id: "simulation", label: "RC thermal simulation (M4)", status: "completed" as const },
      { id: "ansys", label: "ANSYS validation (M8)", status: "running" as const },
    ],
    generation: { requested: 3, generated: 3, attempts: 40, max_attempts: 150, complete: true, rejection_reasons: {} },
    ansys: { job_id: "ans_1", status: "RUNNING" },
  };

  it("maps stages, templates and the live ANSYS status", () => {
    const job = toGenerationJob(status);
    expect(job.stages?.map((s) => s.status)).toEqual(["completed", "completed", "running"]);
    expect(job.templateIds).toEqual(["two_floor_compact"]);
    expect(job.ansys).toEqual({ jobId: "ans_1", status: "RUNNING", errorReason: undefined });
  });

  it("keeps polling a completed job only while its ANSYS stage is active", () => {
    expect(generationPollInterval(toGenerationJob(status))).toBe(ANSYS_POLL_MS);
    expect(generationPollInterval(toGenerationJob({ ...status, phase: "completed" }))).toBe(false);
    expect(generationPollInterval(toGenerationJob({ ...status, status: "running", phase: "generating" }))).toBe(JOB_POLL_MS);
  });
});

describe("FailureNotice", () => {
  it("renders a categorised refusal with the real reason and an edit action, no technical detail", () => {
    themed(
      React.createElement(FailureNotice, {
        error: { message: refused.error.message, details: refused.error.details, traceId: refused.error.trace_id },
        onEdit: () => undefined,
      })
    );
    expect(screen.getByText("The rooms do not fit")).toBeTruthy();
    expect(screen.getByText(refused.error.message)).toBeTruthy();
    expect(screen.getByText("Change requirements")).toBeTruthy();
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("renders no-feasible-candidates with M2's rejection tally", () => {
    themed(
      React.createElement(FailureNotice, {
        error: {
          message: "M2 produced no valid design",
          details: { category: "no_feasible_candidates", attempts: 12, reasons: { "constraints:envelope_mass_within_limit": 12 } },
        },
      })
    );
    expect(screen.getByText("No design passed validation")).toBeTruthy();
    expect(screen.getByText(/12 attempts: the envelope was heavier than the mass limit/)).toBeTruthy();
  });

  it("renders a service failure with Retry and the reference id", () => {
    const onRetry = jest.fn();
    themed(
      React.createElement(FailureNotice, {
        error: { message: "interrupted", retryable: true, details: { category: "temporary_failure" }, traceId: "ref-42" },
        onRetry,
      })
    );
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByText("Reference ID: ref-42")).toBeTruthy();
  });
});
