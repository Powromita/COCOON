import type { BuildingModel, SimulationResult } from "@cocoon/contracts";

import type { AssumptionSetsResponse, EconomicsReport } from "../../types/backend";

export interface DesignEconomicsRequest {
  designId: string;
  building: BuildingModel;
  simulation: SimulationResult;
  assumptionSetId: string;
  occupants?: number;
  targetTemperatureC?: number;
  /** Length of the simulated window in hours (required by M7 when no timeseries is sent). */
  simulatedHours: number;
}

/** Lifecycle economics are calculated by M7 on the backend — never on the device. */
export interface EconomicsService {
  listAssumptionSets(): Promise<AssumptionSetsResponse>;
  getForDesign(request: DesignEconomicsRequest): Promise<EconomicsReport>;
}
