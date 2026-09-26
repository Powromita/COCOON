"""
geometry_resolver.py - Turn a Layout into contract Floors, Zones and Surfaces.

Every surface is derived purely from the zone boxes (no footprint needed), so
the same resolver serves generated layouts and, later, user-drawn ones.

Frame (matches the M0 fixtures)
  * Local axes: x = east, y = north, z = up, at orientation_deg = 180.
  * ``orientation_deg`` is the compass azimuth of the outward normal of the
    local SOUTH facade (the y = min side). Rotating the building clockwise by
    theta therefore adds theta to every wall azimuth:
        wall_azimuth = (base_azimuth + orientation_deg - 180) mod 360
        base_azimuth: south 180, east 90, north 0, west 270
    The vertex coordinates stay in the un-rotated local frame; only the
    azimuth labels change with orientation.
  * Horizontal surfaces use azimuth 0. Tilt: roof/ceiling 0, wall 90, floor 180.

What is emitted, per zone
  * exterior_wall  - the part of each of its 4 faces with no neighbouring zone
                     on the same floor (boundary: outdoors).
  * partition      - the part of a face shared with a same-floor neighbour
                     (boundary: adjacent_zone).
  * floor / ceiling- plan overlap with zones on the storey below / above
                     (adjacent_zone); a ground-floor floor is boundary
                     ``ground``; roof = plan area with no zone above.
                     An upper floor with nothing below is an overhang: a floor
                     with boundary ``outdoors``.

Internal surfaces come in RECIPROCAL PAIRS: each zone lists its own side, the
two carry equal area and point at each other through adjacent_surface_id.
Anyone summing heat flow across zones must count one pair once.

Areas are GROSS: openings (doors/windows) and stair voids are not subtracted
here. ``vertices`` are a counter-clockwise polygon seen from the side the
outward normal points to (away from the owning zone); they are None for the
uncovered remainder of a face/slab that is not a whole rectangle.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from cocoon_contracts.building import (
    Floor,
    Surface,
    SurfaceBoundaryType,
    SurfaceType,
    Zone,
    ZoneSize,
)
from cocoon_contracts.common import Vector3D

from design_generator.layout_generator import Layout, ZoneLayout

DM = 10  # integer units of 0.1 m, as in layout_generator

FACES = ("south", "east", "north", "west")
_BASE_AZIMUTH = {"south": 180.0, "east": 90.0, "north": 0.0, "west": 270.0}
_OUTWARD = {
    "south": (0, -1, 0), "north": (0, 1, 0), "west": (-1, 0, 0), "east": (1, 0, 0),
    "up": (0, 0, 1), "down": (0, 0, -1),
}


class GeometryResolveError(ValueError):
    code = "GEOMETRY_RESOLVE_ERROR"


@dataclass(frozen=True)
class AssemblyIds:
    """Assembly ids written on surfaces. Stage 8 defines assemblies under these ids."""

    wall: str = "asm_wall"
    roof: str = "asm_roof"
    ground_floor: str = "asm_ground_floor"      # also used for a floor overhanging outdoors
    interfloor: str = "asm_interfloor"
    partition: str = "asm_partition"


def facade_azimuth(face: str, orientation_deg: float) -> float:
    """Compass azimuth of the outward normal of a local face at this building orientation."""
    return (_BASE_AZIMUTH[face] + orientation_deg - 180.0) % 360.0


@dataclass(frozen=True)
class ResolvedGeometry:
    floors: tuple[Floor, ...]
    surfaces: tuple[Surface, ...]
    orientation_deg: float
    _by_id: dict = field(default_factory=dict, repr=False, compare=False)

    def surface(self, surface_id: str) -> Surface:
        return self._by_id[surface_id]

    def surfaces_of(self, zone_id: str) -> list[Surface]:
        return [s for s in self.surfaces if s.owning_zone_id == zone_id]

    def between(self, zone_a: str, zone_b: str) -> list[Surface]:
        """Surfaces owned by zone_a whose far side is zone_b (wall or slab)."""
        return [s for s in self.surfaces if s.owning_zone_id == zone_a and s.adjacent_zone_id == zone_b]

    @property
    def zones(self) -> list[Zone]:
        return [z for f in self.floors for z in f.zones]


# ----- integer geometry ----------------------------------------------------
@dataclass(frozen=True)
class _Box:
    id: str
    level: int
    x0: int
    y0: int
    x1: int
    y1: int
    z0: int
    z1: int


def _box(z: ZoneLayout) -> _Box:
    x0, y0, z0 = (round(v * DM) for v in z.origin_m)
    return _Box(z.zone_id, z.floor_level, x0, y0,
                x0 + round(z.length_m * DM), y0 + round(z.width_m * DM), z0, z0 + round(z.height_m * DM))


def _m(v: int) -> float:
    return round(v / DM, 1)


def _pt(x: int, y: int, z: int) -> Vector3D:
    return Vector3D(x=_m(x), y=_m(y), z=_m(z))


def _oriented(points: list[tuple[int, int, int]], outward: str) -> list[Vector3D]:
    """Order a rectangle's corners counter-clockwise as seen from the outward side."""
    p0, p1, p2 = points[0], points[1], points[2]
    a = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
    b = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
    n = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    o = _OUTWARD[outward]
    if n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0:
        points = points[::-1]
    return [_pt(*p) for p in points]


