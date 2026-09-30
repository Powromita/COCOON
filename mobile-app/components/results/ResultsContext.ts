import type { BuildingModel, RequirementsContract, SimulationResult } from "@cocoon/contracts";
import type { UseQueryResult } from "@tanstack/react-query";

import type { GenerationJob } from "../../services/interfaces/GenerationService";
import type { DesignOutcome, OptimizationPick, TimeseriesResponse } from "../../types/backend";
import type { Sourced } from "../../types/dataTruth";

/** Everything the result tabs share for one design. Loaded once by the results screen. */
export interface ResultsContext {
  projectId?: string;
  optimizationId: string;
  designId: string;
  building?: BuildingModel;
  outcome?: DesignOutcome;
  recommendedDesignId?: string | null;
  picks: OptimizationPick[];
  requirements?: RequirementsContract | null;
  job?: GenerationJob;
  simulation: UseQueryResult<Sourced<SimulationResult>>;
  timeseries: UseQueryResult<Sourced<TimeseriesResponse>>;
}
