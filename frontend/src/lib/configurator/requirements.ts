/**
 * Mode A ("Design a New Shelter") requirements — the exact user-input contract from
 * COCOON PRD v4 §7.1 (requirements.schema.json) and §3.1. Nothing else is collected in the
 * standard wizard: geometry, assemblies, openings, gains and infiltration are generated or
 * derived by M2/M4 from these fields.
 */

export type WeatherSource = "NASA_POWER" | "IEM_METAR" | "CSV";
export type MissionType = "living_sleeping" | "medical" | "command" | "storage" | "equipment" | "mixed";
export type RoomType = "airlock" | "living" | "sleeping" | "equipment" | "medical" | "command" | "storage";
/**
 * IDs of the M0 MaterialSnapshot the backend actually loads for every optimization run
 * (backend/routes/pipeline.py `_materials(None)` -> m3_data.materials_store.standard_snapshot(),
 * i.e. packages/packages/contracts/fixtures/valid/material_snapshot_standard.json). The wizard
 * never sends a materials_snapshot_id, so these four are the only ids the pipeline recognizes —
 * anything else silently matches nothing and leaves M2 with no material to build a wall from
 * (composition:no_materials_for_wall). Do not add ids here without also adding them to that
 * snapshot file.
 */
export type MaterialId = "mat_stone" | "mat_puf" | "mat_plywood" | "mat_concrete";
export type HeaterFuel = "kerosene" | "electric" | "none";
export type MaxFloors = 1 | 2 | null; // null = system decides
export type HvacMode = "free_floating" | "ideal_load" | "capacity_limited";

export type WizardDraft = {
  site: {
    latitude_deg: string;
    longitude_deg: string;
    elevation_m: string;
    /** yyyy-mm-dd (converted to timezone-aware ISO timestamps in the contract) */
    analysis_start: string;
    analysis_end: string;
    weather_source: WeatherSource;
    /** Only when weather_source === "CSV"; the file itself is uploaded at launch. */
    weather_csv_name: string | null;
  };
  mission: {
    type: MissionType;
    occupants: string;
    required_rooms: RoomType[];
    target_temperature_c: string;
    maximum_unmet_hours: string;
  };
  constraints: {
    maximum_footprint_m2: string;
    maximum_floors: MaxFloors;
    maximum_capex_inr: string;
    available_material_ids: MaterialId[];
    heater_fuels: HeaterFuel[];
    /** null = no preference */
    preferred_orientation_deg: string | null;
  };
  economic_assumption_set_id: string;
  /** Explicit construction and thermal inputs, applied by the generator and RC verifier. */
  design: {
    length_m: string; width_m: string; height_m: string; shape: "rectangular";
    wall_thickness_mm: string; roof_thickness_mm: string; floor_thickness_mm: string;
    window_count: string; window_width_m: string; window_height_m: string;
    window_orientation: "north" | "east" | "south" | "west"; glazing: "single" | "double" | "triple" | "none";
    air_changes_per_hour: string; initial_temperature_c: string;
  };
  /** Solver settings chosen on Review & Launch — not part of the requirements contract. */
  run: {
    hvac_mode: HvacMode;
    heater_benchmark: boolean;
    candidate_count: string;
    run_ansys: boolean;
    ansys_designs: 1 | 2;
  };
};

// ---------------------------------------------------------------------------------------------
// Option lists (IDs are contract values; labels are display text and go through i18n)

export const TIMEZONE = "Asia/Kolkata";
export const TIMEZONE_OFFSET = "+05:30";

export const WEATHER_SOURCES: { id: WeatherSource; label: string; hint: string }[] = [
  { id: "NASA_POWER", label: "NASA POWER", hint: "Hourly reanalysis for the coordinates (default)" },
  { id: "IEM_METAR", label: "IEM METAR", hint: "Nearest airport station observations" },
  { id: "CSV", label: "CSV upload", hint: "Your own hourly weather file" },
];

export const MISSION_TYPES: { id: MissionType; label: string }[] = [
  { id: "living_sleeping", label: "Living & sleeping" },
  { id: "medical", label: "Medical" },
  { id: "command", label: "Command" },
  { id: "storage", label: "Storage" },
  { id: "equipment", label: "Equipment" },
  { id: "mixed", label: "Mixed use" },
];

