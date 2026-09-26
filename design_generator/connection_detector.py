"""
connection_detector.py - Doors, stair links and inter-zone connections.

Follows the conventions of the M0 fixtures:
  * A DOOR is an ``Opening`` (opening_type door) sitting on a wall surface.
    - Internal door: ``connected_boundary`` = the zone on the far side.
    - Entrance door: ``connected_boundary`` = "outdoors", on an exterior wall
      of a ground-floor room flagged ``exterior_access``.
  * A ``ZoneConnection`` of type PARTITION exists for every pair of zones that
    share a wall (shared_area = wall area); ``is_conditioned`` is True when a
    door joins the pair, i.e. air can pass. A STAIR connection joins the two
    zones a stair links (shared_area = stair footprint).
  * Floors/ceilings between storeys get no connection of their own; their
    conduction is carried by the paired slab surfaces from the resolver.

Each internal door is attached to ONE side of a paired wall (the room listed
first in the template link). Treat it as belonging to the whole pair: the
paired surface on the other side is not given a second door.

Door sizes, U-value and door-event numbers are PLACEHOLDER defaults (see
DoorDefaults), echoing the fixture values. The entrance goes on the first
face in ``entrance_face_priority`` whose exterior wall is long enough; the
default keeps the south (solar) facade free of doors.

``find_unreachable`` is independent of templates: it walks the finished
openings and connections outward from "outdoors", so later stages and the
constraint checker can reuse it on any BuildingModel content.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from cocoon_contracts.building import (
    Opening,
    OpeningType,
    Surface,
    SurfaceBoundaryType,
    SurfaceType,
    ZoneConnection,
    ZoneConnectionType,
)

from design_generator.geometry_resolver import ResolvedGeometry
from design_generator.layout_generator import Layout

OUTDOORS = "outdoors"
EDGE_MARGIN_M = 0.05                       # clearance each side of a door in its wall
DEFAULT_ENTRANCE_FACE_PRIORITY = ("north", "east", "west", "south")


class ConnectionDetectError(ValueError):
    code = "CONNECTION_DETECT_ERROR"

    def __init__(self, message: str, code: str | None = None):
        if code:
            self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class DoorDefaults:
    """PLACEHOLDER door assumptions (values echo the M0 fixtures). Replace after review."""

    width_m: float = 0.9
    height_m: float = 2.0
    u_value_w_m2k: float = 2.2
    discharge_coefficient: float = 0.65
    entrance_events_per_hour: float = 4.0
    entrance_open_duration_s: float = 10.0
    internal_events_per_hour: float = 6.0
    internal_open_duration_s: float = 8.0

    @property
    def area_m2(self) -> float:
        return round(self.width_m * self.height_m, 6)


@dataclass(frozen=True)
class DoorPlacement:
    """Where a door sits, for viewers and ANSYS. The contract Opening has no position."""

    opening_id: str
    parent_surface_id: str
    axis: str                                # "x" or "y": direction the wall runs in the local frame
    offset_along_wall_m: float               # from the wall's minimum coordinate to the door's near edge
    width_m: float
    height_m: float
    centre_m: tuple[float, float, float]     # door centre in the local building frame


@dataclass(frozen=True)
class ConnectionResult:
    connections: tuple[ZoneConnection, ...]
    openings: tuple[Opening, ...]
    placements: tuple[DoorPlacement, ...]
    unreachable_zones: tuple[str, ...]


# ----- helpers --------------------------------------------------------------
def _wall_extent(surface: Surface) -> tuple[str, float, float, float, float]:
    """(axis, start, length, z0, z1) of a wall surface from its vertices."""
    v = surface.vertices
    if not v:
        raise ConnectionDetectError(f"surface '{surface.id}' has no vertices; cannot place a door", "DOOR_DOES_NOT_FIT")
    xs, ys, zs = [p.x for p in v], [p.y for p in v], [p.z for p in v]
    if max(xs) - min(xs) < 1e-9:
        return "y", min(ys), max(ys) - min(ys), min(zs), max(zs)
    return "x", min(xs), max(xs) - min(xs), min(zs), max(zs)


def _fixed_coordinate(surface: Surface, axis: str) -> float:
    v = surface.vertices
    return v[0].x if axis == "y" else v[0].y


def _place(opening_id: str, surface: Surface, door: DoorDefaults) -> DoorPlacement:
    axis, start, length, z0, z1 = _wall_extent(surface)
    need = door.width_m + 2 * EDGE_MARGIN_M
    if length + 1e-9 < need or (z1 - z0) + 1e-9 < door.height_m:
        raise ConnectionDetectError(
            f"door {door.width_m}x{door.height_m} m does not fit wall '{surface.id}' "
            f"({length:.2f} m long, {z1 - z0:.2f} m high)", "DOOR_DOES_NOT_FIT")
    offset = round((length - door.width_m) / 2, 3)
    along = start + offset + door.width_m / 2
    fixed = _fixed_coordinate(surface, axis)
    centre = (round(fixed, 3), round(along, 3), round(z0 + door.height_m / 2, 3)) if axis == "y" \
        else (round(along, 3), round(fixed, 3), round(z0 + door.height_m / 2, 3))
    return DoorPlacement(opening_id, surface.id, axis, offset, door.width_m, door.height_m, centre)


def _door(opening_id: str, surface: Surface, boundary: str, door: DoorDefaults, *, entrance: bool) -> Opening:
    return Opening(
        id=opening_id, parent_surface_id=surface.id, opening_type=OpeningType.DOOR, area_m2=door.area_m2,
        u_value_w_m2k=door.u_value_w_m2k, is_operable=True, connected_boundary=boundary,
        open_events_per_hour=door.entrance_events_per_hour if entrance else door.internal_events_per_hour,
        avg_open_duration_s=door.entrance_open_duration_s if entrance else door.internal_open_duration_s,
        discharge_coefficient=door.discharge_coefficient,
    )


# ----- reachability ---------------------------------------------------------
def find_unreachable(
    zone_ids: list[str],
    surfaces: list[Surface] | tuple[Surface, ...],
    openings: list[Opening] | tuple[Opening, ...],
    connections: list[ZoneConnection] | tuple[ZoneConnection, ...],
) -> list[str]:
    """Zones with no walkable route (doors, stairs) from outdoors. Sorted."""
    owner = {s.id: s.owning_zone_id for s in surfaces}
    graph: dict[str, set[str]] = {OUTDOORS: set(), **{z: set() for z in zone_ids}}

    def link(a: str, b: str) -> None:
        if a in graph and b in graph:
            graph[a].add(b)
            graph[b].add(a)

    for op in openings:
        if op.opening_type == OpeningType.DOOR and op.connected_boundary and op.parent_surface_id in owner:
            link(owner[op.parent_surface_id], op.connected_boundary)
    for c in connections:
        if c.connection_type in (ZoneConnectionType.STAIR, ZoneConnectionType.DOOR):
            link(c.zone_a_id, c.zone_b_id)

    seen, queue = {OUTDOORS}, deque([OUTDOORS])
    while queue:
        for nxt in graph[queue.popleft()]:
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return sorted(set(zone_ids) - seen)


# ----- detector -------------------------------------------------------------
def detect_connections(
    layout: Layout,
    geometry: ResolvedGeometry,
    *,
    door: DoorDefaults = DoorDefaults(),
    entrance_face_priority: tuple[str, ...] = DEFAULT_ENTRANCE_FACE_PRIORITY,
) -> ConnectionResult:
    openings: list[Opening] = []
    placements: list[DoorPlacement] = []
    connections: list[ZoneConnection] = []
    zone_ids = [z.zone_id for z in layout.zones]

    # -- internal doors (from the template links)
    door_pairs: set[frozenset[str]] = set()
    for a, b, kind in layout.links:
        if kind != "door":
            continue
        walls = [s for s in geometry.between(a, b) if s.surface_type == SurfaceType.PARTITION]
        if len(walls) != 1:
            raise ConnectionDetectError(
                f"door between '{a}' and '{b}' needs exactly one shared wall, found {len(walls)}", "DOOR_DOES_NOT_FIT")
        oid = f"op_{a}_{b}_door"
        placements.append(_place(oid, walls[0], door))
        openings.append(_door(oid, walls[0], b, door, entrance=False))
        door_pairs.add(frozenset((a, b)))

    # -- entrance doors (ground-floor rooms flagged exterior_access)
    for z in layout.zones:
        if not (z.exterior_access and z.floor_level == 0):
            continue
        need = door.width_m + 2 * EDGE_MARGIN_M
        candidates = {
            s.id.rsplit("_", 1)[-1]: s for s in geometry.surfaces_of(z.zone_id)
            if s.surface_type == SurfaceType.EXTERIOR_WALL and s.vertices
            and _wall_extent(s)[2] + 1e-9 >= need
        }
        face = next((f for f in entrance_face_priority if f in candidates), None)
        if face is None:
            raise ConnectionDetectError(
                f"zone '{z.zone_id}' has no exterior wall long enough for an entrance door "
                f"(needs {need:.2f} m)", "NO_ENTRANCE_WALL")
        oid = f"op_{z.zone_id}_entry_door"
        placements.append(_place(oid, candidates[face], door))
        openings.append(_door(oid, candidates[face], OUTDOORS, door, entrance=True))

    # -- partition connections: one per pair of zones that share a wall
    shared: dict[tuple[str, str], float] = {}
    for s in geometry.surfaces:
        if s.surface_type == SurfaceType.PARTITION and s.owning_zone_id < s.adjacent_zone_id:
            key = (s.owning_zone_id, s.adjacent_zone_id)
            shared[key] = round(shared.get(key, 0.0) + s.area_m2, 6)
    for (a, b), area in sorted(shared.items()):
        connections.append(ZoneConnection(
            id=f"conn_partition_{a}_{b}", zone_a_id=a, zone_b_id=b,
            connection_type=ZoneConnectionType.PARTITION, shared_area_m2=area,
            is_conditioned=frozenset((a, b)) in door_pairs,
        ))

    # -- stairs
    for s in layout.stairs:
        connections.append(ZoneConnection(
            id=f"conn_stair_{s.lower_zone_id}_{s.upper_zone_id}",
            zone_a_id=s.lower_zone_id, zone_b_id=s.upper_zone_id, connection_type=ZoneConnectionType.STAIR,
            shared_area_m2=round(s.length_m * s.width_m, 6), is_conditioned=True,
        ))

    unreachable = find_unreachable(zone_ids, geometry.surfaces, openings, connections)
    return ConnectionResult(tuple(connections), tuple(openings), tuple(placements), tuple(unreachable))
