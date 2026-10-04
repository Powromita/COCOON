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

// ---------------------------------------------------------------------------
// The recommended design's own run series (GET /optimizations/{id}/timeseries) — the data behind the website's
// three result graphs. Shaped exactly as the website shapes it.
// ---------------------------------------------------------------------------

export type RunSeriesKind = "conditioned" | "free_floating";

/** The backend's per-run series: one row per step with per-zone maps. */
export interface RawRunTimeseries {
  which: string;
  zone_ids: string[];
  points: {
    timestamp: string;
    ambient_c: number;
    zone_temp_c: Record<string, number>;
    zone_heating_w: Record<string, number>;
    zone_solar_w: Record<string, number>;
  }[];
}

/** Maps the run series onto the same TimeseriesResponse the rest of the app charts. */
export function runTimeseriesToResponse(optimizationId: string, which: RunSeriesKind, raw: RawRunTimeseries): TimeseriesResponse {
  const [a, b] = raw.points;
  const stepSeconds = a && b ? Math.round((Date.parse(b.timestamp) - Date.parse(a.timestamp)) / 1000) : 900;
  return {
    simulation_id: `${optimizationId}:${which}`,
    timestep_seconds: stepSeconds > 0 ? stepSeconds : 900,
    points: raw.points.map((p) => ({
      timestamp: p.timestamp,
      ambient_temperature_c: p.ambient_c,
      zone_temperatures_c: p.zone_temp_c,
      heating_power_w: p.zone_heating_w,
      solar_gain_w: p.zone_solar_w,
    })),
  } as TimeseriesResponse;
}

/** Rooms that are not lived in; the website leaves them out of the "inside" average. */
const UNHEATED_BUFFER = new Set(["airlock", "equipment", "storage", "corridor", "battery"]);

function habitableZones(ids: string[]): string[] {
  const heated = ids.filter((z) => !UNHEATED_BUFFER.has(z.toLowerCase()));
  return heated.length > 0 ? heated : ids;
}

function meanOf(values: (number | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => typeof x === "number");
  return v.length > 0 ? v.reduce((s, x) => s + x, 0) / v.length : undefined;
}

/**
 * Graph 1 — inside temperature over the coldest 24 hours of the window: the heated rooms' average, the same rooms
 * with no heater (when that run exists) and outdoor.
 */
export function worstNightChart(conditioned: TimeseriesResponse, free?: TimeseriesResponse): ChartData {
  const pts = conditioned.points;
  const perDay = Math.max(1, Math.round(86400 / conditioned.timestep_seconds));
  let start = 0;
  let coldest = Number.POSITIVE_INFINITY;
  const stride = Math.max(1, Math.round(perDay / 24));
  for (let i = 0; i + perDay <= pts.length; i += stride) {
    let m = Number.POSITIVE_INFINITY;
    for (let j = i; j < i + perDay; j++) m = Math.min(m, pts[j].ambient_temperature_c);
    if (m < coldest) {
      coldest = m;
      start = i;
    }
  }
  const win = pts.slice(start, start + perDay);
  const zones = habitableZones(Object.keys(win[0]?.zone_temperatures_c ?? {}));
  const freeByTime = new Map((free?.points ?? []).map((p) => [p.timestamp, p]));
  const freeZones = habitableZones(Object.keys(free?.points[0]?.zone_temperatures_c ?? {}));

  const inside: SeriesPoint[] = [];
  const passive: SeriesPoint[] = [];
  const outside: SeriesPoint[] = [];
  win.forEach((p, i) => {
    outside.push({ i, value: p.ambient_temperature_c });
    const v = meanOf(zones.map((z) => p.zone_temperatures_c?.[z]));
    if (v !== undefined) inside.push({ i, value: v });
    const f = freeByTime.get(p.timestamp);
    const fv = f ? meanOf(freeZones.map((z) => f.zone_temperatures_c?.[z])) : undefined;
    if (fv !== undefined) passive.push({ i, value: fv });
  });
  return {
    timestamps: win.map((p) => p.timestamp),
    series: [
      { key: "__ambient", label: "Outdoor", points: outside },
      { key: "__inside", label: "Inside (heated rooms)", points: inside },
      ...(passive.length > 0 ? [{ key: "__passive", label: "Inside, no heater", points: passive }] : []),
    ],
  };
}

export interface HeatDemandPoint {
  /** Indoor minus outdoor air temperature, rounded to 3 °C buckets. */
  deltaT: number;
  /** Average heater output (W) over the hours in that bucket. */
  watts: number;
  samples: number;
}

/** Graph 3 — average heater output against the indoor–outdoor temperature gap (hours with a positive gap only). */
export function heatDemandByGap(conditioned: TimeseriesResponse): HeatDemandPoint[] {
  const first = conditioned.points[0];
  if (!first) return [];
  const ids = Object.keys(first.zone_temperatures_c ?? {});
  const zones = (() => {
    const heated = ids.filter((z) => z !== "airlock" && z !== "equipment");
    return heated.length > 0 ? heated : ids;
  })();
  const buckets = new Map<number, number[]>();
  for (const p of conditioned.points) {
    const inside = zones.reduce((s, z) => s + (p.zone_temperatures_c?.[z] ?? 0), 0) / zones.length;
    const dT = Math.round(inside - p.ambient_temperature_c);
    if (dT <= 0) continue;
    const watts = zones.reduce((s, z) => s + (p.heating_power_w?.[z] ?? 0), 0);
    const bucket = Math.round(dT / 3) * 3;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), watts]);
  }
  return [...buckets.entries()]
    .map(([deltaT, v]) => ({ deltaT, watts: v.reduce((a, b) => a + b, 0) / v.length, samples: v.length }))
    .sort((a, b) => a.deltaT - b.deltaT);
}
