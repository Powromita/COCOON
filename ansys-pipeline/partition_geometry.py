"""
partition_geometry.py

Pure-Python geometry planner that converts touching M0 room bounds and M0 partition
metadata into non-overlapping air-volume bounds and layered partition blocks.

Key architectural rules:
1. Air volumes are represented as single rectangular cuboids per room.
2. Touching room faces are detected on original unmodified room bounds.
3. Air volumes on both sides of a partition interface are symmetrically shortened
   by half_thickness = total_thickness_m / 2 so they terminate flush with the outer
   faces of the partition.
4. Partition layers are preserved sequentially in the direction from the owning zone
   toward the adjacent zone.
5. Zero PyMAPDL imports -- 100% pure Python and independently testable.
"""

from __future__ import annotations

import copy
from typing import Any

_FACE_TOL = 1e-6


class UnsupportedPartitionGeometryError(ValueError):
    """Raised when partition geometry cannot be planned due to invalid, overlapping,
    or unsupported room/partition configurations."""
    pass


def _get_zone_id(room: dict[str, Any]) -> str:
    """Extract authoritative zone ID from a room dictionary."""
    zid = room.get("zone_id") or room.get("name")
    if not zid:
        raise UnsupportedPartitionGeometryError("Room dictionary missing 'zone_id' and 'name'.")
    return str(zid)


def _boxes_overlap_volume(
    b1: dict[str, float],
    b2: dict[str, float],
    tol: float = _FACE_TOL,
) -> bool:
    """Return True if two 3D bounding boxes have a non-zero volumetric overlap."""
    x_ol = min(float(b1["x_max"]), float(b2["x_max"])) - max(float(b1["x_min"]), float(b2["x_min"]))
    y_ol = min(float(b1["y_max"]), float(b2["y_max"])) - max(float(b1["y_min"]), float(b2["y_min"]))
    z_ol = min(float(b1["z_max"]), float(b2["z_max"])) - max(float(b1["z_min"]), float(b2["z_min"]))
    return (x_ol > tol and y_ol > tol and z_ol > tol)


def _detect_touching_face(
    bounds_owner: dict[str, float],
    bounds_adj: dict[str, float],
    owning_zone_id: str,
    adjacent_zone_id: str,
) -> dict[str, Any]:
    """Detect the shared planar interface between two rooms using their original bounds.

    Returns a descriptor dict:
        {
            "axis": "x" | "y" | "z",
            "shared_coord": float,
            "owner_is_negative": bool,
            "transverse_axes": tuple[str, str],
        }

    Raises UnsupportedPartitionGeometryError if:
    - the rooms overlap in 3D volume,
    - the rooms do not touch at a planar face,
    - the touching face covers only part of either room's transverse face.
    """
    if _boxes_overlap_volume(bounds_owner, bounds_adj):
        raise UnsupportedPartitionGeometryError(
            f"Rooms '{owning_zone_id}' and '{adjacent_zone_id}' have volumetric overlap "
            f"prior to partition insertion."
        )

    axes_map = {
        "x": ("y", "z"),
        "y": ("x", "z"),
        "z": ("x", "y"),
    }

    touching_faces: list[dict[str, Any]] = []

    for axis, (ax1, ax2) in axes_map.items():
        o_min = float(bounds_owner[f"{axis}_min"])
        o_max = float(bounds_owner[f"{axis}_max"])
        a_min = float(bounds_adj[f"{axis}_min"])
        a_max = float(bounds_adj[f"{axis}_max"])

        # Case 1: Owning zone is on negative side, Adjacent zone is on positive side
        if abs(o_max - a_min) <= _FACE_TOL:
            t1_lo = max(float(bounds_owner[f"{ax1}_min"]), float(bounds_adj[f"{ax1}_min"]))
            t1_hi = min(float(bounds_owner[f"{ax1}_max"]), float(bounds_adj[f"{ax1}_max"]))
            t2_lo = max(float(bounds_owner[f"{ax2}_min"]), float(bounds_adj[f"{ax2}_min"]))
            t2_hi = min(float(bounds_owner[f"{ax2}_max"]), float(bounds_adj[f"{ax2}_max"]))

            if (t1_hi - t1_lo > _FACE_TOL) and (t2_hi - t2_lo > _FACE_TOL):
                touching_faces.append({
                    "axis": axis,
                    "shared_coord": o_max,
                    "owner_is_negative": True,
                    "transverse_axes": (ax1, ax2),
                })

        # Case 2: Adjacent zone is on negative side, Owning zone is on positive side
        elif abs(a_max - o_min) <= _FACE_TOL:
            t1_lo = max(float(bounds_owner[f"{ax1}_min"]), float(bounds_adj[f"{ax1}_min"]))
            t1_hi = min(float(bounds_owner[f"{ax1}_max"]), float(bounds_adj[f"{ax1}_max"]))
            t2_lo = max(float(bounds_owner[f"{ax2}_min"]), float(bounds_adj[f"{ax2}_min"]))
            t2_hi = min(float(bounds_owner[f"{ax2}_max"]), float(bounds_adj[f"{ax2}_max"]))

            if (t1_hi - t1_lo > _FACE_TOL) and (t2_hi - t2_lo > _FACE_TOL):
                touching_faces.append({
                    "axis": axis,
                    "shared_coord": a_max,
                    "owner_is_negative": False,
                    "transverse_axes": (ax1, ax2),
                })

    if not touching_faces:
        raise UnsupportedPartitionGeometryError(
            f"Rooms '{owning_zone_id}' and '{adjacent_zone_id}' do not touch at a planar face."
        )

    if len(touching_faces) > 1:
        axes_found = [f["axis"] for f in touching_faces]
        raise UnsupportedPartitionGeometryError(
            f"Rooms '{owning_zone_id}' and '{adjacent_zone_id}' touch along multiple faces "
            f"({axes_found}), which is unsupported."
        )

    face = touching_faces[0]
    ax1, ax2 = face["transverse_axes"]

    # Validate full-face contact on both transverse axes
    for ax in (ax1, ax2):
        o_lo = float(bounds_owner[f"{ax}_min"])
        o_hi = float(bounds_owner[f"{ax}_max"])
        a_lo = float(bounds_adj[f"{ax}_min"])
        a_hi = float(bounds_adj[f"{ax}_max"])

        if abs(o_lo - a_lo) > _FACE_TOL or abs(o_hi - a_hi) > _FACE_TOL:
            raise UnsupportedPartitionGeometryError(
                f"Shared interface between '{owning_zone_id}' and '{adjacent_zone_id}' "
                f"covers only part of a room face along {ax} "
                f"({owning_zone_id}: [{o_lo}, {o_hi}], {adjacent_zone_id}: [{a_lo}, {a_hi}]). "
                f"Partial-face contact is not supported for single-cuboid air zones."
            )

    return face


