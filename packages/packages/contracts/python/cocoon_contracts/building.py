"""
building.py - Complete parametric BuildingModel defining zones, floors, surfaces, openings, assemblies, and connections.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal
from pydantic import AliasChoices, Field, field_validator, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, Schedule, Vector3D, SCHEMA_VERSION


class BuildingSource(str, Enum):
    """Origin of the building model definition."""
    GENERATED = "generated"
    USER_DEFINED = "user_defined"
    BENCHMARK = "benchmark"
    RETROFIT = "retrofit"


class ZoneSize(ContractModel):
    """Bounding dimensions for a rectangular room/zone in meters."""
    length_m: float = Field(
        gt=0.0,
        validation_alias=AliasChoices("length_m", "length"),
        description="Zone dimension along primary local X-axis (m)"
    )
    width_m: float = Field(
        gt=0.0,
        validation_alias=AliasChoices("width_m", "width"),
        description="Zone dimension along local Y-axis (m)"
    )
    height_m: float = Field(
        gt=0.0,
        validation_alias=AliasChoices("height_m", "height"),
        description="Floor-to-ceiling vertical height (m)"
    )


class Zone(ContractModel):
    """Individual room or thermal space with a single lumped temperature node."""
    id: str = Field(description="Unique zone identifier within the building")
    type: str = Field(description="Room purpose (e.g. 'airlock', 'living', 'sleeping', 'equipment', 'storage')")
    origin_m: Vector3D = Field(description="Origin coordinates (local bottom-south-west corner) in meters")
    size_m: ZoneSize = Field(description="Rectangular zone dimensions in meters")
    occupancy_schedule_id: str | None = Field(default=None, description="Reference to occupancy schedule")
    equipment_schedule_id: str | None = Field(default=None, description="Reference to equipment heat schedule")
    hvac_id: str | None = Field(default=None, description="Optional HVAC or heater device reference")


class Floor(ContractModel):
    """Horizontal storey grouping zones at a common level."""
    id: str = Field(description="Floor level identifier (e.g. 'floor_0', 'floor_1')")
    level: int = Field(description="Zero-indexed vertical floor index (0 for ground floor)")
    elevation_m: float = Field(default=0.0, description="Vertical elevation of finished floor above datum (m)")
    zones: list[Zone] = Field(description="Thermal zones on this floor")


class SurfaceBoundaryType(str, Enum):
    """Physical environment bounding the exterior side of a surface."""
    OUTDOORS = "outdoors"
    GROUND = "ground"
    ADJACENT_ZONE = "adjacent_zone"
    ADIABATIC = "adiabatic"


class SurfaceType(str, Enum):
    """Geometric and architectural category of an opaque surface."""
    EXTERIOR_WALL = "exterior_wall"
    PARTITION = "partition"
    ROOF = "roof"
    FLOOR = "floor"
    CEILING = "ceiling"


class Surface(ContractModel):
    """Planar envelope or partition element bounding a thermal zone."""
    id: str = Field(description="Unique surface identifier")
    owning_zone_id: str = Field(description="Zone containing this surface")
    boundary_type: SurfaceBoundaryType = Field(description="Boundary condition on far side")
    surface_type: SurfaceType = Field(description="Architectural surface category")
    area_m2: float = Field(gt=0.0, description="Gross surface area in m²")
    azimuth_deg: float = Field(
        ge=0.0,
        le=360.0,
        description="Orientation angle (0=North, 90=East, 180=South, 270=West)"
    )
    tilt_deg: float = Field(
        ge=0.0,
        le=180.0,
        description="Surface tilt (0=flat roof pointing up, 90=vertical wall, 180=floor pointing down)"
    )
    assembly_id: str = Field(description="Reference to construction assembly ID")
    adjacent_zone_id: str | None = Field(default=None, description="Neighboring zone ID if internal partition/floor")
    adjacent_surface_id: str | None = Field(default=None, description="Opposing surface ID if paired")
    exposed_fraction: float = Field(default=1.0, ge=0.0, le=1.0, description="Fraction exposed to ambient weather/sun [0..1]")
    vertices: list[Vector3D] | None = Field(default=None, description="Optional 3D polygon perimeter vertices")


class OpeningType(str, Enum):
    """Type of fenestration or passage penetrated into a surface."""
    WINDOW = "window"
    DOOR = "door"


class Opening(ContractModel):
    """Window or door embedded in a parent surface."""
    id: str = Field(description="Unique opening identifier")
    parent_surface_id: str = Field(description="Owning parent surface ID")
    opening_type: OpeningType = Field(description="Category of opening (window or door)")
    area_m2: float = Field(gt=0.0, description="Opening net area in m²")
    u_value_w_m2k: float = Field(gt=0.0, description="Overall thermal transmittance in W/(m²·K)")
    shgc: float | None = Field(default=None, ge=0.0, le=1.0, description="Solar Heat Gain Coefficient (windows)")
    glazing_id: str | None = Field(default=None, description="Reference to glazing profile")
    frame_fraction: float | None = Field(default=None, ge=0.0, le=1.0, description="Fraction of area occupied by frame")
    shading_factor: float | None = Field(default=None, ge=0.0, le=1.0, description="External shading factor [0..1]")
    is_operable: bool | None = Field(default=None, description="Whether opening can be opened for ventilation")
    connected_boundary: str | None = Field(default=None, description="Adjacent zone or 'outdoors' for doors")
    open_events_per_hour: float | None = Field(default=None, ge=0.0, description="Frequency of opening operations per hour")
    avg_open_duration_s: float | None = Field(default=None, ge=0.0, description="Average duration of each open event (seconds)")
    discharge_coefficient: float | None = Field(default=None, ge=0.0, le=1.0, description="Airflow orifice discharge coefficient")


class ZoneConnectionType(str, Enum):
    """Thermal or physical connection between two zones."""
    DOOR = "door"
    PARTITION = "partition"
    STAIR = "stair"
    AIRFLOW = "airflow"
    VIRTUAL = "virtual"


class ZoneConnection(ContractModel):
    """Thermal link or airflow path connecting two zones."""
    id: str = Field(description="Unique connection ID")
    zone_a_id: str = Field(description="First zone ID")
    zone_b_id: str = Field(description="Second zone ID")
    connection_type: ZoneConnectionType = Field(description="Nature of interaction between zones")
    shared_area_m2: float = Field(default=0.0, ge=0.0, description="Contact interface area in m²")
    is_conditioned: bool = Field(default=False, description="Whether interface allows active or passive airflow")


class AssemblyLayer(ContractModel):
    """One material layer within a multi-layer wall, roof, or floor assembly."""
    material_id: str = Field(description="Reference material ID (mat_...)")
    thickness_mm: float = Field(gt=0.0, description="Layer thickness in millimeters")


class AssemblyCategory(str, Enum):
    """Structural use of an assembly."""
    WALL = "wall"
    ROOF = "roof"
    FLOOR = "floor"
    CEILING = "ceiling"
    PARTITION = "partition"


class ConstructionAssembly(ContractModel):
    """Ordered stack of material layers forming an opaque construction."""
    id: str = Field(description="Unique assembly identifier")
    name: str = Field(description="Human-readable assembly title")
    category: AssemblyCategory = Field(description="Structural component type")
    layers: list[AssemblyLayer] = Field(description="Layers ordered from inner to outer boundary")
    r_inside_film_m2k_w: float = Field(default=0.13, ge=0.0, description="Inside surface film resistance (m²·K)/W")
    r_outside_film_m2k_w: float = Field(default=0.04, ge=0.0, description="Outside surface film resistance (m²·K)/W")
    u_value_w_m2k: float | None = Field(default=None, gt=0.0, description="Calculated overall U-value in W/(m²·K)")


class BuildingMetadata(ContractModel):
    """Provenance and generation settings for a BuildingModel candidate."""
    generator_version: str | None = Field(default=None, description="Layout generator version")
    seed: int | None = Field(default=None, description="Random seed used for deterministic reproduction")
    created_at: AwareDatetime = Field(description="Timezone-aware creation timestamp")


class BuildingModel(ContractModel):
    """
    Canonical complete building specification.
    Contains floors, zones, boundaries, surfaces, openings, assemblies, and connections.
    """
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    design_id: str = Field(description="Design identifier starting with 'des_'")
    revision_id: str = Field(description="Immutable revision identifier starting with 'rev_'")
    source: BuildingSource = Field(description="Origin source of this design")
    orientation_deg: float = Field(
        default=180.0,
        ge=0.0,
        le=360.0,
        description="Compass orientation of building main south facade [0..360]"
    )
    floors: list[Floor] = Field(description="List of floors with zones")
    surfaces: list[Surface] = Field(description="Opaque bounding surfaces (explicit empty array allowed if none)")
    openings: list[Opening] = Field(description="Fenestrations and passages (explicit empty array allowed if none)")
    connections: list[ZoneConnection] = Field(description="Inter-zone thermal/airflow connections (explicit empty array allowed if none)")
    assemblies: dict[str, ConstructionAssembly] = Field(
        description="Referenced construction assemblies by assembly ID (explicit empty map allowed if none)"
    )
    schedules: dict[str, Schedule] = Field(
        description="Operational schedules embedded or referenced (explicit empty map allowed if none)"
    )
    metadata: BuildingMetadata = Field(description="Design generation metadata")

    @field_validator("design_id")
    @classmethod
    def validate_design_id(cls, v: str) -> str:
        if not v.startswith("des_"):
            raise ValueError(f"design_id '{v}' must start with 'des_'")
        return v

    @field_validator("revision_id")
    @classmethod
    def validate_revision_id(cls, v: str) -> str:
        if not v.startswith("rev_"):
            raise ValueError(f"revision_id '{v}' must start with 'rev_'")
        return v

    @model_validator(mode="after")
    def validate_building_integrity(self) -> BuildingModel:
        # Floor uniqueness
        floor_ids: set[str] = set()
        floor_levels: set[int] = set()
        zone_ids: set[str] = set()

        for floor in self.floors:
            if floor.id in floor_ids:
                raise ValueError(f"Duplicate floor ID found: '{floor.id}'")
            floor_ids.add(floor.id)

            if floor.level in floor_levels:
                raise ValueError(f"Duplicate floor level found: {floor.level}")
            floor_levels.add(floor.level)

            for zone in floor.zones:
                if zone.id in zone_ids:
                    raise ValueError(f"Duplicate zone ID found across floors: '{zone.id}'")
                zone_ids.add(zone.id)

        # Surface validation
        surface_ids: set[str] = set()
        for surf in self.surfaces:
            if surf.id in surface_ids:
                raise ValueError(f"Duplicate surface ID found: '{surf.id}'")
            surface_ids.add(surf.id)

            if surf.owning_zone_id not in zone_ids:
                raise ValueError(
                    f"Surface '{surf.id}' references non-existent owning zone: '{surf.owning_zone_id}'"
                )

            # Validate assembly reference against defined assemblies
            if surf.assembly_id and surf.assembly_id not in self.assemblies:
                raise ValueError(
                    f"Surface '{surf.id}' references assembly '{surf.assembly_id}' which is not defined in assemblies"
                )

            # Validate partition boundary types
            if surf.surface_type == SurfaceType.PARTITION:
                if surf.boundary_type not in (
                    SurfaceBoundaryType.ADJACENT_ZONE,
                    SurfaceBoundaryType.ADIABATIC,
                ):
                    raise ValueError(
                        f"Partition surface '{surf.id}' cannot use boundary_type '{surf.boundary_type.value}'. "
                        "Partitions must be 'adjacent_zone' or 'adiabatic'."
                    )

            if surf.boundary_type == SurfaceBoundaryType.ADJACENT_ZONE:
                if not surf.adjacent_zone_id:
                    raise ValueError(
                        f"Surface '{surf.id}' marked as adjacent_zone but adjacent_zone_id is missing"
                    )
                if surf.adjacent_zone_id not in zone_ids:
                    raise ValueError(
                        f"Surface '{surf.id}' references non-existent adjacent zone: '{surf.adjacent_zone_id}'"
                    )
                if surf.adjacent_zone_id == surf.owning_zone_id:
                    raise ValueError(
                        f"Surface '{surf.id}' cannot reference its own owning zone '{surf.owning_zone_id}' as adjacent_zone_id"
                    )

        # Opening validation
        opening_ids: set[str] = set()
        for op in self.openings:
            if op.id in opening_ids:
                raise ValueError(f"Duplicate opening ID found: '{op.id}'")
            opening_ids.add(op.id)

            if op.parent_surface_id not in surface_ids:
                raise ValueError(
                    f"Opening '{op.id}' references non-existent parent surface: '{op.parent_surface_id}'"
                )

        # Connection validation
        connection_ids: set[str] = set()
        for conn in self.connections:
            if conn.id in connection_ids:
                raise ValueError(f"Duplicate connection ID found: '{conn.id}'")
            connection_ids.add(conn.id)

            if conn.zone_a_id not in zone_ids:
                raise ValueError(
                    f"Connection '{conn.id}' references non-existent zone_a_id: '{conn.zone_a_id}'"
                )
            if conn.zone_b_id not in zone_ids:
                raise ValueError(
                    f"Connection '{conn.id}' references non-existent zone_b_id: '{conn.zone_b_id}'"
                )
            if conn.zone_a_id == conn.zone_b_id:
                raise ValueError(
                    f"Connection '{conn.id}' cannot connect zone '{conn.zone_a_id}' to itself"
                )

        return self