export const ROOM_TYPES: { id: RoomType; label: string }[] = [
  { id: "airlock", label: "Airlock" },
  { id: "living", label: "Living" },
  { id: "sleeping", label: "Sleeping" },
  { id: "equipment", label: "Equipment" },
  { id: "medical", label: "Medical" },
  { id: "command", label: "Command" },
  { id: "storage", label: "Storage" },
];

/** IDs as stored in the standard MaterialSnapshot (see MaterialId doc comment above). */
export const MATERIALS: { id: MaterialId; label: string; structural: boolean }[] = [
  { id: "mat_stone", label: "Granite / Field Stone", structural: true },
  { id: "mat_plywood", label: "Marine Grade Structural Plywood", structural: true },
  { id: "mat_concrete", label: "Dense Concrete", structural: true },
  { id: "mat_puf", label: "PUF (Polyurethane Foam) — insulation only", structural: false },
];

/** M2 needs at least one structural/masonry material to build a wall; insulation alone isn't buildable. */
export const STRUCTURAL_MATERIAL_IDS: MaterialId[] = MATERIALS.filter((m) => m.structural).map((m) => m.id);

/**
 * design_generator/candidate_generator.py's DEFAULT_THICKNESS_MM gives mat_stone an explicit wall and
 * floor thickness row but no roof row ("the CSV has no stone roof") — and a material with ANY explicit
 * row is excluded from the generic category-thickness fallback entirely, so mat_stone can never roof a
 * building. Only these two can. Selecting materials without one of them fails composition:no_materials_for_roof.
 */
export const ROOF_CAPABLE_MATERIAL_IDS: MaterialId[] = ["mat_plywood", "mat_concrete"];

export const HEATER_FUELS: { id: HeaterFuel; label: string }[] = [
  { id: "kerosene", label: "Kerosene" },
  { id: "electric", label: "Electric" },
  { id: "none", label: "None (passive only)" },
];

export const FLOOR_OPTIONS: { value: MaxFloors; label: string }[] = [
  { value: 1, label: "1 floor" },
  { value: 2, label: "Up to 2 floors" },
  { value: null, label: "System decides" },
];

/** Friendly picker over the versioned assumption sets stored by M7. */
export const ECONOMIC_ASSUMPTION_SETS: { id: string; label: string; hint: string }[] = [
  { id: "econ_ladakh_expected_v1", label: "Expected", hint: "Central estimates for fuel, logistics and material prices" },
  { id: "econ_ladakh_conservative_v1", label: "Conservative", hint: "Higher fuel and airlift costs — stress-tests the budget" },
  { id: "econ_ladakh_optimistic_v1", label: "Optimistic", hint: "Lower price path — best-case lifecycle cost" },
];

export const HVAC_MODES: { id: HvacMode; label: string; hint: string }[] = [
  { id: "free_floating", label: "Free-floating", hint: "No heater — measures passive performance" },
  { id: "ideal_load", label: "Conditioned (ideal load)", hint: "Energy required to hold the target temperature" },
  { id: "capacity_limited", label: "Conditioned (capacity-limited)", hint: "Real heater capacity; reports unmet hours" },
];

// ---------------------------------------------------------------------------------------------
// Defaults — DBO sector grid reference and a winter-solstice window (Dec 21 ± 14 days)

