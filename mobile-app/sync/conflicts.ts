/**
 * Conflict resolution for synced records.
 *
 * Projects are currently local-first and main's backend stores none, so no
 * conflicts can arise yet. This module is the single extension point for
 * when one can: a resolver receives the local and remote copies and
 * returns which to keep. The default rule is last-writer-wins on
 * `updated_at`; anything smarter (field-level merges, user prompts) should
 * replace `defaultResolver` here rather than be added at call sites.
 */

export interface Versioned {
  updated_at: string;
}

export type ConflictDecision = "keep_local" | "keep_remote";

export type ConflictResolver<T extends Versioned> = (local: T, remote: T) => ConflictDecision;

export function defaultResolver<T extends Versioned>(local: T, remote: T): ConflictDecision {
  const l = Date.parse(local.updated_at);
  const r = Date.parse(remote.updated_at);
  if (!Number.isFinite(r)) return "keep_local";
  if (!Number.isFinite(l)) return "keep_remote";
  return r > l ? "keep_remote" : "keep_local";
}
