/**
 * Zod schemas for the requirements wizard, derived from the M0
 * RequirementsContract on main (packages/contracts). Two layers:
 *
 * - draftSchema: every field optional, but any value present must have the
 *   right type and be inside the contract's documented range. It drives
 *   React Hook Form while editing — an incomplete draft is fine, a wrong
 *   value is not.
 * - completeSchema: the fields the contract requires, plus the same range
 *   checks. A project must pass it before designs can be generated.
 *
 * Bounds follow the contract only. Which room types, floor counts,
 * arrangements and materials M2 can actually build is not restated here:
 * it comes from the backend's template catalogue and compatibility check
 * (services/interfaces/TemplateService.ts), which the backend repeats before
 * generating anything.
 */
import type { RequirementsContract } from "@cocoon/contracts";
import { z } from "zod";

import type { DraftRequirements } from "../database/schema/types";
import type { Result } from "../utils/result";
import { err, ok } from "../utils/result";
import {
  ECONOMIC_SCENARIOS,
  GLAZING_SPECS,
  HEATER_FUELS,
  LOCATION_PRESETS,
  MISSION_TYPES,
  ROOM_TYPES,
  STANDARD_MATERIALS,
  WEATHER_SOURCES,
  WINDOW_ORIENTATIONS,
} from "./options";
import type { WizardStepId } from "./steps";

const finite = (label: string) => z.number({ error: `${label} must be a number.` });
const positive = (label: string) => finite(label).positive({ error: `${label} must be greater than 0.` });

const isoWithOffset = z.iso.datetime({
  offset: true,
  error: "Enter a full date and time with its UTC offset, for example YYYY-MM-DDTHH:mm:ss+05:30.",
});

const ianaTimezone = z
  .string()
  .trim()
  .regex(/^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+)+)$/, { error: "Use an IANA timezone name, e.g. Asia/Kolkata." });

const materialId = z.string().regex(/^mat_[A-Za-z0-9_]+$/, { error: "Material ids start with mat_." });

// --- Field schemas (shared by both layers) ---------------------------------
const site = {
  latitude_deg: finite("Latitude").min(-90, { error: "Latitude must be between -90° and 90°." }).max(90, {
    error: "Latitude must be between -90° and 90°.",
  }),
  longitude_deg: finite("Longitude").min(-180, { error: "Longitude must be between -180° and 180°." }).max(180, {
    error: "Longitude must be between -180° and 180°.",
  }),
  elevation_m: finite("Elevation"),
  timezone: ianaTimezone,
  weather_source: z.string().trim().min(1, { error: "Choose a weather source." }),
  analysis_start: isoWithOffset,
  analysis_end: isoWithOffset,
};

const mission = {
  type: z.string().trim().min(1, { error: "Choose a mission type." }),
  occupants: finite("Occupants").int({ error: "Occupants must be a whole number." }).min(1, {
    error: "At least one occupant is required.",
  }).max(500, { error: "Occupancy cannot exceed 500 people." }),
  occupancy_schedule_id: z.string().trim().nullable().optional(),
  // Which types exist is the catalogue's call (GET /api/v1/templates); an unknown one is reported by the compatibility check.
  required_rooms: z
    .array(z.string().trim().min(1, { error: "Unknown room type." }))
    .refine((rooms) => new Set(rooms).size === rooms.length, { error: "Each room type can be listed only once." }),
  target_temperature_c: finite("Target temperature"),
  maximum_unmet_hours: finite("Unmet hours").min(0, { error: "Cannot be negative." }).max(168, { error: "Maximum unmet hours cannot exceed 168." }),
};

