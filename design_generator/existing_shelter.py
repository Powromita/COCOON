"""
existing_shelter.py - Turn a user-described rectangular shelter into a BuildingModel (PRD section 8.5).

The user supplies the rooms, which doors and stairs exist, the windows, and
the real construction of the envelope. This module reuses the generator's own
resolver, connection detector, checker and quantities, and returns:

  building   BuildingModel with source = "user_defined"
  quantities bill of quantities (masses need a material snapshot)
  report     constraint report - ADVISORY here: an existing shelter is described
             as it is, so requirement-based checks are skipped and the
             buildable-thickness check is off; overlaps, reachability, pairing,
             openings and glazing ratio are still reported
  topology   plain-language view of what was detected, for the user to confirm
             before anything is simulated

Input rules (violations raise UserGeometryError with a stable code):
  * zone x / y / sizes are multiples of 0.1 m; local frame as in the resolver
    (x east, y north at orientation_deg = 180; see geometry_resolver);
  * floor levels are 0..n-1; a floor's elevation is the sum of the tallest
    ceilings of the floors below;
  * ``doors`` join two zones on one floor that share a wall of >= 1.0 m;
    ``entrance: true`` puts an outside door on a ground-floor zone;
  * ``stairs`` join adjacent floors; a footprint is placed automatically
    (1.0 x 3.0 m) unless given;
  * ``windows`` name a zone and a face (south / east / north / west, local
    frame) that is an exterior wall; they are spaced along the wall clear of doors;
  * ``assemblies`` give every needed element as [[material_id, thickness_mm], ...]
    inner -> outer: wall, roof, floor (over ground), interfloor and partition
    when the building has them.

Not in the BuildingModel contract, so returned in ``extras``: glazing name,
``air_changes_per_hour`` if the user gave it, occupants and heater zones.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from cocoon_contracts.building import (
    AssemblyLayer,
    BuildingMetadata,
    BuildingModel,
    BuildingSource,
    ConstructionAssembly,
    SurfaceType,
)
from cocoon_contracts.common import Schedule
from cocoon_contracts.materials import MaterialSnapshot

from design_generator.candidate_generator import (
    _ELEMENT_CATEGORY,
    GenerationOptions,
    WindowPlacement,
    _fits,
    _make_slot,
    _revision_id,
    _windows_from_slots,
)
from design_generator.connection_detector import ConnectionDetectError, DoorPlacement, detect_connections
from design_generator.constraints import CandidateContext, ValidationReport, validate_candidate
from design_generator.geometry_resolver import AssemblyIds, GeometryResolveError, resolve_geometry
from design_generator.layout_generator import DM, STAIR_WIDTH_DM, Layout, StairLayout, ZoneLayout
from design_generator.quantities import Quantities, QuantityError, compute_quantities

USER_GENERATOR_VERSION = "user_geometry_v1"
FACES = ("south", "east", "north", "west")


class UserGeometryError(ValueError):
    code = "USER_GEOMETRY_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


# ----- input model --------------------------------------------------------------
class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UserOrigin(_Strict):
    x: float
    y: float


class UserSize(_Strict):
    length_m: float = Field(gt=0)
    width_m: float = Field(gt=0)
    height_m: float = Field(default=2.8, gt=0)


class UserZone(_Strict):
    id: str = Field(min_length=1)
    type: str = Field(min_length=1)
    floor_level: int = Field(ge=0)
    origin_m: UserOrigin
    size_m: UserSize
    entrance: bool = False


class UserStair(_Strict):
    lower: str
    upper: str
    x_m: float | None = None
    y_m: float | None = None
    length_m: float | None = None       # extent along x
    width_m: float | None = None        # extent along y


class UserWindow(_Strict):
    zone: str
    face: Literal["south", "east", "north", "west"]
    width_m: float = Field(default=1.2, gt=0)
    height_m: float = Field(default=1.2, gt=0)
    count: int = Field(default=1, ge=1)


class UserShelter(_Strict):
    orientation_deg: float = Field(default=180.0, ge=0.0, le=360.0)
    zones: list[UserZone] = Field(min_length=1)
    doors: list[tuple[str, str]] = Field(default_factory=list)
    stairs: list[UserStair] = Field(default_factory=list)
    windows: list[UserWindow] = Field(default_factory=list)
    glazing: str = "double"
    assemblies: dict[str, list[tuple[str, float]]]
    occupants: dict[str, float] = Field(default_factory=dict)
    heater_zones: list[str] = Field(default_factory=list)
    air_changes_per_hour: float | None = Field(default=None, ge=0)


# ----- output ---------------------------------------------------------------------
@dataclass(frozen=True)
class TopologyReport:
    zones: tuple[Mapping[str, Any], ...]
    adjacencies: tuple[Mapping[str, Any], ...]
    entrances: tuple[Mapping[str, Any], ...]
    stairs: tuple[Mapping[str, Any], ...]
    unreachable_zones: tuple[str, ...]
    windows_by_zone: Mapping[str, int]
    notes: tuple[str, ...]

    def to_dict(self) -> dict:
        return json.loads(json.dumps({
            "zones": list(self.zones), "adjacencies": list(self.adjacencies), "entrances": list(self.entrances),
            "stairs": list(self.stairs), "unreachable_zones": list(self.unreachable_zones),
            "windows_by_zone": dict(self.windows_by_zone), "notes": list(self.notes)}))


@dataclass(frozen=True)
class UserGeometryResult:
    building: BuildingModel
    quantities: Quantities
    report: ValidationReport
    topology: TopologyReport
    door_placements: tuple[DoorPlacement, ...]
    window_placements: tuple[WindowPlacement, ...]
    extras: Mapping[str, Any]


# ----- helpers ----------------------------------------------------------------------
def _dm(value: float) -> int:
    return round(value * DM)


def _check_grid(zone: UserZone) -> None:
    values = {"origin_m.x": zone.origin_m.x, "origin_m.y": zone.origin_m.y, "size_m.length_m": zone.size_m.length_m,
              "size_m.width_m": zone.size_m.width_m, "size_m.height_m": zone.size_m.height_m}
    off = {k: {"given": v, "nearest_0.1": round(v, 1)} for k, v in values.items() if abs(v * DM - round(v * DM)) > 1e-6}
    if off:
        raise UserGeometryError(f"zone '{zone.id}' has values that are not multiples of 0.1 m: {off}", "OFF_GRID",
                                {"zone": zone.id, "fields": off})


def _rect(z: ZoneLayout) -> tuple[int, int, int, int]:
    return (_dm(z.origin_m[0]), _dm(z.origin_m[1]), _dm(z.origin_m[0] + z.length_m), _dm(z.origin_m[1] + z.width_m))


def _overlap(a, b):
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def _build_layout(u: UserShelter) -> Layout:
    ids = [z.id for z in u.zones]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise UserGeometryError(f"duplicate zone ids {dup}", "DUPLICATE_ZONE_ID", {"ids": dup})
    known = set(ids)
    for a, b in u.doors:
        for end in (a, b):
            if end not in known:
                raise UserGeometryError(f"door refers to unknown zone '{end}'", "UNKNOWN_ZONE", {"zone": end})
    for s in u.stairs:
        for end in (s.lower, s.upper):
            if end not in known:
                raise UserGeometryError(f"stair refers to unknown zone '{end}'", "UNKNOWN_ZONE", {"zone": end})
    for name in list(u.occupants) + list(u.heater_zones) + [w.zone for w in u.windows]:
        if name not in known:
            raise UserGeometryError(f"unknown zone '{name}'", "UNKNOWN_ZONE", {"zone": name})

    levels = sorted({z.floor_level for z in u.zones})
    if levels != list(range(len(levels))):
        raise UserGeometryError(f"floor levels must be 0..n-1 with no gaps, got {levels}", "FLOOR_LEVELS_INVALID",
                                {"levels": levels})
    for z in u.zones:
        _check_grid(z)
        if z.entrance and z.floor_level != 0:
            raise UserGeometryError(f"entrance zone '{z.id}' must be on floor 0", "ENTRANCE_NOT_GROUND_FLOOR",
                                    {"zone": z.id})

    elevation, run = {}, 0.0
    for lv in levels:
        elevation[lv] = round(run, 1)
        run += max(z.size_m.height_m for z in u.zones if z.floor_level == lv)

    zones = tuple(
        ZoneLayout(z.id, z.type, z.floor_level, (z.origin_m.x, z.origin_m.y, elevation[z.floor_level]),
                   z.size_m.length_m, z.size_m.width_m, z.size_m.height_m, (), False, z.entrance)
        for z in u.zones)
    for i, a in enumerate(zones):
        for b in zones[i + 1:]:
            if a.floor_level == b.floor_level and _overlap(_rect(a), _rect(b)):
                raise UserGeometryError(f"zones '{a.zone_id}' and '{b.zone_id}' overlap", "ZONES_OVERLAP",
                                        {"zones": [a.zone_id, b.zone_id]})

    by_id = {z.zone_id: z for z in zones}
    stairs: list[StairLayout] = []
    for i, s in enumerate(u.stairs):
        lo, hi = by_id[s.lower], by_id[s.upper]
        if hi.floor_level != lo.floor_level + 1:
            raise UserGeometryError(f"stair '{s.lower}' -> '{s.upper}' must join adjacent floors (lower first)",
                                    "STAIR_LEVELS_INVALID", {"lower": s.lower, "upper": s.upper})
        ov = _overlap(_rect(lo), _rect(hi))
        given = [s.x_m, s.y_m, s.length_m, s.width_m]
        if any(v is not None for v in given):
            if any(v is None for v in given):
                raise UserGeometryError("give all of x_m, y_m, length_m, width_m for a stair footprint, or none",
                                        "USER_INPUT_INVALID")
            r = (_dm(s.x_m), _dm(s.y_m), _dm(s.x_m + s.length_m), _dm(s.y_m + s.width_m))
            fits = ov is not None and ov[0] <= r[0] and ov[1] <= r[1] and r[2] <= ov[2] and r[3] <= ov[3]
            placed = (s.x_m, s.y_m, s.length_m, s.width_m)
        else:
            stair_len = 30
            fits, placed = False, None
            for sx, sy in ((stair_len, STAIR_WIDTH_DM), (STAIR_WIDTH_DM, stair_len)):
                if ov is not None and sx <= ov[2] - ov[0] and sy <= ov[3] - ov[1]:
                    fits, placed = True, (ov[0] / DM, ov[1] / DM, sx / DM, sy / DM)
                    break
        if not fits:
            raise UserGeometryError(f"no room for a stair between '{s.lower}' and '{s.upper}' in their shared plan area",
                                    "STAIR_DOES_NOT_FIT", {"lower": s.lower, "upper": s.upper})
        stairs.append(StairLayout(f"stair_{i}", s.lower, s.upper, *(round(v, 1) for v in placed)))

    xs0 = min(_rect(z)[0] for z in zones); ys0 = min(_rect(z)[1] for z in zones)
    xs1 = max(_rect(z)[2] for z in zones); ys1 = max(_rect(z)[3] for z in zones)
    links = tuple([(a, b, "door") for a, b in u.doors] + [(s.lower, s.upper, "stair") for s in u.stairs])
    return Layout("user_defined", 0, 0, len(levels), (xs1 - xs0) / DM, (ys1 - ys0) / DM,
                  max(z.size_m.height_m for z in u.zones), zones, tuple(stairs), links, ())


def _assemblies(geo, u: UserShelter, snapshot: MaterialSnapshot | None) -> dict[str, ConstructionAssembly]:
    ids = AssemblyIds()
    element_of = {ids.wall: "wall", ids.roof: "roof", ids.ground_floor: "floor",
                  ids.interfloor: "interfloor", ids.partition: "partition"}
    out: dict[str, ConstructionAssembly] = {}
    for aid in dict.fromkeys(s.assembly_id for s in geo.surfaces):
        element = element_of[aid]
        layers = u.assemblies.get(element)
        if not layers:
            raise UserGeometryError(f"the building needs a '{element}' assembly but none was given", "MISSING_ASSEMBLY",
                                    {"element": element})
        for mid, t in layers:
            if t <= 0:
                raise UserGeometryError(f"'{element}' layer '{mid}' has non-positive thickness", "USER_INPUT_INVALID")
            if snapshot is not None and mid not in snapshot.materials:
                raise UserGeometryError(f"material '{mid}' (in '{element}') is not in snapshot '{snapshot.snapshot_id}'",
                                        "UNKNOWN_MATERIAL", {"material_id": mid, "element": element})
        u_value = None
        if snapshot is not None:
            r = 0.13 + 0.04 + sum(t / 1000.0 / snapshot.materials[m].properties.thermal_conductivity_w_mk for m, t in layers)
            u_value = round(1.0 / r, 4)
        out[aid] = ConstructionAssembly(
            id=aid, name=f"{element} " + " + ".join(f"{m.removeprefix('mat_')} {t:g}" for m, t in layers),
            category=_ELEMENT_CATEGORY[element], layers=[AssemblyLayer(material_id=m, thickness_mm=t) for m, t in layers],
            u_value_w_m2k=u_value)
    return out


def _topology(building: BuildingModel, layout: Layout, geo, conn, windows_by_zone, report) -> TopologyReport:
    zones = tuple({"id": z.zone_id, "type": z.zone_type, "floor_level": z.floor_level,
                   "area_m2": round(z.length_m * z.width_m, 2), "height_m": z.height_m, "entrance": z.exterior_access}
                  for z in layout.zones)
    height = {z.zone_id: z.height_m for z in layout.zones}
    door_pairs = {frozenset((a, b)) for a, b, k in layout.links if k == "door"}
    adjacencies = tuple({"a": c.zone_a_id, "b": c.zone_b_id, "shared_wall_m2": c.shared_area_m2,
                         "shared_wall_length_m": round(c.shared_area_m2 / height[c.zone_a_id], 2),
                         "has_door": frozenset((c.zone_a_id, c.zone_b_id)) in door_pairs}
                        for c in conn.connections if c.connection_type.value == "partition")
    surf = {s.id: s for s in geo.surfaces}
    entrances = tuple({"zone": surf[o.parent_surface_id].owning_zone_id, "wall": o.parent_surface_id}
                      for o in conn.openings if o.connected_boundary == "outdoors")
    stairs = tuple({"lower": s.lower_zone_id, "upper": s.upper_zone_id, "area_m2": round(s.length_m * s.width_m, 2)}
                   for s in layout.stairs)
    notes: list[str] = []
    if not entrances:
        notes.append("no outside door: mark a ground-floor zone with entrance = true")
    for a in adjacencies:
        if not a["has_door"]:
            notes.append(f"'{a['a']}' and '{a['b']}' share a wall of {a['shared_wall_length_m']} m with no door")
    for z in layout.zones:
        has_exterior = any(s.surface_type == SurfaceType.EXTERIOR_WALL for s in geo.surfaces_of(z.zone_id))
        if has_exterior and not windows_by_zone.get(z.zone_id) and z.zone_type not in ("airlock", "storage", "equipment"):
            notes.append(f"zone '{z.zone_id}' ({z.zone_type}) has outside walls but no windows")
    for name in report.failed_checks:
        notes.append(f"constraint check failed: {name}")
    return TopologyReport(zones, adjacencies, entrances, stairs, tuple(sorted(conn.unreachable_zones)),
                          dict(windows_by_zone), tuple(notes))


# ----- public ---------------------------------------------------------------------------
def resolve_user_geometry(
    shelter: UserShelter | Mapping,
    material_snapshot: MaterialSnapshot | Mapping | None = None,
    *,
    created_at: datetime | None = None,
    options: GenerationOptions = GenerationOptions(),
) -> UserGeometryResult:
    if not isinstance(shelter, UserShelter):
        try:
            shelter = UserShelter.model_validate(shelter)
        except ValidationError as exc:
            first = exc.errors()[0]
            raise UserGeometryError(f"invalid shelter description at {'.'.join(str(p) for p in first['loc'])}: {first['msg']}",
                                    "USER_INPUT_INVALID", {"errors": json.loads(exc.json())[:5]}) from exc
    snapshot = None
    if material_snapshot is not None:
        snapshot = material_snapshot if isinstance(material_snapshot, MaterialSnapshot) \
            else MaterialSnapshot.model_validate(material_snapshot)
    if shelter.glazing not in options.glazing:
        raise UserGeometryError(f"unknown glazing '{shelter.glazing}'; known: {sorted(options.glazing)}", "USER_INPUT_INVALID")
    created_at = created_at or datetime.now(timezone.utc)

    layout = _build_layout(shelter)
    try:
        geo = resolve_geometry(layout, orientation_deg=shelter.orientation_deg)
        conn = detect_connections(layout, geo, door=options.door, entrance_face_priority=options.entrance_face_priority)
    except (GeometryResolveError, ConnectionDetectError) as exc:
        raise UserGeometryError(str(exc), exc.code) from exc

    # windows
    slots: dict[str, Any] = {}
    for w in shelter.windows:
        sid = f"surf_{w.zone}_{w.face}"
        surface = next((s for s in geo.surfaces if s.id == sid and s.surface_type == SurfaceType.EXTERIOR_WALL), None)
        if surface is None or not surface.vertices:
            raise UserGeometryError(f"zone '{w.zone}' has no whole exterior wall on its {w.face} face for a window",
                                    "NO_EXTERIOR_WALL_FOR_WINDOW", {"zone": w.zone, "face": w.face})
        if sid not in slots:
            slot = _make_slot(surface, conn.placements, options, min_height=w.height_m)
            if slot is None:
                raise UserGeometryError(f"wall '{sid}' is too low for a {w.height_m} m window", "WINDOW_DOES_NOT_FIT",
                                        {"wall": sid})
            slots[sid] = slot
        slot = slots[sid]
        for _ in range(w.count):
            for i in range(len(slot.intervals)):
                if _fits(slot, i, w.width_m, options.window_gap_m):
                    slot.placed[i].append((w.width_m, w.height_m))
                    break
            else:
                raise UserGeometryError(f"no room for another {w.width_m} m window on '{sid}' clear of the door and "
                                        "other windows", "WINDOW_DOES_NOT_FIT", {"wall": sid})
    u_val, shgc = options.glazing[shelter.glazing]
    windows, w_places = _windows_from_slots(list(slots.values()), options, f"glz_{shelter.glazing}", u_val, shgc)

    assemblies = _assemblies(geo, shelter, snapshot)

    schedules: dict[str, Schedule] = {}
    updates: dict[str, dict] = {}
    for zid, n in shelter.occupants.items():
        sid = f"occupancy_{zid}"
        schedules[sid] = Schedule(id=sid, name=f"{n:g} occupants (continuous) in {zid}", type="occupancy",
                                  hourly_values=[float(n)] * 24, unit="occupants")
        updates.setdefault(zid, {})["occupancy_schedule_id"] = sid
    for zid in shelter.heater_zones:
        updates.setdefault(zid, {})["hvac_id"] = f"heater_{zid}"
    floors = [f.model_copy(update={"zones": [z.model_copy(update=updates.get(z.id, {})) for z in f.zones]})
              for f in geo.floors]

    design_id = "des_" + hashlib.sha1(json.dumps(shelter.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()[:12]
    try:
        model = BuildingModel(
            schema_version="4.0", design_id=design_id, revision_id="rev_pending", source=BuildingSource.USER_DEFINED,
            orientation_deg=shelter.orientation_deg, floors=floors, surfaces=list(geo.surfaces),
            openings=list(conn.openings) + windows, connections=list(conn.connections), assemblies=assemblies,
            schedules=schedules,
            metadata=BuildingMetadata(generator_version=USER_GENERATOR_VERSION, seed=None, created_at=created_at))
        model = BuildingModel.model_validate({**model.model_dump(mode="json"), "revision_id": _revision_id(model)})
    except ValidationError as exc:
        raise UserGeometryError(f"the described shelter breaks the building contract: {exc.errors()[0]['msg']}",
                                "USER_INPUT_INVALID") from exc

    report = validate_candidate(model, CandidateContext(spec=None, materials=snapshot, wwr=options.wwr, assembly_mm={}))
    try:
        quantities = compute_quantities(model, snapshot)
    except QuantityError as exc:
        raise UserGeometryError(str(exc), exc.code) from exc

    windows_by_zone: dict[str, int] = {}
    surf = {s.id: s for s in model.surfaces}
    for o in model.openings:
        if o.opening_type.value == "window":
            z = surf[o.parent_surface_id].owning_zone_id
            windows_by_zone[z] = windows_by_zone.get(z, 0) + 1
    topology = _topology(model, layout, geo, conn, windows_by_zone, report)
    extras = {"glazing": shelter.glazing, "air_changes_per_hour": shelter.air_changes_per_hour,
              "occupants_by_zone": dict(shelter.occupants), "heater_zone_ids": sorted(shelter.heater_zones)}
    return UserGeometryResult(model, quantities, report, topology, conn.placements, tuple(w_places), extras)
