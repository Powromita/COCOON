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
 * Bounds are only those stated by the contract or true by definition
 * (latitude ±90°, 1–5 floors, 0–360°, positive areas and costs). No
 * engineering judgement is encoded — the backend decides feasibility, and
 * its 422 messages are shown to the user verbatim.
 */
import type { RequirementsContract } from "@cocoon/contracts";
import { z } from "zod";

import type { DraftRequirements } from "../database/schema/types";
import type { Result } from "../utils/result";
import { err, ok } from "../utils/result";
import { HEATER_FUELS, MISSION_TYPES, ROOM_TYPES, WEATHER_SOURCES } from "./options";
import type { WizardStepId } from "./steps";

const ROOM_VALUES = ROOM_TYPES.map((r) => r.value);

const finite = (label: string) => z.number({ error: `${label} must be a number.` });
const positive = (label: string) => finite(label).positive({ error: `${label} must be greater than 0.` });

const isoWithOffset = z.iso.datetime({
  offset: true,
  error: "Use a full date and time with a UTC offset, e.g. 2026-01-01T00:00:00+05:30.",
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
  }),
  occupancy_schedule_id: z.string().trim().nullable(),
  required_rooms: z
    .array(z.enum(ROOM_VALUES as [string, ...string[]], { error: "Unknown room type." }))
    .refine((rooms) => new Set(rooms).size === rooms.length, { error: "Each room type can be listed only once." }),
  target_temperature_c: finite("Target temperature"),
  maximum_unmet_hours: finite("Unmet hours").min(0, { error: "Unmet hours cannot be negative." }),
};

const constraints = {
  maximum_footprint_m2: positive("Footprint").nullable(),
  maximum_floors: finite("Floors")
    .int({ error: "Floors must be a whole number." })
    .min(1, { error: "Floors must be between 1 and 5." })
    .max(5, { error: "Floors must be between 1 and 5." })
    .nullable(),
  preferred_orientation_deg: finite("Orientation")
    .min(0, { error: "Orientation must be between 0° and 360°." })
    .max(360, { error: "Orientation must be between 0° and 360°." })
    .nullable(),
  available_material_ids: z.array(materialId),
  maximum_capex_inr: positive("CAPEX budget").nullable(),
  heater_fuels: z.array(z.string().min(1)),
  maximum_mass_kg: positive("Mass limit").nullable(),
  max_assembly_time_hours: positive("Assembly time").nullable(),
};

const generationOptions = z
  .object({
    materials_snapshot_id: z.string().optional(),
    count: finite("Design count").int().min(1).max(200, { error: "The backend accepts at most 200 designs." }).optional(),
    seed: finite("Seed").int().optional(),
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
  site: z.object(optionalAll(site)).superRefine(windowOrder).optional(),
  mission: z.object(optionalAll(mission)).optional(),
  constraints: z.object(optionalAll(constraints)).optional(),
  economic_assumption_set_id: z.string().optional(),
  generation_options: generationOptions,
});

