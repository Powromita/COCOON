/**
 * COCOON Shelter Configurator Requirements & State Definition
 * Strict contract representation matching pipeline & DRDO problem statement specifications.
 */

export type MissionType = "living_sleeping" | "living" | "sleeping" | "command" | "medical";
export type RoomType = "airlock" | "living" | "sleeping" | "equipment" | "medical" | "command" | "storage";

export type MaterialId =
  | "mat_stone"
  | "mat_puf"
  | "mat_plywood"
  | "mat_concrete"
  | "mat_steel_panel"
  | "mat_adobe"
  | "mat_rammed_earth"
  | "mat_straw_clay"
  | "mat_wood_timber"
  | "mat_reinforced_concrete";

export type HeaterFuel = "kerosene" | "electricity" | "none";
export type WindowOrientation = "north" | "south" | "east" | "west";
export type GlazingType = "single" | "double" | "triple" | "none";

export type WindowSpec = {
  id: number;
  width_m: string;
  height_m: string;
  orientation: WindowOrientation;
};

export type WizardDraft = {
  name?: string;
  site: {
    latitude_deg: string;
    longitude_deg: string;
    elevation_m: string;
    analysis_start: string;
    analysis_end: string;
    timezone: string;
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
    maximum_floors: number;
    maximum_capex_inr: string;
    available_material_ids: MaterialId[];
    heater_fuels: HeaterFuel[];
    maximum_mass_kg: string;
    max_assembly_time_hours: string;
  };
  design: {
    length_m: string;
    width_m: string;
    height_m: string;
    wall_thickness_mm: string;
    roof_thickness_mm: string;
    floor_thickness_mm: string;
    window_count: string;
    windows: WindowSpec[];
    window_width_m: string;
    window_height_m: string;
    window_orientation: WindowOrientation;
    glazing: GlazingType;
    air_changes_per_hour: string;
  };
  economic_assumption_set_id: string;
  run: {
    candidate_count: string;
    run_ansys: boolean;
  };
};

export const TIMEZONE = "Asia/Kolkata";
export const TIMEZONE_OFFSET = "+05:30";

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Asia/Karachi", label: "Asia/Karachi (PKT, UTC+5:00)" },
];

export const MISSION_TYPES: { id: MissionType; label: string; hint: string }[] = [
  { id: "living_sleeping", label: "Living & Sleeping", hint: "Combined high-altitude barracks" },
  { id: "living", label: "Living Only", hint: "Daytime mess & operational recreation" },
  { id: "sleeping", label: "Sleeping Only", hint: "Night-time insulated quarters" },
  { id: "command", label: "Command Post", hint: "Continuous tactical communications & operations" },
  { id: "medical", label: "Medical / Aid Post", hint: "Temperature-regulated casualty stabilization" },
];

export const ROOM_TYPES: { id: RoomType; label: string }[] = [
  { id: "airlock", label: "Airlock Vestibule" },
  { id: "living", label: "Living Space" },
  { id: "sleeping", label: "Sleeping Bunks" },
  { id: "equipment", label: "Equipment / Battery Bay" },
  { id: "medical", label: "Medical Corner" },
  { id: "command", label: "Command Desk" },
  { id: "storage", label: "Food & Gear Storage" },
];

