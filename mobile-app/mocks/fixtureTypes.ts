/**
 * Shared types for the fixture access layer (mocks/fixtureRegistry.ts,
 * mocks/fixtureLoader.ts). These describe the *loading mechanism*, not
 * the scientific data itself — the data's real shape always comes from
 * @cocoon/contracts.
 */

/** Result of the minimal runtime guard in mocks/fixtureGuard.ts — see its
 * module doc comment for exactly what is (and isn't) checked. */
export interface FixtureGuardResult {
  ok: boolean;
  reason?: string;
}

/** One row of fixtureRegistry.ts's import-time diagnostics — never thrown,
 * always recorded, so a screen (see app/dev/m0.tsx) can render it. */
export interface FixtureDiagnosticEntry {
  name: string;
  check: FixtureGuardResult;
  /** The fixture's own `schema_version` field, read even when the guard
   * failed for some other reason (e.g. a missing unrelated key) — "—"
   * when the fixture is malformed enough that the field itself is
   * missing or not a string. */
  schemaVersion: string;
}

/** A typed outcome for a single fixture accessor call — the shape
 * mocks/fixtureLoader.ts's `toFixtureResult` wraps a call in, so a screen
 * can render a failure without a try/catch of its own. */
export type FixtureResult<T> = { ok: true; data: T } | { ok: false; error: string };
