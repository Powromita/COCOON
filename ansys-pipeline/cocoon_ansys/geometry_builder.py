"""
geometry_builder.py - M0 BuildingModel -> conforming hexahedral FE model.

Works for any number of rectangular zones on any number of floors
(PRD v4 §14.5). Pure Python: no MAPDL calls, so it is unit-tested
without a licence; pyansys_runner.py pushes the result into MAPDL.

Representation (same physical scenario as the multi-zone RC engine):

  * every zone is an air block with its own material number, so the
    zone temperature is read back per room. Air conductivity is set high
    (near-isothermal node, as in the validated single-zone builder).
  * every exterior surface is a stack grown OUTWARD from the zone face:
        inside film (d/k == r_inside_film) + assembly layers (inner->outer)
    and its outermost face carries convection h = 1 / r_outside_film to
    outdoor air (outdoors) or to the ground temperature (ground).
  * every zone-to-zone interface (partition, floor/ceiling slab) is ONE
    stack  film + layers + film  placed in a gap inserted at the shared
    plane. Gaps are inserted by shifting everything beyond the plane, so
    every zone keeps its exact contract size and every surface its exact
    contract area; junction columns/strips that belong to no surface are
    left empty (adiabatic), as the RC model also ignores junction bridging.
  * windows and doors fill their rectangle through the full stack depth:
    an interior film plus a core whose normal conductivity makes the
    whole air-to-air U equal the opening's contract U. Films and opening
    cores are orthotropic (lateral k = 1e-3 x normal) so they do not act
    as edge bridges.

Everything lives on one tensor-product grid whose lines include every
block boundary, so all interface nodes are shared by construction.

Face-direction convention: local +x/+y/+z. With orientation_deg = 180
(default) the local -y face points south (compass 180), +x east (90),
+y north (0) and -x west (270). A surface's direction is resolved from
its tilt (0 = up, 180 = down, 90 = wall) and compass azimuth.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

FILM_T = 0.02                    # m, thickness of every modelled film layer
AIR_K = 50.0                     # W/mK, near-isothermal room-air node
AIR_RHO = 1.2
AIR_CP = 1005.0
LATERAL_FRACTION = 1e-3          # orthotropic films / opening cores
WINDOW_FILM_R = 1.0 / 7.7        # m2K/W, ISO 6946 vertical still-air film
GLAZING_RHO, GLAZING_CP = 40.0, 1000.0     # light: mostly gas-filled IGU
DOOR_RHO, DOOR_CP = 500.0, 1600.0          # timber-like door leaf (assumption)
STUDENT_NODE_LIMIT = 128_000
TOL = 1e-6

# SOLID70 face numbers (I,J,K,L bottom; M,N,O,P top) for an axis-aligned
# brick with I at (x0,y0,z0), J +x, L +y, M +z
LKEY = {(2, -1): 1, (1, -1): 2, (0, 1): 3, (1, 1): 4, (0, -1): 5, (2, 1): 6}

_LOCAL_AZ = {0.0: (1, +1), 90.0: (0, +1), 180.0: (1, -1), 270.0: (0, -1)}
CARDINAL = {0.0: "north", 90.0: "east", 180.0: "south", 270.0: "west"}


class GeometryError(ValueError):
    """The BuildingModel cannot be turned into a valid FE model."""


@dataclass
class MeshConfig:
    element_size_m: float = 0.25
    max_layer_slice_m: float | None = None     # default: min(0.05, element/4)

    @property
    def layer_slice(self) -> float:
        if self.max_layer_slice_m:
            return self.max_layer_slice_m
        return min(0.05, self.element_size_m / 4.0)


@dataclass
class Block:
    id: int
    box: tuple                   # (x0, x1, y0, y1, z0, z1) physical metres
    mat: str                     # material key
    role: str                    # air | film | solid | opening_film | opening_core
    zone_id: str | None = None
    surface_id: str | None = None
    opening_id: str | None = None
    axis: int | None = None      # stack normal axis
    sign: int = 0                # stack growth direction
    layer_index: int = -1
    is_outer: bool = False
    bc: dict | None = None       # {"kind": outdoors|ground, "h": W/m2K}


@dataclass
class ResolvedModel:
    xs: np.ndarray
    ys: np.ndarray
    zs: np.ndarray
    owner: np.ndarray            # (nx, ny, nz) block id, 0 = empty
    blocks: dict
    materials: dict              # key -> {kx, ky, kz, dens, c, label}
    zones: dict                  # zone_id -> info
    surfaces: dict               # surface_id -> info
    openings: dict
    interfaces: list
    warnings: list = field(default_factory=list)
    conflicts: dict = field(default_factory=dict)

    # ---- mesh accessors -------------------------------------------------
    def cells(self):
        return np.argwhere(self.owner > 0)

    def node_grid_id(self, i, j, k):
        nx1, ny1 = len(self.xs), len(self.ys)
        return i + nx1 * (j + ny1 * k)

    def summary(self):
        cells = self.cells()
        nodes = self.node_table()[0]
        return {
            "grid_lines": [len(self.xs), len(self.ys), len(self.zs)],
            "elements": int(len(cells)),
            "nodes": int(len(nodes)),
            "materials": len(self.materials),
            "zones": len(self.zones),
            "surfaces": len(self.surfaces),
            "openings": len(self.openings),
            "interfaces": len(self.interfaces),
            "junction_conflict_cells": {k: int(v) for k, v in self.conflicts.items()},
            "warnings": list(self.warnings),
        }

    def node_table(self):
        """(grid_ids sorted, coords) for every node used by an element.
        Node number n (1-based) == position in this table + 1."""
        if getattr(self, "_node_cache", None) is None:
            cells = self.cells()
            corners = []
            for di, dj, dk in ((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                               (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)):
                corners.append(self.node_grid_id(cells[:, 0] + di, cells[:, 1] + dj,
                                                 cells[:, 2] + dk))
            gids = np.unique(np.concatenate(corners))
            nx1, ny1 = len(self.xs), len(self.ys)
            i = gids % nx1
            j = (gids // nx1) % ny1
            k = gids // (nx1 * ny1)
            coords = np.column_stack([self.xs[i], self.ys[j], self.zs[k]])
            self._node_cache = (gids, coords)
        return self._node_cache

    def node_numbers(self, gids):
        table = self.node_table()[0]
        idx = np.searchsorted(table, gids)
        if np.any(idx >= len(table)) or np.any(table[np.minimum(idx, len(table) - 1)] != gids):
            raise GeometryError("internal: node requested that no element uses")
        return idx + 1

    def element_node_gids(self, cells):
        i, j, k = cells[:, 0], cells[:, 1], cells[:, 2]
        g = self.node_grid_id
        return np.column_stack([
            g(i, j, k), g(i + 1, j, k), g(i + 1, j + 1, k), g(i, j + 1, k),
            g(i, j, k + 1), g(i + 1, j, k + 1), g(i + 1, j + 1, k + 1), g(i, j + 1, k + 1)])

    def face_node_gids(self, cells, axis, sign):
        """Grid ids of the 4 corner nodes of each cell's (axis, sign) face."""
        i, j, k = cells[:, 0], cells[:, 1], cells[:, 2]
        g = self.node_grid_id
        o = 1 if sign > 0 else 0
        if axis == 0:
            return np.column_stack([g(i + o, j, k), g(i + o, j + 1, k),
                                    g(i + o, j + 1, k + 1), g(i + o, j, k + 1)])
        if axis == 1:
            return np.column_stack([g(i, j + o, k), g(i + 1, j + o, k),
                                    g(i + 1, j + o, k + 1), g(i, j + o, k + 1)])
        return np.column_stack([g(i, j, k + o), g(i + 1, j, k + o),
                                g(i + 1, j + 1, k + o), g(i, j + 1, k + o)])

    def face_areas(self, cells, axis):
        dx = np.diff(self.xs)[cells[:, 0]]
        dy = np.diff(self.ys)[cells[:, 1]]
        dz = np.diff(self.zs)[cells[:, 2]]
        return {0: dy * dz, 1: dx * dz, 2: dx * dy}[axis]


