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
 * Room types the M2 layout generator has sizing rules for
 * (design_generator/requirement_parser.py DEFAULT_SIZING on main). M2
 * rejects any other type and any type listed twice.
 */
export const ROOM_TYPES: Option[] = [
  {
    value: "airlock",
    label: "Airlock",
    description:
      "A buffer space between the exterior and the main living area that reduces direct heat exchange when entering or leaving the shelter.",
  },
  { value: "living", label: "Living", description: "Day space for occupants." },
  { value: "sleeping", label: "Sleeping", description: "Sleeping quarters." },
  { value: "equipment", label: "Equipment", description: "Space for equipment and plant." },
  { value: "storage", label: "Storage", description: "Unoccupied storage." },
  { value: "command", label: "Command", description: "Command or operations room." },
  { value: "medical", label: "Medical", description: "Medical or treatment room." },
];

/** Mission categories named in the M0 MissionRequirements.type description. */
export const MISSION_TYPES: Option[] = [
  { value: "living_sleeping", label: "Living & sleeping" },
  { value: "medical", label: "Medical" },
  { value: "command", label: "Command" },
  { value: "storage", label: "Storage" },
  { value: "equipment", label: "Equipment" },
  { value: "mixed", label: "Mixed use" },
];

/** Weather source identifiers named in the M0 SiteSpecification.weather_source description. */
export const WEATHER_SOURCES: Option[] = [
  { value: "NASA_POWER", label: "NASA POWER" },
];

/** Heater fuels named in the M0 DesignConstraints.heater_fuels description. */
export const HEATER_FUELS: Option[] = [
  { value: "kerosene", label: "Kerosene" },
  { value: "electricity", label: "Electricity" },
  { value: "solar_thermal", label: "Solar thermal" },
];

/**
 * IANA timezones offered as shortcuts, with their UTC offsets. Only zones
 * without daylight saving are listed, so the offset is always correct; any
 * other IANA name can be typed with an explicit offset.
 */
export const TIMEZONE_PRESETS: { timezone: string; offset: string }[] = [
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