const constraints = {
  maximum_footprint_m2: positive("Footprint").max(5000, { error: "Footprint must not exceed 5,000 m²." }),
  maximum_floors: finite("Floors")
    .int({ error: "Floors must be a whole number." })
    .min(1, { error: "Choose at least 1 floor." })
    .max(5, { error: "Floors must be between 1 and 5." })
    .nullable(),
  preferred_orientation_deg: finite("Orientation")
    .min(0, { error: "Orientation must be between 0° and 360°." })
    .max(360, { error: "Orientation must be between 0° and 360°." })
    .nullable(),
  available_material_ids: z.array(materialId).min(1, { error: "Choose at least one material." }),
  maximum_capex_inr: positive("CAPEX budget").nullable(),
  heater_fuels: z.array(z.string().min(1)).min(1, { error: "Choose at least one heating fuel." }),
  maximum_mass_kg: positive("Mass limit").nullable().optional(),
  max_assembly_time_hours: positive("Assembly time").nullable().optional(),
};

const envelope = {
  length_m: positive("Building length").max(50, { error: "Building length must be <= 50 m." }),
  width_m: positive("Building width").max(50, { error: "Building width must be <= 50 m." }),
  height_m: positive("Ceiling height").min(1.5, { error: "Height must be >= 1.5 m." }).max(10, { error: "Height must be <= 10 m." }),
  wall_thickness_mm: positive("Wall thickness").min(50, { error: "Wall thickness must be >= 50 mm." }).max(1200, { error: "Wall thickness must be <= 1200 mm." }),
  roof_thickness_mm: positive("Roof thickness").min(50, { error: "Roof thickness must be >= 50 mm." }).max(1200, { error: "Roof thickness must be <= 1200 mm." }),
  floor_thickness_mm: positive("Floor thickness").min(50, { error: "Floor thickness must be >= 50 mm." }).max(1200, { error: "Floor thickness must be <= 1200 mm." }),
  window_count: finite("Window count").int().min(0, { error: "Window count cannot be negative." }).max(12, { error: "Window count must be between 0 and 12." }),
  window_width_m: positive("Window width").max(5, { error: "Window width must be <= 5 m." }),
  window_height_m: positive("Window height").max(5, { error: "Window height must be <= 5 m." }),
  window_orientation: z.string().trim().optional(),
  glazing_spec: z.string().trim().optional(),
  air_changes_per_hour: finite("Infiltration rate").min(0, { error: "ACH cannot be negative." }).max(10, { error: "Airtightness must be between 0.0 and 10.0 ACH." }),
};

const generationOptions = z
  .object({
    materials_snapshot_id: z.string().optional(),
    count: finite("Design count").int().min(1, { error: "Choose at least 1 candidate." }).max(200, { error: "The backend accepts at most 200 designs." }).optional(),
    seed: finite("Seed").int().optional(),
    baseline_economics: z.boolean().optional(),
    validate_with_ansys: z.boolean().optional(),
    template_id: z.string().trim().min(1).nullable().optional(),
    room_arrangement: z.record(z.string(), z.enum(["dedicated", "shared"])).optional(),
  })
  .optional();

function windowOrder(value: { analysis_start?: string; analysis_end?: string } | undefined, ctx: z.RefinementCtx) {
  if (!value?.analysis_start || !value.analysis_end) return;
  const start = Date.parse(value.analysis_start);
  const end = Date.parse(value.analysis_end);
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
    ctx.addIssue({ code: "custom", path: ["analysis_end"], message: "The end must be after the start." });
  }
}

function optionalAll<T extends Record<string, z.ZodType>>(shape: T) {
  return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof T]: z.ZodOptional<T[K]>;
  };
}

// --- Layer 1: lenient draft schema (React Hook Form resolver) --------------
export const draftSchema = z.object({
  project_name: z.string().optional(),
  location_name: z.string().optional(),
  weather_archive_site: z.string().optional(),
  site: z.object(optionalAll(site)).superRefine(windowOrder).optional(),
  mission: z.object(optionalAll(mission)).optional(),
  constraints: z.object(optionalAll(constraints)).optional(),
  envelope: z.object(optionalAll(envelope)).optional(),
  economic_assumption_set_id: z.string().optional(),
  generation_options: generationOptions,
});

