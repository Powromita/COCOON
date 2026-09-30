/**
 * Response shapes of COCOON backend endpoints that are NOT M0 contracts.
 *
 * Wherever an endpoint returns an M0 object (BuildingModel, SimulationResult,
 * AnsysValidationResult, ErrorEnvelope, ...) the app imports it from
 * @cocoon/contracts instead. The types here describe the envelopes and the
 * M6/M7 documents that backend/routes/pipeline.py, economics.py and
 * ansys.py (main @ 1048a2c) actually return — they were checked against
 * recorded responses in fixtures/recorded/. Fields the app does not read
 * are typed loosely (`Record<string, unknown>`) rather than guessed.
 */
import type {
  AnsysJobStatus,
  EconomicAnalysisResult,
  ErrorDetail,
  MaterialRecord,
  RecommendationState,
  TimeSeriesPoint,
} from "@cocoon/contracts";

// ---------------------------------------------------------------------------
// GET /api/v1/capabilities
// ---------------------------------------------------------------------------
export interface BackendCapabilities {
  schema_versions: string[];
  auth_mode: string;
  weather_site_details?: WeatherSite[];
  modules: {
    m2_design_generator?: boolean;
    m3_weather_sites?: string[];
    m4_engine?: { name: string; version: string } | null;
    /** A sentence, e.g. "importable (...)" or "unavailable: ImportError". */
    m5_ml_surrogate?: string | null;
    m6_optimization?: boolean;
    m7_economics?: boolean;
    m8_ansys?: { importable: boolean; unavailable_reason: string | null } | null;
    [key: string]: unknown;
  };
  weather?: { source?: string };
}

/** A named archive location whose coordinates are supplied by the backend. */
export interface WeatherSite {
  site_id: string;
  display_name: string;
  latitude_deg: number;
  longitude_deg: number;
  elevation_m: number;
}

// ---------------------------------------------------------------------------
// POST/GET /api/v1/optimizations — the design-generation job (M2→M4→M7→M6)
// ---------------------------------------------------------------------------
export interface OptimizationCreateResponse {
  optimization_id: string;
  status: "queued";
  status_url: string;
  /** Present when an Idempotency-Key replayed an earlier submission. */
  replayed?: boolean;
}

/** The backend only reports these four states — it sends no stages and no percentages. */
export type OptimizationJobStatus = "queued" | "running" | "completed" | "failed";

export interface ValidationStateDoc {
  /** RecommendationState-style validation state, e.g. "RC_ONLY_ANSYS_NOT_REQUESTED". */
  state: string;
  [key: string]: unknown;
}

export interface OptimizationStatusResponse {
  optimization_id: string;
  status: OptimizationJobStatus;
  project_id?: string;
  count?: number;
  seed?: number;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  updated_at?: string;
  recommended_design_id?: string | null;
  validation?: ValidationStateDoc;
  summary?: { generated?: number; dominated?: number; on_front?: number; [key: string]: unknown };
  timings_s?: Record<string, number>;
  error?: Pick<ErrorDetail, "code" | "message"> & Partial<ErrorDetail>;
  /** The full M6 result document — only present once completed. */
  result?: { weather_snapshot_id?: string; site_used?: SiteUsed; warnings?: string[]; [key: string]: unknown };
}

