/**
 * Fixture loader — the ONLY module fixture services may import to reach
 * demo data. It wraps mocks/fixtureRegistry.ts with typed accessors that
 * check each fixture's guard result first and raise InvalidFixtureError
 * (lazily, where an ErrorBoundary/query can catch it) if it failed.
 *
 * Screens never import this module: they go through services/registry.ts,
 * so switching EXPO_PUBLIC_DATA_PROVIDER to "api" changes no screen code.
 */
import type {
  AnsysJobRequest,
  AnsysValidationResult,
  BuildingModel,
  EconomicAnalysisResult,
  ErrorEnvelope,
  MaterialSnapshot,
  Project,
  RequirementsContract,
  SimulationResult,
  VisualizationModel,
  WeatherSnapshot,
} from "@cocoon/contracts";

import type {
  AssumptionSetsResponse,
  BackendCapabilities,
  CandidatesResponse,
  EconomicsReport,
  MaterialsListResponse,
  OptimizationCreateResponse,
  OptimizationStatusResponse,
  ParetoResponse,
  TimeseriesResponse,
} from "../types/backend";
import { FixtureNotFoundError, InvalidFixtureError } from "../utils/errors";
import * as reg from "./fixtureRegistry";
import type { FixtureResult } from "./fixtureTypes";

export { FIXTURE_DIAGNOSTICS } from "./fixtureRegistry";
export type { RecordedManifest } from "./fixtureRegistry";

function guardOrThrow(name: string): void {
  const result = reg.FIXTURE_GUARD_RESULTS[name];
  if (result && !result.ok) {
    throw new InvalidFixtureError(name, result.reason ?? "failed the runtime guard");
  }
}

function guarded<T>(name: string, value: T): () => T {
  return () => {
    guardOrThrow(name);
    return value;
  };
}

/** Wraps a loader call into a typed result instead of letting it throw — used by app/dev/m0.tsx. */
export function toFixtureResult<T>(loader: () => T): FixtureResult<T> {
  try {
    return { ok: true, data: loader() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- M0 samples ---
export const getSampleProject: () => Project = guarded("m0/project_active.json", reg.sampleProject);
export const getSampleRequirements: () => RequirementsContract = guarded(
  "m0/requirements_ladakh_30p.json",
  reg.sampleRequirements
);
export const getSampleBuilding: () => BuildingModel = guarded("m0/building_airlock_living.json", reg.sampleBuilding);
export const getSampleMaterialSnapshot: () => MaterialSnapshot = guarded(
  "m0/material_snapshot_standard.json",
  reg.sampleMaterials
);
export const getSampleWeatherSnapshot: () => WeatherSnapshot = guarded("m0/weather_snapshot_leh.json", reg.sampleWeather);
export const getSampleSimulation: () => SimulationResult = guarded(
  "m0/simulation_result_completed.json",
  reg.sampleSimulation
);
export const getSampleEconomics: () => EconomicAnalysisResult = guarded(
  "m0/economics_lifecycle_result.json",
  reg.sampleEconomics
);
export const getSampleVisualizationModel: () => VisualizationModel = guarded(
  "m0/visualization_model.json",
  reg.sampleVisualization
);
export const getSampleAnsysJobRequest: () => AnsysJobRequest = guarded("m0/ansys_job_queued.json", reg.sampleAnsysJob);
export const getSampleAnsysCompleted: () => AnsysValidationResult = guarded(
  "m0/ansys_validation_completed.json",
  reg.sampleAnsysCompleted
);
export const getSampleAnsysUnavailable: () => AnsysValidationResult = guarded(
  "m0/ansys_validation_unavailable.json",
  reg.sampleAnsysUnavailable
);
export const getSampleErrorEnvelope: () => ErrorEnvelope = guarded(
  "m0/error_envelope_ml_fallback.json",
  reg.sampleErrorEnvelope
);

// --- Recorded backend run ---
export const RECORDED_MANIFEST = reg.recordedManifest;
export const RECORDED_OPTIMIZATION_ID = reg.recordedManifest.optimization_id;

export const getRecordedCapabilities: () => BackendCapabilities = guarded(
  "recorded/capabilities.json",
  reg.recordedCapabilities
);
export const getRecordedCreate: () => OptimizationCreateResponse = guarded(
  "recorded/optimization-create.json",
  reg.recordedCreate
);
export const getRecordedStatusRunning: () => OptimizationStatusResponse = guarded(
  "recorded/optimization-status-running.json",
  reg.recordedStatusRunning
);
export const getRecordedStatusCompleted: () => OptimizationStatusResponse = guarded(
  "recorded/optimization-status-completed.json",
  reg.recordedStatusCompleted
);
export const getRecordedCandidates: () => CandidatesResponse = guarded("recorded/candidates.json", reg.recordedCandidates);
export const getRecordedPareto: () => ParetoResponse = guarded("recorded/pareto.json", reg.recordedPareto);
export const getRecordedAssumptionSets: () => AssumptionSetsResponse = guarded(
  "recorded/economic-assumption-sets.json",
  reg.recordedAssumptionSets
);
export const getRecordedMaterialsList: () => MaterialsListResponse = guarded(
  "recorded/materials-list.json",
  reg.recordedMaterialsList
);
export const getRecordedMaterialSnapshotV2: () => MaterialSnapshot = guarded(
  "recorded/material-snapshot-v2.json",
  reg.recordedMaterialsV2
);

export function getRecordedDesign(designId: string): BuildingModel {
  guardOrThrow("recorded/designs.json");
  const found = reg.recordedDesigns[designId];
  if (!found) throw new FixtureNotFoundError("recorded/designs.json", designId);
  return found;
}

export function getRecordedSimulationForDesign(designId: string): SimulationResult {
  guardOrThrow("recorded/simulations.json");
  const found = reg.recordedSimulations[designId];
  if (!found) throw new FixtureNotFoundError("recorded/simulations.json", designId);
  return found;
}

export function getRecordedTimeseries(simulationId: string): TimeseriesResponse {
  guardOrThrow("recorded/timeseries.json");
  const found = reg.recordedTimeseries[simulationId];
  if (!found) throw new FixtureNotFoundError("recorded/timeseries.json", simulationId);
  return found;
}

export function getRecordedEconomicsForDesign(designId: string): EconomicsReport {
  guardOrThrow("recorded/economics.json");
  const found = reg.recordedEconomics[designId];
  if (!found) throw new FixtureNotFoundError("recorded/economics.json", designId);
  return found;
}

/** Every material snapshot the demo data knows about, with full M0 properties. */
export function getAllMaterialSnapshots(): MaterialSnapshot[] {
  return [getSampleMaterialSnapshot(), getRecordedMaterialSnapshotV2()];
}
