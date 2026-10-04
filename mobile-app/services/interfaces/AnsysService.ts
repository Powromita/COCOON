import type { AnsysValidationResult } from "@cocoon/contracts";

import type { AnsysNotRequested, AnsysSubmitResponse } from "../../types/backend";

/**
 * ANSYS (M8) runs only on the backend. The app submits a design revision and
 * polls; it never receives or sends RC-predicted temperatures as ANSYS inputs.
 */
export interface AnsysService {
  getLatestForRevision(revisionId: string): Promise<AnsysValidationResult | AnsysNotRequested>;
  submitValidation(optimizationId: string, designId: string): Promise<AnsysSubmitResponse>;
  getJob(jobId: string): Promise<AnsysValidationResult>;
}