def _wall_polygon(face: str, box: _Box, a0: int, a1: int) -> list[Vector3D]:
    if face in ("south", "north"):
        yc = box.y0 if face == "south" else box.y1
        pts = [(a0, yc, box.z0), (a1, yc, box.z0), (a1, yc, box.z1), (a0, yc, box.z1)]
    else:
        xc = box.x0 if face == "west" else box.x1
        pts = [(xc, a0, box.z0), (xc, a1, box.z0), (xc, a1, box.z1), (xc, a0, box.z1)]
    return _oriented(pts, face)


def _slab_polygon(rect: tuple[int, int, int, int], z: int, outward: str) -> list[Vector3D]:
    x0, y0, x1, y1 = rect
    return _oriented([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], outward)


def _neighbour_segments(box: _Box, face: str, boxes: list[_Box]) -> list[tuple[_Box, int, int]]:
    """(neighbour, a0, a1): where another same-floor zone touches this face."""
    out = []
    for n in boxes:
        if n.id == box.id or n.level != box.level:
            continue
        if face == "south" and n.y1 == box.y0:
            a0, a1 = max(box.x0, n.x0), min(box.x1, n.x1)
        elif face == "north" and n.y0 == box.y1:
            a0, a1 = max(box.x0, n.x0), min(box.x1, n.x1)
        elif face == "west" and n.x1 == box.x0:
            a0, a1 = max(box.y0, n.y0), min(box.y1, n.y1)
        elif face == "east" and n.x0 == box.x1:
            a0, a1 = max(box.y0, n.y0), min(box.y1, n.y1)
        else:
            continue
        if a1 > a0:
            out.append((n, a0, a1))
    return sorted(out, key=lambda t: (t[1], t[0].id))


def _plan_overlap(a: _Box, b: _Box) -> tuple[int, int, int, int] | None:
    x0, y0, x1, y1 = max(a.x0, b.x0), max(a.y0, b.y0), min(a.x1, b.x1), min(a.y1, b.y1)
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def _rect_area(r: tuple[int, int, int, int]) -> int:
    return (r[2] - r[0]) * (r[3] - r[1])


