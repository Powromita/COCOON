"""
backend/reference_cache.py — load + reshape the three pipeline data files
into the frontend's ReferenceData shape. Cached until file mtime changes.
"""

import csv
import json
from functools import lru_cache

from . import settings
from .models import GlazingProps, MaterialProps, RatioConstraint, ReferenceData

# CSV `factor` text -> frontend enum
_FACTOR_MAP = {
    "Length-to-Width Aspect Ratio": "aspect_ratio",
    "Surface Area-to-Volume Ratio (A/V)": "av_ratio",
    "Window-to-Wall Ratio (WWR)": "wwr_percent",
    "Ceiling Height (m)": "ceiling_height_m",
    "Floor Area (m2)": "floor_area_m2",
}


def _mtime_key() -> tuple:
    return tuple(
        p.stat().st_mtime if p.exists() else 0
        for p in (settings.MATERIALS_JSON, settings.GLAZING_JSON, settings.RATIOS_CSV)
    )


@lru_cache(maxsize=4)
def _load(_key: tuple) -> ReferenceData:
    materials_raw = json.loads(settings.MATERIALS_JSON.read_text(encoding="utf-8"))
    materials = [
        MaterialProps(
            id=mid,
            display_name=m.get("display_name", mid),
            thermal_conductivity=m["thermal_conductivity"],
            density=m["density"],
            specific_heat=m["specific_heat"],
        )
        for mid, m in materials_raw.items()
    ]

    glazing_raw = json.loads(settings.GLAZING_JSON.read_text(encoding="utf-8"))
    glazing = [
        GlazingProps(id=gid, U_W_m2K=g["U_W_m2K"], SHGC=g["SHGC"])
        for gid, g in glazing_raw.items()
    ]

    constraints: list[RatioConstraint] = []
    with settings.RATIOS_CSV.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            factor = _FACTOR_MAP.get(row["factor"].strip())
            if factor:
                constraints.append(
                    RatioConstraint(
                        factor=factor,
                        min=float(row["min_value"]),
                        max=float(row["max_value"]),
                    )
                )

    return ReferenceData(materials=materials, glazing=glazing,
                         ratio_constraints=constraints)


def get_reference() -> ReferenceData:
    return _load(_mtime_key())
