/**
 * Response → app-model mappers shared by the fixture and API providers, so
 * both produce identical shapes from the same backend documents.
 */
import type { SimulationResult } from "@cocoon/contracts";

import { getDb } from "../../database";
import type { BackendCapabilities, OptimizationStatusResponse } from "../../types/backend";
import type { CapabilitiesSnapshot, CapabilityEntry, CapabilityStatus } from "../interfaces/CapabilitiesService";
import type { GenerationJob, GenerationJobStatus } from "../interfaces/GenerationService";

/** Every field of the M0 SimulationResult contract (packages/contracts, schema 4.0). */
const SIMULATION_RESULT_KEYS: (keyof SimulationResult)[] = [
  "schema_version",
  "simulation_id",
  "design_revision_id",
  "engine",
  "status",
  "summary",
  "time_series",
  "zones",
  "provenance",
  "recommendation_state",
];

/**
 * Reduces a backend simulation response to exactly the M0 SimulationResult.
 * POST /api/v1/simulations adds a non-contract `timeseries_url`; M7 rejects
 * any extra field when the result is sent back for pricing
 * (422 extra_forbidden), so extras are dropped at the boundary.
 */
export function toSimulationContract(response: SimulationResult): SimulationResult {
  const out: Partial<Record<keyof SimulationResult, unknown>> = {};
  for (const key of SIMULATION_RESULT_KEYS) {
    if (key in response) out[key] = response[key];
  }
  return out as SimulationResult;
}

const KNOWN_JOB_STATUSES: GenerationJobStatus[] = ["queued", "running", "completed", "failed"];

export function toGenerationJob(resp: OptimizationStatusResponse): GenerationJob {
  const status = (KNOWN_JOB_STATUSES as string[]).includes(resp.status) ? resp.status : "unknown";
  return {
    jobId: resp.optimization_id,
    status,
    createdAt: resp.created_at,
    startedAt: resp.started_at,
    finishedAt: resp.finished_at,
    updatedAt: resp.updated_at,
    recommendedDesignId: resp.recommended_design_id ?? null,
    validationState: resp.validation?.state,
    summary: resp.summary,
    weatherSnapshotId: resp.result?.weather_snapshot_id,
    siteUsed: resp.result?.site_used,
    warnings: resp.result?.warnings,
    error: resp.error
      ? { code: resp.error.code, message: resp.error.message, retryable: resp.error.retryable, details: resp.error.details }
      : undefined,
  };
}

/** Opens (and migrates) the local DB — a real check, not a guess. */
export async function checkLocalStorage(): Promise<CapabilityEntry> {
  try {
    await getDb();
    return { key: "local_storage", label: "Local storage", status: "AVAILABLE", detail: "SQLite open and migrated" };
  } catch (cause) {
    return {
      key: "local_storage",
      label: "Local storage",
      status: "UNAVAILABLE",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function flag(value: unknown): CapabilityStatus {
  return value === true ? "AVAILABLE" : "UNAVAILABLE";
}

/** Maps the backend's own module report. Nothing is marked available unless the backend says so. */
export function capabilitiesFromBackend(caps: BackendCapabilities, localStorage: CapabilityEntry): CapabilitiesSnapshot {
  const m = caps.modules ?? {};
  const ml = typeof m.m5_ml_surrogate === "string" ? m.m5_ml_surrogate : null;
  const ansys = m.m8_ansys ?? null;
  const sites = Array.isArray(m.m3_weather_sites) ? m.m3_weather_sites : [];
  const hasModule = (key: string) => Object.prototype.hasOwnProperty.call(m, key);

  const entries: CapabilityEntry[] = [
    { key: "backend", label: "COCOON backend", status: "AVAILABLE", detail: `Schema ${caps.schema_versions.join(", ")}` },
    { key: "design_generator", label: "Layout generator (M2)", status: flag(m.m2_design_generator) },
    {
      key: "weather",
      label: "Weather archives (M3)",
      status: sites.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
      detail: sites.length > 0 ? `${sites.length} cached sites · ${caps.weather?.source ?? "source not reported"}` : undefined,
    },
    {
      key: "physics_engine",
      label: "Physics engine (M4)",
      status: m.m4_engine ? "AVAILABLE" : "UNAVAILABLE",
      detail: m.m4_engine ? `${m.m4_engine.name} ${m.m4_engine.version}` : undefined,
    },
    {
      key: "ml",
      label: "ML screening (M5)",
      status: ml?.startsWith("importable") ? "AVAILABLE" : "UNAVAILABLE",
      detail: ml ?? "Not reported",
    },
    { key: "optimization", label: "Optimization (M6)", status: flag(m.m6_optimization) },
    { key: "economics", label: "Economics (M7)", status: flag(m.m7_economics) },
    {
      key: "ansys",
      label: "ANSYS validation (M8)",
      status: ansys?.importable ? "AVAILABLE" : "UNAVAILABLE",
      detail: ansys?.importable
        ? "PyMAPDL is importable on the server; a solve still needs a licensed ANSYS installation"
        : ansys?.unavailable_reason ?? "Not reported",
    },
    {
      key: "visualization",
      label: "3D visualization models",
      status: hasModule("visualization") ? "AVAILABLE" : "NOT_SUPPORTED",
      detail: hasModule("visualization")
        ? undefined
        : "No visualization endpoint yet — the app draws the BuildingModel's own geometry",
    },
    {
      key: "reports",
      label: "Reports (M13)",
      status: hasModule("reports") ? "AVAILABLE" : "NOT_SUPPORTED",
      detail: hasModule("reports") ? undefined : "No reports endpoint on this backend yet",
    },
    {
      key: "project_sync",
      label: "Project sync",
      status: hasModule("projects") ? "AVAILABLE" : "NOT_SUPPORTED",
      detail: hasModule("projects") ? undefined : "No projects endpoint yet — projects stay on this device",
    },
    localStorage,
  ];

  return {
    checkedAt: new Date().toISOString(),
    provider: "api",
    backendReachable: true,
    authMode: typeof caps.auth_mode === "string" ? caps.auth_mode : null,
    schemaVersions: caps.schema_versions ?? [],
    weatherSites: sites,
    weatherSiteDetails: caps.weather_site_details ?? [],
    entries,
  };
}
