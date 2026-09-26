"""
layout_generator.py - Place rooms of a template on a footprint.

Input : a TemplateMatch (Stage 1), a GenerationSpec (Stage 2) and a seed.
Output: a Layout - every zone's id, type, floor, origin and size, plus the
        stair footprint, in the building's local frame.

Frame and conventions
  * Origin = bottom-south-west corner of the building. x runs along the
    length (L), y along the width (W), z upward. L >= W.
  * Every floor uses the same L x W rectangle, so upper rooms are always
    fully supported by the floor below.
  * Floor elevation = level * ceiling height (slab thickness is ignored here;
    the resolver/physics may refine it). One ceiling height per building.
  * All geometry is computed in integer units of 0.1 m ("dm") so shared walls
    match exactly; metres appear only in the returned dataclasses.

How a layout is made
  1. plan_rooms: merge/prune the template's rooms against the request and give
     each room a minimum area (circulation and stair allowance included).
  2. Sample a footprint (aspect 1.0-1.8 from shelter_ratios_recommended.csv,
     area between the largest floor's need and the footprint cap).
  3. On each floor, split the rectangle recursively (guillotine cuts) with
     areas proportional to room targets, snapped to the grid.
  4. Accept the attempt only if every check passes (min area / width / aspect,
     door-linked rooms share a wall, entrance rooms touch the perimeter, a
     stair fits in the overlap of the rooms it joins). Otherwise retry, up to
     MAX_ATTEMPTS, then raise NO_FEASIBLE_LAYOUT with a tally of why.
The sampler and ``verify_layout`` are separate code paths so the verifier is
an independent check of the sampler's output.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

import numpy as np
from pydantic import ValidationError

from design_generator.requirement_parser import GenerationSpec
from design_generator.template_catalog import AIRLOCK, Template, TemplateMatch

# ----- tunable constants (documented assumptions) -------------------------
DM = 10                                   # 1 m = 10 grid units of 0.1 m
MIN_SHARED_WALL_DM = 10                   # >= 1.0 m so a 0.9 m door fits
MAX_ROOM_ASPECT = 4.0                     # no corridor-like rooms
FOOTPRINT_ASPECT_RANGE = (1.0, 1.8)       # shelter_ratios_recommended.csv
FOOTPRINT_SLACK_RANGE = (1.0, 1.15)       # spare area over the largest floor's need
STAIR_WIDTH_DM = 10                       # 1.0 m wide stair
CUT_ACROSS_LONGER_SIDE_P = 0.75
MAX_ATTEMPTS = 500


class NoFeasibleLayoutError(ValueError):
    code = "NO_FEASIBLE_LAYOUT"

    def __init__(self, message: str, details: dict | None = None):
        self.details = details or {}
        super().__init__(message)


# ----- outputs -------------------------------------------------------------
@dataclass(frozen=True)
class PlannedRoom:
    id: str
    type: str
    floor_level: int
    weight: float
    exterior_access: bool
    is_primary_occupied: bool
    min_area_m2: float                    # includes circulation and stair allowance
    min_dimension_m: float
    provides: tuple[str, ...]             # required room types this room satisfies


@dataclass(frozen=True)
class ZoneLayout:
    zone_id: str
    zone_type: str
    floor_level: int
    origin_m: tuple[float, float, float]
    length_m: float
    width_m: float
    height_m: float
    provides: tuple[str, ...]
    is_primary_occupied: bool
    exterior_access: bool


@dataclass(frozen=True)
class StairLayout:
    id: str
    lower_zone_id: str
    upper_zone_id: str
    x_m: float
    y_m: float
    length_m: float                       # extent along x
    width_m: float                        # extent along y


@dataclass(frozen=True)
class Layout:
    template_id: str
    seed: int
    attempts: int
    floor_count: int
    footprint_length_m: float
    footprint_width_m: float
    height_m: float
    zones: tuple[ZoneLayout, ...]
    stairs: tuple[StairLayout, ...]
    links: tuple[tuple[str, str, str], ...]   # (room a, room b, door|stair|partition)
    pruned_rooms: tuple[str, ...]

    @property
    def footprint_area_m2(self) -> float:
        return round(self.footprint_length_m * self.footprint_width_m, 6)

    def zone(self, zone_id: str) -> ZoneLayout:
        for z in self.zones:
            if z.zone_id == zone_id:
                return z
        raise KeyError(zone_id)


@dataclass(frozen=True)
class RoomPlan:
    template_id: str
    floor_count: int
    rooms: tuple[PlannedRoom, ...]
    links: tuple[tuple[str, str, str], ...]
    pruned_rooms: tuple[str, ...]


# ----- planning: merge / prune rooms --------------------------------------
def _without_room(template: Template, room_id: str) -> Template:
    data = template.model_dump()
    data["rooms"] = [r for r in data["rooms"] if r["id"] != room_id]
    data["links"] = [l for l in data["links"] if room_id not in (l["a"], l["b"])]
    return Template.model_validate(data)


def plan_rooms(match: TemplateMatch, spec: GenerationSpec) -> RoomPlan:
    """Decide which template rooms exist and how big each must be at minimum.

    Rooms the request did not ask for are dropped when the template stays a
    valid, connected topology without them; otherwise they are kept and sized
    from the sizing rules. Rooms that stand in for several required types get
    the sum of those areas and the largest minimum width.
    """
    template = match.template
    keep = set(match.provided_by.values())
    keep.update(r.id for r in template.rooms if r.is_primary_occupied)
    if template.rules.airlock_between_outdoors_and_primary:
        keep.update(r.id for r in template.rooms if r.type == AIRLOCK)

    current, pruned = template, []
    for room in template.rooms:
        if room.id in keep:
            continue
        try:
            current = _without_room(current, room.id)
            pruned.append(room.id)
        except (ValidationError, ValueError):
            pass  # a connector; keep it

    provides: dict[str, list[str]] = {}
    for required, room_id in match.provided_by.items():
        provides.setdefault(room_id, []).append(required)

    stair_ends = {end for l in current.links if l.kind == "stair" for end in (l.a, l.b)}
    rules = spec.assumptions["rules"]

    rooms: list[PlannedRoom] = []
    for r in current.rooms:
        if r.id in provides:
            base = sum(spec.room(t).min_area_m2 for t in provides[r.id])
            min_dim = max(spec.room(t).min_dimension_m for t in provides[r.id])
        else:  # kept extra: size from the rule for its own type
            rule = rules[r.type]
            base = rule["fixed_m2"] + rule["per_person_m2"] * spec.occupants
            min_dim = rule["min_dimension_m"]
        area = base * spec.circulation_factor + (spec.stair_allowance_m2 if r.id in stair_ends else 0.0)
        rooms.append(
            PlannedRoom(
                id=r.id, type=r.type, floor_level=r.floor_level, weight=r.weight,
                exterior_access=r.exterior_access, is_primary_occupied=r.is_primary_occupied,
                min_area_m2=round(area, 6), min_dimension_m=min_dim,
                provides=tuple(sorted(provides.get(r.id, ()))),
            )
        )
    return RoomPlan(
        template_id=template.id,
        floor_count=current.floor_count,
        rooms=tuple(rooms),
        links=tuple((l.a, l.b, l.kind) for l in current.links),
        pruned_rooms=tuple(pruned),
    )


# ----- geometry helpers (integer 0.1 m units) ------------------------------
Rect = tuple[int, int, int, int]  # x0, y0, x1, y1


def _area(r: Rect) -> int:
    return (r[2] - r[0]) * (r[3] - r[1])


def _shared_wall(a: Rect, b: Rect) -> int:
    """Length of the wall two rectangles share (0 if they only touch at a corner or not at all)."""
    best = 0
    if a[2] == b[0] or b[2] == a[0]:
        best = max(best, min(a[3], b[3]) - max(a[1], b[1]))
    if a[3] == b[1] or b[3] == a[1]:
        best = max(best, min(a[2], b[2]) - max(a[0], b[0]))
    return max(best, 0)


def _perimeter_contact(r: Rect, length: int, width: int) -> int:
    contact = 0
    if r[0] == 0 or r[2] == length:
        contact += r[3] - r[1]
    if r[1] == 0 or r[3] == width:
        contact += r[2] - r[0]
    return contact


def _overlap(a: Rect, b: Rect) -> Rect | None:
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def _partition(rng, ids: list[str], targets: dict[str, float], rect: Rect,
               mins: dict[str, int]) -> dict[str, Rect] | None:
    """Guillotine split. A side holding a single room is never cut narrower than that room's minimum width."""
    if len(ids) == 1:
        return {ids[0]: rect}
    x0, y0, x1, y1 = rect
    w, h = x1 - x0, y1 - y0
    k = int(rng.integers(1, len(ids)))
    left, right = ids[:k], ids[k:]
    share = sum(targets[i] for i in left) / sum(targets[i] for i in ids)
    across_longer = rng.random() < CUT_ACROSS_LONGER_SIDE_P
    cut_x = (w >= h) if across_longer else (w < h)
    if cut_x:
        if w < 2:
            return None
        lo = x0 + (mins[left[0]] if len(left) == 1 else 1)
        hi = x1 - (mins[right[0]] if len(right) == 1 else 1)
        if lo > hi:
            return None
        pos = min(max(x0 + round(share * w), lo), hi)
        ra, rb = (x0, y0, pos, y1), (pos, y0, x1, y1)
    else:
        if h < 2:
            return None
        lo = y0 + (mins[left[0]] if len(left) == 1 else 1)
        hi = y1 - (mins[right[0]] if len(right) == 1 else 1)
        if lo > hi:
            return None
        pos = min(max(y0 + round(share * h), lo), hi)
        ra, rb = (x0, y0, x1, pos), (x0, pos, x1, y1)
    a = _partition(rng, left, targets, ra, mins)
    b = _partition(rng, right, targets, rb, mins)
    if a is None or b is None:
        return None
    return {**a, **b}


