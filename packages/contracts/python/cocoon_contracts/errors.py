"""
errors.py - Structured error codes and standard error envelope matching PRD Section 16.6.
"""

from __future__ import annotations

from enum import Enum
from typing import Any
from pydantic import Field
from cocoon_contracts.common import ContractModel


class ErrorCode(str, Enum):
    """Standardized machine-readable error codes across the COCOON platform."""
    VALIDATION_ERROR = "VALIDATION_ERROR"
    SCHEMA_VERSION_MISMATCH = "SCHEMA_VERSION_MISMATCH"
    ZONE_GEOMETRY_INVALID = "ZONE_GEOMETRY_INVALID"
    DUPLICATE_ID = "DUPLICATE_ID"
    MISSING_REFERENCE = "MISSING_REFERENCE"
    UNSUPPORTED_MATERIAL = "UNSUPPORTED_MATERIAL"
    DATETIME_NOT_TIMEZONE_AWARE = "DATETIME_NOT_TIMEZONE_AWARE"
    WEATHER_GAP_TOO_LARGE = "WEATHER_GAP_TOO_LARGE"
    ANSYS_JOB_FAILED = "ANSYS_JOB_FAILED"
    ANSYS_UNAVAILABLE = "ANSYS_UNAVAILABLE"
    DESIGN_OUTSIDE_ML_COVERAGE = "DESIGN_OUTSIDE_ML_COVERAGE"
    CROSS_REVISION_MISMATCH = "CROSS_REVISION_MISMATCH"
    INVALID_LIFECYCLE_RANGE = "INVALID_LIFECYCLE_RANGE"
    RC_ANSYS_CONFLATION_FORBIDDEN = "RC_ANSYS_CONFLATION_FORBIDDEN"


class ErrorDetail(ContractModel):
    """Detailed structure describing an execution or validation failure."""
    code: ErrorCode = Field(description="Machine-readable error code from standardized ErrorCode enum")
    message: str = Field(description="Human-readable explanation of the error")
    details: dict[str, Any] = Field(
        default_factory=dict,
        description="Structured key-value context regarding the error cause"
    )
    trace_id: str = Field(description="Correlation or request trace UUID")
    retryable: bool = Field(default=False, description="Whether the operation can be retried without modification")


class ErrorEnvelope(ContractModel):
    """Standard top-level error response envelope for all COCOON APIs and services."""
    error: ErrorDetail
