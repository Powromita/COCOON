"""
geometry_builder_multiroom.py

Extends build_shelter() (geometry_builder.py) to support multiple thermally
distinct rooms (e.g. airlock + living room) within a single ANSYS model.

Key design decisions that mirror the original module:
  - Every room air volume is a separate mapdl.block() with a UNIQUE material
    number.  Temperature extraction filters by MAT, so each room T can be
    read independently.
  - Partition walls between adjacent rooms are plain BLOCK volumes (same
    _build_stack() helper).  NUMMRG merges their coincident interface nodes -
    no VGLUE, no slivers.
  - Exterior envelope stacks are built per-room (each room is fully wrapped).
    Walls that coincide with a partition boundary are omitted for that face so
    no double-wall is created on an internal interface.
  - Windows (conductive glazing cut-out) are applied to one designated room
    only (keyword arg window_room).
  - The return dict contains "air_mats" (room_name -> mat_num) that
    pyansys_runner.py extraction loop consumes directly.

Public API
----------
build_shelter_multiroom(mapdl, config, materials_db, rooms,
                        window_room=None, element_size_m=0.20,
                        partition_thickness_m=0.10)
"""

from __future__ import annotations

from geometry_builder import (
    INSIDE_FILM_THICKNESS_M,
    WINDOW_ELEMENT_SIZE_M,
    WINDOW_GLAZING_DENSITY_KG_M3,
    WINDOW_GLAZING_SPECIFIC_HEAT_J_KGK,
    AIR_CONDUCTIVITY_W_mK,
    AIR_DENSITY_KG_M3,
    AIR_SPECIFIC_HEAT_J_KGK,
    DEFAULT_ELEMENT_SIZE_M,
    _build_stack,
    _layers_inner_to_outer,
    _assign_materials,
    _window_spec,
)
from partition_geometry import (
    UnsupportedPartitionGeometryError,
    plan_partition_geometry,
)

_FACE_TOL = 1e-6


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _bounds_value(bounds, bound_key):
    return float(bounds[bound_key])


def _shared_face(bounds_a, bounds_b, partition_thickness):
    """Detect whether two rooms share a planar face.

    Returns a descriptor dict or None:
        {axis, coord, span_ax1, span_ax2, ax1, ax2}
    """
    axes_info = {
        "x": ("y", "z"),
        "y": ("x", "z"),
        "z": ("x", "y"),
    }

    for primary_axis, (sec_axis, ter_axis) in axes_info.items():
        a_max = _bounds_value(bounds_a, f"{primary_axis}_max")
        b_min = _bounds_value(bounds_b, f"{primary_axis}_min")
        a_min = _bounds_value(bounds_a, f"{primary_axis}_min")
        b_max = _bounds_value(bounds_b, f"{primary_axis}_max")

        # Check A.max == B.min  OR  B.max == A.min
        for shared_coord, left_bounds, right_bounds in [
            (a_max, bounds_a, bounds_b),
            (b_max, bounds_b, bounds_a),
        ]:
            right_min_key = f"{primary_axis}_min"
            right_coord = _bounds_value(right_bounds, right_min_key)
            if abs(shared_coord - right_coord) >= _FACE_TOL:
                continue

            # Overlap on the other two axes
            other_lo1 = max(
                _bounds_value(bounds_a, f"{sec_axis}_min"),
                _bounds_value(bounds_b, f"{sec_axis}_min"),
            )
            other_hi1 = min(
                _bounds_value(bounds_a, f"{sec_axis}_max"),
                _bounds_value(bounds_b, f"{sec_axis}_max"),
            )
            other_lo2 = max(
                _bounds_value(bounds_a, f"{ter_axis}_min"),
                _bounds_value(bounds_b, f"{ter_axis}_min"),
            )
            other_hi2 = min(
                _bounds_value(bounds_a, f"{ter_axis}_max"),
                _bounds_value(bounds_b, f"{ter_axis}_max"),
            )

            if (
                other_hi1 - other_lo1 > _FACE_TOL
                and other_hi2 - other_lo2 > _FACE_TOL
            ):
                return {
                    "axis": primary_axis,
                    "coord": shared_coord,
                    "span_ax1": (other_lo1, other_hi1),
                    "span_ax2": (other_lo2, other_hi2),
                    "ax1": sec_axis,
                    "ax2": ter_axis,
                }

    return None