def _to_m(v: int) -> float:
    return round(v / DM, 1)


# ----- the generator -------------------------------------------------------
def generate_layout(match: TemplateMatch, spec: GenerationSpec, seed: int) -> Layout:
    """One deterministic layout for ``seed``. Raises NoFeasibleLayoutError."""
    plan = plan_rooms(match, spec)

    if plan.floor_count not in spec.allowed_floor_counts:
        raise NoFeasibleLayoutError(
            f"template '{plan.template_id}' has {plan.floor_count} floor(s); "
            f"the requirements allow {list(spec.allowed_floor_counts)}",
            {"reasons": {"floor_count_not_allowed": 1}, "attempts": 0},
        )

    rng = np.random.default_rng(seed)
    by_floor: dict[int, list[PlannedRoom]] = {}
    for r in plan.rooms:
        by_floor.setdefault(r.floor_level, []).append(r)
    need_dm2 = max(sum(r.min_area_m2 for r in rooms) for rooms in by_floor.values()) * DM * DM
    cap_dm2 = spec.footprint_cap_m2 * DM * DM if spec.footprint_cap_m2 is not None else None
    if cap_dm2 is not None and need_dm2 > cap_dm2 + 1e-6:
        worst = max(by_floor, key=lambda f: sum(r.min_area_m2 for r in by_floor[f]))
        raise NoFeasibleLayoutError(
            f"floor {worst} of '{plan.template_id}' needs {need_dm2 / DM / DM:.1f} m2 "
            f"but the footprint cap is {spec.footprint_cap_m2:g} m2",
            {"reasons": {"floor_needs_more_than_footprint_cap": 1}, "attempts": 0,
             "floor": worst, "needed_m2": need_dm2 / DM / DM, "cap_m2": spec.footprint_cap_m2},
        )

    lo_h, hi_h = (round(v * DM) for v in spec.ceiling_height_range_m)
    widest_min_dm = max(math.ceil(r.min_dimension_m * DM - 1e-9) for r in plan.rooms)
    room_by_id = {r.id: r for r in plan.rooms}
    reasons: Counter[str] = Counter()

    for attempt in range(1, MAX_ATTEMPTS + 1):
        # -- footprint
        area = need_dm2 * rng.uniform(*FOOTPRINT_SLACK_RANGE)
        if cap_dm2 is not None:
            area = min(area, cap_dm2)
        aspect = rng.uniform(*FOOTPRINT_ASPECT_RANGE)
        W = max(int(round(math.sqrt(area / aspect))), 1)
        W = max(W, widest_min_dm)                    # a room can never be wider than the footprint's short side
        L = max(int(round(area / W)), W, 1)
        while L * W < need_dm2 - 1e-6:
            L += 1
        if cap_dm2 is not None and L * W > cap_dm2 + 1e-6:
            reasons["footprint_exceeds_cap"] += 1
            continue
        if not (FOOTPRINT_ASPECT_RANGE[0] <= L / W <= FOOTPRINT_ASPECT_RANGE[1] + 1e-9):
            reasons["footprint_aspect_out_of_range"] += 1
            continue
        H = int(rng.integers(lo_h, hi_h + 1))

        # -- rooms on every floor
        rects: dict[str, Rect] = {}
        ok = True
        for level in sorted(by_floor):
            rooms = list(by_floor[level])
            order = [rooms[i] for i in rng.permutation(len(rooms))]
            floor_area = L * W
            surplus = floor_area - sum(r.min_area_m2 * DM * DM for r in rooms)
            total_w = sum(r.weight for r in rooms)
            targets = {r.id: r.min_area_m2 * DM * DM + surplus * r.weight / total_w for r in rooms}
            mins = {r.id: math.ceil(r.min_dimension_m * DM - 1e-9) for r in rooms}
            placed = _partition(rng, [r.id for r in order], targets, (0, 0, L, W), mins)
            if placed is None:
                reasons["partition_failed"] += 1
                ok = False
                break
            rects.update(placed)
        if not ok:
            continue

        problem = _check_rects(plan, room_by_id, rects, L, W)
        if problem:
            reasons[problem] += 1
            continue

        stairs = _place_stairs(rng, plan, rects, spec)
        if stairs is None:
            reasons["stair_does_not_fit"] += 1
            continue

        zones = tuple(
            ZoneLayout(
                zone_id=r.id, zone_type=r.type, floor_level=r.floor_level,
                origin_m=(_to_m(rects[r.id][0]), _to_m(rects[r.id][1]), round(r.floor_level * H / DM, 1)),
                length_m=_to_m(rects[r.id][2] - rects[r.id][0]),
                width_m=_to_m(rects[r.id][3] - rects[r.id][1]),
                height_m=_to_m(H),
                provides=r.provides, is_primary_occupied=r.is_primary_occupied,
                exterior_access=r.exterior_access,
            )
            for r in plan.rooms
        )
        layout = Layout(
            template_id=plan.template_id, seed=seed, attempts=attempt, floor_count=plan.floor_count,
            footprint_length_m=_to_m(L), footprint_width_m=_to_m(W), height_m=_to_m(H),
            zones=zones, stairs=stairs, links=plan.links, pruned_rooms=plan.pruned_rooms,
        )
        problems = verify_layout(layout, plan, spec)
        if problems:  # would indicate a sampler bug; never return an unverified layout
            reasons["verifier:" + problems[0]] += 1
            continue
        return layout

    raise NoFeasibleLayoutError(
        f"no feasible layout for '{plan.template_id}' in {MAX_ATTEMPTS} attempts",
        {"reasons": dict(reasons), "attempts": MAX_ATTEMPTS},
    )


