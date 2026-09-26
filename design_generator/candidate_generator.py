"""
candidate_generator.py - Orchestrates M2: requirements -> validated BuildingModel candidates.

Per attempt (index i, own random stream seeded by [seed, i]):
  template -> layout (Stage 3) -> geometry (4) -> doors/connections (5) ->
  orientation -> assemblies -> windows -> schedules -> BuildingModel ->
  constraints (6) -> quantities (7).
A candidate that fails anywhere is kept in ``GenerationResult.rejected`` with
the stage, a stable code and, for constraint failures, the full report.
Generation stops at ``count`` valid candidates or ``max_attempts``.

Same requirements + snapshot + seed + created_at  ->  identical output.
(``created_at`` defaults to now; design and revision ids do not depend on it.)

Design rules (from the project's optimizer notes)
  * Every wall / roof / ground floor = ONE structural layer + an OPTIONAL
    insulation layer, never two random slabs. Layers are listed inner -> outer
    (M0 convention), so insulation is last = on the outside, which keeps the
    structural mass coupled to the room. Assembly thickness is clamped to the
    buildable ranges in ``CandidateContext.assembly_mm``.
  * Cold-climate glazing is favoured (triple > double >> single).
  * Windows are biased to the solar (south) face and kept off the door.

All numbers marked PLACEHOLDER are assumptions to be reviewed; they live in
``GenerationOptions`` so they can be changed without editing this file.

Things the M0 contract cannot hold are returned in ``Candidate.extras``
instead of the BuildingModel: air changes per hour (airtightness class),
glazing choice, per-zone occupant shares.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

import numpy as np
from pydantic import ValidationError

from cocoon_contracts.building import (
    AssemblyCategory,
    AssemblyLayer,
    BuildingMetadata,
    BuildingModel,
    BuildingSource,
    ConstructionAssembly,
    Opening,
    OpeningType,
    Surface,
    SurfaceType,
)
from cocoon_contracts.common import Schedule
from cocoon_contracts.errors import ErrorCode, ErrorDetail, ErrorEnvelope
from cocoon_contracts.materials import MaterialSnapshot
from cocoon_contracts.requirements import RequirementsContract

from design_generator.connection_detector import (
    DEFAULT_ENTRANCE_FACE_PRIORITY,
    ConnectionDetectError,
    DoorDefaults,
    DoorPlacement,
    _fixed_coordinate,
    _wall_extent,
    detect_connections,
)
from design_generator.constraints import (
    DEFAULT_ASSEMBLY_MM,
    CandidateContext,
    ValidationReport,
    WwrBounds,
    validate_candidate,
)
from design_generator.geometry_resolver import AssemblyIds, GeometryResolveError, resolve_geometry
from design_generator.layout_generator import Layout, NoFeasibleLayoutError, generate_layout, plan_rooms
from design_generator.quantities import ORIENTATIONS, QuantityError, Quantities, compute_quantities, orientation_bucket
from design_generator.requirement_parser import DEFAULT_SIZING, GenerationSpec, SizingTable, parse_requirements
from design_generator.template_catalog import TemplateMatch, filter_templates

GENERATOR_VERSION = "layout_generator_v1"

# PLACEHOLDER thickness ranges (mm) per (element, material). Rows marked CSV come from
# shelter_elements_dimensions__1_.csv; the CSV has no plywood, and its PUF limits (wall 120,
# roof 120, floor 90) are WIDENED here (marked ^) so light sandwich panels can meet the
# assembly thickness clamps and a tight mass limit. The team should confirm or restore them.
DEFAULT_THICKNESS_MM: Mapping[tuple[str, str], tuple[float, float]] = {
    ("wall", "mat_stone"): (300, 550),        # CSV stone_masonry
    ("wall", "mat_concrete"): (150, 250),     # CSV concrete
    ("wall", "mat_plywood"): (12, 150),       # placeholder
    ("wall", "mat_puf"): (50, 250),           # CSV 50-120 ^
    ("roof", "mat_concrete"): (120, 200),     # CSV concrete (the CSV has no stone roof)
    ("roof", "mat_plywood"): (12, 150),       # placeholder
    ("roof", "mat_puf"): (50, 250),           # CSV 50-120 ^
    ("floor", "mat_stone"): (150, 350),       # CSV stone_masonry
    ("floor", "mat_concrete"): (120, 200),    # CSV concrete
    ("floor", "mat_plywood"): (18, 150),      # placeholder
    ("floor", "mat_puf"): (40, 150),          # CSV 40-90 ^
    ("interfloor", "mat_plywood"): (18, 50),  # placeholder
    ("interfloor", "mat_concrete"): (50, 120),  # placeholder
    ("partition", "mat_plywood"): (12, 25),   # placeholder (skin thickness)
    ("partition", "mat_concrete"): (75, 150),  # placeholder
    ("partition", "mat_puf"): (25, 50),       # placeholder (core)
}

# PLACEHOLDER thickness ranges (mm) per (element, material CATEGORY), used ONLY for a material id that has no row in
# DEFAULT_THICKNESS_MM (for example the 20 materials of ladakh_shelter_materials.csv). The four materials above keep their own rows,
# so designs made from them do not change. The team should confirm these.
DEFAULT_THICKNESS_BY_CATEGORY_MM: Mapping[tuple[str, str], tuple[float, float]] = {
    ("wall", "masonry"): (200, 500), ("roof", "masonry"): (120, 250), ("floor", "masonry"): (150, 300), ("partition", "masonry"): (75, 150),
    ("wall", "structural"): (100, 250), ("roof", "structural"): (100, 200), ("floor", "structural"): (100, 200),
    ("interfloor", "structural"): (50, 120), ("partition", "structural"): (25, 100),
    ("wall", "insulation"): (50, 250), ("roof", "insulation"): (50, 250), ("floor", "insulation"): (40, 150), ("partition", "insulation"): (25, 50),
}

_ELEMENT_CATEGORY = {"wall": AssemblyCategory.WALL, "roof": AssemblyCategory.ROOF, "floor": AssemblyCategory.FLOOR,
                     "interfloor": AssemblyCategory.CEILING, "partition": AssemblyCategory.PARTITION}


@dataclass(frozen=True)
class GenerationOptions:
    """Every tunable assumption of the generator (all PLACEHOLDERS)."""

    thickness_mm: Mapping[tuple[str, str], tuple[float, float]] = field(default_factory=lambda: dict(DEFAULT_THICKNESS_MM))
    thickness_by_category_mm: Mapping[tuple[str, str], tuple[float, float]] = field(default_factory=lambda: dict(DEFAULT_THICKNESS_BY_CATEGORY_MM))
    insulation_probability: Mapping[str, float] = field(
        default_factory=lambda: {"wall": 0.75, "roof": 0.75, "floor": 0.55, "partition": 0.5})
    assembly_mm: Mapping[str, tuple[float, float]] = field(default_factory=lambda: dict(DEFAULT_ASSEMBLY_MM))
    # starter values of thermal-calculator/data/glazing_profiles.json (M3 will own the real database)
    glazing: Mapping[str, tuple[float, float]] = field(
        default_factory=lambda: {"single": (5.8, 0.86), "double": (2.8, 0.70), "triple": (1.8, 0.55)})
    glazing_weights: Mapping[str, float] = field(default_factory=lambda: {"single": 0.12, "double": 0.50, "triple": 0.38})
    airtightness: Mapping[str, tuple[float, float]] = field(       # class -> (ACH, weight)
        default_factory=lambda: {"tight": (0.35, 0.3), "standard": (0.7, 0.5), "leaky": (1.2, 0.2)})
    window_sizes_m: tuple[tuple[float, float], ...] = ((1.0, 1.2), (1.2, 1.2), (1.4, 1.2))   # width x height
    window_sill_m: float = 0.9
    window_gap_m: float = 0.3
    window_frame_fraction: float = 0.15
    wwr_target_range: tuple[float, float] = (0.08, 0.18)
    orientation_weights: Mapping[str, float] = field(
        default_factory=lambda: {"south": 3.0, "east": 1.5, "west": 1.5, "north": 0.5})
    wwr: WwrBounds = WwrBounds()
    occupied_zone_types: tuple[str, ...] = ("living", "sleeping", "command", "medical", "multipurpose")
    equipment_watts: Mapping[str, float] = field(
        default_factory=lambda: {"equipment": 300.0, "command": 250.0, "medical": 400.0, "living": 150.0})
    door: DoorDefaults = DoorDefaults()
    entrance_face_priority: tuple[str, ...] = DEFAULT_ENTRANCE_FACE_PRIORITY
    attempts_per_candidate: int = 50
    max_attempts: int | None = None


# ----- errors and outputs ------------------------------------------------------
class GenerationError(ValueError):
    code = "GENERATION_ERROR"

    def __init__(self, message: str, details: dict | None = None):
        self.details = details or {}
        super().__init__(message)


class NoTemplateError(GenerationError):
    code = "NO_TEMPLATE_FITS"


# The M0 ErrorCode list is closed, so every M2 error maps onto one of its members and the specific
# M2 code travels in ``details["m2_code"]`` (nothing is lost).
_ENVELOPE_CODE = {
    "ZONE_GEOMETRY_INVALID": (
        "NO_FEASIBLE_LAYOUT", "GEOMETRY_RESOLVE_ERROR", "CONNECTION_DETECT_ERROR", "DOOR_DOES_NOT_FIT",
        "NO_ENTRANCE_WALL", "OPENINGS_EXCEED_SURFACE", "QUANTITY_ERROR", "OFF_GRID", "ZONES_OVERLAP",
        "STAIR_DOES_NOT_FIT", "NO_EXTERIOR_WALL_FOR_WINDOW", "WINDOW_DOES_NOT_FIT"),
    "DUPLICATE_ID": ("DUPLICATE_ZONE_ID",),
    "MISSING_REFERENCE": ("UNKNOWN_ZONE", "MISSING_ASSEMBLY"),
    "UNSUPPORTED_MATERIAL": ("UNKNOWN_MATERIAL", "MATERIAL_NOT_IN_SNAPSHOT"),
}


def to_error_envelope(exc: BaseException, trace_id: str | None = None) -> ErrorEnvelope:
    """Standard PRD 16.6 error envelope for any error raised by M2. Everything else maps to VALIDATION_ERROR."""
    import uuid

    m2_code = getattr(exc, "code", None) or type(exc).__name__
    code = next((k for k, members in _ENVELOPE_CODE.items() if m2_code in members), "VALIDATION_ERROR")
    raw = dict(getattr(exc, "details", {}) or {})
    details = json.loads(json.dumps({"m2_code": m2_code, **raw}, default=str))
    return ErrorEnvelope(error=ErrorDetail(code=ErrorCode(code), message=str(exc), details=details,
                                           trace_id=trace_id or str(uuid.uuid4()), retryable=False))


class _Reject(Exception):
    """Internal: an attempt failed at ``stage``. Carries the report/building for constraint failures."""

    def __init__(self, stage: str, code: str, message: str, report: ValidationReport | None = None,
                 building: BuildingModel | None = None):
        self.stage, self.code, self.message, self.report, self.building = stage, code, message, report, building
        self.template_id: str | None = None
        super().__init__(message)


@dataclass(frozen=True)
class WindowPlacement:
    opening_id: str
    parent_surface_id: str
    axis: str
    offset_along_wall_m: float
    width_m: float
    height_m: float
    sill_m: float
    centre_m: tuple[float, float, float]


@dataclass(frozen=True)
class Candidate:
    index: int
    building: BuildingModel
    quantities: Quantities
    report: ValidationReport
    layout: Layout
    door_placements: tuple[DoorPlacement, ...]
    window_placements: tuple[WindowPlacement, ...]
    extras: Mapping[str, Any]


@dataclass(frozen=True)
class RejectedCandidate:
    index: int
    template_id: str | None
    stage: str                       # layout | geometry | connections | composition | contract | quantities | constraints | duplicate
    code: str
    message: str
    report: ValidationReport | None = None
    building: BuildingModel | None = None


@dataclass(frozen=True)
class GenerationResult:
    candidates: tuple[Candidate, ...]
    rejected: tuple[RejectedCandidate, ...]
    attempts: int
    requested: int
    reasons: Mapping[str, int]       # tally of rejection causes, e.g. "constraints:envelope_mass_within_limit"
    max_attempts: int

    @property
    def complete(self) -> bool:
        return len(self.candidates) == self.requested


# ----- materials and assemblies -----------------------------------------------
def _role(category: str) -> str | None:
    if category == "insulation":
        return "insulation"
    if category in ("masonry", "structural"):
        return "structural"
    return None


def _material_pool(spec: GenerationSpec, snapshot: MaterialSnapshot, options: GenerationOptions) -> dict:
    allowed = set(spec.allowed_material_ids) if spec.allowed_material_ids else set(snapshot.materials)
    pool: dict[str, dict[str, list]] = {"structural": {}, "insulation": {}}
    known = {m for (_, m) in options.thickness_mm}          # materials with their own rows keep them (no category fallback)
    for element in _ELEMENT_CATEGORY:
        for mid, rec in snapshot.materials.items():
            role = _role(rec.category)
            rng_mm = options.thickness_mm.get((element, mid))
            if rng_mm is None and mid not in known:
                rng_mm = options.thickness_by_category_mm.get((element, rec.category))
            if mid in allowed and role and rng_mm:
                pool[role].setdefault(element, []).append((mid, rng_mm))
    return pool


def _snap(value: float, lo: float, hi: float) -> float:
    return float(min(max(round(value / 5.0) * 5, lo), hi))


def _compose(rng, element: str, pool: dict, options: GenerationOptions) -> list[tuple[str, float]]:
    """Layers inner -> outer as (material_id, thickness_mm)."""
    structural = pool["structural"].get(element, [])
    insulation = pool["insulation"].get(element, [])
    if not structural:
        raise _Reject("composition", f"no_materials_for_{element}",
                      f"no allowed structural material has a thickness range for '{element}'")
    p_ins = options.insulation_probability.get(element, 0.0)

    if element == "interfloor":
        mid, (lo, hi) = structural[int(rng.integers(len(structural)))]
        return [(mid, _snap(rng.uniform(lo, hi), lo, hi))]
    if element == "partition":
        mid, (lo, hi) = structural[int(rng.integers(len(structural)))]
        skin = _snap(rng.uniform(lo, hi), lo, hi)
        if insulation and rng.random() < p_ins:
            imid, (ilo, ihi) = insulation[int(rng.integers(len(insulation)))]
            return [(mid, skin), (imid, _snap(rng.uniform(ilo, ihi), ilo, ihi)), (mid, skin)]
        return [(mid, skin)]

    clamp_lo, clamp_hi = options.assembly_mm.get(_ELEMENT_CATEGORY[element].value, (0.0, float("inf")))
    for _ in range(60):
        mid, (lo, hi) = structural[int(rng.integers(len(structural)))]
        t_s = _snap(rng.uniform(lo, hi), lo, hi)
        if insulation and rng.random() < p_ins:
            imid, (ilo, ihi) = insulation[int(rng.integers(len(insulation)))]
            lo_i, hi_i = max(ilo, clamp_lo - t_s), min(ihi, clamp_hi - t_s)
            if lo_i > hi_i:
                continue
            return [(mid, t_s), (imid, _snap(rng.uniform(lo_i, hi_i), lo_i, hi_i))]
        if clamp_lo <= t_s <= clamp_hi:
            return [(mid, t_s)]
    raise _Reject("composition", "assembly_composition_failed",
                  f"could not build a '{element}' assembly inside {clamp_lo:g}-{clamp_hi:g} mm")


def _assembly(aid: str, element: str, layers: list[tuple[str, float]], snapshot: MaterialSnapshot) -> ConstructionAssembly:
    r_in, r_out = 0.13, 0.04
    r = r_in + r_out + sum(t / 1000.0 / snapshot.materials[m].properties.thermal_conductivity_w_mk for m, t in layers)
    return ConstructionAssembly(
        id=aid, name=f"{element} " + " + ".join(f"{m.removeprefix('mat_')} {t:g}" for m, t in layers),
        category=_ELEMENT_CATEGORY[element], layers=[AssemblyLayer(material_id=m, thickness_mm=t) for m, t in layers],
        r_inside_film_m2k_w=r_in, r_outside_film_m2k_w=r_out, u_value_w_m2k=round(1.0 / r, 4))


# ----- windows -------------------------------------------------------------------
@dataclass
class _Slot:
    surface: Surface
    zone_id: str
    bucket: str
    axis: str
    start: float
    length: float
    z0: float
    intervals: list[list[float]]                 # free [a, b] spans along the wall (relative to start)
    placed: list[list[tuple[float, float]]]      # per interval: (width, height) of windows in it


def _free_intervals(length: float, reserved: list[tuple[float, float]]) -> list[list[float]]:
    free, cursor = [], 0.0
    for a, b in sorted(reserved):
        if a > cursor:
            free.append([cursor, min(a, length)])
        cursor = max(cursor, b)
    if cursor < length:
        free.append([cursor, length])
    return [iv for iv in free if iv[1] - iv[0] > 1e-9]


def _fits(slot: _Slot, i: int, width: float, gap: float) -> bool:
    a, b = slot.intervals[i]
    used = sum(w for w, _ in slot.placed[i])
    return used + width + (len(slot.placed[i]) + 2) * gap <= (b - a) + 1e-9


def _make_slot(surface: Surface, doors: tuple[DoorPlacement, ...], options: GenerationOptions,
               min_height: float) -> _Slot | None:
    """Free wall spans of an exterior wall (door clearance removed); None if the wall cannot take a window."""
    if not surface.vertices:
        return None
    axis, start, length, z0, z1 = _wall_extent(surface)
    if z1 - z0 < options.window_sill_m + min_height + 0.2 - 1e-6:        # tolerance: 2.3 m rooms fit exactly
        return None
    gap = options.window_gap_m
    reserved = [(d.offset_along_wall_m - gap, d.offset_along_wall_m + d.width_m + gap)
                for d in doors if d.parent_surface_id == surface.id]
    ivs = _free_intervals(length, reserved)
    return _Slot(surface, surface.owning_zone_id, orientation_bucket(surface.azimuth_deg), axis, start, length, z0,
                 ivs, [[] for _ in ivs])


def _windows_from_slots(slots: list[_Slot], options: GenerationOptions, glazing_id: str, u: float, shgc: float):
    """Turn the windows recorded in each slot into Opening objects and positions (evenly spaced in each free span)."""
    openings, placements = [], []
    for slot in slots:
        n = 0
        for i, (a, b) in enumerate(slot.intervals):
            ws = slot.placed[i]
            if not ws:
                continue
            spare = ((b - a) - sum(w for w, _ in ws)) / (len(ws) + 1)
            cursor = a + spare
            for w, h in ws:
                n += 1
                oid = f"op_{slot.surface.id.removeprefix('surf_')}_window_{n}"
                fixed = _fixed_coordinate(slot.surface, slot.axis)
                along = slot.start + cursor + w / 2
                zc = slot.z0 + options.window_sill_m + h / 2
                centre = (round(fixed, 3), round(along, 3), round(zc, 3)) if slot.axis == "y" \
                    else (round(along, 3), round(fixed, 3), round(zc, 3))
                openings.append(Opening(
                    id=oid, parent_surface_id=slot.surface.id, opening_type=OpeningType.WINDOW, area_m2=round(w * h, 6),
                    u_value_w_m2k=u, shgc=shgc, glazing_id=glazing_id, frame_fraction=options.window_frame_fraction,
                    shading_factor=1.0, is_operable=False))
                placements.append(WindowPlacement(oid, slot.surface.id, slot.axis, round(cursor, 3), w, h,
                                                  options.window_sill_m, centre))
                cursor += w + spare
    return openings, placements


def _place_windows(rng, layout: Layout, geo, doors: tuple[DoorPlacement, ...], spec: GenerationSpec,
                   options: GenerationOptions, glazing_id: str, u: float, shgc: float):
    zone_type = {z.zone_id: z.zone_type for z in layout.zones}
    walls = [s for s in geo.surfaces if s.surface_type == SurfaceType.EXTERIOR_WALL]
    wall_area = {k: 0.0 for k in ORIENTATIONS}
    for s in walls:
        wall_area[orientation_bucket(s.azimuth_deg)] += s.area_m2
    total_wall = sum(wall_area.values())
    gap = options.window_gap_m

    slots: list[_Slot] = []
    for s in walls:
        if zone_type[s.owning_zone_id] not in options.occupied_zone_types:
            continue
        slot = _make_slot(s, doors, options, min_height=max(h for _, h in options.window_sizes_m))
        if slot is not None:
            slots.append(slot)

    target = float(rng.uniform(*options.wwr_target_range)) * total_wall
    cap_orient = 0.9 * options.wwr.max_per_orientation
    cap_overall = 0.9 * options.wwr.max_overall
    area_by_bucket = {k: 0.0 for k in wall_area}
    total_area = 0.0

    def try_add(slot: _Slot) -> bool:
        nonlocal total_area
        for j in rng.permutation(len(options.window_sizes_m)):
            w, h = options.window_sizes_m[int(j)]
            a = w * h
            if wall_area[slot.bucket] and (area_by_bucket[slot.bucket] + a) / wall_area[slot.bucket] > cap_orient:
                continue
            if total_wall and (total_area + a) / total_wall > cap_overall:
                continue
            for i in range(len(slot.intervals)):
                if _fits(slot, i, w, gap):
                    slot.placed[i].append((w, h))
                    area_by_bucket[slot.bucket] += a
                    total_area += a
                    return True
        return False

    def pick(candidates: list[_Slot]) -> _Slot:
        wts = np.array([options.orientation_weights.get(c.bucket, 1.0) for c in candidates], dtype=float)
        return candidates[int(rng.choice(len(candidates), p=wts / wts.sum()))]

    for zid in dict.fromkeys(s.zone_id for s in slots):                      # one window per occupied zone first
        mine = [s for s in slots if s.zone_id == zid]
        while mine:
            chosen = pick(mine)
            if try_add(chosen):
                break
            mine.remove(chosen)
    narrowest = min(w for w, _ in options.window_sizes_m)
    dead: set[int] = set()                                                  # slots that cannot take another window
    for _ in range(200):
        if total_area >= target:
            break
        open_slots = [s for s in slots if id(s) not in dead and any(_fits(s, i, narrowest, gap) for i in range(len(s.intervals)))]
        if not open_slots:
            break
        chosen = pick(open_slots)
        if not try_add(chosen):
            dead.add(id(chosen))

    openings, placements = _windows_from_slots(slots, options, glazing_id, u, shgc)
    return openings, placements, round(target / total_wall, 4) if total_wall else 0.0


# ----- schedules and ids ---------------------------------------------------------
def _schedules(spec: GenerationSpec, layout: Layout, options: GenerationOptions):
    schedules: dict[str, Schedule] = {}
    updates: dict[str, dict] = {}
    occupied = [z for z in layout.zones if z.zone_type in options.occupied_zone_types]
    share_by_zone: dict[str, float] = {}
    total_area = sum(z.length_m * z.width_m for z in occupied)
    base = spec.occupancy_schedule_id or "occupancy"
    for z in occupied:
        share = spec.occupants * (z.length_m * z.width_m) / total_area if total_area else 0.0
        share_by_zone[z.zone_id] = round(share, 3)
        sid = f"{base}_{z.zone_id}"
        schedules[sid] = Schedule(id=sid, name=f"{share:.1f} occupants (continuous) in {z.zone_id}", type="occupancy",
                                  hourly_values=[round(share, 3)] * 24, unit="occupants")
        updates.setdefault(z.zone_id, {}).update(occupancy_schedule_id=sid, hvac_id=f"heater_{z.zone_id}")
    for z in layout.zones:
        watts = options.equipment_watts.get(z.zone_type)
        if watts:
            sid = f"equipment_{z.zone_id}"
            schedules[sid] = Schedule(id=sid, name=f"Equipment heat in {z.zone_id}", type="equipment",
                                      hourly_values=[watts] * 24, unit="watts")
            updates.setdefault(z.zone_id, {})["equipment_schedule_id"] = sid
    return schedules, updates, share_by_zone


def _revision_id(model: BuildingModel) -> str:
    d = model.model_dump(mode="json")
    d.pop("revision_id")
    d["metadata"].pop("created_at")
    return "rev_" + hashlib.sha1(json.dumps(d, sort_keys=True).encode()).hexdigest()[:12]


# ----- one attempt ----------------------------------------------------------------
def _attempt(index: int, seed: int, spec: GenerationSpec, matches: list[TemplateMatch], pool: dict,
             snapshot: MaterialSnapshot, options: GenerationOptions, created_at: datetime) -> Candidate:
    rng = np.random.default_rng([seed, index])
    match = matches[int(rng.integers(len(matches)))]
    try:
        return _build(index, seed, rng, match, spec, pool, snapshot, options, created_at)
    except _Reject as rej:
        rej.template_id = match.template.id
        raise


def _build(index: int, seed: int, rng, match: TemplateMatch, spec: GenerationSpec, pool: dict,
           snapshot: MaterialSnapshot, options: GenerationOptions, created_at: datetime) -> Candidate:
    template_id = match.template.id
    try:
        layout = generate_layout(match, spec, int(rng.integers(0, 2**31 - 1)))
    except NoFeasibleLayoutError as exc:
        reasons = exc.details.get("reasons", {})
        raise _Reject("layout", exc.code, f"{exc} {dict(reasons)}") from exc

    orientation = float(spec.allowed_orientations_deg[int(rng.integers(len(spec.allowed_orientations_deg)))])
    try:
        geo = resolve_geometry(layout, orientation_deg=orientation)
    except GeometryResolveError as exc:
        raise _Reject("geometry", exc.code, str(exc)) from exc
    try:
        conn = detect_connections(layout, geo, door=options.door, entrance_face_priority=options.entrance_face_priority)
    except ConnectionDetectError as exc:
        raise _Reject("connections", exc.code, str(exc)) from exc

    ids = AssemblyIds()
    used_ids = {s.assembly_id for s in geo.surfaces}
    plan_ids = {"wall": ids.wall, "roof": ids.roof, "floor": ids.ground_floor,
                "interfloor": ids.interfloor, "partition": ids.partition}
    assemblies = {}
    for element, aid in plan_ids.items():
        if aid in used_ids:
            assemblies[aid] = _assembly(aid, element, _compose(rng, element, pool, options), snapshot)

    glazing_names = sorted(options.glazing_weights)
    gw = np.array([options.glazing_weights[g] for g in glazing_names], dtype=float)
    glazing = glazing_names[int(rng.choice(len(glazing_names), p=gw / gw.sum()))]
    u, shgc = options.glazing[glazing]
    openings, w_places, wwr_target = _place_windows(rng, layout, geo, conn.placements, spec, options,
                                                    f"glz_{glazing}", u, shgc)

    air_names = sorted(options.airtightness)
    aw = np.array([options.airtightness[a][1] for a in air_names], dtype=float)
    air_class = air_names[int(rng.choice(len(air_names), p=aw / aw.sum()))]

    schedules, zone_updates, occupants_by_zone = _schedules(spec, layout, options)
    floors = [f.model_copy(update={"zones": [z.model_copy(update=zone_updates.get(z.id, {})) for z in f.zones]})
              for f in geo.floors]

    design_id = "des_" + hashlib.sha1(f"{spec.project_id}|{seed}|{index}".encode()).hexdigest()[:12]
    try:
        model = BuildingModel(
            schema_version="4.0", design_id=design_id, revision_id="rev_pending", source=BuildingSource.GENERATED,
            orientation_deg=orientation, floors=floors, surfaces=list(geo.surfaces),
            openings=list(conn.openings) + openings, connections=list(conn.connections),
            assemblies=assemblies, schedules=schedules,
            metadata=BuildingMetadata(generator_version=GENERATOR_VERSION, seed=seed, created_at=created_at))
        model = BuildingModel.model_validate({**model.model_dump(mode="json"), "revision_id": _revision_id(model)})
    except ValidationError as exc:
        raise _Reject("contract", "CONTRACT_INVALID", str(exc.errors()[0]["msg"])) from exc

    ctx = CandidateContext(spec=spec, plan=plan_rooms(match, spec), materials=snapshot, wwr=options.wwr,
                           assembly_mm=options.assembly_mm)
    report = validate_candidate(model, ctx)
    if not report.ok:
        raise _Reject("constraints", "CONSTRAINTS_FAILED", "; ".join(dict.fromkeys(f.reason for f in report.failed)),
                      report, model)
    try:
        quantities = compute_quantities(model, snapshot)
    except QuantityError as exc:
        raise _Reject("quantities", exc.code, str(exc)) from exc

    extras = {
        "template_id": template_id, "layout_seed": layout.seed, "orientation_deg": orientation,
        "glazing": glazing, "airtightness_class": air_class, "air_changes_per_hour": options.airtightness[air_class][0],
        "wwr_target": wwr_target, "occupants_by_zone": occupants_by_zone,
        "heater_zone_ids": sorted(z for z, u_ in zone_updates.items() if "hvac_id" in u_),
        "merged_rooms": dict(match.merged),
    }
    return Candidate(index, model, quantities, report, layout, conn.placements, tuple(w_places), extras)


# ----- public entry -----------------------------------------------------------------
def generate_candidates(
    requirements: RequirementsContract | dict,
    material_snapshot: MaterialSnapshot | dict,
    *,
    seed: int,
    count: int,
    created_at: datetime | None = None,
    options: GenerationOptions = GenerationOptions(),
    sizing: SizingTable = DEFAULT_SIZING,
) -> GenerationResult:
    if count < 1:
        raise GenerationError("count must be at least 1")
    snapshot = material_snapshot if isinstance(material_snapshot, MaterialSnapshot) \
        else MaterialSnapshot.model_validate(material_snapshot)
    spec = parse_requirements(requirements, sizing=sizing)
    created_at = created_at or datetime.now(timezone.utc)

    matches = [m for m in filter_templates(list(r.room_type for r in spec.rooms), spec.max_floors)
               if m.template.floor_count in spec.allowed_floor_counts]
    if not matches:
        raise NoTemplateError(
            f"no template provides rooms {[r.room_type for r in spec.rooms]} in "
            f"{list(spec.allowed_floor_counts)} floor(s)", {"allowed_floor_counts": list(spec.allowed_floor_counts)})
    pool = _material_pool(spec, snapshot, options)

    limit = options.max_attempts or count * options.attempts_per_candidate
    valid: list[Candidate] = []
    rejected: list[RejectedCandidate] = []
    reasons: Counter[str] = Counter()
    seen: set[str] = set()
    attempts = 0
    for index in range(limit):
        if len(valid) == count:
            break
        attempts += 1
        try:
            cand = _attempt(index, seed, spec, matches, pool, snapshot, options, created_at)
        except _Reject as rej:
            rejected.append(RejectedCandidate(index, rej.template_id, rej.stage, rej.code, rej.message,
                                              rej.report, rej.building))
            if rej.report is not None:
                for name in rej.report.failed_checks:
                    reasons[f"constraints:{name}"] += 1
            else:
                reasons[f"{rej.stage}:{rej.code}"] += 1
            continue
        if cand.building.revision_id in seen:
            rejected.append(RejectedCandidate(index, cand.extras["template_id"], "duplicate", "DUPLICATE_DESIGN",
                                              "identical to an earlier candidate"))
            reasons["duplicate:DUPLICATE_DESIGN"] += 1
            continue
        seen.add(cand.building.revision_id)
        valid.append(cand)
    return GenerationResult(tuple(valid), tuple(rejected), attempts, count, dict(reasons), limit)
