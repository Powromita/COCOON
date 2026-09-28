/**
 * Fixture registry — the ONLY module in this app allowed to `import` a
 * fixture JSON file directly. Everything else goes through
 * mocks/fixtureLoader.ts.
 *
 * Two fixture sets are registered:
 *
 * 1. M0 samples — packages/contracts/fixtures/valid/*.json on main. These
 *    are the M0 package's own validated examples of each contract. They are
 *    imported in place (not copied) and used where the app needs an
 *    instance of a contract the demo run below doesn't produce (the sample
 *    project/requirements, a VisualizationModel, ANSYS result states).
 *
 * 2. Recorded run — fixtures/recorded/*.json. Real responses captured from
 *    the COCOON backend (main @ 1048a2c) for one optimization of the M0
 *    sample requirements — see fixtures/recorded/MANIFEST.json for exactly
 *    how. These are genuine engine outputs, but they are still DEMO data:
 *    every screen built from them shows the fixture banner.
 *
 * Runtime safety: the guard (mocks/fixtureGuard.ts) checks presence of the
 * required top-level keys and schema_version "4.0" — not full JSON Schema
 * validation. The checks run at import time but NEVER throw; they only
 * record results. fixtureLoader.ts raises InvalidFixtureError lazily, when
 * a failed fixture is actually requested, where an ErrorBoundary can catch it.
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
import { checkFixture, checkFixtureRecord, readSchemaVersionForDisplay } from "./fixtureGuard";
import type { FixtureDiagnosticEntry, FixtureGuardResult } from "./fixtureTypes";

// --- M0 samples (packages/contracts/fixtures/valid) ---
import sampleProjectRaw from "../../packages/contracts/fixtures/valid/project_active.json";
import sampleRequirementsRaw from "../../packages/contracts/fixtures/valid/requirements_ladakh_30p.json";
import sampleBuildingRaw from "../../packages/contracts/fixtures/valid/building_airlock_living.json";
import sampleMaterialsRaw from "../../packages/contracts/fixtures/valid/material_snapshot_standard.json";
import sampleWeatherRaw from "../../packages/contracts/fixtures/valid/weather_snapshot_leh.json";
import sampleSimulationRaw from "../../packages/contracts/fixtures/valid/simulation_result_completed.json";
import sampleEconomicsRaw from "../../packages/contracts/fixtures/valid/economics_lifecycle_result.json";
import sampleVisualizationRaw from "../../packages/contracts/fixtures/valid/visualization_model.json";
import sampleAnsysJobRaw from "../../packages/contracts/fixtures/valid/ansys_job_queued.json";
import sampleAnsysCompletedRaw from "../../packages/contracts/fixtures/valid/ansys_validation_completed.json";
import sampleAnsysUnavailableRaw from "../../packages/contracts/fixtures/valid/ansys_validation_unavailable.json";
import sampleErrorEnvelopeRaw from "../../packages/contracts/fixtures/valid/error_envelope_ml_fallback.json";

// --- Recorded backend run (fixtures/recorded) ---
import recordedManifestRaw from "../fixtures/recorded/MANIFEST.json";
import recordedCapabilitiesRaw from "../fixtures/recorded/capabilities.json";
import recordedCreateRaw from "../fixtures/recorded/optimization-create.json";
import recordedStatusRunningRaw from "../fixtures/recorded/optimization-status-running.json";
import recordedStatusCompletedRaw from "../fixtures/recorded/optimization-status-completed.json";
import recordedCandidatesRaw from "../fixtures/recorded/candidates.json";
import recordedParetoRaw from "../fixtures/recorded/pareto.json";
import recordedDesignsRaw from "../fixtures/recorded/designs.json";
import recordedSimulationsRaw from "../fixtures/recorded/simulations.json";
import recordedTimeseriesRaw from "../fixtures/recorded/timeseries.json";
import recordedEconomicsRaw from "../fixtures/recorded/economics.json";
import recordedAssumptionSetsRaw from "../fixtures/recorded/economic-assumption-sets.json";
import recordedMaterialsListRaw from "../fixtures/recorded/materials-list.json";
import recordedMaterialsV2Raw from "../fixtures/recorded/material-snapshot-v2.json";

const PROJECT_KEYS = ["schema_version", "project_id", "name", "mode", "site", "requirements"];
const REQUIREMENTS_KEYS = ["schema_version", "project_id", "mode", "site", "mission", "constraints", "economic_assumption_set_id"];
const BUILDING_KEYS = ["schema_version", "design_id", "revision_id", "floors", "surfaces", "openings", "assemblies"];
const MATERIAL_KEYS = ["schema_version", "snapshot_id", "materials", "checksum_sha256"];
const WEATHER_KEYS = ["schema_version", "snapshot_id", "source", "hourly_data"];
const SIMULATION_KEYS = ["schema_version", "simulation_id", "design_revision_id", "status", "zones", "engine", "provenance"];
const ECONOMICS_KEYS = ["schema_version", "analysis_id", "design_revision_id", "capex", "lcc_inr"];
const VISUALIZATION_KEYS = ["schema_version", "model_id", "design_revision_id", "boxes"];
const ANSYS_JOB_KEYS = ["schema_version", "job_id", "design_revision_id", "solver_config"];
const ANSYS_RESULT_KEYS = ["schema_version", "job_id", "design_revision_id", "status"];
const ERROR_ENVELOPE_KEYS = ["error"];

/** name -> guard result, built once at import time. Never causes a throw. */
export const FIXTURE_GUARD_RESULTS: Record<string, FixtureGuardResult> = {
  "m0/project_active.json": checkFixture(sampleProjectRaw, PROJECT_KEYS),
  "m0/requirements_ladakh_30p.json": checkFixture(sampleRequirementsRaw, REQUIREMENTS_KEYS),
  "m0/building_airlock_living.json": checkFixture(sampleBuildingRaw, BUILDING_KEYS),
  "m0/material_snapshot_standard.json": checkFixture(sampleMaterialsRaw, MATERIAL_KEYS),
  "m0/weather_snapshot_leh.json": checkFixture(sampleWeatherRaw, WEATHER_KEYS),
  "m0/simulation_result_completed.json": checkFixture(sampleSimulationRaw, SIMULATION_KEYS),
  "m0/economics_lifecycle_result.json": checkFixture(sampleEconomicsRaw, ECONOMICS_KEYS),
  "m0/visualization_model.json": checkFixture(sampleVisualizationRaw, VISUALIZATION_KEYS),
  "m0/ansys_job_queued.json": checkFixture(sampleAnsysJobRaw, ANSYS_JOB_KEYS),
  "m0/ansys_validation_completed.json": checkFixture(sampleAnsysCompletedRaw, ANSYS_RESULT_KEYS),
  "m0/ansys_validation_unavailable.json": checkFixture(sampleAnsysUnavailableRaw, ANSYS_RESULT_KEYS),
  "m0/error_envelope_ml_fallback.json": checkFixture(sampleErrorEnvelopeRaw, ERROR_ENVELOPE_KEYS),

  "recorded/capabilities.json": checkFixture(recordedCapabilitiesRaw, ["schema_versions", "modules"]),
  "recorded/optimization-create.json": checkFixture(recordedCreateRaw, ["optimization_id", "status"]),
  "recorded/optimization-status-running.json": checkFixture(recordedStatusRunningRaw, ["optimization_id", "status"]),
  "recorded/optimization-status-completed.json": checkFixture(recordedStatusCompletedRaw, [
    "optimization_id",
    "status",
    "recommended_design_id",
  ]),
  "recorded/candidates.json": checkFixture(recordedCandidatesRaw, ["optimization_id", "candidates", "validation"]),
  "recorded/pareto.json": checkFixture(recordedParetoRaw, ["optimization_id", "pareto", "picks"]),
  "recorded/designs.json": checkFixtureRecord(recordedDesignsRaw, BUILDING_KEYS),
  "recorded/simulations.json": checkFixtureRecord(recordedSimulationsRaw, SIMULATION_KEYS),
  "recorded/timeseries.json": checkFixtureRecord(recordedTimeseriesRaw, ["simulation_id", "points"]),
  "recorded/economics.json": checkFixtureRecord(recordedEconomicsRaw, ["analysis_id", "scenarios", "design"]),
  "recorded/economic-assumption-sets.json": checkFixture(recordedAssumptionSetsRaw, ["assumption_sets"]),
  "recorded/materials-list.json": checkFixture(recordedMaterialsListRaw, ["snapshots", "default"]),
  "recorded/material-snapshot-v2.json": checkFixture(recordedMaterialsV2Raw, MATERIAL_KEYS),
};

