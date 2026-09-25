"""
environment/materials.py

Material database, layered constructions, surface finishes and glazing.

Sections
--------
1. Legacy material DB helpers (MOVED verbatim-in-logic from
   thermal-calculator/materials.py): ``load_materials``, ``get_material``,
   ``get_material_display_name``. ``load_materials`` still returns the
   legacy dict-of-dicts that every existing caller expects.
2. Legacy conduction/capacity helpers (MOVED from heat_transfer.py):
   ``layer_resistance``, ``total_resistance``, ``calculate_u_value``,
   ``calculate_layer_capacitance``. heat_transfer.py re-exports them, so
   thermal_model.py and the ANSYS pipeline import exactly as before.
3. Typed API: ``MaterialProps`` / ``load_material_db``, ``SurfaceFinish`` /
   ``load_finishes``, ``Construction`` / ``layered_construction``.
4. Glazing: ``GlazingProps`` / ``load_glazing_db``, ``iam_ashrae``,
   ``hemispherical_iam``.

Conventions
-----------
* SI units inside; thicknesses in metres. The mm -> m conversion of
  contract layers lives in ``environment.adapters.contract_layers_to_si``.
* Layer lists are ordered OUTER -> INNER (index 0 = outermost), the same
  convention as heat_transfer.resistance_to_interior.

Nothing in this module is read by the legacy engine except the moved
functions, so the new absorptance / emissivity / glazing fields have no
effect on physics_level="legacy" results.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, Sequence

import numpy as np

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MATERIALS_PATH = _DATA_DIR / "material_properties.json"
FINISHES_PATH = _DATA_DIR / "surface_finishes.json"
GLAZING_PATH = _DATA_DIR / "glazing_profiles.json"

# Defaults when a material/finish carries no radiative data.
# EnergyPlus Input Output Reference, object "Material": default
# Solar Absorptance 0.7, Thermal Absorptance (= longwave emissivity) 0.9.
DEFAULT_EMISSIVITY = 0.9
DEFAULT_SOLAR_ABSORPTANCE = 0.7

# ASHRAE incidence-angle-modifier coefficient for a glass cover.
# Duffie & Beckman, Solar Engineering of Thermal Processes, 4th ed.
# (2013), sec. 5.12: K_ta = 1 - b0 (1/cos(theta) - 1), b0 ~ 0.10 for a
# single glass cover.
DEFAULT_IAM_B0 = 0.10


# ======================================================================
# 1. LEGACY MATERIAL DB HELPERS  (moved from thermal-calculator/materials.py)
# ======================================================================

REQUIRED_NUMERIC_FIELDS = (
    "thermal_conductivity",
    "density",
    "specific_heat",
)

# Optional radiative fields: validated when present, never required, so
# older JSON files keep loading.
_OPTIONAL_FRACTION_FIELDS = {
    # name: (lower bound, lower inclusive?, upper bound)
    "emissivity": (0.0, False, 1.0),
    "solar_absorptance": (0.0, True, 1.0),
}


def _validate_fraction(owner: str, name: str, value, lo: float,
                       lo_inclusive: bool, hi: float) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{owner} field '{name}' must be numeric.") from None
    ok_lo = v >= lo if lo_inclusive else v > lo
    if not (ok_lo and v <= hi) or math.isnan(v):
        bracket = "[" if lo_inclusive else "("
        raise ValueError(
            f"{owner} field '{name}' must be in {bracket}{lo}, {hi}], got {v}.")
    return v


def _validate_material(material_id, material):
    if not isinstance(material, dict):
        raise ValueError(f"Material '{material_id}' must be a JSON object.")

    for field_name in REQUIRED_NUMERIC_FIELDS:
        if field_name not in material:
            raise ValueError(
                f"Material '{material_id}' is missing "
                f"required field '{field_name}'."
            )
        try:
            value = float(material[field_name])
        except (TypeError, ValueError):
            raise ValueError(
                f"Material '{material_id}' field "
                f"'{field_name}' must be numeric."
            )
        if value <= 0:
            raise ValueError(
                f"Material '{material_id}' field "
                f"'{field_name}' must be greater than zero."
            )

    for name, (lo, lo_inc, hi) in _OPTIONAL_FRACTION_FIELDS.items():
        if name in material:
            _validate_fraction(f"Material '{material_id}'", name,
                               material[name], lo, lo_inc, hi)

    material.setdefault(
        "display_name", material_id.replace("_", " ").title())
    material.setdefault("category", "uncategorized")
    material.setdefault("data_status", "not_specified")
    material.setdefault("data_source", "not_specified")


def load_materials(filepath) -> dict:
    """Load the material JSON as the legacy ``{id: dict}`` mapping used by
    thermal_model, main.py, the ANSYS pipeline and the ML code."""

    with open(filepath, "r", encoding="utf-8") as file:
        materials = json.load(file)

    if not isinstance(materials, dict) or not materials:
        raise ValueError("Material database must contain at least one material.")

    for material_id, material in materials.items():
        _validate_material(material_id, material)

    return materials


def get_material(materials, material_name):
    material_id = material_name.lower().strip()
    if material_id not in materials:
        available = ", ".join(materials.keys())
        raise ValueError(
            f"Material '{material_name}' not found. "
            f"Available materials: {available}"
        )
    return materials[material_id]


def get_material_display_name(material_id, material):
    return material.get("display_name", material_id.replace("_", " ").title())


# ======================================================================
# 2. LEGACY CONDUCTION / CAPACITY HELPERS  (moved from heat_transfer.py)
# ======================================================================

def layer_resistance(thickness_m, thermal_conductivity):
    """Conductive resistance of one layer, R = d / k  [m2 K/W]."""

    if thickness_m <= 0:
        raise ValueError("Thickness must be greater than zero.")
    if thermal_conductivity <= 0:
        raise ValueError("Thermal conductivity must be greater than zero.")
    return thickness_m / thermal_conductivity


def total_resistance(layers, h_inside, h_outside):
    """Air-to-air resistance R = 1/h_in + sum(d/k) + 1/h_out  [m2 K/W].

    ``layers`` are dicts with ``thickness_m`` and ``thermal_conductivity``
    (thermal_model.prepare_layers output)."""

    R_inside = 1 / h_inside
    R_outside = 1 / h_outside

    R_materials = 0.0
    for layer in layers:
        R_materials += layer_resistance(
            layer["thickness_m"], layer["thermal_conductivity"])

    R_total = R_inside + R_materials + R_outside
    return R_total


def calculate_u_value(resistance):
    """U = 1 / R  [W/m2 K]."""

    if resistance <= 0:
        raise ValueError("Resistance must be greater than zero.")
    return 1 / resistance


def calculate_layer_capacitance(area, thickness_m, density, specific_heat):
    """Heat capacity of one layer, C = rho * (A * d) * c_p  [J/K]."""

    volume = area * thickness_m
    mass = density * volume
    capacitance = mass * specific_heat
    return capacitance


# ======================================================================
# 3a. TYPED MATERIAL PROPERTIES
# ======================================================================

def _frozen(mapping: Mapping | None) -> Mapping:
    return MappingProxyType(dict(mapping or {}))


@dataclass(frozen=True)
class MaterialProps:
    """Thermophysical and surface-radiative properties of one material.

    ``sources`` / ``property_status`` map a property name (``k_W_mK``,
    ``rho_kg_m3``, ``cp_J_kgK``, ``emissivity``, ``solar_absorptance``) to
    its citation / data-status string.
    """

    id: str
    display_name: str
    k_W_mK: float
    rho_kg_m3: float
    cp_J_kgK: float
    emissivity: float = DEFAULT_EMISSIVITY
    solar_absorptance: float = DEFAULT_SOLAR_ABSORPTANCE
    category: str = "uncategorized"
    data_status: str = "not_specified"
    sources: Mapping[str, str] = field(default_factory=lambda: _frozen({}))
    property_status: Mapping[str, str] = field(default_factory=lambda: _frozen({}))

    def __post_init__(self):
        owner = f"Material '{self.id}'"
        for name in ("k_W_mK", "rho_kg_m3", "cp_J_kgK"):
            v = getattr(self, name)
            if not (isinstance(v, (int, float)) and v > 0 and math.isfinite(v)):
                raise ValueError(f"{owner} field '{name}' must be > 0, got {v!r}.")
        _validate_fraction(owner, "emissivity", self.emissivity, 0.0, False, 1.0)
        _validate_fraction(owner, "solar_absorptance", self.solar_absorptance,
                           0.0, True, 1.0)
        object.__setattr__(self, "sources", _frozen(self.sources))
        object.__setattr__(self, "property_status", _frozen(self.property_status))

    @property
    def diffusivity_m2_s(self) -> float:
        """Thermal diffusivity alpha = k / (rho c_p)  [m2/s]."""
        return self.k_W_mK / (self.rho_kg_m3 * self.cp_J_kgK)

    def to_legacy_dict(self) -> dict:
        """The dict shape thermal_model.prepare_layers reads."""
        return {
            "display_name": self.display_name,
            "category": self.category,
            "thermal_conductivity": self.k_W_mK,
            "density": self.rho_kg_m3,
            "specific_heat": self.cp_J_kgK,
            "emissivity": self.emissivity,
            "solar_absorptance": self.solar_absorptance,
            "data_status": self.data_status,
        }


# legacy JSON key -> MaterialProps field
_LEGACY_KEYS = {
    "thermal_conductivity": "k_W_mK",
    "density": "rho_kg_m3",
    "specific_heat": "cp_J_kgK",
}


def material_from_dict(material_id: str, raw: Mapping) -> MaterialProps:
    """Build a :class:`MaterialProps` from one legacy-JSON entry.

    ``data_source`` (the whole-material citation) becomes the source of
    k / rho / cp unless ``property_sources`` names a more specific one.
    """

    for name in REQUIRED_NUMERIC_FIELDS:
        if name not in raw:
            raise ValueError(
                f"Material '{material_id}' is missing required field '{name}'.")

    base_source = raw.get("data_source", "not_specified")
    base_status = raw.get("data_status", "not_specified")
    sources = {f: base_source for f in _LEGACY_KEYS.values()}
    status = {f: base_status for f in _LEGACY_KEYS.values()}
    sources.update(raw.get("property_sources") or {})
    status.update(raw.get("property_status") or {})

    try:
        numeric = {f: float(raw[k]) for k, f in _LEGACY_KEYS.items()}
    except (TypeError, ValueError):
        raise ValueError(
            f"Material '{material_id}': thermal_conductivity, density and "
            f"specific_heat must be numeric.") from None

    return MaterialProps(
        id=material_id,
        display_name=raw.get("display_name", material_id.replace("_", " ").title()),
        **numeric,
        emissivity=float(raw.get("emissivity", DEFAULT_EMISSIVITY)),
        solar_absorptance=float(raw.get("solar_absorptance", DEFAULT_SOLAR_ABSORPTANCE)),
        category=raw.get("category", "uncategorized"),
        data_status=base_status,
        sources=sources,
        property_status=status,
    )


def load_material_db(filepath=MATERIALS_PATH) -> dict[str, MaterialProps]:
    """Load the material JSON as ``{id: MaterialProps}`` (validated)."""

    with open(filepath, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    if not isinstance(raw, dict) or not raw:
        raise ValueError("Material database must contain at least one material.")
    out = {}
    for material_id, entry in raw.items():
        if not isinstance(entry, dict):
            raise ValueError(f"Material '{material_id}' must be a JSON object.")
        out[material_id] = material_from_dict(material_id, entry)
    return out


def _as_material_props(material_id: str, entry) -> MaterialProps:
    if isinstance(entry, MaterialProps):
        return entry
    if isinstance(entry, Mapping):
        return material_from_dict(material_id, entry)
    raise TypeError(f"Material '{material_id}': unsupported entry type {type(entry)!r}")


# ======================================================================
# 3b. SURFACE FINISHES (outer-surface radiative override)
# ======================================================================

@dataclass(frozen=True)
class SurfaceFinish:
    """Radiative properties of an exterior finish (render, paint, ...).

    Solar absorptance is governed by the finish, not the bulk material:
    a whitewashed adobe wall absorbs far less than a bare one. When a
    construction names an ``outer_finish`` its alpha / epsilon replace
    those of the outermost layer.
    """

    id: str
    display_name: str
    solar_absorptance: float
    emissivity: float
    source: str = "not_specified"
    notes: str = ""

    def __post_init__(self):
        owner = f"Finish '{self.id}'"
        _validate_fraction(owner, "solar_absorptance", self.solar_absorptance,
                           0.0, True, 1.0)
        _validate_fraction(owner, "emissivity", self.emissivity, 0.0, False, 1.0)


def load_finishes(filepath=FINISHES_PATH) -> dict[str, SurfaceFinish]:
    """Load surface_finishes.json as ``{id: SurfaceFinish}``.

    An entry with ``colour_variants`` (e.g. ``prepainted_steel_sheet``)
    is also expanded into one finish per colour, ``<id>_<colour>``
    (``prepainted_steel_sheet_light`` / ``_medium`` / ``_dark``); the bare
    ``<id>`` keeps the entry's own (default-colour) values.
    """

    with open(filepath, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    out = {}
    for fid, e in raw.items():
        if fid.startswith("_"):          # "_references" etc.
            continue
        for name in ("solar_absorptance", "emissivity"):
            if name not in e:
                raise ValueError(f"Finish '{fid}' is missing required field '{name}'.")
        display = e.get("display_name", fid.replace("_", " ").title())
        out[fid] = SurfaceFinish(
            id=fid,
            display_name=display,
            solar_absorptance=float(e["solar_absorptance"]),
            emissivity=float(e["emissivity"]),
            source=e.get("source", "not_specified"),
            notes=e.get("notes", ""),
        )
        for colour, v in (e.get("colour_variants") or {}).items():
            vid = f"{fid}_{colour}"
            for name in ("solar_absorptance", "emissivity"):
                if name not in v:
                    raise ValueError(f"Finish '{vid}' is missing required field '{name}'.")
            out[vid] = SurfaceFinish(
                id=vid,
                display_name=f"{display.split(',')[0]}, {colour} colour",
                solar_absorptance=float(v["solar_absorptance"]),
                emissivity=float(v["emissivity"]),
                source=v.get("source", e.get("source", "not_specified")),
                notes=e.get("notes", ""),
            )
    return out


# ======================================================================
# 3c. LAYERED CONSTRUCTION
# ======================================================================

@dataclass(frozen=True)
class Construction:
    """Per-square-metre properties of a layered construction.

    Per-layer tuples are ordered OUTER -> INNER and are intended for a
    future multi-node wall model; ``arrays()`` returns them as numpy.

    R_total = 1/h_in + sum(d_i / k_i) + 1/h_out      (1/h_out omitted when
                                                      h_out is None)
    U       = 1 / R_total
    C_total = sum(rho_i c_p,i d_i)                    [J/(m2 K)]
    (ISO 6946:2017 sec. 6.7 for R/U; ISO 13786:2017 for areal heat capacity.)
    """

    layer_ids: tuple[str, ...]
    thickness_m: tuple[float, ...]
    layer_R_m2K_W: tuple[float, ...]
    layer_C_J_m2K: tuple[float, ...]
    R_si_m2K_W: float
    R_se_m2K_W: float
    R_surfaces_m2K_W: float
    R_total_m2K_W: float
    U_W_m2K: float
    C_total_J_m2K: float
    outer_absorptance: float
    outer_emissivity: float
    outer_finish: str | None = None

    @property
    def n_layers(self) -> int:
        return len(self.layer_ids)

    @property
    def R_layers_m2K_W(self) -> float:
        return math.fsum(self.layer_R_m2K_W)

    def arrays(self) -> dict[str, np.ndarray]:
        return {
            "thickness_m": np.asarray(self.thickness_m, float),
            "layer_R_m2K_W": np.asarray(self.layer_R_m2K_W, float),
            "layer_C_J_m2K": np.asarray(self.layer_C_J_m2K, float),
        }


def layered_construction(
    layers: Sequence[tuple[str, float]],
    materials: Mapping,
    *,
    h_in_W_m2K: float,
    h_out_W_m2K: float | None,
    outer_finish: str | None = None,
    finishes: Mapping[str, SurfaceFinish] | None = None,
) -> Construction:
    """Build a :class:`Construction` from ``(material_id, thickness_m)``
    layers ordered OUTER -> INNER.

    Parameters
    ----------
    layers        [(material_id, thickness_m), ...], outer first. Thickness in
                  METRES (convert contract mm with adapters.contract_layers_to_si).
    materials     {id: MaterialProps} (load_material_db) or the legacy
                  {id: dict} (load_materials); both accepted.
    h_in_W_m2K    inside surface film coefficient (> 0).
    h_out_W_m2K   outside film coefficient (> 0), or None for no outside film
                  (ground-contact floors; the soil path is added in Phase 8).
    outer_finish  optional finish id; its alpha/epsilon replace the outermost
                  layer's. Requires ``finishes`` (load_finishes()).

    The resistance sum uses the same operation order as the legacy
    ``total_resistance`` so R/U agree with it bit-for-bit.
    """

    if not layers:
        raise ValueError("A construction needs at least one layer.")
    if not (h_in_W_m2K and h_in_W_m2K > 0):
        raise ValueError(f"h_in_W_m2K must be > 0, got {h_in_W_m2K!r}.")
    if h_out_W_m2K is not None and not h_out_W_m2K > 0:
        raise ValueError(f"h_out_W_m2K must be > 0 or None, got {h_out_W_m2K!r}.")

    ids, thick, lr, lc, props = [], [], [], [], []
    for i, layer in enumerate(layers):
        try:
            material_id, thickness_m = layer
        except (TypeError, ValueError):
            raise ValueError(
                f"Layer {i} must be a (material_id, thickness_m) pair, got {layer!r}."
            ) from None
        if material_id not in materials:
            raise ValueError(
                f"Layer {i}: unknown material '{material_id}'. "
                f"Available: {', '.join(sorted(materials))}")
        thickness_m = float(thickness_m)
        if not (thickness_m > 0 and math.isfinite(thickness_m)):
            raise ValueError(
                f"Layer {i} ('{material_id}'): thickness must be > 0 m, got {thickness_m}.")
        m = _as_material_props(material_id, materials[material_id])
        ids.append(material_id)
        thick.append(thickness_m)
        lr.append(layer_resistance(thickness_m, m.k_W_mK))
        lc.append(m.rho_kg_m3 * thickness_m * m.cp_J_kgK)
        props.append(m)

    R_si = 1 / h_in_W_m2K
    R_se = 0.0 if h_out_W_m2K is None else 1 / h_out_W_m2K

    R_materials = 0.0
    for r in lr:
        R_materials += r
    # same order as legacy total_resistance: inside + materials + outside
    # (adding R_se = 0.0 when h_out is None is exact in IEEE arithmetic)
    R_total = R_si + R_materials + R_se

    if outer_finish is not None:
        if finishes is None or outer_finish not in finishes:
            raise ValueError(
                f"Unknown outer_finish '{outer_finish}'"
                + ("" if finishes is None else f"; available: {', '.join(sorted(finishes))}")
                + (" (pass finishes=load_finishes())" if finishes is None else ""))
        f = finishes[outer_finish]
        alpha, eps = f.solar_absorptance, f.emissivity
    else:
        alpha, eps = props[0].solar_absorptance, props[0].emissivity

    return Construction(
        layer_ids=tuple(ids),
        thickness_m=tuple(thick),
        layer_R_m2K_W=tuple(lr),
        layer_C_J_m2K=tuple(lc),
        R_si_m2K_W=R_si,
        R_se_m2K_W=R_se,
        R_surfaces_m2K_W=R_si + R_se,
        R_total_m2K_W=R_total,
        U_W_m2K=calculate_u_value(R_total),
        C_total_J_m2K=math.fsum(lc),
        outer_absorptance=alpha,
        outer_emissivity=eps,
        outer_finish=outer_finish,
    )


# ======================================================================
# 4. GLAZING
# ======================================================================

def iam_ashrae(cos_theta, b0: float = DEFAULT_IAM_B0):
    """ASHRAE incidence angle modifier for beam radiation on glazing.

        IAM(theta) = 1 - b0 * (1/cos(theta) - 1),  clipped to [0, 1]

    IAM = 1 at normal incidence; 0 for cos(theta) <= 0 (sun behind the
    surface) and wherever the formula goes negative (grazing angles).
    Souka & Safwat (1966); Duffie & Beckman (2013) sec. 5.12.
    Vectorised over ``cos_theta``.
    """

    if b0 < 0:
        raise ValueError(f"b0 must be >= 0, got {b0}.")
    c = np.asarray(cos_theta, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        iam = 1.0 - b0 * (1.0 / c - 1.0)
    iam = np.where(c > 0, np.clip(iam, 0.0, 1.0), 0.0)
    return iam if iam.ndim else float(iam)


def hemispherical_iam(b0: float = DEFAULT_IAM_B0) -> float:
    """Isotropic-diffuse (cosine-weighted hemispherical) average of the
    clipped ASHRAE IAM, used as the default diffuse-to-normal SHGC ratio:

        <IAM> = 2 * integral_0^{pi/2} IAM(theta) sin(theta) cos(theta) dtheta

    Closed form: with u = cos(theta), IAM = (1 + b0) - b0/u for
    u > u0 = b0/(1 + b0) and 0 below, so

        <IAM> = integral_{u0}^{1} [(1 + b0) - b0/u] 2u du = 1 - u0 = 1/(1 + b0)

    (b0 = 0.10 -> 0.909). Compare Duffie & Beckman (2013) sec. 5.4, which
    treat sky diffuse as beam at an effective incidence angle (~59 deg
    for a vertical surface; IAM(59 deg) = 0.906 with b0 = 0.10).
    """

    if b0 < 0:
        raise ValueError(f"b0 must be >= 0, got {b0}.")
    return 1.0 / (1.0 + b0)


@dataclass(frozen=True)
class GlazingProps:
    """Glazing unit properties.

    SHGC is the normal-incidence (hemispherical-transmission) value as in
    glazing_profiles.json. Optional angular fields default so that normal-
    incidence behaviour equals the legacy ``area * SHGC * G`` exactly:
    IAM(0) = 1 and frame_fraction = 0.

    shgc_diffuse  SHGC for isotropic diffuse irradiance; default
                  SHGC * hemispherical_iam(iam_b0) = SHGC / (1 + b0)
                  (0.909 * SHGC for b0 = 0.10).
    """

    id: str
    display_name: str
    U_W_m2K: float
    SHGC: float
    iam_b0: float = DEFAULT_IAM_B0
    shgc_diffuse: float | None = None
    frame_fraction: float = 0.0
    source: str = "not_specified"

    def __post_init__(self):
        owner = f"Glazing '{self.id}'"
        if not self.U_W_m2K >= 0:
            raise ValueError(f"{owner} U_W_m2K must be >= 0.")
        _validate_fraction(owner, "SHGC", self.SHGC, 0.0, True, 1.0)
        _validate_fraction(owner, "frame_fraction", self.frame_fraction, 0.0, True, 1.0)
        if self.iam_b0 < 0:
            raise ValueError(f"{owner} iam_b0 must be >= 0.")
        if self.shgc_diffuse is None:
            object.__setattr__(self, "shgc_diffuse",
                               self.SHGC * hemispherical_iam(self.iam_b0))
        else:
            _validate_fraction(owner, "shgc_diffuse", self.shgc_diffuse, 0.0, True, 1.0)

    def shgc_beam(self, cos_theta):
        """Angle-dependent beam SHGC = SHGC * IAM(theta)."""
        return self.SHGC * iam_ashrae(cos_theta, self.iam_b0)

    @property
    def glass_fraction(self) -> float:
        return 1.0 - self.frame_fraction


def load_glazing_db(filepath=GLAZING_PATH) -> dict[str, GlazingProps]:
    """Load glazing_profiles.json as ``{id: GlazingProps}``; optional
    ``iam_b0`` / ``shgc_diffuse`` / ``frame_fraction`` keys are honoured
    when present, otherwise defaulted (see :class:`GlazingProps`)."""

    with open(filepath, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    out = {}
    for gid, g in raw.items():
        for name in ("U_W_m2K", "SHGC"):
            if name not in g:
                raise ValueError(f"Glazing '{gid}' is missing required field '{name}'.")
        out[gid] = GlazingProps(
            id=gid,
            display_name=g.get("display_name", gid.title()),
            U_W_m2K=float(g["U_W_m2K"]),
            SHGC=float(g["SHGC"]),
            iam_b0=float(g.get("iam_b0", DEFAULT_IAM_B0)),
            shgc_diffuse=(None if g.get("shgc_diffuse") is None
                          else float(g["shgc_diffuse"])),
            frame_fraction=float(g.get("frame_fraction", 0.0)),
            source=g.get("source_status", "not_specified"),
        )
    return out

