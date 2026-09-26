"""
requirement_parser.py - Turn a RequirementsContract into a GenerationSpec.

The GenerationSpec is M2's *internal* working brief (it is not a contract):
the minimum area and width of every required room, which floor counts can
physically fit the footprint, which orientations and materials the layout
generator may use, and the comfort/occupancy hints passed downstream.

ALL SIZING NUMBERS BELOW ARE PLACEHOLDER PLANNING ASSUMPTIONS, not standards.
They exist so the pipeline runs end to end and are echoed into every
GenerationSpec (``assumptions``) so a reviewer can see exactly what was used.
The team / DRDO should review and replace them; pass a custom ``SizingTable``
to ``parse_requirements`` to do so without editing this file.

Feasibility rule (per floor count F):
    usable_area(F) = F * footprint_cap - 2 * (F - 1) * stair_allowance
    F is allowed when usable_area(F) >= required_total_area.
The stair takes floor area on both floors it joins, hence the factor 2.
If no F in 1..max_floors fits, INFEASIBLE_REQUIREMENTS is raised with the
numbers that caused it. Requirements are never silently shrunk.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Mapping

from cocoon_contracts.requirements import ProjectMode, RequirementsContract


# --------------------------------------------------------------------------
# Typed errors
# --------------------------------------------------------------------------
class RequirementError(ValueError):
    """Base class. ``code`` is stable and machine-readable."""

    code = "REQUIREMENT_ERROR"

    def __init__(self, message: str, details: dict | None = None):
        self.details = details or {}
        super().__init__(message)


class InfeasibleRequirementsError(RequirementError):
    code = "INFEASIBLE_REQUIREMENTS"


class UnknownRoomTypeError(RequirementError):
    code = "UNKNOWN_ROOM_TYPE"


class InvalidRoomListError(RequirementError):
    code = "INVALID_ROOM_LIST"


class UnsupportedModeError(RequirementError):
    code = "UNSUPPORTED_MODE"


# --------------------------------------------------------------------------
# Sizing assumptions (PLACEHOLDERS - see module docstring)
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class RoomSizingRule:
    """min_area = fixed_m2 + per_person_m2 * occupants."""

    fixed_m2: float
    per_person_m2: float
    min_dimension_m: float


@dataclass(frozen=True)
class SizingTable:
    rules: Mapping[str, RoomSizingRule]
    circulation_factor: float = 1.10       # extra area for passages / internal walls
    stair_allowance_m2: float = 3.0        # stair footprint, consumed on each of 2 floors
    ceiling_height_range_m: tuple[float, float] = (2.3, 3.0)
    default_orientations_deg: tuple[float, ...] = (0, 45, 90, 135, 180, 225, 270, 315)

    def as_dict(self) -> dict:
        return {
            "rules": {
                k: {"fixed_m2": r.fixed_m2, "per_person_m2": r.per_person_m2, "min_dimension_m": r.min_dimension_m}
                for k, r in sorted(self.rules.items())
            },
            "circulation_factor": self.circulation_factor,
            "stair_allowance_m2": self.stair_allowance_m2,
            "ceiling_height_range_m": list(self.ceiling_height_range_m),
            "default_orientations_deg": list(self.default_orientations_deg),
        }


DEFAULT_SIZING = SizingTable(
    rules=MappingProxyType(
        {
            "airlock": RoomSizingRule(fixed_m2=3.0, per_person_m2=0.0, min_dimension_m=1.2),
            "living": RoomSizingRule(fixed_m2=0.0, per_person_m2=0.8, min_dimension_m=2.5),
            "sleeping": RoomSizingRule(fixed_m2=0.0, per_person_m2=1.2, min_dimension_m=2.4),  # double-tier bunks
            "equipment": RoomSizingRule(fixed_m2=4.0, per_person_m2=0.1, min_dimension_m=1.5),
            "storage": RoomSizingRule(fixed_m2=2.0, per_person_m2=0.1, min_dimension_m=1.5),
            "command": RoomSizingRule(fixed_m2=6.0, per_person_m2=0.5, min_dimension_m=2.5),
            "medical": RoomSizingRule(fixed_m2=9.0, per_person_m2=0.3, min_dimension_m=2.5),
        }
    )
)


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class RoomRequirement:
    room_type: str
    min_area_m2: float
    min_dimension_m: float


@dataclass(frozen=True)
class GenerationSpec:
    project_id: str
    mission_type: str
    occupants: int
    target_temperature_c: float
    occupancy_schedule_id: str | None
    rooms: tuple[RoomRequirement, ...]
    room_area_sum_m2: float                 # before circulation
    required_total_area_m2: float           # after circulation
    footprint_cap_m2: float | None
    max_floors: int
    allowed_floor_counts: tuple[int, ...]
    usable_area_by_floor_count_m2: Mapping[int, float | None]
    allowed_orientations_deg: tuple[float, ...]
    allowed_material_ids: tuple[str, ...]   # empty tuple = no restriction
    ceiling_height_range_m: tuple[float, float]
    stair_allowance_m2: float
    circulation_factor: float
    maximum_mass_kg: float | None = None        # envelope mass limit; checked by constraints
    maximum_capex_inr: float | None = None      # carried for M7 (economics); not checked in M2
    max_assembly_time_hours: float | None = None  # carried for M6/M7; not checked in M2
    assumptions: Mapping = field(default_factory=dict)

    def room(self, room_type: str) -> RoomRequirement:
        for r in self.rooms:
            if r.room_type == room_type:
                return r
        raise KeyError(room_type)


# --------------------------------------------------------------------------
# Parser
# --------------------------------------------------------------------------
def _usable_area(floors: int, cap: float, stair: float) -> float:
    return floors * cap - 2 * (floors - 1) * stair


def parse_requirements(
    requirements: RequirementsContract | dict,
    sizing: SizingTable = DEFAULT_SIZING,
) -> GenerationSpec:
    """Pure and deterministic: same input and sizing table -> equal GenerationSpec."""
    if not isinstance(requirements, RequirementsContract):
        requirements = RequirementsContract.model_validate(requirements)

    if requirements.mode not in (ProjectMode.NEW_SHELTER, ProjectMode.ENGINEERING_OPTIMIZATION):
        raise UnsupportedModeError(
            f"mode '{requirements.mode.value}' does not use the requirement parser "
            "(existing shelters supply their own geometry)",
            {"mode": requirements.mode.value},
        )

    mission, cons = requirements.mission, requirements.constraints

    wanted = list(mission.required_rooms)
    if not wanted:
        raise InvalidRoomListError("mission.required_rooms is empty; at least one room is required")
    duplicates = sorted({r for r in wanted if wanted.count(r) > 1})
    if duplicates:
        raise InvalidRoomListError(
            f"mission.required_rooms repeats room types {duplicates}; list each type once",
            {"duplicates": duplicates},
        )
    unknown = [r for r in wanted if r not in sizing.rules]
    if unknown:
        raise UnknownRoomTypeError(
            f"no sizing rule for room types {unknown}; supported: {sorted(sizing.rules)}",
            {"unknown": unknown, "supported": sorted(sizing.rules)},
        )

    rooms = tuple(
        RoomRequirement(
            room_type=r,
            min_area_m2=round(sizing.rules[r].fixed_m2 + sizing.rules[r].per_person_m2 * mission.occupants, 6),
            min_dimension_m=sizing.rules[r].min_dimension_m,
        )
        for r in wanted
    )
    area_sum = round(sum(r.min_area_m2 for r in rooms), 6)
    required_total = round(area_sum * sizing.circulation_factor, 6)

    max_floors = cons.maximum_floors or 1
    cap = cons.maximum_footprint_m2

    usable: dict[int, float | None] = {}
    allowed: list[int] = []
    for floors in range(1, max_floors + 1):
        if cap is None:
            usable[floors] = None
            allowed.append(floors)
            continue
        usable[floors] = round(_usable_area(floors, cap, sizing.stair_allowance_m2), 6)
        if usable[floors] >= required_total:
            allowed.append(floors)

    if not allowed:
        best = usable[max_floors]
        raise InfeasibleRequirementsError(
            f"rooms need {required_total:.1f} m2 (incl. circulation) but at most {best:.1f} m2 is usable "
            f"with a {cap:g} m2 footprint and {max_floors} floor(s)",
            {
                "required_total_area_m2": required_total,
                "room_area_sum_m2": area_sum,
                "footprint_cap_m2": cap,
                "max_floors": max_floors,
                "usable_area_by_floor_count_m2": dict(usable),
            },
        )

    orientations = (
        (float(cons.preferred_orientation_deg),)
        if cons.preferred_orientation_deg is not None
        else tuple(float(o) for o in sizing.default_orientations_deg)
    )

    return GenerationSpec(
        project_id=requirements.project_id,
        mission_type=mission.type,
        occupants=mission.occupants,
        target_temperature_c=mission.target_temperature_c,
        occupancy_schedule_id=mission.occupancy_schedule_id,
        rooms=rooms,
        room_area_sum_m2=area_sum,
        required_total_area_m2=required_total,
        footprint_cap_m2=cap,
        max_floors=max_floors,
        allowed_floor_counts=tuple(allowed),
        usable_area_by_floor_count_m2=MappingProxyType(usable),
        allowed_orientations_deg=orientations,
        allowed_material_ids=tuple(cons.available_material_ids),
        ceiling_height_range_m=sizing.ceiling_height_range_m,
        stair_allowance_m2=sizing.stair_allowance_m2,
        circulation_factor=sizing.circulation_factor,
        maximum_mass_kg=cons.maximum_mass_kg,
        maximum_capex_inr=cons.maximum_capex_inr,
        max_assembly_time_hours=cons.max_assembly_time_hours,
        assumptions=MappingProxyType(sizing.as_dict()),
    )