// --- Layer 2: complete schema (gate for "Generate designs") ----------------
export const completeSchema = z.object({
  site: z.object(site).superRefine(windowOrder),
  mission: z.object({
    ...mission,
    required_rooms: mission.required_rooms.min(1, { error: "Add at least one room." }),
    occupancy_schedule_id: mission.occupancy_schedule_id.optional(),
    target_temperature_c: mission.target_temperature_c.optional(),
    maximum_unmet_hours: mission.maximum_unmet_hours.optional(),
  }),
  constraints: z.object(optionalAll(constraints)).default({}),
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

/** Field path → wizard step + human label. Every contract field the wizard edits is listed. */
export const FIELD_META: Record<string, { step: WizardStepId; label: string }> = {
  "site.latitude_deg": { step: "location", label: "Latitude" },
  "site.longitude_deg": { step: "location", label: "Longitude" },
  "site.elevation_m": { step: "location", label: "Elevation" },
  "site.timezone": { step: "location", label: "Timezone" },
  "site.weather_source": { step: "weather", label: "Weather source" },
  "site.analysis_start": { step: "weather", label: "Analysis start" },
  "site.analysis_end": { step: "weather", label: "Analysis end" },
  "mission.type": { step: "mission", label: "Mission type" },
  "mission.occupants": { step: "occupancy", label: "Occupants" },
  "mission.occupancy_schedule_id": { step: "occupancy", label: "Occupancy schedule" },
  "mission.required_rooms": { step: "rooms", label: "Rooms" },
  "constraints.maximum_footprint_m2": { step: "footprint", label: "Maximum footprint" },
  "constraints.maximum_floors": { step: "footprint", label: "Maximum floors" },
  "constraints.preferred_orientation_deg": { step: "footprint", label: "Preferred orientation" },
  "constraints.available_material_ids": { step: "materials", label: "Materials" },
  "generation_options.materials_snapshot_id": { step: "materials", label: "Material set" },
  "generation_options.count": { step: "review", label: "Design count" },
  "generation_options.seed": { step: "review", label: "Seed" },
  "mission.target_temperature_c": { step: "comfort", label: "Target temperature" },
  "mission.maximum_unmet_hours": { step: "comfort", label: "Maximum unmet hours" },
  "constraints.maximum_capex_inr": { step: "budget", label: "Maximum CAPEX" },
  "constraints.heater_fuels": { step: "budget", label: "Heater fuels" },
  "constraints.maximum_mass_kg": { step: "budget", label: "Maximum mass" },
  "constraints.max_assembly_time_hours": { step: "budget", label: "Maximum assembly time" },
  economic_assumption_set_id: { step: "budget", label: "Economic assumption set" },
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
    // Array item issues (e.g. required_rooms[2]) belong to the array field.
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

/**
 * Missing groups are validated as empty objects, so an absent `site` is
 * reported as each missing site field on its own wizard step rather than
 * as one vague "site: Required".
 */
function withEmptyGroups(draft: DraftRequirements): DraftRequirements {
  return { ...draft, site: draft.site ?? {}, mission: draft.mission ?? {}, constraints: draft.constraints ?? {} };
}

/** Every problem that would stop this draft becoming a valid RequirementsContract. */
export function validateAll(draft: DraftRequirements): FieldErrors {
  const full = withEmptyGroups(draft);
  const result = completeSchema.safeParse(full);
  return result.success ? [] : toFieldErrors(full, result.error.issues);
}

export function validateStep(step: WizardStepId, draft: DraftRequirements): FieldErrors {
  return validateAll(draft).filter((e) => e.step === step);
}

/** Only a wrong value blocks moving between steps — "missing" never does, so drafts can be saved incomplete. */
export function hasBlockingErrors(errors: FieldErrors): boolean {
  return errors.some((e) => e.kind === "invalid");
}

/** Assembles the M0 RequirementsContract a generation request carries. Fails with FieldErrors if incomplete. */
export function buildRequirementsContract(draft: DraftRequirements, projectId: string): Result<RequirementsContract, FieldErrors> {
  const full = withEmptyGroups(draft);
  const parsed = completeSchema.safeParse(full);
  if (!parsed.success) return err(toFieldErrors(full, parsed.error.issues));
  const d = parsed.data;
  const constraints = Object.fromEntries(
    Object.entries(d.constraints).filter(([, v]) => v !== undefined)
  ) as unknown as RequirementsContract["constraints"];
  const mission = Object.fromEntries(
    Object.entries(d.mission).filter(([, v]) => v !== undefined)
  ) as unknown as RequirementsContract["mission"];
  return ok({
    schema_version: "4.0",
    project_id: projectId,
    mode: "new_shelter",
    site: d.site,
    mission,
    constraints,
    economic_assumption_set_id: d.economic_assumption_set_id,
  });
}

export { HEATER_FUELS, MISSION_TYPES, ROOM_TYPES, WEATHER_SOURCES };
