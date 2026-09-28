/**
 * The requirements wizard's steps. Each editable step edits a slice of the
 * M0 RequirementsContract (see validation/schemas.ts for the exact fields);
 * no step collects a field the contract doesn't have.
 *
 *   location  → site.latitude_deg / longitude_deg / elevation_m / timezone
 *   weather   → site.analysis_start / analysis_end / weather_source
 *   mission   → mission.type (mode is fixed to "new_shelter")
 *   occupancy → mission.occupants / occupancy_schedule_id
 *   rooms     → mission.required_rooms
 *   footprint → constraints.maximum_footprint_m2 / maximum_floors / preferred_orientation_deg
 *   materials → constraints.available_material_ids (+ app-only generation_options.materials_snapshot_id)
 *   comfort   → mission.target_temperature_c / maximum_unmet_hours
 *   budget    → constraints.maximum_capex_inr / heater_fuels / maximum_mass_kg /
 *               max_assembly_time_hours, economic_assumption_set_id
 */
export type WizardStepId =
  | "location"
  | "weather"
  | "mission"
  | "occupancy"
  | "rooms"
  | "footprint"
  | "materials"
  | "comfort"
  | "budget"
  | "review";

export interface WizardStepDef {
  id: WizardStepId;
  index: number;
  title: string;
  description: string;
}

export const WIZARD_STEPS: WizardStepDef[] = [
  { id: "location", index: 0, title: "Location", description: "Where the shelter will stand." },
  { id: "weather", index: 1, title: "Weather", description: "The period the design is evaluated over." },
  { id: "mission", index: 2, title: "Mission", description: "What the shelter is for." },
  { id: "occupancy", index: 3, title: "Occupancy", description: "Who uses the shelter." },
  { id: "rooms", index: 4, title: "Rooms", description: "Spaces the layout must include." },
  { id: "footprint", index: 5, title: "Footprint", description: "Limits on size and orientation." },
  { id: "materials", index: 6, title: "Materials", description: "What the envelope may be built from." },
  { id: "comfort", index: 7, title: "Comfort", description: "The indoor conditions to maintain." },
  { id: "budget", index: 8, title: "Budget", description: "Cost, logistics and heating limits." },
  { id: "review", index: 9, title: "Review", description: "Check everything before generating designs." },
];

export const REVIEW_STEP_INDEX = WIZARD_STEPS.length - 1;

export function clampStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), REVIEW_STEP_INDEX);
}

export function stepAt(index: number): WizardStepDef {
  return WIZARD_STEPS[clampStepIndex(index)];
}

export function stepIndexOf(id: WizardStepId): number {
  return WIZARD_STEPS.findIndex((s) => s.id === id);
}
