/**
 * Candidate badges, derived chart series, error categories, i18n fallback,
 * N/A formatting and the run-index migration.
 */
import { candidateBadges } from "../../adapters/candidates";
import { dailySolarEnergy, deltaTChart, stepStartDay, totalHeatingChart } from "../../adapters/simulation";
import { MIGRATIONS, runMigrations } from "../../database/migrations";
import { translate } from "../../i18n";
import * as fx from "../../mocks/fixtureLoader";
import type { DesignOutcome } from "../../types/backend";
import { AppError, PipelineFailure, toUserFacingError } from "../../utils/errors";
import { formatInr, formatWithUnit, NOT_AVAILABLE } from "../../utils/format";
import { createSqlJsDriver } from "../database/sqlJsDriver";

const DESIGN = "des_5951c6f961b7";
const outcome = (patch: Partial<DesignOutcome>): DesignOutcome => ({ ...fx.getRecordedCandidates().candidates[0], ...patch });

describe("candidate badges come only from backend fields", () => {
  it("RECOMMENDED only for the optimizer's pick", () => {
    const rec = fx.getRecordedCandidates().recommended_design_id as string;
    expect(candidateBadges(outcome({ design_id: rec, status: "on_front" }), rec, null)).toEqual(["RECOMMENDED", "PARETO"]);
    expect(candidateBadges(outcome({ design_id: "des_other", status: "dominated" }), rec, null)).toEqual(["DOMINATED"]);
  });

  it("BUDGET EXCLUDED only for M6's capex_within_budget failure; other failures are REJECTED", () => {
    expect(candidateBadges(outcome({ failed_constraints: ["capex_within_budget"] }), null, null)).toContain("BUDGET EXCLUDED");
    expect(candidateBadges(outcome({ failed_constraints: ["capex_within_budget"] }), null, null)).not.toContain("REJECTED");
    expect(candidateBadges(outcome({ failed_constraints: ["mass_within_limit"] }), null, null)).toContain("REJECTED");
    expect(candidateBadges(outcome({ status: "excluded", failed_constraints: [] }), null, null)).toContain("REJECTED");
  });

  it("SELECTED reflects the user's choice", () => {
    const o = outcome({});
    expect(candidateBadges(o, null, o.design_id)).toContain("SELECTED");
  });
});

describe("derived chart series are plain arithmetic over the backend series", () => {
  const ts = fx.getRecordedTimeseries(fx.getRecordedSimulationForDesign(DESIGN).simulation_id);

  it("daily solar energy sums W × timestep per day", () => {
    const days = dailySolarEnergy(ts);
    // 168 hourly points from 00:00 on day 1 → seven full days (and never an invented eighth).
    expect(days.filter((d) => d.hours === 24)).toHaveLength(7);
    expect(days.every((d) => d.hours <= 24)).toBe(true);
    expect(days).toHaveLength(7);
    expect(days[0].day).toBe("2026-01-01");
    // Day 1 = the 24 values stamped 01:00 … 24:00 (i.e. 00:00 of day 2).
    const expectedDay0 = ts.points
      .slice(0, 24)
      .reduce((s, p) => s + Object.values(p.solar_gain_w ?? {}).reduce((a, v) => a + v, 0), 0) / 1000;
    expect(days[0].kwh).toBeCloseTo(expectedDay0, 9);
  });

  it("assigns end-of-hour stamps to the day the hour began, in the stamp's own offset", () => {
    expect(stepStartDay("2026-01-02T00:00:00+05:30", 3600)).toBe("2026-01-01");
    expect(stepStartDay("2026-01-02T01:00:00+05:30", 3600)).toBe("2026-01-02");
  });

  it("ΔT is room minus outdoor, point by point", () => {
    const living = deltaTChart(ts).series.find((s) => s.key === "living");
    const p = ts.points[20];
    expect(living?.points[20].value).toBeCloseTo(p.zone_temperatures_c.living - p.ambient_temperature_c, 12);
  });

  it("total heating sums rooms", () => {
    const p = ts.points[3];
    expect(totalHeatingChart(ts).series[0].points[3].value).toBe(Object.values(p.heating_power_w ?? {}).reduce((s, v) => s + v, 0));
  });
});

describe("error categories", () => {
  it.each([
    [new AppError({ kind: "network", message: "x" }), "NETWORK ERROR"],
    [new AppError({ kind: "server", message: "x" }), "BACKEND ERROR"],
    [new AppError({ kind: "validation", message: "x", backendMessage: "rooms need 60 m2" }), "VALIDATION ERROR"],
    [new AppError({ kind: "unauthorized", message: "x" }), "AUTHENTICATION ERROR"],
    [new PipelineFailure("job interrupted by a server restart", "VALIDATION_ERROR"), "PIPELINE FAILURE"],
  ])("%s → %s", (error, category) => {
    expect(toUserFacingError(error).category).toBe(category);
  });

  it("a pipeline failure shows the backend's own reason", () => {
    expect(toUserFacingError(new PipelineFailure("weather gap too large")).message).toBe("weather gap too large");
  });
});

describe("missing values", () => {
  it("render as N/A, never as zero", () => {
    expect(NOT_AVAILABLE).toBe("N/A");
    expect(formatInr(null)).toBe("N/A");
    expect(formatWithUnit(undefined, "kWh")).toBe("N/A");
    expect(formatInr(0)).toBe("₹0");
  });
});

describe("i18n", () => {
  it("translates UI labels and falls back to English", () => {
    expect(translate("hi", "Projects")).toBe("प्रोजेक्ट");
    expect(translate("hi", "des_5951c6f961b7")).toBe("des_5951c6f961b7");
    expect(translate("en", "Projects")).toBe("Projects");
  });
});

describe("migration 003", () => {
  it("backfills the run index from projects that already have a run", async () => {
    const db = await createSqlJsDriver();
    for (const m of MIGRATIONS.slice(0, 2)) await db.execAsync(m.sql);
    await db.execAsync("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
    await db.runAsync("INSERT INTO schema_migrations VALUES (1, 'x'), (2, 'x');");
    await db.runAsync(
      "INSERT INTO projects (id, name, status, requirements_json, schema_version, last_step, created_at, updated_at, draft_format, run_job_id, run_status, data_provider) VALUES ('p1', 'P', 'READY', '{}', '4.0', 9, 'a', 'b', 2, 'opt_x', 'completed', 'api');"
    );
    await runMigrations(db);
    const row = await db.getFirstAsync<{ job_id: string; project_id: string; last_status: string }>("SELECT * FROM run_index;");
    expect(row).toEqual(expect.objectContaining({ job_id: "opt_x", project_id: "p1", last_status: "completed" }));
  });
});
