/**
 * Guard function unit tests. As of M12.2.1, these functions are
 * deliberately non-throwing — a malformed fixture is reported as a
 * failed FixtureGuardResult, never as an exception (see
 * mocks/fixtureGuard.ts's module doc comment, and
 * tests/fixtures/fixtureImportSafety.test.ts for the import-time proof).
 */
import { checkFixture, checkFixtureArray, checkSchemaVersion, hasKeys } from "../../mocks/fixtureGuard";

describe("fixtureGuard — never throws, always returns a result", () => {
  it("accepts a well-formed object with the required keys and correct schema_version", () => {
    expect(checkFixture({ schema_version: "4.0", id: "prj_x" }, ["schema_version", "id"])).toEqual({
      ok: true,
    });
  });

  it("rejects a fixture with a missing required key, without throwing", () => {
    const result = checkFixture({ schema_version: "4.0" }, ["schema_version", "id"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toEqual(expect.stringContaining("id"));
  });

  it("rejects a fixture with the wrong schema_version, without throwing", () => {
    const result = checkFixture({ schema_version: "3.0", id: "prj_x" }, ["schema_version", "id"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toEqual(expect.stringContaining("3.0"));
  });

  it("rejects a non-object fixture, without throwing", () => {
    expect(checkFixture(null, ["schema_version"]).ok).toBe(false);
    expect(checkFixture("not an object", ["schema_version"]).ok).toBe(false);
    expect(() => checkFixture(null, ["schema_version"])).not.toThrow();
  });

  it("rejects an empty array fixture, without throwing", () => {
    const result = checkFixtureArray([], ["schema_version"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toEqual(expect.stringContaining("empty"));
  });

  it("rejects an array fixture whose items don't match, without throwing", () => {
    const result = checkFixtureArray(
      [{ schema_version: "4.0", id: "a" }, { wrong: true }],
      ["schema_version", "id"]
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toEqual(expect.stringContaining("item 1"));
  });

  it("rejects a value that isn't an array at all when an array is expected, without throwing", () => {
    const result = checkFixtureArray({ not: "an array" }, ["schema_version"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toEqual(expect.stringContaining("array"));
  });

  it("hasKeys/checkSchemaVersion report structured reasons", () => {
    expect(hasKeys({ a: 1 }, ["a", "b"])).toEqual({ ok: false, reason: expect.stringContaining("b") });
    expect(checkSchemaVersion({ schema_version: "1.0" }).ok).toBe(false);
    expect(checkSchemaVersion({ schema_version: "4.0" }).ok).toBe(true);
  });
});
