/**
 * A generic, mobile-only Result type (not part of @cocoon/contracts — this
 * describes how OUR functions report success/failure, not scientific
 * data). Used across the database/repository/validation layers so
 * expected failures (a row not found, a field that failed validation, a
 * DB that failed to open) are values the caller must handle, not
 * exceptions that can slip past unnoticed. Field naming matches
 * mocks/fixtureTypes.ts's FixtureResult for consistency.
 */
export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
