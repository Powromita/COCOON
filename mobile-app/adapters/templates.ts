/**
 * Template catalogue → wizard choices, and backend failures → plain-language
 * explanations. Every availability decision here is read from the live M2
 * catalogue (GET /api/v1/templates) or a backend compatibility result; this
 * file only phrases them. ROOM_TYPES supplies display labels, never which
 * rooms exist.
 */
import type {
  CatalogMaterial,
  CompatibilityIssue,
  CompatibilityResult,
  JobStage,
  TemplateCatalog,
} from "../types/backend";
import { formatNumber, humanize } from "../utils/format";
import { FIELD_META } from "../validation/schemas";
import { ROOM_TYPES } from "../validation/options";
import type { WizardStepId } from "../validation/steps";

export function roomLabel(type: string): string {
  return ROOM_TYPES.find((r) => r.value === type)?.label ?? humanize(type);
}

export function roomDescription(type: string): string | undefined {
  return ROOM_TYPES.find((r) => r.value === type)?.description;
}

export interface RoomChoice {
  type: string;
  label: string;
  description?: string;
  /** e.g. "≥ 4 m² + 0.1 m² per person, at least 1.5 m wide" — M2's sizing rule. */
  sizing: string;
  /** False when no template can hold this room together with the rooms already chosen. */
  available: boolean;
  reason?: string;
}

function sizingText(rt: TemplateCatalog["room_types"][number]): string {
  const parts: string[] = [];
  if (rt.min_area_fixed_m2 > 0) parts.push(`${formatNumber(rt.min_area_fixed_m2, 1)} m²`);
  if (rt.min_area_per_person_m2 > 0) parts.push(`${formatNumber(rt.min_area_per_person_m2, 1)} m² per person`);
  return `At least ${parts.join(" + ") || "0 m²"}, ${formatNumber(rt.min_dimension_m, 1)} m wide`;
}

/** Templates whose rooms (own or shared) cover every one of `types`. */
export function templatesCovering(catalog: TemplateCatalog, types: string[]): string[] {
  return catalog.templates
    .filter((t) => t.active && types.every((type) => t.supported_functions.includes(type)))
    .map((t) => t.id);
}

/** Room types the user can add, from the catalogue, each marked available or not with the reason. */
export function roomChoices(catalog: TemplateCatalog, selected: string[]): RoomChoice[] {
  return catalog.room_types
    .filter((rt) => !selected.includes(rt.type))
    .map((rt) => {
      const fits = templatesCovering(catalog, [...selected, rt.type]).length > 0;
      return {
        type: rt.type,
        label: roomLabel(rt.type),
        description: roomDescription(rt.type),
        sizing: sizingText(rt),
        available: fits,
        reason: fits
          ? undefined
          : `No shelter template has a ${roomLabel(rt.type).toLowerCase()} room together with ${selected
              .map((s) => roomLabel(s).toLowerCase())
              .join(", ")}.`,
      };
    });
}

export interface ArrangementSupport {
  /** Some template gives this function its own room. */
  canDedicate: boolean;
  /** Some template provides it inside another room (that room's "serves" list). */
  canShare: boolean;
}

export function arrangementSupport(catalog: TemplateCatalog, type: string): ArrangementSupport {
  const rt = catalog.room_types.find((r) => r.type === type);
  return { canDedicate: (rt?.dedicated_in.length ?? 0) > 0, canShare: (rt?.shared_in.length ?? 0) > 0 };
}

export function sizingFor(catalog: TemplateCatalog, type: string): string | undefined {
  const rt = catalog.room_types.find((r) => r.type === type);
  return rt ? sizingText(rt) : undefined;
}

/** Floor-count choices: only counts some template actually has. */
export function floorOptions(catalog: TemplateCatalog): { value: string; label: string }[] {
  const max = Math.max(...catalog.floors.template_floor_counts);
  return Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: n === 1 ? "1 floor" : `Up to ${n} floors`,
  }));
}

