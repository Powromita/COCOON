"""
catalog.py - The M2 template catalogue and the requirement compatibility check, for clients (mobile app, web UI).

Everything here is read from M2's own sources of truth, never restated:
  templates/*.json + template_catalog   rooms, floors, links, shared ("serves") functions
  requirement_parser.DEFAULT_SIZING      room minimum areas / widths, circulation, stair allowance, ceiling heights
  candidate_generator.fitting_templates  the template-matching rule generation itself uses
  candidate_generator.material_pool      which snapshot materials can form which assemblies

The compatibility check is PRELIMINARY. It answers "can any template hold these rooms within these floors and this
footprint, with these materials?" using the same rules as generation. It does NOT prove a candidate exists: room
proportions, door and stair placement, glazing limits and the envelope mass limit are only known once
``generate_designs`` builds and validates real geometry (the 18 checks in constraints.py).

Templates carry no version field, so each is identified by a content hash, and the catalogue by
``catalog_version`` (generator version + every template hash + the sizing table). A job records the version it was
checked against, so a later template edit is visible.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field as dc_field, replace
from pathlib import Path
from typing import Any, Literal, Mapping

from pydantic import ValidationError

from cocoon_contracts.materials import MaterialSnapshot
from cocoon_contracts.requirements import (DesignConstraints, MissionRequirements, ProjectMode, RequirementsContract)

from design_generator.candidate_generator import (GENERATOR_VERSION, GenerationOptions, NoTemplateError,
                                                  fitting_templates, material_pool)
from design_generator.requirement_parser import (DEFAULT_SIZING, GenerationSpec, RequirementError, SizingTable,
                                                 _usable_area, parse_mission)
from design_generator.template_catalog import Template, TemplateMatch, filter_templates, list_templates

# Contract bound on maximum_floors (cocoon_contracts.requirements.DesignConstraints).
CONTRACT_MAX_FLOORS = 5

Arrangement = Literal["dedicated", "shared"]

PRELIMINARY_NOTE = (
    "Preliminary check: rooms, floors, footprint and materials match a template. Room proportions, door and stair "
    "placement, glazing and the mass limit are only checked when candidates are generated."
)


# ----- catalogue ------------------------------------------------------------------------------------------------------
def template_hash(template: Template) -> str:
    raw = json.dumps(template.model_dump(mode="json"), sort_keys=True)
    return "tpl_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def catalog_version(directory: Path | str | None = None, sizing: SizingTable = DEFAULT_SIZING) -> str:
    parts = {"generator": GENERATOR_VERSION, "sizing": sizing.as_dict(),
             "templates": {t.id: template_hash(t) for t in list_templates(directory)}}
    return "cat_" + hashlib.sha256(json.dumps(parts, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def _functions(template: Template) -> tuple[list[str], dict[str, list[str]]]:
    """(room types the template has its own room for, room type -> template room ids that can also serve it)."""
    dedicated = sorted(template.room_types)
    shared: dict[str, list[str]] = {}
    for room in template.rooms:
        for served in room.serves:
            if served not in template.room_types:
                shared.setdefault(served, []).append(room.id)
    return dedicated, {k: sorted(v) for k, v in sorted(shared.items())}


def describe_template(template: Template) -> dict[str, Any]:
    dedicated, shared = _functions(template)
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "version": template_hash(template),
        "active": True,                       # every file in templates/ is used by generation; there is no inactive flag
        "floor_count": template.floor_count,
        "airlock_required": template.rules.airlock_between_outdoors_and_primary,
        "dedicated_functions": dedicated,
        "shared_functions": shared,
        "supported_functions": sorted(set(dedicated) | set(shared)),
        "rooms": [{"id": r.id, "type": r.type, "floor_level": r.floor_level, "is_primary_occupied": r.is_primary_occupied,
                   "exterior_access": r.exterior_access, "serves": list(r.serves)} for r in template.rooms],
        "links": [{"a": link.a, "b": link.b, "kind": link.kind} for link in template.links],
    }


def material_support(snapshot: MaterialSnapshot, options: GenerationOptions = GenerationOptions()) -> list[dict[str, Any]]:
    """Per snapshot material: the role M2 gives it and the assembly elements it can be used in (empty = unusable)."""
    pool = material_pool((), snapshot, options)
    out = []
    for mid in sorted(snapshot.materials):
        rec = snapshot.materials[mid]
        role = next((r for r in ("structural", "insulation") if any(mid == m for v in pool[r].values() for m, _ in v)), None)
        elements = sorted({el for r in ("structural", "insulation") for el, v in pool[r].items() if any(mid == m for m, _ in v)})
        out.append({"id": mid, "display_name": rec.display_name, "category": rec.category, "role": role, "elements": elements})
    return out


def describe_catalog(snapshots: list[MaterialSnapshot] | None = None, directory: Path | str | None = None,
                     sizing: SizingTable = DEFAULT_SIZING, options: GenerationOptions = GenerationOptions()) -> dict[str, Any]:
    templates = list_templates(directory)
    room_types = sorted(sizing.rules)
    return {
        "catalog_version": catalog_version(directory, sizing),
        "generator_version": GENERATOR_VERSION,
        "templates": [describe_template(t) for t in templates],
        "room_types": [{
            "type": rt,
            "min_area_fixed_m2": sizing.rules[rt].fixed_m2,
            "min_area_per_person_m2": sizing.rules[rt].per_person_m2,
            "min_dimension_m": sizing.rules[rt].min_dimension_m,
            "dedicated_in": sorted(t.id for t in templates if rt in t.room_types),
            "shared_in": sorted(t.id for t in templates if rt not in t.room_types and any(rt in r.serves for r in t.rooms)),
        } for rt in room_types],
        "floors": {"template_floor_counts": sorted({t.floor_count for t in templates}),
                   "contract_max_floors": CONTRACT_MAX_FLOORS},
        "sizing": {"circulation_factor": sizing.circulation_factor, "stair_allowance_m2": sizing.stair_allowance_m2,
                   "ceiling_height_range_m": list(sizing.ceiling_height_range_m),
                   "assumptions_note": "Placeholder planning assumptions from design_generator/requirement_parser.py; "
                                       "not standards."},
        "materials": {s.snapshot_id: material_support(s, options) for s in (snapshots or [])},
        "required_structural_elements": ["wall", "roof", "floor"],
        "notes": [
            "A template fixes topology only; dimensions and materials are chosen per candidate.",
            "A shared function is provided by a room of another type (its 'serves' list), e.g. sleeping in the living room.",
        ],
    }


# ----- compatibility --------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Issue:
    layer: Literal["input", "functional", "physical", "materials", "arrangement", "selection"]
    code: str
    message: str
    field: str | None = None
    details: Mapping[str, Any] = dc_field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"layer": self.layer, "code": self.code, "message": self.message, "field": self.field,
                "details": dict(self.details)}


def _elements_needed(template: Template) -> list[str]:
    needed = ["wall", "roof", "floor"]
    if any(link.kind in ("door", "partition") for link in template.links):
        needed.append("partition")            # rooms joined on one floor share a wall
    if template.floor_count > 1:
        needed.append("interfloor")
    return needed


def _input_issues(raw: Mapping[str, Any]) -> list[Issue]:
    try:
        RequirementsContract.model_validate(raw)
        return []
    except ValidationError as exc:
        out = []
        for e in exc.errors():
            loc = ".".join(str(p) for p in e["loc"] if not isinstance(p, int))
            out.append(Issue("input", "VALIDATION_ERROR", e["msg"], field=loc or None, details={"type": e["type"]}))
        return out


def _min_footprint(spec: GenerationSpec, floors: int, sizing: SizingTable) -> float:
    """Smallest footprint cap (0.1 m2 grid, rounded up) at which the parser allows ``floors`` floors."""
    need = (spec.required_total_area_m2 + 2 * (floors - 1) * sizing.stair_allowance_m2) / floors
    return math.ceil(round(need * 10, 6)) / 10


def _arrangement_issue(match: TemplateMatch, arrangement: Mapping[str, Arrangement]) -> Issue | None:
    for room_type, wanted in sorted(arrangement.items()):
        if room_type not in match.provided_by:
            continue
        shared = room_type in match.merged
        if wanted == "dedicated" and shared:
            host = match.template.room(match.merged[room_type])
            return Issue("arrangement", "SHARED_NOT_DEDICATED",
                         f"{match.template.name} has no separate {room_type} room; it uses the {host.type} room for it.",
                         field="room_arrangement", details={"room_type": room_type, "host_room": host.id})
        if wanted == "shared" and not shared:
            return Issue("arrangement", "DEDICATED_NOT_SHARED",
                         f"{match.template.name} gives {room_type} its own room; it cannot share it with another room.",
                         field="room_arrangement", details={"room_type": room_type})
    return None


def check_compatibility(
    requirements: Mapping[str, Any] | RequirementsContract,
    snapshot: MaterialSnapshot,
    *,
    template_id: str | None = None,
    room_arrangement: Mapping[str, Arrangement] | None = None,
    directory: Path | str | None = None,
    sizing: SizingTable = DEFAULT_SIZING,
    options: GenerationOptions = GenerationOptions(),
) -> dict[str, Any]:
    """Layered, preliminary compatibility of (possibly incomplete) requirements with the M2 catalogue.

    Layers: input (contract fields), functional (rooms vs template rooms / shared functions), physical (floors and
    footprint via the parser's own feasibility rule), materials (structural layers for every assembly the template
    needs), arrangement (dedicated vs shared rooms the user asked for) and selection (a pinned template).
    Never raises for bad requirements; every problem is reported.
    """
    raw = requirements.model_dump(mode="json") if isinstance(requirements, RequirementsContract) else dict(requirements)
    arrangement = dict(room_arrangement or {})
    templates = list_templates(directory)
    result: dict[str, Any] = {
        "catalog_version": catalog_version(directory, sizing), "preliminary": True, "note": PRELIMINARY_NOTE,
        "materials_snapshot_id": snapshot.snapshot_id, "ok": False, "stage_reached": "input",
        "input_errors": [], "conflicts": [], "warnings": [], "alternatives": [], "templates": [],
        "compatible_template_ids": [], "selected_template_ids": [], "spec": None,
    }
    input_issues = _input_issues(raw)
    result["input_errors"] = [i.to_dict() for i in input_issues]

    mode = raw.get("mode")
    if mode not in (None, ProjectMode.NEW_SHELTER.value, ProjectMode.ENGINEERING_OPTIMIZATION.value):
        result["conflicts"].append(Issue("input", "UNSUPPORTED_MODE", f"mode '{mode}' does not generate new layouts",
                                         field="mode").to_dict())
        return result
    for key, value in arrangement.items():
        if value not in ("dedicated", "shared"):
            result["input_errors"].append(Issue("input", "VALIDATION_ERROR", "choose 'dedicated' or 'shared'",
                                                field=f"room_arrangement.{key}").to_dict())
    try:
        mission = MissionRequirements.model_validate(raw.get("mission") or {})
        cons = DesignConstraints.model_validate(raw.get("constraints") or {})
    except ValidationError:
        return result                     # the field errors are already in input_errors

    result["stage_reached"] = "functional"
    try:
        spec = parse_mission(mission, cons, str(raw.get("project_id") or "prj_compatibility_check"), sizing)
    except RequirementError as exc:
        if exc.code != "INFEASIBLE_REQUIREMENTS":
            field_name = "mission.required_rooms"
            result["conflicts"].append(Issue("input", exc.code, str(exc), field=field_name, details=exc.details).to_dict())
            return result
        result["conflicts"].append(Issue("physical", exc.code, str(exc), field="constraints.maximum_footprint_m2",
                                         details=exc.details).to_dict())
        spec = parse_mission(mission, cons.model_copy(update={"maximum_footprint_m2": None}),
                             str(raw.get("project_id") or "prj_compatibility_check"), sizing)
        usable = {int(k): v for k, v in exc.details["usable_area_by_floor_count_m2"].items()}
        spec = replace(spec, footprint_cap_m2=cons.maximum_footprint_m2, allowed_floor_counts=(),
                       usable_area_by_floor_count_m2=usable)
    result["spec"] = {
        "occupants": spec.occupants,
        "rooms": [{"type": r.room_type, "min_area_m2": r.min_area_m2, "min_dimension_m": r.min_dimension_m} for r in spec.rooms],
        "room_area_sum_m2": spec.room_area_sum_m2, "required_total_area_m2": spec.required_total_area_m2,
        "footprint_cap_m2": spec.footprint_cap_m2, "max_floors": spec.max_floors,
        "allowed_floor_counts": list(spec.allowed_floor_counts),
        "usable_area_by_floor_count_m2": {str(k): v for k, v in spec.usable_area_by_floor_count_m2.items()},
    }

    rooms = [r.room_type for r in spec.rooms]
    functional = {m.template.id: m for m in filter_templates(rooms, CONTRACT_MAX_FLOORS, directory)}
    pool = material_pool(spec.allowed_material_ids, snapshot, options)
    unknown = sorted(set(spec.allowed_material_ids) - set(snapshot.materials))
    if unknown:
        result["warnings"].append(Issue("materials", "MATERIAL_NOT_IN_SNAPSHOT",
                                        f"{', '.join(unknown)} {'is' if len(unknown) == 1 else 'are'} not in material set "
                                        f"{snapshot.snapshot_id} and will not be used.",
                                        field="constraints.available_material_ids", details={"material_ids": unknown}).to_dict())
    if spec.maximum_mass_kg is not None:
        result["warnings"].append(Issue("physical", "MASS_CHECKED_AT_GENERATION",
                                        f"The {spec.maximum_mass_kg:g} kg envelope mass limit is checked only on generated "
                                        "candidates; a tight limit can reject many of them.",
                                        field="constraints.maximum_mass_kg").to_dict())

    for t in templates:
        issues: list[Issue] = []
        match = functional.get(t.id)
        if match is None:
            missing = [r for r in rooms if r not in t.room_types and not any(r in x.serves for x in t.rooms)]
            issues.append(Issue("functional", "ROOMS_NOT_PROVIDED",
                                f"{t.name} has no room for: {', '.join(missing)}.", field="mission.required_rooms",
                                details={"missing_room_types": missing}))
        else:
            if t.floor_count > spec.max_floors:
                issues.append(Issue("physical", "TOO_MANY_FLOORS",
                                    f"{t.name} has {t.floor_count} floors; the maximum is {spec.max_floors}.",
                                    field="constraints.maximum_floors", details={"floor_count": t.floor_count}))
            elif t.floor_count not in spec.allowed_floor_counts:
                usable = spec.usable_area_by_floor_count_m2.get(t.floor_count)
                issues.append(Issue("physical", "FOOTPRINT_TOO_SMALL",
                                    f"{t.name} on {t.floor_count} floor(s) needs {spec.required_total_area_m2:.1f} m² of "
                                    f"rooms and circulation, but only {usable:.1f} m² is usable with a "
                                    f"{spec.footprint_cap_m2:g} m² footprint.",
                                    field="constraints.maximum_footprint_m2",
                                    details={"required_total_area_m2": spec.required_total_area_m2, "usable_area_m2": usable,
                                             "min_footprint_m2": _min_footprint(spec, t.floor_count, sizing)}))
            missing_el = [el for el in _elements_needed(t) if not pool["structural"].get(el)]
            if missing_el:
                issues.append(Issue("materials", "NO_STRUCTURAL_MATERIAL",
                                    f"None of the permitted materials can form the structural layer of: {', '.join(missing_el)}.",
                                    field="constraints.available_material_ids", details={"elements": missing_el}))
            arr = _arrangement_issue(match, arrangement)
            if arr is not None:
                issues.append(arr)
        result["templates"].append({
            "template_id": t.id, "name": t.name, "version": template_hash(t), "floor_count": t.floor_count,
            "compatible": not issues,
            "provided_by": dict(match.provided_by) if match else {},
            "shared": dict(match.merged) if match else {},
            "issues": [i.to_dict() for i in issues],
        })

    compatible = [t["template_id"] for t in result["templates"] if t["compatible"]]
    # Cross-check against the rule generation uses, so the two can never disagree silently.
    if compatible:
        try:
            gen_ids = {m.template.id for m in fitting_templates(spec, None)}
        except NoTemplateError:
            gen_ids = set()
        stray = sorted(set(compatible) - gen_ids)
        if stray:
            raise AssertionError(f"compatibility and generation disagree about {stray}")
    result["compatible_template_ids"] = compatible
    result["stage_reached"] = "physical"

    if template_id is not None:
        if template_id not in {t.id for t in templates}:
            result["conflicts"].append(Issue("selection", "UNKNOWN_TEMPLATE", f"there is no template '{template_id}'",
                                             field="template_id").to_dict())
        elif template_id not in compatible:
            chosen = next(t for t in result["templates"] if t["template_id"] == template_id)
            reasons = " ".join(i["message"] for i in chosen["issues"])
            result["conflicts"].append(Issue("selection", "TEMPLATE_NOT_COMPATIBLE",
                                             f"The chosen template cannot hold these requirements. {reasons}".strip(),
                                             field="template_id",
                                             details={"template_id": template_id, "issues": chosen["issues"]}).to_dict())
        else:
            result["selected_template_ids"] = [template_id]
    else:
        result["selected_template_ids"] = compatible

    if not compatible and not any(c["layer"] == "physical" for c in result["conflicts"]):
        result["conflicts"].append(Issue("functional", "NO_COMPATIBLE_TEMPLATE",
                                         "No template can hold these requirements.").to_dict())
    result["alternatives"] = _alternatives(spec, mission, cons, functional, pool, arrangement, sizing, compatible)
    result["ok"] = bool(result["selected_template_ids"]) and not result["input_errors"] and not any(
        c["layer"] in ("input", "selection") for c in result["conflicts"])
    return result


def _alternatives(spec, mission, cons, functional: dict[str, TemplateMatch], pool, arrangement, sizing,
                  compatible: list[str]) -> list[dict[str, Any]]:
    """Changes that would make a template fit. Each one is re-checked with the parser before it is offered."""
    if compatible:
        return []
    out: list[dict[str, Any]] = []
    for tid, match in sorted(functional.items()):
        t = match.template
        if any(not pool["structural"].get(el) for el in _elements_needed(t)) or _arrangement_issue(match, arrangement):
            continue
        change: dict[str, Any] = {}
        if t.floor_count > spec.max_floors:
            change["constraints.maximum_floors"] = t.floor_count
        if spec.footprint_cap_m2 is not None:
            if _usable_area(t.floor_count, spec.footprint_cap_m2, sizing.stair_allowance_m2) < spec.required_total_area_m2:
                change["constraints.maximum_footprint_m2"] = _min_footprint(spec, t.floor_count, sizing)
        if not change:
            continue
        trial = cons.model_copy(update={
            "maximum_floors": change.get("constraints.maximum_floors", cons.maximum_floors),
            "maximum_footprint_m2": change.get("constraints.maximum_footprint_m2", cons.maximum_footprint_m2)})
        try:
            if t.floor_count not in parse_mission(mission, trial, spec.project_id, sizing).allowed_floor_counts:
                continue
        except RequirementError:
            continue
        parts = []
        if "constraints.maximum_floors" in change:
            parts.append(f"allow {t.floor_count} floors")
        if "constraints.maximum_footprint_m2" in change:
            parts.append(f"allow a footprint of at least {change['constraints.maximum_footprint_m2']:g} m²")
        out.append({"template_id": tid, "name": t.name, "change": change,
                    "message": f"{t.name} would fit if you {' and '.join(parts)}."})
    return out
