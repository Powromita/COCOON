/**
 * format.ts — the single place value/unit formatting lives.
 *
 * Every results-page card formats through these helpers so precision and units
 * stay consistent (spec §16). A missing value (null / undefined / NaN) always
 * renders as `NA` — never `0`, never a fabricated number.
 *
 * Pure functions, no React, no network.
 */

export const NA = "Not available";
export const AWAITING = "Awaiting simulation";

type Num = number | null | undefined;

const ok = (v: Num): v is number => typeof v === "number" && Number.isFinite(v);

const sign = (v: number) => (v >= 0 ? "+" : "");

/** Temperature — 1 dp, °C, explicit sign (so "-3.9°C" and "+4.8°C" line up). */
export function fmtTemp(v: Num, opts: { signed?: boolean } = {}): string {
  if (!ok(v)) return NA;
  const s = opts.signed ? sign(v) : "";
  return `${s}${v.toFixed(1)}°C`;
}

/** Temperature difference for model-error metrics — 2 dp, °C. */
export function fmtTempDelta(v: Num, opts: { signed?: boolean } = {}): string {
  if (!ok(v)) return NA;
  const s = opts.signed ? sign(v) : "";
  return `${s}${v.toFixed(2)}°C`;
}

/** Power — W below 1 kW, else kW to 2 dp. Input is watts. */
export function fmtPower(watts: Num): string {
  if (!ok(watts)) return NA;
  const a = Math.abs(watts);
  if (a >= 1000) return `${(watts / 1000).toFixed(2)} kW`;
  return `${Math.round(watts)} W`;
}

/** Energy — Wh below 1 kWh, else kWh. Input is watt-hours. */
export function fmtEnergy(wh: Num): string {
  if (!ok(wh)) return NA;
  const a = Math.abs(wh);
  if (a >= 1000) return `${(wh / 1000).toFixed(1)} kWh`;
  return `${Math.round(wh)} Wh`;
}

/** U-value — 3 dp, W/m²·K. */
export function fmtU(v: Num): string {
  return ok(v) ? `${v.toFixed(3)} W/m²·K` : NA;
}

/** Area — 1 dp, m². */
export function fmtArea(v: Num): string {
  return ok(v) ? `${v.toFixed(1)} m²` : NA;
}

/** Volume — 1 dp, m³. */
export function fmtVolume(v: Num): string {
  return ok(v) ? `${v.toFixed(1)} m³` : NA;
}

/** Length — 1 dp, m (for the "6 m, 4 m, 2.8 m" style geometry echo). */
export function fmtLength(v: Num): string {
  return ok(v) ? `${v.toFixed(1)} m` : NA;
}

/** Thermal capacitance — kJ/K below 1 MJ/K, else MJ/K. Input is J/K. */
export function fmtCapacitance(jPerK: Num): string {
  if (!ok(jPerK)) return NA;
  if (Math.abs(jPerK) >= 1e6) return `${(jPerK / 1e6).toFixed(2)} MJ/K`;
  return `${(jPerK / 1e3).toFixed(1)} kJ/K`;
}

/** Thermal capacitance already in MJ/K (the shape `resolved` uses). */
export function fmtCapacitanceMJ(mjPerK: Num): string {
  if (!ok(mjPerK)) return NA;
  if (Math.abs(mjPerK) < 1) return `${(mjPerK * 1000).toFixed(0)} kJ/K`;
  return `${mjPerK.toFixed(2)} MJ/K`;
}

/** Percentage — 1 dp. Input is already a percentage (0–100). */
export function fmtPercent(v: Num): string {
  return ok(v) ? `${v.toFixed(1)}%` : NA;
}

/** Ratio 0..1 rendered as a percentage — 1 dp. */
export function fmtRatioPercent(v: Num): string {
  return ok(v) ? `${(v * 100).toFixed(1)}%` : NA;
}

/** Coordinate — 4 dp with a hemisphere letter. */
export function fmtCoord(v: Num, axis: "lat" | "lon"): string {
  if (!ok(v)) return NA;
  const hemi = axis === "lat" ? (v >= 0 ? "N" : "S") : v >= 0 ? "E" : "W";
  return `${Math.abs(v).toFixed(4)}° ${hemi}`;
}

/** Duration — "24 hours" / "7 days" / "3.5 days". Input is hours. */
export function fmtDuration(hours: Num): string {
  if (!ok(hours)) return NA;
  if (hours < 48) return `${Math.round(hours)} hours`;
  const days = hours / 24;
  return Number.isInteger(days) ? `${days} days` : `${days.toFixed(1)} days`;
}

/** Count of hourly steps — "48 hourly steps". */
export function fmtSteps(n: Num): string {
  return ok(n) ? `${Math.round(n)} hourly steps` : NA;
}

function dtf(tz: string | undefined, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz || undefined });
  } catch {
    return new Intl.DateTimeFormat("en-GB", opts);
  }
}

/** Single timestamp — "11 Jan 2026, 05:00". */
export function fmtTimestamp(iso: string | null | undefined, tz?: string): string {
  if (!iso) return NA;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NA;
  return dtf(tz, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Time only — "05:00" (for "occurred at" lines). */
export function fmtClock(iso: string | null | undefined, tz?: string): string {
  if (!iso) return NA;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NA;
  return dtf(tz, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** Day + time — "11 January at 05:00" (for prose sentences). */
export function fmtDayTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return NA;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NA;
  const day = dtf(tz, { day: "numeric", month: "long" }).format(d);
  const time = dtf(tz, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${day} at ${time}`;
}

/** Compact date range — "10–12 January 2026" or "10 January – 3 February 2026". */
export function fmtDateRange(
  startISO: string | null | undefined,
  endISO: string | null | undefined,
  tz?: string,
): string {
  if (!startISO || !endISO) return NA;
  const a = new Date(startISO);
  const b = new Date(endISO);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return NA;
  const sameMonth =
    dtf(tz, { month: "short", year: "numeric" }).format(a) ===
    dtf(tz, { month: "short", year: "numeric" }).format(b);
  const dayA = dtf(tz, { day: "numeric" }).format(a);
  if (sameMonth) {
    const tail = dtf(tz, { day: "numeric", month: "long", year: "numeric" }).format(b);
    return `${dayA}–${tail}`;
  }
  const headA = dtf(tz, { day: "numeric", month: "long" }).format(a);
  const tailB = dtf(tz, { day: "numeric", month: "long", year: "numeric" }).format(b);
  return `${headA} – ${tailB}`;
}

/** A dynamic assessment title from the analysed duration (spec §3). */
export function durationTitle(hours: Num): string {
  if (!ok(hours) || hours <= 0) return "Shelter Thermal Assessment";
  const snapped = [24, 48, 72].find((h) => Math.abs(hours - h) <= 1);
  if (snapped) return `${snapped}-Hour Shelter Thermal Assessment`;
  const days = hours / 24;
  if (hours >= 48 && Math.abs(days - Math.round(days)) <= 0.1) {
    return `${Math.round(days)}-Day Shelter Thermal Assessment`;
  }
  return "Shelter Thermal Assessment";
}