# ---------------------------------------------------------------------------
# surface direction
# ---------------------------------------------------------------------------

def surface_direction(surface, orientation_deg):
    """(axis, sign) of the outward face a surface sits on."""
    tilt = surface.tilt_deg
    if abs(tilt) < 1.0:
        return (2, +1)
    if abs(tilt - 180.0) < 1.0:
        return (2, -1)
    if abs(tilt - 90.0) > 1.0:
        raise GeometryError(f"surface '{surface.id}': tilt {tilt} deg is not "
                            "horizontal or vertical (rectangular model only)")
    local = (surface.azimuth_deg - (orientation_deg - 180.0)) % 360.0
    for az, d in _LOCAL_AZ.items():
        if min(abs(local - az), 360.0 - abs(local - az)) < 1.0:
            return d
    raise GeometryError(f"surface '{surface.id}': azimuth {surface.azimuth_deg} "
                        "is not aligned with the building axes")


def compass_name(azimuth_deg):
    for az, name in CARDINAL.items():
        if min(abs(azimuth_deg - az), 360.0 - abs(azimuth_deg - az)) < 1.0:
            return name
    raise GeometryError(f"azimuth {azimuth_deg} is not a cardinal direction; "
                        "the shared solar model supports N/E/S/W windows only")


# ---------------------------------------------------------------------------
# rectangle helpers (2-D, in the two in-plane axes)
# ---------------------------------------------------------------------------

