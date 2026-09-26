"""
quantities.py - Quantity takeoff from the generated geometry (PRD Section 13.3).

Everything is derived from the M0 BuildingModel (plus a MaterialSnapshot for
densities and the conditioned SimulationResult for heater sizing):

- net wall / partition / roof / floor / intermediate-floor areas
  (gross surface area minus the openings hosted on it);
- opening counts and areas (windows, external and internal doors);
- material volume and mass per assembly layer and per material;
- staircase count (ZoneConnection type 'stair');
- heater count (distinct zone hvac_id) and design peak load.

Internal partitions and inter-floor slabs are often described twice, once
from each side (e.g. a ceiling in the lower zone and a floor in the upper
zone). They are one physical element, so paired surfaces are counted once:
explicitly via adjacent_surface_id, or implicitly when two adjacent-zone
surfaces reference each other's zones with the same assembly and area.

Manual overrides are applied last, each with a mandatory reason, and are
returned in `overrides_applied` for the audit log.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from cocoon_contracts import (
    BuildingModel,
    ErrorCode,
    MaterialSnapshot,
    OpeningType,
    SimulationResult,
    SurfaceBoundaryType,
    SurfaceType,
    ZoneConnectionType,
)
from economics.errors import EconomicsError

AREA_TOL_M2 = 1e-6

CATEGORIES = ("wall", "partition", "roof", "floor", "intermediate_floor", "ceiling")


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SurfaceAreas(_M):
    gross_m2: float = 0.0
    openings_m2: float = 0.0
    net_m2: float = 0.0
    surface_count: int = 0


class LayerQuantity(_M):
    surface_id: str
    category: str
    assembly_id: str
    layer_index: int
    material_id: str
    thickness_mm: float
    net_area_m2: float
    volume_m3: float
    mass_kg: float


class MaterialQuantity(_M):
    material_id: str
    display_name: str
    density_kg_m3: float
    layer_area_m2: float
    volume_m3: float
    mass_kg: float


class OpeningQuantities(_M):
    window_count: int = 0
    window_area_m2: float = 0.0
    external_door_count: int = 0
    external_door_area_m2: float = 0.0
    internal_door_count: int = 0
    internal_door_area_m2: float = 0.0


class HeaterQuantity(_M):
    hvac_id: str
    zone_ids: list[str]
    design_peak_kw: float = Field(description="Simulated peak load served, before sizing margin")
    peak_source: str


class OverrideRecord(_M):
    key: str
    original_value: float
    new_value: float
    reason: str
    applied_at: datetime


class QuantityTakeoff(_M):
    revision_id: str
    material_snapshot_id: str
    floor_count: int
    zone_count: int
    floor_area_m2: float
    areas: dict[str, SurfaceAreas]
    constructed_area_m2: float = Field(description="Gross de-duplicated area of all opaque elements + openings")
    layers: list[LayerQuantity]
    materials: dict[str, MaterialQuantity]
    openings: OpeningQuantities
    staircase_count: int
    heaters: list[HeaterQuantity]
    heater_count: int
    heater_design_peak_kw_total: float
    total_material_mass_kg: float
    deduplicated_surface_ids: list[str]
    overrides_applied: list[OverrideRecord] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def _category(s) -> str:
    if s.surface_type == SurfaceType.EXTERIOR_WALL:
        return "wall"
    if s.surface_type == SurfaceType.PARTITION:
        return "partition"
    if s.surface_type == SurfaceType.ROOF:
        return "roof"
    if s.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE:
        return "intermediate_floor"          # floor or ceiling between two zones
    if s.surface_type == SurfaceType.FLOOR:
        return "floor"
    return "ceiling"


def _orientation_class(s) -> str:
    return "horizontal" if s.surface_type in (SurfaceType.FLOOR, SurfaceType.CEILING, SurfaceType.ROOF) else "vertical"


def _find_duplicates(building: BuildingModel) -> dict[str, str]:
    """Map duplicate surface id -> the surface id that is counted instead."""
    by_id = {s.id: s for s in building.surfaces}
    dup: dict[str, str] = {}
    ordered = sorted(building.surfaces, key=lambda s: s.id)
    for s in ordered:
        if s.id in dup or s.boundary_type != SurfaceBoundaryType.ADJACENT_ZONE:
            continue
        partner = None
        if s.adjacent_surface_id and s.adjacent_surface_id in by_id:
            partner = by_id[s.adjacent_surface_id]
        else:
            for t in ordered:
                if (t.id != s.id and t.id not in dup
                        and t.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE
                        and t.owning_zone_id == s.adjacent_zone_id
                        and t.adjacent_zone_id == s.owning_zone_id
                        and t.assembly_id == s.assembly_id
                        and _orientation_class(t) == _orientation_class(s)
                        and abs(t.area_m2 - s.area_m2) <= AREA_TOL_M2):
                    partner = t
                    break
        if partner is not None and partner.id not in dup and partner.id != s.id:
            dup[partner.id] = s.id
    return dup


def _heaters(building: BuildingModel, simulation: SimulationResult | None,
             warnings: list[str]) -> list[HeaterQuantity]:
    zones_by_hvac: dict[str, list[str]] = {}
    for f in building.floors:
        for z in f.zones:
            if z.hvac_id:
                zones_by_hvac.setdefault(z.hvac_id, []).append(z.id)

    zone_peak = {}
    if simulation is not None:
        zone_peak = {z.zone_id: z.peak_heating_kw for z in simulation.zones}
    building_peak = (simulation.summary.peak_heating_kw
                     if simulation is not None and simulation.summary is not None else 0.0)

    if not zones_by_hvac:
        if building_peak > 0:
            warnings.append(
                "BuildingModel defines no zone hvac_id although the conditioned simulation "
                "needs heating; assumed ONE heater sized to the building peak load. "
                "Use a 'heater_count' override (with reason) if this is wrong.")
            return [HeaterQuantity(hvac_id="assumed_single_heater", zone_ids=[],
                                   design_peak_kw=building_peak,
                                   peak_source="building_peak_no_hvac_in_building_model")]
        return []

    heaters: list[HeaterQuantity] = []
    have_all = all(zone_peak.get(z) is not None for zs in zones_by_hvac.values() for z in zs)
    for hvac_id in sorted(zones_by_hvac):
        zs = zones_by_hvac[hvac_id]
        if have_all:
            heaters.append(HeaterQuantity(hvac_id=hvac_id, zone_ids=zs,
                                          design_peak_kw=float(sum(zone_peak[z] for z in zs)),
                                          peak_source="zone_summary_peak_heating_kw"))
        else:
            heaters.append(HeaterQuantity(hvac_id=hvac_id, zone_ids=zs,
                                          design_peak_kw=building_peak / len(zones_by_hvac),
                                          peak_source="building_peak_split_equally"))
    if not have_all:
        warnings.append("Per-zone peak_heating_kw missing from SimulationResult; building peak "
                        "load split equally across heaters.")
    return heaters


def compute_quantities(building: BuildingModel, materials: MaterialSnapshot,
                       simulation: SimulationResult | None = None) -> QuantityTakeoff:
    warnings: list[str] = []
    dup = _find_duplicates(building)
    surfaces = {s.id: s for s in building.surfaces}

    openings_by_surface: dict[str, float] = {}
    oq = OpeningQuantities()
    for op in building.openings:
        counted_parent = dup.get(op.parent_surface_id, op.parent_surface_id)
        openings_by_surface[counted_parent] = openings_by_surface.get(counted_parent, 0.0) + op.area_m2
        parent = surfaces[op.parent_surface_id]
        if op.opening_type == OpeningType.WINDOW:
            oq.window_count += 1
            oq.window_area_m2 += op.area_m2
        elif parent.boundary_type in (SurfaceBoundaryType.ADJACENT_ZONE, SurfaceBoundaryType.ADIABATIC):
            oq.internal_door_count += 1
            oq.internal_door_area_m2 += op.area_m2
        else:
            oq.external_door_count += 1
            oq.external_door_area_m2 += op.area_m2

    areas = {c: SurfaceAreas() for c in CATEGORIES}
    layers: list[LayerQuantity] = []
    mats: dict[str, MaterialQuantity] = {}
    missing: set[str] = set()

    for s in sorted(building.surfaces, key=lambda s: s.id):
        if s.id in dup:
            continue
        cat = _category(s)
        op_area = openings_by_surface.get(s.id, 0.0)
        net = s.area_m2 - op_area
        if net < -AREA_TOL_M2:
            raise EconomicsError(
                ErrorCode.ZONE_GEOMETRY_INVALID,
                f"openings on surface '{s.id}' ({op_area:.3f} m2) exceed its gross area "
                f"({s.area_m2:.3f} m2)", {"surface_id": s.id})
        net = max(net, 0.0)
        a = areas[cat]
        a.gross_m2 += s.area_m2
        a.openings_m2 += op_area
        a.net_m2 += net
        a.surface_count += 1

        assembly = building.assemblies[s.assembly_id]
        for i, layer in enumerate(assembly.layers):
            rec = materials.materials.get(layer.material_id)
            if rec is None:
                missing.add(layer.material_id)
                continue
            vol = net * layer.thickness_mm / 1000.0
            mass = vol * rec.properties.density_kg_m3
            layers.append(LayerQuantity(
                surface_id=s.id, category=cat, assembly_id=s.assembly_id, layer_index=i,
                material_id=layer.material_id, thickness_mm=layer.thickness_mm,
                net_area_m2=net, volume_m3=vol, mass_kg=mass))
            m = mats.setdefault(layer.material_id, MaterialQuantity(
                material_id=layer.material_id, display_name=rec.display_name,
                density_kg_m3=rec.properties.density_kg_m3,
                layer_area_m2=0.0, volume_m3=0.0, mass_kg=0.0))
            m.layer_area_m2 += net
            m.volume_m3 += vol
            m.mass_kg += mass

    if missing:
        raise EconomicsError(
            ErrorCode.UNSUPPORTED_MATERIAL,
            f"materials not in snapshot '{materials.snapshot_id}': {sorted(missing)}",
            {"missing_material_ids": sorted(missing)})

    heaters = _heaters(building, simulation, warnings)
    zones = [z for f in building.floors for z in f.zones]
    return QuantityTakeoff(
        revision_id=building.revision_id,
        material_snapshot_id=materials.snapshot_id,
        floor_count=len(building.floors),
        zone_count=len(zones),
        floor_area_m2=sum(z.size_m.length_m * z.size_m.width_m for z in zones),
        areas=areas,
        constructed_area_m2=sum(a.gross_m2 for a in areas.values()),
        layers=layers,
        materials=mats,
        openings=oq,
        staircase_count=sum(1 for c in building.connections if c.connection_type == ZoneConnectionType.STAIR),
        heaters=heaters,
        heater_count=len(heaters),
        heater_design_peak_kw_total=sum(h.design_peak_kw for h in heaters),
        total_material_mass_kg=sum(m.mass_kg for m in mats.values()),
        deduplicated_surface_ids=sorted(dup),
        warnings=warnings,
    )


# ----------------------------------------------------------------------
# Manual overrides (PRD 13.3: require a reason, remain in the audit log)
# ----------------------------------------------------------------------

SCALAR_OVERRIDES = {
    "heater_count", "heater_design_peak_kw_total", "staircase_count",
    "window_count", "window_area_m2", "external_door_count", "internal_door_count",
}
MATERIAL_OVERRIDE_PREFIXES = ("material_volume_m3:", "material_area_m2:")


def apply_overrides(q: QuantityTakeoff, overrides: list) -> QuantityTakeoff:
    """Return a copy with overrides applied. `overrides` items have key/value/reason."""
    if not overrides:
        return q
    q = q.model_copy(deep=True)
    now = datetime.now(timezone.utc)
    for o in overrides:
        key, value, reason = o.key, float(o.value), o.reason
        if key in SCALAR_OVERRIDES:
            if key.endswith("_count"):
                if value != int(value):
                    raise EconomicsError(ErrorCode.VALIDATION_ERROR, f"override '{key}' must be an integer")
                value = int(value)
            if key in ("window_count", "window_area_m2", "external_door_count", "internal_door_count"):
                original = getattr(q.openings, key)
                setattr(q.openings, key, value)
            else:
                original = getattr(q, key)
                setattr(q, key, value)
        elif key.startswith(MATERIAL_OVERRIDE_PREFIXES):
            field, mid = key.split(":", 1)
            m = q.materials.get(mid)
            if m is None:
                raise EconomicsError(ErrorCode.MISSING_REFERENCE,
                                     f"override '{key}': material '{mid}' is not in this design")
            if field == "material_volume_m3":
                original = m.volume_m3
                m.volume_m3 = value
                m.mass_kg = value * m.density_kg_m3
            else:
                original = m.layer_area_m2
                m.layer_area_m2 = value
        else:
            raise EconomicsError(
                ErrorCode.VALIDATION_ERROR, f"unknown quantity override key '{key}'",
                {"allowed": sorted(SCALAR_OVERRIDES) + [p + "<mat_id>" for p in MATERIAL_OVERRIDE_PREFIXES]})
        q.overrides_applied.append(OverrideRecord(
            key=key, original_value=float(original), new_value=float(value), reason=reason, applied_at=now))
        q.warnings.append(f"manual override {key}: {original} -> {value} ({reason})")
    q.total_material_mass_kg = sum(m.mass_kg for m in q.materials.values())
    return q
