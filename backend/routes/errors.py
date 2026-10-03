"""
backend/routes/errors.py — the M0 ErrorEnvelope plus a user-facing failure category.

The M0 ErrorCode list is closed, so the category travels in ``details["category"]``:

    invalid_input            a field is missing or out of range (``details["field"]`` names it)
    no_compatible_template   no M2 template can hold the requested rooms / arrangement
    physical_infeasibility   the rooms cannot fit the footprint and floors (numbers in details)
    no_feasible_candidates   M2 ran but every candidate failed validation (rejection tally in details)
    temporary_failure        interrupted or unavailable; the same request can be retried
    downstream_failure       a later stage (M4/M7/M6/M8) failed after candidates were generated
    unexpected               anything else; the message is generic and the technical detail is only logged

Messages for ``unexpected`` never carry exception text, paths or stack traces; those go to the server log under the
same trace_id the client sees.
"""

import logging
import uuid
from typing import Any

from fastapi.responses import JSONResponse

from cocoon_contracts import ErrorCode, ErrorDetail, ErrorEnvelope

log = logging.getLogger("cocoon.api")

GENERIC_MESSAGE = "Something went wrong on the COCOON server. Your inputs are saved; quote the reference ID if it keeps happening."

# M2 / M6 codes that tell us which category a raised pipeline error belongs to.
_INPUT_CODES = {"UNKNOWN_ROOM_TYPE", "INVALID_ROOM_LIST", "UNSUPPORTED_MODE", "USER_INPUT_INVALID", "VALIDATION_ERROR",
                "INVALID_SETTINGS"}
_TEMPLATE_CODES = {"NO_TEMPLATE_FITS"}
_PHYSICAL_CODES = {"INFEASIBLE_REQUIREMENTS"}
_NO_CANDIDATE_CODES = {"NO_CANDIDATES"}
_TEMPORARY_CODES = {"EVALUATOR_UNAVAILABLE", "INTERRUPTED"}
# M3 weather errors caused by the requested site / analysis window (the user can fix them) -> the field to highlight.
_WEATHER_INPUT_FIELDS = {"WEATHER_WINDOW_EMPTY": "site.analysis_start", "WEATHER_WINDOW_INVALID": "site.analysis_start",
                         "WEATHER_GAP_TOO_LARGE": "site.analysis_start", "WEATHER_SITE_UNKNOWN": "site"}


def envelope(code: ErrorCode, message: str, *, category: str, field: str | None = None, details: dict | None = None,
             retryable: bool = False, trace_id: str | None = None) -> dict[str, Any]:
    d = {"category": category, **({"field": field} if field else {}), **(details or {})}
    env = ErrorEnvelope(error=ErrorDetail(code=code, message=message, details=d, trace_id=trace_id or str(uuid.uuid4()),
                                          retryable=retryable))
    return env.model_dump(mode="json")


def error_response(status: int, code: ErrorCode, message: str, *, category: str, field: str | None = None,
                   details: dict | None = None, retryable: bool = False) -> JSONResponse:
    return JSONResponse(status_code=status, content=envelope(code, message, category=category, field=field,
                                                             details=details, retryable=retryable))


def classify_job_error(error: dict[str, Any], stages_completed: list[str]) -> dict[str, Any]:
    """Add ``details.category`` to a stored pipeline error and strip technical text from unexpected ones."""
    details = dict(error.get("details") or {})
    code = details.get("m2_code") or details.get("m6_code") or error.get("code")
    if code in _WEATHER_INPUT_FIELDS:
        category = "invalid_input"
        details.setdefault("field", _WEATHER_INPUT_FIELDS[code])
    elif code in _INPUT_CODES and "generation" not in stages_completed:
        category = "invalid_input"
    elif code in _TEMPLATE_CODES:
        category = "no_compatible_template"
    elif code in _PHYSICAL_CODES:
        category = "physical_infeasibility"
    elif code in _NO_CANDIDATE_CODES:
        category = "no_feasible_candidates"
    elif code in _TEMPORARY_CODES or error.get("retryable"):
        category = "temporary_failure"
    elif "generation" in stages_completed:
        category = "downstream_failure"
    else:
        category = "unexpected"
    out = {**error, "details": {**details, "category": category}}
    if category in ("unexpected", "downstream_failure"):
        log.error("pipeline job failed [trace %s]: %s %s", error.get("trace_id"), error.get("message"), details)
        out["message"] = GENERIC_MESSAGE if category == "unexpected" else (
            "Candidates were generated, but a later stage of the pipeline failed. Already completed stages are kept.")
        out["details"] = {"category": category, **({"m6_code": details["m6_code"]} if "m6_code" in details else {})}
    return out
