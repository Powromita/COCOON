"""
template_catalog.py - Load, validate and filter the shelter topology templates.

A template describes TOPOLOGY only: which rooms exist, which floor each is
on, and how they are linked (door / stair / partition). It never fixes
dimensions or materials; those are decided later by the layout generator
and the candidate generator.

Room ``weight`` is the room's relative share of the footprint *within its
own floor* (weights on one floor need not sum to 1; they are normalised
when the layout is sized).

A room's ``serves`` list names other room types it can stand in for. A
request for [living, sleeping] can be met by one "living" room that serves
"sleeping"; ``filter_templates`` reports every such merge so nothing is
hidden from the caller.
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

TEMPLATE_DIR = Path(__file__).parent / "templates"

AIRLOCK = "airlock"


class TemplateLoadError(ValueError):
    """A template file is malformed. Names the file and the offending field."""

    def __init__(self, path: Path | str, message: str):
        self.path = str(path)
        self.message = message
        super().__init__(f"{Path(path).name}: {message}")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TemplateRoom(_Strict):
    id: str = Field(min_length=1)
    type: str = Field(min_length=1)
    floor_level: int = Field(ge=0)
    is_primary_occupied: bool
    weight: float = Field(gt=0.0)
    exterior_access: bool
    serves: list[str] = Field(default_factory=list)


class TemplateLink(_Strict):
    a: str
    b: str
    kind: Literal["door", "stair", "partition"]


class TemplateRules(_Strict):
    airlock_between_outdoors_and_primary: bool


class Template(_Strict):
    id: str = Field(min_length=1)
    name: str
    description: str
    floor_count: int = Field(ge=1, le=5)
    rooms: list[TemplateRoom] = Field(min_length=1)
    links: list[TemplateLink]
    rules: TemplateRules

    @property
    def room_types(self) -> set[str]:
        return {r.type for r in self.rooms}

    def room(self, room_id: str) -> TemplateRoom:
        for r in self.rooms:
            if r.id == room_id:
                return r
        raise KeyError(room_id)

    @model_validator(mode="after")
    def _check_topology(self) -> "Template":
        ids = [r.id for r in self.rooms]
        if len(set(ids)) != len(ids):
            raise ValueError("rooms: duplicate room id")
        by_id = {r.id: r for r in self.rooms}

        levels = {r.floor_level for r in self.rooms}
        if any(lv >= self.floor_count for lv in levels):
            raise ValueError("rooms.floor_level: level >= floor_count")
        if levels != set(range(self.floor_count)):
            raise ValueError("rooms.floor_level: every floor must contain at least one room")

        primaries = [r for r in self.rooms if r.is_primary_occupied]
        if len(primaries) != 1:
            raise ValueError("rooms.is_primary_occupied: exactly one primary room required")
        if not any(r.exterior_access for r in self.rooms):
            raise ValueError("rooms.exterior_access: at least one room needs an outdoor entrance")

        for link in self.links:
            for end in (link.a, link.b):
                if end not in by_id:
                    raise ValueError(f"links: unknown room '{end}'")
            if link.a == link.b:
                raise ValueError(f"links: room '{link.a}' linked to itself")
            gap = abs(by_id[link.a].floor_level - by_id[link.b].floor_level)
            if link.kind == "stair" and gap != 1:
                raise ValueError(f"links: stair {link.a}-{link.b} must join adjacent floors")
            if link.kind in ("door", "partition") and gap != 0:
                raise ValueError(f"links: {link.kind} {link.a}-{link.b} must join rooms on one floor")

        # Every room must be reachable from an outdoor entrance through doors/stairs.
        walkable: dict[str, set[str]] = {i: set() for i in ids}
        for link in self.links:
            if link.kind in ("door", "stair"):
                walkable[link.a].add(link.b)
                walkable[link.b].add(link.a)
        start = [r.id for r in self.rooms if r.exterior_access]
        seen, queue = set(start), deque(start)
        while queue:
            for nxt in walkable[queue.popleft()]:
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        unreachable = sorted(set(ids) - seen)
        if unreachable:
            raise ValueError(f"links: rooms not reachable from outdoors: {unreachable}")

        if self.rules.airlock_between_outdoors_and_primary:
            airlocks = [r for r in self.rooms if r.type == AIRLOCK]
            if len(airlocks) != 1 or not airlocks[0].exterior_access:
                raise ValueError("rules: airlock rule needs exactly one airlock with exterior_access")
            primary = primaries[0]
            if primary.exterior_access:
                raise ValueError("rules: primary room must not open directly outdoors when an airlock is required")
            direct = any(
                {l.a, l.b} == {airlocks[0].id, primary.id} and l.kind == "door" for l in self.links
            )
            if not direct:
                raise ValueError("rules: airlock must be joined to the primary room by a door")
        return self


@dataclass(frozen=True)
class TemplateMatch:
    """A template that can satisfy a request, with any room merges spelled out."""

    template: Template
    # required room type -> id of the template room that provides it
    provided_by: dict[str, str]
    # subset of provided_by where the template room's own type differs (a merge)
    merged: dict[str, str] = field(default_factory=dict)


def _load_one(path: Path) -> Template:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise TemplateLoadError(path, f"invalid JSON: {exc}") from exc
    try:
        template = Template.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"]) or "<root>"
        raise TemplateLoadError(path, f"field '{where}': {first['msg']}") from exc
    if template.id != path.stem:
        raise TemplateLoadError(path, f"field 'id': '{template.id}' must equal the file name '{path.stem}'")
    return template


@lru_cache(maxsize=4)
def _load_dir(directory: str) -> dict[str, Template]:
    templates: dict[str, Template] = {}
    for path in sorted(Path(directory).glob("*.json")):
        templates[path.stem] = _load_one(path)
    if not templates:
        raise TemplateLoadError(directory, "no template files found")
    return templates


def list_templates(directory: Path | str | None = None) -> list[Template]:
    """All templates, sorted by id. Raises TemplateLoadError if any file is bad."""
    return list(_load_dir(str(directory or TEMPLATE_DIR)).values())


def get_template(template_id: str, directory: Path | str | None = None) -> Template:
    templates = _load_dir(str(directory or TEMPLATE_DIR))
    if template_id not in templates:
        raise KeyError(f"unknown template '{template_id}'; available: {sorted(templates)}")
    return templates[template_id]


def filter_templates(
    required_rooms: list[str],
    max_floors: int,
    directory: Path | str | None = None,
) -> list[TemplateMatch]:
    """Templates that can provide every required room within ``max_floors``.

    Each required room type is matched to a distinct template room, first by
    exact type, then by a room whose ``serves`` list includes it. A merge
    (one room standing in for several required types) is allowed only through
    ``serves`` and is reported in ``TemplateMatch.merged``.
    """
    matches: list[TemplateMatch] = []
    for template in list_templates(directory):
        if template.floor_count > max_floors:
            continue
        provided: dict[str, str] = {}
        merged: dict[str, str] = {}
        ok = True
        for required in required_rooms:
            exact = [r for r in template.rooms if r.type == required]
            if exact:
                provided[required] = exact[0].id
                continue
            server = [r for r in template.rooms if required in r.serves]
            if server:
                provided[required] = server[0].id
                merged[required] = server[0].id
            else:
                ok = False
                break
        if ok:
            matches.append(TemplateMatch(template, provided, merged))
    return matches
