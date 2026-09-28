/**
 * VisualizationModel adapters.
 *
 * buildingToVisualizationModel() exists because main's backend has no
 * /api/v1/visualizations endpoint yet. It assembles an M0 VisualizationModel
 * by COPYING the BuildingModel's geometry (zone boxes, surface polygons) and
 * the simulation timeseries' zone temperatures — it computes nothing.
 * Openings are omitted: M0 BuildingModel openings carry an area but no
 * position, and inventing one would misrepresent the design. Screens always
 * label a model built this way (origin "building_geometry").
 */
import type {
  BuildingModel,
  MeshBox,
  SurfaceVisual,
  VisualizationModel,
  ZoneTemperatureSeries,
} from "@cocoon/contracts";

import type { TimeseriesResponse } from "../types/backend";

export function zoneBoxId(zoneId: string): string {
  return `box_${zoneId}`;
}

export function buildingToVisualizationModel(
  building: BuildingModel,
  timeseries: TimeseriesResponse | undefined,
  generatedAt: string = new Date().toISOString()
): VisualizationModel {
  const boxes: MeshBox[] = building.floors.flatMap((floor) =>
    floor.zones.map((zone) => ({
      id: zoneBoxId(zone.id),
      name: `Zone: ${zone.type}`,
      origin_m: { ...zone.origin_m },
      size_m: { x: zone.size_m.length_m, y: zone.size_m.width_m, z: zone.size_m.height_m },
      floor_level: floor.level,
      zone_id: zone.id,
      material_id: null,
    }))
  );

  const surfaces: SurfaceVisual[] = building.surfaces
    .filter((s) => (s.vertices?.length ?? 0) >= 3)
    .map((s) => ({
      id: `vsurf_${s.id}`,
      parent_mesh_id: zoneBoxId(s.owning_zone_id),
      surface_type: s.surface_type,
      boundary_type: s.boundary_type,
      is_exterior: s.boundary_type === "outdoors",
      vertices: (s.vertices ?? []).map((v) => ({ ...v })),
    }));

  let temperature_series: ZoneTemperatureSeries[] | null = null;
  if (timeseries && timeseries.points.length > 0) {
    const ids = new Set<string>();
    for (const p of timeseries.points) for (const id of Object.keys(p.zone_temperatures_c)) ids.add(id);
    temperature_series = [...ids].map((zoneId) => {
      const pts = timeseries.points.filter((p) => typeof p.zone_temperatures_c[zoneId] === "number");
      return {
        zone_id: zoneId,
        timestamps: pts.map((p) => p.timestamp),
        temperatures_c: pts.map((p) => p.zone_temperatures_c[zoneId]),
      };
    });
  }

  return {
    schema_version: "4.0",
    model_id: `viz_local_${building.revision_id}`,
    design_revision_id: building.revision_id,
    source: temperature_series ? "rc" : "geometry",
    boxes,
    surfaces,
    openings: [],
    temperature_series,
    contour_artifacts: null,
    generated_at: generatedAt,
  };
}

export interface VisualizationCheck {
  ok: boolean;
  problems: string[];
}

/** Structural check before a model reaches the WebView — bad input shows an error, not a blank canvas. */
export function checkVisualizationModel(model: unknown): VisualizationCheck {
  const problems: string[] = [];
  const m = model as Partial<VisualizationModel> | null;
  if (!m || typeof m !== "object") return { ok: false, problems: ["not an object"] };
  if (m.schema_version !== "4.0") problems.push(`schema_version is "${String(m.schema_version)}", expected "4.0"`);
  if (!Array.isArray(m.boxes)) {
    problems.push("boxes is missing");
  } else if (m.boxes.length === 0) {
    problems.push("model has no boxes to draw");
  } else {
    m.boxes.forEach((b, i) => {
      const s = b?.size_m;
      const o = b?.origin_m;
      const nums = [s?.x, s?.y, s?.z, o?.x, o?.y, o?.z];
      if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) problems.push(`box ${i} has invalid geometry`);
      else if ((s?.x ?? 0) <= 0 || (s?.y ?? 0) <= 0 || (s?.z ?? 0) <= 0) problems.push(`box ${i} has a non-positive size`);
    });
  }
  (m.temperature_series ?? []).forEach((ts, i) => {
    if (ts.timestamps.length !== ts.temperatures_c.length) problems.push(`temperature_series ${i} length mismatch`);
  });
  return { ok: problems.length === 0, problems };
}

export function floorLevels(model: VisualizationModel): number[] {
  return [...new Set(model.boxes.map((b) => b.floor_level ?? 0))].sort((a, b) => a - b);
}
