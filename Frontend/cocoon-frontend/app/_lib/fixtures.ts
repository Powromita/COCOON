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
const indoor = t.map((h) => 8 + 3 * Math.sin((h / 24) * 2 * Math.PI - 2.2));

const dayShape = (h: number) => {
  const x = ((h % 24) - 12) / 6;
  return Math.max(0, 1 - x * x);
};
const hourlyLoss = (base: number) =>
  t.map((h) => base * (1.4 - 0.9 * dayShape(h)));

const COMPARISON: RankedDesign[] = [
  { rank: 1, design_id: 33, comfort_score: 8.5, geometry_label: "6.6×3.69×2.86", av_ratio: 1.2, wwr_percent: 14, T_min_C: 3.9, T_max_C: 14.8, swing_C: 10.9, hours_in_band_pct: 0, shortlisted: true, pareto: true },
  { rank: 2, design_id: 15, comfort_score: -15.5, geometry_label: "4.84×4.58×2.94", av_ratio: 1.19, wwr_percent: 10, T_min_C: 0.6, T_max_C: 14.8, swing_C: 14.2, hours_in_band_pct: 0, shortlisted: true, pareto: false },
  { rank: 3, design_id: 6, comfort_score: -23.5, geometry_label: "4.97×4.54×2.31", av_ratio: 1.28, wwr_percent: 13, T_min_C: -0.1, T_max_C: 14.7, swing_C: 14.8, hours_in_band_pct: 0, shortlisted: true, pareto: false },
  { rank: 4, design_id: 2, comfort_score: -26.0, geometry_label: "6.58×3.77×2.89", av_ratio: 1.18, wwr_percent: 19, T_min_C: -0.2, T_max_C: 14.6, swing_C: 14.7, hours_in_band_pct: 0, shortlisted: false, pareto: false },
  { rank: 5, design_id: 5, comfort_score: -31.3, geometry_label: "5.0×3.81×2.91", av_ratio: 1.27, wwr_percent: 11, T_min_C: -1.0, T_max_C: 14.7, swing_C: 15.7, hours_in_band_pct: 0, shortlisted: false, pareto: false },
];

export const MOCK_RESULTS: RunResults = {
  run_id: "mock-20260909T165448Z",
  mode: "optimize",
  window: { typical_hours: 168, worst_hours: 48, typical_mean_C: -19.8, worst_min_C: -39.3 },
  resolved: {
    U_wall_W_m2K: 0.23,
    U_roof_W_m2K: 0.18,
    U_floor_W_m2K: 0.26,
    C_total_MJ_per_K: 40.4,
    infiltration_UA_W_K: 6.6,
    envelope_mass_t: 84.4,
  },
  features: {
    temperature: {
      hours: HOURS,
      T_min_C: 3.88,
      T_max_C: 14.81,
      T_mean_C: 8.33,
      T_median_C: 7.79,
      T_final_C: 3.88,
      outdoor_min_C: -31.14,
      outdoor_max_C: -9.22,
      series: { t_hours: t, indoor_C: indoor, outdoor_C: outdoor },
    },
    solar: {
      total_energy_Wh: 112267,
      total_energy_MJ: 404,
      peak_irradiance_W_m2: 591,
      peak_gain_W: 3197,
      avg_irradiance_W_m2: 127,
      capacity_factor_percent: 15.0,
      solar_temp_correlation: 0.87,
      daily_MJ: [42.0, 44.2, 34.9, 41.1, 38.5, 40.4, 39.8],
      hourly_gain_kW: [0, 0, 0, 0, 0, 0, 0.2, 0.9, 1.6, 2.4, 3.0, 3.2, 2.9, 2.3, 1.4, 0.6, 0.1, 0, 0, 0, 0, 0, 0, 0],
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
    band_lo_C: 15,
    band_hi_C: 24,
    hours_in_band_pct: 0,
    hours_below_band_pct: 100,
    hours_above_band_pct: 0,
    frost_free_pct: 100,
    comfort_score: 8.5,
  },
  heating: {
    demand_kWh_per_day: 34.6,
    demand_kWh_total: 242.3,
    fuel_litres_per_day: 4.8,
    fuel_note: "kerosene equivalent to hold ≥ 15 °C (stove η ≈ 0.75, 9.6 kWh/L)",
  },
  highlights: [
    { key: "frost", title: "Frost protected", value: "100% of hours above 0 °C" },
    { key: "solar", title: "Solar retention", value: "~4.8 h thermal lag (mass flywheel)" },
    { key: "air", title: "Air exchange", value: "0.7 ACH — 27% of total loss" },
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
    mean_offset_C: 1.9,
    worst_mae_C: 1.19,
    rows: [
      { design_id: 33, RC_Tmin_C: 11.29, ANSYS_Tmin_C: 14.07, RC_Tmean_C: 13.0, ANSYS_Tmean_C: 14.97, RC_Tmax_C: 15.01, ANSYS_Tmax_C: 16.64, MAE_C: 1.19, RMSE_C: 1.48, RC_rank: 1, ANSYS_rank: 1 },
      { design_id: 15, RC_Tmin_C: 9.84, ANSYS_Tmin_C: 11.51, RC_Tmean_C: 12.11, ANSYS_Tmean_C: 12.8, RC_Tmax_C: 14.94, ANSYS_Tmax_C: 15.08, MAE_C: 0.6, RMSE_C: 0.66, RC_rank: 2, ANSYS_rank: 2 },
    ],
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
    justification:
      "ANSYS FEM: designs 2.17 °C apart, above the 1.19 °C model error → a real difference; design 33 has the top comfort score and is stable across weight perturbation and typical/worst-case weather.",
    chosen: {
      geometry_label: "6.6 × 3.69 × 2.86 m",
      walls_label: "puf 92 mm + stone_masonry 516 mm",
      roof_label: "puf 103 mm + wood_timber 107 mm",
      floor_label: "puf 81 mm + concrete 156 mm",
      windows_label: "6 × triple (8.4 m²)",
      comfort_score: 8.5,
      T_min_C: 3.88,
      envelope_mass_t: 84.4,
    },
  },
  report_md_url: "#mock-report",
};

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
