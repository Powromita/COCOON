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
  | "mission"
  | "constraints"
  | "envelope"
  | "optimize"
  | "review"
  // Backwards-compatible aliases
  | "design"
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
  {
    id: "site",
    index: 0,
    title: "1. Location & Weather",
    description: "Deployment coordinates, weather archive window & shelter identification.",
  },
  {
    id: "mission",
    index: 1,
    title: "2. Mission & Rooms",
    description: "Mission profile, troop occupancy, thermal targets & required room checklist.",
  },
  {
    id: "constraints",
    index: 2,
    title: "3. Site & Materials",
    description: "Site footprint, floors, allowable material catalog & heating fuel sources.",
  },
  {
    id: "envelope",
    index: 3,
    title: "4. Architectural Envelope",
    description: "Building dimensions, wall/roof/floor thickness, glazing & infiltration.",
  },
  {
    id: "optimize",
    index: 4,
    title: "5. Solver & Optimization",
    description: "Candidate pool count, economic scenario & baseline comparison.",
  },
  {
    id: "review",
    index: 5,
    title: "Review & Generate",
    description: "Verify all mission parameters before running the COCOON generative engine.",
  },
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
  if (id === "design") return 2; // maps to constraints
  const idx = WIZARD_STEPS.findIndex((s) => s.id === id);
  return idx >= 0 ? idx : 0;
}

