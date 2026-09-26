"""
project.py - Top-level project model capturing state, metadata, and active requirements.
"""

from __future__ import annotations

from typing import Literal
from pydantic import Field, field_validator, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, SCHEMA_VERSION
from cocoon_contracts.requirements import ProjectMode, RequirementsContract, SiteSpecification


class Project(ContractModel):
    """Top-level project representation tracking mission lifecycle and active designs."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    project_id: str = Field(description="Stable project UUID with 'prj_' prefix")
    name: str = Field(description="Human-readable project or deployment name")
    description: str | None = Field(default=None, description="Detailed project objectives and operational notes")
    mode: ProjectMode = Field(description="Operational mode")
    site: SiteSpecification = Field(description="Site geographic and weather specification")
    requirements: RequirementsContract = Field(description="Active mission requirements contract")
    active_design_id: str | None = Field(default=None, description="Currently selected design ID (des_...)")
    created_at: AwareDatetime = Field(description="Project creation timestamp")
    updated_at: AwareDatetime = Field(description="Last modification timestamp")

    @field_validator("project_id")
    @classmethod
    def validate_project_id(cls, v: str) -> str:
        if not v.startswith("prj_"):
            raise ValueError(f"project_id '{v}' must start with 'prj_'")
        return v

    @field_validator("active_design_id")
    @classmethod
    def validate_active_design_id(cls, v: str | None) -> str | None:
        if v is not None and not v.startswith("des_"):
            raise ValueError(f"active_design_id '{v}' must start with 'des_'")
        return v
