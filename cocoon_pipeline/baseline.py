"""
baseline.py - the "standard uninsulated template" M7 compares a design against (PRD 13.6).

The baseline is the SAME building (geometry, openings, schedules, heaters) with every insulation layer removed from
every assembly. It is declared as a template - it is not a previously deployed shelter - and it is simulated by M4 with
the same weather, schedules, target and window as the design, so M7's comparability checks pass honestly.
"""

from __future__ import annotations

import hashlib

from cocoon_contracts import BuildingModel, BuildingSource, MaterialSnapshot


def uninsulated_baseline(building: BuildingModel, materials: MaterialSnapshot) -> tuple[BuildingModel, list[str]]:
    """(baseline building, notes). Assemblies whose every layer is insulation keep their layers (and are noted)."""
    notes: list[str] = []
    assemblies = {}
    for aid, asm in building.assemblies.items():
        kept = [l for l in asm.layers if materials.materials.get(l.material_id) is None
                or materials.materials[l.material_id].category != "insulation"]
        if not kept:
            notes.append(f"assembly '{aid}' is insulation only; kept unchanged in the baseline")
            assemblies[aid] = asm.model_copy(update={"u_value_w_m2k": None})
            continue
        assemblies[aid] = asm.model_copy(update={"layers": kept, "u_value_w_m2k": None})    # U recomputed from layers
    tag = hashlib.sha1((building.revision_id + "|uninsulated").encode()).hexdigest()[:12]
    base = building.model_copy(update={
        "design_id": f"des_{tag}_baseline", "revision_id": f"rev_{tag}_uninsulated",
        "source": BuildingSource.BENCHMARK, "assemblies": assemblies})
    return BuildingModel.model_validate(base.model_dump(mode="json")), notes
