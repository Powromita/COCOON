"""
visualization.py - 3D visual geometry, surface tessellation, and thermal timeseries overlays for Three.js.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal
from pydantic import Field, field_validator, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, Vector3D, SCHEMA_VERSION


class VisualizationSource(str, Enum):
    """Origin of the visual model payload."""
    GEOMETRY = "geometry"
    RC = "rc"
    ANSYS = "ansys"


class MeshBox(ContractModel):
    """Axis-aligned geometric box representation of a room or envelope wall."""
    id: str = Field(description="Unique mesh box identifier")
    name: str = Field(description="Display label (e.g. 'Zone: living', 'South Wall')")
    origin_m: Vector3D = Field(description="World origin corner coordinates (m)")
    size_m: Vector3D = Field(description="Bounding box dimensions (m)")
    material_id: str | None = Field(default=None, description="Optional material styling ID (mat_...)")
    floor_level: int = Field(default=0, description="Floor index for layer toggling")
    zone_id: str | None = Field(default=None, description="Owning thermal zone ID if applicable")


class SurfaceVisual(ContractModel):
    """Polygonal surface facet for 3D rendering and raycast selection."""
    id: str = Field(description="Unique visual facet identifier")
    parent_mesh_id: str = Field(description="Reference ID of parent MeshBox")
    surface_type: str = Field(description="Surface category ('wall', 'roof', 'floor', 'partition')")
    boundary_type: str = Field(description="Boundary condition ('outdoors', 'ground', 'adjacent_zone')")
    vertices: list[Vector3D] = Field(default_factory=list, description="Perimeter corner coordinates (m)")
    normal: Vector3D = Field(
        default_factory=lambda: Vector3D(x=0.0, y=0.0, z=1.0),
        description="Outward surface unit normal vector"
    )
    is_exterior: bool = Field(default=True, description="Whether surface faces outdoor ambient weather")


class OpeningVisual(ContractModel):
    """Window or door cutout overlay positioned on a parent surface."""
    id: str = Field(description="Unique opening visual identifier")
    opening_type: str = Field(description="Opening classification ('window' or 'door')")
    parent_surface_id: str = Field(description="Owning surface visual ID")
    position_m: Vector3D = Field(description="Local or world translation offset (m)")
    size_m: Vector3D = Field(description="Opening width, height, and depth (m)")


class ZoneTemperatureSeries(ContractModel):
    """Synchronized timeseries associating temperature colors with 3D zones."""
    zone_id: str = Field(description="Target zone identifier")
    timestamps: list[AwareDatetime] = Field(description="Series timestamps corresponding to temperature points")
    temperatures_c: list[float] = Field(description="Calculated air temperatures (°C)")


class ContourArtifactRef(ContractModel):
    """Reference to an exported ANSYS or FEA 2D contour map frame."""
    step_number: int = Field(description="Simulation hour or substep index")
    timestamp: AwareDatetime = Field(description="Associated observation timestamp")
    image_path: str = Field(description="Relative path or asset URI to rendered contour PNG")
    caption: str = Field(description="Human-readable descriptive caption")


class VisualizationModel(ContractModel):
    """Complete 3D visual scene consumed identically by web and mobile viewers."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    model_id: str = Field(description="Visualization model identifier starting with 'viz_'")
    design_revision_id: str = Field(description="Target design revision ID (rev_...)")
    source: VisualizationSource = Field(description="Data source driving the visual representation")
    boxes: list[MeshBox] = Field(description="3D rectangular volume blocks (explicit empty array allowed if none)")
    surfaces: list[SurfaceVisual] = Field(description="Explicit polygon boundary surfaces (explicit empty array allowed if none)")
    openings: list[OpeningVisual] = Field(description="Glazing and door visual penetrations (explicit empty array allowed if none)")
    temperature_series: list[ZoneTemperatureSeries] | None = Field(
        default=None,
        description="Thermal timeseries for interactive slider playback"
    )
    contour_artifacts: list[ContourArtifactRef] | None = Field(
        default=None,
        description="Pre-rendered FEM contour snapshots if available"
    )
    generated_at: AwareDatetime = Field(description="Visual model creation timestamp")

    @field_validator("model_id")
    @classmethod
    def validate_model_id(cls, v: str) -> str:
        if not v.startswith("viz_"):
            raise ValueError(f"model_id '{v}' must start with 'viz_'")
        return v

    @field_validator("design_revision_id")
    @classmethod
    def validate_revision_id(cls, v: str) -> str:
        if not v.startswith("rev_"):
            raise ValueError(f"design_revision_id '{v}' must start with 'rev_'")
        return v
