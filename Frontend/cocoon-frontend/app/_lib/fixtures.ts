/**
 * fixtures.ts — typed mock data.
 *
 * These are the numbers the UI shows until the backend is connected.
 * They mirror a real `run_pipeline.py optimize --seed 7 --ansys` run
 * (chosen design #33). When api.ts is switched to live mode this file
 * is no longer imported by anything.
 */

import type {
  PipelineStatus,
  RankedDesign,
  ReferenceData,
  RunResults,
} from "./types";
import { SITE_LEH } from "./site";

export const MOCK_REFERENCE: ReferenceData = {
  materials: [
    { id: "adobe", display_name: "Adobe (Sun-dried Mud Brick)", thermal_conductivity: 0.13, density: 1900, specific_heat: 1000 },
    { id: "rammed_earth", display_name: "Rammed Earth", thermal_conductivity: 0.8, density: 2000, specific_heat: 900 },
    { id: "straw_clay", display_name: "Straw-Clay", thermal_conductivity: 0.19, density: 600, specific_heat: 1200 },
    { id: "stone_masonry", display_name: "Stone Masonry", thermal_conductivity: 2.3, density: 2400, specific_heat: 900 },
    { id: "wood_timber", display_name: "Wood / Timber", thermal_conductivity: 0.13, density: 500, specific_heat: 1600 },
    { id: "concrete", display_name: "Concrete", thermal_conductivity: 1.13, density: 2300, specific_heat: 880 },
    { id: "reinforced_concrete", display_name: "Reinforced Concrete", thermal_conductivity: 2.3, density: 2400, specific_heat: 880 },
    { id: "puf", display_name: "PUF Insulation", thermal_conductivity: 0.025, density: 40, specific_heat: 1400 },
  ],
  glazing: [
    { id: "single", U_W_m2K: 5.8, SHGC: 0.86 },
    { id: "double", U_W_m2K: 2.8, SHGC: 0.7 },
    { id: "triple", U_W_m2K: 1.8, SHGC: 0.55 },
  ],
  ratio_constraints: [
    { factor: "aspect_ratio", min: 1.0, max: 1.8 },
    { factor: "av_ratio", min: 0.7, max: 1.3 },
    { factor: "wwr_percent", min: 10, max: 20 },
    { factor: "ceiling_height_m", min: 2.3, max: 3.0 },
    { factor: "floor_area_m2", min: 12, max: 32 },
  ],
};

const HOURS = 48;
const t = Array.from({ length: HOURS }, (_, i) => i);
const outdoor = t.map((h) => -22 + 10 * Math.sin((h / 24) * 2 * Math.PI - 1.6));
// a marginal shelter: mostly a few degrees under the comfort band, grazing the
// 15 °C lower edge for a handful of the sunniest afternoon hours
const indoor = t.map((h) => +(12.6 + 3.6 * Math.sin((h / 24) * 2 * Math.PI - 2.2)).toFixed(2));

const round2 = (v: number) => +v.toFixed(2);
const IND_MIN = round2(Math.min(...indoor));
const IND_MAX = round2(Math.max(...indoor));
const IND_MEAN = round2(indoor.reduce((a, b) => a + b, 0) / indoor.length);
const IND_MEDIAN = round2([...indoor].sort((a, b) => a - b)[Math.floor(indoor.length / 2)]);
const BAND_LO = 15;
const BAND_HI = 24;
const nBelow = indoor.filter((v) => v < BAND_LO).length;
const nAbove = indoor.filter((v) => v > BAND_HI).length;
const nIn = HOURS - nBelow - nAbove;
const pct = (n: number) => round2((n / HOURS) * 100);

// a concrete January cold-spell window so the preview shows real dates/axes
const WINDOW_START = "2026-01-10T18:00:00+05:30";
const isoHours = (startISO: string, n: number, stepH = 1): string[] => {
  const t0 = new Date(startISO).getTime();
  return Array.from({ length: n }, (_, i) =>
    new Date(t0 + i * stepH * 3600_000).toISOString(),
  );
};
const TIMESTAMPS = isoHours(WINDOW_START, HOURS);
const ANSYS_START = "2026-01-21T00:00:00+05:30";
const ANSYS_TIMESTAMPS = isoHours(ANSYS_START, 24);

const dayShape = (h: number) => {
  const x = ((h % 24) - 12) / 6;
  return Math.max(0, 1 - x * x);
};
const hourlyLoss = (base: number) =>
  t.map((h) => +(base * (1.4 - 0.9 * dayShape(h))).toFixed(1));
