"""
network.py - BuildingModel + MaterialSnapshot -> the zone graph the solver integrates (PRD 10.1).

Nodes are zones (one lumped air/effective-mass temperature each). Edges:

    outdoor opaque   zone -> outdoors, sol-air boundary, wind-dependent exterior film
    ground           zone -> ground temperature
    interzone        zone <-> zone (paired partition / slab surfaces are ONE edge)
    leaf             window / door leaf conduction (U x A)
    infiltration     zone -> outdoors, ACH x volume
    door exchange    open-door buoyancy exchange, outdoors or zone <-> zone   (EMPIRICAL)
    stair exchange   open stair / airflow path between zones                   (EMPIRICAL)

There is a single code path for any number of zones and floors: one-room, airlock and two-floor buildings are
all the same graph (PRD 10.1). Only the bottom-floor surfaces that the model marks `ground` exchange with the
ground and only surfaces marked `outdoors` (roof, walls) exchange with the weather.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from cocoon_contracts import (
    BuildingModel,
    MaterialSnapshot,
    OpeningType,
    Schedule,
    SurfaceBoundaryType,
    SurfaceType,
    ZoneConnectionType,
)

from m4_engine.errors import M4Error
from m4_engine.options import EngineOptions

AIR_CP_J_KGK = 1005.0
INSULATING_K = 0.1            # W/mK: a layer this poor a conductor ends the thermally-coupled mass (ISO 13790 style)


def air_density(elevation_m: float, t_c: float) -> float:
    p = 101325.0 * (1.0 - 2.25577e-5 * elevation_m) ** 5.25588
    return p / (287.05 * (t_c + 273.15))


@dataclass
class ZoneNode:
    id: str
    type: str
    level: int
    volume_m3: float
    floor_area_m2: float
    height_m: float
    capacity_j_k: float
    air_capacity_j_k: float
    contents_capacity_j_k: float
    construction_capacity_j_k: float
    heated: bool
    occupied: bool
    occupancy_schedule: Schedule | None
    equipment_schedule: Schedule | None
    infiltration_g_w_k: float = 0.0


@dataclass
class OutdoorEdge:
    zone: int
    surface_id: str
    area_m2: float
    u_w_m2k: float
    r_out_film: float
    azimuth_deg: float
    tilt_deg: float
    absorptivity: float
    emissivity: float
    exposed_fraction: float


@dataclass
class WindowSolar:
    zone: int
    opening_id: str
    effective_area_m2: float        # area x (1 - frame) x SHGC x shading
    azimuth_deg: float
    tilt_deg: float


@dataclass
class DoorExchange:
    zone_a: int
    zone_b: int | None              # None = outdoors
    opening_id: str
    area_m2: float
    open_fraction: float
    cd: float
    height_m: float


@dataclass
class StairExchange:
    zone_a: int
    zone_b: int
    connection_id: str
    area_m2: float
    cd: float
    height_m: float
    open_fraction: float


@dataclass
class Network:
    building_revision_id: str
    zones: list[ZoneNode]
    zone_index: dict[str, int]
    outdoor: list[OutdoorEdge] = field(default_factory=list)
    ground: list[tuple[int, float, str]] = field(default_factory=list)                 # (zone, G, surface id)
    interzone: list[tuple[int, int, float, str]] = field(default_factory=list)          # (a, b, G, id)
    leaf_outdoor: list[tuple[int, float, str]] = field(default_factory=list)
    windows: list[WindowSolar] = field(default_factory=list)
    doors: list[DoorExchange] = field(default_factory=list)
    stairs: list[StairExchange] = field(default_factory=list)
    ach: float = 0.0
    warnings: list[str] = field(default_factory=list)


# ----------------------------------------------------------------------------------------------------------
def schedule_value(s: Schedule | None, t: datetime) -> float:
    if s is None:
        return 0.0
    if s.points:
        val = 0.0
        for p in s.points:
            if p.timestamp <= t:
                val = p.value
            else:
                break
        return val
    if s.hourly_values:
        return float(s.hourly_values[t.hour % len(s.hourly_values)])
    return 0.0


def assembly_u(asm, materials: MaterialSnapshot) -> float:
    """Total U including films. The assembly's own U-value wins (M2 and M6's conductivity tests set/scale it)."""
    if asm.u_value_w_m2k:
        return float(asm.u_value_w_m2k)
    r = asm.r_inside_film_m2k_w + asm.r_outside_film_m2k_w
    for layer in asm.layers:
        rec = materials.materials.get(layer.material_id)
        if rec is None:
            raise M4Error("MATERIAL_NOT_IN_SNAPSHOT", f"material '{layer.material_id}' is not in snapshot "
                          f"'{materials.snapshot_id}'", {"material_id": layer.material_id})
        r += layer.thickness_mm / 1000.0 / rec.properties.thermal_conductivity_w_mk
    return 1.0 / r


def effective_capacity_per_area(asm, materials: MaterialSnapshot, max_thickness_m: float) -> float:
    """J/(m2 K) of the mass thermally coupled to the room, counted from the inside outward."""
    total, depth = 0.0, 0.0
    for layer in asm.layers:                                     # M0: inner -> outer
        rec = materials.materials.get(layer.material_id)
        if rec is None:
            raise M4Error("MATERIAL_NOT_IN_SNAPSHOT", f"material '{layer.material_id}' is not in snapshot",
                          {"material_id": layer.material_id})
        if rec.properties.thermal_conductivity_w_mk <= INSULATING_K:
            break
        th = min(layer.thickness_mm / 1000.0, max_thickness_m - depth)
        total += rec.properties.density_kg_m3 * rec.properties.specific_heat_j_kgk * th
        depth += th
        if depth >= max_thickness_m - 1e-12:
            break
    return total


def _outer_props(asm, materials: MaterialSnapshot, opts: EngineOptions) -> tuple[float, float]:
    rec = materials.materials.get(asm.layers[-1].material_id) if asm.layers else None
    a = rec.properties.solar_absorptivity if rec and rec.properties.solar_absorptivity is not None \
        else opts.default_opaque_absorptivity
    if opts.opaque_absorptivity_override is not None:
        a = opts.opaque_absorptivity_override
    e = rec.properties.emissivity if rec and rec.properties.emissivity is not None else opts.default_opaque_emissivity
    return a, e


def _pair_surfaces(building: BuildingModel) -> dict[str, str]:
    """Surface id -> the id of its twin, for surfaces that are the other side of the same physical element."""
    by_id = {s.id: s for s in building.surfaces}
    twin: dict[str, str] = {}
    adj = [s for s in sorted(building.surfaces, key=lambda s: s.id)
           if s.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE]
    for s in adj:
        if s.id in twin:
            continue
        partner = by_id.get(s.adjacent_surface_id) if s.adjacent_surface_id else None
        if partner is None:
            for t in adj:
                if (t.id != s.id and t.id not in twin and t.owning_zone_id == s.adjacent_zone_id
                        and t.adjacent_zone_id == s.owning_zone_id and abs(t.area_m2 - s.area_m2) < 1e-6
                        and (t.surface_type in (SurfaceType.PARTITION, SurfaceType.EXTERIOR_WALL))
                        == (s.surface_type in (SurfaceType.PARTITION, SurfaceType.EXTERIOR_WALL))):
                    partner = t
                    break
        if partner is not None and partner.id != s.id and partner.id not in twin:
            twin[s.id], twin[partner.id] = partner.id, s.id
    return twin


def build_network(
    building: BuildingModel,
    materials: MaterialSnapshot,
    opts: EngineOptions,
    *,
    ach: float,
    elevation_m: float,
    door_factor: float = 1.0,
) -> Network:
    rho = air_density(elevation_m, opts.air_reference_temperature_c)
    zones: list[ZoneNode] = []
    for f in building.floors:
        for z in f.zones:
            vol = z.size_m.length_m * z.size_m.width_m * z.size_m.height_m
            area = z.size_m.length_m * z.size_m.width_m
            occupied = bool(z.occupancy_schedule_id)          # same rule as M6: a room with an occupancy schedule
            zones.append(ZoneNode(
                id=z.id, type=z.type, level=f.level, volume_m3=vol, floor_area_m2=area, height_m=z.size_m.height_m,
                capacity_j_k=0.0, air_capacity_j_k=rho * AIR_CP_J_KGK * vol,
                contents_capacity_j_k=opts.contents_kj_per_k_per_m2 * 1000.0 * area, construction_capacity_j_k=0.0,
                heated=bool(z.hvac_id), occupied=occupied,
                occupancy_schedule=building.schedules.get(z.occupancy_schedule_id) if z.occupancy_schedule_id else None,
                equipment_schedule=building.schedules.get(z.equipment_schedule_id) if z.equipment_schedule_id else None,
                infiltration_g_w_k=rho * AIR_CP_J_KGK * ach * vol / 3600.0))
    idx = {z.id: i for i, z in enumerate(zones)}
    net = Network(building.revision_id, zones, idx, ach=ach)

    twin = _pair_surfaces(building)
    surfaces = {s.id: s for s in building.surfaces}
    open_area: dict[str, float] = {}
    for op in building.openings:
        open_area[op.parent_surface_id] = open_area.get(op.parent_surface_id, 0.0) + op.area_m2

    done: set[str] = set()
    for s in sorted(building.surfaces, key=lambda s: s.id):
        asm = building.assemblies[s.assembly_id]
        u = assembly_u(asm, materials)
        cap_pa = effective_capacity_per_area(asm, materials, opts.max_effective_mass_thickness_m)
        zi = idx[s.owning_zone_id]
        gross = s.area_m2
        opens = open_area.get(s.id, 0.0) + (open_area.get(twin[s.id], 0.0) if s.id in twin else 0.0)
        net_area = max(gross - opens, 0.0)

        if s.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE:
            zj = idx[s.adjacent_zone_id]
            if s.id in twin:
                zones[zi].construction_capacity_j_k += cap_pa * net_area          # each side keeps its own inner mass
                if s.id in done or twin[s.id] in done:
                    continue
                done.add(s.id)
                done.add(twin[s.id])
            else:
                half = cap_pa * net_area / 2.0                                      # one-sided: the element serves both rooms
                zones[zi].construction_capacity_j_k += half
                zones[zj].construction_capacity_j_k += half
            net.interzone.append((zi, zj, u * net_area, s.id))
            continue

        zones[zi].construction_capacity_j_k += cap_pa * net_area
        if s.boundary_type == SurfaceBoundaryType.ADIABATIC:
            continue
        if s.boundary_type == SurfaceBoundaryType.GROUND:
            net.ground.append((zi, u * net_area, s.id))
            continue
        a, e = _outer_props(asm, materials, opts)
        r_out = asm.r_outside_film_m2k_w
        if 1.0 / u - r_out <= 0:
            net.warnings.append(f"surface '{s.id}': outside film >= total resistance; wind coupling disabled")
            r_out = 0.0
        net.outdoor.append(OutdoorEdge(zi, s.id, net_area, u, r_out, s.azimuth_deg, s.tilt_deg, a, e, s.exposed_fraction))

    for op in building.openings:
        parent = surfaces[op.parent_surface_id]
        zi = idx[parent.owning_zone_id]
        outdoors = parent.boundary_type == SurfaceBoundaryType.OUTDOORS
        internal = parent.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE
        if outdoors:
            net.leaf_outdoor.append((zi, op.u_value_w_m2k * op.area_m2, op.id))
        elif internal:
            net.interzone.append((zi, idx[parent.adjacent_zone_id], op.u_value_w_m2k * op.area_m2, op.id))
        if op.opening_type == OpeningType.WINDOW and outdoors:
            shgc = op.shgc if op.shgc is not None else opts.default_window_shgc
            if op.shgc is None:
                net.warnings.append(f"window '{op.id}' has no SHGC; default {opts.default_window_shgc} used")
            eff = op.area_m2 * (1.0 - (op.frame_fraction or 0.0)) * shgc * (op.shading_factor if op.shading_factor is not None else 1.0)
            net.windows.append(WindowSolar(zi, op.id, eff, parent.azimuth_deg, parent.tilt_deg))
        if op.opening_type == OpeningType.DOOR:
            target = op.connected_boundary
            if target in (None, "") and internal:
                target = parent.adjacent_zone_id
            other: int | None
            if target in idx:
                other = idx[target]
            elif outdoors and target in (None, "", "outdoors"):
                other = None                                                    # exchanges with the weather
            else:
                net.warnings.append(f"door '{op.id}' connects to unknown boundary '{target}'; no air exchange modelled")
                continue
            frac = 0.0
            if op.open_events_per_hour and op.avg_open_duration_s:
                frac = min(1.0, op.open_events_per_hour * op.avg_open_duration_s / 3600.0 * door_factor)
            net.doors.append(DoorExchange(zi, other, op.id, op.area_m2, frac,
                                          op.discharge_coefficient if op.discharge_coefficient else opts.default_door_cd,
                                          opts.door_height_m))

    for c in building.connections:
        if c.connection_type in (ZoneConnectionType.STAIR, ZoneConnectionType.AIRFLOW) and c.shared_area_m2 > 0:
            za, zb = idx[c.zone_a_id], idx[c.zone_b_id]
            h = opts.stair_height_m or max(zones[za].height_m, zones[zb].height_m)
            net.stairs.append(StairExchange(za, zb, c.id, c.shared_area_m2, opts.stair_cd, h, opts.stair_open_fraction))

    for z in zones:
        z.capacity_j_k = z.air_capacity_j_k + z.contents_capacity_j_k + z.construction_capacity_j_k
        if z.capacity_j_k <= 0:
            raise M4Error("ZERO_CAPACITY", f"zone '{z.id}' has no thermal capacity")
    return net
