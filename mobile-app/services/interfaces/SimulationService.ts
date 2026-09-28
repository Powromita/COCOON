import type { BuildingModel, SimulationResult } from "@cocoon/contracts";

import type { TimeseriesResponse } from "../../types/backend";

export interface DesignSimulationRequest {
  designId: string;
  building: BuildingModel;
  weatherSnapshotId: string;
  windowStart: string;
  windowEnd: string;
  setpointC: number;
}

/**
 * RC simulation of one design revision. The backend (M4) runs it; the app
 * only submits the request. Simulation ids are content hashes on the
 * backend, so repeating a request returns the same stored result.
 */
export interface SimulationService {
  getForDesign(request: DesignSimulationRequest): Promise<SimulationResult>;
  getTimeseries(simulationId: string): Promise<TimeseriesResponse>;
}
