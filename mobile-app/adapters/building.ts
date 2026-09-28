/**
 * Presentation adapters for M0 BuildingModel. They select, rename and sum
 * geometry the model already contains (zone footprints, window areas) —
 * no thermal value is derived here.
 */
import type { BuildingModel, ConstructionAssembly, Zone } from "@cocoon/contracts";

export interface ZoneView {
  id: string;
  type: string;
  floorLevel: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  /** length × width of the zone as given in the BuildingModel. */
  floorAreaM2: number;
}

export interface AssemblyView {
  id: string;
  name: string;
  category: string;
  uValueWm2k: number | null;
  layers: { materialId: string; thicknessMm: number }[];
}

export interface BuildingSummary {
  designId: string;
  revisionId: string;
  source: string;
  floorCount: number;
  zones: ZoneView[];
  hasAirlock: boolean;
  /** Sum of zone floor areas from the model's own dimensions. */
  totalFloorAreaM2: number;
  windowAreaM2: number;
  doorCount: number;
  orientationDeg: number | null;
  assemblies: AssemblyView[];
  generatorVersion: string | null;
  seed: number | null;
  createdAt: string;
}

function zoneView(zone: Zone, floorLevel: number): ZoneView {
  return {
    id: zone.id,
    type: zone.type,
    floorLevel,
    lengthM: zone.size_m.length_m,
    widthM: zone.size_m.width_m,
    heightM: zone.size_m.height_m,
    floorAreaM2: zone.size_m.length_m * zone.size_m.width_m,
  };
}

function assemblyView(a: ConstructionAssembly): AssemblyView {
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    uValueWm2k: a.u_value_w_m2k ?? null,
    layers: a.layers.map((l) => ({ materialId: l.material_id, thicknessMm: l.thickness_mm })),
  };
}

export function summarizeBuilding(building: BuildingModel): BuildingSummary {
  const zones = building.floors.flatMap((f) => f.zones.map((z) => zoneView(z, f.level)));
  return {
    designId: building.design_id,
    revisionId: building.revision_id,
    source: building.source,
    floorCount: building.floors.length,
    zones,
    hasAirlock: zones.some((z) => z.type === "airlock"),
    totalFloorAreaM2: zones.reduce((sum, z) => sum + z.floorAreaM2, 0),
    windowAreaM2: building.openings.filter((o) => o.opening_type === "window").reduce((s, o) => s + o.area_m2, 0),
    doorCount: building.openings.filter((o) => o.opening_type === "door").length,
    orientationDeg: building.orientation_deg ?? null,
    assemblies: Object.values(building.assemblies).map(assemblyView),
    generatorVersion: building.metadata.generator_version ?? null,
    seed: building.metadata.seed ?? null,
    createdAt: building.metadata.created_at,
  };
}

export function findZone(building: BuildingModel, zoneId: string): ZoneView | undefined {
  for (const f of building.floors) {
    const z = f.zones.find((zone) => zone.id === zoneId);
    if (z) return zoneView(z, f.level);
  }
  return undefined;
}

/** Material ids used by any assembly that bounds the given zone. */
export function materialsForZone(building: BuildingModel, zoneId: string): string[] {
  const assemblyIds = new Set(building.surfaces.filter((s) => s.owning_zone_id === zoneId).map((s) => s.assembly_id));
  const ids = new Set<string>();
  for (const id of assemblyIds) {
    for (const layer of building.assemblies[id]?.layers ?? []) ids.add(layer.material_id);
  }
  return [...ids];
}