const RAW_BY_NAME: Record<string, unknown> = {
  "m0/project_active.json": sampleProjectRaw,
  "m0/requirements_ladakh_30p.json": sampleRequirementsRaw,
  "m0/building_airlock_living.json": sampleBuildingRaw,
  "m0/material_snapshot_standard.json": sampleMaterialsRaw,
  "m0/weather_snapshot_leh.json": sampleWeatherRaw,
  "m0/simulation_result_completed.json": sampleSimulationRaw,
  "m0/economics_lifecycle_result.json": sampleEconomicsRaw,
  "m0/visualization_model.json": sampleVisualizationRaw,
  "m0/ansys_job_queued.json": sampleAnsysJobRaw,
  "m0/ansys_validation_completed.json": sampleAnsysCompletedRaw,
  "m0/ansys_validation_unavailable.json": sampleAnsysUnavailableRaw,
  "m0/error_envelope_ml_fallback.json": sampleErrorEnvelopeRaw,
  "recorded/capabilities.json": recordedCapabilitiesRaw,
  "recorded/optimization-create.json": recordedCreateRaw,
  "recorded/optimization-status-running.json": recordedStatusRunningRaw,
  "recorded/optimization-status-completed.json": recordedStatusCompletedRaw,
  "recorded/candidates.json": recordedCandidatesRaw,
  "recorded/pareto.json": recordedParetoRaw,
  "recorded/designs.json": recordedDesignsRaw,
  "recorded/simulations.json": recordedSimulationsRaw,
  "recorded/timeseries.json": recordedTimeseriesRaw,
  "recorded/economics.json": recordedEconomicsRaw,
  "recorded/economic-assumption-sets.json": recordedAssumptionSetsRaw,
  "recorded/materials-list.json": recordedMaterialsListRaw,
  "recorded/material-snapshot-v2.json": recordedMaterialsV2Raw,
};

