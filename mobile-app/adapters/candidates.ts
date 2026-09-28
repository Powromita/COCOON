/**
 * Presentation adapters for the M6 candidate list. Rankings, picks and
 * "recommended" come from the backend verbatim — the app never orders
 * candidates by a score of its own or treats array order as a ranking.
 */
import type { DesignOutcome, OptimizationPick, OutcomeObjectives, ParetoResponse } from "../types/backend";

export const PICK_LABELS: Record<string, string> = {
  best_overall: "Best overall",
  best_thermal: "Best thermal",
  lowest_capex: "Lowest CAPEX",
  lowest_lcc: "Lowest lifecycle cost",
};

export function pickLabel(name: string): string {
  return PICK_LABELS[name] ?? name.replace(/_/g, " ");
}

export const OUTCOME_STATUS_LABELS: Record<string, string> = {
  on_front: "Pareto front",
  dominated: "Dominated",
  excluded: "Excluded",
  screened_out: "Screened out",
};

export interface ObjectiveDef {
  key: keyof OutcomeObjectives & string;
  label: string;
  unit: string;
  kind: "temperature" | "temperature_delta" | "inr" | "number" | "fraction";
  decimals?: number;
  /** Direction M6 optimizes — shown as a hint only. */
  better: "lower" | "higher";
}

/** Every objective M6 reports, with units taken from the backend's key suffixes. */
export const OBJECTIVE_DEFS: ObjectiveDef[] = [
  { key: "unmet_hours", label: "Unmet comfort hours", unit: "h", kind: "number", decimals: 1, better: "lower" },
  { key: "occupied_comfort_hours", label: "Occupied comfort hours", unit: "h", kind: "number", decimals: 0, better: "higher" },
  { key: "passive_min_temperature_c", label: "Passive minimum temperature", unit: "°C", kind: "temperature", better: "higher" },
  { key: "passive_median_temperature_c", label: "Passive median temperature", unit: "°C", kind: "temperature", better: "higher" },
  { key: "temperature_swing_c", label: "Temperature swing", unit: "°C", kind: "temperature_delta", better: "lower" },
  { key: "cold_degree_hours", label: "Cold degree-hours", unit: "K·h", kind: "number", decimals: 1, better: "lower" },
  { key: "overheating_degree_hours", label: "Overheating degree-hours", unit: "K·h", kind: "number", decimals: 1, better: "lower" },
  { key: "heating_energy_kwh", label: "Heating energy", unit: "kWh", kind: "number", decimals: 2, better: "lower" },
  { key: "peak_heating_kw", label: "Peak heating", unit: "kW", kind: "number", decimals: 2, better: "lower" },
  { key: "capex_inr", label: "CAPEX", unit: "₹", kind: "inr", better: "lower" },
  { key: "lcc_inr", label: "Lifecycle cost", unit: "₹", kind: "inr", better: "lower" },
  { key: "mass_kg", label: "Shipped mass", unit: "kg", kind: "number", decimals: 0, better: "lower" },
  { key: "reliability", label: "Reliability", unit: "", kind: "fraction", better: "higher" },
];

export function objectiveDef(key: string): ObjectiveDef | undefined {
  return OBJECTIVE_DEFS.find((d) => d.key === key);
}

/** Picks that name this design, with the backend's own explanation sentences. */
export function picksForDesign(pareto: ParetoResponse | undefined, designId: string): OptimizationPick[] {
  if (!pareto) return [];
  return Object.values(pareto.picks.picks).filter((p) => p.design_id === designId);
}

export function isRecommended(outcome: DesignOutcome, recommendedDesignId: string | null | undefined): boolean {
  return Boolean(recommendedDesignId) && outcome.design_id === recommendedDesignId;
}

export type CandidateBadge = "RECOMMENDED" | "PARETO" | "SELECTED" | "DOMINATED" | "BUDGET EXCLUDED" | "REJECTED";

/** M6's budget check (optimization/constraints.py). */
export const BUDGET_CONSTRAINT = "capex_within_budget";

/**
 * Status badges for a candidate, all derived from backend fields:
 * RECOMMENDED only for the design the optimizer named; PARETO/DOMINATED from
 * M6's status; BUDGET EXCLUDED only when M6 reports the capex_within_budget
 * check failed; REJECTED for any other failed constraint or exclusion.
 * SELECTED is the user's own choice on this device.
 */
export function candidateBadges(
  outcome: DesignOutcome,
  recommendedDesignId: string | null | undefined,
  selectedDesignId: string | null | undefined
): CandidateBadge[] {
  const badges: CandidateBadge[] = [];
  if (isRecommended(outcome, recommendedDesignId)) badges.push("RECOMMENDED");
  if (outcome.status === "on_front") badges.push("PARETO");
  if (outcome.status === "dominated") badges.push("DOMINATED");
  if (selectedDesignId && outcome.design_id === selectedDesignId) badges.push("SELECTED");
  const budget = outcome.failed_constraints.includes(BUDGET_CONSTRAINT);
  if (budget) badges.push("BUDGET EXCLUDED");
  const otherFailures = outcome.failed_constraints.some((c) => c !== BUDGET_CONSTRAINT);
  if (otherFailures || outcome.status === "excluded" || outcome.status === "screened_out") badges.push("REJECTED");
  return badges;
}
