/**
 * Tests A & B (M12.2.1 §7): a malformed fixture must never throw at
 * import time (A), and fixtureLoader must offer a typed failure result
 * an invalid fixture can be turned into (B) — the mechanism app/dev/m0.tsx
 * uses to render fixture problems inline instead of relying solely on an
 * ErrorBoundary.
 */
import { InvalidFixtureError } from "../../utils/errors";

describe("fixtureRegistry — A. guard failure does not throw at import", () => {
  const PROJECT_FIXTURE_PATH = "../../../packages/contracts/fixtures/valid/project_active.json";

  afterEach(() => {
    jest.dontMock(PROJECT_FIXTURE_PATH);
    jest.resetModules();
  });

  it("does not throw when a fixture is malformed, and records a failed guard result instead", () => {
    jest.resetModules();
    jest.doMock(
      PROJECT_FIXTURE_PATH,
      () => ({
        schema_version: "1.0",
        project_id: "prj_x",
        name: "Ladakh Field Shelter",
        mode: "new_shelter",
        site: {},
        requirements: {},
      }),
      { virtual: false }
    );

    let registry: typeof import("../../mocks/fixtureRegistry");
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      registry = require("../../mocks/fixtureRegistry");
    }).not.toThrow();

    const result = registry!.FIXTURE_GUARD_RESULTS["m0/project_active.json"];
    expect(result.ok).toBe(false);
    expect(result.reason).toEqual(expect.stringContaining("schema_version"));

    const diagnostic = registry!.FIXTURE_DIAGNOSTICS.find((d) => d.name === "m0/project_active.json");
    expect(diagnostic?.check.ok).toBe(false);
    expect(diagnostic?.schemaVersion).toBe("1.0");
  });

  it("still exposes every other fixture normally when only one is malformed", () => {
    jest.resetModules();
    jest.doMock(PROJECT_FIXTURE_PATH, () => ({ schema_version: "1.0" }), { virtual: false });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const registry: typeof import("../../mocks/fixtureRegistry") = require("../../mocks/fixtureRegistry");
    expect(registry.FIXTURE_GUARD_RESULTS["m0/weather_snapshot_leh.json"].ok).toBe(true);
    expect(registry.FIXTURE_GUARD_RESULTS["recorded/designs.json"].ok).toBe(true);
  });
});

describe("fixtureLoader — B. typed failure result for an invalid fixture", () => {
  it("toFixtureResult turns a throwing loader into {ok:false, error}", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { toFixtureResult } = require("../../mocks/fixtureLoader");
    const result = toFixtureResult(() => {
      throw new InvalidFixtureError("m0/project_active.json", "schema_version is \"1.0\", expected \"4.0\"");
    });
    expect(result.ok).toBe(false);
    expect(result.error).toEqual(expect.stringContaining("schema_version"));
  });

  it("toFixtureResult returns {ok:true, data} for a successful loader", () => {
    const { toFixtureResult } = require("../../mocks/fixtureLoader");
    const result = toFixtureResult(() => 42);
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it("a real accessor call for the malformed fixture throws lazily (not at import), and is catchable via toFixtureResult", () => {
    jest.resetModules();
    jest.doMock("../../../packages/contracts/fixtures/valid/project_active.json", () => ({ schema_version: "1.0" }), {
      virtual: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loader: typeof import("../../mocks/fixtureLoader") = require("../../mocks/fixtureLoader");
    const result = loader.toFixtureResult(() => loader.getSampleProject());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(expect.stringContaining("m0/project_active.json"));
    }

    jest.dontMock("../../../packages/contracts/fixtures/valid/project_active.json");
    jest.resetModules();
  });
});