def _rect_overlap(a, b):
    u0, u1 = max(a[0], b[0]), min(a[1], b[1])
    v0, v1 = max(a[2], b[2]), min(a[3], b[3])
    if u1 - u0 > TOL and v1 - v0 > TOL:
        return (u0, u1, v0, v1)
    return None


def _rect_subtract(rect, holes):
    """rect minus the union of holes, as a list of disjoint rectangles."""
    us = sorted({rect[0], rect[1], *[h[0] for h in holes], *[h[1] for h in holes]})
    vs = sorted({rect[2], rect[3], *[h[2] for h in holes], *[h[3] for h in holes]})
    us = [u for u in us if rect[0] - TOL <= u <= rect[1] + TOL]
    vs = [v for v in vs if rect[2] - TOL <= v <= rect[3] + TOL]
    out = []
    for a, b in zip(us[:-1], us[1:]):
        for c, d in zip(vs[:-1], vs[1:]):
            if b - a <= TOL or d - c <= TOL:
                continue
            mu, mv = (a + b) / 2, (c + d) / 2
            if not any(h[0] <= mu <= h[1] and h[2] <= mv <= h[3] for h in holes):
                out.append((a, b, c, d))
    return out


def _area(r):
    return (r[1] - r[0]) * (r[3] - r[2])


def _other_axes(axis):
    return [a for a in (0, 1, 2) if a != axis]


# ---------------------------------------------------------------------------
# main entry
# ---------------------------------------------------------------------------