// hourly solar gain (kW): a diurnal pulse, one value per simulated hour
const SOLAR_HOURLY_KW = t.map((h) => +(3.2 * dayShape(h) ** 1.4).toFixed(2));
const SOLAR_DAILY_MJ = Array.from({ length: Math.ceil(HOURS / 24) }, (_, d) =>
  round2(
    SOLAR_HOURLY_KW.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0) * 3.6,
  ),
);

const COMPARISON: RankedDesign[] = [
  { rank: 1, design_id: 33, comfort_score: 8.5, geometry_label: "6.0×4.2×2.6", av_ratio: 1.2, wwr_percent: 14, walls_label: "puf (95 mm) + stone_masonry (430 mm)", roof_label: "puf (110 mm) + wood_timber (160 mm)", floor_label: "puf (80 mm) + concrete (170 mm)", T_min_C: IND_MIN, T_max_C: IND_MAX, swing_C: round2(IND_MAX - IND_MIN), hours_in_band_pct: pct(nIn), shortlisted: true, pareto: true },
  { rank: 2, design_id: 15, comfort_score: -15.5, geometry_label: "6.0×4.2×2.6", av_ratio: 1.2, wwr_percent: 14, walls_label: "puf (70 mm) + rammed_earth (410 mm)", roof_label: "puf (90 mm) + straw_clay (300 mm)", floor_label: "puf (60 mm) + concrete (180 mm)", T_min_C: 0.6, T_max_C: 14.8, swing_C: 14.2, hours_in_band_pct: 0, shortlisted: true, pareto: false },
  { rank: 3, design_id: 6, comfort_score: -23.5, geometry_label: "6.0×4.2×2.6", av_ratio: 1.2, wwr_percent: 14, walls_label: "puf (60 mm) + reinforced_concrete (240 mm)", roof_label: "puf (55 mm) + straw_clay (320 mm)", floor_label: "puf (45 mm) + concrete (150 mm)", T_min_C: -0.1, T_max_C: 14.7, swing_C: 14.8, hours_in_band_pct: 0, shortlisted: true, pareto: false },
  { rank: 4, design_id: 2, comfort_score: -26.0, geometry_label: "6.0×4.2×2.6", av_ratio: 1.2, wwr_percent: 14, walls_label: "adobe (480 mm)", roof_label: "concrete (190 mm)", floor_label: "stone_masonry (300 mm)", T_min_C: -0.2, T_max_C: 14.6, swing_C: 14.7, hours_in_band_pct: 0, shortlisted: false, pareto: false },
  { rank: 5, design_id: 5, comfort_score: -31.3, geometry_label: "6.0×4.2×2.6", av_ratio: 1.2, wwr_percent: 14, walls_label: "straw_clay (380 mm)", roof_label: "wood_timber (180 mm)", floor_label: "concrete (140 mm)", T_min_C: -1.0, T_max_C: 14.7, swing_C: 15.7, hours_in_band_pct: 0, shortlisted: false, pareto: false },
];