/** Full Material Catalog: 10 Materials spanning standard core and extended traditional/high-altitude libraries */
export const MATERIALS: { id: MaterialId; label: string; category: string; structural: boolean; hint: string }[] = [
  { id: "mat_stone", label: "Granite / Field Stone", category: "Core Masonry", structural: true, hint: "High thermal mass, local stone masonry (k=2.0 W/m·K)" },
  { id: "mat_concrete", label: "Dense Concrete", category: "Core Structural", structural: true, hint: "Durable high-mass wall & sub-floor slab (k=1.4 W/m·K)" },
  { id: "mat_puf", label: "PUF (Polyurethane Foam)", category: "Core Insulation", structural: false, hint: "High-performance thermal core insulation (k=0.024 W/m·K)" },
  { id: "mat_plywood", label: "Marine Structural Plywood", category: "Core Structural", structural: true, hint: "Lightweight, pre-fabricated paneling & roof decking (k=0.13 W/m·K)" },
  { id: "mat_steel_panel", label: "Corrugated Steel Panels", category: "Engineered Cladding", structural: true, hint: "Rigid weather-shield exterior skin & roof protection" },
  { id: "mat_adobe", label: "Adobe (Sun-dried Mud Brick)", category: "Traditional Ladakh", structural: true, hint: "Zero transport cost, high thermal inertia local earth (k=0.13 W/m·K)" },
  { id: "mat_rammed_earth", label: "Rammed Earth", category: "Traditional Ladakh", structural: true, hint: "High thermal inertia compacted soil + stabilizer (k=0.8 W/m·K)" },
  { id: "mat_straw_clay", label: "Straw-Clay", category: "Passive Solar Ladakh", structural: false, hint: "Light natural bio-composite thermal insulation (k=0.19 W/m·K)" },
  { id: "mat_wood_timber", label: "Structural Timber / Wood", category: "Structural Framing", structural: true, hint: "Natural structural posts, joists, and roof trusses (k=0.13 W/m·K)" },
  { id: "mat_reinforced_concrete", label: "Reinforced Concrete (RCC)", category: "Heavy Engineered", structural: true, hint: "Heavy-duty structural load-bearing frame & blast defense" },
];

export const STRUCTURAL_MATERIAL_IDS: MaterialId[] = [
  "mat_stone",
  "mat_concrete",
  "mat_plywood",
  "mat_steel_panel",
  "mat_adobe",
  "mat_rammed_earth",
  "mat_wood_timber",
  "mat_reinforced_concrete",
];

export const ROOF_CAPABLE_MATERIAL_IDS: MaterialId[] = [
  "mat_plywood",
  "mat_concrete",
  "mat_steel_panel",
  "mat_wood_timber",
  "mat_reinforced_concrete",
];

export const EXTENDED_MATERIAL_IDS = new Set<MaterialId>([
  "mat_adobe",
  "mat_rammed_earth",
  "mat_straw_clay",
  "mat_wood_timber",
  "mat_reinforced_concrete",
]);

export const HEATER_FUELS: { id: HeaterFuel; label: string; hint: string }[] = [
  { id: "kerosene", label: "Kerosene (Military SKO)", hint: "Standard military Bukhari heater fuel supply" },
  { id: "electricity", label: "Electricity", hint: "Electric heat pump or resistance heating coil" },
  { id: "none", label: "None (100% Passive Solar)", hint: "Zero fuel resupply logistics — 100% passive solar heating" },
];

export const GLAZING_OPTIONS: { id: GlazingType; label: string; hint: string }[] = [
  { id: "single", label: "Single Glazed", hint: "U = 5.8 W/m²K · Lightweight" },
  { id: "double", label: "Double Glazed", hint: "U = 2.8 W/m²K · Balanced standard" },
  { id: "triple", label: "Triple Glazed", hint: "U = 1.0 W/m²K · Sub-zero arctic spec" },
  { id: "none", label: "None (Opaque)", hint: "No daylight, maximum wall insulation" },
];

export const WINDOW_ORIENTATIONS: { id: WindowOrientation; label: string; hint: string }[] = [
  { id: "south", label: "South (Recommended)", hint: "Maximizes winter solar heat gain" },
  { id: "east", label: "East", hint: "Morning solar exposure" },
  { id: "west", label: "West", hint: "Afternoon sun exposure" },
  { id: "north", label: "North", hint: "Diffuse daylight, minimal solar gain" },
];

export const ECONOMIC_ASSUMPTION_SETS = [
  { id: "econ_ladakh_expected_v1", label: "Expected Price Path", hint: "Central estimates for fuel, airlift logistics and material costs" },
  { id: "econ_ladakh_conservative_v1", label: "Conservative Scenario", hint: "Higher fuel & airlift delivery prices — stress tests budget" },
  { id: "econ_ladakh_optimistic_v1", label: "Optimistic Scenario", hint: "Lower supply costs — best-case lifecycle expenditure" },
];

