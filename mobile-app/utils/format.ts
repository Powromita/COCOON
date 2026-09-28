/**
 * Display formatting only. Nothing here derives a scientific value — values
 * arrive from the backend/fixtures and are rounded and given units for
 * display. Missing values render as NOT_AVAILABLE, never as a fake zero.
 */

/** Shown for any missing/null value — never a fake 0, ₹0 or 0 kWh. */
export const NOT_AVAILABLE = "N/A";

export type TemperatureUnit = "C" | "F";

function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (!isNum(value)) return NOT_AVAILABLE;
  return value.toFixed(decimals).replace(/^-0(\.0+)?$/, "0$1");
}

export function formatWithUnit(value: number | null | undefined, unit: string, decimals = 1): string {
  if (!isNum(value)) return NOT_AVAILABLE;
  return `${formatNumber(value, decimals)} ${unit}`;
}

/** Converts only when the user chose °F in Settings — the unit label always says which. */
export function formatTemperature(celsius: number | null | undefined, unit: TemperatureUnit = "C", decimals = 1): string {
  if (!isNum(celsius)) return NOT_AVAILABLE;
  const value = unit === "F" ? celsius * (9 / 5) + 32 : celsius;
  return `${formatNumber(value, decimals)} °${unit}`;
}

/** Temperature differences convert by scale only (no +32 offset). */
export function formatTemperatureDelta(deltaC: number | null | undefined, unit: TemperatureUnit = "C", decimals = 1): string {
  if (!isNum(deltaC)) return NOT_AVAILABLE;
  const value = unit === "F" ? deltaC * (9 / 5) : deltaC;
  return `${formatNumber(value, decimals)} °${unit}`;
}

export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === "F" ? celsius * (9 / 5) + 32 : celsius;
}

/** Indian digit grouping (12,34,567) without relying on Intl locale data being present on-device. */
function groupIndian(integerPart: string): string {
  if (integerPart.length <= 3) return integerPart;
  const last3 = integerPart.slice(-3);
  const rest = integerPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function formatInr(value: number | null | undefined, options: { compact?: boolean } = {}): string {
  if (!isNum(value)) return NOT_AVAILABLE;
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (options.compact) {
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  }
  return `${sign}₹${groupIndian(Math.round(abs).toString())}`;
}

export function formatPercent(fraction: number | null | undefined, decimals = 0): string {
  if (!isNum(fraction)) return NOT_AVAILABLE;
  return `${(fraction * 100).toFixed(decimals)} %`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Renders the timestamp's own wall-clock time and offset as sent — no timezone conversion. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const diffMs = now - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return "";
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

/** "living_sleeping" -> "Living sleeping". Purely cosmetic. */
export function humanize(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "des_5951c6f961b7" -> "DES-5951C6F961B7". Cosmetic — never use as a lookup key. */
export function formatContractId(id: string): string {
  return id.toUpperCase().replace(/_/g, "-");
}

export function shortId(id: string): string {
  const parts = id.split("_");
  const tail = parts[parts.length - 1] ?? id;
  return tail.length > 6 ? tail.slice(0, 6).toUpperCase() : tail.toUpperCase();
}
