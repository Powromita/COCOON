/**
 * CapabilitiesService — what parts of COCOON are actually available right
 * now. The API provider maps GET /api/v1/capabilities; the fixture provider
 * never reports the backend as connected.
 */

export type CapabilityStatus =
  /** Reported available by the connected backend (or a real on-device check). */
  | "AVAILABLE"
  /** Backed by recorded/sample fixture data only. */
  | "DEMO"
  /** Backend not reachable or not configured. */
  | "NOT_CONNECTED"
  /** The backend reports this module as unavailable. */
  | "UNAVAILABLE"
  /** The backend has no endpoint for this yet. */
  | "NOT_SUPPORTED";

export type CapabilityKey =
  | "backend"
  | "design_generator"
  | "weather"
  | "physics_engine"
  | "ml"
  | "optimization"
  | "economics"
  | "ansys"
  | "visualization"
  | "reports"
  | "project_sync"
  | "local_storage";

export interface CapabilityEntry {
  key: CapabilityKey;
  label: string;
  status: CapabilityStatus;
  detail?: string;
}

export interface CapabilitiesSnapshot {
  checkedAt: string;
  provider: "fixture" | "api";
  backendReachable: boolean;
  /** "disabled" means the backend runs without authentication (local development). */
  authMode: string | null;
  schemaVersions: string[];
  /** Cached weather archives the backend can freeze snapshots from (M3). */
  weatherSites: string[];
  entries: CapabilityEntry[];
}

export interface CapabilitiesService {
  getCapabilities(): Promise<CapabilitiesSnapshot>;
}

export function capabilityStatus(snapshot: CapabilitiesSnapshot | undefined, key: CapabilityKey): CapabilityStatus | undefined {
  return snapshot?.entries.find((e) => e.key === key)?.status;
}