def plan_partition_geometry(
    rooms: list[dict[str, Any]],
    partition_spec: dict[str, Any] | None,
) -> dict[str, Any]:
    """Plan non-overlapping air-volume bounds and layered partition blocks.

    Parameters
    ----------
    rooms : list[dict]
        List of room definitions containing 'name'/'zone_id' and 'bounds' dict
        with 'x_min', 'x_max', 'y_min', 'y_max', 'z_min', 'z_max'.
    partition_spec : dict | None
        Partition assembly specification returned by building_model_to_ansys_assemblies(),
        containing 'assembly_id', 'total_thickness_m', 'layers_inner_to_outer',
        and 'interfaces'. If None (or interfaces list is empty), original rooms
        are returned as air_rooms with an empty partition_blocks list.

    Returns
    -------
    dict
        {
            "air_rooms": list[dict],       # Shortened, non-overlapping room air bounds
            "partition_blocks": list[dict] # Ordered 3D layer blocks
        }

    Raises
    ------
    UnsupportedPartitionGeometryError
        If room or partition geometry violates planar, non-overlapping, full-face,
        or positive-thickness constraints.
    """
    # 1. Do not mutate inputs
    rooms_copy = copy.deepcopy(rooms)

    if partition_spec is None:
        return {
            "air_rooms": rooms_copy,
            "partition_blocks": [],
        }

    interfaces = partition_spec.get("interfaces", [])
    if not interfaces:
        return {
            "air_rooms": rooms_copy,
            "partition_blocks": [],
        }

    # 2. Validate partition specification
    total_thickness_m = float(partition_spec.get("total_thickness_m", 0.0))
    if total_thickness_m <= 0.0:
        raise UnsupportedPartitionGeometryError(
            f"Partition total_thickness_m must be strictly positive, got {total_thickness_m}."
        )

    layers = partition_spec.get("layers_inner_to_outer", [])
    if not layers:
        raise UnsupportedPartitionGeometryError(
            "Partition specification missing 'layers_inner_to_outer'."
        )

    sum_thickness_m = 0.0
    for idx, lyr in enumerate(layers):
        t_mm = float(lyr.get("thickness_mm", 0.0))
        if t_mm <= 0.0:
            raise UnsupportedPartitionGeometryError(
                f"Partition layer {idx} has non-positive thickness: {t_mm} mm."
            )
        sum_thickness_m += t_mm / 1000.0

    if abs(sum_thickness_m - total_thickness_m) > 1e-5:
        raise UnsupportedPartitionGeometryError(
            f"Sum of layer thicknesses ({sum_thickness_m:.6f} m) does not match "
            f"total_thickness_m ({total_thickness_m:.6f} m)."
        )

    assembly_id = partition_spec.get("assembly_id", "unknown_partition_assembly")
    half_thickness = total_thickness_m / 2.0

    # 3. Index rooms by zone ID (unmodified copy for contact detection)
    original_room_by_id: dict[str, dict[str, Any]] = {}
    active_room_by_id: dict[str, dict[str, Any]] = {}

    for r in rooms:
        zid = _get_zone_id(r)
        if zid in original_room_by_id:
            raise UnsupportedPartitionGeometryError(f"Duplicate room ID '{zid}' in input rooms.")
        original_room_by_id[zid] = copy.deepcopy(r)

    for r in rooms_copy:
        zid = _get_zone_id(r)
        active_room_by_id[zid] = r

    partition_blocks: list[dict[str, Any]] = []

    # 4. Process each interface
    for interface in interfaces:
        surface_id = interface.get("surface_id", "")
        owning_zone_id = interface.get("owning_zone_id", "")
        adjacent_zone_id = interface.get("adjacent_zone_id", "")

        if not surface_id or not owning_zone_id or not adjacent_zone_id:
            raise UnsupportedPartitionGeometryError(
                f"Interface entry missing required fields: {interface}"
            )

        if owning_zone_id not in original_room_by_id:
            raise UnsupportedPartitionGeometryError(
                f"Interface references unknown owning_zone_id '{owning_zone_id}'."
            )
        if adjacent_zone_id not in original_room_by_id:
            raise UnsupportedPartitionGeometryError(
                f"Interface references unknown adjacent_zone_id '{adjacent_zone_id}'."
            )
        if owning_zone_id == adjacent_zone_id:
            raise UnsupportedPartitionGeometryError(
                f"Self-adjacent interface detected for zone '{owning_zone_id}'."
            )

        bounds_owner_orig = original_room_by_id[owning_zone_id]["bounds"]
        bounds_adj_orig = original_room_by_id[adjacent_zone_id]["bounds"]

        # Detect touching face on ORIGINAL unmodified bounds
        face = _detect_touching_face(
            bounds_owner_orig, bounds_adj_orig, owning_zone_id, adjacent_zone_id
        )

        axis = face["axis"]
        shared_coord = face["shared_coord"]
        owner_is_neg = face["owner_is_negative"]
        ax1, ax2 = face["transverse_axes"]

        # Identify negative and positive zone IDs
        if owner_is_neg:
            neg_zone_id = owning_zone_id
            pos_zone_id = adjacent_zone_id
            direction = +1   # owning -> adjacent is toward +axis
        else:
            neg_zone_id = adjacent_zone_id
            pos_zone_id = owning_zone_id
            direction = -1   # owning -> adjacent is toward -axis

        # Validate that partition half-thickness does not consume either room
        dim_neg = shared_coord - float(original_room_by_id[neg_zone_id]["bounds"][f"{axis}_min"])
        dim_pos = float(original_room_by_id[pos_zone_id]["bounds"][f"{axis}_max"]) - shared_coord

        if dim_neg <= half_thickness + _FACE_TOL:
            raise UnsupportedPartitionGeometryError(
                f"Partition half-thickness ({half_thickness:.4f} m) removes complete dimension "
                f"of room '{neg_zone_id}' along {axis} ({dim_neg:.4f} m)."
            )
        if dim_pos <= half_thickness + _FACE_TOL:
            raise UnsupportedPartitionGeometryError(
                f"Partition half-thickness ({half_thickness:.4f} m) removes complete dimension "
                f"of room '{pos_zone_id}' along {axis} ({dim_pos:.4f} m)."
            )

        # 5. Shorten both adjacent air volumes in active_room_by_id
        active_room_by_id[neg_zone_id]["bounds"][f"{axis}_max"] = round(shared_coord - half_thickness, 6)
        active_room_by_id[pos_zone_id]["bounds"][f"{axis}_min"] = round(shared_coord + half_thickness, 6)

        # 6. Build partition layer blocks from owning zone toward adjacent zone
        span_ax1_min = round(float(bounds_owner_orig[f"{ax1}_min"]), 6)
        span_ax1_max = round(float(bounds_owner_orig[f"{ax1}_max"]), 6)
        span_ax2_min = round(float(bounds_owner_orig[f"{ax2}_min"]), 6)
        span_ax2_max = round(float(bounds_owner_orig[f"{ax2}_max"]), 6)

        if direction == +1:
            # Owning zone is on negative side; start at partition negative boundary and advance +axis
            cur_coord = round(shared_coord - half_thickness, 6)
            for layer_idx, lyr in enumerate(layers):
                t_m = round(float(lyr["thickness_mm"]) / 1000.0, 6)
                nxt_coord = round(cur_coord + t_m, 6)
                lo_axis = cur_coord
                hi_axis = nxt_coord
                cur_coord = nxt_coord

                axis_bounds = {
                    f"{axis}_min": lo_axis,
                    f"{axis}_max": hi_axis,
                    f"{ax1}_min": span_ax1_min,
                    f"{ax1}_max": span_ax1_max,
                    f"{ax2}_min": span_ax2_min,
                    f"{ax2}_max": span_ax2_max,
                }

                partition_blocks.append({
                    "surface_id": surface_id,
                    "owning_zone_id": owning_zone_id,
                    "adjacent_zone_id": adjacent_zone_id,
                    "assembly_id": assembly_id,
                    "layer_index": layer_idx,
                    "material": lyr["material"],
                    "thickness_m": t_m,
                    "bounds": {
                        "x_min": axis_bounds["x_min"],
                        "x_max": axis_bounds["x_max"],
                        "y_min": axis_bounds["y_min"],
                        "y_max": axis_bounds["y_max"],
                        "z_min": axis_bounds["z_min"],
                        "z_max": axis_bounds["z_max"],
                    },
                })
        else:
            # Owning zone is on positive side; start at partition positive boundary and advance -axis
            cur_coord = round(shared_coord + half_thickness, 6)
            for layer_idx, lyr in enumerate(layers):
                t_m = round(float(lyr["thickness_mm"]) / 1000.0, 6)
                nxt_coord = round(cur_coord - t_m, 6)
                lo_axis = min(cur_coord, nxt_coord)
                hi_axis = max(cur_coord, nxt_coord)
                cur_coord = nxt_coord

                axis_bounds = {
                    f"{axis}_min": lo_axis,
                    f"{axis}_max": hi_axis,
                    f"{ax1}_min": span_ax1_min,
                    f"{ax1}_max": span_ax1_max,
                    f"{ax2}_min": span_ax2_min,
                    f"{ax2}_max": span_ax2_max,
                }

                partition_blocks.append({
                    "surface_id": surface_id,
                    "owning_zone_id": owning_zone_id,
                    "adjacent_zone_id": adjacent_zone_id,
                    "assembly_id": assembly_id,
                    "layer_index": layer_idx,
                    "material": lyr["material"],
                    "thickness_m": t_m,
                    "bounds": {
                        "x_min": axis_bounds["x_min"],
                        "x_max": axis_bounds["x_max"],
                        "y_min": axis_bounds["y_min"],
                        "y_max": axis_bounds["y_max"],
                        "z_min": axis_bounds["z_min"],
                        "z_max": axis_bounds["z_max"],
                    },
                })

    # 7. Post-planning integrity checks
    # A. Check validity of calculated air bounds
    for r in rooms_copy:
        b = r["bounds"]
        if (
            b["x_max"] <= b["x_min"] + _FACE_TOL
            or b["y_max"] <= b["y_min"] + _FACE_TOL
            or b["z_max"] <= b["z_min"] + _FACE_TOL
        ):
            raise UnsupportedPartitionGeometryError(
                f"Calculated air bounds for room '{_get_zone_id(r)}' are invalid: {b}"
            )

    # B. Check that air rooms do not overlap each other
    for i in range(len(rooms_copy)):
        for j in range(i + 1, len(rooms_copy)):
            if _boxes_overlap_volume(rooms_copy[i]["bounds"], rooms_copy[j]["bounds"]):
                raise UnsupportedPartitionGeometryError(
                    f"Air rooms '{_get_zone_id(rooms_copy[i])}' and '{_get_zone_id(rooms_copy[j])}' "
                    f"spatially overlap."
                )

    # C. Check that partition blocks do not overlap each other
    for i in range(len(partition_blocks)):
        for j in range(i + 1, len(partition_blocks)):
            if _boxes_overlap_volume(partition_blocks[i]["bounds"], partition_blocks[j]["bounds"]):
                raise UnsupportedPartitionGeometryError(
                    f"Partition blocks '{partition_blocks[i]['surface_id']}' (layer {partition_blocks[i]['layer_index']}) "
                    f"and '{partition_blocks[j]['surface_id']}' (layer {partition_blocks[j]['layer_index']}) "
                    f"spatially overlap."
                )

    # D. Check that partition blocks do not overlap any air room
    for blk in partition_blocks:
        for r in rooms_copy:
            if _boxes_overlap_volume(blk["bounds"], r["bounds"]):
                raise UnsupportedPartitionGeometryError(
                    f"Partition block '{blk['surface_id']}' (layer {blk['layer_index']}) "
                    f"spatially overlaps with air room '{_get_zone_id(r)}'."
                )

    return {
        "air_rooms": rooms_copy,
        "partition_blocks": partition_blocks,
    }
