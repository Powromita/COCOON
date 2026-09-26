"""
ml/m5_features.py -- the 52 M5 surrogate features from an M0 BuildingModel +
WeatherSnapshot (PRD §11.3), matching data/m5_dataset_v1/features.csv.gz.

The generator that wrote features.csv is not in this repository, so these
definitions were reconstructed and are checked row by row against the
committed table by ml/m5_build_support.py (every one of the 9,401 rows must
match). Keep the two in step: a change here that the check does not pass
means the models are being fed features they were not trained on.

Inputs that the BuildingModel contract does not carry are explicit
arguments: the heating setpoint and the design air-change rate.

Material properties (conductivity, density, volumetric heat capacity, solar
absorptivity) come from the material catalogue in surrogate_support.json;
a material missing from it raises UnknownMaterialError, which the adapter
treats as out of distribution.
"""

import math

import numpy as np

SOIL_RESISTANCE_M2K_W = 1.0 / 1.5      # 1.0 m of soil at k = 1.5 W/mK
OCCUPANT_GAIN_W = 100.0
FRESH_AIR_M3_H_PER_PERSON = 27.0      # 7.5 L/s
ACH_GIVEN = 1.0                        # constant in m5_dataset_v1
WEATHER_WINDOW_HOURS = 168             # 7 days, hourly

FEATURE_NAMES = [
    "n_zones", "n_floors", "n_heated_zones", "airlock_present", "floor_area_m2",
    "footprint_m2", "volume_m3", "heated_floor_area_m2", "occupants", "occupants_per_m2",
    "setpoint_c", "wall_area_m2", "roof_area_m2", "ground_floor_area_m2", "internal_area_m2",
    "window_area_m2", "outdoor_door_area_m2", "wwr", "window_area_north_m2",
    "window_area_east_m2", "window_area_south_m2", "window_area_west_m2", "u_wall", "u_roof",
    "u_ground", "u_window", "r_layers_wall", "r_layers_roof", "shgc_x_shading",
    "ua_outdoor_w_k", "ua_ground_w_k", "ua_total_w_k", "ua_per_volume", "ua_per_floor_area",
    "solar_absorptivity_outer", "mass_per_floor_area_kg_m2",
    "heat_capacity_per_floor_area_kj_m2k", "ach_design", "ach_given", "fresh_air_ach",
    "ach_effective", "door_open_fraction_x_area", "internal_gain_w_per_m2", "t_mean_c",
    "t_min_c", "t_std_c", "degree_hours_below_setpoint", "delta_t_mean_k", "ghi_mean_w_m2",
    "wind_mean_m_s", "latitude_deg", "elevation_m",
]


class UnknownMaterialError(KeyError):
    pass


def as_dict(obj) -> dict:
    """Accept a pydantic M0 contract object or its JSON dict."""
    return obj.model_dump(mode="json") if hasattr(obj, "model_dump") else obj


def zones(b: dict) -> list:
    return [z for f in b["floors"] for z in f["zones"]]


def layout_signature(b: dict) -> str:
    """Zone types per floor, bottom up; '*' marks a heated zone.
    e.g. 'airlock,living*|sleeping*'."""
    floors = sorted(b["floors"], key=lambda f: f["level"])
    return "|".join(",".join(sorted(z["type"] + ("*" if z.get("hvac_id") else "")
                                    for z in f["zones"])) for f in floors)


def material_ids(b: dict) -> set:
    return {L["material_id"] for a in b["assemblies"].values() for L in a["layers"]}


def _cardinal(azimuth_deg: float) -> str:
    az = azimuth_deg % 360
    if az >= 315 or az < 45:
        return "north"
    return "east" if az < 135 else "south" if az < 225 else "west"


def _mat(catalogue: dict, mid: str) -> dict:
    try:
        return catalogue[mid]
    except KeyError:
        raise UnknownMaterialError(mid) from None


