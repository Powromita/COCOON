"""
m0_assembly_adapter.py

Adapter converting M0 BuildingModel construction assemblies into the layer
specifications required by the M8 multi-room ANSYS builder.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Ensure packages/contracts/python is importable if not already in sys.path
_CONTRACTS_DIR = Path(__file__).resolve().parent.parent / "packages" / "contracts" / "python"
if _CONTRACTS_DIR.is_dir() and str(_CONTRACTS_DIR) not in sys.path:
    sys.path.insert(0, str(_CONTRACTS_DIR))

from cocoon_contracts.building import BuildingModel, ConstructionAssembly, SurfaceType


class UnsupportedAssemblyLayoutError(ValueError):
    """Raised when a BuildingModel uses multiple assemblies for a surface category

    or has an assembly layout not supported by the current M8 ANSYS builder.
    """
    pass


class InvalidPartitionInterfaceError(UnsupportedAssemblyLayoutError):
    """Raised when a partition surface has invalid interface metadata or connectivity."""
    pass


def _extract_single_assembly(
    building: BuildingModel,
    surface_type: SurfaceType,
    category_label: str,
    required: bool = True,
) -> ConstructionAssembly | None:
    """Find the single unique assembly used for the given surface type across all surfaces.

    Inspects building.surfaces to collect non-null assembly IDs actually referenced.
    If required is False and no surfaces of this type exist, returns None.

    Raises UnsupportedAssemblyLayoutError if:
    - required is True and no surfaces/assemblies are found,
    - >1 unique assemblies are found,
    - the referenced assembly is missing from building.assemblies,
    - the referenced assembly has no layers.
    """
    assembly_ids = {
        s.assembly_id
        for s in building.surfaces
        if s.surface_type == surface_type and s.assembly_id
    }

    if not assembly_ids:
        if not required:
            return None
        raise UnsupportedAssemblyLayoutError(
            f"No assembly found for {category_label} surfaces ({surface_type.value}). "
            f"The current M8 builder requires exactly one {category_label} assembly."
        )

    if len(assembly_ids) > 1:
        sorted_ids = sorted(assembly_ids)
        raise UnsupportedAssemblyLayoutError(
            f"Found multiple assembly IDs {sorted_ids} for {category_label} surfaces ({surface_type.value}). "
            f"The current M8 builder supports only one common {category_label} assembly."
        )

    asm_id = next(iter(assembly_ids))
    if asm_id not in building.assemblies:
        raise UnsupportedAssemblyLayoutError(
            f"Assembly ID '{asm_id}' referenced by {category_label} surfaces "
            f"is missing from building.assemblies."
        )

    assembly = building.assemblies[asm_id]
    if not assembly.layers:
        raise UnsupportedAssemblyLayoutError(
            f"Assembly '{asm_id}' for {category_label} surfaces contains no layers."
        )

    return assembly


def _extract_partition_interfaces(
    building: BuildingModel,
    partition_assembly_id: str,
) -> list[dict[str, str]]:
    """Extract and validate interface orientation metadata for all partition surfaces.

    Validates each partition surface using the selected partition assembly:
    - adjacent_zone_id must not be None or empty.
    - owning_zone_id and adjacent_zone_id must be different (no self-adjacency).
    - both zone IDs must exist in the BuildingModel floors/zones.
    - the same unordered zone pair must not appear more than once.

    Parameters
    ----------
    building : BuildingModel
        Validated BuildingModel instance.
    partition_assembly_id : str
        ID of the selected common partition assembly.

    Returns
    -------
    list[dict[str, str]]
        List of interface dictionaries with keys:
        'surface_id', 'owning_zone_id', 'adjacent_zone_id'.

    Raises
    ------
    InvalidPartitionInterfaceError
        If any partition surface fails interface validation.
    """
    valid_zone_ids = {
        zone.id
        for floor in building.floors
        for zone in floor.zones
    }

    partition_surfaces = [
        s for s in building.surfaces
        if s.surface_type == SurfaceType.PARTITION and s.assembly_id == partition_assembly_id
    ]

    interfaces: list[dict[str, str]] = []
    seen_pairs: set[frozenset[str]] = set()

    for s in partition_surfaces:
        if not s.adjacent_zone_id or not s.adjacent_zone_id.strip():
            raise InvalidPartitionInterfaceError(
                f"Partition surface '{s.id}' is missing a valid 'adjacent_zone_id'."
            )

        if s.owning_zone_id == s.adjacent_zone_id:
            raise InvalidPartitionInterfaceError(
                f"Partition surface '{s.id}' has self-adjacency: owning_zone_id and "
                f"adjacent_zone_id are both '{s.owning_zone_id}'."
            )

        if s.owning_zone_id not in valid_zone_ids:
            raise InvalidPartitionInterfaceError(
                f"Partition surface '{s.id}' references unknown owning_zone_id '{s.owning_zone_id}' "
                f"not found in building floors/zones."
            )

        if s.adjacent_zone_id not in valid_zone_ids:
            raise InvalidPartitionInterfaceError(
                f"Partition surface '{s.id}' references unknown adjacent_zone_id '{s.adjacent_zone_id}' "
                f"not found in building floors/zones."
            )

        pair = frozenset({s.owning_zone_id, s.adjacent_zone_id})
        if pair in seen_pairs:
            raise InvalidPartitionInterfaceError(
                f"Duplicate partition interface between zones '{s.owning_zone_id}' and "
                f"'{s.adjacent_zone_id}' detected on surface '{s.id}'."
            )
        seen_pairs.add(pair)

        interfaces.append({
            "surface_id": s.id,
            "owning_zone_id": s.owning_zone_id,
            "adjacent_zone_id": s.adjacent_zone_id,
        })

    return interfaces


def building_model_to_ansys_assemblies(building: BuildingModel) -> dict[str, Any]:
    """Convert BuildingModel construction assemblies into the layer specifications

    expected by the M8 multi-room ANSYS builder.

    Inspects building.surfaces to identify the unique assembly used for each
    envelope category (exterior walls, roof, floor) and partitions.

    Wall, roof, and floor assemblies are required. Partition assembly is optional;
    if no partition surfaces are present (e.g. in a single-room building),
    "partition" is returned as None.

    Wall, roof, and floor layers are converted from M0 inner-to-outer order into
    outer-to-inner order expected by geometry_builder_multiroom.py.

    When present, the partition assembly is preserved in its complete inner-to-outer
    definition along with its calculated total thickness and validated interface metadata.

    Parameters
    ----------
    building : BuildingModel
        Validated M0 BuildingModel contract instance.

    Returns
    -------
    dict[str, Any]
        {
            "walls": [{"thickness_mm": float, "material": str}, ...],  # outer-to-inner
            "roof":  [{"thickness_mm": float, "material": str}, ...],  # outer-to-inner
            "floor": [{"thickness_mm": float, "material": str}, ...],  # outer-to-inner
            "partition": {
                "assembly_id": str,
                "layers_inner_to_outer": [{"thickness_mm": float, "material": str}, ...],
                "total_thickness_m": float,
                "interfaces": [
                    {
                        "surface_id": str,
                        "owning_zone_id": str,
                        "adjacent_zone_id": str,
                    },
                    ...
                ],
            } | None,
        }

    Raises
    ------
    UnsupportedAssemblyLayoutError
        If multiple assemblies are used for any surface category, if a required
        surface category (wall, roof, floor) has no assembly, or if an assembly definition is missing.
    InvalidPartitionInterfaceError
        If partition surfaces have invalid interface connectivity or duplicate room pairs.
    """
    wall_assembly = _extract_single_assembly(
        building, SurfaceType.EXTERIOR_WALL, "exterior-wall", required=True
    )
    roof_assembly = _extract_single_assembly(
        building, SurfaceType.ROOF, "roof", required=True
    )
    floor_assembly = _extract_single_assembly(
        building, SurfaceType.FLOOR, "floor", required=True
    )
    partition_assembly = _extract_single_assembly(
        building, SurfaceType.PARTITION, "partition", required=False
    )

    # Convert wall, roof, and floor layers from M0 inner-to-outer to builder outer-to-inner
    walls_outer_to_inner = [
        {"thickness_mm": layer.thickness_mm, "material": layer.material_id}
        for layer in reversed(wall_assembly.layers)
    ]
    roof_outer_to_inner = [
        {"thickness_mm": layer.thickness_mm, "material": layer.material_id}
        for layer in reversed(roof_assembly.layers)
    ]
    floor_outer_to_inner = [
        {"thickness_mm": layer.thickness_mm, "material": layer.material_id}
        for layer in reversed(floor_assembly.layers)
    ]

    partition_info: dict[str, Any] | None = None
    if partition_assembly is not None:
        partition_layers_inner_to_outer = [
            {"thickness_mm": layer.thickness_mm, "material": layer.material_id}
            for layer in partition_assembly.layers
        ]
        total_thickness_m = round(
            sum(layer.thickness_mm for layer in partition_assembly.layers) / 1000.0, 6
        )
        interfaces = _extract_partition_interfaces(building, partition_assembly.id)
        partition_info = {
            "assembly_id": partition_assembly.id,
            "layers_inner_to_outer": partition_layers_inner_to_outer,
            "total_thickness_m": total_thickness_m,
            "interfaces": interfaces,
        }

    return {
        "walls": walls_outer_to_inner,
        "roof": roof_outer_to_inner,
        "floor": floor_outer_to_inner,
        "partition": partition_info,
    }
