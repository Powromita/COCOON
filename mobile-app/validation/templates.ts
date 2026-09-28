/**
 * Requirement templates a new project can start from. The only template is
 * the M0 contracts package's own sample (requirements_ladakh_30p.json) — a
 * prefill of editable inputs, not a result. The New Project screen labels it.
 */
import type { DraftRequirements } from "../database/schema/types";
import { getSampleRequirements } from "../mocks/fixtureLoader";

export const SAMPLE_TEMPLATE_LABEL = "M0 sample: Leh, 30 occupants, 4 rooms";

export function sampleRequirementsDraft(): DraftRequirements {
  const r = getSampleRequirements();
  return {
    site: { ...r.site },
    mission: { ...r.mission, required_rooms: [...r.mission.required_rooms] },
    constraints: {
      ...r.constraints,
      available_material_ids: [...(r.constraints.available_material_ids ?? [])],
      heater_fuels: [...(r.constraints.heater_fuels ?? [])],
    },
    economic_assumption_set_id: r.economic_assumption_set_id,
  };
}