export const MOCK_RESULTS: RunResults = {
  run_id: "mock-20260909T165448Z",
  mode: "optimize",
  created_at: TIMESTAMPS[HOURS - 1],
  location: SITE_LEH,
  analysis: {
    start_time: TIMESTAMPS[0],
    end_time: TIMESTAMPS[HOURS - 1],
    timestep_seconds: 3600,
    total_hours: HOURS,
  },
  window: { typical_hours: 168, worst_hours: 48, typical_mean_C: -19.8, worst_min_C: -39.3 },
  resolved: {
    U_wall_W_m2K: 0.23,
    U_roof_W_m2K: 0.18,
    U_floor_W_m2K: 0.26,
    U_window_W_m2K: 1.8,
    C_total_MJ_per_K: 40.4,
    infiltration_UA_W_K: 6.6,
    envelope_mass_t: 84.4,
    envelope_area_m2: 116.0,
    window_to_wall_ratio_pct: 14.3,
  },
  features: {
    temperature: {
      hours: HOURS,
      T_min_C: IND_MIN,
      T_max_C: IND_MAX,
      T_mean_C: IND_MEAN,
      T_median_C: IND_MEDIAN,
      T_final_C: indoor[HOURS - 1],
      outdoor_min_C: round2(Math.min(...outdoor)),
      outdoor_max_C: round2(Math.max(...outdoor)),
      series: {
        t_hours: t,
        indoor_C: indoor,
        outdoor_C: outdoor,
        timestamps: TIMESTAMPS,
        ground_C: t.map(() => -3.6),
      },
    },
    solar: {
      total_energy_Wh: round2(SOLAR_HOURLY_KW.reduce((a, b) => a + b, 0) * 1000),
      total_energy_MJ: round2(SOLAR_HOURLY_KW.reduce((a, b) => a + b, 0) * 3.6),
      peak_irradiance_W_m2: 591,
      peak_gain_W: round2(Math.max(...SOLAR_HOURLY_KW) * 1000),
      avg_irradiance_W_m2: 127,
      capacity_factor_percent: 15.0,
      solar_temp_correlation: 0.87,
      daily_MJ: SOLAR_DAILY_MJ,
      hourly_gain_kW: SOLAR_HOURLY_KW,
    },
    heatflow: {
      total_heat_loss_Wh: 237086,
      peak_hourly_loss_W: 1954,
      avg_hourly_loss_W: 1058,
      peak_temp_difference_C: 32.3,
      avg_temp_difference_C: 19.0,
      split_percent: { wall: 22.9, roof: 8.9, floor: 5.3, window: 30.2, infiltration: 32.6 },
      hourly_by_path: {
        wall: hourlyLoss(242),
        roof: hourlyLoss(94),
        floor: hourlyLoss(56),
        window: hourlyLoss(320),
        infiltration: hourlyLoss(345),
      },
    },
  },
  comfort: {
    target_C: 18,
    band_lo_C: BAND_LO,
    band_hi_C: BAND_HI,
    hours_in_band_pct: pct(nIn),
    hours_below_band_pct: pct(nBelow),
    hours_above_band_pct: pct(nAbove),
    frost_free_pct: pct(indoor.filter((v) => v > 0).length),
    comfort_score: 8.5,
  },
  heating: {
    demand_kWh_per_day: 34.6,
    demand_kWh_total: 242.3,
    fuel_litres_per_day: 4.8,
    fuel_note: "kerosene equivalent to hold ≥ 15 °C (stove η ≈ 0.75, 9.6 kWh/L)",
  },
  highlights: [
    { key: "frost", title: "Frost protection", value: `${pct(indoor.filter((v) => v > 0).length).toFixed(0)}% of hours above 0 °C` },
    { key: "solar", title: "Thermal lag", value: "~4.8 h mass flywheel" },
    { key: "air", title: "Air exchange", value: "0.7 ACH → 33% of envelope loss" },
  ],
  config_echo: {
    footprint_label: "6.6 × 3.69 m (24.3 m²)",
    wall_label: "puf 92 mm + stone_masonry 516 mm",
    roof_label: "puf 103 mm + wood_timber 107 mm",
    floor_label: "puf 81 mm + concrete 156 mm",
    glazing_label: "triple (8.4 m²)",
    air_changes_per_hour: 0.7,
    internal_gain_W: 450,
  },
  comparison: COMPARISON,
  reliability: {
    verdict: "STABLE: design 33 is rank 1 in ≥80% of perturbed rankings — a single winner is defensible.",
    shortlist_ids: [33, 15, 6],
    pareto_ids: [33],
    top3_stable_across_weather: true,
    sensitivity: [
      { design_id: 33, top3_pct: 100 },
      { design_id: 15, top3_pct: 100 },
      { design_id: 6, top3_pct: 91 },
      { design_id: 2, top3_pct: 9 },
      { design_id: 5, top3_pct: 0 },
    ],
    pareto_points: COMPARISON.map((d) => ({
      design_id: d.design_id,
      swing_C: d.swing_C,
      T_min_C: d.T_min_C,
      pareto: d.pareto,
    })),
  },
  ansys: {
    ran: true,
    rankings_agree: true,
    mean_offset_C: 0.1,
    worst_mae_C: 0.27,
    rows: [
      { design_id: 33, RC_Tmin_C: 11.7, ANSYS_Tmin_C: 11.4, RC_Tmean_C: 13.42, ANSYS_Tmean_C: 13.5, RC_Tmax_C: 15.0, ANSYS_Tmax_C: 15.5, MAE_C: 0.27, RMSE_C: 0.31, RC_rank: 1, ANSYS_rank: 1 },
      { design_id: 15, RC_Tmin_C: 10.1, ANSYS_Tmin_C: 10.6, RC_Tmean_C: 12.4, ANSYS_Tmean_C: 12.5, RC_Tmax_C: 15.0, ANSYS_Tmax_C: 15.1, MAE_C: 0.15, RMSE_C: 0.18, RC_rank: 2, ANSYS_rank: 2 },
    ],
    series: {
      t_hours: Array.from({ length: 24 }, (_, i) => i),
      timestamps: ANSYS_TIMESTAMPS,
      outdoor_C: Array.from({ length: 24 }, (_, i) => -28 + 6 * Math.sin((i / 24) * 2 * Math.PI - 1.6)),
      designs: [
        {
          // chosen design — RC tracks the FEM closely (MAE ≈ 0.4 °C)
          design_id: 33,
          rc_C: [15.0, 15.0, 14.9, 14.8, 14.6, 14.4, 14.1, 13.8, 13.5, 13.2, 13.0, 12.9, 12.9, 13.1, 13.4, 13.6, 13.5, 13.2, 12.9, 12.6, 12.3, 12.1, 11.9, 11.7],
          ansys_C: [15.2, 15.4, 15.5, 15.3, 15.0, 14.6, 14.2, 13.7, 13.2, 12.8, 12.6, 12.6, 12.8, 13.2, 13.7, 14.0, 13.9, 13.5, 13.1, 12.7, 12.3, 12.0, 11.7, 11.4],
        },
        {
          design_id: 15,
          rc_C: [15.0, 14.8, 14.5, 14.2, 13.8, 13.4, 13.0, 12.6, 12.2, 11.9, 11.6, 11.5, 11.6, 11.9, 12.3, 12.6, 12.4, 12.0, 11.6, 11.2, 10.9, 10.6, 10.3, 10.1],
          ansys_C: [15.1, 14.9, 14.6, 14.3, 13.9, 13.5, 13.1, 12.7, 12.4, 12.1, 11.9, 11.8, 11.9, 12.2, 12.6, 12.9, 12.7, 12.3, 11.9, 11.6, 11.3, 11.0, 10.8, 10.6],
        },
      ],
    },
  },
  logistics: [
    { design_id: 33, envelope_mass_t: 84.4, material_cost_lakh_inr: 2.28, transportability_1to5: 3.99 },
    { design_id: 15, envelope_mass_t: 94.9, material_cost_lakh_inr: 1.82, transportability_1to5: 3.94 },
    { design_id: 6, envelope_mass_t: 43.8, material_cost_lakh_inr: 1.94, transportability_1to5: 3.29 },
  ],
  recommendation: {
    chosen_design_id: 33,
    runner_up_id: 15,
    thermal_tie: false,
    rank: 1,
    designs_evaluated: COMPARISON.length,
    overall_score: 8.5,
    energy_score: 6.9,
    improvement_suggestions: [
      "Add roof insulation — the roof carries the largest share of envelope conduction.",
      "The shelter stays below the comfort band overnight; a small overnight heat source would close the gap.",
    ],
    justification:
      "Design 33 has the top comfort score of the ranked pool and is stable across weight perturbation and typical/worst-case weather; the independent ANSYS FEM run agrees to within an MAE of 0.27 °C.",
    chosen: {
      geometry_label: "6.6 × 3.69 × 2.86 m",
      walls_label: "puf 92 mm + stone_masonry 516 mm",
      roof_label: "puf 103 mm + wood_timber 107 mm",
      floor_label: "puf 81 mm + concrete 156 mm",
      windows_label: "6 × triple (8.4 m²)",
      comfort_score: 8.5,
      T_min_C: IND_MIN,
      envelope_mass_t: 84.4,
      orientation: "South",
      avg_daily_heat_loss_W: 1058,
    },
  },
  report_md_url: "#mock-report",
};