def _detect_all_shared_faces(rooms, partition_thickness):
    """Return list of shared-face descriptors for every adjacent room pair."""
    shared = []
    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            face = _shared_face(
                rooms[i]["bounds"],
                rooms[j]["bounds"],
                partition_thickness,
            )
            if face is not None:
                shared.append({
                    "room_a": rooms[i]["name"],
                    "room_b": rooms[j]["name"],
                    "face": face,
                })
    return shared


def _is_partition_face(room_name, face_axis, face_coord, shared_faces):
    """Return True if this room face is a shared partition interface."""
    for sf in shared_faces:
        if room_name not in (sf["room_a"], sf["room_b"]):
            continue
        fd = sf["face"]
        if fd["axis"] == face_axis and abs(fd["coord"] - face_coord) < _FACE_TOL:
            return True
    return False


def _register_per_room_air_mats(mapdl, rooms, base_mat_num):
    """Register a unique ANSYS material for each room air volume."""
    air_mats = {}
    for offset, room in enumerate(rooms):
        mat_num = base_mat_num + offset
        mapdl.mp("KXX",  mat_num, AIR_CONDUCTIVITY_W_mK)
        mapdl.mp("DENS", mat_num, AIR_DENSITY_KG_M3)
        mapdl.mp("C",    mat_num, AIR_SPECIFIC_HEAT_J_KGK)
        air_mats[room["name"]] = mat_num
    return air_mats




def _window_spec_for_room(config, room, t_wall):
    """Compute window spec for a specific room (uses room L and H)."""
    b = room["bounds"]
    L_room = b["x_max"] - b["x_min"]
    H_room = b["z_max"] - b["z_min"]
    return _window_spec(config, L_room, H_room, t_wall)


