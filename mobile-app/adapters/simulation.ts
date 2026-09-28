/**
 * Presentation adapters for M0 SimulationResult and its timeseries. Values
 * are copied verbatim; the only transformation is reshaping into chart
 * series (and, for very long series, display decimation — see decimate()).
 */
import type { SimulationResult, TimeSeriesPoint, ZoneSummary } from "@cocoon/contracts";

import type { TimeseriesResponse } from "../types/backend";

export interface ZoneResultView {
  zoneId: string;
  minC: number;
  meanC: number;
  maxC: number;
  comfortHours: number;
  unmetHours: number | null;
  peakHeatingKw: number | null;
}

export function zoneResults(result: SimulationResult): ZoneResultView[] {
  return result.zones.map((z: ZoneSummary) => ({
    zoneId: z.zone_id,
    minC: z.temperature_min_c,
    meanC: z.temperature_mean_c,
    maxC: z.temperature_max_c,
    comfortHours: z.comfort_hours,
    unmetHours: z.unmet_hours ?? null,
    peakHeatingKw: z.peak_heating_kw ?? null,
  }));
}

/** Comfort wording is driven only by the backend's unmet-hours figure for the zone. */
export function comfortLabel(unmetHours: number | null): { label: string; tone: "ok" | "warn" | "unknown" } {
  if (unmetHours === null) return { label: "Not reported", tone: "unknown" };
  if (unmetHours === 0) return { label: "No unmet hours", tone: "ok" };
  return { label: `${unmetHours.toFixed(1)} unmet hours`, tone: "warn" };
}

export interface SeriesPoint {
  /** Index into the original timeseries. */
  i: number;
  value: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  points: SeriesPoint[];
}

export interface ChartData {
  timestamps: string[];
  series: ChartSeries[];
}

type ZoneMapKey = "zone_temperatures_c" | "heating_power_w" | "solar_gain_w";

function zoneIds(points: TimeSeriesPoint[], key: ZoneMapKey): string[] {
  const ids = new Set<string>();
  for (const p of points) for (const id of Object.keys(p[key] ?? {})) ids.add(id);
  return [...ids];
}

function zoneSeries(points: TimeSeriesPoint[], key: ZoneMapKey): ChartSeries[] {
  return zoneIds(points, key).map((zoneId) => ({
    key: zoneId,
    label: zoneId,
    points: points.flatMap((p, i) => {
      const v = p[key]?.[zoneId];
      return typeof v === "number" ? [{ i, value: v }] : [];
    }),
  }));
}

/** Zone air temperatures plus outdoor ambient, exactly as the timeseries reports them. */
export function temperatureChart(ts: TimeseriesResponse): ChartData {
  return {
    timestamps: ts.points.map((p) => p.timestamp),
    series: [
      { key: "__ambient", label: "Outdoor", points: ts.points.map((p, i) => ({ i, value: p.ambient_temperature_c })) },
      ...zoneSeries(ts.points, "zone_temperatures_c"),
    ],
  };
}

export function heatingPowerChart(ts: TimeseriesResponse): ChartData {
  return { timestamps: ts.points.map((p) => p.timestamp), series: zoneSeries(ts.points, "heating_power_w") };
}

export function solarGainChart(ts: TimeseriesResponse): ChartData {
  return { timestamps: ts.points.map((p) => p.timestamp), series: zoneSeries(ts.points, "solar_gain_w") };
}

export function hasAnyNonZero(chart: ChartData): boolean {
  return chart.series.some((s) => s.points.some((p) => p.value !== 0));
}

/**
 * Display-only decimation for long series: keeps each bucket's min and max
 * point so peaks survive. Values are never altered or interpolated.
 */
export function decimate(points: SeriesPoint[], maxPoints: number): SeriesPoint[] {
  if (points.length <= maxPoints || maxPoints < 4) return points;
  const bucketSize = Math.ceil(points.length / (maxPoints / 2));
  const out: SeriesPoint[] = [];
  for (let start = 0; start < points.length; start += bucketSize) {
    const bucket = points.slice(start, start + bucketSize);
    let min = bucket[0];
    let max = bucket[0];
    for (const p of bucket) {
      if (p.value < min.value) min = p;
      if (p.value > max.value) max = p;
    }
    if (min === max) out.push(min);
    else if (min.i < max.i) out.push(min, max);
    else out.push(max, min);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Derived display series. Each is plain arithmetic over the backend's own
// hourly series (no model, no interpolation), and each chart says so.
// ---------------------------------------------------------------------------

export interface DailyEnergy {
  /** Calendar day in the timestamps' own offset (YYYY-MM-DD). */
  day: string;
  kwh: number;
  /** Hours of data in this day — the window's first/last day can be partial. */
  hours: number;
}

/**
 * The calendar day (in the timestamp's own UTC offset) on which a step
 * began. M4 stamps each value at the END of its step — a 168-hour window
 * starting at 00:00 runs from 01:00 on day 1 to 00:00 on day 8 — so the
 * value stamped 00:00 belongs to the previous day.
 */
export function stepStartDay(timestamp: string, timestepSeconds: number): string {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(timestamp);
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const startMs = Date.parse(timestamp) - timestepSeconds * 1000;
  return new Date(startMs + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** Solar gain summed over rooms and hours: Σ W × timestep → kWh per day. */
export function dailySolarEnergy(ts: TimeseriesResponse): DailyEnergy[] {
  const hours = ts.timestep_seconds / 3600;
  const byDay = new Map<string, { kwh: number; hours: number }>();
  for (const p of ts.points) {
    const day = stepStartDay(p.timestamp, ts.timestep_seconds);
    const w = Object.values(p.solar_gain_w ?? {}).reduce((s, v) => s + v, 0);
    const cur = byDay.get(day) ?? { kwh: 0, hours: 0 };
    byDay.set(day, { kwh: cur.kwh + (w * hours) / 1000, hours: cur.hours + hours });
  }
  return [...byDay.entries()].map(([day, v]) => ({ day, kwh: v.kwh, hours: v.hours }));
}

/** Indoor minus outdoor air temperature per room (K), per timestep. */
export function deltaTChart(ts: TimeseriesResponse): ChartData {
  const temps = zoneSeries(ts.points, "zone_temperatures_c");
  return {
    timestamps: ts.points.map((p) => p.timestamp),
    series: temps.map((s) => ({
      ...s,
      points: s.points.map((pt) => ({ i: pt.i, value: pt.value - ts.points[pt.i].ambient_temperature_c })),
    })),
  };
}

/** Heater output summed over all rooms (W), per timestep. */
export function totalHeatingChart(ts: TimeseriesResponse): ChartData {
  return {
    timestamps: ts.points.map((p) => p.timestamp),
    series: [
      {
        key: "__total_heating",
        label: "All rooms",
        points: ts.points.map((p, i) => ({ i, value: Object.values(p.heating_power_w ?? {}).reduce((s, v) => s + v, 0) })),
      },
    ],
  };
}
