/**
 * Catalogue-driven wizard choices and failure explanations, against REAL
 * backend responses recorded by scripts/record-template-fixtures.py.
 */
import {
  arrangementSupport,
  compatibilityView,
  explainFailure,
  floorOptions,
  rejectionLines,
  roomChoices,
  templatesCovering,
  visibleStages,
} from "../../adapters/templates";
import type { CompatibilityResult, TemplateCatalog } from "../../types/backend";
import { previewRequirements } from "../../validation/schemas";
import { stepIndexOf } from "../../validation/steps";

const catalog = require("../fixtures/templates/catalog.json") as TemplateCatalog;
const ok = require("../fixtures/templates/compatibility_sample_ok.json") as CompatibilityResult;
const tooSmall = require("../fixtures/templates/compatibility_footprint_too_small.json") as CompatibilityResult;
const noTemplate = require("../fixtures/templates/compatibility_no_template.json") as CompatibilityResult;
const partial = require("../fixtures/templates/compatibility_partial.json") as CompatibilityResult;
const refused = require("../fixtures/templates/error_physical_infeasibility.json") as {
  error: { message: string; code: string; details: Record<string, unknown>; trace_id: string; retryable: boolean };
};

describe("room choices come from the catalogue", () => {
  it("offers exactly the catalogue's room types", () => {
    expect(roomChoices(catalog, []).map((c) => c.type)).toEqual(catalog.room_types.map((r) => r.type));
    expect(roomChoices(catalog, []).every((c) => c.available)).toBe(true);
  });

  it("disables a room no template can hold with the current rooms, and says why", () => {
    // medical_post has no airlock-free medical + command combination; only the multipurpose room serves both.
    const withMedical = roomChoices(catalog, ["medical", "airlock"]);
    const command = withMedical.find((c) => c.type === "command");
    expect(command?.available).toBe(templatesCovering(catalog, ["medical", "airlock", "command"]).length > 0);
    if (!command?.available) expect(command?.reason).toMatch(/No shelter template/);
  });

  it("shows the M2 sizing rule for each room", () => {
    const sleeping = roomChoices(catalog, []).find((c) => c.type === "sleeping");
    const rule = catalog.room_types.find((r) => r.type === "sleeping")!;
    expect(sleeping?.sizing).toContain(`${rule.min_dimension_m}`);
  });

  it("offers own-room / shared only where the catalogue has both", () => {
    for (const rt of catalog.room_types) {
      expect(arrangementSupport(catalog, rt.type)).toEqual({ canDedicate: rt.dedicated_in.length > 0, canShare: rt.shared_in.length > 0 });
    }
    expect(arrangementSupport(catalog, "airlock")).toEqual({ canDedicate: true, canShare: false });
  });

  it("offers only floor counts some template has", () => {
    const max = Math.max(...catalog.floors.template_floor_counts);
    expect(floorOptions(catalog).map((o) => Number(o.value))).toEqual(Array.from({ length: max }, (_, i) => i + 1));
  });
});

describe("compatibility results", () => {
  it("a compatible result lists the selected templates and stays labelled preliminary", () => {
    const view = compatibilityView(ok);
    expect(view.kind).toBe("compatible");
    if (view.kind === "compatible") {
      expect(view.templates.map((t) => t.id)).toEqual(ok.selected_template_ids);
      expect(view.note).toMatch(/Preliminary/);
    }
  });

  it("a footprint conflict explains the numbers and carries verified alternatives", () => {
    const view = compatibilityView(tooSmall);
    expect(view.kind).toBe("incompatible");
    if (view.kind === "incompatible") {
      expect(view.headline).toMatch(/footprint/);
      expect(view.issues[0].message).toMatch(/m2/);
      expect(view.alternatives.length).toBeGreaterThan(0);
      expect(Object.keys(view.alternatives[0].change)[0]).toMatch(/^constraints\./);
    }
  });

  it("no compatible template names the missing rooms without repeating messages", () => {
    const view = compatibilityView(noTemplate);
    expect(view.kind).toBe("incompatible");
    if (view.kind === "incompatible") {
      const messages = view.issues.map((i) => i.message);
      expect(new Set(messages).size).toBe(messages.length);
      expect(messages.join(" ")).toMatch(/command|medical/);
    }
  });

  it("an incomplete draft shows what fits so far instead of a failure", () => {
    const view = compatibilityView(partial);
    expect(view.kind).toBe("incomplete");
    if (view.kind === "incomplete") expect(view.fittingSoFar.length).toBeGreaterThan(0);
  });

  it("the preview sends only fields the user entered", () => {
    const preview = previewRequirements({ mission: { type: "living", occupants: 3, required_rooms: ["living"] } }, "prj_x") as {
      mission: Record<string, unknown>;
      site?: unknown;
    };
    expect(preview.site).toBeUndefined();
    expect(preview.mission.occupancy_schedule_id).toBe("continuous_3");
  });
});

describe("failure explanations", () => {
  it("a refused request explains the physical constraint and points at the field", () => {
    const ex = explainFailure({ ...refused.error, traceId: refused.error.trace_id });
    expect(ex.category).toBe("physical_infeasibility");
    expect(ex.action).toBe("edit");
    expect(ex.field).toBe("constraints.maximum_footprint_m2");
    // the footprint lives on the constraints screen, whatever alias FIELD_META uses for it
    expect(stepIndexOf(ex.step!)).toBe(stepIndexOf("constraints"));
  });

  it("a temporary failure never blames the input and offers a retry with the reference", () => {
    const ex = explainFailure({ message: "x", retryable: true, details: { category: "temporary_failure" }, traceId: "t-1" });
    expect(ex.action).toBe("retry");
    expect(ex.message).toMatch(/not caused by your inputs/);
    expect(ex.referenceId).toBe("t-1");
  });

  it("an unknown failure is generic — backend text is not repeated to the user", () => {
    const ex = explainFailure({ message: "KeyError: C:\\secret", details: {} });
    expect(ex.category).toBe("unexpected");
    expect(ex.message).not.toMatch(/secret/);
  });

  it("no feasible candidates lists the real rejection tally, largest first", () => {
    const lines = rejectionLines({ "layout:NO_FEASIBLE_LAYOUT": 2, "constraints:envelope_mass_within_limit": 9 });
    expect(lines[0]).toBe("9 attempts: the envelope was heavier than the mass limit");
    expect(lines[1]).toMatch(/could not be laid out/);
  });

  it("does not draw an ANSYS row that was never requested", () => {
    const stages = visibleStages([
      { id: "generation", label: "M2", status: "completed" },
      { id: "ansys", label: "ANSYS", status: "not_requested" },
    ]);
    expect(stages.map((s) => s.id)).toEqual(["generation"]);
  });
});
