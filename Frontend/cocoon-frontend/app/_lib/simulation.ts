/**
 * simulation.ts — pure derivations over the RunResults the backend already
 * sends. Shaping, counting and timestamp bookkeeping ONLY — no physics is
 * recomputed here. Anything the response does not carry comes back as `null`
 * and the UI shows "Not available".
 *
 * The RC model's timestep is fixed at 3600 s (thermal_model.TIME_STEP_SECONDS).
 */

import type { PipelineStatus, RunResults, SimLocation } from "./types";
import { SITE_LEH } from "./site";
import { durationTitle, fmtDayTime, fmtDuration, fmtEnergy, fmtTemp } from "./format";

export const TIMESTEP_SECONDS = 3600;

// ---- location -----------------------------------------------------------

export function deriveLocation(r: RunResults): SimLocation {
  return r.location ?? SITE_LEH;
}

// ---- analysis window --------------------------------------------------

export interface DerivedAnalysis {
  startISO: string | null;
  endISO: string | null;
  totalHours: number | null;
  timestepSeconds: number;
  title: string;
}

export function deriveAnalysis(r: RunResults): DerivedAnalysis {
  const ts = deriveTimestamps(r);
  const seriesLen = r.features?.temperature?.series?.indoor_C?.length ?? 0;
  const totalHours =
    r.analysis?.total_hours ??
    r.features?.temperature?.hours ??
    (seriesLen > 0 ? seriesLen : null);

  const startISO = r.analysis?.start_time ?? ts?.[0] ?? null;
  const endISO =
    r.analysis?.end_time ?? (ts && ts.length ? ts[ts.length - 1] : null);

  return {
    startISO,
    endISO,
    totalHours,
    timestepSeconds: r.analysis?.timestep_seconds ?? TIMESTEP_SECONDS,
    title: durationTitle(totalHours),
  };
}

// ---- hourly timestamps ----------------------------------------------

/**
 * A wall-clock timestamp per hourly step, or `null` when the response carries
 * neither an explicit series nor an analysis start time. Callers that get
 * `null` fall back to an "Hour n" axis with a note.
 */
export function deriveTimestamps(r: RunResults): string[] | null {
  const s = r.features?.temperature?.series;
  const n = s?.indoor_C?.length ?? 0;
  if (n === 0) return null;

  if (s?.timestamps && s.timestamps.length === n) return s.timestamps;

  const start = r.analysis?.start_time;
  const step = (r.analysis?.timestep_seconds ?? TIMESTEP_SECONDS) * 1000;
  if (start) {
    const t0 = new Date(start).getTime();
    if (!Number.isNaN(t0)) {
      return Array.from({ length: n }, (_, i) => new Date(t0 + i * step).toISOString());
    }
  }
  return null;
}

// ---- comfort statistics --------------------------------------------

export interface DerivedComfort {
  validHours: number;
  belowHours: number;
  inBandHours: number;
  aboveHours: number;
  comfortPct: number | null;
  belowPct: number | null;
  inBandPct: number | null;
  abovePct: number | null;
  longestBadRunHours: number;
  minC: number | null;
  maxC: number | null;
  minIdx: number | null;
  maxIdx: number | null;
  meanDailyRangeC: number | null;
  lo: number;
  hi: number;
}

export function deriveComfort(r: RunResults): DerivedComfort {
  const lo = r.comfort.band_lo_C;
  const hi = r.comfort.band_hi_C;
  const indoor = (r.features?.temperature?.series?.indoor_C ?? []).filter((v) =>
    Number.isFinite(v),
  );
  const n = indoor.length;

  let below = 0;
  let inBand = 0;
  let above = 0;
  let longestBad = 0;
  let runBad = 0;
  let minC = n ? indoor[0] : null;
  let maxC = n ? indoor[0] : null;
  let minIdx: number | null = n ? 0 : null;
  let maxIdx: number | null = n ? 0 : null;

  indoor.forEach((v, i) => {
    if (v < lo) below++;
    else if (v > hi) above++;
    else inBand++;
    if (v < lo || v > hi) {
      runBad++;
      longestBad = Math.max(longestBad, runBad);
    } else {
      runBad = 0;
    }
    if (minC == null || v < minC) {
      minC = v;
      minIdx = i;
    }
    if (maxC == null || v > maxC) {
      maxC = v;
      maxIdx = i;
    }
  });

  // mean of each calendar day's (max - min); needs 2+ full-ish days
  let meanDailyRange: number | null = null;
  if (n >= 24) {
    const ranges: number[] = [];
    for (let d = 0; d + 24 <= n; d += 24) {
      const day = indoor.slice(d, d + 24);
      ranges.push(Math.max(...day) - Math.min(...day));
    }
    if (ranges.length) meanDailyRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }

  const pct = (c: number) => (n ? (c / n) * 100 : null);

  return {
    validHours: n,
    belowHours: below,
    inBandHours: inBand,
    aboveHours: above,
    comfortPct: pct(inBand),
    belowPct: pct(below),
    inBandPct: pct(inBand),
    abovePct: pct(above),
    longestBadRunHours: longestBad,
    minC,
    maxC,
    minIdx,
    maxIdx,
    meanDailyRangeC: meanDailyRange,
    lo,
    hi,
  };
}

