import type { RunRequest, ShelterConfig } from "./types";

/** A canned, valid config — used by the "Run demo analysis" button on the
 * results pages so the pipeline can be exercised without filling the form. */
export const DEMO_CONFIG: ShelterConfig = {
  geometry: { length_m: 6, width_m: 4, height_m: 2.8 },
  walls: [
    { material: "puf", thickness_mm: 80 },
    { material: "stone_masonry", thickness_mm: 400 },
  ],
  roof: [
    { material: "puf", thickness_mm: 90 },
    { material: "wood_timber", thickness_mm: 120 },
  ],
  floor: [
    { material: "puf", thickness_mm: 60 },
    { material: "concrete", thickness_mm: 150 },
  ],
  windows: { area_m2: 3.6, U_W_m2K: 2.8, SHGC: 0.7, glazing_type: "double", count: 2, width_m: 1.2, height_m: 1.5 },
  contents: { mass_kg: 0, specific_heat_J_kgK: 0 },
  heat_transfer: { h_inside_W_m2K: 2.5, h_outside_W_m2K: 10 },
  air_changes_per_hour: 0.7,
  ground_temperature_mode: "annual_mean",
  ground_temperature_C: -3.6,
  internal_heat_gain_W: 450,
  initial_temperature_C: 15,
};

export function demoRequest(mode: "single" | "optimize"): RunRequest {
  const window = { season: "winter" as const, typical_hours: mode === "single" ? 48 : 72, worst_hours: 48 };
  const comfort = { target_C: 18, band_lo_C: 15, band_hi_C: 24 };
  if (mode === "single") {
    return { mode: "single", config: DEMO_CONFIG, window, comfort };
  }
  return {
    mode: "optimize",
    window,
    comfort,
    optimize: {
      designs: 18,
      seed: 3,
      trials: 120,
      geometry: { length_m: 6, width_m: 4, height_m: 2.8 },
      window_count: 2,
      window_width_m: 1.2,
      window_height_m: 1.4,
      door_count: 1,
      run_ansys: false,
      ansys_hours: 24,
      ansys_designs: 2,
    },
  };
}
