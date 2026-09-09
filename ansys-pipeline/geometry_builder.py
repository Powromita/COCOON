"""
geometry_builder.py

Builds a multi-layer shelter for ANSYS/PyMAPDL that represents the SAME
physical scenario as the Python physics engine (heat_transfer.py /
thermal_model.py):

    - an indoor-air solid  L x W x H  (the RC model's single indoor node)
    - 4 walls, a roof and a floor, each an independent multi-layer slab
      stack whose inner face exactly covers one face of the air solid
    - a thin inside-film layer on every envelope element, tuned so its
      resistance equals 1/h_inside (the ANSYS equivalent of the "1/h_i"
      term the RC model puts in R_total)

Surface areas match the RC model:
    A_wall  = 2 (L H + W H)      (all four walls)
    A_roof  = L W
    A_floor = L W

Geometry notes that keep meshing cheap and robust on ANSYS Student:
    * every stack has the interior footprint only, so each inner face is
      a FULL-face match to the air solid (no partial boolean cuts)
    * stacks are laid on one coordinate grid, so coincident interface
      nodes line up and NUMMRG merges them cleanly -- no VGLUE, no slivers
    * the vertical corner columns / wall-roof edges are left as empty
      adiabatic gaps. The RC model ignores corner bridging too, so this
      makes the two models MORE comparable, not less.

When the config carries a conductive window (windows.area_m2 > 0 AND
windows.U_W_m2K > 0) the south wall is instead built as a 4-piece frame
around a centred opening, and the opening is filled by one glazing block
spanning the full wall depth. The glazing conductivity is set so the
whole air-to-outdoor-air window U equals windows.U_W_m2K (with 1/h_out as
the only film; the inner face merges straight to the air node, matching
the RC model's Q_window = U*A*(T_in - T_out)). Because the frame pieces no
longer share full faces, the element size is forced to WINDOW_ELEMENT_
SIZE_M, which divides L, W, H and the snapped window rectangle exactly so
NUMMRG still lines every interface node up.

build_shelter() never reads the physics engine's predicted indoor
temperature -- only geometry, materials and h-values (independence rule,
physics architecture doc section 9).
"""

INSIDE_FILM_THICKNESS_M = 0.02   # k chosen so d/k == 1/h_inside
AIR_CONDUCTIVITY_W_mK = 50.0     # artificially high -> near-isothermal air node
AIR_DENSITY_KG_M3 = 1.2
AIR_SPECIFIC_HEAT_J_KGK = 1005.0
DEFAULT_ELEMENT_SIZE_M = 0.20

# When a conductive window is present the south wall is built as a frame
# around an opening, so blocks no longer share full faces. Every block
# edge must fall on one shared grid for NUMMRG to merge interface nodes,
# so the element size is forced to a value that divides L, W, H and the
# window rectangle exactly.
WINDOW_ELEMENT_SIZE_M = 0.125
WINDOW_GLAZING_DENSITY_KG_M3 = 40.0      # light: a mostly gas-filled IGU
WINDOW_GLAZING_SPECIFIC_HEAT_J_KGK = 1000.0
# Interior surface film for the window, kept SEPARATE from the opaque-wall
# film. The opaque film is 1/h_inside = 0.40 m2K/W (h_inside 2.5); a rated
# double-glazing U of ~2.8 is physically impossible behind that much film
# (1/0.40 = 2.5). Windows get the ISO 6946 vertical still-air value
# instead, so the glazing keeps a real interior boundary layer buffering
# the indoor-air node (without it the low-capacity ANSYS air runs away
# through the window in the first hour) while the whole-assembly U still
# lands on windows["U_W_m2K"].
WINDOW_INTERIOR_FILM_H_W_M2K = 7.7       # ISO 6946, ~0.13 m2K/W


def _mm_to_m(mm):
    return mm / 1000.0


def _snap(value, grid):
    return round(value / grid) * grid