// --- Layer 2: complete schema (gate for "Generate designs") ----------------
export const completeSchema = z.object({
  project_name: z.string().trim().optional(),
  location_name: z.string().trim().optional(),
  weather_archive_site: z.string().trim().optional(),
  site: z.object(site).superRefine(windowOrder),
  mission: z.object({
    ...mission,
    required_rooms: mission.required_rooms.min(1, { error: "Add at least one room." }),
    occupancy_schedule_id: mission.occupancy_schedule_id.optional(),
    target_temperature_c: mission.target_temperature_c.optional(),
    maximum_unmet_hours: mission.maximum_unmet_hours.optional(),
  }),
  // Whether the materials can form every assembly is checked against M2's material roles by the backend
  // (POST /api/v1/design-compatibility, NO_STRUCTURAL_MATERIAL), not by a hardcoded list here.
  constraints: z.object({
    maximum_footprint_m2: constraints.maximum_footprint_m2,
    maximum_floors: constraints.maximum_floors.optional(),
    preferred_orientation_deg: constraints.preferred_orientation_deg.optional(),
    available_material_ids: constraints.available_material_ids,
    maximum_capex_inr: constraints.maximum_capex_inr.optional(),
    heater_fuels: constraints.heater_fuels.optional(),
    maximum_mass_kg: constraints.maximum_mass_kg.optional(),
    max_assembly_time_hours: constraints.max_assembly_time_hours.optional(),
  }),
  envelope: z.object(optionalAll(envelope)).optional(),
  economic_assumption_set_id: z.string().trim().min(1, { error: "Choose an economic assumption set." }),
  generation_options: generationOptions,
});

// ---------------------------------------------------------------------------
// FieldErrors — the wizard/review/repository error currency
// ---------------------------------------------------------------------------
export type FieldErrorKind = "missing" | "invalid";

export interface FieldError {
  step: WizardStepId;
  /** Dotted path, e.g. "site.latitude_deg". */
  field: string;
  label: string;
  message: string;
  kind: FieldErrorKind;
}

export type FieldErrors = FieldError[];

/** Field path → wizard step + human label. */
export const FIELD_META: Record<string, { step: WizardStepId; label: string }> = {
  project_name: { step: "location", label: "Location" },
  location_name: { step: "location", label: "Location" },
  weather_archive_site: { step: "location", label: "Weather archive location" },
  "site.latitude_deg": { step: "location", label: "Location coordinates" },
  "site.longitude_deg": { step: "location", label: "Location coordinates" },
  "site.elevation_m": { step: "location", label: "Elevation" },
  "site.timezone": { step: "location", label: "Timezone" },
  "site.weather_source": { step: "weather", label: "Weather source" },
  "site.analysis_start": { step: "weather", label: "Analysis start" },
  "site.analysis_end": { step: "weather", label: "Analysis end" },
  "mission.type": { step: "mission", label: "Shelter purpose" },
  "mission.occupants": { step: "occupancy", label: "Occupants" },
  "mission.occupancy_schedule_id": { step: "occupancy", label: "Occupancy schedule" },
  "mission.required_rooms": { step: "rooms", label: "Rooms" },
  "mission.target_temperature_c": { step: "comfort", label: "Target temperature" },
  "mission.maximum_unmet_hours": { step: "comfort", label: "Maximum unmet hours" },
  "constraints.maximum_footprint_m2": { step: "footprint", label: "Maximum footprint" },
  "constraints.maximum_floors": { step: "footprint", label: "Maximum floors" },
  "constraints.preferred_orientation_deg": { step: "footprint", label: "Preferred orientation" },
  "constraints.available_material_ids": { step: "design", label: "Materials" },
  "constraints.maximum_capex_inr": { step: "budget", label: "Maximum CAPEX" },
  "constraints.heater_fuels": { step: "budget", label: "Heater fuels" },
  "constraints.maximum_mass_kg": { step: "budget", label: "Maximum mass" },
  "constraints.max_assembly_time_hours": { step: "budget", label: "Maximum assembly time" },
  "envelope.length_m": { step: "envelope", label: "Building length" },
  "envelope.width_m": { step: "envelope", label: "Building width" },
  "envelope.height_m": { step: "envelope", label: "Ceiling height" },
  "envelope.wall_thickness_mm": { step: "envelope", label: "Wall thickness" },
  "envelope.roof_thickness_mm": { step: "envelope", label: "Roof thickness" },
  "envelope.floor_thickness_mm": { step: "envelope", label: "Floor thickness" },
  "envelope.window_count": { step: "envelope", label: "Window count" },
  "envelope.window_width_m": { step: "envelope", label: "Window width" },
  "envelope.window_height_m": { step: "envelope", label: "Window height" },
  "envelope.window_orientation": { step: "envelope", label: "Window orientation" },
  "envelope.glazing_spec": { step: "envelope", label: "Glazing specification" },
  "envelope.air_changes_per_hour": { step: "envelope", label: "Airtightness (ACH)" },
  "generation_options.count": { step: "optimize", label: "Design count" },
  "generation_options.baseline_economics": { step: "optimize", label: "Baseline economics" },
  "generation_options.validate_with_ansys": { step: "optimize", label: "ANSYS validation" },
  "generation_options.materials_snapshot_id": { step: "design", label: "Material set" },
  "generation_options.seed": { step: "optimize", label: "Seed" },
  "generation_options.template_id": { step: "review", label: "Template" },
  "generation_options.room_arrangement": { step: "mission", label: "Room arrangement" },
  economic_assumption_set_id: { step: "budget", label: "Economic assumption set" },
};

