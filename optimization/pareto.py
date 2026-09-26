"""
pareto.py - The set of designs no other design beats (PRD section 12.3).

A design A DOMINATES B when A is no worse than B on every chosen objective and strictly better on at least one
(direction-aware: lower is better for "min" objectives, higher for "max"). The Pareto front is every design nothing
dominates, so "cheap but cold" and "warm but expensive" both stay visible instead of being hidden by one score.

Tolerance. Values that differ by less than a small step are treated as EQUAL. The step is
    max(absolute_tolerance[objective], relative_tolerance * (range of that objective))
and values are snapped to that grid before comparing (a step of 0 means exact comparison). Snapping is used instead
of a "within epsilon" test because epsilon-dominance is not transitive and can produce dominance cycles that leave
NO survivors; comparing snapped values is ordinary dominance, so the front is never empty for a non-empty population.

What the result tells you
    front         designs nothing dominates (input order)
    dominated_by  for every other design, ALL designs that dominate it
    rank          1 = front; 2 = front once rank 1 is removed; and so on (non-dominated sorting)
    ties          groups of two or more designs that are identical on every objective (all sit on the same layer)
    excluded      designs that could not be compared, each with the reason (never scored, never silently dropped)
    flagged       front members carrying a post-simulation flag (only when constraint reports are supplied)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Mapping, Sequence

from optimization.constraints import ConstraintReport
from optimization.objectives import OBJECTIVES, ObjectiveResult, active_objectives


class ParetoError(ValueError):
    code = "PARETO_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


@dataclass(frozen=True)
class ParetoSettings:
    absolute_tolerance: Mapping[str, float] = field(default_factory=dict)     # objective -> smallest difference that matters
    relative_tolerance: float = 1e-9                                          # fraction of each objective's range

    def __post_init__(self) -> None:
        if self.relative_tolerance < 0 or any(v < 0 for v in self.absolute_tolerance.values()):
            raise ParetoError("tolerances cannot be negative", "INVALID_SETTINGS")
        unknown = [n for n in self.absolute_tolerance if n not in OBJECTIVES]
        if unknown:
            raise ParetoError(f"tolerance given for unknown objectives {unknown}", "UNKNOWN_OBJECTIVE")


@dataclass(frozen=True)
class ParetoResult:
    objectives: tuple[str, ...]
    front: tuple[str, ...]
    dominated_by: Mapping[str, tuple[str, ...]]
    rank: Mapping[str, int]
    ties: tuple[tuple[str, ...], ...]
    excluded: Mapping[str, str]
    flagged: tuple[str, ...]
    steps: Mapping[str, float]

    def to_dict(self) -> dict:
        return {
            "objectives": list(self.objectives), "front": list(self.front),
            "dominated_by": {k: list(v) for k, v in self.dominated_by.items()}, "rank": dict(self.rank),
            "ties": [list(t) for t in self.ties], "excluded": dict(self.excluded), "flagged": list(self.flagged),
            "steps": dict(self.steps)}


# ----- internals ---------------------------------------------------------------------------------------------
def _snap(value: float, step: float) -> float:
    return value if step == 0 else float(math.floor(value / step + 0.5))


def _dominates(u: tuple[float, ...], v: tuple[float, ...]) -> bool:
    """Both vectors are 'lower is better'."""
    return all(a <= b for a, b in zip(u, v)) and any(a < b for a, b in zip(u, v))


def _steps(results: Sequence[ObjectiveResult], names: Sequence[str], settings: ParetoSettings) -> dict[str, float]:
    out = {}
    for n in names:
        xs = [r.value(n) for r in results]
        spread = (max(xs) - min(xs)) if xs else 0.0
        out[n] = max(settings.absolute_tolerance.get(n, 0.0), settings.relative_tolerance * spread)
    return out


def _vector(r: ObjectiveResult, names: Sequence[str], steps: Mapping[str, float]) -> tuple[float, ...]:
    return tuple(_snap(r.value(n), steps[n]) * (1.0 if OBJECTIVES[n].direction == "min" else -1.0) for n in names)


# ----- public ---------------------------------------------------------------------------------------------------
def pareto_front(
    results: Sequence[ObjectiveResult],
    names: Sequence[str] | None = None,
    settings: ParetoSettings | None = None,
    *,
    reports: Mapping[str, ConstraintReport] | None = None,
) -> ParetoResult:
    """Non-dominated set of ``results`` over ``names``.

    names    the objectives to compare. Default: the objectives EVERY comparable design has (so one design without
             capex cannot silently remove capex for everybody). If you name an objective explicitly, designs that lack
             it are EXCLUDED with a reason instead.
    reports  optional constraint reports by design id. A design with a hard failure is excluded; designs whose report
             carries flags stay, and appear in ``flagged`` if they reach the front.
    """
    settings = settings or ParetoSettings()
    ids = [r.design_id for r in results]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise ParetoError(f"duplicate design ids {dup}", "DUPLICATE_DESIGN", {"ids": dup})
    explicit = names is not None
    if explicit:
        names = list(names)
        unknown = [n for n in names if n not in OBJECTIVES]
        if unknown:
            raise ParetoError(f"unknown objectives {unknown}", "UNKNOWN_OBJECTIVE", {"names": unknown})
        if not names:
            raise ParetoError("no objectives to compare", "NO_OBJECTIVES")
        if len(set(names)) != len(names):
            raise ParetoError("an objective is listed twice", "NO_OBJECTIVES")
    else:
        names = active_objectives(results)

    excluded: dict[str, str] = {}
    included: list[ObjectiveResult] = []
    for r in results:
        if reports is not None and r.design_id in reports and not reports[r.design_id].ok:
            excluded[r.design_id] = "rejected by hard constraints: " + "; ".join(f.reason for f in reports[r.design_id].failed)
        elif not r.comparable:
            excluded[r.design_id] = "not comparable: " + "; ".join(r.not_comparable_reasons)
        else:
            gaps = [n for n in names if r.value(n) is None]
            if gaps:
                excluded[r.design_id] = "no value for " + ", ".join(gaps)
            else:
                included.append(r)

    if not included:
        return ParetoResult(tuple(names), (), {}, {}, (), excluded, (), {})
    if not names:
        raise ParetoError("no objective is available for every comparable design", "NO_OBJECTIVES")

    steps = _steps(included, names, settings)
    vec = {r.design_id: _vector(r, names, steps) for r in included}
    order = [r.design_id for r in included]

    dominators: dict[str, list[str]] = {i: [j for j in order if j != i and _dominates(vec[j], vec[i])] for i in order}
    front = tuple(i for i in order if not dominators[i])
    dominated_by = {i: tuple(d) for i, d in dominators.items() if d}

    rank: dict[str, int] = {}
    remaining, layer = list(order), 1
    while remaining:
        current = [i for i in remaining if not any(_dominates(vec[j], vec[i]) for j in remaining if j != i)]
        if not current:  # cannot happen for a strict partial order; refuse to loop forever if it ever does
            raise ParetoError("dominance formed a cycle, so no design is undominated", "DOMINANCE_CYCLE",
                              {"remaining": remaining})
        for i in current:
            rank[i] = layer
        remaining = [i for i in remaining if i not in current]
        layer += 1

    groups: dict[tuple[float, ...], list[str]] = {}
    for i in order:
        groups.setdefault(vec[i], []).append(i)
    ties = tuple(tuple(g) for g in groups.values() if len(g) > 1)

    flagged = tuple(i for i in front if reports is not None and i in reports and reports[i].flags)
    return ParetoResult(tuple(names), front, dominated_by, rank, ties, excluded, flagged, steps)