def building_features(b: dict, catalogue: dict, setpoint_c: float,
                      air_changes_per_hour: float) -> dict:
    zs = zones(b)
    area = lambda z: z["size_m"]["length_m"] * z["size_m"]["width_m"]
    asm = b["assemblies"]
    by_id = {s["id"]: s for s in b["surfaces"]}
    ops = b["openings"]
    opening_area = {}
    for o in ops:
        opening_area[o["parent_surface_id"]] = opening_area.get(o["parent_surface_id"], 0.0) + o["area_m2"]
    net = lambda s: s["area_m2"] - opening_area.get(s["id"], 0.0)

    def r_layers(a):
        return sum(L["thickness_mm"] / 1000 / _mat(catalogue, L["material_id"])["k_w_mk"]
                   for L in a["layers"])

    def u(a):
        return 1 / (a["r_inside_film_m2k_w"] + r_layers(a) + a["r_outside_film_m2k_w"])

    def u_ground(a):
        return 1 / (a["r_inside_film_m2k_w"] + r_layers(a) + SOIL_RESISTANCE_M2K_W)

    def per_area(a, key):
        return sum(L["thickness_mm"] / 1000 * _mat(catalogue, L["material_id"])[key]
                   for L in a["layers"])

    def wmean(items, f, w):
        tot = sum(w(i) for i in items)
        return sum(f(i) * w(i) for i in items) / tot if tot else 0.0

    walls = [s for s in b["surfaces"] if s["surface_type"] == "exterior_wall"
             and s["boundary_type"] == "outdoors"]
    roofs = [s for s in b["surfaces"] if s["surface_type"] == "roof"
             and s["boundary_type"] == "outdoors"]
    grounds = [s for s in b["surfaces"] if s["boundary_type"] == "ground"]
    inner = [s for s in b["surfaces"] if s["boundary_type"] == "adjacent_zone"]
    wins = [o for o in ops if o["opening_type"] == "window"]
    out_doors = [o for o in ops if o["opening_type"] == "door"
                 and o.get("connected_boundary") == "outdoors"]
    in_doors = [o for o in ops if o["opening_type"] != "window"
                and o.get("connected_boundary") != "outdoors"]
    stairs = [c for c in b.get("connections", []) if c["connection_type"] == "stair"]

    fa = sum(area(z) for z in zs)
    vol = sum(area(z) * z["size_m"]["height_m"] for z in zs)
    heated = [z for z in zs if z.get("hvac_id")]
    ground_floor = min(b["floors"], key=lambda f: f["level"])
    occ = sum(float(np.mean(s["hourly_values"])) for s in b["schedules"].values()
              if s["type"] == "occupancy" and s["hourly_values"])
    equip_w = sum(float(np.mean(s["hourly_values"])) for s in b["schedules"].values()
                  if s["type"] == "equipment" and s["hourly_values"])
    gross_wall = sum(s["area_m2"] for s in walls)
    win_area = sum(o["area_m2"] for o in wins)

    ua_out = (sum(net(s) * u(asm[s["assembly_id"]]) for s in walls + roofs)
              + sum(o["area_m2"] * o["u_value_w_m2k"] for o in wins + out_doors))
    ua_ground = sum(s["area_m2"] * u_ground(asm[s["assembly_id"]]) for s in grounds)

    # thermal mass: every opaque element once (gross area; interzone pairs halved)
    def mass(key):
        tot = sum(s["area_m2"] * per_area(asm[s["assembly_id"]], key)
                  for s in walls + roofs + grounds)
        tot += sum(s["area_m2"] / 2 * per_area(asm[s["assembly_id"]], key) for s in inner)
        return tot / fa

    fresh = occ * FRESH_AIR_M3_H_PER_PERSON / vol
    d = {
        "n_zones": len(zs), "n_floors": len(b["floors"]), "n_heated_zones": len(heated),
        "airlock_present": float(any(z["type"] == "airlock" for z in zs)),
        "floor_area_m2": fa, "footprint_m2": sum(area(z) for z in ground_floor["zones"]),
        "volume_m3": vol, "heated_floor_area_m2": sum(area(z) for z in heated),
        "occupants": occ, "occupants_per_m2": occ / fa, "setpoint_c": float(setpoint_c),
        "wall_area_m2": sum(net(s) for s in walls), "roof_area_m2": sum(net(s) for s in roofs),
        "ground_floor_area_m2": sum(s["area_m2"] for s in grounds),
        "internal_area_m2": (sum(s["area_m2"] for s in inner) / 2
                             - sum(o["area_m2"] for o in in_doors)
                             - sum(c["shared_area_m2"] for c in stairs)),
        "window_area_m2": win_area,
        "outdoor_door_area_m2": sum(o["area_m2"] for o in out_doors),
        "wwr": win_area / gross_wall if gross_wall else 0.0,
    }
    for c in ("north", "east", "south", "west"):
        d[f"window_area_{c}_m2"] = sum(o["area_m2"] for o in wins
                                       if _cardinal(by_id[o["parent_surface_id"]]["azimuth_deg"]) == c)
    d.update({
        "u_wall": wmean(walls, lambda s: u(asm[s["assembly_id"]]), net),
        "u_roof": wmean(roofs, lambda s: u(asm[s["assembly_id"]]), net),
        "u_ground": wmean(grounds, lambda s: u_ground(asm[s["assembly_id"]]), lambda s: s["area_m2"]),
        "u_window": wmean(wins, lambda o: o["u_value_w_m2k"], lambda o: o["area_m2"]),
        "r_layers_wall": wmean(walls, lambda s: r_layers(asm[s["assembly_id"]]), net),
        "r_layers_roof": wmean(roofs, lambda s: r_layers(asm[s["assembly_id"]]), net),
        "shgc_x_shading": wmean(wins, lambda o: o["shgc"] * (1.0 if o.get("shading_factor") is None
                                                            else o["shading_factor"]),
                                lambda o: o["area_m2"]),
        "ua_outdoor_w_k": ua_out, "ua_ground_w_k": ua_ground, "ua_total_w_k": ua_out + ua_ground,
        "ua_per_volume": (ua_out + ua_ground) / vol, "ua_per_floor_area": (ua_out + ua_ground) / fa,
        "solar_absorptivity_outer": wmean(
            walls + roofs,
            lambda s: _mat(catalogue, asm[s["assembly_id"]]["layers"][-1]["material_id"])["solar_absorptivity"],
            net),
        "mass_per_floor_area_kg_m2": mass("density_kg_m3"),
        "heat_capacity_per_floor_area_kj_m2k": mass("heat_capacity_kj_m3k"),
        "ach_design": float(air_changes_per_hour), "ach_given": ACH_GIVEN,
        "fresh_air_ach": fresh, "ach_effective": max(float(air_changes_per_hour), fresh),
        "door_open_fraction_x_area": sum(
            (o.get("open_events_per_hour") or 0) * (o.get("avg_open_duration_s") or 0) / 3600 * o["area_m2"]
            for o in out_doors),
        "internal_gain_w_per_m2": (occ * OCCUPANT_GAIN_W + equip_w) / fa,
    })
    return d


