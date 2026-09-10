/**
 * types.ts — the frontend ⇄ pipeline contract.
 *
 * Mirrors:
 *   shelter_config.py      (ShelterConfig)
 *   run_pipeline.py CLI     (RunRequest)
 *   runs/<id>/*.json+csv    (RunResults, PipelineStatus)
 *
 * Nothing here talks to the network. api.ts is the only place that does.
 */

// ---- material / glazing vocabulary (from thermal-calculator/data) ----------

export type MaterialId =
  | "adobe"
  | "rammed_earth"
  | "straw_clay"
  | "stone_masonry"
  | "wood_timber"
  | "concrete"
  | "reinforced_concrete"
  | "puf";

export type GlazingType = "single" | "double" | "triple";

export type Season = "winter" | "spring" | "summer" | "autumn";

export type GroundMode = "annual_mean" | "manual";

// ---- shelter configuration (== shelter_config.validate()) -----------------

export interface Layer {
  material: MaterialId;
  thickness_mm: number;
}

export interface Geometry {
  length_m: number;
  width_m: number;
  height_m: number;
}

export interface WindowsConfig {
  /** effective glazed aperture area (count × w × h) */
  area_m2: number;
  U_W_m2K: number;
  SHGC: number;
  glazing_type: GlazingType;
  /** UI-only extras, ignored by the solver */
  count?: number;
  width_m?: number;
  height_m?: number;
}

export interface ShelterConfig {
  geometry: Geometry;
  /** ordered outer → inner */
  walls: Layer[];
  roof: Layer[];
  floor: Layer[];
  windows: WindowsConfig;
  contents: { mass_kg: number; specific_heat_J_kgK: number };
  heat_transfer: { h_inside_W_m2K: number; h_outside_W_m2K: number };
  air_changes_per_hour: number;
  ground_temperature_mode: GroundMode;
  ground_temperature_C: number;
  internal_heat_gain_W: number;
  initial_temperature_C: number;
}

// ---- analysis window / comfort (shared by both modes) --------------------

export interface AnalysisWindow {
  season: Season;
  typical_hours: number;
  worst_hours: number;
}

export interface ComfortSpec {
  target_C: number;
  band_lo_C: number;
  band_hi_C: number;
}

// ---- optimizer request (== run_pipeline.py optimize flags + CSVs) --------

export interface RatioConstraint {
  factor:
    | "aspect_ratio"
    | "av_ratio"
    | "wwr_percent"
    | "ceiling_height_m"
    | "floor_area_m2";
  min: number;
  max: number;
}

/**
 * The optimize flow. The user pins the box and the openings; the pipeline
 * designs everything else — wall/roof/floor materials + thicknesses,
 * insulation, and glazing type — and returns the best combination.
 */
export interface OptimizeSpec {
  designs: number;
  seed: number;
  trials: number;
  /** fixed envelope the user provides */
  geometry: Geometry;
  window_count: number;
  window_width_m: number;
  window_height_m: number;
  door_count: number;
  /** optional scenario applied uniformly to every candidate */
  internal_heat_gain_W?: number;
  air_changes_per_hour?: number;
  initial_temperature_C?: number;
  /** optional sourcing filter; omit / all = search the full palette */
  allowed_materials?: MaterialId[];
  run_ansys: boolean;
  ansys_hours: number;
  ansys_designs: number;
}

// ---- the thing the "Run" button submits --------------------------------

export type RunRequest =
  | {
      mode: "single";
      config: ShelterConfig;
      window: AnalysisWindow;
      comfort: ComfortSpec;
    }
  | {
      mode: "optimize";
      /** base envelope the generator perturbs around (optional) */
      base_config?: Partial<ShelterConfig>;
      window: AnalysisWindow;
      comfort: ComfortSpec;
      optimize: OptimizeSpec;
    };

// ---- run lifecycle (== runs/<id>/PIPELINE_STATUS.json) ------------------

export type StagePhase = "pending" | "running" | "ok" | "failed" | "skipped";

export interface StageStatus {
  stage: string;
  phase: StagePhase;
  note?: string;
}

export interface PipelineStatus {
  run_id: string;
  done: boolean;
  failed: boolean;
  stages: StageStatus[];
}

// ---- results (== the JSON blob from GET /api/run/<id>/results) ----------

export interface ResolvedProperties {
  U_wall_W_m2K: number;
  U_roof_W_m2K: number;
  U_floor_W_m2K: number;
  C_total_MJ_per_K: number;
  infiltration_UA_W_K: number;
  envelope_mass_t: number;
}

/** DRDO Output 1 */
export interface TemperatureResult {
  hours: number;
  T_min_C: number;
  T_max_C: number;
  T_mean_C: number;
  T_median_C: number;
  T_final_C: number;
  outdoor_min_C: number;
  outdoor_max_C: number;
  /** hourly series for the chart */
  series: { t_hours: number[]; indoor_C: number[]; outdoor_C: number[] };
}

/** DRDO Output 2 */
export interface SolarResult {
  total_energy_Wh: number;
  total_energy_MJ: number;
  peak_irradiance_W_m2: number;
  peak_gain_W: number;
  avg_irradiance_W_m2: number;
  capacity_factor_percent: number;
  solar_temp_correlation: number;
  daily_MJ: number[];
  hourly_gain_kW: number[];
}

