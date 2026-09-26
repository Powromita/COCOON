"""
quantities.py - Bill of quantities for a finished BuildingModel.

Pure arithmetic: areas, counts, material volumes and masses. No prices; M7
(economics) attaches unit costs to these numbers. Each layer record carries
both area and volume so M7 can price per m2 or per m3.

Counting rules
  * Internal partitions and inter-floor slabs are physical objects that appear
    as reciprocal surface PAIRS in the model. Each pair is counted ONCE
    (represented by the surface with the smaller id). A surface that claims a
    neighbour but has no proper partner is counted by itself and reported in
    ``warnings``.
  * Net area = gross area - openings on either side of the pair - stair void
    (for the slab pair between the two zones a stair connects).
  * Layer volume = layer thickness x NET area of the surfaces using the
    assembly. Windows and doors are counted as units (count and area), not as
    wall layers.
  * Mass = volume x density from the material snapshot; None when no snapshot
    is supplied. A material missing from a supplied snapshot is an error.

Area groups: exterior_wall, partition, roof, ground_floor (floor over ground or
hanging over the outdoors), interfloor (slab between storeys).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

from cocoon_contracts.building import (
    BuildingModel,
    OpeningType,
    SurfaceBoundaryType,
    SurfaceType,
    ZoneConnectionType,
)
from cocoon_contracts.materials import MaterialSnapshot

AREA_GROUPS = ("exterior_wall", "partition", "roof", "ground_floor", "interfloor")
ORIENTATIONS = ("north", "east", "south", "west")
_PAIR_TOL_M2 = 1e-4


class QuantityError(ValueError):
    code = "QUANTITY_ERROR"

    def __init__(self, message: str, code: str | None = None):
        if code:
            self.code = code
        super().__init__(message)


# ----- outputs ---------------------------------------------------------------
@dataclass(frozen=True)
class AreaSummary:
    gross_m2: float
    net_m2: float


@dataclass(frozen=True)
class LayerQuantity:
    assembly_id: str
    category: str
    layer_index: int                 # 0 = first layer in the assembly's inner-to-outer order
    material_id: str
    thickness_mm: float
    area_m2: float
    volume_m3: float
    mass_kg: float | None


@dataclass(frozen=True)
class AssemblyQuantity:
    assembly_id: str
    category: str
    area_m2: float
    total_thickness_mm: float
    volume_m3: float
    mass_kg: float | None
    layers: tuple[LayerQuantity, ...]


@dataclass(frozen=True)
class MaterialQuantity:
    material_id: str
    area_m2: float                   # sum of the areas of the layers made of this material
    volume_m3: float
    mass_kg: float | None


@dataclass(frozen=True)
class OpeningQuantities:
    windows_count: int
    windows_area_m2: float
    windows_by_orientation: Mapping[str, Mapping[str, float]]   # {"south": {"count": 1, "area_m2": 2.4}, ...}
    glazing_counts: Mapping[str, int]                           # glazing_id -> count ("unspecified" if None)
    doors_count: int
    doors_area_m2: float
    exterior_doors: int
    internal_doors: int


@dataclass(frozen=True)
class Quantities:
    design_id: str
    revision_id: str
    materials_snapshot_id: str | None
    zone_count: int
    floor_count: int
    gross_floor_area_m2: float
    volume_m3: float
    areas: Mapping[str, AreaSummary]
    openings: OpeningQuantities
    staircases: int
    stair_footprint_m2: float
    assemblies: tuple[AssemblyQuantity, ...]
    materials: tuple[MaterialQuantity, ...]
    heaters: tuple = ()              # filled later by M6/M7; count and capacity are not known here
    warnings: tuple[str, ...] = ()

    def assembly(self, assembly_id: str) -> AssemblyQuantity:
        return next(a for a in self.assemblies if a.assembly_id == assembly_id)

    def material(self, material_id: str) -> MaterialQuantity:
        return next(m for m in self.materials if m.material_id == material_id)

    def to_dict(self) -> dict:
        def conv(o):
            if hasattr(o, "__dataclass_fields__"):
                return {k: conv(getattr(o, k)) for k in o.__dataclass_fields__}
            if isinstance(o, Mapping):
                return {k: conv(v) for k, v in o.items()}
            if isinstance(o, (tuple, list)):
                return [conv(v) for v in o]
            return o
        return conv(self)


# ----- helpers ---------------------------------------------------------------
def orientation_bucket(azimuth_deg: float) -> str:
    return ORIENTATIONS[int(round(azimuth_deg / 90.0)) % 4]


def _group(surface) -> str:
    st, bt = surface.surface_type, surface.boundary_type
    if st == SurfaceType.EXTERIOR_WALL:
        return "exterior_wall"
    if st == SurfaceType.PARTITION:
        return "partition"
    if st == SurfaceType.ROOF:
        return "roof"
    if bt in (SurfaceBoundaryType.GROUND, SurfaceBoundaryType.OUTDOORS):
        return "ground_floor"
    return "interfloor"


def _r(v: float, places: int = 6) -> float:
    return round(v, places)


# ----- main ------------------------------------------------------------------
def compute_quantities(building: BuildingModel, materials: MaterialSnapshot | None = None) -> Quantities:
    surfaces = {s.id: s for s in building.surfaces}
    warnings: list[str] = []

    # 1. one representative per physical object (pairs collapse to the smaller id)
    rep_of: dict[str, str] = {}
    loose = []                                   # internal surfaces that name no partner at all
    for s in building.surfaces:
        if s.boundary_type != SurfaceBoundaryType.ADJACENT_ZONE:
            rep_of[s.id] = s.id
            continue
        if not s.adjacent_surface_id:
            loose.append(s)
            continue
        p = surfaces.get(s.adjacent_surface_id)
        if p is not None and p.adjacent_surface_id == s.id:
            rep_of[s.id] = min(s.id, p.id)
            if s.id < p.id:
                if abs(s.area_m2 - p.area_m2) > _PAIR_TOL_M2:
                    warnings.append(f"pair '{s.id}'/'{p.id}' has unequal areas; using {s.area_m2} m2")
                if s.assembly_id != p.assembly_id:
                    warnings.append(f"pair '{s.id}'/'{p.id}' has different assemblies; using '{s.assembly_id}'")
        else:
            rep_of[s.id] = s.id
            warnings.append(f"internal surface '{s.id}' has a broken pairing; counted once by itself")

    # Surfaces with no adjacent_surface_id (e.g. one-sided user data): if exactly two of them join the
    # same two zones with the same kind of element (wall, or slab), they are the two faces of one object.
    groups: dict[tuple, list] = {}
    for s in loose:
        kind = "slab" if s.surface_type in (SurfaceType.CEILING, SurfaceType.FLOOR) else "wall"
        groups.setdefault((frozenset((s.owning_zone_id, s.adjacent_zone_id)), kind), []).append(s)
    for members in groups.values():
        if len(members) == 2 and members[0].owning_zone_id != members[1].owning_zone_id:
            a, b = sorted(members, key=lambda x: x.id)
            rep_of[a.id] = rep_of[b.id] = a.id
            warnings.append(f"surfaces '{a.id}' and '{b.id}' name no partner; treated as one object by inference")
        else:
            for s in members:
                rep_of[s.id] = s.id
                warnings.append(f"internal surface '{s.id}' has no partner; counted once by itself")
    reps ={rid: surfaces[rid] for rid in dict.fromkeys(rep_of.values())}

    # 2. subtract openings and stair voids from the representative's gross area
    removed: dict[str, float] = {rid: 0.0 for rid in reps}
    for op in building.openings:
        removed[rep_of[op.parent_surface_id]] += op.area_m2
    stairs = [c for c in building.connections if c.connection_type == ZoneConnectionType.STAIR]
    for c in stairs:
        slab_reps = {rep_of[s.id] for s in building.surfaces
                     if {s.owning_zone_id, s.adjacent_zone_id} == {c.zone_a_id, c.zone_b_id}
                     and s.surface_type in (SurfaceType.CEILING, SurfaceType.FLOOR)}
        if not slab_reps:
            warnings.append(f"stair '{c.id}' has no slab between its zones; no void subtracted")
        for rid in slab_reps:
            removed[rid] += c.shared_area_m2
    net = {}
    for rid, s in reps.items():
        n = s.area_m2 - removed[rid]
        if n < -_PAIR_TOL_M2:
            raise QuantityError(f"openings and voids ({_r(removed[rid], 3)} m2) exceed surface '{rid}' ({s.area_m2} m2)",
                                "OPENINGS_EXCEED_SURFACE")
        net[rid] = max(n, 0.0)

    # 3. area groups
    gross_g = {g: 0.0 for g in AREA_GROUPS}
    net_g = {g: 0.0 for g in AREA_GROUPS}
    for rid, s in reps.items():
        gross_g[_group(s)] += s.area_m2
        net_g[_group(s)] += net[rid]
    areas = {g: AreaSummary(_r(gross_g[g]), _r(net_g[g])) for g in AREA_GROUPS}

    # 4. assemblies -> layers -> materials
    asm_area: dict[str, float] = {}
    for rid, s in reps.items():
        asm_area[s.assembly_id] = asm_area.get(s.assembly_id, 0.0) + net[rid]

    def density(material_id: str) -> float | None:
        if materials is None:
            return None
        rec = materials.materials.get(material_id)
        if rec is None:
            raise QuantityError(f"material '{material_id}' is not in snapshot '{materials.snapshot_id}'",
                                "MATERIAL_NOT_IN_SNAPSHOT")
        return rec.properties.density_kg_m3

    assemblies, per_material = [], {}
    for aid in sorted(asm_area):
        asm = building.assemblies[aid]
        area = asm_area[aid]
        layers = []
        for i, layer in enumerate(asm.layers):
            volume = area * layer.thickness_mm / 1000.0
            rho = density(layer.material_id)
            mass = None if rho is None else volume * rho
            layers.append(LayerQuantity(aid, asm.category.value, i, layer.material_id, layer.thickness_mm,
                                        _r(area), _r(volume), None if mass is None else _r(mass, 3)))
            m = per_material.setdefault(layer.material_id, [0.0, 0.0, 0.0 if rho is not None else None])
            m[0] += area
            m[1] += volume
            if mass is not None:
                m[2] += mass
        vol = sum(l.volume_m3 for l in layers)
        masses = [l.mass_kg for l in layers]
        assemblies.append(AssemblyQuantity(
            aid, asm.category.value, _r(area), _r(sum(l.thickness_mm for l in asm.layers), 3), _r(vol),
            None if any(m is None for m in masses) else _r(sum(masses), 3), tuple(layers)))
    material_qs = tuple(
        MaterialQuantity(mid, _r(a), _r(v), None if m is None else _r(m, 3))
        for mid, (a, v, m) in sorted(per_material.items())
    )

    # 5. openings
    windows = [o for o in building.openings if o.opening_type == OpeningType.WINDOW]
    doors = [o for o in building.openings if o.opening_type == OpeningType.DOOR]
    by_orient = {k: {"count": 0, "area_m2": 0.0} for k in ORIENTATIONS}
    glazing: dict[str, int] = {}
    for w in windows:
        b = by_orient[orientation_bucket(surfaces[w.parent_surface_id].azimuth_deg)]
        b["count"] += 1
        b["area_m2"] = _r(b["area_m2"] + w.area_m2)
        key = w.glazing_id or "unspecified"
        glazing[key] = glazing.get(key, 0) + 1
    exterior_doors = sum(
        1 for d in doors
        if d.connected_boundary == "outdoors" or surfaces[d.parent_surface_id].boundary_type == SurfaceBoundaryType.OUTDOORS
    )
    opening_q = OpeningQuantities(
        windows_count=len(windows), windows_area_m2=_r(sum(w.area_m2 for w in windows)),
        windows_by_orientation=by_orient, glazing_counts=dict(sorted(glazing.items())),
        doors_count=len(doors), doors_area_m2=_r(sum(d.area_m2 for d in doors)),
        exterior_doors=exterior_doors, internal_doors=len(doors) - exterior_doors,
    )

    zones = [z for f in building.floors for z in f.zones]
    return Quantities(
        design_id=building.design_id, revision_id=building.revision_id,
        materials_snapshot_id=materials.snapshot_id if materials else None,
        zone_count=len(zones), floor_count=len(building.floors),
        gross_floor_area_m2=_r(sum(z.size_m.length_m * z.size_m.width_m for z in zones)),
        volume_m3=_r(sum(z.size_m.length_m * z.size_m.width_m * z.size_m.height_m for z in zones)),
        areas=areas, openings=opening_q, staircases=len(stairs),
        stair_footprint_m2=_r(sum(c.shared_area_m2 for c in stairs)),
        assemblies=tuple(assemblies), materials=material_qs, heaters=(), warnings=tuple(warnings),
    )
