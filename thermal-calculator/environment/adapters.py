"""
environment/adapters.py

The ONLY place that maps contract-shaped config dicts (backend/models.py,
shelter_config) onto environment-function arguments. When the contract
changes, only this file should need to change.

Contents: the physics-level switch (Phase 0); contract layer conversion
and default outer finishes (Phase 1).

Config keys (both optional; absent == today's behaviour)::

    "physics_level":    "legacy" | "enhanced"          default "legacy"
    "physics_features": {"enhanced_solar": bool, ...}  per-feature override

Resolution rule: ``physics_level`` sets the default for every feature
(legacy -> all off, enhanced -> all on); any key in ``physics_features``
then overrides that one feature. So ``{"physics_level": "legacy",
"physics_features": {"enhanced_ground": True}}`` turns on only the
ground model.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Sequence

PHYSICS_LEVELS = ("legacy", "enhanced")
DEFAULT_PHYSICS_LEVEL = "legacy"

# One toggle per independently-switchable environment feature. The phase
# that implements each one is noted for reference.
PHYSICS_FEATURES = (
    "enhanced_solar",        # Phase 3-4: sun position, directional POA, window IAM
    "enhanced_convection",   # Phase 5: wind-dependent h_out
    "enhanced_sky",          # Phase 6: sky temperature, longwave loss
    "enhanced_air",          # Phase 7: altitude air density, weather-driven infiltration
    "enhanced_ground",       # Phase 8: Kasuda ground T, ISO 13370 floor
    "enhanced_doors",        # Phase 9: door leaf conduction + opening exchange
)

# Features whose enhanced implementation is wired into the engine hook.
# Empty until the corresponding phase lands; enabling anything not listed
# here makes engine_adapter.simulate raise instead of silently running
# legacy physics.
IMPLEMENTED_FEATURES: frozenset[str] = frozenset()


@dataclass(frozen=True)
class PhysicsOptions:
    """Resolved physics switches for one simulation run."""

    level: str
    enhanced_solar: bool = False
    enhanced_convection: bool = False
    enhanced_sky: bool = False
    enhanced_air: bool = False
    enhanced_ground: bool = False
    enhanced_doors: bool = False

    @property
    def enabled_features(self) -> frozenset[str]:
        return frozenset(f for f in PHYSICS_FEATURES if getattr(self, f))

    @property
    def is_legacy(self) -> bool:
        """True when every feature is off, i.e. bit-for-bit legacy physics."""
        return not self.enabled_features


def resolve_physics_options(
    cfg: Mapping,
    level_override: str | None = None,
) -> PhysicsOptions:
    """Resolve ``cfg["physics_level"]`` + ``cfg["physics_features"]`` into
    a :class:`PhysicsOptions`. ``level_override`` (e.g. a CLI/adapter
    argument) wins over the config's level; per-feature toggles still
    apply on top.

    Raises ``ValueError`` on an unknown level, an unknown feature name, or
    a non-boolean toggle, so typos can't silently fall back to legacy.
    """

    level = level_override if level_override is not None else cfg.get(
        "physics_level", DEFAULT_PHYSICS_LEVEL)
    if level not in PHYSICS_LEVELS:
        raise ValueError(
            f"physics_level must be one of {PHYSICS_LEVELS}, got {level!r}")

    features = cfg.get("physics_features") or {}
    if not isinstance(features, Mapping):
        raise ValueError("physics_features must be a mapping of feature -> bool")

    unknown = sorted(set(features) - set(PHYSICS_FEATURES))
    if unknown:
        raise ValueError(
            f"unknown physics_features {unknown}; valid: {list(PHYSICS_FEATURES)}")

    default_on = level == "enhanced"
    resolved = {}
    for name in PHYSICS_FEATURES:
        value = features.get(name, default_on)
        if not isinstance(value, bool):
            raise ValueError(f"physics_features.{name} must be true/false, got {value!r}")
        resolved[name] = value

    return PhysicsOptions(level=level, **resolved)


def require_implemented(options: PhysicsOptions) -> None:
    """Raise ``NotImplementedError`` if ``options`` enables a feature that
    has no enhanced implementation yet."""

    missing = sorted(options.enabled_features - IMPLEMENTED_FEATURES)
    if missing:
        raise NotImplementedError(
            f"physics features not implemented yet: {missing}. "
            f"Use physics_level='legacy' (the default) or disable them in "
            f"physics_features.")


# ======================================================================
# CONTRACT LAYERS -> SI  (Phase 1)
# ======================================================================

MM_PER_M = 1000.0


def contract_layers_to_si(layers: Sequence[Mapping]) -> list[tuple[str, float]]:
    """Convert contract layers ``[{"material": id, "thickness_mm": d}, ...]``
    (backend/models.py ``Layer``; shelter_config walls/roof/floor) into
    ``[(material_id, thickness_m), ...]`` for
    ``environment.materials.layered_construction``.

    Order is preserved (OUTER -> INNER). Material ids are lower-cased and
    stripped, matching thermal_model.prepare_layers. This is the ONLY
    place in the environment package where mm are converted to m.
    """

    out = []
    for i, layer in enumerate(layers):
        if not isinstance(layer, Mapping) or "material" not in layer                 or "thickness_mm" not in layer:
            raise ValueError(
                f"Layer {i} must have 'material' and 'thickness_mm', got {layer!r}.")
        try:
            thickness_mm = float(layer["thickness_mm"])
        except (TypeError, ValueError):
            raise ValueError(
                f"Layer {i}: thickness_mm must be numeric, got {layer['thickness_mm']!r}.") from None
        if not (thickness_mm > 0 and math.isfinite(thickness_mm)):
            raise ValueError(f"Layer {i}: thickness_mm must be > 0, got {thickness_mm}.")
        out.append((str(layer["material"]).lower().strip(), thickness_mm / MM_PER_M))
    return out


# ======================================================================
# DEFAULT OUTER FINISH  (Phase 1)
# ======================================================================
# An exposed PUF face is not a buildable exterior: PUF walls and roofs are
# in practice PPGI-clad sandwich panels. So when the contract gives no
# finish and the OUTERMOST layer is PUF, the construction's radiative
# surface defaults to pre-painted steel sheet, medium colour. Every other
# construction keeps the outermost material's own alpha / epsilon.
#
# This is a defaults-layer rule only: nothing in the legacy engine reads
# finishes, so physics_level="legacy" results are unaffected.

DEFAULT_FINISH_BY_OUTER_MATERIAL = {
    "puf": "prepainted_steel_sheet",          # medium colour (entry default)
}


def default_outer_finish(layers_si: Sequence[tuple[str, float]],
                         explicit_finish: str | None = None) -> str | None:
    """Outer finish for a construction: ``explicit_finish`` if given,
    else the default for its outermost material (see
    ``DEFAULT_FINISH_BY_OUTER_MATERIAL``), else ``None`` (use the
    material's own surface properties)."""

    if explicit_finish is not None:
        return explicit_finish
    if not layers_si:
        return None
    return DEFAULT_FINISH_BY_OUTER_MATERIAL.get(layers_si[0][0])


def construction_from_contract(layers: Sequence[Mapping], materials: Mapping,
                               *, h_in_W_m2K: float, h_out_W_m2K: float | None,
                               outer_finish: str | None = None,
                               finishes: Mapping | None = None):
    """Contract layers ``[{material, thickness_mm}]`` -> ``Construction``,
    applying the mm->m conversion and the default-outer-finish rule.
    ``finishes`` defaults to ``load_finishes()``."""

    from environment.materials import layered_construction, load_finishes

    layers_si = contract_layers_to_si(layers)
    finish = default_outer_finish(layers_si, outer_finish)
    if finish is not None and finishes is None:
        finishes = load_finishes()
    return layered_construction(layers_si, materials, h_in_W_m2K=h_in_W_m2K,
                                h_out_W_m2K=h_out_W_m2K, outer_finish=finish,
                                finishes=finishes)
