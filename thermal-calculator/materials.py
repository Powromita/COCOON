"""
Material database helpers for the
DRDO Shelter Thermal Calculator.

SHIM (Person 2, Phase 1): the implementation moved to
environment/materials.py. This module re-exports it so every existing
``from materials import ...`` (thermal_model, main.py, engine_adapter,
ansys-pipeline, ml/) keeps working unchanged.
"""

from environment.materials import (  # noqa: F401
    REQUIRED_NUMERIC_FIELDS,
    _validate_material,
    get_material,
    get_material_display_name,
    load_materials,
)
