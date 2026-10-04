import { buildDesignOptions, economicSetId } from "../../validation/schemas";

describe("economicSetId", () => {
  it("maps each scenario to its own backend assumption set", () => {
    expect(economicSetId("expected")).toBe("econ_ladakh_expected_v1");
    expect(economicSetId("conservative")).toBe("econ_ladakh_conservative_v1");
    expect(economicSetId("optimistic")).toBe("econ_ladakh_optimistic_v1");
  });

  it("defaults when missing and passes a real id through", () => {
    expect(economicSetId(undefined)).toBe("econ_ladakh_expected_v1");
    expect(economicSetId("econ_ladakh_conservative_v1")).toBe("econ_ladakh_conservative_v1");
  });
});

describe("buildDesignOptions", () => {
  it("sends the envelope step the way the website's design_options does", () => {
    const out = buildDesignOptions({
      envelope: {
        length_m: 7,
        width_m: 5,
        height_m: 2.8,
        wall_thickness_mm: 350,
        window_count: 4,
        window_width_m: 1.2,
        window_height_m: 1.2,
        window_orientation: "South",
        glazing_spec: "double",
        air_changes_per_hour: 0.8,
      },
    });
    expect(out).toMatchObject({
      length_m: 7,
      width_m: 5,
      height_m: 2.8,
      wall_thickness_mm: 350,
      window_count: 4,
      window_orientation: "south",
      glazing: "double",
      air_changes_per_hour: 0.8,
      shape: "rectangular",
      require_separate_rooms: true,
    });
  });

  it("leaves blank fields out so the generator still chooses them", () => {
    const out = buildDesignOptions({ envelope: { window_count: 0 } });
    expect(out).toEqual({ shape: "rectangular", require_separate_rooms: true, window_count: 0 });
    expect(buildDesignOptions({})).toEqual({ shape: "rectangular", require_separate_rooms: true });
  });
});

describe("previewRequirements", () => {
  it("always carries the economic assumption set so the backend does not call a full draft incomplete", () => {
    const { previewRequirements } = require("../../validation/schemas");
    expect(previewRequirements({}, "p1").economic_assumption_set_id).toBe("econ_ladakh_expected_v1");
    expect(previewRequirements({ economic_assumption_set_id: "optimistic" }, "p1").economic_assumption_set_id).toBe("econ_ladakh_optimistic_v1");
  });
});

describe("snapToHour", () => {
  it("snaps minutes and seconds off the analysis window and keeps the UTC offset", () => {
    const { snapToHour } = require("../../validation/schemas");
    expect(snapToHour("2026-03-01T23:24:00+05:30")).toBe("2026-03-01T23:00:00+05:30");
    expect(snapToHour("2026-04-01T00:00:00+05:30")).toBe("2026-04-01T00:00:00+05:30");
    expect(snapToHour(undefined)).toBeUndefined();
  });
});
