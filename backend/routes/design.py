"""
backend/routes/design.py — the M2 template catalogue and the requirement compatibility check.

    GET  /api/v1/templates                    active M2 templates, room types, sizing rules, usable materials
    GET  /api/v1/templates/{template_id}
    POST /api/v1/design-compatibility         layered, preliminary check of (possibly incomplete) requirements

Both read M2's own sources (design_generator.catalog); nothing here restates a template, a room rule or a limit.
A compatible result is preliminary: real candidates are still generated and validated by M2 inside the optimisation
job, and POST /api/v1/optimizations repeats this check before it queues anything.
"""

from typing import Any, Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from cocoon_contracts import ErrorCode
from design_generator.catalog import check_compatibility, describe_catalog, describe_template
from design_generator.template_catalog import get_template
from m3_data import extended_snapshot, standard_snapshot

from .errors import error_response

router = APIRouter(prefix="/api/v1", tags=["design"])


def _snapshot(snapshot_id: str | None):
    # Lazy import: pipeline._materials is the one place snapshot ids are resolved.
    from .pipeline import _materials
    return _materials(snapshot_id)


@router.get("/templates")
def list_templates_route():
    return describe_catalog([standard_snapshot(), extended_snapshot()])


@router.get("/templates/{template_id}")
def get_template_route(template_id: str):
    try:
        t = get_template(template_id)
    except KeyError:
        return error_response(404, ErrorCode.MISSING_REFERENCE, f"unknown template '{template_id}'",
                              category="invalid_input", field="template_id")
    return describe_template(t)


class CompatibilityBody(BaseModel):
    # A dict, not RequirementsContract: an incomplete draft is checked layer by layer and every missing field is reported.
    requirements: dict[str, Any]
    template_id: str | None = None
    room_arrangement: dict[str, Literal["dedicated", "shared"]] = Field(default_factory=dict)
    materials_snapshot_id: str | None = None


@router.post("/design-compatibility")
def design_compatibility(body: CompatibilityBody):
    try:
        snapshot = _snapshot(body.materials_snapshot_id)
    except Exception:                                               # noqa: BLE001
        return error_response(422, ErrorCode.MISSING_REFERENCE, f"unknown material set '{body.materials_snapshot_id}'",
                              category="invalid_input", field="materials_snapshot_id")
    return check_compatibility(body.requirements, snapshot, template_id=body.template_id,
                               room_arrangement=body.room_arrangement)


def compatibility_or_error(requirements: dict[str, Any], template_id: str | None, room_arrangement: dict[str, str],
                           snapshot) -> tuple[dict[str, Any], JSONResponse | None]:
    """Server-side revalidation before generation. Returns (result, None) or (result, a 422 error response)."""
    result = check_compatibility(requirements, snapshot, template_id=template_id, room_arrangement=room_arrangement)
    if result["ok"]:
        return result, None
    if result["input_errors"]:
        first = result["input_errors"][0]
        return result, error_response(422, ErrorCode.VALIDATION_ERROR, first["message"], category="invalid_input",
                                      field=first["field"], details={"compatibility": result})
    conflict = result["conflicts"][0] if result["conflicts"] else None
    # m2_code keeps the M2 error code clients already read from POST /generate-designs errors.
    m2_code = {"NO_COMPATIBLE_TEMPLATE": "NO_TEMPLATE_FITS", "TEMPLATE_NOT_COMPATIBLE": "NO_TEMPLATE_FITS",
               "UNKNOWN_TEMPLATE": "NO_TEMPLATE_FITS"}.get(conflict["code"], conflict["code"]) if conflict else "NO_TEMPLATE_FITS"
    details = {"m2_code": m2_code, "compatibility": result}
    if conflict and conflict["layer"] == "input":
        return result, error_response(422, ErrorCode.VALIDATION_ERROR, conflict["message"], category="invalid_input",
                                      field=conflict["field"], details=details)
    if conflict and conflict["code"] == "INFEASIBLE_REQUIREMENTS":
        return result, error_response(422, ErrorCode.VALIDATION_ERROR, conflict["message"],
                                      category="physical_infeasibility", field=conflict["field"], details=details)
    message = conflict["message"] if conflict else "No template can hold these requirements."
    return result, error_response(422, ErrorCode.VALIDATION_ERROR, message, category="no_compatible_template",
                                  field=conflict["field"] if conflict else None, details=details)