/** DRDO Output 3 */
export interface HeatFlowResult {
  total_heat_loss_Wh: number;
  peak_hourly_loss_W: number;
  avg_hourly_loss_W: number;
  peak_temp_difference_C: number;
  avg_temp_difference_C: number;
  split_percent: {
    wall: number;
    roof: number;
    floor: number;
    window: number;
    infiltration: number;
  };
  /** per-hour loss by path (W), for the stacked chart */
  hourly_by_path: {
    wall: number[];
    roof: number[];
    floor: number[];
    window: number[];
    infiltration: number[];
  };
}

/** how close the free-running shelter sits to the comfort target */
export interface ComfortResult {
  target_C: number;
  band_lo_C: number;
  band_hi_C: number;
  hours_in_band_pct: number;
  hours_below_band_pct: number;
  hours_above_band_pct: number;
  frost_free_pct: number; // % hours indoor > 0 °C
  comfort_score: number;
}

/** supplemental-heat demand to hold the comfort band, and its fuel cost */
export interface HeatingResult {
  demand_kWh_per_day: number;
  demand_kWh_total: number;
  fuel_litres_per_day: number; // kerosene equivalent
  fuel_note: string;
}

/** one-line "what this means" derived facts for the plain-language panel */
export interface Highlight {
  key: "frost" | "solar" | "air" | "stability" | "mass";
  title: string;
  value: string;
}

/** echo of the design that was actually simulated (for the results recap) */
export interface ConfigEcho {
  footprint_label: string; // "6.0 × 4.0 m (24.0 m²)"
  wall_label: string;
  roof_label: string;
  floor_label: string;
  glazing_label: string;
  air_changes_per_hour: number;
  internal_gain_W: number;
}

export interface FeatureReports {
  temperature: TemperatureResult;
  solar: SolarResult;
  heatflow: HeatFlowResult;
}

export interface RankedDesign {
  rank: number;
  design_id: number;
  comfort_score: number;
  geometry_label: string; // "6.6×3.69×2.86"
  av_ratio: number;
  wwr_percent: number;
  /** the material combination this candidate uses (pipeline's choice) */
  walls_label?: string; // "puf (90 mm) + stone_masonry (400 mm)"
  roof_label?: string;
  floor_label?: string;
  T_min_C: number;
  T_max_C: number;
  swing_C: number;
  hours_in_band_pct: number;
  shortlisted: boolean;
  pareto: boolean;
}

export interface ReliabilityResult {
  verdict: string;
  shortlist_ids: number[];
  pareto_ids: number[];
  top3_stable_across_weather: boolean;
  sensitivity: { design_id: number; top3_pct: number }[];
  pareto_points: { design_id: number; swing_C: number; T_min_C: number; pareto: boolean }[];
}

export interface AnsysRow {
  design_id: number;
  RC_Tmin_C: number;
  ANSYS_Tmin_C: number;
  RC_Tmean_C: number;
  ANSYS_Tmean_C: number;
  RC_Tmax_C: number;
  ANSYS_Tmax_C: number;
  MAE_C: number;
  RMSE_C: number;
  RC_rank: number;
  ANSYS_rank: number;
}

/** per-hour RC vs ANSYS indoor-temperature series, for the overlay chart */
export interface AnsysSeries {
  t_hours: number[];
  outdoor_C: number[];
  designs: { design_id: number; rc_C: number[]; ansys_C: number[] }[];
}

export interface AnsysResult {
  ran: boolean;
  rows: AnsysRow[];
  rankings_agree: boolean;
  mean_offset_C: number;
  worst_mae_C: number;
  contour_url?: string;
  series?: AnsysSeries | null;
}

export interface LogisticsRow {
  design_id: number;
  envelope_mass_t: number;
  material_cost_lakh_inr: number;
  transportability_1to5: number;
}

export interface Recommendation {
  chosen_design_id: number | string;
  runner_up_id: number | string | null;
  thermal_tie: boolean;
  justification: string;
  chosen: {
    geometry_label: string;
    walls_label: string;
    roof_label: string;
    floor_label: string;
    windows_label: string;
    comfort_score: number;
    T_min_C: number;
    envelope_mass_t: number;
  };
}

export interface RunResults {
  run_id: string;
  mode: "single" | "optimize";
  window: { typical_hours: number; worst_hours: number; typical_mean_C: number; worst_min_C: number };
  resolved: ResolvedProperties;
  features: FeatureReports;
  comfort: ComfortResult;
  heating: HeatingResult;
  highlights: Highlight[];
  config_echo: ConfigEcho;
  /** optimize-only */
  comparison?: RankedDesign[];
  reliability?: ReliabilityResult;
  recommendation?: Recommendation;
  logistics?: LogisticsRow[];
  ansys?: AnsysResult;
  report_md_url: string;
}

// ---- reference data (GET /api/reference/*) -----------------------------

export interface MaterialProps {
  id: MaterialId;
  display_name: string;
  thermal_conductivity: number;
  density: number;
  specific_heat: number;
}

export interface GlazingProps {
  id: GlazingType;
  U_W_m2K: number;
  SHGC: number;
}

export interface ReferenceData {
  materials: MaterialProps[];
  glazing: GlazingProps[];
  ratio_constraints: RatioConstraint[];
}