def _check_rects(plan: RoomPlan, room_by_id: dict, rects: dict[str, Rect], L: int, W: int) -> str | None:
    """Return the first failed reason, or None. Used by the sampler while searching."""
    for rid, rect in rects.items():
        room = room_by_id[rid]
        w, h = rect[2] - rect[0], rect[3] - rect[1]
        if _area(rect) < room.min_area_m2 * DM * DM - 1e-6:
            return "room_below_min_area"
        if min(w, h) < room.min_dimension_m * DM - 1e-6:
            return "room_below_min_width"
        if max(w, h) / min(w, h) > MAX_ROOM_ASPECT:
            return "room_too_elongated"
        if room.exterior_access and room.floor_level == 0 and _perimeter_contact(rect, L, W) < MIN_SHARED_WALL_DM:
            return "entrance_room_not_on_perimeter"
    for a, b, kind in plan.links:
        if kind in ("door", "partition") and _shared_wall(rects[a], rects[b]) < MIN_SHARED_WALL_DM:
            return "linked_rooms_do_not_share_wall"
    return None


def _place_stairs(rng, plan: RoomPlan, rects: dict[str, Rect], spec: GenerationSpec) -> tuple[StairLayout, ...] | None:
    stair_len = int(round(spec.stair_allowance_m2 * DM * DM / STAIR_WIDTH_DM))
    placed: list[StairLayout] = []
    for i, (a, b, kind) in enumerate(l for l in plan.links if l[2] == "stair"):
        lower, upper = sorted((a, b), key=lambda rid: next(r.floor_level for r in plan.rooms if r.id == rid))
        ov = _overlap(rects[lower], rects[upper])
        if ov is None:
            return None
        ow, oh = ov[2] - ov[0], ov[3] - ov[1]
        shapes = [(stair_len, STAIR_WIDTH_DM), (STAIR_WIDTH_DM, stair_len)]
        shapes = [shapes[j] for j in rng.permutation(2)]
        fitted = None
        for sx, sy in shapes:
            if sx <= ow and sy <= oh:
                fitted = (sx, sy)
                break
        if fitted is None:
            return None
        sx, sy = fitted
        x = ov[0] if rng.random() < 0.5 else ov[2] - sx
        y = ov[1] if rng.random() < 0.5 else ov[3] - sy
        placed.append(StairLayout(f"stair_{i}", lower, upper, _to_m(x), _to_m(y), _to_m(sx), _to_m(sy)))
    return tuple(placed)