def _window_spec(config, L, H, t_wall):
    """South-wall window as (x0, x1, z0, z1) plus the glazing conductivity
    that makes the whole air-to-air window U equal windows["U_W_m2K"].

    Returns None unless the config carries a glazing with BOTH a real area
    and a real U-value (a pure solar aperture has U == 0 and no cut-out).
    The opening is centred on the south wall, sized to windows["area_m2"]
    with a 1.6:1 landscape aspect, and snapped to WINDOW_ELEMENT_SIZE_M.
    """
    w = config.get("windows") or {}
    area = float(w.get("area_m2", 0.0))
    u_value = float(w.get("U_W_m2K", 0.0))
    if area <= 0.0 or u_value <= 0.0:
        return None

    g = WINDOW_ELEMENT_SIZE_M
    win_w = _snap((area * 1.6) ** 0.5, g)
    win_h = _snap(area / win_w, g)
    x0 = _snap((L - win_w) / 2.0, g)
    z0 = _snap((H - win_h) / 2.0, g)
    x1, z1 = x0 + win_w, z0 + win_h

    h_out = config["heat_transfer"]["h_outside_W_m2K"]
    # window path (inner -> outer):
    #   room air --| window interior film |--| glazing block |--| 1/h_out |--> out
    # solve for the glazing conductivity that makes the whole-assembly U
    # equal u_value
    r_film = 1.0 / WINDOW_INTERIOR_FILM_H_W_M2K
    r_glazing = 1.0 / u_value - r_film - 1.0 / h_out
    glazing_t = t_wall - INSIDE_FILM_THICKNESS_M
    k_glazing = (glazing_t / r_glazing) if r_glazing > 1e-6 else (glazing_t / 1e-6)
    k_win_film = INSIDE_FILM_THICKNESS_M * WINDOW_INTERIOR_FILM_H_W_M2K

    return {
        # glazing block (matches the RC model's window area exactly)
        "x0": x0, "x1": x1, "z0": z0, "z1": z1,
        # wall opening: one element bigger all round, so the glazing's
        # edges face an adiabatic reveal gap instead of conducting
        # straight into the cold wall stack (the perimeter bridge would
        # otherwise roughly double the window loss)
        "fx0": x0 - g, "fx1": x1 + g, "fz0": z0 - g, "fz1": z1 + g,
        "area_m2": win_w * win_h,
        "k_glazing": k_glazing,
        "k_win_film": k_win_film,
    }


def _assign_materials(mapdl, config, materials_db, h_inside):
    used = sorted(set(
        [l["material"] for l in config["walls"]] +
        [l["material"] for l in config["roof"]] +
        [l["material"] for l in config["floor"]]
    ))
    mat_map = {}
    for i, mat_id in enumerate(used, start=1):
        p = materials_db[mat_id]
        mapdl.mp("KXX", i, p["thermal_conductivity"])
        mapdl.mp("DENS", i, p["density"])
        mapdl.mp("C", i, p["specific_heat"])
        mat_map[mat_id] = i

    air_num = len(used) + 1
    mapdl.mp("KXX", air_num, AIR_CONDUCTIVITY_W_mK)
    mapdl.mp("DENS", air_num, AIR_DENSITY_KG_M3)
    mapdl.mp("C", air_num, AIR_SPECIFIC_HEAT_J_KGK)
    mat_map["__air__"] = air_num

    film_num = len(used) + 2
    mapdl.mp("KXX", film_num, INSIDE_FILM_THICKNESS_M * h_inside)  # d/k == 1/h_i
    mapdl.mp("DENS", film_num, AIR_DENSITY_KG_M3)                  # negligible mass
    mapdl.mp("C", film_num, AIR_SPECIFIC_HEAT_J_KGK)
    mat_map["__film__"] = film_num
    return mat_map


