"""
common.py - Foundational types, base models, and shared validation rules for COCOON contracts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Final, Literal
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    AfterValidator,
)

SCHEMA_VERSION: Final[Literal["4.0"]] = "4.0"


def validate_timezone_aware(dt: datetime) -> datetime:
    """Ensure that datetime instances are strictly timezone-aware."""
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        raise ValueError(f"Datetime must be timezone-aware (ISO-8601 with offset/Z), received naive datetime: {dt}")
    return dt


AwareDatetime = Annotated[datetime, AfterValidator(validate_timezone_aware)]


class ContractModel(BaseModel):
    """
    Canonical base model for all COCOON contract data structures.
    Strictly forbids unknown fields and enables population by field name.
    """
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        validate_assignment=True,
    )


class Vector3D(ContractModel):
    """3-dimensional Cartesian coordinate or dimension vector in meters."""
    x: float
    y: float
    z: float


class SourceMetadata(ContractModel):
    """Metadata regarding data creation, generator version, and author provenance."""
    generator_version: str | None = Field(default=None, description="Software or script version that created the record")
    creator: str | None = Field(default=None, description="User, service, or script identifier")
    description: str | None = Field(default=None, description="Human-readable context or rationale")
    created_at: AwareDatetime = Field(description="Timezone-aware creation timestamp")


class Provenance(ContractModel):
    """Execution and lineage tracking for reproducibility."""
    code_commit: str = Field(description="Git commit SHA or release identifier")
    created_at: AwareDatetime = Field(description="Timezone-aware generation timestamp")
    input_hashes: dict[str, str] = Field(
        default_factory=dict,
        description="SHA-256 hashes of input artifacts and snapshots"
    )
    weather_snapshot_id: str | None = Field(default=None, description="Associated weather snapshot ID (wx_...)")
    material_version: str | None = Field(default=None, description="Associated material database version or ID")
    user_id: str | None = Field(default=None, description="Optional submitting user identifier")


class SchedulePoint(ContractModel):
    """A discrete timestamped value in an operational schedule."""
    timestamp: AwareDatetime = Field(description="Timezone-aware timestamp for the scheduled value")
    value: float = Field(description="Scalar schedule value (e.g. occupants count, W equipment gain, etc.)")


class Schedule(ContractModel):
    """Explicit operational profile for occupancy, equipment, door openings, or setpoints."""
    id: str = Field(description="Unique schedule identifier")
    name: str = Field(description="Descriptive schedule name")
    type: str = Field(description="Schedule category (e.g., 'occupancy', 'equipment', 'door', 'hvac')")
    points: list[SchedulePoint] = Field(
        default_factory=list,
        description="Explicit timestamp-value pairs"
    )
    hourly_values: list[float] | None = Field(
        default=None,
        description="Optional repeating 24-hour profile normalized to daily hours [0..23]"
    )
    unit: str | None = Field(default=None, description="Unit of measurement for schedule values")


ValidationSeverity = Literal["error", "warning", "info"]


class ValidationIssue(ContractModel):
    """Detailed record of a constraint violation or advisory notice."""
    severity: ValidationSeverity
    code: str = Field(description="Machine-readable error/issue code")
    message: str = Field(description="Human-readable description of the issue")
    path: str | None = Field(default=None, description="JSON pointer or dotted field path where issue occurred")


class ValidationReport(ContractModel):
    """Standardized report for topology, constraint, and candidate feasibility checks."""
    is_valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
    evaluated_at: AwareDatetime