// ---- ANSYS vs Physics comparison ---------------------------------

export interface AnsysComparison {
  designId: number;
  n: number;
  alignedBy: "timestamp" | "index";
  timestamps: (string | null)[];
  physics: number[];
  ansys: number[];
  errors: number[]; // physics - ansys
  physicsMeanC: number;
  ansysMeanC: number;
  maeC: number;
  rmseC: number;
  biasC: number;
  maxAbsErrC: number;
  maxAbsErrIdx: number;
}

export function deriveAnsysComparison(r: RunResults): AnsysComparison | null {
  const a = r.ansys;
  if (!a || !a.series || !a.series.designs?.length) return null;

  const chosen = r.recommendation?.chosen_design_id;
  const design =
    a.series.designs.find((d) => String(d.design_id) === String(chosen)) ??
    a.series.designs[0];

  const rc = design.rc_C ?? [];
  const fem = design.ansys_C ?? [];
  const n = Math.min(rc.length, fem.length);
  if (n === 0) return null;

  const seriesTs = a.series.timestamps;
  const alignedBy: "timestamp" | "index" =
    seriesTs && seriesTs.length >= n ? "timestamp" : "index";

  const physics: number[] = [];
  const ansys: number[] = [];
  const errors: number[] = [];
  const timestamps: (string | null)[] = [];

  for (let i = 0; i < n; i++) {
    const p = rc[i];
    const q = fem[i];
    if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
    physics.push(p);
    ansys.push(q);
    errors.push(p - q);
    timestamps.push(alignedBy === "timestamp" ? seriesTs![i] : null);
  }

  const m = errors.length;
  if (m === 0) return null;

  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const mae = mean(errors.map(Math.abs));
  const rmse = Math.sqrt(mean(errors.map((e) => e * e)));
  const bias = mean(errors);
  let maxAbs = 0;
  let maxIdx = 0;
  errors.forEach((e, i) => {
    if (Math.abs(e) > maxAbs) {
      maxAbs = Math.abs(e);
      maxIdx = i;
    }
  });

  return {
    designId: design.design_id,
    n: m,
    alignedBy,
    timestamps,
    physics,
    ansys,
    errors,
    physicsMeanC: mean(physics),
    ansysMeanC: mean(ansys),
    maeC: mae,
    rmseC: rmse,
    biasC: bias,
    maxAbsErrC: maxAbs,
    maxAbsErrIdx: maxIdx,
  };
}

/** Documented ANSYS-vs-RC agreement bands (ansys-pipeline/VALIDATION_FINDINGS.md). */
export const ANSYS_MAE_VALIDATED_C = 0.25; // mass-inside, solar-aperture window
export const ANSYS_MAE_LIMIT_C = 0.87; // single-node limit with conductive glazing

// ---- pipeline / simulation status -------------------------------

export type SimStatusKey =
  | "preparing"
  | "weather"
  | "physics"
  | "physics_done"
  | "ansys_queued"
  | "ansys_running"
  | "ansys_done"
  | "comparison"
  | "failed";

export interface DerivedStatus {
  key: SimStatusKey;
  label: string;
  tone: "info" | "progress" | "ok" | "error";
  physicsReady: boolean;
  ansys: "none" | "queued" | "running" | "done" | "failed";
}

function stagePhase(status: PipelineStatus | null, stage: string) {
  return status?.stages?.find((s) => s.stage === stage)?.phase ?? null;
}