export function syncWindows(count: number, existing: WindowSpec[] = []): WindowSpec[] {
  const result: WindowSpec[] = [];
  for (let i = 0; i < count; i++) {
    if (existing[i]) {
      result.push({ ...existing[i], id: i + 1 });
    } else {
      result.push({
        id: i + 1,
        width_m: existing[0]?.width_m ?? "1.2",
        height_m: existing[0]?.height_m ?? "1.2",
        orientation: existing[0]?.orientation ?? "south",
      });
    }
  }
  return result;
}

export const DEFAULT_DRAFT: WizardDraft = {
  name: "Ladakh DBO Habitat",
  site: {
    latitude_deg: "34.1526",
    longitude_deg: "77.5771",
    elevation_m: "3500",
    analysis_start: "2026-01-01",
    analysis_end: "2026-01-08",
    timezone: "Asia/Kolkata",
  },
  mission: {
    type: "living_sleeping",
    occupants: "30",
    required_rooms: ["airlock", "living", "sleeping", "equipment"],
    target_temperature_c: "15.0",
    maximum_unmet_hours: "12",
  },
  constraints: {
    maximum_footprint_m2: "48",
    maximum_floors: 2,
    maximum_capex_inr: "2500000",
    available_material_ids: ["mat_stone", "mat_puf", "mat_plywood", "mat_concrete"],
    heater_fuels: ["kerosene"],
    maximum_mass_kg: "",
    max_assembly_time_hours: "",
  },
  design: {
    length_m: "7.0",
    width_m: "5.0",
    height_m: "2.8",
    wall_thickness_mm: "350",
    roof_thickness_mm: "280",
    floor_thickness_mm: "220",
    window_count: "4",
    windows: syncWindows(4),
    window_width_m: "1.2",
    window_height_m: "1.2",
    window_orientation: "south",
    glazing: "double",
    air_changes_per_hour: "0.8",
  },
  economic_assumption_set_id: "econ_ladakh_expected_v1",
  run: {
    candidate_count: "20",
    run_ansys: false,
  },
};

export type Errors = Partial<Record<string, string>>;

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const isInt = (n: number) => Number.isInteger(n);

export function validateSite(s: WizardDraft["site"]): Errors {
  const e: Errors = {};
  const lat = num(s.latitude_deg);
  const lon = num(s.longitude_deg);
  const elev = num(s.elevation_m);
  if (!(lat >= -90 && lat <= 90)) e.latitude_deg = "Enter latitude between -90 and 90°";
  if (!(lon >= -180 && lon <= 180)) e.longitude_deg = "Enter longitude between -180 and 180°";
  if (!(elev >= -500 && elev <= 9000)) e.elevation_m = "Enter elevation between -500 and 9,000 m";
  if (!s.analysis_start) e.analysis_start = "Choose a start date";
  if (!s.analysis_end) e.analysis_end = "Choose an end date";
  if (s.analysis_start && s.analysis_end && s.analysis_end <= s.analysis_start) {
    e.analysis_end = "End date must be strictly after the start date";
  }
  if (!s.timezone) e.timezone = "Select a timezone";
  return e;
}

export function validateMission(m: WizardDraft["mission"]): Errors {
  const e: Errors = {};
  const occ = num(m.occupants);
  const t = num(m.target_temperature_c);
  const unmet = num(m.maximum_unmet_hours);
  if (!(isInt(occ) && occ >= 0 && occ <= 500)) e.occupants = "Occupants must be a number ≥ 0 (up to 500)";
  if (m.required_rooms.length === 0) e.required_rooms = "Select at least one required room type";
  if (!(t >= 5 && t <= 30)) e.target_temperature_c = "Enter target temperature between 5 and 30 °C";
  if (!(unmet >= 0 && unmet <= 168)) e.maximum_unmet_hours = "Enter maximum unmet hours (0 to 168 h)";
  return e;
}