def resolve(building, materials_snapshot, mesh: MeshConfig | None = None) -> ResolvedModel:
    mesh = mesh or MeshConfig()
    mats = materials_snapshot.materials
    warnings: list[str] = []

    # ---- zones ------------------------------------------------------------
    zones = {}
    for fl in building.floors:
        for z in fl.zones:
            lo = (z.origin_m.x, z.origin_m.y, z.origin_m.z)
            hi = (lo[0] + z.size_m.length_m, lo[1] + z.size_m.width_m,
                  lo[2] + z.size_m.height_m)
            zones[z.id] = {"id": z.id, "type": z.type, "floor_id": fl.id,
                           "level": fl.level, "lo": lo, "hi": hi,
                           "volume_m3": z.size_m.length_m * z.size_m.width_m * z.size_m.height_m}
    ids = list(zones)
    for a_i, a in enumerate(ids):
        for b in ids[a_i + 1:]:
            A, B = zones[a], zones[b]
            if all(min(A["hi"][d], B["hi"][d]) - max(A["lo"][d], B["lo"][d]) > TOL
                   for d in range(3)):
                raise GeometryError(f"zones '{a}' and '{b}' overlap")

    # ---- faces: exterior parts + zone-zone interfaces ----------------------
    def face_rect(z, axis):
        u, v = _other_axes(axis)
        return (z["lo"][u], z["hi"][u], z["lo"][v], z["hi"][v])

    interfaces = []              # geometric, one per touching pair+plane
    exterior_parts = {}          # (zone, axis, sign) -> [rects]
    for zid, z in zones.items():
        for axis in range(3):
            for sign in (-1, +1):
                plane = z["hi"][axis] if sign > 0 else z["lo"][axis]
                rect = face_rect(z, axis)
                holes = []
                for oid, o in zones.items():
                    if oid == zid:
                        continue
                    o_plane = o["lo"][axis] if sign > 0 else o["hi"][axis]
                    if abs(o_plane - plane) > TOL:
                        continue
                    ov = _rect_overlap(rect, face_rect(o, axis))
                    if ov:
                        holes.append(ov)
                        if sign > 0:          # record each interface once
                            interfaces.append({"a": zid, "b": oid, "axis": axis,
                                               "plane": plane, "rect": ov})
                exterior_parts[(zid, axis, sign)] = _rect_subtract(rect, holes)

    # ---- match contract surfaces to geometry -------------------------------
    orient = building.orientation_deg
    surf_by_face = {}
    iface_surfaces = {}
    for s in building.surfaces:
        axis, sign = surface_direction(s, orient)
        if s.boundary_type.value == "adjacent_zone":
            a, b = s.owning_zone_id, s.adjacent_zone_id
            key = (a, b, axis) if sign > 0 else (b, a, axis)
            prev = iface_surfaces.get(key)
            if prev and prev[0].assembly_id != s.assembly_id:
                raise GeometryError(f"interface {key[0]}|{key[1]} declared twice with "
                                    f"different assemblies ({prev[0].id}, {s.id})")
            if not prev:
                iface_surfaces[key] = (s, a)          # (surface, zone whose side is 'inner')
            else:
                warnings.append(f"interface {key[0]}|{key[1]}: '{s.id}' duplicates "
                                f"'{prev[0].id}', counted once")
        else:
            k = (s.owning_zone_id, axis, sign)
            if k in surf_by_face:
                raise GeometryError(f"zone '{k[0]}' face {axis}{'+' if sign > 0 else '-'} has "
                                    f"two exterior surfaces ({surf_by_face[k].id}, {s.id}); "
                                    "split faces need vertices, not supported")
            surf_by_face[k] = s

    for (zid, axis, sign), parts in exterior_parts.items():
        area = sum(_area(p) for p in parts)
        if area > TOL and (zid, axis, sign) not in surf_by_face:
            raise GeometryError(
                f"zone '{zid}' has {area:.2f} m2 of exposed face on axis "
                f"{'xyz'[axis]}{'+' if sign > 0 else '-'} but no surface declares it "
                "(incomplete BuildingModel)")
    for (zid, axis, sign), s in surf_by_face.items():
        if not exterior_parts.get((zid, axis, sign)):
            raise GeometryError(f"surface '{s.id}' sits on a face of '{zid}' that is fully "
                                "shared with other zones")
    for itf in interfaces:
        key = (itf["a"], itf["b"], itf["axis"])
        if key not in iface_surfaces:
            raise GeometryError(f"zones '{itf['a']}' and '{itf['b']}' touch "
                                f"({_area(itf['rect']):.2f} m2) but no adjacent_zone "
                                "surface describes the interface")
        itf["surface"], itf["owner_side"] = iface_surfaces[key]
    used_keys = {(i["a"], i["b"], i["axis"]) for i in interfaces}
    for key, (s, _) in iface_surfaces.items():
        if key not in used_keys:
            raise GeometryError(f"surface '{s.id}' declares an interface between "
                                f"'{key[0]}' and '{key[1]}' but the zones do not touch")

    # ---- assemblies -> physical layer lists -------------------------------
    def layers_of(assembly_id):
        asm = building.assemblies[assembly_id]
        out = []
        for L in asm.layers:
            if L.material_id not in mats:
                raise GeometryError(f"assembly '{assembly_id}' uses material "
                                    f"'{L.material_id}' missing from the material snapshot")
            p = mats[L.material_id].properties
            out.append({"t": L.thickness_mm / 1000.0, "mat": L.material_id,
                        "k": p.thermal_conductivity_w_mk, "rho": p.density_kg_m3,
                        "cp": p.specific_heat_j_kgk})
        return asm, out

    materials = {}

    def mat_solid(mid):
        key = f"solid:{mid}"
        if key not in materials:
            p = mats[mid].properties
            k = p.thermal_conductivity_w_mk
            materials[key] = {"kx": k, "ky": k, "kz": k, "dens": p.density_kg_m3,
                              "c": p.specific_heat_j_kgk, "label": mid}
        return key

    def mat_ortho(prefix, axis, k_normal, dens, c, label):
        key = f"{prefix}:{'xyz'[axis]}:{k_normal:.6g}:{dens:g}:{c:g}"
        if key not in materials:
            ks = [k_normal * LATERAL_FRACTION] * 3
            ks[axis] = k_normal
            materials[key] = {"kx": ks[0], "ky": ks[1], "kz": ks[2],
                              "dens": dens, "c": c, "label": label}
        return key

    def mat_film(axis, r):
        return mat_ortho("film", axis, FILM_T / r, AIR_RHO, AIR_CP, f"film r={r:.3f}")

    for zid in zones:
        materials[f"air:{zid}"] = {"kx": AIR_K, "ky": AIR_K, "kz": AIR_K, "dens": AIR_RHO,
                                   "c": AIR_CP, "label": f"air {zid}"}

    # ---- gap insertion at interface planes --------------------------------
    plane_t = {0: {}, 1: {}, 2: {}}
    for itf in interfaces:
        asm, lay = layers_of(itf["surface"].assembly_id)
        t = 2 * FILM_T + sum(L["t"] for L in lay)
        prev = plane_t[itf["axis"]].get(round(itf["plane"], 6))
        if prev is not None and abs(prev - t) > TOL:
            raise GeometryError(f"two interfaces on plane {'xyz'[itf['axis']]}={itf['plane']} "
                                f"have different thicknesses ({prev:.3f} vs {t:.3f} m)")
        plane_t[itf["axis"]][round(itf["plane"], 6)] = t
        itf["thickness_m"] = t

    def phys_lo(axis, c):
        return c + sum(t for p, t in plane_t[axis].items() if p <= c + TOL)

    def phys_hi(axis, c):
        return c + sum(t for p, t in plane_t[axis].items() if p < c - TOL)

    for zid, z in zones.items():
        z["plo"] = tuple(phys_lo(d, z["lo"][d]) for d in range(3))
        z["phi"] = tuple(phys_hi(d, z["hi"][d]) for d in range(3))
        for d in range(3):
            if abs((z["phi"][d] - z["plo"][d]) - (z["hi"][d] - z["lo"][d])) > TOL:
                warnings.append(f"zone '{zid}' is stretched along {'xyz'[d]} by an "
                                "interface plane crossing it")

    # ---- blocks ------------------------------------------------------------
    blocks: dict[int, Block] = {}

    def add(**kw):
        b = Block(id=len(blocks) + 1, **kw)
        blocks[b.id] = b
        return b

    def box_from(axis, a0, a1, u_axis, u0, u1, v_axis, v0, v1):
        lo, hi = [0.0] * 3, [0.0] * 3
        lo[axis], hi[axis] = min(a0, a1), max(a0, a1)
        lo[u_axis], hi[u_axis] = u0, u1
        lo[v_axis], hi[v_axis] = v0, v1
        return (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2])

    for zid, z in zones.items():
        add(box=(z["plo"][0], z["phi"][0], z["plo"][1], z["phi"][1], z["plo"][2], z["phi"][2]),
            mat=f"air:{zid}", role="air", zone_id=zid)

    openings_by_surface = {}
    for op in building.openings:
        openings_by_surface.setdefault(op.parent_surface_id, []).append(op)

    surfaces_out = {}
    openings_out = {}
    slice_ranges = {0: [], 1: [], 2: []}      # (lo, hi, max_size) along stack normals

    def place_openings(surface, prect, u_axis, v_axis, r_film_door, r_out_total, stack_t,
                       axis, face_coord, sign, inner_zone):
        """Opening blocks inside the physical part rect prect=(u0,u1,v0,v1).

        Air-to-air resistance of an opening = interior film + core (+ the
        exterior convection film r_out_total on an exterior surface; 0 for
        a door in a partition, whose far side touches the next room's air
        directly). The core conductivity is solved so that sum == 1/U."""
        ops = openings_by_surface.get(surface.id, [])
        if not ops:
            return []
        u0, u1, v0, v1 = prect
        width, height = u1 - u0, v1 - v0
        vertical = axis != 2
        slot = width / len(ops)
        placed = []
        for n, op in enumerate(ops):
            A = op.area_m2
            if op.opening_type.value == "door" and vertical:
                h = min(2.0, 0.85 * height)
                w = A / h
                if w > 0.9 * slot:
                    w = 0.9 * slot
                    h = A / w
                vb = v0                                   # door sits on the floor
            else:
                w = math.sqrt(1.6 * A)
                h = A / w
                if w > 0.9 * slot:
                    w = 0.9 * slot
                    h = A / w
                vb = v0 + (height - h) / 2.0
            if h > 0.95 * height or w > 0.95 * slot:
                raise GeometryError(f"opening '{op.id}' ({A} m2) does not fit on "
                                    f"surface '{surface.id}'")
            ub = u0 + n * slot + (slot - w) / 2.0
            is_window = op.opening_type.value == "window"
            r_film_in = WINDOW_FILM_R if is_window else r_film_door
            r_core = 1.0 / op.u_value_w_m2k - r_film_in - r_out_total
            if r_core <= 1e-4:
                raise GeometryError(f"opening '{op.id}': U={op.u_value_w_m2k} is higher "
                                    "than its surface films allow")
            core_t = stack_t - FILM_T
            rho, cp = (GLAZING_RHO, GLAZING_CP) if is_window else (DOOR_RHO, DOOR_CP)
            film_key = mat_film(axis, r_film_in)
            core_key = mat_ortho("ocore", axis, core_t / r_core, rho, cp,
                                 f"{op.opening_type.value} core U={op.u_value_w_m2k}")
            f0 = face_coord
            f1 = face_coord + sign * FILM_T
            f2 = face_coord + sign * stack_t
            add(box=box_from(axis, f0, f1, u_axis, ub, ub + w, v_axis, vb, vb + h),
                mat=film_key, role="opening_film", zone_id=inner_zone,
                surface_id=surface.id, opening_id=op.id, axis=axis, sign=sign, layer_index=0)
            outer = add(box=box_from(axis, f1, f2, u_axis, ub, ub + w, v_axis, vb, vb + h),
                        mat=core_key, role="opening_core", zone_id=inner_zone,
                        surface_id=surface.id, opening_id=op.id, axis=axis, sign=sign,
                        layer_index=1)
            openings_out[op.id] = {"id": op.id, "type": op.opening_type.value,
                                   "surface_id": surface.id, "zone_id": inner_zone,
                                   "area_m2": w * h, "contract_area_m2": A,
                                   "u_value_w_m2k": op.u_value_w_m2k,
                                   "shgc": op.shgc or 0.0,
                                   "shading_factor": 1.0 if op.shading_factor is None
                                   else op.shading_factor,
                                   "rect": (ub, ub + w, vb, vb + h), "outer_block": outer.id,
                                   "connected_boundary": op.connected_boundary}
            placed.append((ub, ub + w, vb, vb + h))
        return placed

    # exterior stacks
    for (zid, axis, sign), s in surf_by_face.items():
        z = zones[zid]
        parts = exterior_parts[(zid, axis, sign)]
        if s.boundary_type.value == "adiabatic":
            surfaces_out[s.id] = _surface_record(s, zid, axis, sign, parts, None, "adiabatic")
            continue
        asm, lay = layers_of(s.assembly_id)
        u_axis, v_axis = _other_axes(axis)
        face = z["phi"][axis] if sign > 0 else z["plo"][axis]
        stack_t = FILM_T + sum(L["t"] for L in lay)
        h_out = 1.0 / asm.r_outside_film_m2k_w if asm.r_outside_film_m2k_w > 0 else None
        if h_out is None:
            raise GeometryError(f"assembly '{asm.id}' has zero outside film; exterior "
                                "convection needs r_outside_film > 0")
        bc = {"kind": "ground" if s.boundary_type.value == "ground" else "outdoors",
              "h": h_out, "surface_id": s.id}
        rec = _surface_record(s, zid, axis, sign, parts, asm, bc["kind"])
        rec["layers"] = lay
        rec["stack_t"] = stack_t
        biggest = max(parts, key=_area)
        for part in parts:
            prect = (phys_lo(u_axis, part[0]), phys_hi(u_axis, part[1]),
                     phys_lo(v_axis, part[2]), phys_hi(v_axis, part[3]))
            if part is biggest:
                place_openings(s, prect, u_axis, v_axis, asm.r_inside_film_m2k_w,
                               asm.r_outside_film_m2k_w, stack_t, axis, face, sign, zid)
            c = face
            seq = [("film", FILM_T, mat_film(axis, asm.r_inside_film_m2k_w))] + \
                  [("solid", L["t"], mat_solid(L["mat"])) for L in lay]
            for n, (role, t, mkey) in enumerate(seq):
                c2 = c + sign * t
                add(box=box_from(axis, c, c2, u_axis, *prect[:2], v_axis, *prect[2:]),
                    mat=mkey, role=role, zone_id=zid, surface_id=s.id, axis=axis,
                    sign=sign, layer_index=n, is_outer=(n == len(seq) - 1),
                    bc=bc if n == len(seq) - 1 else None)
                if role == "solid":
                    slice_ranges[axis].append((min(c, c2), max(c, c2), mesh.layer_slice))
                c = c2
        surfaces_out[s.id] = rec

    # interface stacks (partitions, inter-storey slabs)
    for n_itf, itf in enumerate(interfaces):
        s, owner_side = itf["surface"], itf["owner_side"]
        asm, lay = layers_of(s.assembly_id)
        axis = itf["axis"]
        u_axis, v_axis = _other_axes(axis)
        a, b = itf["a"], itf["b"]                        # a is on the low side
        r_a, r_b = asm.r_inside_film_m2k_w, asm.r_outside_film_m2k_w
        if owner_side != a:                              # layers listed from b's side
            lay = list(reversed(lay))
            r_a, r_b = r_b, r_a
        start = zones[a]["phi"][axis]
        rect = itf["rect"]
        prect = (phys_lo(u_axis, rect[0]), phys_hi(u_axis, rect[1]),
                 phys_lo(v_axis, rect[2]), phys_hi(v_axis, rect[3]))
        stack_t = 2 * FILM_T + sum(L["t"] for L in lay)
        itf.update({"surface_id": s.id, "assembly_id": asm.id, "r_film_a": r_a,
                    "r_film_b": r_b, "layers": lay, "area_m2": _area(rect),
                    "start": start, "prect": prect})
        place_openings(s, prect, u_axis, v_axis, r_a, 0.0, stack_t, axis, start, +1,
                       owner_side)
        seq = ([("film", FILM_T, mat_film(axis, r_a), a)] +
               [("solid", L["t"], mat_solid(L["mat"]), None) for L in lay] +
               [("film", FILM_T, mat_film(axis, r_b), b)])
        c = start
        for n, (role, t, mkey, side_zone) in enumerate(seq):
            add(box=box_from(axis, c, c + t, u_axis, *prect[:2], v_axis, *prect[2:]),
                mat=mkey, role=role, zone_id=side_zone, surface_id=s.id, axis=axis,
                sign=+1, layer_index=n)
            if role == "solid":
                slice_ranges[axis].append((c, c + t, mesh.layer_slice))
            c += t
        surfaces_out[s.id] = {
            "id": s.id, "zone_id": a, "adjacent_zone_id": b, "owning_zone_id": owner_side,
            "surface_type": s.surface_type.value, "boundary": "adjacent_zone",
            "assembly_id": asm.id, "axis": axis, "sign": +1,
            "contract_area_m2": s.area_m2, "built_area_m2": _area(rect),
            "r_film_a": r_a, "r_film_b": r_b, "r_inside": asm.r_inside_film_m2k_w,
            "r_outside": asm.r_outside_film_m2k_w, "layers": lay,
            "azimuth_deg": s.azimuth_deg, "tilt_deg": s.tilt_deg,
        }

    # ---- grid ----------------------------------------------------------------
    lines = {0: set(), 1: set(), 2: set()}
    for b in blocks.values():
        for d in range(3):
            lines[d].add(round(b.box[2 * d], 9))
            lines[d].add(round(b.box[2 * d + 1], 9))
    grids = []
    for d in range(3):
        base = sorted(lines[d])
        pts = [base[0]]
        for lo, hi in zip(base[:-1], base[1:]):
            size = mesh.element_size_m
            mid = (lo + hi) / 2
            for r0, r1, ms in slice_ranges[d]:
                if r0 - TOL <= mid <= r1 + TOL:
                    size = min(size, ms)
            n = max(1, math.ceil((hi - lo) / size - 1e-9))
            pts.extend(lo + (hi - lo) * np.arange(1, n + 1) / n)
        grids.append(np.array(pts))
    xs, ys, zs = grids

    # ---- claim cells ------------------------------------------------------------
    owner = np.zeros((len(xs) - 1, len(ys) - 1, len(zs) - 1), dtype=np.int32)
    conflicts: dict[str, int] = {}
    order = sorted(blocks.values(), key=lambda b: {"air": 0, "opening_film": 1,
                                                   "opening_core": 1}.get(b.role, 2))
    for b in order:
        sl = tuple(slice(int(np.searchsorted(g, b.box[2 * d] - TOL)),
                         int(np.searchsorted(g, b.box[2 * d + 1] - TOL)))
                   for d, g in enumerate(grids))
        region = owner[sl]
        taken = region != 0
        if taken.any():
            others = np.unique(region[taken])
            for o in others:
                ob = blocks[int(o)]
                if ob.role == "air" and b.role != "air":
                    raise GeometryError(f"surface '{b.surface_id}' stack intrudes into "
                                        f"room '{ob.zone_id}'")
                if ob.surface_id == b.surface_id and ob.opening_id and not b.opening_id:
                    continue                                   # its own opening
                key = f"{ob.surface_id or ob.zone_id}|{b.surface_id or b.zone_id}"
                conflicts[key] = conflicts.get(key, 0) + int((region == o).sum())
        region[~taken] = b.id

    model = ResolvedModel(xs=xs, ys=ys, zs=zs, owner=owner, blocks=blocks,
                          materials=materials, zones=zones, surfaces=surfaces_out,
                          openings=openings_out, interfaces=interfaces,
                          warnings=warnings, conflicts=conflicts)
    _finalise(model)
    return model


