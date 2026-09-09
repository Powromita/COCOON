/**
 * buildRequest.ts — turns a configure <form> into a typed RunRequest.
 *
 * The form must carry these input `name`s (the configure pages + the
 * shared field components set them):
 *
 *   geometry:  geom.length_m  geom.width_m  geom.height_m
 *   windows:   win.count  win.width_m  win.height_m  win.glazing
 *   layers:    layers.wall  layers.roof  layers.floor   (JSON arrays of {material,thickness_mm})
 *   advanced:  adv.contents_mass_kg  adv.contents_cp  adv.h_inside  adv.h_outside   (optional)
 *   env:       env.ach  env.ground_mode  env.ground_C
 *   gain:      gain.internal_W  gain.initial_C
 *   window:    site.season  site.typical_hours  site.worst_hours
 *   comfort:   comfort.target_C  comfort.band_lo_C  comfort.band_hi_C
 *   optimize:  opt.spec   (JSON OptimizeSpec, present only in optimize mode)
 */

import { MOCK_REFERENCE } from "./fixtures";
import type {
  GlazingType,
  Layer,
  MaterialId,
  OptimizeSpec,
  RunRequest,
  Season,
  ShelterConfig,
} from "./types";

const num = (fd: FormData, k: string, dflt: number): number => {
  const v = fd.get(k);
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
};

const str = (fd: FormData, k: string, dflt: string): string => {
  const v = fd.get(k);
  return typeof v === "string" && v.length ? v : dflt;
};

const jsonArr = <T,>(fd: FormData, k: string, dflt: T[]): T[] => {
  try {
    const v = fd.get(k);
    return typeof v === "string" ? (JSON.parse(v) as T[]) : dflt;
  } catch {
    return dflt;
  }
};

const glazing = (id: GlazingType) =>
  MOCK_REFERENCE.glazing.find((g) => g.id === id) ?? MOCK_REFERENCE.glazing[1];

const DEFAULT_LAYERS: Record<"wall" | "roof" | "floor", Layer[]> = {
  wall: [
    { material: "puf", thickness_mm: 92 },
    { material: "stone_masonry", thickness_mm: 516 },
  ],
  roof: [
    { material: "puf", thickness_mm: 103 },
    { material: "wood_timber", thickness_mm: 107 },
  ],
  floor: [
    { material: "puf", thickness_mm: 81 },
    { material: "concrete", thickness_mm: 156 },
  ],
};

export function buildShelterConfig(fd: FormData): ShelterConfig {
  const count = Math.max(0, Math.round(num(fd, "win.count", 2)));
  const w = num(fd, "win.width_m", 1.2);
  const h = num(fd, "win.height_m", 1.5);
  const g = glazing(str(fd, "win.glazing", "double") as GlazingType);

  const groundMode = str(fd, "env.ground_mode", "annual_mean") as
    | "annual_mean"
    | "manual";

  return {
    geometry: {
      length_m: num(fd, "geom.length_m", 6),
      width_m: num(fd, "geom.width_m", 4),
      height_m: num(fd, "geom.height_m", 2.8),
    },
    walls: jsonArr<Layer>(fd, "layers.wall", DEFAULT_LAYERS.wall),
    roof: jsonArr<Layer>(fd, "layers.roof", DEFAULT_LAYERS.roof),
    floor: jsonArr<Layer>(fd, "layers.floor", DEFAULT_LAYERS.floor),
    windows: {
      area_m2: Number((count * w * h).toFixed(3)),
      U_W_m2K: g.U_W_m2K,
      SHGC: g.SHGC,
      glazing_type: g.id,
      count,
      width_m: w,
      height_m: h,
    },
    contents: {
      mass_kg: num(fd, "adv.contents_mass_kg", 0),
      specific_heat_J_kgK: num(fd, "adv.contents_cp", 0),
    },
    heat_transfer: {
      h_inside_W_m2K: num(fd, "adv.h_inside", 2.5),
      h_outside_W_m2K: num(fd, "adv.h_outside", 10),
    },
    air_changes_per_hour: num(fd, "env.ach", 0.7),
    ground_temperature_mode: groundMode,
    ground_temperature_C: num(fd, "env.ground_C", -3.6),
    internal_heat_gain_W: num(fd, "gain.internal_W", 0),
    initial_temperature_C: num(fd, "gain.initial_C", 15),
  };
}

export function buildRunRequest(
  fd: FormData,
  mode: "single" | "optimize",
): RunRequest {
  const window = {
    season: str(fd, "site.season", "winter") as Season,
    typical_hours: num(fd, "site.typical_hours", mode === "single" ? 72 : 168),
    worst_hours: num(fd, "site.worst_hours", 48),
  };
  const comfort = {
    target_C: num(fd, "comfort.target_C", 18),
    band_lo_C: num(fd, "comfort.band_lo_C", 15),
    band_hi_C: num(fd, "comfort.band_hi_C", 24),
  };

  if (mode === "single") {
    return { mode: "single", config: buildShelterConfig(fd), window, comfort };
  }

  let spec: OptimizeSpec | undefined;
  try {
    const raw = fd.get("opt.spec");
    spec = typeof raw === "string" ? (JSON.parse(raw) as OptimizeSpec) : undefined;
  } catch {
    spec = undefined;
  }

  return {
    mode: "optimize",
    base_config: buildShelterConfig(fd),
    window,
    comfort,
    optimize: spec ?? {
      designs: 50,
      seed: 0,
      trials: 400,
      constraints: MOCK_REFERENCE.ratio_constraints,
      allowed_materials: MOCK_REFERENCE.materials.map((m) => m.id) as MaterialId[],
      run_ansys: false,
      ansys_hours: 24,
      ansys_designs: 2,
    },
  };
}