export function validateConstraints(c: WizardDraft["constraints"]): Errors {
  const e: Errors = {};
  const fp = num(c.maximum_footprint_m2);
  const capex = num(c.maximum_capex_inr);
  const floors = c.maximum_floors;
  if (!(fp > 0 && fp <= 5000)) e.maximum_footprint_m2 = "Enter maximum footprint between 1 and 5,000 m²";
  if (!(floors >= 1 && floors <= 5)) e.maximum_floors = "Maximum floors must be between 1 and 5";
  if (!(capex > 0)) e.maximum_capex_inr = "Enter budget ceiling in INR";
  if (c.available_material_ids.length === 0) {
    e.available_material_ids = "Select at least one approved material";
  } else if (!c.available_material_ids.some((m) => (STRUCTURAL_MATERIAL_IDS as string[]).includes(m))) {
    e.available_material_ids = "Include at least one structural material (Stone, Concrete, Plywood, Steel, Adobe, Rammed Earth, Timber)";
  } else if (!c.available_material_ids.some((m) => (ROOF_CAPABLE_MATERIAL_IDS as string[]).includes(m))) {
    e.available_material_ids = "Include at least one roof-capable material (Plywood, Concrete, Steel, Timber, or RCC)";
  }
  if (c.heater_fuels.length === 0) e.heater_fuels = "Select at least one fuel option (or 'None' for passive solar)";
  if (c.maximum_mass_kg.trim() !== "") {
    const mass = num(c.maximum_mass_kg);
    if (!(mass > 0)) e.maximum_mass_kg = "Mass limit must be > 0 kg";
  }
  if (c.max_assembly_time_hours.trim() !== "") {
    const time = num(c.max_assembly_time_hours);
    if (!(time > 0)) e.max_assembly_time_hours = "Assembly time must be > 0 hours";
  }
  return e;
}

export function validateDesign(d: WizardDraft["design"]): Errors {
  const e: Errors = {};
  const l = num(d.length_m);
  const w = num(d.width_m);
  const h = num(d.height_m);
  const wall = num(d.wall_thickness_mm);
  const roof = num(d.roof_thickness_mm);
  const floor = num(d.floor_thickness_mm);
  const wc = num(d.window_count);
  const ach = num(d.air_changes_per_hour);

  if (!(l >= 2.0 && l <= 100.0)) e.length_m = "Length must be between 2.0 and 100.0 m";
  if (!(w >= 2.0 && w <= 100.0)) e.width_m = "Width must be between 2.0 and 100.0 m";
  if (!(h >= 2.3 && h <= 3.0)) e.height_m = "Height must be between 2.3 and 3.0 m";
  if (!(wall >= 100 && wall <= 1000)) e.wall_thickness_mm = "Wall thickness must be 100 to 1,000 mm";
  if (!(roof >= 80 && roof <= 1000)) e.roof_thickness_mm = "Roof thickness must be 80 to 1,000 mm";
  if (!(floor >= 80 && floor <= 1000)) e.floor_thickness_mm = "Floor thickness must be 80 to 1,000 mm";
  if (!(wc >= 0 && wc <= 20)) e.window_count = "Window count must be 0 to 20";

  // Validate each window when window_count > 0
  if (wc > 0 && d.windows) {
    for (let i = 0; i < Math.min(wc, d.windows.length); i++) {
      const win = d.windows[i];
      const ww = num(win.width_m);
      const wh = num(win.height_m);
      if (!(ww >= 0.4 && ww <= 3.0)) e[`window_${i}_width`] = `Window #${i + 1} width must be 0.4 to 3.0 m`;
      if (!(wh >= 0.4 && wh <= 3.0)) e[`window_${i}_height`] = `Window #${i + 1} height must be 0.4 to 3.0 m`;
    }
  }

  if (!(ach >= 0.0 && ach <= 10.0)) e.air_changes_per_hour = "Air changes must be 0.0 to 10.0 ACH";
  return e;
}