/**
 * Preview-only scenario presets. `/individual/results?fixture=<name>` in mock
 * mode swaps `MOCK_RESULTS` for one of these so the page can be exercised
 * across durations and ANSYS states without a live backend. Each is a small,
 * honest transform of the base fixture — no invented physics.
 */
export function presetResults(name: string | null): RunResults {
  const base = MOCK_RESULTS;
  if (!name || name === "48h" || name === "with-ansys") return base;

  const clone = (): RunResults => JSON.parse(JSON.stringify(base)) as RunResults;

  const resize = (r: RunResults, hours: number): RunResults => {
    const ts = isoHours(WINDOW_START, hours);
    const wrap = (fn: (h: number) => number) => Array.from({ length: hours }, (_, i) => fn(i));
    const outd = wrap((h) => -22 + 10 * Math.sin((h / 24) * 2 * Math.PI - 1.6));
    const ind = wrap((h) => 8 + 3 * Math.sin((h / 24) * 2 * Math.PI - 2.2));
    r.analysis = { start_time: ts[0], end_time: ts[hours - 1], timestep_seconds: 3600, total_hours: hours };
    r.created_at = ts[hours - 1];
    r.features.temperature.hours = hours;
    r.features.temperature.T_min_C = Math.min(...ind);
    r.features.temperature.T_max_C = Math.max(...ind);
    r.features.temperature.T_mean_C = ind.reduce((a, b) => a + b, 0) / hours;
    r.features.temperature.series = {
      t_hours: wrap((h) => h),
      indoor_C: ind.map((v) => +v.toFixed(2)),
      outdoor_C: outd.map((v) => +v.toFixed(2)),
      timestamps: ts,
      ground_C: wrap(() => -3.6),
    };
    const hb = r.features.heatflow.hourly_by_path;
    (Object.keys(hb) as (keyof typeof hb)[]).forEach((k) => {
      const src = hb[k];
      hb[k] = wrap((h) => src[h % src.length]);
    });
    const sg = r.features.solar.hourly_gain_kW;
    r.features.solar.hourly_gain_kW = wrap((h) => sg[h % sg.length]);
    return r;
  };

  const dropAnsys = (r: RunResults): RunResults => {
    r.ansys = { ran: false, rows: [], rankings_agree: true, mean_offset_C: 0, worst_mae_C: 0, series: null };
    return r;
  };

  const stripNewContract = (r: RunResults): RunResults => {
    // mimic today's live results.json: no location / analysis / timestamps /
    // U-window / recommendation extras — every one falls back to "Not available"
    delete r.created_at;
    delete r.location;
    delete r.analysis;
    delete r.features.temperature.series.timestamps;
    delete r.features.temperature.series.ground_C;
    delete r.resolved.U_window_W_m2K;
    delete r.resolved.envelope_area_m2;
    delete r.resolved.window_to_wall_ratio_pct;
    if (r.recommendation) {
      delete r.recommendation.rank;
      delete r.recommendation.designs_evaluated;
      delete r.recommendation.improvement_suggestions;
      delete r.recommendation.chosen.orientation;
    }
    if (r.ansys?.series) delete r.ansys.series.timestamps;
    return r;
  };

  switch (name) {
    case "24h":
      return resize(clone(), 24);
    case "7day":
      return resize(clone(), 168);
    case "raw-backend":
      return stripNewContract(clone());
    case "physics-only":
    case "missing-ansys":
      return dropAnsys(clone());
    case "single": {
      const r = dropAnsys(clone());
      r.mode = "single";
      delete r.comparison;
      delete r.reliability;
      delete r.recommendation;
      delete r.logistics;
      return r;
    }
    default:
      return base;
  }
}

