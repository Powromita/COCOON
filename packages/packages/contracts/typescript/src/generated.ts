/*
 * AUTO-GENERATED FILE -- DO NOT EDIT DIRECTLY.
 * Generated from JSON Schemas (Draft 2020-12) via json-schema-to-typescript.
 * Canonical persisted source: packages/contracts/jsonschema/*.schema.json
 */

export const SCHEMA_VERSION = '4.0' as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

/**
 * Terminal or active execution status
 */
export type AnsysJobStatus =
  | 'NOT_REQUESTED'
  | 'QUEUED'
  | 'PREPARING'
  | 'MESHING'
  | 'SOLVING'
  | 'EXPORTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'UNAVAILABLE';
/**
 * Structural component type
 */
export type AssemblyCategory = 'wall' | 'roof' | 'floor' | 'ceiling' | 'partition';
/**
 * Nature of interaction between zones
 */
export type ZoneConnectionType = 'door' | 'partition' | 'stair' | 'airflow' | 'virtual';
/**
 * Category of opening (window or door)
 */
export type OpeningType = 'window' | 'door';
/**
 * Origin source of this design
 */
export type BuildingSource = 'generated' | 'user_defined' | 'benchmark' | 'retrofit';
/**
 * Boundary condition on far side
 */
export type SurfaceBoundaryType = 'outdoors' | 'ground' | 'adjacent_zone' | 'adiabatic';
/**
 * Architectural surface category
 */
export type SurfaceType = 'exterior_wall' | 'partition' | 'roof' | 'floor' | 'ceiling';
/**
 * Scenario category (low, expected, high)
 */
export type CostScenario = 'low' | 'expected' | 'high';
/**
 * Machine-readable error code from standardized ErrorCode enum
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'SCHEMA_VERSION_MISMATCH'
  | 'ZONE_GEOMETRY_INVALID'
  | 'DUPLICATE_ID'
  | 'MISSING_REFERENCE'
  | 'UNSUPPORTED_MATERIAL'
  | 'DATETIME_NOT_TIMEZONE_AWARE'
  | 'WEATHER_GAP_TOO_LARGE'
  | 'ANSYS_JOB_FAILED'
  | 'ANSYS_UNAVAILABLE'
  | 'DESIGN_OUTSIDE_ML_COVERAGE'
  | 'CROSS_REVISION_MISMATCH'
  | 'INVALID_LIFECYCLE_RANGE'
  | 'RC_ANSYS_CONFLATION_FORBIDDEN';
/**
 * Operational mode
 */
export type ProjectMode =
  'new_shelter' | 'existing_shelter' | 'engineering_optimization' | 'reference_benchmark';
/**
 * Operational project mode
 */
export type ProjectMode1 =
  'new_shelter' | 'existing_shelter' | 'engineering_optimization' | 'reference_benchmark';
/**
 * Explicit operational HVAC simulation mode required by PRD Section 10.12
 */
export type SimulationEngineMode =
  'free_floating' | 'ideal_load_conditioned' | 'capacity_limited_conditioned';
/**
 * Operational HVAC simulation mode; accepts specific solver mode or 'conditioned' per PRD §22.1
 */
export type SimulationOutputEngineMode =
  'free_floating' | 'ideal_load_conditioned' | 'capacity_limited_conditioned' | 'conditioned';
/**
 * Exact recommendation provenance states mandated by PRD Section 22.2.
 * Must accurately reflect evidence backing the candidate design.
 */
export type RecommendationState =
  | 'SCREENED_BY_ML'
  | 'VERIFIED_BY_RC'
  | 'VALIDATED_BY_ANSYS'
  | 'RC_ONLY_ANSYS_NOT_REQUESTED'
  | 'RC_ONLY_ANSYS_UNAVAILABLE'
  | 'REFERENCE_BENCHMARK';
/**
 * Execution outcome status
 */
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
/**
 * Data source driving the visual representation
 */
export type VisualizationSource = 'geometry' | 'rc' | 'ansys';

/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: AnsysJobRequest in cocoon_contracts. Submitted job package for independent finite element thermal validation.
 */
export interface AnsysJobRequest {
  /**
   * Immutable design revision ID (rev_...)
   */
  design_revision_id: string;
  /**
   * Integrity guard asserting that RC indoor temperatures are never prescribed as boundary loads
   */
  imposed_indoor_temp_forbidden?: boolean;
  /**
   * Hashes of frozen input files forming this package
   */
  input_hashes: {
    [k: string]: string;
  };
  /**
   * Unique ANSYS job identifier starting with 'ans_'
   */
  job_id: string;
  /**
   * Scheduling priority tier (0=normal, 1=high)
   */
  priority?: number;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  solver_config: AnsysSolverConfig;
  /**
   * Job submission timestamp
   */
  submitted_at: string;
  /**
   * Immutable weather snapshot ID (wx_...)
   */
  weather_snapshot_id: string;
}
/**
 * Solver meshing and stepping configuration
 */