export function validateRun(r: WizardDraft["run"]): Errors {
  const e: Errors = {};
  const cnt = num(r.candidate_count);
  if (!(isInt(cnt) && cnt >= 1 && cnt <= 200)) e.candidate_count = "Candidate pool count must be between 1 and 200";
  return e;
}

export function validateEconomics(id: string): Errors {
  return ECONOMIC_ASSUMPTION_SETS.some((s) => s.id === id) ? {} : { economic_assumption_set_id: "Choose an economic assumption set" };
}

export type StepKey = "site" | "mission" | "constraints" | "design" | "run";

export function stepErrors(d: WizardDraft): Record<StepKey, Errors> {
  return {
    site: validateSite(d.site),
    mission: validateMission(d.mission),
    constraints: validateConstraints(d.constraints),
    design: validateDesign(d.design),
    run: { ...validateRun(d.run), ...validateEconomics(d.economic_assumption_set_id) },
  };
}

export function toRequirements(d: WizardDraft) {
  const occupants = Math.round(Number(d.mission.occupants));
  const maxMass = d.constraints.maximum_mass_kg.trim() !== "" ? Number(d.constraints.maximum_mass_kg) : null;
  const maxAssembly = d.constraints.max_assembly_time_hours.trim() !== "" ? Number(d.constraints.max_assembly_time_hours) : null;

  return {
    schema_version: "4.0",
    project_id: null as string | null,
    mode: "new_shelter",
    site: {
      latitude_deg: Number(d.site.latitude_deg),
      longitude_deg: Number(d.site.longitude_deg),
      elevation_m: Number(d.site.elevation_m),
      timezone: d.site.timezone || TIMEZONE,
      weather_source: "NASA_POWER",
      analysis_start: `${d.site.analysis_start}T00:00:00${TIMEZONE_OFFSET}`,
      analysis_end: `${d.site.analysis_end}T00:00:00${TIMEZONE_OFFSET}`,
    },
    mission: {
      type: d.mission.type,
      occupants,
      required_rooms: d.mission.required_rooms,
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
      preferred_orientation_deg: null,
      maximum_mass_kg: maxMass,
      max_assembly_time_hours: maxAssembly,
    },
    economic_assumption_set_id: d.economic_assumption_set_id,
  };
}

export function toDesignOptions(d: WizardDraft) {
  const count = Math.max(0, Math.round(Number(d.design.window_count || 0)));
  const winList = (d.design.windows && d.design.windows.length > 0)
    ? d.design.windows.slice(0, count)
    : syncWindows(count);

  // Compute average size and primary orientation across configured windows
  const avgWidth = count > 0
    ? winList.reduce((acc, w) => acc + (Number(w.width_m) || 1.2), 0) / count
    : 1.2;
  const avgHeight = count > 0
    ? winList.reduce((acc, w) => acc + (Number(w.height_m) || 1.2), 0) / count
    : 1.2;
  const primaryOrientation = winList[0]?.orientation ?? d.design.window_orientation ?? "south";

  return {
    length_m: Number(d.design.length_m),
    width_m: Number(d.design.width_m),
    height_m: Number(d.design.height_m),
    shape: "rectangular",
    wall_thickness_mm: Number(d.design.wall_thickness_mm),
    roof_thickness_mm: Number(d.design.roof_thickness_mm),
    floor_thickness_mm: Number(d.design.floor_thickness_mm),
    window_count: count,
    window_width_m: Math.round(avgWidth * 10) / 10,
    window_height_m: Math.round(avgHeight * 10) / 10,
    window_orientation: primaryOrientation,
    glazing: d.design.glazing,
    air_changes_per_hour: Number(d.design.air_changes_per_hour),
    require_separate_rooms: true,
    windows: winList.map((w) => ({
      id: w.id,
      width_m: Number(w.width_m),
      height_m: Number(w.height_m),
      orientation: w.orientation,
    })),
  };
}
