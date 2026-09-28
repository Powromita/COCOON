/**
 * Maps an M0 Project (from the project service: remote or demo) into the
 * same list-item shape local projects use, so the Projects screen renders
 * all three origins with one card. Values are copied, never inferred.
 */
import type { Project } from "@cocoon/contracts";

import type { ProjectListItem } from "../database/schema/types";

export function projectToListItem(p: Project): ProjectListItem {
  const site = p.site;
  return {
    id: p.project_id,
    name: p.name,
    displayStatus: "REQUIREMENTS_COMPLETE",
    lastStep: 0,
    updatedAt: p.updated_at,
    locationLabel: `${site.latitude_deg.toFixed(3)}°, ${site.longitude_deg.toFixed(3)}° · ${Math.round(site.elevation_m)} m`,
    selectedDesignId: p.active_design_id ?? null,
    runJobId: null,
    occupants: p.requirements.mission.occupants,
    maxFootprintM2: p.requirements.constraints.maximum_footprint_m2 ?? null,
    materialIds: [...(p.requirements.constraints.available_material_ids ?? [])],
    runStatus: null,
    dataProvider: null,
  };
}
