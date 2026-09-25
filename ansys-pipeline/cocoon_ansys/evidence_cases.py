"""
evidence_cases.py - The PRD v4 §14.11 evidence set as frozen M0 BuildingModels.

    case_01_baseline_single    uninsulated single-zone stone shelter
    case_02_insulated_single   same geometry, mass-inside PUF envelope
    case_03_airlock_living     M0 fixture building_airlock_living.json, unchanged
    case_04_two_floor          airlock + living on floor 0, sleeping over living
                               on floor 1 (complete surfaces; the M0 two-floor
                               fixture only declares 5 of its surfaces)

Surfaces for cases 1, 2 and 4 are derived from the zone boxes so every
exposed face and every shared face is declared exactly once. Run:

    python -m cocoon_ansys.evidence_cases
"""

import json
import shutil

from cocoon_ansys.contracts_io import BuildingModel, write_json
from cocoon_ansys.geometry_builder import _other_axes, _rect_overlap, _rect_subtract, _area, TOL
from cocoon_ansys.paths import CASES_DIR, contract_fixtures_dir

CREATED = "2026-09-25T10:00:00+05:30"
_AZ = {(0, -1): 270.0, (0, 1): 90.0, (1, -1): 180.0, (1, 1): 0.0}
_DIRNAME = {(0, -1): "west", (0, 1): "east", (1, -1): "south", (1, 1): "north",
            (2, -1): "floor", (2, 1): "roof"}


def _zone(zid, ztype, origin, size, occ=None, eq=None):
    return {"id": zid, "type": ztype,
            "origin_m": dict(zip("xyz", origin)),
            "size_m": dict(zip(("length_m", "width_m", "height_m"), size)),
            "occupancy_schedule_id": occ, "equipment_schedule_id": eq, "hvac_id": None}


def _asm(aid, name, cat, layers, r_in, r_out):
    return {"id": aid, "name": name, "category": cat,
            "layers": [{"material_id": m, "thickness_mm": t} for m, t in layers],
            "r_inside_film_m2k_w": r_in, "r_outside_film_m2k_w": r_out,
            "u_value_w_m2k": None}


def _schedule(sid, name, kind, values, unit):
    return {"id": sid, "name": name, "type": kind, "points": [],
            "hourly_values": [float(v) for v in values], "unit": unit}


def derive_surfaces(zones, asm_for):
    """Exterior surface per exposed face, one adjacent_zone surface per
    shared face (declared from the low-coordinate side)."""
    boxes = {}
    for z in zones:
        lo = [z["origin_m"][c] for c in "xyz"]
        sz = [z["size_m"][k] for k in ("length_m", "width_m", "height_m")]
        boxes[z["id"]] = (lo, [lo[d] + sz[d] for d in range(3)])
    out = []
    for zid, (lo, hi) in boxes.items():
        for axis in range(3):
            u, v = _other_axes(axis)
            for sign in (-1, 1):
                plane = hi[axis] if sign > 0 else lo[axis]
                rect = (lo[u], hi[u], lo[v], hi[v])
                holes = []
                for oid, (olo, ohi) in boxes.items():
                    if oid == zid:
                        continue
                    if abs((olo[axis] if sign > 0 else ohi[axis]) - plane) > TOL:
                        continue
                    ov = _rect_overlap(rect, (olo[u], ohi[u], olo[v], ohi[v]))
                    if ov:
                        holes.append(ov)
                        if sign > 0:
                            kind = "partition" if axis < 2 else "ceiling"
                            out.append({
                                "id": f"surf_{zid}_{oid}_{kind}", "owning_zone_id": zid,
                                "boundary_type": "adjacent_zone",
                                "surface_type": kind, "area_m2": round(_area(ov), 4),
                                "azimuth_deg": _AZ.get((axis, sign), 0.0),
                                "tilt_deg": 90.0 if axis < 2 else 0.0,
                                "assembly_id": asm_for[kind], "adjacent_zone_id": oid,
                                "adjacent_surface_id": None, "exposed_fraction": 0.0,
                                "vertices": None})
                area = sum(_area(p) for p in _rect_subtract(rect, holes))
                if area <= TOL:
                    continue
                name = _DIRNAME[(axis, sign)]
                if axis < 2:
                    stype, btype, tilt = "exterior_wall", "outdoors", 90.0
                elif sign > 0:
                    stype, btype, tilt = "roof", "outdoors", 0.0
                else:
                    stype, btype, tilt = "floor", "ground", 180.0
                out.append({
                    "id": f"surf_{zid}_{name}", "owning_zone_id": zid,
                    "boundary_type": btype, "surface_type": stype,
                    "area_m2": round(area, 4), "azimuth_deg": _AZ.get((axis, sign), 0.0),
                    "tilt_deg": tilt, "assembly_id": asm_for[stype],
                    "adjacent_zone_id": None, "adjacent_surface_id": None,
                    "exposed_fraction": 1.0, "vertices": None})
    return out