export interface AnsysSolverConfig {
  /**
   * Global element mesh size (m)
   */
  element_size_m?: number;
  /**
   * ANSYS thermal element formulation (e.g. SOLID70, SOLID90)
   */
  element_type?: string;
  /**
   * Maximum substeps per transient hour
   */
  substeps_max?: number;
  /**
   * Minimum substeps per transient hour
   */
  substeps_min?: number;
  /**
   * Execution timeout limit in seconds
   */
  timeout_seconds?: number;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: AnsysValidationResult in cocoon_contracts. Outcome and comparison package produced by the ANSYS validation worker.
 */
export interface AnsysValidationResult {
  /**
   * Rendered PNGs, series CSVs, and logs
   */
  artifacts?: AnsysArtifactManifest | null;
  /**
   * Completion timestamp
   */
  completed_at?: string | null;
  /**
   * Target design revision ID (rev_...)
   */
  design_revision_id: string;
  /**
   * Explanation if job failed, cancelled, or unavailable
   */
  error_reason?: string | null;
  /**
   * ANSYS job identifier starting with 'ans_'
   */
  job_id: string;
  /**
   * Comparison metrics against RC
   */
  metrics?: AnsysComparisonMetrics | null;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  /**
   * Mesh nodes/elements and solver log stats
   */
  solver_summary?: {
    [k: string]: unknown;
  } | null;
  /**
   * Worker pickup timestamp
   */
  started_at?: string | null;
  status: AnsysJobStatus;
}
/**
 * Catalog and cryptographic hashes of files generated by an ANSYS run.
 */
export interface AnsysArtifactManifest {
  /**
   * Map of artifact logical name to relative file path or URI
   */
  artifacts: {
    [k: string]: string;
  };
  /**
   * SHA-256 hashes of generated artifacts
   */
  checksums_sha256: {
    [k: string]: string;
  };
}
/**
 * Statistical agreement metrics comparing independent RC and ANSYS thermal results.
 */
export interface AnsysComparisonMetrics {
  /**
   * Mean signed bias (ANSYS - RC) in °C
   */
  bias_c?: number | null;
  /**
   * Mean Absolute Error in °C
   */
  mae_c?: number | null;
  /**
   * Maximum Absolute Error in °C
   */
  max_abs_error_c?: number | null;
  /**
   * Coefficient of determination [0..1]
   */
  r_squared?: number | null;
  /**
   * Root Mean Squared Error in °C
   */
  rmse_c?: number | null;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: BuildingModel in cocoon_contracts. Canonical complete building specification.
 * Contains floors, zones, boundaries, surfaces, openings, assemblies, and connections.
 */
export interface BuildingModel {
  /**
   * Referenced construction assemblies by assembly ID (explicit empty map allowed if none)
   */
  assemblies: {
    [k: string]: ConstructionAssembly;
  };
  /**
   * Inter-zone thermal/airflow connections (explicit empty array allowed if none)
   */
  connections: ZoneConnection[];
  /**
   * Design identifier starting with 'des_'
   */
  design_id: string;
  /**
   * List of floors with zones
   */
  floors: Floor[];
  metadata: BuildingMetadata;
  /**
   * Fenestrations and passages (explicit empty array allowed if none)
   */
  openings: Opening[];
  /**
   * Compass orientation of building main south facade [0..360]
   */
  orientation_deg?: number;
  /**
   * Immutable revision identifier starting with 'rev_'
   */
  revision_id: string;
  /**
   * Operational schedules embedded or referenced (explicit empty map allowed if none)
   */
  schedules: {
    [k: string]: Schedule;
  };
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  source: BuildingSource;
  /**
   * Opaque bounding surfaces (explicit empty array allowed if none)
   */
  surfaces: Surface[];
}
/**
 * Ordered stack of material layers forming an opaque construction.
 */
export interface ConstructionAssembly {
  category: AssemblyCategory;
  /**
   * Unique assembly identifier
   */
  id: string;
  /**
   * Layers ordered from inner to outer boundary
   */
  layers: AssemblyLayer[];
  /**
   * Human-readable assembly title
   */
  name: string;
  /**
   * Inside surface film resistance (m²·K)/W
   */
  r_inside_film_m2k_w?: number;
  /**
   * Outside surface film resistance (m²·K)/W
   */
  r_outside_film_m2k_w?: number;
  /**
   * Calculated overall U-value in W/(m²·K)
   */
  u_value_w_m2k?: number | null;
}
/**
 * One material layer within a multi-layer wall, roof, or floor assembly.
 */
export interface AssemblyLayer {
  /**
   * Reference material ID (mat_...)
   */
  material_id: string;
  /**
   * Layer thickness in millimeters
   */
  thickness_mm: number;
}
/**
 * Thermal link or airflow path connecting two zones.
 */
export interface ZoneConnection {
  connection_type: ZoneConnectionType;
  /**
   * Unique connection ID
   */
  id: string;
  /**
   * Whether interface allows active or passive airflow
   */
  is_conditioned?: boolean;
  /**
   * Contact interface area in m²
   */
  shared_area_m2?: number;
  /**
   * First zone ID
   */
  zone_a_id: string;
  /**
   * Second zone ID
   */
  zone_b_id: string;
}
/**
 * Horizontal storey grouping zones at a common level.
 */
export interface Floor {
  /**
   * Vertical elevation of finished floor above datum (m)
   */
  elevation_m?: number;
  /**
   * Floor level identifier (e.g. 'floor_0', 'floor_1')
   */
  id: string;
  /**
   * Zero-indexed vertical floor index (0 for ground floor)
   */
  level: number;
  /**
   * Thermal zones on this floor
   */
  zones: Zone[];
}
/**
 * Individual room or thermal space with a single lumped temperature node.
 */
export interface Zone {
  /**
   * Reference to equipment heat schedule
   */
  equipment_schedule_id?: string | null;
  /**
   * Optional HVAC or heater device reference
   */
  hvac_id?: string | null;
  /**
   * Unique zone identifier within the building
   */
  id: string;
  /**
   * Reference to occupancy schedule
   */
  occupancy_schedule_id?: string | null;
  origin_m: Vector3D;
  size_m: ZoneSize;
  /**
   * Room purpose (e.g. 'airlock', 'living', 'sleeping', 'equipment', 'storage')
   */
  type: string;
}
/**
 * Origin coordinates (local bottom-south-west corner) in meters
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}
/**
 * Rectangular zone dimensions in meters
 */
export interface ZoneSize {
  /**
   * Floor-to-ceiling vertical height (m)
   */
  height_m: number;
  /**
   * Zone dimension along primary local X-axis (m)
   */
  length_m: number;
  /**
   * Zone dimension along local Y-axis (m)
   */
  width_m: number;
}
/**
 * Design generation metadata
 */
export interface BuildingMetadata {
  /**
   * Timezone-aware creation timestamp
   */
  created_at: string;
  /**
   * Layout generator version
   */
  generator_version?: string | null;
  /**
   * Random seed used for deterministic reproduction
   */
  seed?: number | null;
}
/**
 * Window or door embedded in a parent surface.
 */
export interface Opening {
  /**
   * Opening net area in m²
   */
  area_m2: number;
  /**
   * Average duration of each open event (seconds)
   */
  avg_open_duration_s?: number | null;
  /**
   * Adjacent zone or 'outdoors' for doors
   */
  connected_boundary?: string | null;
  /**
   * Airflow orifice discharge coefficient
   */
  discharge_coefficient?: number | null;
  /**
   * Fraction of area occupied by frame
   */
  frame_fraction?: number | null;
  /**
   * Reference to glazing profile
   */
  glazing_id?: string | null;
  /**
   * Unique opening identifier
   */
  id: string;
  /**
   * Whether opening can be opened for ventilation
   */
  is_operable?: boolean | null;
  /**
   * Frequency of opening operations per hour
   */
  open_events_per_hour?: number | null;
  opening_type: OpeningType;
  /**
   * Owning parent surface ID
   */
  parent_surface_id: string;
  /**
   * External shading factor [0..1]
   */
  shading_factor?: number | null;
  /**
   * Solar Heat Gain Coefficient (windows)
   */
  shgc?: number | null;
  /**
   * Overall thermal transmittance in W/(m²·K)
   */
  u_value_w_m2k: number;
}
/**
 * Explicit operational profile for occupancy, equipment, door openings, or setpoints.
 */
export interface Schedule {
  /**
   * Optional repeating 24-hour profile normalized to daily hours [0..23]
   */
  hourly_values?: number[] | null;
  /**
   * Unique schedule identifier
   */
  id: string;
  /**
   * Descriptive schedule name
   */
  name: string;
  /**
   * Explicit timestamp-value pairs
   */
  points?: SchedulePoint[];
  /**
   * Schedule category (e.g., 'occupancy', 'equipment', 'door', 'hvac')
   */
  type: string;
  /**
   * Unit of measurement for schedule values
   */
  unit?: string | null;
}
/**
 * A discrete timestamped value in an operational schedule.
 */
export interface SchedulePoint {
  /**
   * Timezone-aware timestamp for the scheduled value
   */
  timestamp: string;
  /**
   * Scalar schedule value (e.g. occupants count, W equipment gain, etc.)
   */
  value: number;
}
/**
 * Planar envelope or partition element bounding a thermal zone.
 */
export interface Surface {
  /**
   * Opposing surface ID if paired
   */
  adjacent_surface_id?: string | null;
  /**
   * Neighboring zone ID if internal partition/floor
   */
  adjacent_zone_id?: string | null;
  /**
   * Gross surface area in m²
   */
  area_m2: number;
  /**
   * Reference to construction assembly ID
   */
  assembly_id: string;
  /**
   * Orientation angle (0=North, 90=East, 180=South, 270=West)
   */
  azimuth_deg: number;
  boundary_type: SurfaceBoundaryType;
  /**
   * Fraction exposed to ambient weather/sun [0..1]
   */
  exposed_fraction?: number;
  /**
   * Unique surface identifier
   */
  id: string;
  /**
   * Zone containing this surface
   */
  owning_zone_id: string;
  surface_type: SurfaceType;
  /**
   * Surface tilt (0=flat roof pointing up, 90=vertical wall, 180=floor pointing down)
   */
  tilt_deg: number;
  /**
   * Optional 3D polygon perimeter vertices
   */
  vertices?: Vector3D1[] | null;
}
/**
 * 3-dimensional Cartesian coordinate or dimension vector in meters.
 */
export interface Vector3D1 {
  x: number;
  y: number;
  z: number;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: EconomicAnalysisResult in cocoon_contracts. Complete lifecycle cost (LCC) evaluation result contract.
 */
export interface EconomicAnalysisResult {
  /**
   * Economic run identifier starting with 'econ_'
   */
  analysis_id: string;
  /**
   * Year-by-year cash flow projections
   */
  annual_cash_flows: AnnualOpexPoint[];
  /**
   * Predicted annual heating fuel consumption in liters
   */
  annual_fuel_litres: number;
  /**
   * Reference ID of assumptions applied (econ_...)
   */
  assumption_set_id: string;
  /**
   * Calendar year in which cumulative savings turn positive
   */
  break_even_year?: number | null;
  capex: CapexBreakdown;
  /**
   * Timestamp of economic calculation
   */
  created_at: string;
  /**
   * Target design revision ID (rev_...)
   */
  design_revision_id: string;
  /**
   * Discounted payback duration in years
   */
  discounted_payback_years?: number | null;
  /**
   * Total discounted Lifecycle Cost (CAPEX + NPV of OPEX)
   */
  lcc_inr: number;
  /**
   * Net Present Value savings compared to baseline
   */
  npv_vs_baseline_inr?: number | null;
  scenario: CostScenario;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  /**
   * Undiscounted payback duration in years
   */
  simple_payback_years?: number | null;
}
/**
 * Single-year cash outflow during shelter operational lifetime.
 */
export interface AnnualOpexPoint {
  /**
   * Present-value discounted cash outflow
   */
  discounted_opex_inr: number;
  /**
   * Fuel consumption expense in nominal INR
   */
  fuel_cost_inr: number;
  /**
   * Ongoing fuel delivery and transport surcharge
   */
  logistics_cost_inr?: number;
  /**
   * Routine servicing expenditure
   */
  maintenance_cost_inr: number;
  /**
   * Scheduled component overhaul/replacement
   */
  replacement_cost_inr?: number;
  /**
   * Total undiscounted operating expenditure for this year
   */
  total_opex_inr: number;
  /**
   * Operation year index (1..N)
   */
  year: number;
}
/**
 * Initial investment breakdown
 */
export interface CapexBreakdown {
  /**
   * HVAC, heater, and control hardware purchase
   */
  equipment_inr: number;
  /**
   * On-site fabrication and assembly labor
   */
  labour_inr: number;
  /**
   * Envelope and structural materials cost
   */
  materials_inr: number;
  /**
   * Total capital cost (sum of categories)
   */
  total_capex_inr: number;
  /**
   * Haulage and logistics freight expenditure
   */
  transport_inr: number;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: ErrorEnvelope in cocoon_contracts. Standard top-level error response envelope for all COCOON APIs and services.
 */
export interface ErrorEnvelope {
  error: ErrorDetail;
}
/**
 * Detailed structure describing an execution or validation failure.
 */
export interface ErrorDetail {
  code: ErrorCode;
  /**
   * Structured key-value context regarding the error cause
   */
  details?: {
    [k: string]: unknown;
  };
  /**
   * Human-readable explanation of the error
   */
  message: string;
  /**
   * Whether the operation can be retried without modification
   */
  retryable?: boolean;
  /**
   * Correlation or request trace UUID
   */
  trace_id: string;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: MaterialSnapshot in cocoon_contracts. Immutable collection of material records frozen for a specific simulation or analysis.
 */
export interface MaterialSnapshot {
  /**
   * SHA-256 integrity hash of materials collection
   */
  checksum_sha256: string;
  /**
   * Snapshot generation timestamp
   */
  created_at: string;
  /**
   * Dictionary mapping material ID to MaterialRecord
   */
  materials: {
    [k: string]: MaterialRecord;
  };
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  /**
   * Snapshot identifier starting with 'mat_'
   */
  snapshot_id: string;
}
/**
 * Standardized material entry with full provenance and validity boundaries.
 */
export interface MaterialRecord {
  /**
   * Material classification (e.g. 'insulation', 'masonry', 'finish', 'glazing')
   */
  category: string;
  /**
   * Human-readable material name
   */
  display_name: string;
  /**
   * Date when properties/prices were verified
   */
  effective_date: string;
  /**
   * Unique material ID with 'mat_' prefix
   */
  id: string;
  /**
   * Maximum operational temperature in °C
   */
  max_temperature_c?: number | null;
  /**
   * Minimum operational temperature in °C
   */
  min_temperature_c?: number | null;
  properties: MaterialThermalProperties;
  /**
   * Bibliographic or laboratory source (e.g. 'ASHRAE Fundamentals', 'DRDO Lab')
   */
  source_reference: string;
}
/**
 * Thermophysical attributes
 */
export interface MaterialThermalProperties {
  /**
   * Estimated unit cost per m² area (for standard sheet/panel)
   */
  cost_inr_per_m2?: number | null;
  /**
   * Estimated unit cost per m³ volume
   */
  cost_inr_per_m3?: number | null;
  /**
   * Material bulk density in kg/m³
   */
  density_kg_m3: number;
  /**
   * Thermal longwave emissivity [0..1]
   */
  emissivity?: number | null;
  /**
   * Solar shortwave absorptivity [0..1]
   */
  solar_absorptivity?: number | null;
  /**
   * Specific heat capacity in J/(kg·K)
   */
  specific_heat_j_kgk: number;
  /**
   * Thermal conductivity in W/(m·K)
   */
  thermal_conductivity_w_mk: number;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: Project in cocoon_contracts. Top-level project representation tracking mission lifecycle and active designs.
 */
export interface Project {
  /**
   * Currently selected design ID (des_...)
   */
  active_design_id?: string | null;
  /**
   * Project creation timestamp
   */
  created_at: string;
  /**
   * Detailed project objectives and operational notes
   */
  description?: string | null;
  mode: ProjectMode;
  /**
   * Human-readable project or deployment name
   */
  name: string;
  /**
   * Stable project UUID with 'prj_' prefix
   */
  project_id: string;
  requirements: RequirementsContract;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  site: SiteSpecification1;
  /**
   * Last modification timestamp
   */
  updated_at: string;
}
/**
 * Active mission requirements contract
 */
export interface RequirementsContract {
  constraints: DesignConstraints;
  /**
   * Reference ID of versioned economic assumption set (econ_...)
   */
  economic_assumption_set_id: string;
  mission: MissionRequirements;
  mode: ProjectMode1;
  /**
   * Project identifier (must start with 'prj_')
   */
  project_id: string;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  site: SiteSpecification;
}
/**
 * Boundary conditions and limits bounding automated layout generation.
 */
export interface DesignConstraints {
  /**
   * Material IDs permitted for envelope construction
   */
  available_material_ids?: string[];
  /**
   * Allowed heater fuel types (e.g. 'kerosene', 'electricity', 'solar_thermal')
   */
  heater_fuels?: string[];
  /**
   * Optional field assembly time target in hours
   */
  max_assembly_time_hours?: number | null;
  /**
   * Capital expenditure budget limit in INR
   */
  maximum_capex_inr?: number | null;
  /**
   * Maximum allowed floor count (1..5)
   */
  maximum_floors?: number | null;
  /**
   * Upper bound on shelter ground footprint in m²
   */
  maximum_footprint_m2?: number | null;
  /**
   * Optional logistics weight constraint in kg
   */
  maximum_mass_kg?: number | null;
  /**
   * Preferred longitudinal azimuth in degrees [0..360]
   */
  preferred_orientation_deg?: number | null;
}
/**
 * Functional occupancy, room type, and thermal comfort requirements.
 */
export interface MissionRequirements {
  /**
   * Allowable cumulative hours below target threshold
   */
  maximum_unmet_hours?: number;
  /**
   * Optional custom occupancy schedule ID
   */
  occupancy_schedule_id?: string | null;
  /**
   * Nominal occupant count
   */
  occupants: number;
  /**
   * List of room/zone types that must be accommodated
   */
  required_rooms: string[];
  /**
   * Desired indoor target temperature in °C
   */
  target_temperature_c?: number;
  /**
   * Mission category (e.g. 'living', 'sleeping', 'living_sleeping', 'medical', 'command')
   */
  type: string;
}
/**
 * Geographic, elevation, and temporal boundary parameters for a site.
 */
export interface SiteSpecification {
  /**
   * End timestamp for simulation window
   */
  analysis_end: string;
  /**
   * Start timestamp for simulation window
   */
  analysis_start: string;
  /**
   * Site elevation in meters above sea level
   */
  elevation_m: number;
  /**
   * Latitude in decimal degrees [-90..90]
   */
  latitude_deg: number;
  /**
   * Longitude in decimal degrees [-180..180]
   */
  longitude_deg: number;
  /**
   * IANA timezone identifier (e.g. 'Asia/Kolkata')
   */
  timezone: string;
  /**
   * Source identifier (e.g. 'NASA_POWER', 'ERA5', 'cached_file')
   */
  weather_source: string;
}
/**
 * Geographic, elevation, and temporal boundary parameters for a site.
 */
export interface SiteSpecification1 {
  /**
   * End timestamp for simulation window
   */
  analysis_end: string;
  /**
   * Start timestamp for simulation window
   */
  analysis_start: string;
  /**
   * Site elevation in meters above sea level
   */
  elevation_m: number;
  /**
   * Latitude in decimal degrees [-90..90]
   */
  latitude_deg: number;
  /**
   * Longitude in decimal degrees [-180..180]
   */
  longitude_deg: number;
  /**
   * IANA timezone identifier (e.g. 'Asia/Kolkata')
   */
  timezone: string;
  /**
   * Source identifier (e.g. 'NASA_POWER', 'ERA5', 'cached_file')
   */
  weather_source: string;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: RequirementsContract in cocoon_contracts. Complete requirement payload submitted to generate or evaluate shelter designs.
 */
export interface RequirementsContract1 {
  constraints: DesignConstraints;
  /**
   * Reference ID of versioned economic assumption set (econ_...)
   */
  economic_assumption_set_id: string;
  mission: MissionRequirements;
  mode: ProjectMode1;
  /**
   * Project identifier (must start with 'prj_')
   */
  project_id: string;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  site: SiteSpecification;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: SimulationRequest in cocoon_contracts. Request payload to execute a multi-zone physics simulation.
 */
export interface SimulationRequest {
  /**
   * Target design revision ID (rev_...)
   */
  design_revision_id: string;
  engine: SimulationRequestEngineMetadata;
  /**
   * Assumed ground contact temperature (°C)
   */
  ground_temperature_c?: number | null;
  /**
   * Uniform initial condition temperature (°C)
   */
  initial_temperature_c?: number;
  /**
   * Unique simulation request ID starting with 'sim_'
   */
  request_id: string;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  /**
   * Simulation end time
   */
  time_window_end: string;
  /**
   * Simulation start time
   */
  time_window_start: string;
  /**
   * Target weather snapshot ID (wx_...)
   */
  weather_snapshot_id: string;
}
/**
 * Solver engine settings with explicit solver mode
 */
export interface SimulationRequestEngineMetadata {
  mode: SimulationEngineMode;
  /**
   * Engine name (e.g. 'cocoon_multizone_rc')
   */
  name: string;
  /**
   * Internal integration timestep in seconds (e.g. 900)
   */
  timestep_seconds: number;
  /**
   * Engine semantic version (e.g. '1.0.0')
   */
  version: string;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: SimulationResult in cocoon_contracts. Complete simulation output contract matching PRD Section 22.1.
 */
export interface SimulationResult {
  /**
   * Design revision evaluated (rev_...)
   */
  design_revision_id: string;
  engine: EngineMetadata;
  provenance: SimulationProvenance;
  /**
   * Official recommendation truth state
   */
  recommendation_state?: RecommendationState | null;
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  /**
   * Simulation identifier starting with 'sim_'
   */
  simulation_id: string;
  status: SimulationStatus;
  /**
   * Building-level performance summary
   */
  summary?: SimulationSummary | null;
  /**
   * Optional detailed hourly timeseries
   */
  time_series?: TimeSeriesPoint[] | null;
  /**
   * Per-zone thermal metrics (explicit empty array allowed if none)
   */
  zones: ZoneSummary[];
}
/**
 * Solver engine parameters used
 */
export interface EngineMetadata {
  mode: SimulationOutputEngineMode;
  /**
   * Engine name (e.g. 'cocoon_multizone_rc')
   */
  name: string;
  /**
   * Internal integration timestep in seconds (e.g. 900)
   */
  timestep_seconds: number;
  /**
   * Engine semantic version (e.g. '1.0.0')
   */
  version: string;
}
/**
 * Execution lineage and audit info
 */
export interface SimulationProvenance {
  /**
   * Git commit hash of physics engine
   */
  code_commit: string;
  /**
   * Run execution timestamp
   */
  created_at: string;
  /**
   * Material database version
   */
  material_version: string;
  /**
   * Weather dataset ID (wx_...)
   */
  weather_snapshot_id: string;
}
/**
 * Building-level aggregated thermal and energy balance metrics.
 */
export interface SimulationSummary {
  /**
   * Measured heat retention improvement compared to matched unbuffered baseline (%)
   */
  airlock_benefit_vs_baseline_pct?: number | null;
  /**
   * Worst-case energy balance residual percentage
   */
  energy_residual_max_pct: number;
  /**
   * Total thermal energy required for conditioning (kWh)
   */
  heating_energy_kwh: number;
  /**
   * Hours occupied zones remained in thermal comfort
   */
  occupied_comfort_hours: number;
  /**
   * Maximum instantaneous heating demand (kW)
   */
  peak_heating_kw: number;
  /**
   * Total unmet heating hours across occupied zones
   */
  unmet_hours: number;
}
/**
 * Timestamped snapshot of zone temperatures and thermal heat flows.
 */
export interface TimeSeriesPoint {
  /**
   * Outdoor ambient temperature (°C)
   */
  ambient_temperature_c: number;
  /**
   * Instantaneous energy conservation residual (W)
   */
  energy_residual_w?: number;
  /**
   * HVAC heating power injected into each zone (W)
   */
  heating_power_w?: {
    [k: string]: number;
  };
  /**
   * Solar radiant heat gain into each zone (W)
   */
  solar_gain_w?: {
    [k: string]: number;
  };
  /**
   * Simulation timestep timestamp
   */
  timestamp: string;
  /**
   * Mean air temperature by zone ID (°C)
   */
  zone_temperatures_c: {
    [k: string]: number;
  };
}
/**
 * Aggregated thermal performance metrics for an individual room/zone.
 */
export interface ZoneSummary {
  /**
   * Cumulative hours within specified comfort envelope
   */
  comfort_hours: number;
  /**
   * Peak heating capacity required (kW)
   */
  peak_heating_kw?: number | null;
  /**
   * Peak predicted temperature (°C)
   */
  temperature_max_c: number;
  /**
   * Time-weighted mean temperature (°C)
   */
  temperature_mean_c: number;
  /**
   * Minimum predicted temperature (°C)
   */
  temperature_min_c: number;
  /**
   * Cumulative hours below target setpoint
   */
  unmet_hours?: number | null;
  /**
   * Zone ID matching BuildingModel
   */
  zone_id: string;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: VisualizationModel in cocoon_contracts. Complete 3D visual scene consumed identically by web and mobile viewers.
 */
export interface VisualizationModel {
  /**
   * 3D rectangular volume blocks (explicit empty array allowed if none)
   */
  boxes: MeshBox[];
  /**
   * Pre-rendered FEM contour snapshots if available
   */
  contour_artifacts?: ContourArtifactRef[] | null;
  /**
   * Target design revision ID (rev_...)
   */
  design_revision_id: string;
  /**
   * Visual model creation timestamp
   */
  generated_at: string;
  /**
   * Visualization model identifier starting with 'viz_'
   */
  model_id: string;
  /**
   * Glazing and door visual penetrations (explicit empty array allowed if none)
   */
  openings: OpeningVisual[];
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  source: VisualizationSource;
  /**
   * Explicit polygon boundary surfaces (explicit empty array allowed if none)
   */
  surfaces: SurfaceVisual[];
  /**
   * Thermal timeseries for interactive slider playback
   */
  temperature_series?: ZoneTemperatureSeries[] | null;
}
/**
 * Axis-aligned geometric box representation of a room or envelope wall.
 */
export interface MeshBox {
  /**
   * Floor index for layer toggling
   */
  floor_level?: number;
  /**
   * Unique mesh box identifier
   */
  id: string;
  /**
   * Optional material styling ID (mat_...)
   */
  material_id?: string | null;
  /**
   * Display label (e.g. 'Zone: living', 'South Wall')
   */
  name: string;
  origin_m: Vector3D2;
  size_m: Vector3D3;
  /**
   * Owning thermal zone ID if applicable
   */
  zone_id?: string | null;
}
/**
 * 3-dimensional Cartesian coordinate or dimension vector in meters.
 */
export interface Vector3D2 {
  x: number;
  y: number;
  z: number;
}
/**
 * 3-dimensional Cartesian coordinate or dimension vector in meters.
 */
export interface Vector3D3 {
  x: number;
  y: number;
  z: number;
}
/**
 * Reference to an exported ANSYS or FEA 2D contour map frame.
 */
export interface ContourArtifactRef {
  /**
   * Human-readable descriptive caption
   */
  caption: string;
  /**
   * Relative path or asset URI to rendered contour PNG
   */
  image_path: string;
  /**
   * Simulation hour or substep index
   */
  step_number: number;
  /**
   * Associated observation timestamp
   */
  timestamp: string;
}
/**
 * Window or door cutout overlay positioned on a parent surface.
 */
export interface OpeningVisual {
  /**
   * Unique opening visual identifier
   */
  id: string;
  /**
   * Opening classification ('window' or 'door')
   */
  opening_type: string;
  /**
   * Owning surface visual ID
   */
  parent_surface_id: string;
  position_m: Vector3D4;
  size_m: Vector3D5;
}
/**
 * 3-dimensional Cartesian coordinate or dimension vector in meters.
 */
export interface Vector3D4 {
  x: number;
  y: number;
  z: number;
}
/**
 * 3-dimensional Cartesian coordinate or dimension vector in meters.
 */
export interface Vector3D5 {
  x: number;
  y: number;
  z: number;
}
/**
 * Polygonal surface facet for 3D rendering and raycast selection.
 */
export interface SurfaceVisual {
  /**
   * Boundary condition ('outdoors', 'ground', 'adjacent_zone')
   */
  boundary_type: string;
  /**
   * Unique visual facet identifier
   */
  id: string;
  /**
   * Whether surface faces outdoor ambient weather
   */
  is_exterior?: boolean;
  normal?: Vector3D6;
  /**
   * Reference ID of parent MeshBox
   */
  parent_mesh_id: string;
  /**
   * Surface category ('wall', 'roof', 'floor', 'partition')
   */
  surface_type: string;
  /**
   * Perimeter corner coordinates (m)
   */
  vertices?: Vector3D1[];
}
/**
 * 3-dimensional Cartesian coordinate or dimension vector in meters.
 */
export interface Vector3D6 {
  x: number;
  y: number;
  z: number;
}
/**
 * Synchronized timeseries associating temperature colors with 3D zones.
 */
export interface ZoneTemperatureSeries {
  /**
   * Calculated air temperatures (°C)
   */
  temperatures_c: number[];
  /**
   * Series timestamps corresponding to temperature points
   */
  timestamps: string[];
  /**
   * Target zone identifier
   */
  zone_id: string;
}
/**
 * AUTO-GENERATED: DO NOT EDIT DIRECTLY. Canonical source: WeatherSnapshot in cocoon_contracts. Frozen, immutable hourly weather dataset used for thermal simulations.
 */
export interface WeatherSnapshot {
  /**
   * Integrity hash for the dataset
   */
  checksum_sha256: string;
  /**
   * Sequence of hourly weather points
   */
  hourly_data: HourlyWeatherPoint[];
  /**
   * Records of any filled data gaps
   */
  interpolations?: GapInterpolationRecord[];
  /**
   * Contract schema version, strictly '4.0'
   */
  schema_version: '4.0';
  /**
   * Weather snapshot identifier starting with 'wx_'
   */
  snapshot_id: string;
  source: WeatherSourceMetadata;
}
/**
 * Hourly meteorological observation point.
 */
export interface HourlyWeatherPoint {
  /**
   * Cloud coverage fraction [0..100]
   */
  cloud_cover_pct?: number | null;
  /**
   * Diffuse horizontal irradiance in W/m²
   */
  dhi_w_m2?: number | null;
  /**
   * Direct normal irradiance in W/m²
   */
  dni_w_m2?: number | null;
  /**
   * Global horizontal irradiance in W/m²
   */
  ghi_w_m2: number;
  /**
   * Dry-bulb air temperature in °C
   */
  outdoor_dry_bulb_temperature_c: number;
  /**
   * Relative humidity percentage [0..100]
   */
  relative_humidity_pct?: number;
  /**
   * Observation timestamp with timezone
   */
  timestamp: string;
  /**
   * Wind compass direction [0..360]
   */
  wind_direction_deg?: number | null;
  /**
   * Wind speed in m/s
   */
  wind_speed_m_s?: number;
}
/**
 * Audit log of missing weather data interpolated during processing.
 */
export interface GapInterpolationRecord {
  end_time: string;
  interpolated_fields: string[];
  /**
   * Interpolation method used (e.g. 'linear', 'clamped_spline')
   */
  method: string;
  start_time: string;
}
/**
 * Origin and location metadata
 */
export interface WeatherSourceMetadata {
  /**
   * Site elevation in meters
   */
  elevation_m: number;
  /**
   * Timestamp when data was fetched or generated
   */
  fetch_date: string;
  /**
   * Whether data was loaded from local offline cache
   */
  is_cached?: boolean;
  /**
   * Site latitude [-90..90]
   */
  latitude_deg: number;
  /**
   * Named geographical site (e.g. 'Leh_Ladakh')
   */
  location_name: string;
  /**
   * Site longitude [-180..180]
   */
  longitude_deg: number;
  /**
   * Origin repository (e.g. 'NASA_POWER', 'ERA5', 'IMD', 'cached_file')
   */
  source_name: string;
  /**
   * IANA timezone identifier
   */
  time_zone: string;
}
