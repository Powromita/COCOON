/**
 * Requirements validation against the M0 RequirementsContract.
 */
import type { DraftRequirements } from "../../database/schema/types";
import { getSampleRequirements } from "../../mocks/fixtureLoader";
import {
  buildRequirementsContract,
  draftSchema,
  hasBlockingErrors,
  validateAll,
  validateStep,
} from "../../validation/schemas";
import { sampleRequirementsDraft } from "../../validation/templates";

function withPatch(patch: (d: DraftRequirements) => void): DraftRequirements {
  const d = sampleRequirementsDraft();
  patch(d);
  return d;
}

describe("the M0 sample requirements", () => {
  it("are complete and valid", () => {
    expect(validateAll(sampleRequirementsDraft())).toEqual([]);
  });

  it("round-trip into the same RequirementsContract the M0 package published", () => {
    const result = buildRequirementsContract(sampleRequirementsDraft(), "prj_leh_winter_001");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(getSampleRequirements());
  });
});

describe("missing location", () => {
  it("reports each missing site field as 'missing' on the location step, which does not block navigation", () => {
    const draft = withPatch((d) => {
      d.site = { ...d.site, latitude_deg: undefined, longitude_deg: undefined };
    });
    const errors = validateStep("location", draft);
    expect(errors.map((e) => e.field).sort()).toEqual(["site.latitude_deg", "site.longitude_deg"]);
    expect(errors.every((e) => e.kind === "missing")).toBe(true);
    expect(hasBlockingErrors(errors)).toBe(false);
  });

  it("an empty draft cannot become a contract", () => {
    const result = buildRequirementsContract({}, "prj_x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const steps = new Set(result.error.map((e) => e.step));
      for (const s of ["location", "weather", "mission", "occupancy", "rooms", "budget"]) expect(steps.has(s as never)).toBe(true);
    }
  });

  it("rejects an out-of-range latitude as a blocking error", () => {
    const errors = validateStep("location", withPatch((d) => void (d.site!.latitude_deg = 91)));
    expect(errors).toEqual([expect.objectContaining({ field: "site.latitude_deg", kind: "invalid" })]);
    expect(hasBlockingErrors(errors)).toBe(true);
  });

  it("rejects a timezone that is not an IANA name", () => {
    const errors = validateStep("location", withPatch((d) => void (d.site!.timezone = "IST +5:30")));
    expect(errors[0]).toEqual(expect.objectContaining({ field: "site.timezone", kind: "invalid" }));
  });
});

describe("weather window", () => {
  it("requires timezone-aware timestamps", () => {
    const errors = validateStep("weather", withPatch((d) => void (d.site!.analysis_start = "2026-01-01T00:00:00")));
    expect(errors[0]).toEqual(expect.objectContaining({ field: "site.analysis_start", kind: "invalid" }));
  });

  it("requires the end to be after the start", () => {
    const errors = validateStep(
      "weather",
      withPatch((d) => {
        d.site!.analysis_start = "2026-01-08T00:00:00+05:30";
        d.site!.analysis_end = "2026-01-01T00:00:00+05:30";
      })
    );
    expect(errors).toEqual([expect.objectContaining({ field: "site.analysis_end", message: "The end must be after the start." })]);
  });
});

describe("invalid occupancy", () => {
  it.each([[0], [-3], [2.5]])("rejects %p occupants", (n) => {
    const errors = validateStep("occupancy", withPatch((d) => void (d.mission!.occupants = n)));
    expect(errors).toEqual([expect.objectContaining({ field: "mission.occupants", kind: "invalid" })]);
  });
});

describe("invalid rooms", () => {
  it("rejects room types the M2 generator has no sizing rule for", () => {
    const errors = validateStep("rooms", withPatch((d) => void (d.mission!.required_rooms = ["living", "hangar"])));
    expect(errors[0]).toEqual(expect.objectContaining({ field: "mission.required_rooms", kind: "invalid" }));
  });

  it("rejects a room type listed twice", () => {
    const errors = validateStep("rooms", withPatch((d) => void (d.mission!.required_rooms = ["living", "living"])));
    expect(errors[0].message).toMatch(/only once/);
  });

  it("requires at least one room", () => {
    const errors = validateStep("rooms", withPatch((d) => void (d.mission!.required_rooms = [])));
    expect(errors).toEqual([expect.objectContaining({ field: "mission.required_rooms", kind: "missing" })]);
  });

  it("rejects floor limits outside the contract's 1–5", () => {
    const errors = validateStep("footprint", withPatch((d) => void (d.constraints!.maximum_floors = 6)));
    expect(errors[0]).toEqual(expect.objectContaining({ field: "constraints.maximum_floors", kind: "invalid" }));
  });

  it("rejects a non-positive footprint", () => {
    const errors = validateStep("footprint", withPatch((d) => void (d.constraints!.maximum_footprint_m2 = 0)));
    expect(errors[0]).toEqual(expect.objectContaining({ field: "constraints.maximum_footprint_m2", kind: "invalid" }));
  });
});

describe("invalid budget", () => {
  it("rejects a negative CAPEX limit", () => {
    const errors = validateStep("budget", withPatch((d) => void (d.constraints!.maximum_capex_inr = -1)));
    expect(errors[0]).toEqual(expect.objectContaining({ field: "constraints.maximum_capex_inr", kind: "invalid" }));
  });

  it("allows 'no limit' (null) for optional limits", () => {
    expect(validateStep("budget", withPatch((d) => void (d.constraints!.maximum_capex_inr = null)))).toEqual([]);
  });

  it("requires an economic assumption set", () => {
    const errors = validateStep("budget", withPatch((d) => void (d.economic_assumption_set_id = undefined)));
    expect(errors).toEqual([expect.objectContaining({ field: "economic_assumption_set_id", kind: "missing" })]);
  });
});

describe("invalid comfort values", () => {
  it("rejects negative unmet hours", () => {
    const errors = validateStep("comfort", withPatch((d) => void (d.mission!.maximum_unmet_hours = -1)));
    expect(errors[0]).toEqual(expect.objectContaining({ field: "mission.maximum_unmet_hours", kind: "invalid" }));
  });

  it("does not encode a comfort judgement: any finite target temperature is accepted", () => {
    expect(validateStep("comfort", withPatch((d) => void (d.mission!.target_temperature_c = -5)))).toEqual([]);
  });
});

describe("draftSchema (React Hook Form resolver)", () => {
  it("accepts an incomplete draft", () => {
    expect(draftSchema.safeParse({ site: { latitude_deg: 10 } }).success).toBe(true);
  });

  it("rejects a present-but-wrong value", () => {
    expect(draftSchema.safeParse({ site: { latitude_deg: 200 } }).success).toBe(false);
  });
});