export interface SiteUsed {
  site?: string;
  distance_km?: number;
  chosen?: string;
  snapshot_id?: string;
  location_name?: string;
  is_cached?: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/v1/optimizations/{id}/candidates
// ---------------------------------------------------------------------------

/** The objective values M6 reports per design. Keys are the backend's; units are in the key suffix. */
export interface OutcomeObjectives {
  unmet_hours?: number | null;
  cold_degree_hours?: number | null;
  overheating_degree_hours?: number | null;
  temperature_swing_c?: number | null;
  heating_energy_kwh?: number | null;
  peak_heating_kw?: number | null;
  capex_inr?: number | null;
  lcc_inr?: number | null;
  mass_kg?: number | null;
  reliability?: number | null;
  occupied_comfort_hours?: number | null;
  passive_min_temperature_c?: number | null;
  passive_median_temperature_c?: number | null;
  [key: string]: number | null | undefined;
}

export type OutcomeStatus = "on_front" | "dominated" | "excluded" | "screened_out" | string;

export interface DesignOutcome {
  design_id: string;
  revision_id: string;
  status: OutcomeStatus;
  stage: string;
  reason: string;
  /** Names of the M6 picks this design won, e.g. ["best_overall"]. */
  picked_as: string[];
  development_only: boolean;
  recommendation_state: RecommendationState | null;
  heater: { capacity_kw: number; fuel: string; zone_ids: string[] } | null;
  objectives: OutcomeObjectives;
  failed_constraints: string[];
  flags: string[];
  dominated_by: string[];
}

export interface CandidatesResponse {
  optimization_id: string;
  recommended_design_id: string | null;
  validation: ValidationStateDoc;
  candidates: DesignOutcome[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/optimizations/{id}/pareto
// ---------------------------------------------------------------------------
export interface PickExplanation {
  sentence: string;
  sources: string[];
}

export interface OptimizationPick {
  name: string;
  status: string;
  design_id: string | null;
  reason: string;
  value?: number | null;
  runner_up?: string | null;
  runner_up_value?: number | null;
  gap?: number | null;
  weights?: Record<string, number>;
  dropped_objectives?: string[];
  pool_size?: number;
  flagged?: boolean;
  development_only?: boolean;
  explanation?: PickExplanation[];
}

export interface ParetoResponse {
  optimization_id: string;
  pareto: {
    objectives: string[];
    front: string[];
    dominated_by: Record<string, string[]>;
    rank: Record<string, number>;
    ties?: unknown[];
    excluded?: Record<string, unknown>;
    flagged?: unknown[];
  } | null;
  picks: {
    picks: Record<string, OptimizationPick>;
    scores?: Record<string, Record<string, number>>;
    eligible?: string[];
    warnings?: string[];
  };
}

// ---------------------------------------------------------------------------
// POST/GET /api/v1/simulations
// ---------------------------------------------------------------------------
export interface TimeseriesResponse {
  simulation_id: string;
  timestep_seconds: number;
  points: TimeSeriesPoint[];
}

// ---------------------------------------------------------------------------
// /api/v1/economic-assumption-sets and /api/v1/economics (M7 report)
// ---------------------------------------------------------------------------
export interface AssumptionSetSummary {
  id: string;
  version: string;
  name: string;
  currency: string;
  effective_date: string;
  source: string;
  owner: string;
  project_lifetime_years: number;
  checksum_sha256: string;
  scenario_assumption_set_ids: Record<string, string>;
}

export interface AssumptionSetsResponse {
  assumption_sets: AssumptionSetSummary[];
}

export interface CurrencyContext {
  currency: string;
  price_basis: string;
  effective_date: string;
  assumption_set_id: string;
  assumption_set_version: string;
  scenario_assumption_set_id: string;
  scenario: string;
  /** Ready-to-display caption supplied by M7. */
  label: string;
}

export interface EconomicsScenarioOutcome {
  scenario: string;
  currency_context: CurrencyContext;
  result: EconomicAnalysisResult;
  installed_heater_capacity_kw?: number;
  shipped_mass_kg?: number;
  total_opex_inr?: number;
  total_discounted_opex_inr?: number;
  residual_value_inr?: number;
}

export interface SensitivityRow {
  parameter: string;
  low_value: number;
  expected_value: number;
  high_value: number;
  lcc_at_low_inr: number;
  lcc_at_expected_inr: number;
  lcc_at_high_inr: number;
  lcc_swing_inr: number;
}

/**
 * The M7 EconomicAnalysisReport (economics/models.py). Only the fields the
 * app displays are typed; the recorded fixtures are trimmed to these.
 */
export interface EconomicsReport {
  report_type: string;
  analysis_id: string;
  created_at: string;
  currency: string;
  assumption_set?: { id: string; version: string; name?: string; source?: string; effective_date?: string };
  assumption_set_checksum_sha256?: string;
  occupants?: number | null;
  design: { design_id: string; revision_id: string; simulation_id: string; weather_snapshot_id: string };
  scenarios: Record<string, EconomicsScenarioOutcome>;
  parameter_sensitivity: SensitivityRow[];
  method_notes?: string[];
  warnings: string[];
  provenance?: {
    m7_version: string;
    contracts_schema_version: string;
    code_commit: string;
    input_hashes: Record<string, string>;
    material_snapshot_id: string;
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/materials
// ---------------------------------------------------------------------------
export interface MaterialsListResponse {
  snapshots: { snapshot_id: string; materials: string[]; material_records?: Record<string, MaterialRecord>; checksum_sha256: string }[];
  default: string;
}

// ---------------------------------------------------------------------------
// /api/ansys/* (M8)
// ---------------------------------------------------------------------------
export interface AnsysSubmitResponse {
  job_id: string;
  status: AnsysJobStatus;
  design_revision_id: string;
  status_url: string;
}

/** GET /api/ansys/revisions/{rev}/latest returns this when no job exists. */
export interface AnsysNotRequested {
  design_revision_id: string;
  status: "NOT_REQUESTED";
}
