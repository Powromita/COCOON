/**
 * Pure runtime-guard functions used by mocks/fixtureRegistry.ts. Split out
 * from the registry so they can be unit-tested against synthetic
 * malformed input without needing real corrupt fixture files on disk —
 * see tests/fixtures/fixtureGuard.test.ts.
 *
 * See mocks/fixtureRegistry.ts's module doc comment for what this guard
 * does and does not check (structural + schema_version only, not full
 * JSON Schema validation).
 *
 * M12.2.1: these functions NEVER throw. A malformed fixture is a fact to
 * report, not an exception to raise — fixtureRegistry.ts runs these at
 * module import time, and a throw there would crash before React ever
 * renders a single component, which no ErrorBoundary can catch (see
 * packages/contracts/README.md-adjacent M12.2.1 report for the full
 * investigation). Callers that want a hard failure (e.g. a screen asking
 * for a specific fixture that turned out to be invalid) raise
 * InvalidFixtureError themselves, lazily, only when that data is actually
 * requested — see mocks/fixtureLoader.ts.
 */
import type { SchemaVersion } from "@cocoon/contracts";

import type { FixtureGuardResult } from "./fixtureTypes";

export const EXPECTED_SCHEMA_VERSION: SchemaVersion = "4.0";

export function hasKeys(value: unknown, keys: string[]): FixtureGuardResult {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "fixture is not an object" };
  }
  const missing = keys.filter((k) => !(k in (value as Record<string, unknown>)));
  if (missing.length > 0) {
    return { ok: false, reason: `missing required key(s): ${missing.join(", ")}` };
  }
  return { ok: true };
}

export function checkSchemaVersion(value: unknown): FixtureGuardResult {
  const version = (value as { schema_version?: unknown } | null)?.schema_version;
  if (version !== EXPECTED_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `schema_version is "${String(version)}", expected "${EXPECTED_SCHEMA_VERSION}"`,
    };
  }
  return { ok: true };
}

/** Reads `value.schema_version` for display purposes only — never throws, never validates. */
export function readSchemaVersionForDisplay(value: unknown): string {
  const version = (value as { schema_version?: unknown } | null)?.schema_version;
  return typeof version === "string" ? version : "—";
}

/** Runs the structural + schema_version checks for a single-object fixture. Never throws. */
export function checkFixture(value: unknown, requiredKeys: string[]): FixtureGuardResult {
  const keyCheck = hasKeys(value, requiredKeys);
  if (!keyCheck.ok) return keyCheck;
  if (requiredKeys.includes("schema_version")) {
    const versionCheck = checkSchemaVersion(value);
    if (!versionCheck.ok) return versionCheck;
  }
  return { ok: true };
}

/** Runs the structural + schema_version checks for an array-of-objects fixture. Never throws. */
export function checkFixtureArray(value: unknown, requiredKeys: string[]): FixtureGuardResult {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "expected an array fixture" };
  }
  if (value.length === 0) {
    return { ok: false, reason: "fixture array is empty" };
  }
  for (let i = 0; i < value.length; i++) {
    const itemCheck = checkFixture(value[i], requiredKeys);
    if (!itemCheck.ok) {
      return { ok: false, reason: `item ${i}: ${itemCheck.reason}` };
    }
  }
  return { ok: true };
}

/** Runs the structural + schema_version checks for a `{ id: object }` map fixture. Never throws. */
export function checkFixtureRecord(value: unknown, requiredKeys: string[]): FixtureGuardResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "expected an object map fixture" };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, reason: "fixture map is empty" };
  }
  for (const [key, item] of entries) {
    const itemCheck = checkFixture(item, requiredKeys);
    if (!itemCheck.ok) {
      return { ok: false, reason: `entry "${key}": ${itemCheck.reason}` };
    }
  }
  return { ok: true };
}