export const DEFAULT_DRAFT: WizardDraft = {
  site: {
    latitude_deg: "35.234",
    longitude_deg: "77.892",
    elevation_m: "5065",
    // Weather comes from a fixed historical archive (data/weather/cache/*_weather_archive.meta.json),
    // not a live forecast — the window must fall inside its recorded years or the run fails with
    // WEATHER_WINDOW_EMPTY. Use the most recently completed winter, never a future date range.
    analysis_start: "2025-12-07",
    analysis_end: "2026-01-04",
    weather_source: "NASA_POWER",
    weather_csv_name: null,
  },
  mission: {
    type: "living_sleeping",
    occupants: "12",
    required_rooms: ["airlock", "living", "sleeping"],
    target_temperature_c: "18",
    maximum_unmet_hours: "4",
  },
  constraints: {
    maximum_footprint_m2: "48",
    maximum_floors: null,
    maximum_capex_inr: "",
    available_material_ids: ["mat_stone", "mat_plywood", "mat_concrete", "mat_puf"],
    heater_fuels: ["kerosene"],
    preferred_orientation_deg: null,
  },
  economic_assumption_set_id: "econ_ladakh_expected_v1",
  design: {
    length_m: "7.0", width_m: "5.0", height_m: "2.8", shape: "rectangular",
    wall_thickness_mm: "350", roof_thickness_mm: "280", floor_thickness_mm: "220",
    window_count: "4", window_width_m: "1.2", window_height_m: "1.2", window_orientation: "south", glazing: "double",
    air_changes_per_hour: "0.8", initial_temperature_c: "5.0",
  },
  run: {
    hvac_mode: "ideal_load",
    heater_benchmark: false,
    candidate_count: "100",
    run_ansys: true,
    ansys_designs: 1,
  },
};

// ---------------------------------------------------------------------------------------------
// Validation — keys are field paths; values are display messages (translated at render)

export type Errors = Partial<Record<string, string>>;

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const isInt = (n: number) => Number.isInteger(n);

/**
 * NASA_POWER/IEM_METAR are served from a fixed, pre-downloaded historical archive
 * (data/weather/cache/*_weather_archive.meta.json), not a live forecast API — a window outside
 * its recorded years fails at launch with WEATHER_WINDOW_EMPTY. Keep this in sync with that file's
 * covered range if it's ever re-fetched with a different span.
 */
export const WEATHER_ARCHIVE_START = "2006-09-19";
export const WEATHER_ARCHIVE_END = "2026-09-19";

export function validateSite(s: WizardDraft["site"]): Errors {
  const e: Errors = {};
  const lat = num(s.latitude_deg);
  const lon = num(s.longitude_deg);
  const elev = num(s.elevation_m);
  if (!(lat >= -90 && lat <= 90)) e.latitude_deg = "Enter a latitude between -90 and 90";
  if (!(lon >= -180 && lon <= 180)) e.longitude_deg = "Enter a longitude between -180 and 180";
  if (!(elev >= -500 && elev <= 9000)) e.elevation_m = "Enter an elevation between -500 and 9,000 m";
  if (!s.analysis_start) e.analysis_start = "Choose a start date";
  if (!s.analysis_end) e.analysis_end = "Choose an end date";
  if (s.analysis_start && s.analysis_end && s.analysis_end <= s.analysis_start)
    e.analysis_end = "End date must be after the start date";
  if (s.weather_source === "CSV" && !s.weather_csv_name) e.weather_csv_name = "Attach an hourly weather CSV";
  if (s.weather_source !== "CSV" && s.analysis_start && s.analysis_end) {
    if (s.analysis_start < WEATHER_ARCHIVE_START || s.analysis_end > WEATHER_ARCHIVE_END) {
      e.analysis_end =
        `Historical weather is only available from ${WEATHER_ARCHIVE_START} to ${WEATHER_ARCHIVE_END} — ` +
        "pick a window inside that range (e.g. last winter), or switch to a CSV upload for other dates.";
    }
  }
  return e;
}

export function validateMission(m: WizardDraft["mission"]): Errors {
  const e: Errors = {};
  const occ = num(m.occupants);
  const t = num(m.target_temperature_c);
  const unmet = num(m.maximum_unmet_hours);
  if (!(isInt(occ) && occ >= 1 && occ <= 500)) e.occupants = "Occupants must be a whole number from 1 to 500";
  if (m.required_rooms.length === 0) e.required_rooms = "Select at least one room type";
  if (!(t >= 5 && t <= 30)) e.target_temperature_c = "Enter a comfort target between 5 and 30 °C";
  if (!(unmet >= 0 && unmet <= 168)) e.maximum_unmet_hours = "Enter 0–168 hours per week";
  return e;
}

/**
 * Mirrors design_generator/requirement_parser.py's DEFAULT_SIZING + feasibility rule exactly, so the
 * wizard can reject an infeasible footprint/room/occupant combination before launch instead of letting
 * the backend reject it after the fact (see AGENTS.md pinned memory on the M2 preflight check).
 * Any change to the Python sizing table must be mirrored here.
 */
