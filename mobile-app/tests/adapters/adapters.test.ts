/**
 * Presentation adapters over real recorded engine output. Adapters may
 * select, rename, sum geometry and reshape — never invent values.
 */
import { summarizeBuilding } from "../../adapters/building";
import { isRecommended, picksForDesign } from "../../adapters/candidates";
import { expectedScenario, scenarios, sensitivityBySwing } from "../../adapters/economics";
import { decimate, temperatureChart, zoneResults, comfortLabel } from "../../adapters/simulation";
import { buildingToVisualizationModel, checkVisualizationModel, floorLevels } from "../../adapters/visualization";
import * as fx from "../../mocks/fixtureLoader";
import { formatInr, formatTemperature, NOT_AVAILABLE } from "../../utils/format";

const DESIGN = "des_5951c6f961b7";

describe("building adapter", () => {
  it("summarizes the recorded design from its own geometry", () => {
    const s = summarizeBuilding(fx.getRecordedDesign(DESIGN));
    expect(s.floorCount).toBe(2);
    expect(s.zones.map((z) => z.id)).toEqual(["airlock", "living", "equipment", "sleeping"]);
    expect(s.hasAirlock).toBe(true);
    // 2.4×1.7 + 5.9×5.5 + 2.4×3.8 + 8.3×5.5
    expect(s.totalFloorAreaM2).toBeCloseTo(2.4 * 1.7 + 5.9 * 5.5 + 2.4 * 3.8 + 8.3 * 5.5, 6);
  });
});

describe("candidate adapter", () => {
  it("takes the recommendation and picks from the backend, not from list order", () => {
    const c = fx.getRecordedCandidates();
    const first = c.candidates[0];
    expect(first.design_id).not.toBe(c.recommended_design_id);
    expect(isRecommended(first, c.recommended_design_id)).toBe(false);
    const picks = picksForDesign(fx.getRecordedPareto(), c.recommended_design_id as string);
    expect(picks.map((p) => p.name)).toContain("best_overall");
    expect(picks[0].explanation?.length).toBeGreaterThan(0);
  });
});

describe("simulation adapter", () => {
  const sim = fx.getRecordedSimulationForDesign(DESIGN);
  const ts = fx.getRecordedTimeseries(sim.simulation_id);

  it("copies per-zone results verbatim", () => {
    const zones = zoneResults(sim);
    expect(zones.map((z) => z.minC)).toEqual(sim.zones.map((z) => z.temperature_min_c));
  });

  it("builds chart series of exactly the timeseries values, with outdoor first", () => {
    const chart = temperatureChart(ts);
    expect(chart.series[0].key).toBe("__ambient");
    expect(chart.series[0].points.map((p) => p.value)).toEqual(ts.points.map((p) => p.ambient_temperature_c));
    const living = chart.series.find((s) => s.key === "living");
    expect(living?.points[10].value).toBe(ts.points[10].zone_temperatures_c.living);
  });

  it("decimation keeps the extremes and never alters values", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ i, value: Math.sin(i / 7) * 10 + (i === 500 ? 50 : 0) }));
    const out = decimate(pts, 100);
    expect(out.length).toBeLessThanOrEqual(110);
    expect(Math.max(...out.map((p) => p.value))).toBe(Math.max(...pts.map((p) => p.value)));
    for (const p of out) expect(p.value).toBe(pts[p.i].value);
  });

  it("describes comfort from the backend's unmet hours only", () => {
    expect(comfortLabel(0).tone).toBe("ok");
    expect(comfortLabel(3).label).toBe("3.0 unmet hours");
    expect(comfortLabel(null).label).toBe("Not reported");
  });
});

describe("economics adapter", () => {
  const report = fx.getRecordedEconomicsForDesign(DESIGN);

  it("orders scenarios low / expected / high and reads values without recomputing", () => {
    expect(scenarios(report).map((s) => s.scenario)).toEqual(["low", "expected", "high"]);
    expect(expectedScenario(report)?.result.lcc_inr).toBe(report.scenarios.expected.result.lcc_inr);
  });

  it("sorts sensitivity by the swing M7 reported", () => {
    const rows = sensitivityBySwing(report.parameter_sensitivity);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].lcc_swing_inr).toBeGreaterThanOrEqual(rows[i].lcc_swing_inr);
  });
});

describe("visualization adapter", () => {
  const building = fx.getRecordedDesign(DESIGN);
  const ts = fx.getRecordedTimeseries(fx.getRecordedSimulationForDesign(DESIGN).simulation_id);

  it("builds a valid M0 VisualizationModel by copying geometry and temperatures", () => {
    const model = buildingToVisualizationModel(building, ts, "2026-01-01T00:00:00Z");
    expect(checkVisualizationModel(model)).toEqual({ ok: true, problems: [] });
    expect(model.boxes).toHaveLength(4);
    const living = model.boxes.find((b) => b.zone_id === "living");
    expect(living?.size_m).toEqual({ x: 5.9, y: 5.5, z: 2.7 });
    expect(floorLevels(model)).toEqual([0, 1]);
    const series = model.temperature_series?.find((s) => s.zone_id === "sleeping");
    expect(series?.temperatures_c[42]).toBe(ts.points[42].zone_temperatures_c.sleeping);
    expect(model.openings).toEqual([]); // no positions in M0 openings → none invented
  });

  it("the M0 sample VisualizationModel passes the viewer check", () => {
    expect(checkVisualizationModel(fx.getSampleVisualizationModel()).ok).toBe(true);
  });

  it("rejects invalid models before they reach the viewer", () => {
    expect(checkVisualizationModel(null).ok).toBe(false);
    expect(checkVisualizationModel({ schema_version: "3.0", boxes: [] }).problems).toEqual(
      expect.arrayContaining([expect.stringContaining("schema_version"), "model has no boxes to draw"])
    );
    const bad = { ...fx.getSampleVisualizationModel(), boxes: [{ id: "b", name: "x", origin_m: { x: 0, y: 0, z: 0 }, size_m: { x: -1, y: 1, z: 1 } }] };
    expect(checkVisualizationModel(bad).problems[0]).toMatch(/non-positive/);
  });
});

describe("formatting", () => {
  it("never renders a missing value as zero", () => {
    expect(formatInr(undefined)).toBe(NOT_AVAILABLE);
    expect(formatTemperature(null)).toBe(NOT_AVAILABLE);
  });

  it("uses Indian digit grouping and labels the chosen temperature unit", () => {
    expect(formatInr(1926009.02)).toBe("₹19,26,009");
    expect(formatTemperature(0, "F")).toBe("32.0 °F");
  });
});