export const STEP_FIELD_GROUPS: Record<string, string[]> = {
  site: ["site.latitude_deg", "site.longitude_deg", "site.elevation_m", "site.timezone", "site.weather_source", "site.analysis_start", "site.analysis_end"],
  location: ["site.latitude_deg", "site.longitude_deg", "site.elevation_m", "site.timezone"],
  weather: ["site.weather_source", "site.analysis_start", "site.analysis_end"],
  mission: ["mission.type", "mission.occupants", "mission.occupancy_schedule_id", "mission.required_rooms", "mission.target_temperature_c", "mission.maximum_unmet_hours"],
  occupancy: ["mission.occupants", "mission.occupancy_schedule_id"],
  rooms: ["mission.required_rooms"],
  comfort: ["mission.target_temperature_c", "mission.maximum_unmet_hours"],
  constraints: ["constraints.maximum_footprint_m2", "constraints.maximum_floors", "constraints.preferred_orientation_deg", "constraints.available_material_ids", "constraints.maximum_capex_inr", "constraints.heater_fuels", "constraints.maximum_mass_kg", "constraints.max_assembly_time_hours"],
  design: ["constraints.maximum_footprint_m2", "constraints.maximum_floors", "constraints.preferred_orientation_deg", "constraints.available_material_ids", "constraints.maximum_capex_inr", "constraints.heater_fuels", "constraints.maximum_mass_kg", "constraints.max_assembly_time_hours", "economic_assumption_set_id"],
  footprint: ["constraints.maximum_footprint_m2", "constraints.maximum_floors", "constraints.preferred_orientation_deg"],
  budget: ["constraints.maximum_capex_inr", "constraints.heater_fuels", "constraints.maximum_mass_kg", "constraints.max_assembly_time_hours", "economic_assumption_set_id"],
  envelope: ["envelope.length_m", "envelope.width_m", "envelope.height_m", "envelope.wall_thickness_mm", "envelope.roof_thickness_mm", "envelope.floor_thickness_mm", "envelope.window_count", "envelope.window_width_m", "envelope.window_height_m", "envelope.window_orientation", "envelope.glazing_spec", "envelope.air_changes_per_hour"],
  optimize: ["generation_options.count", "generation_options.baseline_economics", "generation_options.validate_with_ansys", "generation_options.materials_snapshot_id", "generation_options.seed", "economic_assumption_set_id"],
};

