import type { BuildingModel, VisualizationModel } from "@cocoon/contracts";

import type { TimeseriesResponse } from "../../types/backend";

/**
 * "backend"      — served by GET /api/v1/visualizations/{revision_id}
 * "building_geometry" — the backend has no visualization endpoint yet, so the
 *   M0 VisualizationModel was assembled on the device by copying the
 *   BuildingModel's zone boxes and the simulation's zone temperatures
 *   verbatim (adapters/visualization.ts). No values are computed.
 */
export type VisualizationOrigin = "backend" | "building_geometry";

export interface VisualizationResult {
  model: VisualizationModel;
  origin: VisualizationOrigin;
}

export interface VisualizationRequest {
  building: BuildingModel;
  timeseries?: TimeseriesResponse;
}

export interface VisualizationService {
  getForDesign(request: VisualizationRequest): Promise<VisualizationResult>;
}
