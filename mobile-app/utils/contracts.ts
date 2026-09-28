/**
 * Small helpers for @cocoon/contracts objects. They only inspect data a
 * backend or fixture already produced — none derives a scientific value.
 */
import { SCHEMA_VERSION, type SchemaVersion } from "@cocoon/contracts";

import { InvalidFixtureError } from "./errors";

/** The one M0 schema version this app understands — taken from the contracts package itself. */
export const SUPPORTED_SCHEMA_VERSION: SchemaVersion = SCHEMA_VERSION;

/** Throws if `value.schema_version` isn't the version this app understands. */
export function assertSchemaVersion(value: { schema_version: string }, context: string): void {
  if (value.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new InvalidFixtureError(
      context,
      `unsupported schema_version "${value.schema_version}" (this app supports "${SUPPORTED_SCHEMA_VERSION}")`
    );
  }
}
