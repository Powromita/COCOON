import { objectiveDef, type ObjectiveDef } from "../../adapters/candidates";
import {
  formatInr,
  formatNumber,
  formatPercent,
  formatTemperature,
  formatTemperatureDelta,
  formatWithUnit,
  type TemperatureUnit,
} from "../../utils/format";

/** Formats one M6 objective value with its unit (respecting the °C/°F preference). */
export function formatObjective(def: ObjectiveDef, value: number | null | undefined, unit: TemperatureUnit): string {
  switch (def.kind) {
    case "temperature":
      return formatTemperature(value, unit);
    case "temperature_delta":
      return formatTemperatureDelta(value, unit);
    case "inr":
      return formatInr(value);
    case "fraction":
      return formatPercent(value);
    default:
      return def.unit ? formatWithUnit(value, def.unit, def.decimals ?? 1) : formatNumber(value, def.decimals ?? 1);
  }
}

export function formatObjectiveByKey(key: string, value: number | null | undefined, unit: TemperatureUnit): string {
  const def = objectiveDef(key);
  return def ? formatObjective(def, value, unit) : formatNumber(value);
}

/** Axis label for charts, e.g. "CAPEX (₹)". */
export function objectiveAxisLabel(key: string, unit: TemperatureUnit): string {
  const def = objectiveDef(key);
  if (!def) return key;
  const u = def.kind === "temperature" || def.kind === "temperature_delta" ? `°${unit}` : def.kind === "fraction" ? "0–1" : def.unit;
  return u ? `${def.label} (${u})` : def.label;
}
