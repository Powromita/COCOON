/**
 * Presentation adapters for M8 ANSYS validation state.
 *
 * SCIENTIFIC RULE: ANSYS and the RC engine solve the same scenario
 * independently. The app only displays their comparison metrics side by
 * side; RC temperatures are never sent to ANSYS and never labelled as ANSYS.
 */
import type { AnsysJobStatus, AnsysValidationResult } from "@cocoon/contracts";

import type { AnsysNotRequested } from "../types/backend";

export const ANSYS_ACTIVE: AnsysJobStatus[] = ["QUEUED", "PREPARING", "MESHING", "SOLVING", "EXPORTING"];

export const ANSYS_STATUS_LABELS: Record<AnsysJobStatus, string> = {
  NOT_REQUESTED: "Not requested",
  QUEUED: "Queued",
  PREPARING: "Preparing",
  MESHING: "Meshing",
  SOLVING: "Solving",
  EXPORTING: "Exporting results",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  TIMED_OUT: "Timed out",
  UNAVAILABLE: "Unavailable",
};

export const ANSYS_COMPLETED_EXPLANATION =
  "The ANSYS solver completed. M8 reports RC-versus-ANSYS comparison metrics only; no formal pass/fail tolerance is defined. “Completed” does not mean the design was validated or accepted.";

export function ansysFailureCopy(status: AnsysJobStatus): { title: string; message: string } | null {
  switch (status) {
    case "UNAVAILABLE":
      return {
        title: "ANSYS solver unavailable",
        message: "The local ANSYS environment could not start the solver for this run. Your design and RC results remain available.",
      };
    case "FAILED":
      return {
        title: "ANSYS solver failed",
        message: "The backend could not complete the ANSYS solve. Your design and RC results remain available.",
      };
    case "TIMED_OUT":
      return {
        title: "ANSYS solver timed out",
        message: "The backend stopped the solve after its configured time limit. Your design and RC results remain available.",
      };
    case "CANCELLED":
      return {
        title: "ANSYS job cancelled",
        message: "The ANSYS job was cancelled before it produced comparison results.",
      };
    default:
      return null;
  }
}

export function isAnsysActive(status: AnsysJobStatus): boolean {
  return ANSYS_ACTIVE.includes(status);
}

export function isFullAnsysResult(value: AnsysValidationResult | AnsysNotRequested): value is AnsysValidationResult {
  return "job_id" in value;
}

export const VALIDATION_STATE_LABELS: Record<string, string> = {
  SCREENED_BY_ML: "Screened by ML only",
  VERIFIED_BY_RC: "Verified by the RC physics engine",
  VALIDATED_BY_ANSYS: "Validated by ANSYS",
  RC_ONLY_ANSYS_NOT_REQUESTED: "RC physics only — ANSYS not requested",
  RC_ONLY_ANSYS_QUEUED: "RC physics only — ANSYS validation queued",
  RC_ONLY_ANSYS_UNAVAILABLE: "RC physics only — ANSYS unavailable",
  REFERENCE_BENCHMARK: "Reference benchmark",
  NO_ELIGIBLE_DESIGN: "No eligible design to validate",
};

export function validationStateLabel(state: string | null | undefined): string {
  if (!state) return "Not reported";
  return VALIDATION_STATE_LABELS[state] ?? state;
}