def _layers_inner_to_outer(config_layers, mat_map, film_mat):
    """config lists are OUTER -> INNER. Return INNER -> OUTER with the
    inside-film prepended (index 0 = film touching the air)."""
    out = [{"t": INSIDE_FILM_THICKNESS_M, "mat": film_mat}]
    for layer in reversed(config_layers):
        out.append({"t": _mm_to_m(layer["thickness_mm"]),
                    "mat": mat_map[layer["material"]]})
    return out


def _build_stack(mapdl, layers, *, axis, inner_coord, direction, span):
    """Stack rectangular BLOCK slabs along `axis` from `inner_coord`
    growing in `direction` (+/-1). `span` gives (lo, hi) on the other two
    axes. Returns (volume_numbers, outer_coord)."""
    cur = inner_coord
    vols = []
    for lyr in layers:
        nxt = cur + direction * lyr["t"]
        lo, hi = (cur, nxt) if cur < nxt else (nxt, cur)
        b = {axis: (lo, hi)}
        b.update(span)
        v = mapdl.block(b["x"][0], b["x"][1], b["y"][0], b["y"][1],
                        b["z"][0], b["z"][1])
        mapdl.vsel("S", "VOLU", "", v)
        mapdl.vatt(lyr["mat"])
        vols.append(v)
        cur = nxt
    return vols, cur


def _build_south_wall_with_window(mapdl, layers, L, H, win):
    """South wall (grows in -y from y=0) built as a 4-piece frame around
    the window opening, per layer, plus the window fill in the opening:
    a thin interior film then the glazing block, spanning the wall depth."""
    fx0, fx1, fz0, fz1 = win["fx0"], win["fx1"], win["fz0"], win["fz1"]
    frame_rects = (
        ((0.0, L), (0.0, fz0)),     # below the opening
        ((0.0, L), (fz1, H)),       # above
        ((0.0, fx0), (fz0, fz1)),   # left jamb
        ((fx1, L), (fz0, fz1)),     # right jamb
    )

    cur = 0.0
    for lyr in layers:
        nxt = cur - lyr["t"]
        ylo, yhi = nxt, cur
        for (xa, xb), (za, zb) in frame_rects:
            if xb - xa <= 1e-9 or zb - za <= 1e-9:
                continue
            v = mapdl.block(xa, xb, ylo, yhi, za, zb)
            mapdl.vsel("S", "VOLU", "", v)
            mapdl.vatt(lyr["mat"])
        cur = nxt

    t_wall = sum(l["t"] for l in layers)
    win_stack = (
        (INSIDE_FILM_THICKNESS_M, win["win_film_mat"]),   # interior film
        (t_wall - INSIDE_FILM_THICKNESS_M, win["glazing_mat"]),
    )
    cur = 0.0
    for thickness, mat in win_stack:
        nxt = cur - thickness
        v = mapdl.block(win["x0"], win["x1"], nxt, cur, win["z0"], win["z1"])
        mapdl.vsel("S", "VOLU", "", v)
        mapdl.vatt(mat)
        cur = nxt
    return cur


