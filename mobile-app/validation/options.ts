/**
 * Choice lists for the requirements wizard. Each list says where it comes
 * from; nothing here is a design recommendation.
 */

export interface Option<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

/**
 * Quick-start location presets for high-altitude cold-climate deployment.
 */
export interface LocationPreset {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation_m: number;
  timezone: string;
  weather_source: string;
}

export const LOCATION_PRESETS: LocationPreset[] = [
  {
    // Backend site key: daulat_beg_oldi (has daulat_beg_oldi_weather_archive.csv)
    id: "daulat_beg_oldi",
    name: "Ladakh DBO",
    latitude: 35.33,
    longitude: 77.88,
    elevation_m: 5000,
    timezone: "Asia/Kolkata",
    weather_source: "NASA_POWER",
  },
  {
    // Backend site key: siachen_base_camp (has siachen_base_camp_weather_archive.csv)
    id: "siachen_base_camp",
    name: "Siachen Base Camp",
    latitude: 35.42,
    longitude: 77.10,
    elevation_m: 5400,
    timezone: "Asia/Kolkata",
    weather_source: "NASA_POWER",
  },
  {
    // Backend site key: leh (has leh_weather_archive.csv)
    id: "leh",
    name: "Leh Post",
    latitude: 34.15,
    longitude: 77.58,
    elevation_m: 3500,
    timezone: "Asia/Kolkata",
    weather_source: "NASA_POWER",
  },
  {
    // Backend site key: dras (has dras_weather_archive.csv)
    id: "dras",
    name: "Drass Sector",
    latitude: 34.43,
    longitude: 75.76,
    elevation_m: 3230,
    timezone: "Asia/Kolkata",
    weather_source: "NASA_POWER",
  },
];

/**
 * Room types checklist with clear descriptions for tactical shelter design.
 */
export const ROOM_TYPES: Option[] = [
  {
    value: "airlock",
    label: "Airlock Vestibule",
    description: "Isolated thermal entry buffer preventing exterior cold air ingress during troop transit.",
  },
  {
    value: "living",
    label: "Living Space",
    description: "Daytime tactical briefing, mess, and active troop habitation area.",
  },
  {
    value: "sleeping",
    label: "Sleeping Quarters",
    description: "Insulated bunk quarters / upper floor designed for thermal retention.",
  },
  {
    value: "equipment",
    label: "Equipment / Battery Bay",
    description: "Ventilated bay for inverters, power storage, radio communications and plant.",
  },
  {
    value: "medical",
    label: "Medical / Aid Post",
    description: "Casualty stabilization with dedicated temperature regulation.",
  },
  {
    value: "storage",
    label: "Food & Gear Storage",
    description: "Unheated buffer pantry and tactical dry gear storage.",
  },
];

/** Mission types selector. */
export const MISSION_TYPES: Option[] = [
  { value: "living_sleeping", label: "Living & Sleeping", description: "Combined 24h troop barracks and operational shelter." },
  { value: "living_only", label: "Living Only", description: "Daytime tactical post and mess area." },
  { value: "sleeping_only", label: "Sleeping Only", description: "Dedicated night shelter and sleeping quarters." },
  { value: "command", label: "Command Post", description: "Operational nerve center with electronics and communications." },
  { value: "medical", label: "Medical Post", description: "Emergency field clinic and triage aid facility." },
];

/** Weather source identifiers. */
export const WEATHER_SOURCES: Option[] = [
  { value: "NASA_POWER", label: "NASA POWER", description: "Global satellite meteorology and solar radiation archive." },
  { value: "ERA5", label: "ERA5 Reanalysis", description: "High-resolution ECMWF atmospheric reanalysis." },
];

/** Heating fuel sources selector. */
export const HEATER_FUELS: Option[] = [
  { value: "kerosene", label: "Kerosene (Military SKO)", description: "Standard military Bukhari heaters & forced-air burners." },
  { value: "electricity", label: "Electricity", description: "High-efficiency heat pumps, radiant pads & electric coils." },
  { value: "passive_solar", label: "None (100% Passive Solar)", description: "Zero active fuel logistics; relies on solar gain & thermal envelope." },
];

/** Window Orientation options. */
export const WINDOW_ORIENTATIONS: Option[] = [
  { value: "South", label: "South (Optimal Solar Gain)" },
  { value: "East", label: "East (Morning Sun)" },
  { value: "West", label: "West (Afternoon Sun)" },
  { value: "North", label: "North (Diffuse Light)" },
];

/** Glazing specifications. */
export const GLAZING_SPECS: Option[] = [
  { value: "single", label: "Single Glazed (U ~ 5.8 W/m²K)" },
  { value: "double", label: "Double Glazed Low-E (U ~ 1.8 W/m²K)" },
  { value: "triple", label: "Triple Glazed Argon (U ~ 0.8 W/m²K)" },
  { value: "none", label: "None / Opaque Insulated Panel" },
];

/** Economic Cost Scenarios. */
export const ECONOMIC_SCENARIOS: Option[] = [
  { value: "expected", label: "Expected Price Path (Base Case)" },
  { value: "conservative", label: "Conservative Stress-Test (+30% Fuel/Logistics)" },
  { value: "optimistic", label: "Optimistic Scenario (Subsidized Renewables)" },
];

/** Available standard materials checklist — IDs must match the backend material catalog (mat_snap_himalayan_v1/v2). */
export const STANDARD_MATERIALS: Option[] = [
  { value: "mat_stone", label: "Granite / Field Stone", description: "High thermal mass for solar energy storage." },
  { value: "mat_concrete", label: "Dense Concrete", description: "Structural foundation slab and load-bearing walls." },
  { value: "mat_puf", label: "Polyurethane Foam (PUF)", description: "Ultra-low conductivity core thermal insulation." },
  { value: "mat_plywood", label: "Marine Structural Plywood", description: "Lightweight modular interior panels & decking." },
  { value: "mat_reinforced_concrete", label: "Reinforced Concrete (RCC)", description: "Structural RCC columns and slabs for multi-storey." },
  { value: "mat_adobe", label: "Adobe / Sun-dried Brick", description: "Traditional high-mass local earth construction." },
  { value: "mat_rammed_earth", label: "Rammed Earth", description: "Compacted earth walls with high thermal mass." },
  { value: "mat_wood_timber", label: "Wood / Timber", description: "Lightweight structural timber framing and panelling." },
  { value: "mat_straw_clay", label: "Straw-Clay Composite", description: "Bio-composite natural insulation wall fill." },
];

/** IANA timezone options. */
export const TIMEZONE_OPTIONS: Option[] = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (UTC+05:30) - India Standard Time" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Asia/Kathmandu", label: "Asia/Kathmandu (UTC+05:45)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (UTC+06:00)" },
];

export const TIMEZONE_PRESETS = [
  { timezone: "Asia/Kolkata", offset: "+05:30" },
  { timezone: "Asia/Kathmandu", offset: "+05:45" },
  { timezone: "Asia/Dhaka", offset: "+06:00" },
  { timezone: "Asia/Karachi", offset: "+05:00" },
  { timezone: "Asia/Shanghai", offset: "+08:00" },
  { timezone: "UTC", offset: "+00:00" },
];

export function presetOffset(timezone: string | undefined): string | undefined {
  return TIMEZONE_PRESETS.find((p) => p.timezone === timezone)?.offset;
}

export function optionLabel(options: Option[], value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return options.find((o) => o.value === value)?.label ?? value;
}