/** A believable status progression for the polling UI in mock mode. */
export const MOCK_STATUS_SEQUENCE: PipelineStatus[] = [
  { run_id: MOCK_RESULTS.run_id, done: false, failed: false, stages: [{ stage: "1_weather", phase: "running" }] },
  {
    run_id: MOCK_RESULTS.run_id,
    done: false,
    failed: false,
    stages: [
      { stage: "1_weather", phase: "ok" },
      { stage: "5_pool", phase: "ok", note: "35 designs" },
      { stage: "6_rank", phase: "running" },
    ],
  },
  {
    run_id: MOCK_RESULTS.run_id,
    done: false,
    failed: false,
    stages: [
      { stage: "1_weather", phase: "ok" },
      { stage: "5_pool", phase: "ok" },
      { stage: "6_rank", phase: "ok" },
      { stage: "7_reliability", phase: "ok" },
      { stage: "8_ansys", phase: "running" },
    ],
  },
  {
    run_id: MOCK_RESULTS.run_id,
    done: true,
    failed: false,
    stages: [
      { stage: "1_weather", phase: "ok" },
      { stage: "5_pool", phase: "ok" },
      { stage: "6_rank", phase: "ok" },
      { stage: "7_reliability", phase: "ok" },
      { stage: "8_ansys", phase: "ok" },
      { stage: "9_recommend", phase: "ok" },
      { stage: "4_features", phase: "ok" },
      { stage: "10_report", phase: "ok" },
    ],
  },
];