export function materialSupport(catalog: TemplateCatalog | undefined, snapshotId: string | undefined, id: string): CatalogMaterial | undefined {
  if (!catalog || !snapshotId) return undefined;
  return catalog.materials[snapshotId]?.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------
// Compatibility → screen text
// ---------------------------------------------------------------------------

export function issueStep(issue: Pick<CompatibilityIssue, "field">): WizardStepId {
  const field = issue.field ?? "";
  if (field.startsWith("room_arrangement") || field.startsWith("generation_options.room_arrangement")) return "mission";
  if (field === "template_id") return "review";
  return FIELD_META[field]?.step ?? (field.startsWith("site") ? "site" : field.startsWith("mission") ? "mission" : "constraints");
}

export type CompatibilityView =
  | { kind: "compatible"; templates: { id: string; name: string; shared: Record<string, string> }[]; note: string }
  | { kind: "incomplete"; issues: CompatibilityIssue[]; fittingSoFar: string[] }
  | { kind: "incompatible"; headline: string; issues: CompatibilityIssue[]; alternatives: CompatibilityResult["alternatives"] };

/** What the review step shows for a backend compatibility result. */
export function compatibilityView(result: CompatibilityResult): CompatibilityView {
  const compatible = result.templates.filter((t) => result.selected_template_ids.includes(t.template_id));
  const blocking = result.conflicts.filter((c) => c.layer !== "input" || !result.input_errors.length);
  if (result.ok) {
    return {
      kind: "compatible",
      templates: compatible.map((t) => ({ id: t.template_id, name: t.name, shared: t.shared })),
      note: result.note,
    };
  }
  if (result.input_errors.length > 0 && blocking.length === 0) {
    return { kind: "incomplete", issues: result.input_errors, fittingSoFar: result.compatible_template_ids };
  }
  const physical = result.conflicts.find((c) => c.layer === "physical");
  const headline = physical
    ? "The rooms do not fit the footprint and floors you allowed."
    : result.conflicts.some((c) => c.layer === "selection")
      ? "The template you chose cannot hold these requirements."
      : "No shelter template can hold these requirements.";
  // Per-template reasons, de-duplicated so the same message is not repeated for every template.
  const seen = new Set<string>();
  const issues: CompatibilityIssue[] = [];
  for (const issue of [...result.conflicts, ...result.templates.flatMap((t) => t.issues)]) {
    if (seen.has(issue.message)) continue;
    seen.add(issue.message);
    issues.push(issue);
  }
  return { kind: "incompatible", headline, issues, alternatives: result.alternatives };
}

// ---------------------------------------------------------------------------
// Job failures → screen text
// ---------------------------------------------------------------------------
export type FailureCategory =
  | "invalid_input"
  | "no_compatible_template"
  | "physical_infeasibility"
  | "no_feasible_candidates"
  | "temporary_failure"
  | "downstream_failure"
  | "unexpected";

export interface FailureExplanation {
  category: FailureCategory;
  title: string;
  message: string;
  /** "edit": the requirements must change; "retry": the same request may succeed; "none": nothing to do. */
  action: "edit" | "retry";
  field?: string;
  step?: WizardStepId;
  referenceId?: string;
}

const CATEGORIES: FailureCategory[] = [
  "invalid_input",
  "no_compatible_template",
  "physical_infeasibility",
  "no_feasible_candidates",
  "temporary_failure",
  "downstream_failure",
  "unexpected",
];

/** M2 rejection-ledger keys the generator really emits, phrased for a person. */
const REJECTION_TEXT: Record<string, string> = {
  "constraints:envelope_mass_within_limit": "the envelope was heavier than the mass limit",
  "constraints:footprint_within_cap": "the footprint was larger than allowed",
  "constraints:room_min_area": "a room was smaller than its minimum area",
  "constraints:room_min_dimension": "a room was narrower than its minimum width",
  "constraints:window_to_wall_ratio": "there was too much glazing",
  "constraints:assembly_materials_allowed": "an assembly used a material that is not permitted",
  "constraints:assembly_thickness_buildable": "a wall, roof or floor could not be built to a practical thickness",
  "layout:NO_FEASIBLE_LAYOUT": "the rooms could not be laid out on the footprint",
  "composition:no_materials_for_wall": "no permitted material can form a wall",
  "composition:no_materials_for_roof": "no permitted material can form a roof",
  "composition:no_materials_for_floor": "no permitted material can form a floor",
  "duplicate:DUPLICATE_DESIGN": "it repeated an earlier design",
};

export function rejectionLines(reasons: Record<string, number> | undefined): string[] {
  if (!reasons) return [];
  return Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${n} attempt${n === 1 ? "" : "s"}: ${REJECTION_TEXT[key] ?? humanize(key.split(":").pop() ?? key)}`);
}

export function explainFailure(error: {
  message: string;
  code?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  traceId?: string;
}): FailureExplanation {
  const raw = error.details?.category;
  const category: FailureCategory = CATEGORIES.includes(raw as FailureCategory)
    ? (raw as FailureCategory)
    : error.retryable
      ? "temporary_failure"
      : "unexpected";
  const field = typeof error.details?.field === "string" ? error.details.field : undefined;
  const step = field ? issueStep({ field }) : undefined;
  switch (category) {
    case "invalid_input":
      return {
        category,
        title: `Check ${field ? (FIELD_META[field]?.label ?? humanize(field.split(".").pop() ?? field)).toLowerCase() : "your inputs"}`,
        message: error.message,
        action: "edit",
        field,
        step,
      };
    case "no_compatible_template":
      return { category, title: "No shelter template fits", message: error.message, action: "edit", field, step: step ?? "mission" };
    case "physical_infeasibility":
      return { category, title: "The rooms do not fit", message: error.message, action: "edit", field, step: step ?? "constraints" };
    case "no_feasible_candidates":
      return {
        category,
        title: "No design passed validation",
        message:
          "The generator built candidate layouts for your requirements, but none passed every check. The most common reasons are listed below.",
        action: "edit",
        step: "constraints",
      };
    case "temporary_failure":
      return {
        category,
        title: "The service was interrupted",
        message: "This was not caused by your inputs. They are saved; you can run the same request again.",
        action: "retry",
        referenceId: error.traceId,
      };
    case "downstream_failure":
      return {
        category,
        title: "A later pipeline stage failed",
        message: "Candidate designs were generated, but a later stage (simulation, economics, ranking or reporting) failed. Completed stages are shown above.",
        action: "retry",
        referenceId: error.traceId,
      };
    default:
      return {
        category: "unexpected",
        title: "Something went wrong",
        message: "The COCOON service hit an unexpected problem. Your inputs are saved.",
        action: "retry",
        referenceId: error.traceId,
      };
  }
}

// ---------------------------------------------------------------------------
// Job stages → screen text
// ---------------------------------------------------------------------------
export const STAGE_STATUS_TEXT: Record<string, string> = {
  pending: "Waiting",
  running: "In progress",
  completed: "Done",
  failed: "Failed",
  skipped: "Not run",
  not_requested: "Not requested",
  queued: "Queued",
  unavailable: "Unavailable on this server",
};

/** Stages to draw; the compatibility pre-check is always first and is never shown as "running". */
export function visibleStages(stages: JobStage[] | undefined): JobStage[] {
  return (stages ?? []).filter((s) => !(s.id === "ansys" && s.status === "not_requested"));
}