export function deriveStatus(
  phase: string,
  status: PipelineStatus | null,
  isReal: boolean,
  hasSeries: boolean,
): DerivedStatus {
  const ansysPhase = stagePhase(status, "8_ansys");
  const ansys: DerivedStatus["ansys"] =
    ansysPhase === "ok"
      ? "done"
      : ansysPhase === "failed"
        ? "failed"
        : ansysPhase === "running"
          ? "running"
          : ansysPhase === "pending"
            ? "queued"
            : "none";

  const physicsReady = isReal ? phase === "done" : hasSeries;

  if (phase === "error" || status?.failed) {
    return { key: "failed", label: "Simulation failed", tone: "error", physicsReady, ansys };
  }

  if (phase === "done" || (!isReal && hasSeries)) {
    if (ansys === "done") {
      return {
        key: "comparison",
        label: "Comparison available",
        tone: "ok",
        physicsReady: true,
        ansys,
      };
    }
    if (ansys === "running") {
      return {
        key: "ansys_running",
        label: "Physics model completed · ANSYS running",
        tone: "progress",
        physicsReady: true,
        ansys,
      };
    }
    if (ansys === "failed") {
      return {
        key: "physics_done",
        label: "Physics model completed · ANSYS failed",
        tone: "ok",
        physicsReady: true,
        ansys,
      };
    }
    return {
      key: "physics_done",
      label: "Physics model completed",
      tone: "ok",
      physicsReady: true,
      ansys,
    };
  }

  // still running / submitting
  if (stagePhase(status, "1_weather") === "running") {
    return { key: "weather", label: "Fetching NASA weather", tone: "progress", physicsReady, ansys };
  }
  if (
    stagePhase(status, "8_ansys") === "running"
  ) {
    return { key: "ansys_running", label: "ANSYS running", tone: "progress", physicsReady, ansys };
  }
  if (
    status?.stages?.some((s) => ["5_pool", "6_rank", "7_reliability", "4_features"].includes(s.stage))
  ) {
    return { key: "physics", label: "Running physics model", tone: "progress", physicsReady, ansys };
  }
  if (phase === "submitting" || phase === "running") {
    return { key: "preparing", label: "Preparing inputs", tone: "progress", physicsReady, ansys };
  }
  return { key: "preparing", label: "Preparing inputs", tone: "info", physicsReady, ansys };
}

// ---- "why this design" — measurable reasons only ----------------

export function deriveWhy(r: RunResults): string[] {
  const out: string[] = [];
  const comp = r.comparison ?? [];
  if (comp.length < 2) return out; // a single evaluated design is not "recommended"

  const chosenId = r.recommendation?.chosen_design_id;
  const chosen = comp.find((d) => String(d.design_id) === String(chosenId)) ?? comp[0];
  const others = comp.filter((d) => d !== chosen);
  if (!chosen || !others.length) return out;

  const bestComfort = Math.max(...comp.map((d) => d.comfort_score));
  if (chosen.comfort_score >= bestComfort - 1e-6) {
    out.push(`Highest comfort score of the ${comp.length} ranked designs (${chosen.comfort_score}).`);
  }

  const minSwing = Math.min(...comp.map((d) => d.swing_C));
  if (Number.isFinite(chosen.swing_C) && chosen.swing_C <= minSwing + 1e-6) {
    out.push(`Smallest indoor temperature swing (${chosen.swing_C.toFixed(1)} °C).`);
  }

  const bestTmin = Math.max(...comp.map((d) => d.T_min_C));
  if (Number.isFinite(chosen.T_min_C) && chosen.T_min_C >= bestTmin - 1e-6) {
    out.push(`Warmest worst-hour indoor temperature (${chosen.T_min_C.toFixed(1)} °C).`);
  }

  const runnerUp = comp.find((d) => String(d.design_id) === String(r.recommendation?.runner_up_id));
  if (runnerUp && Number.isFinite(chosen.comfort_score) && Number.isFinite(runnerUp.comfort_score)) {
    const gap = chosen.comfort_score - runnerUp.comfort_score;
    if (gap > 0) {
      out.push(
        `Beats the runner-up (#${runnerUp.design_id}) on the weighted comfort score by ${gap.toFixed(1)} points.`,
      );
    }
  }

  const ansysRow = r.ansys?.rows?.find(
    (row) => String(row.design_id) === String(chosenId),
  );
  if (ansysRow && Number.isFinite(ansysRow.MAE_C)) {
    const bestMae = Math.min(
      ...(r.ansys?.rows ?? []).map((row) => row.MAE_C).filter(Number.isFinite),
    );
    if (ansysRow.MAE_C <= bestMae + 1e-6) {
      out.push(
        `Closest agreement with the independent ANSYS FEM run (MAE ${ansysRow.MAE_C.toFixed(2)} °C).`,
      );
    }
  }

  return out;
}