function valueAt(obj: unknown, path: PropertyKey[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

function toFieldErrors(draft: DraftRequirements, issues: z.core.$ZodIssue[]): FieldErrors {
  const seen = new Set<string>();
  const out: FieldErrors = [];
  for (const issue of issues) {
    const fieldPath = issue.path.filter((p) => typeof p === "string");
    const field = fieldPath.join(".");
    const meta = FIELD_META[field] ?? { step: "review" as WizardStepId, label: field || "Requirements" };
    const value = valueAt(draft, fieldPath);
    const missing =
      value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    const kind: FieldErrorKind = missing ? "missing" : "invalid";
    const key = `${field}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ step: meta.step, field, label: meta.label, kind, message: missing ? "Required." : issue.message });
  }
  return out;
}

function withEmptyGroups(draft: DraftRequirements): DraftRequirements {
  return {
    ...draft,
    site: draft.site ?? {},
    mission: draft.mission ?? {},
    constraints: draft.constraints ?? {},
    envelope: draft.envelope ?? {},
  };
}

/** Every problem that would stop this draft becoming a valid RequirementsContract. */
export function validateAll(draft: DraftRequirements): FieldErrors {
  const full = withEmptyGroups(draft);
  const result = completeSchema.safeParse(full);
  return result.success ? [] : toFieldErrors(full, result.error.issues);
}

export function validateStep(step: WizardStepId, draft: DraftRequirements): FieldErrors {
  const fields = STEP_FIELD_GROUPS[step];
  const all = validateAll(draft);
  if (fields) {
    return all.filter((e) => fields.includes(e.field));
  }
  return all.filter((e) => e.step === step || (step === "constraints" && e.step === "design"));
}

/** Any missing required field or invalid field blocks moving to the next step. */
export function hasBlockingErrors(errors: FieldErrors): boolean {
  return errors.length > 0;
}

/** The DesignConstraints fields the wizard submits (the compatibility preview checks exactly these). */
const SUBMITTED_CONSTRAINT_KEYS = [
  "maximum_footprint_m2",
  "maximum_floors",
  "preferred_orientation_deg",
  "available_material_ids",
  "maximum_capex_inr",
  "heater_fuels",
  "maximum_mass_kg",
  "max_assembly_time_hours",
];

/** Heater fuels as submitted: UI-only values are mapped onto contract fuels. */
function submittedFuels(fuels: string[] | undefined): string[] {
  return (fuels ?? ["kerosene"]).map((f) => (f === "passive_solar" ? "kerosene" : f));
}

/**
 * Weather archives are hourly, on the hour. A window starting at e.g. 23:24 matches no archive row and the weather
 * snapshot fails with a whole-window "gap" (WEATHER_GAP_TOO_LARGE), so the window is snapped to the hour.
 */
export function snapToHour(iso: string | undefined): string | undefined {
  return typeof iso === "string" ? iso.replace(/T(\d{2}):\d{2}:\d{2}(\.\d+)?/, "T$1:00:00") : iso;
}

function withHourlyWindow<S extends { analysis_start?: string; analysis_end?: string }>(site: S): S {
  return { ...site, analysis_start: snapToHour(site.analysis_start), analysis_end: snapToHour(site.analysis_end) };
}

const ECONOMIC_SET_IDS: Record<string, string> = {
  expected: "econ_ladakh_expected_v1",
  conservative: "econ_ladakh_conservative_v1",
  optimistic: "econ_ladakh_optimistic_v1",
};

export function economicSetId(id: string | undefined): string {
  return !id ? ECONOMIC_SET_IDS.expected : ECONOMIC_SET_IDS[id] ?? id;
}

/**
 * The envelope step as the backend's `design_options` (same shape the website sends). Only fields the user
 * filled in are sent, so anything left blank is still chosen by the generator.
 */
export function buildDesignOptions(draft: DraftRequirements): Record<string, unknown> {
  const e = draft.envelope ?? {};
  const out: Record<string, unknown> = { shape: "rectangular", require_separate_rooms: true };
  const set = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  };
  set("length_m", e.length_m);
  set("width_m", e.width_m);
  set("height_m", e.height_m);
  set("wall_thickness_mm", e.wall_thickness_mm);
  set("roof_thickness_mm", e.roof_thickness_mm);
  set("floor_thickness_mm", e.floor_thickness_mm);
  set("window_count", e.window_count);
  set("window_width_m", e.window_width_m);
  set("window_height_m", e.window_height_m);
  set("window_orientation", e.window_orientation?.toLowerCase());
  set("glazing", e.glazing_spec);
  set("air_changes_per_hour", e.air_changes_per_hour);
  return out;
}

/** Assembles the M0 RequirementsContract a generation request carries. */
export function buildRequirementsContract(draft: DraftRequirements, projectId: string): Result<RequirementsContract, FieldErrors> {
  const full = withEmptyGroups(draft);
  const parsed = completeSchema.safeParse(full);
  if (!parsed.success) return err(toFieldErrors(full, parsed.error.issues));
  const d = parsed.data;

  const constraints = Object.fromEntries(
    Object.entries({ ...d.constraints, heater_fuels: submittedFuels(d.constraints.heater_fuels) }).filter(
      ([key, value]) => SUBMITTED_CONSTRAINT_KEYS.includes(key) && value !== undefined
    )
  ) as unknown as RequirementsContract["constraints"];

  const mission = Object.fromEntries(
    Object.entries(d.mission).filter(([, v]) => v !== undefined)
  ) as unknown as RequirementsContract["mission"];

  // UI scenario labels map to the backend assumption-set ids the website uses; an unknown id passes through.
  const economicAssumptionSetId = economicSetId(d.economic_assumption_set_id);

  return ok({
    schema_version: "4.0",
    project_id: projectId,
    mode: "new_shelter",
    site: withHourlyWindow(d.site),
    mission: { ...mission, occupancy_schedule_id: d.mission.occupancy_schedule_id ?? `continuous_${d.mission.occupants}` },
    constraints,
    economic_assumption_set_id: economicAssumptionSetId,
  });
}

/**
 * The draft as a partial RequirementsContract for the compatibility check. Unlike
 * buildRequirementsContract it never fails: missing fields are left out and the
 * backend reports them, layer by layer, next to what already fits.
 */
export function previewRequirements(draft: DraftRequirements, projectId: string): Record<string, unknown> {
  const mission = draft.mission ?? {};
  const raw = draft.constraints ?? {};
  const constraints = Object.fromEntries(
    Object.entries(raw.heater_fuels ? { ...raw, heater_fuels: submittedFuels(raw.heater_fuels) } : raw).filter(
      ([key, value]) => SUBMITTED_CONSTRAINT_KEYS.includes(key) && value !== undefined
    )
  );
  return {
    schema_version: "4.0",
    project_id: projectId,
    mode: "new_shelter",
    ...(draft.site ? { site: withHourlyWindow(draft.site) } : {}),
    mission: {
      ...mission,
      ...(typeof mission.occupants === "number" && !mission.occupancy_schedule_id
        ? { occupancy_schedule_id: `continuous_${mission.occupants}` }
        : {}),
    },
    constraints,
    // Required by the contract; without it the backend reports the draft as incomplete however full it is.
    economic_assumption_set_id: economicSetId(draft.economic_assumption_set_id),
  };
}

export {
  ECONOMIC_SCENARIOS,
  GLAZING_SPECS,
  HEATER_FUELS,
  LOCATION_PRESETS,
  MISSION_TYPES,
  ROOM_TYPES,
  STANDARD_MATERIALS,
  WEATHER_SOURCES,
  WINDOW_ORIENTATIONS,
};
