/**
 * Thin client for the COCOON backend (backend/routes/pipeline.py — the M2-M7 API surface).
 * Base URL comes from NEXT_PUBLIC_API_BASE (see frontend/.env.local); defaults to local dev.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
export const LATEST_OPTIMIZATION_STORAGE_KEY = "cocoon.optimizations.latest";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message ?? `Request to ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export type OptimizationStatus = {
  optimization_id: string;
  status: "queued" | "running" | "completed" | "failed";
  phase?: string;
  phase_message?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  recommended_design_id?: string | null;
  validation?: { state: string; [k: string]: unknown };
  summary?: { generated: number; on_front: number; dominated: number };
  timings_s?: Record<string, number>;
  error?: { code: string; message: string };
  result?: {
    run_id: string;
    recommended_design_id: string | null;
    validation: Record<string, unknown>;
    weather_snapshot_id: string;
    site_used: Record<string, unknown>;
    optimization: {
      outcomes: CandidateOutcome[];
      picks: { picks: Record<string, unknown> };
      pareto: unknown;
      summary: { generated: number; on_front: number; dominated: number };
    };
  };
};

export type OptimizationListItem = {
  optimization_id: string;
  project_id?: string | null;
  status: "queued" | "running" | "completed" | "failed";
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  count?: number | null;
  recommended_design_id?: string | null;
  validation?: { state: string; [k: string]: unknown } | null;
  summary?: Record<string, number> | null;
  has_report: boolean;
};
export type ProjectSummary = {
  project_id: string;
  name?: string | null;
  project_name?: string | null;
  optimization_id: string;
  status: "queued" | "running" | "completed" | "failed";
  phase?: string | null;
  phase_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  finished_at?: string | null;
  candidate_count?: number | null;
  recommended_design_id?: string | null;
  validation?: { state?: string; [k: string]: unknown } | null;
  has_report: boolean;
  site: { latitude_deg?: number | null; longitude_deg?: number | null; elevation_m?: number | null };
  mission: { type?: string | null; occupants?: number | null; target_temperature_c?: number | null };
  design: { template?: string | null; floors?: number | null; materials: string[] };
};
export type CandidateOutcome = {
  design_id: string;
  revision_id: string;
  status: "selected" | "on_front" | "dominated" | "rejected" | "screened_out_by_fast_rc";
  picked_as: string[];
  recommendation_state: string;
  objectives: {
    unmet_hours: number;
    cold_degree_hours: number;
    overheating_degree_hours: number;
    temperature_swing_c: number;
    heating_energy_kwh: number;
    peak_heating_kw: number;
    capex_inr: number;
    lcc_inr: number;
    mass_kg: number;
    reliability: number;
    occupied_comfort_hours: number;
    passive_min_temperature_c: number;
    passive_median_temperature_c: number;
  };
};

export type FinalReport = {
  recommendation: { design_id: string; recommendation_state: string; picked_as: string[]; why: { sentence: string }[] };
  design: {
    design_id: string;
    orientation_deg: number;
    template: string;
    glazing: string;
    airtightness_class: string;
    air_changes_per_hour: number;
    floors: number;
    zones: { id: string; type: string; floor: number; size_m: { length_m: number; width_m: number; height_m: number }; heated: boolean }[];
    assemblies: { id: string; name: string; used_for: string[]; u_value_w_m2k: number; layers_inner_to_outer: { material: string; name: string; thickness_mm: number }[] }[];
    quantities: Record<string, unknown> | null;
    heater_plan?: { capacity_kw_each: number; fuel?: string | null; zone_ids: string[] } | null;
  };
  performance: {
    conditioned_with_sized_heater: { summary: Record<string, number> };
    free_floating: { summary: Record<string, number> | null };
    objectives: CandidateOutcome["objectives"];
  };
  economics: {
    currency: string;
    scenarios: Record<string, {
      capex: { materials_inr: number; labour_inr: number; transport_inr: number; equipment_inr: number; total_capex_inr: number };
      lcc_inr: number; annual_fuel_litres: number; npv_vs_baseline_inr: number | null;
      simple_payback_years: number | null; discounted_payback_years: number | null; break_even_year: number | null;
    }>;
  } | null;
  alternatives: CandidateOutcome[];
  validation: { state: string; [k: string]: unknown };
  input: { site: Record<string, unknown>; mission: Record<string, unknown>; constraints?: { heater_fuels?: string[]; [k: string]: unknown } };
  provenance: { weather_snapshot_id: string; setpoint_c: number };
};

export type TimeseriesPoint = {
  timestamp: string;
  ambient_c: number;
  zone_temp_c: Record<string, number>;
  zone_heating_w: Record<string, number>;
  zone_solar_w: Record<string, number>;
};

export type TimeseriesResponse = { which: string; zone_ids: string[]; points: TimeseriesPoint[] };

export type RunOptions = {
  hvac_mode: "free_floating" | "ideal_load" | "capacity_limited";
  heater_benchmark: boolean;
};

export type OptimizationRequest = {
  name?: string;
  requirements: unknown;
  count?: number;
  seed?: number;
  site?: string | null;
  materials_snapshot_id?: string | null;
  validate_with_ansys?: boolean;
  ansys_designs?: 1 | 2;
  validation_strategy?: "staged" | "exhaustive";
  shortlist_size?: number;
  reliability_designs?: number;
  rc_workers?: number;
  baseline_economics?: boolean;
  run_options?: RunOptions;
  design_options?: Record<string, unknown>;
};

export type PreflightResult = {
  feasible: boolean;
  required_total_area_m2: number;
  room_area_sum_m2: number;
  usable_area_by_floor_count_m2: Record<string, number | null>;
  allowed_floor_counts: number[];
};

export async function preflightOptimization(body: OptimizationRequest): Promise<PreflightResult> {
  return apiFetch("/api/v1/optimizations/preflight", { method: "POST", body: JSON.stringify(body) });
}

export function startOptimization(body: OptimizationRequest): Promise<{ optimization_id: string; status: string; status_url: string }> {
  return apiFetch("/api/v1/optimizations", { method: "POST", body: JSON.stringify(body) });
}

export function listOptimizations(): Promise<{ optimizations: OptimizationListItem[] }> {
  return apiFetch("/api/v1/optimizations");
}
export function listProjects(): Promise<{ projects: ProjectSummary[] }> {
  return apiFetch("/api/v1/projects");
}
export function deleteOptimization(id: string): Promise<{ deleted: boolean; optimization_id: string }> {
  return apiFetch(`/api/v1/optimizations/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export function deleteProject(id: string): Promise<{ deleted: boolean; project_id: string; deleted_runs_count: number }> {
  return apiFetch(`/api/v1/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export function renameProject(id: string, name: string): Promise<{ success: boolean; project_id: string; name: string }> {
  return apiFetch(`/api/v1/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
}
export function getOptimization(id: string): Promise<OptimizationStatus> {
  return apiFetch(`/api/v1/optimizations/${id}`);
}

export function getReport(id: string): Promise<FinalReport> {
  return apiFetch(`/api/v1/optimizations/${id}/report`);
}

export function getTimeseries(id: string, which: "conditioned" | "free_floating" | "baseline_conditioned" = "conditioned"): Promise<TimeseriesResponse> {
  return apiFetch(`/api/v1/optimizations/${id}/timeseries?which=${which}`);
}

// ─── BuildingModel (cocoon_contracts.building) — the real 3D geometry M2 solved against ─────

export type Vector3 = { x: number; y: number; z: number };

export type BuildingZone = {
  id: string;
  type: string;
  origin_m: Vector3;
  size_m: { length_m: number; width_m: number; height_m: number };
};

export type BuildingFloor = {
  id: string;
  level: number;
  elevation_m: number;
  zones: BuildingZone[];
};

export type BuildingSurface = {
  id: string;
  owning_zone_id: string;
  boundary_type: "outdoors" | "ground" | "adjacent_zone" | "adiabatic";
  surface_type: "exterior_wall" | "partition" | "roof" | "floor" | "ceiling";
  area_m2: number;
  azimuth_deg: number;
  tilt_deg: number;
  assembly_id: string;
  adjacent_zone_id: string | null;
  vertices: Vector3[] | null;
};

export type BuildingOpening = {
  id: string;
  parent_surface_id: string;
  opening_type: "window" | "door";
  area_m2: number;
  connected_boundary: string | null;
};

export type BuildingAssembly = {
  id: string;
  name: string;
  category: "wall" | "roof" | "floor" | "ceiling" | "partition";
  layers: { material_id: string; thickness_mm: number }[];
  u_value_w_m2k: number | null;
};

export type BuildingModel = {
  design_id: string;
  revision_id: string;
  orientation_deg: number;
  floors: BuildingFloor[];
  surfaces: BuildingSurface[];
  openings: BuildingOpening[];
  assemblies: Record<string, BuildingAssembly>;
};

export function getDesign(optimizationId: string, designId: string): Promise<BuildingModel> {
  return apiFetch(`/api/v1/optimizations/${optimizationId}/designs/${designId}`);
}