const ROOM_SIZING: Record<RoomType, { fixed_m2: number; per_person_m2: number }> = {
  airlock: { fixed_m2: 3.0, per_person_m2: 0.0 },
  living: { fixed_m2: 0.0, per_person_m2: 0.8 },
  sleeping: { fixed_m2: 0.0, per_person_m2: 1.2 },
  equipment: { fixed_m2: 4.0, per_person_m2: 0.1 },
  storage: { fixed_m2: 2.0, per_person_m2: 0.1 },
  command: { fixed_m2: 6.0, per_person_m2: 0.5 },
  medical: { fixed_m2: 9.0, per_person_m2: 0.3 },
};
const CIRCULATION_FACTOR = 1.1;
const STAIR_ALLOWANCE_M2 = 3.0;

/** Total floor area (incl. circulation) the selected rooms need, before any footprint constraint. */
export function requiredAreaM2(rooms: RoomType[], occupants: number): number {
  const areaSum = rooms.reduce((s, r) => s + ROOM_SIZING[r].fixed_m2 + ROOM_SIZING[r].per_person_m2 * occupants, 0);
  return areaSum * CIRCULATION_FACTOR;
}

/** usable_area(F) = F * footprint - 2*(F-1)*stair_allowance, same as the backend. */
function usableAreaM2(footprint: number, floors: number): number {
  return floors * footprint - 2 * (floors - 1) * STAIR_ALLOWANCE_M2;
}

/** The backend treats "system decides" (null) as 1 floor for feasibility, not "try up to the max". */
function effectiveMaxFloors(maximumFloors: MaxFloors): number {
  return maximumFloors ?? 1;
}

/** Smallest footprint (m²) that fits `required` m² at the given floor count. */
function minFootprintForFloors(required: number, floors: number): number {
  return (required + 2 * (floors - 1) * STAIR_ALLOWANCE_M2) / floors;
}

export function validateConstraints(c: WizardDraft["constraints"], mission: WizardDraft["mission"]): Errors {
  const e: Errors = {};
  const fp = num(c.maximum_footprint_m2);
  const capex = num(c.maximum_capex_inr);
  if (!(fp > 0 && fp <= 5000)) e.maximum_footprint_m2 = "Enter a footprint between 1 and 5,000 m²";
  if (!(capex > 0)) e.maximum_capex_inr = "Enter the capital budget in INR";
  if (c.available_material_ids.length === 0) {
    e.available_material_ids = "Select at least one available material";
  } else if (!c.available_material_ids.some((m) => (STRUCTURAL_MATERIAL_IDS as string[]).includes(m))) {
    e.available_material_ids = "Select at least one structural material (Stone, Plywood or Concrete) — insulation alone can't build a wall";
  } else if (!c.available_material_ids.some((m) => (ROOF_CAPABLE_MATERIAL_IDS as string[]).includes(m))) {
    e.available_material_ids = "Select Plywood or Concrete — Stone alone has no roof thickness data and can't roof the building";
  }
  if (c.heater_fuels.length === 0) e.heater_fuels = "Select heater fuel availability";
  if (c.preferred_orientation_deg !== null) {
    const o = num(c.preferred_orientation_deg);
    if (!(o >= 0 && o <= 360)) e.preferred_orientation_deg = "Enter 0–360°, or choose no preference";
  }
  // Feasibility: the selected rooms (at the given occupancy) must fit in the footprint/floors.
  const occ = num(mission.occupants);
  if (!e.maximum_footprint_m2 && fp > 0 && mission.required_rooms.length > 0 && Number.isFinite(occ) && occ > 0) {
    const required = requiredAreaM2(mission.required_rooms, occ);
    const floors = effectiveMaxFloors(c.maximum_floors);
    const usable = usableAreaM2(fp, floors);
    if (usable < required) {
      const minFp = Math.ceil(minFootprintForFloors(required, floors) * 10) / 10;
      e.maximum_footprint_m2 =
        `Selected rooms need ${required.toFixed(1)} m² (incl. circulation) but only ${usable.toFixed(1)} m² is usable ` +
        `at ${floors} floor(s). Increase footprint to at least ${minFp} m², or add a floor.`;
    }
  }
  return e;
}