def _surface_record(s, zid, axis, sign, parts, asm, boundary):
    return {
        "id": s.id, "zone_id": zid, "owning_zone_id": zid,
        "surface_type": s.surface_type.value, "boundary": boundary,
        "assembly_id": s.assembly_id, "axis": axis, "sign": sign,
        "contract_area_m2": s.area_m2, "built_area_m2": sum(_area(p) for p in parts),
        "r_inside": asm.r_inside_film_m2k_w if asm else None,
        "r_outside": asm.r_outside_film_m2k_w if asm else None,
        "azimuth_deg": s.azimuth_deg, "tilt_deg": s.tilt_deg,
    }


def _finalise(m: ResolvedModel):
    """Derive BC faces, gain faces, per-surface node sets; check areas/limits."""
    owner, blocks = m.owner, m.blocks
    shape = owner.shape

    def cells_of(block_ids):
        mask = np.isin(owner, list(block_ids))
        return np.argwhere(mask)

    # zone air cells
    for zid, z in m.zones.items():
        bid = [b.id for b in blocks.values() if b.role == "air" and b.zone_id == zid]
        z["air_cells"] = cells_of(bid)
        z["built_volume_m3"] = float(np.prod([z["phi"][d] - z["plo"][d] for d in range(3)]))

    # convection faces: outward face of every outermost exterior block whose
    # neighbour is empty or outside the grid
    bc_faces = []
    for b in blocks.values():
        if not b.bc and b.role != "opening_core":
            continue
        if b.role == "opening_core":
            srec = m.surfaces[b.surface_id]
            if srec.get("boundary") not in ("outdoors", "ground"):
                continue                                   # door in a partition
            h = 1.0 / srec["r_outside"]
            bc = {"kind": srec["boundary"], "h": h, "surface_id": b.surface_id}
        else:
            bc = b.bc
        cells = cells_of([b.id])
        if len(cells) == 0:
            continue
        nb = cells.copy()
        nb[:, b.axis] += b.sign
        inside = (nb[:, b.axis] >= 0) & (nb[:, b.axis] < shape[b.axis])
        free = np.ones(len(cells), dtype=bool)
        free[inside] = owner[nb[inside, 0], nb[inside, 1], nb[inside, 2]] == 0
        cells = cells[free]
        if len(cells):
            bc_faces.append({"cells": cells, "axis": b.axis, "sign": b.sign,
                             "lkey": LKEY[(b.axis, b.sign)], "kind": bc["kind"],
                             "h": bc["h"], "surface_id": bc["surface_id"],
                             "opening_id": b.opening_id,
                             "areas": m.face_areas(cells, b.axis)})
    m.bc_faces = bc_faces

    # interior gain faces: top face of the first solid below each zone's
    # floor film (solar through windows + internal gains land in the slab,
    # as in the validated single-zone model)
    for zid, z in m.zones.items():
        k_air = int(np.searchsorted(m.zs, z["plo"][2] - TOL))
        cells = []
        if k_air >= 2:
            i0 = int(np.searchsorted(m.xs, z["plo"][0] - TOL))
            i1 = int(np.searchsorted(m.xs, z["phi"][0] - TOL))
            j0 = int(np.searchsorted(m.ys, z["plo"][1] - TOL))
            j1 = int(np.searchsorted(m.ys, z["phi"][1] - TOL))
            for i in range(i0, i1):
                for j in range(j0, j1):
                    k = k_air - 1
                    if not owner[i, j, k] or blocks[owner[i, j, k]].role != "film":
                        continue
                    while k >= 0 and owner[i, j, k] and blocks[owner[i, j, k]].role == "film":
                        k -= 1
                    if k >= 0 and owner[i, j, k] and blocks[owner[i, j, k]].role == "solid":
                        cells.append((i, j, k))
        cells = np.array(cells, dtype=int).reshape(-1, 3)
        z["gain_cells"] = cells
        z["gain_area_m2"] = float(m.face_areas(cells, 2).sum()) if len(cells) else 0.0
        if len(cells) == 0:
            m.warnings.append(f"zone '{zid}' has no floor slab: its solar/internal "
                              "gains cannot be applied")

    # per-surface inner-face node sets (film | first-layer interface) and
    # built area check
    for sid, rec in m.surfaces.items():
        if rec["boundary"] == "adiabatic":
            continue
        if rec["boundary"] == "adjacent_zone":
            side_zone = rec["zone_id"]
            films = [b for b in blocks.values() if b.surface_id == sid and b.role == "film"
                     and b.zone_id == side_zone]
            face_sign = +1
        else:
            films = [b for b in blocks.values() if b.surface_id == sid and b.role == "film"]
            face_sign = rec["sign"]
        cells = cells_of([b.id for b in films])
        rec["inner_face_gids"] = np.unique(m.face_node_gids(cells, rec["axis"], face_sign)) \
            if len(cells) else np.array([], dtype=int)
        rec["film_face_area_m2"] = float(m.face_areas(cells, rec["axis"]).sum()) if len(cells) else 0.0
        op_area = sum(o["area_m2"] for o in m.openings.values() if o["surface_id"] == sid)
        rec["opening_area_m2"] = op_area
        rec["net_area_m2"] = rec["built_area_m2"] - op_area
        dev = abs(rec["built_area_m2"] - rec["contract_area_m2"]) / rec["contract_area_m2"]
        rec["area_deviation"] = dev
        if dev > 0.10:
            raise GeometryError(f"surface '{sid}': contract area {rec['contract_area_m2']:.2f} "
                                f"m2 vs geometry {rec['built_area_m2']:.2f} m2 (>10% apart)")
        if dev > 0.02:
            m.warnings.append(f"surface '{sid}': contract area {rec['contract_area_m2']:.2f} m2, "
                              f"geometry {rec['built_area_m2']:.2f} m2; geometry used on both "
                              "RC and ANSYS sides")

    n_nodes = len(m.node_table()[0])
    if n_nodes > STUDENT_NODE_LIMIT:
        raise GeometryError(f"model has {n_nodes} nodes, above the ANSYS Student limit "
                            f"of {STUDENT_NODE_LIMIT}; use a coarser element size")