def _opening(oid, parent, kind, area, u, shgc=None, boundary=None):
    return {"id": oid, "parent_surface_id": parent, "opening_type": kind,
            "area_m2": area, "u_value_w_m2k": u, "shgc": shgc,
            "glazing_id": None, "frame_fraction": None,
            "shading_factor": 1.0 if kind == "window" else None,
            "is_operable": kind == "door", "connected_boundary": boundary,
            "open_events_per_hour": None, "avg_open_duration_s": None,
            "discharge_coefficient": None}


def _building(design_id, rev, floors, assemblies, asm_for, openings, schedules,
              connections, seed):
    zones = [z for f in floors for z in f["zones"]]
    body = {
        "schema_version": "4.0", "design_id": design_id, "revision_id": rev,
        "source": "benchmark", "orientation_deg": 180.0, "floors": floors,
        "surfaces": derive_surfaces(zones, asm_for), "openings": openings,
        "connections": connections, "assemblies": assemblies, "schedules": schedules,
        "metadata": {"generator_version": "m8_evidence_cases_v1", "seed": seed,
                     "created_at": CREATED},
    }
    return BuildingModel.model_validate(body)


def _single_zone(design_id, rev, wall, roof, floor, win_u, win_shgc, door_u, seed):
    assemblies = {a["id"]: a for a in (wall, roof, floor)}
    asm_for = {"exterior_wall": wall["id"], "roof": roof["id"], "floor": floor["id"]}
    schedules = {
        "occ_4": _schedule("occ_4", "4 occupants continuous", "occupancy", [4] * 24, "occupants"),
        "eq_100": _schedule("eq_100", "Radio + lighting", "equipment", [100] * 24, "watts"),
    }
    floors = [{"id": "floor_0", "level": 0, "elevation_m": 0.0,
               "zones": [_zone("room", "living", (0, 0, 0), (6.0, 4.0, 2.8), "occ_4", "eq_100")]}]
    openings = [
        _opening("op_room_south_window", "surf_room_south", "window", 2.4, win_u, win_shgc),
        _opening("op_room_south_door", "surf_room_south", "door", 1.8, door_u,
                 boundary="outdoors"),
    ]
    return _building(design_id, rev, floors, assemblies, asm_for, openings, schedules, [], seed)


def case_01():
    return _single_zone(
        "des_ev01_baseline_single", "rev_ev01_r1",
        _asm("asm_wall_stone300", "Uninsulated stone masonry 300", "wall",
             [("mat_stone", 300.0)], 0.13, 0.04),
        _asm("asm_roof_concrete150", "Uninsulated concrete roof 150", "roof",
             [("mat_concrete", 150.0)], 0.10, 0.04),
        _asm("asm_floor_concrete150", "Concrete slab on ground 150", "floor",
             [("mat_concrete", 150.0)], 0.17, 0.04),
        win_u=2.8, win_shgc=0.70, door_u=3.0, seed=1)


def case_02():
    return _single_zone(
        "des_ev02_insulated_single", "rev_ev02_r1",
        _asm("asm_wall_stone200_puf80", "Stone 200 inside, PUF 80 outside", "wall",
             [("mat_stone", 200.0), ("mat_puf", 80.0)], 0.13, 0.04),
        _asm("asm_roof_concrete150_puf100", "Concrete 150 inside, PUF 100 outside", "roof",
             [("mat_concrete", 150.0), ("mat_puf", 100.0)], 0.10, 0.04),
        _asm("asm_floor_concrete150_puf50", "Concrete 150 on PUF 50", "floor",
             [("mat_concrete", 150.0), ("mat_puf", 50.0)], 0.17, 0.04),
        win_u=1.8, win_shgc=0.62, door_u=1.5, seed=2)