def _build_south_wall_with_window_offset(
    mapdl, layers, win, y_inner, x_offset, z_offset, L, H
):
    """
    Offset-aware version of _build_south_wall_with_window() for rooms that
    do not start at x=0 or z=0.

    win["x0/x1/z0/z1/fx0/fx1/fz0/fz1"] must already be shifted by
    (x_offset, z_offset) before calling this function.

    Parameters
    ----------
    layers : list[dict]  inner->outer layers (index 0 = inside film)
    win    : dict        window spec (already offset to absolute coords)
    y_inner: float       y-coordinate of room south interior face
    x_offset, z_offset: float  room origin offsets
    L, H  : float        room interior length (x) and height (z)
    """
    xlo = x_offset
    xhi = x_offset + L
    zlo = z_offset
    zhi = z_offset + H
    fx0, fx1 = win["fx0"], win["fx1"]
    fz0, fz1 = win["fz0"], win["fz1"]

    frame_rects = (
        ((xlo, xhi), (zlo, fz0)),       # below opening
        ((xlo, xhi), (fz1, zhi)),       # above opening
        ((xlo, fx0), (fz0, fz1)),       # left jamb
        ((fx1, xhi), (fz0, fz1)),       # right jamb
    )

    cur_y = y_inner
    for lyr in layers:
        nxt_y = cur_y - lyr["t"]
        for (xa, xb), (za, zb) in frame_rects:
            if xb - xa <= 1e-9 or zb - za <= 1e-9:
                continue
            v = mapdl.block(xa, xb, nxt_y, cur_y, za, zb)
            mapdl.vsel("S", "VOLU", "", v)
            mapdl.vatt(lyr["mat"])
        cur_y = nxt_y

    # Glazing fill
    t_wall = sum(l["t"] for l in layers)
    win_stack = (
        (INSIDE_FILM_THICKNESS_M, win["win_film_mat"]),
        (t_wall - INSIDE_FILM_THICKNESS_M, win["glazing_mat"]),
    )
    cur_y = y_inner
    for thickness, mat in win_stack:
        nxt_y = cur_y - thickness
        v = mapdl.block(win["x0"], win["x1"], nxt_y, cur_y, win["z0"], win["z1"])
        mapdl.vsel("S", "VOLU", "", v)
        mapdl.vatt(mat)
        cur_y = nxt_y


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def build_shelter_multiroom(
    mapdl,
    config,
    materials_db,
    rooms,
    window_room=None,
    element_size_m=DEFAULT_ELEMENT_SIZE_M,
    partition_thickness_m=0.10,
    partition_spec=None,
):
    """
    Build a multi-room shelter geometry in PyMAPDL.

    Parameters
    ----------
    mapdl : ansys.mapdl.core.Mapdl
        Active session, already in PREP7.
    config : dict
        Thermal config dict (walls/roof/floor layers, heat_transfer,
        windows, geometry). Same schema as single-room build_shelter().
    materials_db : dict
        material_id -> {"thermal_conductivity", "density", "specific_heat"}.
    rooms : list[dict]
        [{"name": str,
          "bounds": {"x_min","x_max","y_min","y_max","z_min","z_max"}}, ...]
        Adjacent rooms (sharing a face) automatically get a partition wall.
    window_room : str or None
        Name of the room whose south wall gets the glazing cut-out.
        None -> no window.
    element_size_m : float
        Mesh element edge length (mapped hex).
    partition_thickness_m : float
        Deprecated / unused. Kept for backwards signature compatibility.
    partition_spec : dict or None
        Optional M0 partition assembly specification containing 'assembly_id',
        'total_thickness_m', 'layers_inner_to_outer', and 'interfaces'.
        Required when multiple rooms share a partition face (can also be passed in
        config['partition']). If omitted for touching rooms, a ValueError is raised.

    Returns
    -------
    dict
        {
            "air_mats":       {room_name: int, ...},
            "partition_mats": {"<A>_to_<B>": list[int], ...},
            "envelope_mats":  {"mat_map": dict, "film_mat": int},
            "faces": {
                "x_min_global", "x_max_global",
                "y_min_global", "y_max_global",
                "z_min_global", "z_max_global",
            },
            "ext_area_m2": float,
            "partition_blocks": list[dict], # when partition_spec is active
        }

    Algorithm
    ---------
    1. Detect shared faces between rooms. If touching rooms lack partition_spec,
       raise ValueError before creating or meshing ANSYS geometry.
    2. If partition_spec provided, plan non-overlapping air_rooms and partition_blocks.
       Validate all partition materials exist in materials_db before block creation.
    3. Register solid-wall / film materials via _assign_materials().
    4. Register any partition layer materials not in walls/roof/floor, reusing material
       numbers for repeated layers.
    5. Register one unique air material per room.
    6. Create air BLOCKs using air_rooms (shortened at partition boundaries).
    7. Build partition BLOCKs for each discrete non-overlapping partition layer.
    8. For each room, build exterior envelope stacks (wall/roof/floor) on
       every face that is NOT a shared partition face, using ORIGINAL room bounds
       so that exterior envelopes have zero gaps.
       South face of window_room gets _build_south_wall_with_window_offset().
    9. vmesh("ALL") + NUMMRG to merge interface nodes.
    10. Compute exterior envelope area; return info dict.

    Independence rule (physics architecture doc section 9): this function
    never reads the physics engine predicted indoor temperature.
    """

    if not rooms:
        raise ValueError("rooms must not be empty.")

    shared_faces = _detect_all_shared_faces(rooms, partition_thickness_m)

    if partition_spec is None:
        partition_spec = config.get("partition")

    if shared_faces and partition_spec is None:
        raise ValueError(
            "Multi-room geometry requires a partition_spec so non-overlapping partition layers can be created."
        )

    planned_partition = None
    if partition_spec is not None:
        planned_partition = plan_partition_geometry(rooms, partition_spec)
        air_rooms = planned_partition["air_rooms"]
        # Confirm every partition layer material exists in materials_db upfront
        for blk in planned_partition["partition_blocks"]:
            mat_id = blk["material"]
            if mat_id not in materials_db:
                raise KeyError(
                    f"Material '{mat_id}' required by partition layer is missing from materials_db."
                )
    else:
        air_rooms = rooms

    mapdl.et(1, "SOLID70")
    h_inside = config["heat_transfer"]["h_inside_W_m2K"]

    # ------------------------------------------------------------------
    # 1. Register solid-wall materials + shared inside-film material
    # ------------------------------------------------------------------
    mat_map   = _assign_materials(mapdl, config, materials_db, h_inside)
    film_mat  = mat_map["__film__"]
    wall_layers  = _layers_inner_to_outer(config["walls"],  mat_map, film_mat)
    roof_layers  = _layers_inner_to_outer(config["roof"],   mat_map, film_mat)
    floor_layers = _layers_inner_to_outer(config["floor"],  mat_map, film_mat)
    t_wall  = sum(l["t"] for l in wall_layers)
    t_roof  = sum(l["t"] for l in roof_layers)
    t_floor = sum(l["t"] for l in floor_layers)

    # ------------------------------------------------------------------
    # 1b. Register partition layer materials not already present in walls/roof/floor
    # ------------------------------------------------------------------
    if planned_partition is not None:
        for blk in planned_partition["partition_blocks"]:
            mat_id = blk["material"]
            if mat_id not in mat_map:
                mat_num = max(mat_map.values()) + 1
                p = materials_db[mat_id]
                mapdl.mp("KXX",  mat_num, p["thermal_conductivity"])
                mapdl.mp("DENS", mat_num, p["density"])
                mapdl.mp("C",    mat_num, p["specific_heat"])
                mat_map[mat_id] = mat_num

    # ------------------------------------------------------------------
    # Window spec (computed once for window_room if applicable)
    # ------------------------------------------------------------------
    win_global = None
    if window_room is not None:
        win_room_obj = next((r for r in rooms if r["name"] == window_room), None)
        if win_room_obj is not None:
            win_global = _window_spec_for_room(config, win_room_obj, t_wall)

    if win_global is not None:
        esize = WINDOW_ELEMENT_SIZE_M
        glazing_mat = max(mat_map.values()) + 1
        mapdl.mp("KXX",  glazing_mat, win_global["k_glazing"])
        mapdl.mp("DENS", glazing_mat, WINDOW_GLAZING_DENSITY_KG_M3)
        mapdl.mp("C",    glazing_mat, WINDOW_GLAZING_SPECIFIC_HEAT_J_KGK)
        mat_map["__glazing__"] = glazing_mat
        win_global["glazing_mat"] = glazing_mat

        win_film_mat = glazing_mat + 1
        mapdl.mp("KXX",  win_film_mat, win_global["k_win_film"])
        mapdl.mp("DENS", win_film_mat, AIR_DENSITY_KG_M3)
        mapdl.mp("C",    win_film_mat, AIR_SPECIFIC_HEAT_J_KGK)
        mat_map["__win_film__"] = win_film_mat
        win_global["win_film_mat"] = win_film_mat
    else:
        esize = element_size_m

    # ------------------------------------------------------------------
    # 2. Register unique air material per room
    # ------------------------------------------------------------------
    base_air_mat = max(mat_map.values()) + 1
    air_mats = _register_per_room_air_mats(mapdl, rooms, base_air_mat)
    for rname, mnum in air_mats.items():
        mat_map[f"__air_{rname}__"] = mnum

    # ------------------------------------------------------------------
    # 3. Air BLOCK volumes (one per room, using air_rooms)
    # ------------------------------------------------------------------
    for room in air_rooms:
        b = room["bounds"]
        v = mapdl.block(
            b["x_min"], b["x_max"],
            b["y_min"], b["y_max"],
            b["z_min"], b["z_max"],
        )
        mapdl.vsel("S", "VOLU", "", v)
        mapdl.vatt(air_mats[room["name"]])

    # ------------------------------------------------------------------
    # 4. Build partition BLOCKs from planned partition layers
    # ------------------------------------------------------------------
    partition_mats = {}
    if planned_partition is not None and planned_partition["partition_blocks"]:
        # Layered partition blocks from planner: discrete non-overlapping layers
        for blk in planned_partition["partition_blocks"]:
            mat_id = blk["material"]
            mat_num = mat_map[mat_id]

            bb = blk["bounds"]
            v = mapdl.block(
                bb["x_min"], bb["x_max"],
                bb["y_min"], bb["y_max"],
                bb["z_min"], bb["z_max"],
            )
            mapdl.vsel("S", "VOLU", "", v)
            mapdl.vatt(mat_num)

            key = f"{blk['owning_zone_id']}_to_{blk['adjacent_zone_id']}"
            if key not in partition_mats:
                partition_mats[key] = []
            partition_mats[key].append(mat_num)

    # ------------------------------------------------------------------
    # 5. Exterior envelope stacks per room
    #    Skip any face that is a partition boundary with a neighbour.
    # ------------------------------------------------------------------
    x_mins_all, x_maxs_all = [], []
    y_mins_all, y_maxs_all = [], []
    z_mins_all, z_maxs_all = [], []

    for room in rooms:
        b    = room["bounds"]
        xlo  = b["x_min"];  xhi = b["x_max"]
        ylo  = b["y_min"];  yhi = b["y_max"]
        zlo  = b["z_min"];  zhi = b["z_max"]
        L_r  = xhi - xlo
        H_r  = zhi - zlo
        is_win_room = (room["name"] == window_room and win_global is not None)

        # WEST (x_min, grows -x)
        if not _is_partition_face(room["name"], "x", xlo, shared_faces):
            _, xow = _build_stack(mapdl, wall_layers,
                                  axis="x", inner_coord=xlo, direction=-1,
                                  span={"y": (ylo, yhi), "z": (zlo, zhi)})
            x_mins_all.append(xow)
        else:
            x_mins_all.append(xlo)

        # EAST (x_max, grows +x)
        if not _is_partition_face(room["name"], "x", xhi, shared_faces):
            _, xoe = _build_stack(mapdl, wall_layers,
                                  axis="x", inner_coord=xhi, direction=+1,
                                  span={"y": (ylo, yhi), "z": (zlo, zhi)})
            x_maxs_all.append(xoe)
        else:
            x_maxs_all.append(xhi)

        # SOUTH (y_min, grows -y)
        if not _is_partition_face(room["name"], "y", ylo, shared_faces):
            if is_win_room:
                # Offset the pre-computed window spec to this room's abs coords
                win_abs = dict(win_global)
                for k in ("x0", "x1", "fx0", "fx1"):
                    win_abs[k] = win_global[k] + xlo
                for k in ("z0", "z1", "fz0", "fz1"):
                    win_abs[k] = win_global[k] + zlo
                _build_south_wall_with_window_offset(
                    mapdl, wall_layers, win_abs,
                    y_inner=ylo, x_offset=xlo, z_offset=zlo,
                    L=L_r, H=H_r,
                )
                y_outer_s = ylo - t_wall
            else:
                _, y_outer_s = _build_stack(mapdl, wall_layers,
                                            axis="y", inner_coord=ylo, direction=-1,
                                            span={"x": (xlo, xhi), "z": (zlo, zhi)})
            y_mins_all.append(y_outer_s)
        else:
            y_mins_all.append(ylo)

        # NORTH (y_max, grows +y)
        if not _is_partition_face(room["name"], "y", yhi, shared_faces):
            _, y_outer_n = _build_stack(mapdl, wall_layers,
                                        axis="y", inner_coord=yhi, direction=+1,
                                        span={"x": (xlo, xhi), "z": (zlo, zhi)})
            y_maxs_all.append(y_outer_n)
        else:
            y_maxs_all.append(yhi)

        # FLOOR (z_min, grows -z)
        if not _is_partition_face(room["name"], "z", zlo, shared_faces):
            _, z_outer_f = _build_stack(mapdl, floor_layers,
                                        axis="z", inner_coord=zlo, direction=-1,
                                        span={"x": (xlo, xhi), "y": (ylo, yhi)})
            z_mins_all.append(z_outer_f)
        else:
            z_mins_all.append(zlo)

        # ROOF (z_max, grows +z)
        if not _is_partition_face(room["name"], "z", zhi, shared_faces):
            _, z_outer_r = _build_stack(mapdl, roof_layers,
                                        axis="z", inner_coord=zhi, direction=+1,
                                        span={"x": (xlo, xhi), "y": (ylo, yhi)})
            z_maxs_all.append(z_outer_r)
        else:
            z_maxs_all.append(zhi)

    # ------------------------------------------------------------------
    # 6. Mesh + merge coincident interface nodes
    # ------------------------------------------------------------------
    mapdl.allsel()
    mapdl.esize(esize)
    mapdl.mshkey(1)
    mapdl.mshape(0, "3d")
    mapdl.vmesh("ALL")
    mapdl.nummrg("NODE")
    mapdl.nummrg("KP")

    # ------------------------------------------------------------------
    # 7. Exterior envelope area
    # ------------------------------------------------------------------
    x_min_g = min(x_mins_all)
    x_max_g = max(x_maxs_all)
    y_min_g = min(y_mins_all)
    y_max_g = max(y_maxs_all)
    z_min_g = min(z_mins_all)
    z_max_g = max(z_maxs_all)

    mapdl.allsel()
    mapdl.asel("S", "LOC", "X", x_min_g)
    mapdl.asel("A", "LOC", "X", x_max_g)
    mapdl.asel("A", "LOC", "Y", y_min_g)
    mapdl.asel("A", "LOC", "Y", y_max_g)
    mapdl.asel("A", "LOC", "Z", z_max_g)   # roof only (exclude floor underside)
    mapdl.asum()
    ext_area = float(mapdl.get_value("AREA", 0, "AREA"))
    mapdl.allsel()

    result = {
        "air_mats": air_mats,
        "partition_mats": partition_mats,
        "envelope_mats": {
            "mat_map": mat_map,
            "film_mat": film_mat,
        },
        "faces": {
            "x_min_global": x_min_g, "x_max_global": x_max_g,
            "y_min_global": y_min_g, "y_max_global": y_max_g,
            "z_min_global": z_min_g, "z_max_global": z_max_g,
        },
        "ext_area_m2": ext_area,
    }
    if planned_partition is not None:
        result["partition_blocks"] = planned_partition["partition_blocks"]
    return result


