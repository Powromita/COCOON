import type { RunSeriesKind } from "../../adapters/simulation";
import type { TimeseriesResponse } from "../../types/backend";
import type { GenerationJobStatus } from "./GenerationService";

/** One optimization run as the backend reports it. */
export interface RunSummary {
  optimizationId: string;
  projectId: string | null;
  status: GenerationJobStatus | "not_found";
  createdAt?: string;
  finishedAt?: string;
  candidateCount?: number;
  recommendedDesignId?: string | null;
  validationState?: string;
  errorMessage?: string;
}

/**
 * Where the list came from:
 * - "backend_list"  — GET /api/v1/optimizations (not on main yet)
 * - "device_index"  — ids this device started, each re-read from GET /api/v1/optimizations/{id}
 * - "device_index_offline" — local run ids and last-known statuses because the backend is unreachable
 * - "fixture"       — the recorded demo run
 */
export type RunListSource = "backend_list" | "device_index" | "device_index_offline" | "fixture";

export interface RunList {
  source: RunListSource;
  runs: RunSummary[];
}

export interface RunReport {
  optimizationId: string;
  /** Artifact name → URL, as the backend lists them. */
  artifacts: Record<string, string>;
  /** The recommended design's full final report (the document the website's report view renders). */
  report?: FinalReportData;
}

/** The parts of the backend's final_report.json the app shows; every field is optional because older runs lack some. */
export interface FinalReportData {
  recommendation?: { design_id?: string; why?: { sentence: string }[] };
  design?: {
    orientation_deg?: number;
    template?: string;
    glazing?: string;
    airtightness_class?: string;
    air_changes_per_hour?: number;
    floors?: number;
    assemblies?: {
      id: string;
      name: string;
      used_for?: string[];
      u_value_w_m2k?: number;
      layers_inner_to_outer?: { material: string; name?: string; thickness_mm: number }[];
    }[];
    heater_plan?: { capacity_kw_each?: number; fuel?: string | null; zone_ids?: string[] } | null;
  };
  performance?: {
    conditioned_with_sized_heater?: { summary?: Record<string, number> };
    free_floating?: { summary?: Record<string, number> | null };
  };
  economics?: {
    scenarios?: Record<
      string,
      {
        capex?: { total_capex_inr?: number };
        lcc_inr?: number;
        annual_fuel_litres?: number;
        npv_vs_baseline_inr?: number | null;
        simple_payback_years?: number | null;
        discounted_payback_years?: number | null;
      }
    >;
  } | null;
}

export interface OptimizationHistoryService {
  listRuns(): Promise<RunList>;
  /** GET /api/v1/optimizations/{id}/report — throws AppError "not_supported" where the backend has no report endpoint. */
  getReport(optimizationId: string): Promise<RunReport>;
  /** GET /api/v1/optimizations/{id}/timeseries — the recommended design's own series, as the website charts it. */
  getRunTimeseries(optimizationId: string, which: RunSeriesKind): Promise<TimeseriesResponse>;
}
