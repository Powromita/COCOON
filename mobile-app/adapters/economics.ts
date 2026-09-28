/**
 * Presentation adapters for the M7 economics report. Every number is read
 * from the report — CAPEX/OPEX/LCC/NPV/payback are never recalculated here.
 */
import type { AnnualOpexPoint, EconomicAnalysisResult } from "@cocoon/contracts";

import type { EconomicsReport, EconomicsScenarioOutcome, SensitivityRow } from "../types/backend";

export const SCENARIO_ORDER = ["low", "expected", "high"] as const;

export function scenarios(report: EconomicsReport): EconomicsScenarioOutcome[] {
  const known = SCENARIO_ORDER.flatMap((s) => (report.scenarios[s] ? [report.scenarios[s]] : []));
  const extra = Object.entries(report.scenarios)
    .filter(([k]) => !(SCENARIO_ORDER as readonly string[]).includes(k))
    .map(([, v]) => v);
  return [...known, ...extra];
}

export function expectedScenario(report: EconomicsReport): EconomicsScenarioOutcome | undefined {
  return report.scenarios.expected ?? scenarios(report)[0];
}

/** The first operating year's cash flow exactly as M7 lists it. */
export function firstYear(result: EconomicAnalysisResult): AnnualOpexPoint | undefined {
  return [...result.annual_cash_flows].sort((a, b) => a.year - b.year)[0];
}

/** Sensitivity rows ordered by the swing M7 reports (largest first) — a sort, not a new value. */
export function sensitivityBySwing(rows: SensitivityRow[]): SensitivityRow[] {
  return [...rows].sort((a, b) => b.lcc_swing_inr - a.lcc_swing_inr);
}