/** Ordered, display-ready diagnostics for every fixture — see app/dev/m0.tsx. */
export const FIXTURE_DIAGNOSTICS: FixtureDiagnosticEntry[] = Object.entries(RAW_BY_NAME).map(([name, raw]) => ({
  name,
  check: FIXTURE_GUARD_RESULTS[name],
  schemaVersion: readSchemaVersionForDisplay(raw),
}));

export interface RecordedManifest {
  recorded_at: string;
  backend_commit: string;
  how: string;
  optimization_id: string;
}

// Type ASSERTIONS, not runtime checks — consumers go through fixtureLoader.ts,
// which checks FIXTURE_GUARD_RESULTS before handing data back.
export const sampleProject = sampleProjectRaw as unknown as Project;
export const sampleRequirements = sampleRequirementsRaw as unknown as RequirementsContract;
export const sampleBuilding = sampleBuildingRaw as unknown as BuildingModel;
export const sampleMaterials = sampleMaterialsRaw as unknown as MaterialSnapshot;
export const sampleWeather = sampleWeatherRaw as unknown as WeatherSnapshot;
export const sampleSimulation = sampleSimulationRaw as unknown as SimulationResult;
export const sampleEconomics = sampleEconomicsRaw as unknown as EconomicAnalysisResult;
export const sampleVisualization = sampleVisualizationRaw as unknown as VisualizationModel;
export const sampleAnsysJob = sampleAnsysJobRaw as unknown as AnsysJobRequest;
export const sampleAnsysCompleted = sampleAnsysCompletedRaw as unknown as AnsysValidationResult;
export const sampleAnsysUnavailable = sampleAnsysUnavailableRaw as unknown as AnsysValidationResult;
export const sampleErrorEnvelope = sampleErrorEnvelopeRaw as unknown as ErrorEnvelope;

export const recordedManifest = recordedManifestRaw as unknown as RecordedManifest;
export const recordedCapabilities = recordedCapabilitiesRaw as unknown as BackendCapabilities;
export const recordedCreate = recordedCreateRaw as unknown as OptimizationCreateResponse;
export const recordedStatusRunning = recordedStatusRunningRaw as unknown as OptimizationStatusResponse;
export const recordedStatusCompleted = recordedStatusCompletedRaw as unknown as OptimizationStatusResponse;
export const recordedCandidates = recordedCandidatesRaw as unknown as CandidatesResponse;
export const recordedPareto = recordedParetoRaw as unknown as ParetoResponse;
export const recordedDesigns = recordedDesignsRaw as unknown as Record<string, BuildingModel>;
export const recordedSimulations = recordedSimulationsRaw as unknown as Record<string, SimulationResult>;
export const recordedTimeseries = recordedTimeseriesRaw as unknown as Record<string, TimeseriesResponse>;
export const recordedEconomics = recordedEconomicsRaw as unknown as Record<string, EconomicsReport>;
export const recordedAssumptionSets = recordedAssumptionSetsRaw as unknown as AssumptionSetsResponse;
export const recordedMaterialsList = recordedMaterialsListRaw as unknown as MaterialsListResponse;
export const recordedMaterialsV2 = recordedMaterialsV2Raw as unknown as MaterialSnapshot;