def build_shelter(mapdl, config, materials_db):
    L = config["geometry"]["length_m"]
    W = config["geometry"]["width_m"]
    H = config["geometry"]["height_m"]
    h_inside = config["heat_transfer"]["h_inside_W_m2K"]

    mapdl.et(1, "SOLID70")
    mat_map = _assign_materials(mapdl, config, materials_db, h_inside)
    film_mat = mat_map["__film__"]

    wall_layers = _layers_inner_to_outer(config["walls"], mat_map, film_mat)
    roof_layers = _layers_inner_to_outer(config["roof"], mat_map, film_mat)
    floor_layers = _layers_inner_to_outer(config["floor"], mat_map, film_mat)

    t_wall = sum(l["t"] for l in wall_layers)
    t_roof = sum(l["t"] for l in roof_layers)
    t_floor = sum(l["t"] for l in floor_layers)

    win = _window_spec(config, L, H, t_wall)
    if win is not None:
        esize = WINDOW_ELEMENT_SIZE_M
        glazing_mat = max(mat_map.values()) + 1
        mapdl.mp("KXX", glazing_mat, win["k_glazing"])
        mapdl.mp("DENS", glazing_mat, WINDOW_GLAZING_DENSITY_KG_M3)
        mapdl.mp("C", glazing_mat, WINDOW_GLAZING_SPECIFIC_HEAT_J_KGK)
        mat_map["__glazing__"] = glazing_mat
        win["glazing_mat"] = glazing_mat

        win_film_mat = glazing_mat + 1
        mapdl.mp("KXX", win_film_mat, win["k_win_film"])
        mapdl.mp("DENS", win_film_mat, AIR_DENSITY_KG_M3)          # negligible mass
        mapdl.mp("C", win_film_mat, AIR_SPECIFIC_HEAT_J_KGK)
        mat_map["__win_film__"] = win_film_mat
        win["win_film_mat"] = win_film_mat
    else:
        esize = config.get("_ansys_element_size_m", DEFAULT_ELEMENT_SIZE_M)

    # --- indoor air: the clear interior volume ---
    air = mapdl.block(0, L, 0, W, 0, H)
    mapdl.vsel("S", "VOLU", "", air)
    mapdl.vatt(mat_map["__air__"])

    # --- envelope stacks: interior footprint only, full-face to the air ---
    _build_stack(mapdl, wall_layers, axis="x", inner_coord=0.0,
                 direction=-1, span={"y": (0, W), "z": (0, H)})        # west
    _build_stack(mapdl, wall_layers, axis="x", inner_coord=L,
                 direction=+1, span={"y": (0, W), "z": (0, H)})        # east
    if win is not None:
        _build_south_wall_with_window(mapdl, wall_layers, L, H, win)   # south
    else:
        _build_stack(mapdl, wall_layers, axis="y", inner_coord=0.0,
                     direction=-1, span={"x": (0, L), "z": (0, H)})    # south
    _build_stack(mapdl, wall_layers, axis="y", inner_coord=W,
                 direction=+1, span={"x": (0, L), "z": (0, H)})        # north
    _build_stack(mapdl, floor_layers, axis="z", inner_coord=0.0,
                 direction=-1, span={"x": (0, L), "y": (0, W)})        # floor
    _build_stack(mapdl, roof_layers, axis="z", inner_coord=H,
                 direction=+1, span={"x": (0, L), "y": (0, W)})        # roof

    x_w, x_e = -t_wall, L + t_wall
    y_s, y_n = -t_wall, W + t_wall
    z_f, z_r = -t_floor, H + t_roof

    # --- mesh: mapped hex per brick, then merge coincident interface nodes ---
    mapdl.allsel()
    mapdl.esize(esize)
    mapdl.mshkey(1)
    mapdl.mshape(0, "3d")
    mapdl.vmesh("ALL")
    mapdl.nummrg("NODE")
    mapdl.nummrg("KP")

    # exterior envelope area (walls + roof, not the floor underside)
    mapdl.allsel()
    mapdl.asel("S", "LOC", "X", x_w)
    mapdl.asel("A", "LOC", "X", x_e)
    mapdl.asel("A", "LOC", "Y", y_s)
    mapdl.asel("A", "LOC", "Y", y_n)
    mapdl.asel("A", "LOC", "Z", z_r)
    mapdl.asum()
    ext_area = mapdl.get_value("AREA", 0, "AREA")
    mapdl.allsel()

    return {
        "air_mat": mat_map["__air__"],
        "mat_map": mat_map,
        "ext_area_m2": float(ext_area),
        "faces": {"x_w": x_w, "x_e": x_e, "y_s": y_s, "y_n": y_n,
                  "z_f": z_f, "z_r": z_r},
        "L": L, "W": W, "H": H,
        "window": win,
    }
