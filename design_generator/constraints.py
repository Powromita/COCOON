"""
constraints.py - Feasibility checks for a finished candidate (PRD section 8.4).

``validate_candidate(building, ctx)`` returns a ValidationReport:
    passed  - names of checks that ran and found no problem
    failed  - one CheckFailure (check, reason, value, limit) per problem found
    skipped - checks that could not run for lack of an input (e.g. no material
              snapshot); a skipped check is NOT a pass
It never raises on a bad candidate; a rejected candidate is data, not an error.

Every check is a small pure function with a stable name (see CHECKS). Checks
read only the BuildingModel plus the context, so they also work on
user-defined buildings, not just generated ones.

All limits marked PLACEHOLDER are configurable through ``CandidateContext``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping

from pydantic import ValidationError

from cocoon_contracts.building import (
    BuildingModel,
    OpeningType,
    SurfaceBoundaryType,
    SurfaceType,
    ZoneConnectionType,
)
from cocoon_contracts.materials import MaterialSnapshot

from design_generator.connection_detector import OUTDOORS, find_unreachable
from design_generator.layout_generator import DM, RoomPlan
from design_generator.quantities import QuantityError, compute_quantities
from design_generator.requirement_parser import GenerationSpec

# PLACEHOLDER buildable finished-assembly thickness (mm), by assembly category.
DEFAULT_ASSEMBLY_MM: Mapping[str, tuple[float, float]] = {
    "wall": (250.0, 650.0),
    "roof": (180.0, 450.0),
    "floor": (130.0, 400.0),
}
MAX_OPENING_FRACTION = 0.85     # doors + windows may cover at most this share of one wall
AREA_TOL_M2 = 1e-6
_BUCKETS = ("north", "east", "south", "west")


@dataclass(frozen=True)
class WwrBounds:
    """Window-to-wall ratio limits as fractions (0.20 = 20 %). PLACEHOLDER defaults.

    shelter_ratios_recommended.csv gives 10-20 % overall for the old single-room
    prototype; pass ``WwrBounds(min_overall=0.10, max_overall=0.20)`` to apply it.
    ``min_overall`` is 0 by default so a candidate can be checked before windows are placed.
    """

    min_overall: float = 0.0
    max_overall: float = 0.25
    max_per_orientation: float = 0.30


@dataclass(frozen=True)
class CandidateContext:
    spec: GenerationSpec | None                  # None for user-defined buildings: spec-based checks are skipped
    plan: RoomPlan | None = None                 # exact per-room minimums; else spec minimums by room type
    materials: MaterialSnapshot | None = None    # needed for the material-existence check
    wwr: WwrBounds = WwrBounds()
    assembly_mm: Mapping[str, tuple[float, float]] = field(default_factory=lambda: dict(DEFAULT_ASSEMBLY_MM))
    min_support_fraction: float = 0.95           # share of an upper zone's plan area that must sit on zones below


@dataclass(frozen=True)
class CheckFailure:
    check: str
    reason: str
    value: Any = None
    limit: Any = None


@dataclass(frozen=True)
class ValidationReport:
    passed: tuple[str, ...]
    failed: tuple[CheckFailure, ...]
    skipped: tuple[tuple[str, str], ...] = ()

    @property
    def ok(self) -> bool:
        return not self.failed

    @property
    def failed_checks(self) -> tuple[str, ...]:
        seen: list[str] = []
        for f in self.failed:
            if f.check not in seen:
                seen.append(f.check)
        return tuple(seen)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "passed": list(self.passed),
            "failed": [{"check": f.check, "reason": f.reason, "value": f.value, "limit": f.limit} for f in self.failed],
            "skipped": [{"check": n, "reason": r} for n, r in self.skipped],
        }


class _Skip(Exception):
    def __init__(self, reason: str):
        self.reason = reason


def _require_spec(ctx: CandidateContext) -> None:
    if ctx.spec is None:
        raise _Skip("no requirements supplied")


# ----- geometry helpers (integer 0.1 m units) ------------------------------
def _boxes(b: BuildingModel) -> list[tuple[str, int, tuple[int, int, int, int, int, int]]]:
    out = []
    for f in b.floors:
        for z in f.zones:
            x0, y0, z0 = round(z.origin_m.x * DM), round(z.origin_m.y * DM), round(z.origin_m.z * DM)
            out.append((z.id, f.level, (x0, y0, z0, x0 + round(z.size_m.length_m * DM),
                                        y0 + round(z.size_m.width_m * DM), z0 + round(z.size_m.height_m * DM))))
    return out


def _plan_area(box) -> int:
    return (box[3] - box[0]) * (box[4] - box[1])


def _plan_overlap_area(a, b) -> int:
    w = min(a[3], b[3]) - max(a[0], b[0])
    h = min(a[4], b[4]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0


def _union_area(rects: list[tuple[int, int, int, int]]) -> int:
    """Exact area of a union of axis-aligned rectangles (coordinate compression)."""
    xs = sorted({v for r in rects for v in (r[0], r[2])})
    ys = sorted({v for r in rects for v in (r[1], r[3])})
    total = 0
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx0, cx1, cy0, cy1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
            if any(r[0] <= cx0 and cx1 <= r[2] and r[1] <= cy0 and cy1 <= r[3] for r in rects):
                total += (cx1 - cx0) * (cy1 - cy0)
    return total


def _m2(dm2: float) -> float:
    return round(dm2 / (DM * DM), 4)


# ----- checks ---------------------------------------------------------------
def zones_do_not_overlap(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    out, boxes = [], _boxes(b)
    for i, (ida, _, ba) in enumerate(boxes):
        for idb, _, bb in boxes[i + 1:]:
            if _plan_overlap_area(ba, bb) > 0 and min(ba[5], bb[5]) - max(ba[2], bb[2]) > 0:
                out.append(CheckFailure("zones_do_not_overlap", f"zones '{ida}' and '{idb}' overlap in 3D",
                                        _m2(_plan_overlap_area(ba, bb)), 0.0))
    return out


def all_zones_reachable(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    ids = [z.id for f in b.floors for z in f.zones]
    bad = find_unreachable(ids, b.surfaces, b.openings, b.connections)
    return [CheckFailure("all_zones_reachable", f"zone '{z}' cannot be reached from outdoors by doors or stairs", z, OUTDOORS)
            for z in bad]


def _minimums(b: BuildingModel, ctx: CandidateContext):
    planned = {r.id: (r.min_area_m2, r.min_dimension_m) for r in ctx.plan.rooms} if ctx.plan else {}
    by_type = {r.room_type: (r.min_area_m2, r.min_dimension_m) for r in ctx.spec.rooms}
    for f in b.floors:
        for z in f.zones:
            mins = planned.get(z.id) or by_type.get(z.type)
            if mins:
                yield z, mins


def room_min_area(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    out = []
    for z, (min_area, _) in _minimums(b, ctx):
        area = round(z.size_m.length_m * z.size_m.width_m, 4)
        if area < min_area - AREA_TOL_M2:
            out.append(CheckFailure("room_min_area", f"zone '{z.id}' is {area} m2, below its minimum of {min_area} m2",
                                    area, min_area))
    return out


def room_min_dimension(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    out = []
    for z, (_, min_dim) in _minimums(b, ctx):
        narrow = round(min(z.size_m.length_m, z.size_m.width_m), 4)
        if narrow < min_dim - 1e-9:
            out.append(CheckFailure("room_min_dimension", f"zone '{z.id}' is only {narrow} m wide, below {min_dim} m",
                                    narrow, min_dim))
    return out


def ceiling_height_in_range(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    lo, hi = ctx.spec.ceiling_height_range_m
    return [
        CheckFailure("ceiling_height_in_range", f"zone '{z.id}' is {z.size_m.height_m} m high, outside {lo}-{hi} m",
                     z.size_m.height_m, [lo, hi])
        for f in b.floors for z in f.zones if not (lo - 1e-9 <= z.size_m.height_m <= hi + 1e-9)
    ]


def footprint_within_cap(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    cap = ctx.spec.footprint_cap_m2
    if cap is None:
        return []
    area = _m2(_union_area([(bx[0], bx[1], bx[3], bx[4]) for _, _, bx in _boxes(b)]))
    if area > cap + AREA_TOL_M2:
        return [CheckFailure("footprint_within_cap", f"footprint is {area} m2, above the {cap} m2 cap", area, cap)]
    return []


def floor_count_allowed(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    n = len({f.level for f in b.floors})
    if n not in ctx.spec.allowed_floor_counts:
        return [CheckFailure("floor_count_allowed",
                             f"{n} floor(s) used; the requirements allow {list(ctx.spec.allowed_floor_counts)}",
                             n, list(ctx.spec.allowed_floor_counts))]
    return []


def upper_zones_supported(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    out, boxes = [], _boxes(b)
    for zid, level, box in boxes:
        if level == 0:
            continue
        below = [(bx[0], bx[1], bx[3], bx[4]) for _, lv, bx in boxes if lv == level - 1]
        clipped = [(max(r[0], box[0]), max(r[1], box[1]), min(r[2], box[3]), min(r[3], box[4])) for r in below]
        clipped = [r for r in clipped if r[2] > r[0] and r[3] > r[1]]
        share = _union_area(clipped) / _plan_area(box) if clipped else 0.0
        if share < ctx.min_support_fraction - 1e-9:
            out.append(CheckFailure("upper_zones_supported",
                                    f"only {share:.0%} of upper zone '{zid}' sits on zones below",
                                    round(share, 4), ctx.min_support_fraction))
    return out


def stairs_allocated(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    level = {z.id: f.level for f in b.floors for z in f.zones}
    levels = sorted(set(level.values()))
    out = []
    need = ctx.spec.stair_allowance_m2
    for lo, hi in zip(levels, levels[1:]):
        stairs = [c for c in b.connections if c.connection_type == ZoneConnectionType.STAIR
                  and {level.get(c.zone_a_id), level.get(c.zone_b_id)} == {lo, hi}]
        if not stairs:
            out.append(CheckFailure("stairs_allocated", f"no stair joins floor {lo} and floor {hi}", 0, need))
        elif max(c.shared_area_m2 for c in stairs) < need - AREA_TOL_M2:
            out.append(CheckFailure("stairs_allocated", f"stair between floor {lo} and {hi} is smaller than {need} m2",
                                    max(c.shared_area_m2 for c in stairs), need))
    return out


def openings_fit_parent_surface(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    surfaces = {s.id: s for s in b.surfaces}
    used: dict[str, float] = {}
    out = []
    for op in b.openings:
        s = surfaces.get(op.parent_surface_id)
        if s is None:
            out.append(CheckFailure("openings_fit_parent_surface", f"opening '{op.id}' has no parent surface", op.parent_surface_id))
            continue
        if s.tilt_deg != 90.0:
            out.append(CheckFailure("openings_fit_parent_surface", f"opening '{op.id}' is not on a vertical wall",
                                    s.tilt_deg, 90.0))
        used[s.id] = used.get(s.id, 0.0) + op.area_m2
    for sid, total in used.items():
        limit = round(surfaces[sid].area_m2 * MAX_OPENING_FRACTION, 6)
        if total > limit + AREA_TOL_M2:
            out.append(CheckFailure("openings_fit_parent_surface",
                                    f"openings total {round(total, 3)} m2 on '{sid}' (wall {surfaces[sid].area_m2} m2, "
                                    f"max {MAX_OPENING_FRACTION:.0%})", round(total, 3), limit))
    return out


def door_boundaries_consistent(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    surfaces = {s.id: s for s in b.surfaces}
    out = []
    for op in b.openings:
        if op.opening_type != OpeningType.DOOR or op.parent_surface_id not in surfaces:
            continue
        s = surfaces[op.parent_surface_id]
        if s.boundary_type == SurfaceBoundaryType.OUTDOORS and op.connected_boundary != OUTDOORS:
            out.append(CheckFailure("door_boundaries_consistent",
                                    f"door '{op.id}' is on an exterior wall but connects to '{op.connected_boundary}'",
                                    op.connected_boundary, OUTDOORS))
        if s.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE and op.connected_boundary != s.adjacent_zone_id:
            out.append(CheckFailure("door_boundaries_consistent",
                                    f"door '{op.id}' is on a wall facing '{s.adjacent_zone_id}' but connects to "
                                    f"'{op.connected_boundary}'", op.connected_boundary, s.adjacent_zone_id))
    return out


def internal_surfaces_paired(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    surfaces = {s.id: s for s in b.surfaces}
    ok_kinds = ({SurfaceType.PARTITION}, {SurfaceType.CEILING, SurfaceType.FLOOR})
    out = []
    for s in b.surfaces:
        if s.boundary_type != SurfaceBoundaryType.ADJACENT_ZONE:
            continue
        p = surfaces.get(s.adjacent_surface_id) if s.adjacent_surface_id else None
        why = None
        if not s.adjacent_surface_id:
            why = "has no adjacent_surface_id (unpaired)"
        elif p is None:
            why = f"points at missing surface '{s.adjacent_surface_id}'"
        elif p.adjacent_surface_id != s.id:
            why = f"'{p.id}' does not point back"
        elif p.owning_zone_id != s.adjacent_zone_id or p.adjacent_zone_id != s.owning_zone_id:
            why = f"'{p.id}' does not connect the same two zones"
        elif abs(p.area_m2 - s.area_m2) > 1e-4:
            why = f"area {s.area_m2} m2 differs from its pair's {p.area_m2} m2"
        elif {s.surface_type, p.surface_type} not in ok_kinds:
            why = f"types {s.surface_type.value}/{p.surface_type.value} cannot pair"
        if why:
            out.append(CheckFailure("internal_surfaces_paired", f"surface '{s.id}' {why}", s.id, None))
    return out


def window_to_wall_ratio(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    surfaces = {s.id: s for s in b.surfaces}
    wall_area = {k: 0.0 for k in _BUCKETS}
    win_area = {k: 0.0 for k in _BUCKETS}
    bucket = lambda az: _BUCKETS[int(round(az / 90.0)) % 4]
    for s in b.surfaces:
        if s.surface_type == SurfaceType.EXTERIOR_WALL:
            wall_area[bucket(s.azimuth_deg)] += s.area_m2
    for op in b.openings:
        s = surfaces.get(op.parent_surface_id)
        if op.opening_type == OpeningType.WINDOW and s is not None and s.surface_type == SurfaceType.EXTERIOR_WALL:
            win_area[bucket(s.azimuth_deg)] += op.area_m2
    out = []
    for k in _BUCKETS:
        if wall_area[k] > 0 and win_area[k] / wall_area[k] > ctx.wwr.max_per_orientation + 1e-9:
            ratio = round(win_area[k] / wall_area[k], 4)
            out.append(CheckFailure("window_to_wall_ratio", f"{k} window-to-wall ratio is {ratio:.0%}",
                                    ratio, ctx.wwr.max_per_orientation))
    total_wall, total_win = sum(wall_area.values()), sum(win_area.values())
    if total_wall > 0:
        overall = round(total_win / total_wall, 4)
        if overall > ctx.wwr.max_overall + 1e-9:
            out.append(CheckFailure("window_to_wall_ratio", f"overall window-to-wall ratio is {overall:.0%}",
                                    overall, ctx.wwr.max_overall))
        if overall < ctx.wwr.min_overall - 1e-9:
            out.append(CheckFailure("window_to_wall_ratio", f"overall window-to-wall ratio is only {overall:.0%}",
                                    overall, ctx.wwr.min_overall))
    return out


def assembly_materials_in_snapshot(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    if ctx.materials is None:
        raise _Skip("no material snapshot supplied")
    known = set(ctx.materials.materials)
    return [
        CheckFailure("assembly_materials_in_snapshot",
                     f"assembly '{a.id}' uses material '{l.material_id}' that is not in snapshot '{ctx.materials.snapshot_id}'",
                     l.material_id, sorted(known))
        for a in b.assemblies.values() for l in a.layers if l.material_id not in known
    ]


def assembly_materials_allowed(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    allowed = ctx.spec.allowed_material_ids
    if not allowed:
        return []
    return [
        CheckFailure("assembly_materials_allowed",
                     f"assembly '{a.id}' uses material '{l.material_id}' that the requirements do not allow",
                     l.material_id, list(allowed))
        for a in b.assemblies.values() for l in a.layers if l.material_id not in allowed
    ]


def assembly_thickness_buildable(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    out = []
    for a in b.assemblies.values():
        limits = ctx.assembly_mm.get(a.category.value)
        if not limits:
            continue
        total = round(sum(l.thickness_mm for l in a.layers), 3)
        if not (limits[0] - 1e-9 <= total <= limits[1] + 1e-9):
            out.append(CheckFailure("assembly_thickness_buildable",
                                    f"{a.category.value} assembly '{a.id}' is {total} mm thick, outside "
                                    f"{limits[0]:g}-{limits[1]:g} mm", total, list(limits)))
    return out


def envelope_mass_within_limit(b: BuildingModel, ctx: CandidateContext) -> list[CheckFailure]:
    _require_spec(ctx)
    limit = ctx.spec.maximum_mass_kg
    if limit is None:
        return []
    if ctx.materials is None:
        raise _Skip("no material snapshot supplied")
    try:
        q = compute_quantities(b, ctx.materials)
    except QuantityError as exc:
        if exc.code == "MATERIAL_NOT_IN_SNAPSHOT":
            raise _Skip("a material is missing from the snapshot (see assembly_materials_in_snapshot)")
        return [CheckFailure("envelope_mass_within_limit", f"mass could not be computed: {exc}")]
    total = round(sum(m.mass_kg for m in q.materials), 1)
    if total > limit + 1e-6:
        return [CheckFailure("envelope_mass_within_limit",
                             f"envelope weighs {total:.0f} kg, above the {limit:.0f} kg limit", total, limit)]
    return []


# Order is the order of reporting. (name, function). ``contract_valid`` is handled separately, first.
CHECKS: tuple[tuple[str, Callable[[BuildingModel, CandidateContext], list[CheckFailure]]], ...] = (
    ("zones_do_not_overlap", zones_do_not_overlap),
    ("all_zones_reachable", all_zones_reachable),
    ("room_min_area", room_min_area),
    ("room_min_dimension", room_min_dimension),
    ("ceiling_height_in_range", ceiling_height_in_range),
    ("footprint_within_cap", footprint_within_cap),
    ("floor_count_allowed", floor_count_allowed),
    ("upper_zones_supported", upper_zones_supported),
    ("stairs_allocated", stairs_allocated),
    ("openings_fit_parent_surface", openings_fit_parent_surface),
    ("door_boundaries_consistent", door_boundaries_consistent),
    ("internal_surfaces_paired", internal_surfaces_paired),
    ("window_to_wall_ratio", window_to_wall_ratio),
    ("assembly_materials_in_snapshot", assembly_materials_in_snapshot),
    ("assembly_materials_allowed", assembly_materials_allowed),
    ("assembly_thickness_buildable", assembly_thickness_buildable),
    ("envelope_mass_within_limit", envelope_mass_within_limit),
)
ALL_CHECK_NAMES = ("contract_valid",) + tuple(n for n, _ in CHECKS)


def validate_candidate(building: BuildingModel | Mapping, ctx: CandidateContext) -> ValidationReport:
    """Run every check. Never raises for an invalid candidate."""
    try:
        data = building.model_dump(mode="json") if isinstance(building, BuildingModel) else building
        model = BuildingModel.model_validate(data)
    except (ValidationError, ValueError, TypeError, AttributeError) as exc:
        first = exc.errors()[0] if isinstance(exc, ValidationError) and exc.errors() else None
        reason = f"{'.'.join(str(p) for p in first['loc'])}: {first['msg']}" if first else str(exc)
        return ValidationReport(
            passed=(),
            failed=(CheckFailure("contract_valid", f"BuildingModel failed contract validation: {reason}"),),
            skipped=tuple((n, "building failed contract validation") for n, _ in CHECKS),
        )

    passed, failed, skipped = ["contract_valid"], [], []
    for name, fn in CHECKS:
        try:
            problems = fn(model, ctx)
        except _Skip as s:
            skipped.append((name, s.reason))
            continue
        if problems:
            failed.extend(problems)
        else:
            passed.append(name)
    return ValidationReport(tuple(passed), tuple(failed), tuple(skipped))
