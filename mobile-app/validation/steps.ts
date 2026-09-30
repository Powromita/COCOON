/**
 * The requirements wizard's steps. Each editable step edits a slice of the
 * M0 RequirementsContract (see validation/schemas.ts for the exact fields);
 * no step collects a field the contract doesn't have.
 *
 *   site       → location + weather window
 *   design     → footprint, floors, materials, orientation, budget and heating fuels
 *   mission    → purpose, occupancy, rooms and comfort
 *   optimize   → lifecycle assumption set and candidate count
 */
export type WizardStepId =
  | "site"
  | "design"
  | "mission"
  | "optimize"
  | "review"
  // Backwards-compatible validation groups for previously saved drafts/tests.
  | "location"
  | "weather"
  | "occupancy"
  | "rooms"
  | "footprint"
  | "budget"
  | "comfort";

export interface WizardStepDef {
  id: WizardStepId;
  index: number;
  title: string;
  description: string;
}

export const WIZARD_STEPS: WizardStepDef[] = [
  { id: "site", index: 0, title: "Location & weather", description: "Choose an archive location and analysis period." },
  { id: "design", index: 1, title: "Design constraints", description: "Set footprint, floors, materials, orientation and budget." },
  { id: "mission", index: 2, title: "Mission & occupancy", description: "Describe the shelter use, occupants, rooms and comfort target." },
  { id: "optimize", index: 3, title: "Optimization", description: "Choose lifecycle assumptions and candidate count." },
  { id: "review", index: 4, title: "Review & generate", description: "Check requirements before running the RC optimization." },
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