def case_04():
    wall = _asm("asm_wall_stone150_puf60", "Stone 150 inside, PUF 60 outside", "wall",
                [("mat_stone", 150.0), ("mat_puf", 60.0)], 0.13, 0.04)
    roof = _asm("asm_roof_ply25_puf100", "Plywood 25 inside, PUF 100 outside", "roof",
                [("mat_plywood", 25.0), ("mat_puf", 100.0)], 0.10, 0.04)
    floor = _asm("asm_floor_concrete150_puf50", "Concrete 150 on PUF 50", "floor",
                 [("mat_concrete", 150.0), ("mat_puf", 50.0)], 0.17, 0.04)
    part = _asm("asm_partition_ply_puf_ply", "Plywood/PUF/plywood partition", "partition",
                [("mat_plywood", 12.0), ("mat_puf", 50.0), ("mat_plywood", 12.0)], 0.13, 0.13)
    slab = _asm("asm_interfloor_concrete100_ply25", "Concrete 100 slab, plywood 25 deck",
                "ceiling", [("mat_concrete", 100.0), ("mat_plywood", 25.0)], 0.10, 0.17)
    assemblies = {a["id"]: a for a in (wall, roof, floor, part, slab)}
    asm_for = {"exterior_wall": wall["id"], "roof": roof["id"], "floor": floor["id"],
               "partition": part["id"], "ceiling": slab["id"]}
    day = [2] * 7 + [8] * 15 + [2] * 2          # hours 0-6, 7-21, 22-23
    night = [8] * 7 + [0] * 15 + [8] * 2
    schedules = {
        "occ_living": _schedule("occ_living", "Living: 8 by day, 2 at night", "occupancy", day, "occupants"),
        "occ_sleeping": _schedule("occ_sleeping", "Sleeping: 8 at night", "occupancy", night, "occupants"),
        "eq_living": _schedule("eq_living", "Radio, lighting, charging", "equipment",
                               [100] * 7 + [250] * 15 + [100] * 2, "watts"),
    }
    floors = [
        {"id": "floor_0", "level": 0, "elevation_m": 0.0, "zones": [
            _zone("airlock_f0", "airlock", (0.0, 0.0, 0.0), (1.2, 4.0, 2.8)),
            _zone("living_f0", "living", (1.2, 0.0, 0.0), (4.8, 4.0, 2.8), "occ_living", "eq_living"),
        ]},
        {"id": "floor_1", "level": 1, "elevation_m": 2.8, "zones": [
            _zone("sleeping_f1", "sleeping", (1.2, 0.0, 2.8), (4.8, 4.0, 2.8), "occ_sleeping"),
        ]},
    ]
    openings = [
        _opening("op_airlock_entry_door", "surf_airlock_f0_south", "door", 1.8, 2.2,
                 boundary="outdoors"),
        _opening("op_airlock_living_door", "surf_airlock_f0_living_f0_partition", "door",
                 1.8, 2.2, boundary="living_f0"),
        _opening("op_living_south_window", "surf_living_f0_south", "window", 2.4, 1.8, 0.62),
        _opening("op_sleeping_south_window", "surf_sleeping_f1_south", "window", 1.8, 1.8, 0.62),
        _opening("op_sleeping_east_window", "surf_sleeping_f1_east", "window", 1.0, 1.8, 0.62),
    ]
    connections = [
        {"id": "conn_airlock_living", "zone_a_id": "airlock_f0", "zone_b_id": "living_f0",
         "connection_type": "partition", "shared_area_m2": 11.2, "is_conditioned": True},
        {"id": "conn_living_sleeping_slab", "zone_a_id": "living_f0", "zone_b_id": "sleeping_f1",
         "connection_type": "partition", "shared_area_m2": 19.2, "is_conditioned": True},
    ]
    return _building("des_ev04_two_floor", "rev_ev04_r1", floors, assemblies, asm_for,
                     openings, schedules, connections, seed=4)


def build_all():
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    written = {}
    for name, fn in (("case_01_baseline_single", case_01),
                     ("case_02_insulated_single", case_02),
                     ("case_04_two_floor", case_04)):
        path = CASES_DIR / f"{name}.json"
        write_json(path, fn())
        written[name] = path
    src = contract_fixtures_dir() / "valid" / "building_airlock_living.json"
    dst = CASES_DIR / "case_03_airlock_living.json"
    BuildingModel.model_validate(json.loads(src.read_text(encoding="utf-8")))
    shutil.copyfile(src, dst)
    written["case_03_airlock_living"] = dst
    src_mat = contract_fixtures_dir() / "valid" / "material_snapshot_standard.json"
    shutil.copyfile(src_mat, CASES_DIR / "materials_m0_standard.json")
    return written


if __name__ == "__main__":
    for name, path in build_all().items():
        b = BuildingModel.model_validate_json(path.read_text(encoding="utf-8"))
        nz = sum(len(f.zones) for f in b.floors)
        print(f"{name:28s} floors={len(b.floors)} zones={nz} surfaces={len(b.surfaces)} "
              f"openings={len(b.openings)}")