# ----- resolver ------------------------------------------------------------
def resolve_geometry(
    layout: Layout,
    *,
    orientation_deg: float = 180.0,
    assembly_ids: AssemblyIds = AssemblyIds(),
) -> ResolvedGeometry:
    if not 0.0 <= orientation_deg <= 360.0:
        raise GeometryResolveError(f"orientation_deg {orientation_deg} outside [0, 360]")

    boxes = [_box(z) for z in layout.zones]
    box_by_id = {b.id: b for b in boxes}
    if len(box_by_id) != len(boxes):
        raise GeometryResolveError("duplicate zone id in layout")

    surfaces: list[Surface] = []

    def add(**kw) -> None:
        surfaces.append(Surface(**kw))

    for box in boxes:
        h = box.z1 - box.z0

        # -- walls
        for face in FACES:
            az = facade_azimuth(face, orientation_deg)
            length = (box.x1 - box.x0) if face in ("south", "north") else (box.y1 - box.y0)
            start = box.x0 if face in ("south", "north") else box.y0
            covered = 0
            for nb, a0, a1 in _neighbour_segments(box, face, boxes):
                covered += a1 - a0
                add(
                    id=f"surf_{box.id}_{face}_{nb.id}", owning_zone_id=box.id,
                    boundary_type=SurfaceBoundaryType.ADJACENT_ZONE, surface_type=SurfaceType.PARTITION,
                    area_m2=round((a1 - a0) * h / (DM * DM), 6), azimuth_deg=az, tilt_deg=90.0,
                    assembly_id=assembly_ids.partition, adjacent_zone_id=nb.id,
                    adjacent_surface_id=f"surf_{nb.id}_{_opposite(face)}_{box.id}",
                    exposed_fraction=0.0, vertices=_wall_polygon(face, box, a0, a1),
                )
            if covered > length:
                raise GeometryResolveError(f"zone '{box.id}' {face} face is overlapped by neighbours")
            if covered < length:
                whole = covered == 0
                add(
                    id=f"surf_{box.id}_{face}", owning_zone_id=box.id,
                    boundary_type=SurfaceBoundaryType.OUTDOORS, surface_type=SurfaceType.EXTERIOR_WALL,
                    area_m2=round((length - covered) * h / (DM * DM), 6), azimuth_deg=az, tilt_deg=90.0,
                    assembly_id=assembly_ids.wall, exposed_fraction=1.0,
                    vertices=_wall_polygon(face, box, start, start + length) if whole else None,
                )

        # -- floor
        area = _rect_area((box.x0, box.y0, box.x1, box.y1))
        full_rect = (box.x0, box.y0, box.x1, box.y1)
        below = [(b, ov) for b in boxes if b.level == box.level - 1 and (ov := _plan_overlap(box, b))]
        if box.level == 0:
            add(
                id=f"surf_{box.id}_floor", owning_zone_id=box.id, boundary_type=SurfaceBoundaryType.GROUND,
                surface_type=SurfaceType.FLOOR, area_m2=round(area / (DM * DM), 6), azimuth_deg=0.0, tilt_deg=180.0,
                assembly_id=assembly_ids.ground_floor, exposed_fraction=1.0,
                vertices=_slab_polygon(full_rect, box.z0, "down"),
            )
        else:
            for b, ov in sorted(below, key=lambda t: t[0].id):
                add(
                    id=f"surf_{box.id}_floor_{b.id}", owning_zone_id=box.id,
                    boundary_type=SurfaceBoundaryType.ADJACENT_ZONE, surface_type=SurfaceType.FLOOR,
                    area_m2=round(_rect_area(ov) / (DM * DM), 6), azimuth_deg=0.0, tilt_deg=180.0,
                    assembly_id=assembly_ids.interfloor, adjacent_zone_id=b.id,
                    adjacent_surface_id=f"surf_{b.id}_ceiling_{box.id}", exposed_fraction=0.0,
                    vertices=_slab_polygon(ov, box.z0, "down"),
                )
            bare = area - sum(_rect_area(ov) for _, ov in below)
            if bare > 0:  # overhang: floor open to the outdoors
                add(
                    id=f"surf_{box.id}_floor", owning_zone_id=box.id, boundary_type=SurfaceBoundaryType.OUTDOORS,
                    surface_type=SurfaceType.FLOOR, area_m2=round(bare / (DM * DM), 6), azimuth_deg=0.0,
                    tilt_deg=180.0, assembly_id=assembly_ids.ground_floor, exposed_fraction=1.0,
                    vertices=_slab_polygon(full_rect, box.z0, "down") if bare == area else None,
                )

        # -- ceiling / roof
        above = [(b, ov) for b in boxes if b.level == box.level + 1 and (ov := _plan_overlap(box, b))]
        for b, ov in sorted(above, key=lambda t: t[0].id):
            add(
                id=f"surf_{box.id}_ceiling_{b.id}", owning_zone_id=box.id,
                boundary_type=SurfaceBoundaryType.ADJACENT_ZONE, surface_type=SurfaceType.CEILING,
                area_m2=round(_rect_area(ov) / (DM * DM), 6), azimuth_deg=0.0, tilt_deg=0.0,
                assembly_id=assembly_ids.interfloor, adjacent_zone_id=b.id,
                adjacent_surface_id=f"surf_{b.id}_floor_{box.id}", exposed_fraction=0.0,
                vertices=_slab_polygon(ov, box.z1, "up"),
            )
        open_sky = area - sum(_rect_area(ov) for _, ov in above)
        if open_sky > 0:
            add(
                id=f"surf_{box.id}_roof", owning_zone_id=box.id, boundary_type=SurfaceBoundaryType.OUTDOORS,
                surface_type=SurfaceType.ROOF, area_m2=round(open_sky / (DM * DM), 6), azimuth_deg=0.0,
                tilt_deg=0.0, assembly_id=assembly_ids.roof, exposed_fraction=1.0,
                vertices=_slab_polygon(full_rect, box.z1, "up") if open_sky == area else None,
            )

    floors = []
    for level in sorted({b.level for b in boxes}):
        zs = [z for z in layout.zones if z.floor_level == level]
        floors.append(
            Floor(
                id=f"floor_{level}", level=level, elevation_m=min(z.origin_m[2] for z in zs),
                zones=[
                    Zone(
                        id=z.zone_id, type=z.zone_type,
                        origin_m=Vector3D(x=z.origin_m[0], y=z.origin_m[1], z=z.origin_m[2]),
                        size_m=ZoneSize(length_m=z.length_m, width_m=z.width_m, height_m=z.height_m),
                    )
                    for z in zs
                ],
            )
        )

    ids = [s.id for s in surfaces]
    if len(set(ids)) != len(ids):
        raise GeometryResolveError("duplicate surface id generated")
    return ResolvedGeometry(
        floors=tuple(floors), surfaces=tuple(surfaces), orientation_deg=orientation_deg,
        _by_id={s.id: s for s in surfaces},
    )


def _opposite(face: str) -> str:
    return {"south": "north", "north": "south", "east": "west", "west": "east"}[face]
