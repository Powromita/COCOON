"""
shelter_config.py  --  Stage 2 of the integrated pipeline.

One canonical shelter-configuration schema for the whole project, plus
the builders that produce it. Every downstream module
(thermal_model.run_simulation, the feature reports, the ANSYS runner)
consumes this exact shape.

Schema (all keys required after validate()):
    geometry              {length_m, width_m, height_m}
    walls / roof / floor  [ {material, thickness_mm}, ... ]   outer -> inner
    windows              {area_m2, U_W_m2K, SHGC, glazing_type}
    contents             {mass_kg, specific_heat_J_kgK}
    heat_transfer        {h_inside_W_m2K, h_outside_W_m2K}
    air_changes_per_hour  float
    ground_temperature_mode  "manual" | "annual_mean"
    ground_temperature_C  float          (used when mode == "manual")
    internal_heat_gain_W  float
    initial_temperature_C float

Optional keys (absent == legacy behaviour; see environment/adapters.py):
    physics_level         "legacy" | "enhanced"
    physics_features      {enhanced_solar, enhanced_convection, enhanced_sky,
                           enhanced_air, enhanced_ground, enhanced_doors: bool}
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "thermal-calculator"))

from environment.adapters import resolve_physics_options  # noqa: E402

_GLAZING_PATH = ROOT / "thermal-calculator" / "data" / "glazing_profiles.json"

# operating assumptions applied to every optimizer design so the ranking
# compares the envelope, not the scenario
FIXED_ASSUMPTIONS = {
    "contents": {"mass_kg": 0.0, "specific_heat_J_kgK": 0.0},
    "heat_transfer": {"h_inside_W_m2K": 2.5, "h_outside_W_m2K": 10.0},
    "initial_temperature_C": 15.0,
    "internal_heat_gain_W": 0.0,
    "air_changes_per_hour": 0.7,
}

_REQUIRED = (
    "geometry", "walls", "roof", "floor", "windows", "contents",
    "heat_transfer", "air_changes_per_hour", "ground_temperature_mode",
    "ground_temperature_C", "internal_heat_gain_W", "initial_temperature_C",
)


def load_glazing_db(path=_GLAZING_PATH) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def validate(cfg: dict) -> dict:
    """Raise ValueError if ``cfg`` is not a complete shelter config;
    return it unchanged otherwise."""

    missing = [k for k in _REQUIRED if k not in cfg]
    if missing:
        raise ValueError(f"shelter config missing keys: {missing}")

    for k in ("length_m", "width_m", "height_m"):
        if cfg["geometry"].get(k, 0) <= 0:
            raise ValueError(f"geometry.{k} must be > 0")

    for surface in ("walls", "roof", "floor"):
        if not cfg[surface]:
            raise ValueError(f"{surface} has no layers")
        for lyr in cfg[surface]:
            if "material" not in lyr or lyr.get("thickness_mm", 0) <= 0:
                raise ValueError(f"bad layer in {surface}: {lyr}")

    for k in ("area_m2", "U_W_m2K", "SHGC"):
        if k not in cfg["windows"]:
            raise ValueError(f"windows.{k} missing")

    if cfg["ground_temperature_mode"] not in ("manual", "annual_mean"):
        raise ValueError("ground_temperature_mode must be "
                         "'manual' or 'annual_mean'")

    # optional physics switch: validated only, never inserted, so a config
    # without it stays byte-identical
    resolve_physics_options(cfg)
    return cfg


def _glazing(glazing_db: dict, key: str) -> dict:
    return (glazing_db.get(str(key).lower())
            or glazing_db.get("double")
            or {"U_W_m2K": 2.8, "SHGC": 0.70})


def from_design(design: dict, glazing_db: dict | None = None,
                ground_mode: str = "manual", ground_C: float = 0.0,
                overrides: dict | None = None) -> dict:
    """Build a canonical config from a scenario_generator design dict.

    (This is the former ``design_ranker._config_for``, moved here so the
    ranker, the ANSYS validator and the pipeline all build configs the
    same way.)
    """

    glazing_db = glazing_db or load_glazing_db()
    glz = _glazing(glazing_db, design.get("windows", {}).get("type", "double"))

    cfg = {
        **FIXED_ASSUMPTIONS,
        "geometry": design["geometry"],
        "walls": design["walls"],
        "roof": design["roof"],
        "floor": design["floor"],
        "windows": {
            "area_m2": float(design["windows"]["area_m2"]),
            "U_W_m2K": float(glz["U_W_m2K"]),
            "SHGC": float(glz["SHGC"]),
            "glazing_type": str(design.get("windows", {}).get("type", "double")).lower(),
        },
        "ground_temperature_mode": ground_mode,
        "ground_temperature_C": float(ground_C),
    }
    if overrides:
        cfg.update(overrides)
    return validate(cfg)


def from_shelter_config() -> dict:
    """Wrap the legacy ``config.SHELTER_CONFIG`` into the schema."""
    from config import SHELTER_CONFIG  # noqa: E402

    cfg = dict(SHELTER_CONFIG)
    cfg.pop("solar", None)
    for k, v in FIXED_ASSUMPTIONS.items():
        cfg.setdefault(k, v)
    cfg.setdefault("ground_temperature_mode", "manual")
    cfg.setdefault("ground_temperature_C", 0.0)
    return validate(cfg)


def from_interactive() -> tuple[dict, dict, str, str]:
    """Run the existing main.py prompts. Returns
    ``(config, location, start_date, end_date)``."""
    from user_input import collect_user_configuration, load_json  # noqa: E402

    materials = load_json(str(ROOT / "thermal-calculator" / "data" /
                              "material_properties.json"))
    construction = load_json(str(ROOT / "thermal-calculator" / "data" /
                                 "construction_profiles.json"))
    glazing = load_json(str(_GLAZING_PATH))

    cfg, location, start, end = collect_user_configuration(
        materials, construction, glazing)
    for k, v in FIXED_ASSUMPTIONS.items():
        cfg.setdefault(k, v)
    cfg.setdefault("ground_temperature_mode", "manual")
    cfg.setdefault("ground_temperature_C", 0.0)
    return validate(cfg), location, start, end


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return validate(json.load(fh))


def save(cfg: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)


if __name__ == "__main__":
    c = from_shelter_config()
    print("from_shelter_config() OK:")
    print(json.dumps(c, indent=2))