// ---- "what this means for your shelter" — generated from results (spec §13)

const HEAT_PATH_LABEL: Record<string, string> = {
  wall: "walls",
  roof: "roof",
  floor: "floor",
  window: "windows",
  infiltration: "air exchange",
};

export function deriveMeans(r: RunResults): string[] {
  const out: string[] = [];
  const a = deriveAnalysis(r);
  const c = deriveComfort(r);
  const ts = deriveTimestamps(r);
  const tz = deriveLocation(r).timezone;
  const when = (i: number | null) =>
    i != null && ts?.[i] ? fmtDayTime(ts[i], tz) : i != null ? `hour ${i}` : "an unknown hour";

  // 1. did it stay in the comfort band?
  if (c.validHours > 0 && c.comfortPct != null) {
    if (c.inBandHours === c.validHours) {
      out.push(
        `Indoor temperature stayed inside the ${c.lo}–${c.hi} °C comfort band for all ${c.validHours} simulated hours.`,
      );
    } else if (c.inBandHours === 0) {
      const side = c.belowHours >= c.aboveHours ? "below" : "above";
      out.push(
        `Indoor temperature stayed ${side} the ${c.lo}–${c.hi} °C comfort band for the whole ${fmtDuration(a.totalHours)} — it never entered the comfort range.`,
      );
    } else {
      out.push(
        `Indoor temperature was inside the ${c.lo}–${c.hi} °C comfort band for ${c.comfortPct.toFixed(0)}% of the ${c.validHours} simulated hours (${c.belowHours} below, ${c.aboveHours} above).`,
      );
    }
  }

  // 2. coldest / warmest
  if (c.minC != null && c.maxC != null) {
    out.push(
      `It was coldest at ${fmtTemp(c.minC)} on ${when(c.minIdx)} and warmest at ${fmtTemp(c.maxC)} on ${when(c.maxIdx)}.`,
    );
  }
  // night bias
  if (ts && c.minIdx != null) {
    const h = new Date(ts[c.minIdx]).getHours();
    if ((h >= 21 || h <= 6) && c.belowHours > 0) {
      out.push("The shelter falls below the comfort range mainly during nighttime hours.");
    }
  }

  // 3. largest envelope heat path
  const split = r.features?.heatflow?.split_percent;
  if (split) {
    const entries = Object.entries(split).filter(([, v]) => Number.isFinite(v));
    if (entries.length) {
      const [key, pct] = entries.reduce((a2, b2) => (b2[1] > a2[1] ? b2 : a2));
      out.push(
        `The ${HEAT_PATH_LABEL[key] ?? key} carry the largest share of envelope heat transfer (${pct.toFixed(0)}%). Increasing their resistance is likely to give the biggest improvement.`,
      );
    }
  }

  // 4. solar help
  const solarWh = r.features?.solar?.total_energy_Wh;
  if (Number.isFinite(solarWh) && (solarWh ?? 0) > 0) {
    let s = `Solar gain through the glazing added ${fmtEnergy(solarWh)} over the period.`;
    if (c.meanDailyRangeC != null && c.meanDailyRangeC > 3) {
      s += " The shelter picks up useful daytime heat but the envelope does not retain enough of it overnight.";
    }
    out.push(s);
  }

  // 5. physics vs ANSYS
  const cmp = deriveAnsysComparison(r);
  if (cmp) {
    out.push(
      cmp.maeC <= ANSYS_MAE_LIMIT_C
        ? `The rapid physics model closely follows the independently simulated ANSYS trend for this case (MAE ${cmp.maeC.toFixed(2)} °C).`
        : `The physics model and the independent ANSYS run differ by an MAE of ${cmp.maeC.toFixed(2)} °C for this case, above the documented single-node agreement band.`,
    );
  }

  // 6. most useful improvement
  const improve = r.recommendation?.improvement_suggestions?.[0];
  if (improve) out.push(improve);

  return out;
}