# ---------------------------------------------------------------------------
# Self-test (no ANSYS needed -- validates geometry-detection logic only)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    bounds_airlock = {"x_min": 0, "x_max": 3, "y_min": 0, "y_max": 3, "z_min": 0, "z_max": 2.5}
    bounds_living  = {"x_min": 3, "x_max": 9, "y_min": 0, "y_max": 4, "z_min": 0, "z_max": 2.8}
    bounds_store   = {"x_min": 20,"x_max": 25,"y_min": 0, "y_max": 3, "z_min": 0, "z_max": 2.5}

    sf = _shared_face(bounds_airlock, bounds_living, 0.10)
    assert sf is not None,                   "FAIL: shared face not detected"
    assert sf["axis"] == "x",               f"FAIL: axis={sf['axis']}"
    assert abs(sf["coord"] - 3.0) < 1e-9,  f"FAIL: coord={sf['coord']}"
    assert sf["span_ax1"] == (0, 3),        f"FAIL: span_ax1={sf['span_ax1']}"
    assert sf["span_ax2"] == (0, 2.5),      f"FAIL: span_ax2={sf['span_ax2']}"
    print("PASS: _shared_face (adjacent)")

    sf2 = _shared_face(bounds_airlock, bounds_store, 0.10)
    assert sf2 is None,  "FAIL: non-adjacent rooms should not share a face"
    print("PASS: _shared_face (non-adjacent)")

    rooms_t = [
        {"name": "airlock", "bounds": bounds_airlock},
        {"name": "living",  "bounds": bounds_living},
        {"name": "store",   "bounds": bounds_store},
    ]
    all_sf = _detect_all_shared_faces(rooms_t, 0.10)
    assert len(all_sf) == 1,                 f"FAIL: expected 1, got {len(all_sf)}"
    assert all_sf[0]["room_a"] == "airlock", "FAIL: room_a"
    assert all_sf[0]["room_b"] == "living",  "FAIL: room_b"
    print("PASS: _detect_all_shared_faces")

    assert _is_partition_face("airlock", "x", 3.0, all_sf) is True
    assert _is_partition_face("living",  "x", 3.0, all_sf) is True
    assert _is_partition_face("airlock", "x", 0.0, all_sf) is False
    assert _is_partition_face("store",   "x", 20.0, all_sf) is False
    print("PASS: _is_partition_face")

    print("\nAll geometry-detection tests PASSED.")
    print("(Full ANSYS validation requires a live PyMAPDL session.)")