def weather_features(w: dict, setpoint_c: float) -> dict:
    """Over the whole snapshot; the adapter only calls this for a 168 h window."""
    pts = w["hourly_data"]
    t = np.array([p["outdoor_dry_bulb_temperature_c"] for p in pts], dtype=float)
    return {
        "t_mean_c": float(t.mean()), "t_min_c": float(t.min()), "t_std_c": float(t.std()),
        "degree_hours_below_setpoint": float(np.clip(setpoint_c - t, 0, None).sum()),
        "delta_t_mean_k": float(setpoint_c - t.mean()),
        "ghi_mean_w_m2": float(np.mean([p["ghi_w_m2"] for p in pts])),
        "wind_mean_m_s": float(np.mean([p.get("wind_speed_m_s", 0.0) for p in pts])),
        "latitude_deg": float(w["source"]["latitude_deg"]),
        "elevation_m": float(w["source"]["elevation_m"]),
    }


def extract(building, weather, catalogue: dict, setpoint_c: float,
            air_changes_per_hour: float) -> dict:
    b, w = as_dict(building), as_dict(weather)
    d = building_features(b, catalogue, setpoint_c, air_changes_per_hour)
    d.update(weather_features(w, setpoint_c))
    bad = [k for k in FEATURE_NAMES if not math.isfinite(d[k])]
    if bad:
        raise ValueError(f"non-finite features: {bad}")
    return {k: d[k] for k in FEATURE_NAMES}
