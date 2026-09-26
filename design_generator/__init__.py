"""
COCOON Module M2 - requirement and layout generator.

Public interface (everything else in this package is internal):

    generate_designs(requirements, material_snapshot, *, seed, count, ...) -> GenerationResult
        New-shelter mode: mission requirements -> validated BuildingModel candidates.

    resolve_user_geometry(shelter, material_snapshot=None, ...) -> UserGeometryResult
        Existing-shelter mode: a user-described layout -> the same BuildingModel (source="user_defined").

    to_error_envelope(exc) -> ErrorEnvelope
        Turn any M2 error into the standard PRD 16.6 envelope.

Inputs and outputs are the M0 contracts (RequirementsContract, MaterialSnapshot, BuildingModel).
See README.md in this folder.
"""

from __future__ import annotations

from datetime import datetime

from cocoon_contracts.materials import MaterialSnapshot
from cocoon_contracts.requirements import RequirementsContract

from design_generator.candidate_generator import (
    Candidate,
    GenerationError,
    GenerationOptions,
    GenerationResult,
    NoTemplateError,
    RejectedCandidate,
    generate_candidates as _generate_candidates,
    to_error_envelope,
)
from design_generator.existing_shelter import (
    TopologyReport,
    UserGeometryError,
    UserGeometryResult,
    UserShelter,
    resolve_user_geometry,
)
from design_generator.requirement_parser import RequirementError, SizingTable

__version__ = "1.0.0"


def generate_designs(
    requirements: RequirementsContract | dict,
    material_snapshot: MaterialSnapshot | dict,
    *,
    seed: int,
    count: int,
    created_at: datetime | None = None,
    options: GenerationOptions | None = None,
    sizing: SizingTable | None = None,
) -> GenerationResult:
    """Generate up to ``count`` valid shelter candidates for the requirements.

    Deterministic: the same requirements, snapshot, seed and options give the same designs (``created_at``
    only affects the timestamp inside metadata; design and revision ids do not depend on it). If fewer than
    ``count`` valid designs are found within the attempt limit the result is returned with ``complete`` False
    and every rejection recorded, not raised. Raises RequirementError subclasses for requirements that cannot be
    met (e.g. INFEASIBLE_REQUIREMENTS) and NoTemplateError when no template provides the requested rooms.
    """
    kwargs = {}
    if options is not None:
        kwargs["options"] = options
    if sizing is not None:
        kwargs["sizing"] = sizing
    return _generate_candidates(requirements, material_snapshot, seed=seed, count=count, created_at=created_at, **kwargs)


__all__ = [
    "generate_designs", "resolve_user_geometry", "to_error_envelope",
    "GenerationResult", "Candidate", "RejectedCandidate", "UserGeometryResult", "UserShelter", "TopologyReport",
    "GenerationOptions", "SizingTable",
    "GenerationError", "NoTemplateError", "RequirementError", "UserGeometryError",
    "__version__",
]