export function validateEconomics(id: string): Errors {
  return ECONOMIC_ASSUMPTION_SETS.some((s) => s.id === id) ? {} : { economic_assumption_set_id: "Choose an assumption set" };
}

export function validateRun(r: WizardDraft["run"], canTuneCandidates: boolean): Errors {
  const e: Errors = {};
  if (canTuneCandidates) {
    const n = num(r.candidate_count);
    if (!(isInt(n) && n >= 1 && n <= 200)) e.candidate_count = "Candidate count must be 1–200";
  }
  return e;
}

export type StepKey = "site" | "mission" | "constraints" | "economics";

export function stepErrors(d: WizardDraft): Record<StepKey, Errors> {
  return {
    site: validateSite(d.site),
    mission: validateMission(d.mission),
    constraints: validateConstraints(d.constraints, d.mission),
    economics: validateEconomics(d.economic_assumption_set_id),
  };
}

// ---------------------------------------------------------------------------------------------
// Contract serialisation — requirements.schema.json v4.0

export function toRequirements(d: WizardDraft) {
  const occupants = Math.round(Number(d.mission.occupants));
  return {
    schema_version: "4.0",
    project_id: null as string | null, // assigned by the backend when the project is created
    mode: "new_shelter",
    site: {
      latitude_deg: Number(d.site.latitude_deg),
      longitude_deg: Number(d.site.longitude_deg),
      elevation_m: Number(d.site.elevation_m),
      timezone: TIMEZONE,
      weather_source: d.site.weather_source,
      analysis_start: `${d.site.analysis_start}T00:00:00${TIMEZONE_OFFSET}`,
      analysis_end: `${d.site.analysis_end}T00:00:00${TIMEZONE_OFFSET}`,
    },
    mission: {
      type: d.mission.type,
      occupants,
      required_rooms: d.mission.required_rooms,
      // Derived default schedule (continuous occupancy); editable in the Advanced step.
      occupancy_schedule_id: `continuous_${occupants}`,
      target_temperature_c: Number(d.mission.target_temperature_c),
      maximum_unmet_hours: Number(d.mission.maximum_unmet_hours),
    },
    constraints: {
      maximum_footprint_m2: Number(d.constraints.maximum_footprint_m2),
      maximum_floors: d.constraints.maximum_floors,
      maximum_capex_inr: Number(d.constraints.maximum_capex_inr),
      available_material_ids: d.constraints.available_material_ids,
      heater_fuels: d.constraints.heater_fuels,
      preferred_orientation_deg:
        d.constraints.preferred_orientation_deg === null ? null : Number(d.constraints.preferred_orientation_deg),
    },
    economic_assumption_set_id: d.economic_assumption_set_id,
  };
}

export function toRunOptions(d: WizardDraft, canTuneCandidates: boolean) {
  return {
    hvac_mode: d.run.hvac_mode,
    heater_benchmark: d.run.heater_benchmark,
    ...(canTuneCandidates ? { candidate_count: Math.round(Number(d.run.candidate_count)) } : {}),
    weather_csv: d.site.weather_source === "CSV" ? d.site.weather_csv_name : null,
  };
}

export function toDesignOptions(d: WizardDraft) {
  return {
    length_m: Number(d.design.length_m), width_m: Number(d.design.width_m), height_m: Number(d.design.height_m),
    shape: d.design.shape, wall_thickness_mm: Number(d.design.wall_thickness_mm), roof_thickness_mm: Number(d.design.roof_thickness_mm),
    floor_thickness_mm: Number(d.design.floor_thickness_mm), window_count: Math.round(Number(d.design.window_count)),
    window_width_m: Number(d.design.window_width_m), window_height_m: Number(d.design.window_height_m),
    window_orientation: d.design.window_orientation, glazing: d.design.glazing,
    air_changes_per_hour: Number(d.design.air_changes_per_hour), initial_temperature_c: Number(d.design.initial_temperature_c),
    require_separate_rooms: true,
  };
}
