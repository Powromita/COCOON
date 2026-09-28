import type { BuildingModel } from "@cocoon/contracts";

import type { CandidatesResponse, ParetoResponse } from "../../types/backend";

export interface CandidateService {
  getCandidates(optimizationId: string): Promise<CandidatesResponse>;
  getPareto(optimizationId: string): Promise<ParetoResponse>;
  getDesign(optimizationId: string, designId: string): Promise<BuildingModel>;
}