# ----- independent verifier ------------------------------------------------
def verify_layout(layout: Layout, plan: RoomPlan, spec: GenerationSpec) -> list[str]:
    """Re-check a finished layout from its metre values. Empty list = valid."""
    problems: list[str] = []
    to_dm = lambda v: int(round(v * DM))
    L, W, H = to_dm(layout.footprint_length_m), to_dm(layout.footprint_width_m), to_dm(layout.height_m)
    planned = {r.id: r for r in plan.rooms}
    rects = {
        z.zone_id: (to_dm(z.origin_m[0]), to_dm(z.origin_m[1]),
                    to_dm(z.origin_m[0]) + to_dm(z.length_m), to_dm(z.origin_m[1]) + to_dm(z.width_m))
        for z in layout.zones
    }

    if L < W or not (FOOTPRINT_ASPECT_RANGE[0] <= L / W <= FOOTPRINT_ASPECT_RANGE[1] + 1e-9):
        problems.append("footprint_aspect_out_of_range")
    if spec.footprint_cap_m2 is not None and L * W > spec.footprint_cap_m2 * DM * DM + 1e-6:
        problems.append("footprint_exceeds_cap")
    lo_h, hi_h = spec.ceiling_height_range_m
    if not (lo_h - 1e-9 <= layout.height_m <= hi_h + 1e-9):
        problems.append("height_out_of_range")
    if set(rects) != set(planned):
        problems.append("zone_set_differs_from_plan")
        return problems

    for z in layout.zones:
        if abs(z.height_m - layout.height_m) > 1e-9:
            problems.append("mixed_ceiling_heights")
        if abs(z.origin_m[2] - z.floor_level * layout.height_m) > 0.051:
            problems.append("wrong_floor_elevation")

    for level in range(layout.floor_count):
        floor = [(z.zone_id, rects[z.zone_id]) for z in layout.zones if z.floor_level == level]
        if not floor:
            problems.append(f"floor_{level}_empty")
            continue
        for zid, r in floor:
            if r[0] < 0 or r[1] < 0 or r[2] > L or r[3] > W:
                problems.append(f"{zid}_outside_footprint")
        for i, (za, ra) in enumerate(floor):
            for zb, rb in floor[i + 1:]:
                if _overlap(ra, rb):
                    problems.append(f"{za}_overlaps_{zb}")
        if sum(_area(r) for _, r in floor) != L * W:
            problems.append(f"floor_{level}_not_fully_tiled")  # also guarantees full support from below

    for zid, r in rects.items():
        room = planned[zid]
        w, h = r[2] - r[0], r[3] - r[1]
        if _area(r) < room.min_area_m2 * DM * DM - 1e-6:
            problems.append(f"{zid}_below_min_area")
        if min(w, h) < room.min_dimension_m * DM - 1e-6:
            problems.append(f"{zid}_below_min_width")
        if min(w, h) > 0 and max(w, h) / min(w, h) > MAX_ROOM_ASPECT:
            problems.append(f"{zid}_too_elongated")
        if room.exterior_access and room.floor_level == 0 and _perimeter_contact(r, L, W) < MIN_SHARED_WALL_DM:
            problems.append(f"{zid}_entrance_not_on_perimeter")

    for a, b, kind in layout.links:
        if kind in ("door", "partition") and _shared_wall(rects[a], rects[b]) < MIN_SHARED_WALL_DM:
            problems.append(f"{a}_{b}_share_no_wall")
        if kind == "stair" and not any({s.lower_zone_id, s.upper_zone_id} == {a, b} for s in layout.stairs):
            problems.append(f"{a}_{b}_stair_missing")

    level_of = {z.zone_id: z.floor_level for z in layout.zones}
    for s in layout.stairs:
        if level_of[s.upper_zone_id] != level_of[s.lower_zone_id] + 1:
            problems.append(f"{s.id}_not_between_adjacent_floors")
        sr = (to_dm(s.x_m), to_dm(s.y_m), to_dm(s.x_m) + to_dm(s.length_m), to_dm(s.y_m) + to_dm(s.width_m))
        for zid in (s.lower_zone_id, s.upper_zone_id):
            zr = rects[zid]
            if not (zr[0] <= sr[0] and zr[1] <= sr[1] and sr[2] <= zr[2] and sr[3] <= zr[3]):
                problems.append(f"{s.id}_outside_{zid}")
        if abs(_area(sr) - spec.stair_allowance_m2 * DM * DM) > 1e-6:
            problems.append(f"{s.id}_wrong_area")
    return problems
