/**
 * Mode A ("Design a New Shelter") requirements — the exact user-input contract from
 * COCOON PRD v4 §7.1 (requirements.schema.json) and §3.1. Nothing else is collected in the
 * standard wizard: geometry, assemblies, openings, gains and infiltration are generated or
 * derived by M2/M4 from these fields.
 */

export type WeatherSource = "NASA_POWER" | "IEM_METAR" | "CSV";
export type MissionType = "living_sleeping" | "medical" | "command" | "storage" | "equipment" | "mixed";
export type RoomType = "airlock" | "living" | "sleeping" | "equipment" | "medical" | "command" | "storage";
export type MaterialId = "stone" | "puf" | "rammed_earth" | "adobe" | "straw_clay" | "plywood" | "steel_panel" | "concrete";
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
  /** Solver settings chosen on Review & Launch — not part of the requirements contract. */
  run: {
    hvac_mode: HvacMode;
    heater_benchmark: boolean;
    candidate_count: string;
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

/** IDs as stored in material_properties.json. */
export const MATERIALS: { id: MaterialId; label: string }[] = [
  { id: "stone", label: "Stone" },
  { id: "puf", label: "PUF panel" },
  { id: "rammed_earth", label: "Rammed earth" },
  { id: "adobe", label: "Adobe" },
  { id: "straw_clay", label: "Straw-clay" },
  { id: "plywood", label: "Plywood" },
  { id: "steel_panel", label: "Steel panel" },
  { id: "concrete", label: "Concrete" },
];

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
    analysis_start: "2026-12-07",
    analysis_end: "2027-01-04",
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
    available_material_ids: ["stone", "puf", "plywood", "steel_panel"],
    heater_fuels: ["kerosene"],
    preferred_orientation_deg: null,
  },
  economic_assumption_set_id: "econ_ladakh_expected_v1",
  run: {
    hvac_mode: "ideal_load",
    heater_benchmark: false,
    candidate_count: "24",
  },
};

// ---------------------------------------------------------------------------------------------
// Validation — keys are field paths; values are display messages (translated at render)

export type Errors = Partial<Record<string, string>>;

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const isInt = (n: number) => Number.isInteger(n);

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

export function validateConstraints(c: WizardDraft["constraints"]): Errors {
  const e: Errors = {};
  const fp = num(c.maximum_footprint_m2);
  const capex = num(c.maximum_capex_inr);
  if (!(fp > 0 && fp <= 5000)) e.maximum_footprint_m2 = "Enter a footprint between 1 and 5,000 m²";
  if (!(capex > 0)) e.maximum_capex_inr = "Enter the capital budget in INR";
  if (c.available_material_ids.length === 0) e.available_material_ids = "Select at least one available material";
  if (c.heater_fuels.length === 0) e.heater_fuels = "Select heater fuel availability";
  if (c.preferred_orientation_deg !== null) {
    const o = num(c.preferred_orientation_deg);
    if (!(o >= 0 && o <= 360)) e.preferred_orientation_deg = "Enter 0–360°, or choose no preference";
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
    constraints: validateConstraints(d.constraints),
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
