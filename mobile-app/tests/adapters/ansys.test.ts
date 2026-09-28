import {
  ANSYS_COMPLETED_EXPLANATION,
  ANSYS_STATUS_LABELS,
  ansysFailureCopy,
  isAnsysActive,
  validationStateLabel,
} from "../../adapters/ansys";

describe("ANSYS execution and validation wording", () => {
  it("does not equate a completed solve with formal validation", () => {
    expect(ANSYS_STATUS_LABELS.COMPLETED).toBe("Completed");
    expect(ANSYS_COMPLETED_EXPLANATION).toMatch(/no formal pass\/fail tolerance is defined/i);
    expect(ANSYS_COMPLETED_EXPLANATION).toMatch(/does not mean the design was validated or accepted/i);
  });

  it("treats NOT_REQUESTED as a distinct terminal state, not as a failure", () => {
    expect(ANSYS_STATUS_LABELS.NOT_REQUESTED).toBe("Not requested");
    expect(isAnsysActive("NOT_REQUESTED")).toBe(false);
  });

  it("does not invent a formal validation state from an execution status", () => {
    expect(validationStateLabel("RC_ONLY_ANSYS_NOT_REQUESTED")).toBe("RC physics only — ANSYS not requested");
    expect(validationStateLabel("VALIDATED_BY_ANSYS")).toBe("Validated by ANSYS");
  });

  it("maps solver unavailability to a user-readable message without exposing the raw backend error", () => {
    expect(ansysFailureCopy("UNAVAILABLE")).toEqual(
      expect.objectContaining({
        title: "ANSYS solver unavailable",
        message: expect.stringContaining("could not start the solver"),
      })
    );
    expect(ansysFailureCopy("COMPLETED")).toBeNull();
  });
});
