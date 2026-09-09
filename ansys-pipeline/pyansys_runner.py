"""
pyansys_runner.py

Runs ONE full ANSYS transient-thermal validation of a shelter design and
writes results comparable to the Python physics engine.

Independence rule (physics architecture doc, section 9): ANSYS is given
only geometry, materials, h-values and the *weather* boundary
(outdoor temperature + solar irradiance per hour). It never sees the
physics engine's predicted indoor temperature. The two models simulate
the same scenario independently; comparison happens afterwards
(see comparison.py).

Solar is applied as WINDOW gain: shortwave passes through the glazing and
is absorbed inside, so the hourly gain

    Q_solar = SHGC * A_glazing * G          (heat_transfer.resolve_solar_aperture
                                             + calculate_solar_gain)

is injected as an inward heat flux on the FLOOR inner surface -- where
direct-gain solar through a south window actually lands, and where the
massive stone slab absorbs it without its surface temperature running
away. This matches the RC model, whose single lumped node carries the
envelope capacitance (floor slab included), so its Q_solar heats thermal
mass, not a separate air node.

Rejected alternatives: dumping the watts into the small indoor-air volume
makes the ANSYS air race many degrees ahead of the mass within the hour;
spreading the flux over all interior faces makes an insulating inner
layer (PUF, in the insulation-inside wall) spike because heat cannot
diffuse away from its surface; a sol-air bump on the exterior models
opaque-wall absorption, not a transparent aperture.

The exterior envelope sees plain outdoor-air convection at T_out. Any
internal_heat_gain_W is injected with the solar gain.

Usage:
    python pyansys_runner.py                      # baseline, first 48 h
    python pyansys_runner.py --hours 24
    python pyansys_runner.py --case case_insulated --hours 48
"""

import os
import sys
import json
import argparse

import numpy as np
import pandas as pd
from ansys.mapdl.core import launch_mapdl

HERE = os.path.dirname(os.path.abspath(__file__))
CALC_DIR = os.path.join(HERE, "..", "thermal-calculator")
sys.path.insert(0, CALC_DIR)

from config import SHELTER_CONFIG              # noqa: E402
from materials import load_materials           # noqa: E402
from geometry_builder import (                 # noqa: E402
    build_shelter, INSIDE_FILM_THICKNESS_M)
from heat_transfer import resolve_solar_aperture  # noqa: E402

ANSYS_EXEC = r"C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe"
MATERIAL_DB_PATH = os.path.join(CALC_DIR, "data", "material_properties.json")
DEFAULT_WEATHER_CSV = os.path.join(
    CALC_DIR, "results", "ansys_boundary_conditions.csv")
RESULTS_ROOT = os.path.join(HERE, "results")

KELVIN = 273.15
CONTOUR_FRACTIONS = (0.0, 0.25, 0.5, 0.75, 1.0)   # where in the window to snapshot


def run_case(config, weather_csv_path, case_name, max_hours=48,
             element_size_m=0.15, fast=False):
    """``fast=True``: 4-core solve, 1-4 substeps per hour, and skip the
    contour / mesh-temperature exports. Pair with a coarser
    ``element_size_m`` (e.g. 0.30). For quick RC-vs-FEM checks where only
    the indoor temperature series is needed."""
    out_dir = os.path.join(RESULTS_ROOT, case_name)
    run_loc = os.path.join(out_dir, "ansys_run")
    frames_dir = os.path.join(out_dir, "contour_frames")
    for d in (out_dir, run_loc, frames_dir):
        os.makedirs(d, exist_ok=True)

    materials_db = load_materials(MATERIAL_DB_PATH)
    weather = pd.read_csv(weather_csv_path)
    if max_hours:
        weather = weather.iloc[:max_hours].reset_index(drop=True)
    n_steps = len(weather)

    cfg = dict(config)
    cfg["_ansys_element_size_m"] = element_size_m

    h_out = config["heat_transfer"]["h_outside_W_m2K"]
    # glazing area x glazing SHGC, from configuration["windows"] -- the
    # exact same resolver and formula the RC model uses for Q_solar, so
    # the two pipelines see identical solar gain (see heat_transfer)
    solar_area, eta_solar = resolve_solar_aperture(config)
    internal_heat_W = float(config.get("internal_heat_gain_W", 0.0))
    T_init_K = config["initial_temperature_C"] + KELVIN
    ground_mode = config.get("ground_temperature_mode", "manual")
    ground_T_C = config.get("ground_temperature_C",
                            config["initial_temperature_C"])

    print(f"\n[{case_name}] launching ANSYS ({n_steps} hourly steps)...")
    switches = "-m 3000 -db 1024" + (" -np 4" if fast else "")
    mapdl = launch_mapdl(exec_file=ANSYS_EXEC, run_location=run_loc,
                         override=True, cleanup_on_exit=True, start_timeout=180,
                         additional_switches=switches)
    try:
        mapdl.clear()
        mapdl.prep7()

        print(f"[{case_name}] building geometry + mesh...")
        info = build_shelter(mapdl, cfg, materials_db)
        air_mat = info["air_mat"]
        film_mat = info["mat_map"]["__film__"]
        ext_area = info["ext_area_m2"]
        fc = info["faces"]
        L_i, W_i, H_i = info["L"], info["W"], info["H"]
        # the window solar flux lands on the floor slab's top face: the
        # plane just behind the inside film (z = -film thickness), so it
        # heats mass without an extra 1/h_inside in the way -- the RC
        # model adds Q_solar straight to its lumped node
        floor_top_z = -INSIDE_FILM_THICKNESS_M
        floor_area_m2 = L_i * W_i
        n_nodes = int(mapdl.get_value("NODE", 0, "COUNT"))
        n_elems = int(mapdl.get_value("ELEM", 0, "COUNT"))
        print(f"[{case_name}]   ext envelope area = {ext_area:.1f} m^2, "
              f"{n_nodes} nodes / {n_elems} elements")

        # ---------------- transient solve ----------------
        mapdl.finish()
        mapdl.slashsolu()
        mapdl.antype("TRANS")
        mapdl.trnopt("FULL")
        mapdl.timint("ON")
        mapdl.kbc(1)                 # stepped: hourly-constant loads, like the RC loop
        mapdl.autots("ON")
        mapdl.nsubst(1, 4, 1) if fast else mapdl.nsubst(4, 20, 1)
        mapdl.outres("ALL", "LAST")
        mapdl.tunif(T_init_K)        # whole model starts where the RC model started

        contour_steps = sorted({max(1, min(n_steps, round(f * n_steps)))
                                for f in CONTOUR_FRACTIONS})

        for i, row in enumerate(weather.itertuples(index=False), start=1):
            T_out_K = row.outdoor_temperature_C + KELVIN
            G = max(0.0, float(row.solar_radiation_W_m2))

            # window solar + internal gains -> onto the floor slab,
            # matching the RC model's Q_net (its lumped node carries the
            # envelope mass, not the air)
            solar_W = eta_solar * solar_area * G
            interior_gain_W = solar_W + internal_heat_W
            floor_flux_W_m2 = (interior_gain_W / floor_area_m2
                               if floor_area_m2 > 0 else 0.0)

            if ground_mode == "track_ambient":
                T_ground_K = T_out_K
            else:
                T_ground_K = ground_T_C + KELVIN

            # exterior envelope (4 wall skins + roof skin): plain
            # convection to outdoor air (no sol-air term -- see module
            # docstring)
            mapdl.allsel()
            mapdl.asel("S", "LOC", "X", fc["x_w"])
            mapdl.asel("A", "LOC", "X", fc["x_e"])
            mapdl.asel("A", "LOC", "Y", fc["y_s"])
            mapdl.asel("A", "LOC", "Y", fc["y_n"])
            mapdl.asel("A", "LOC", "Z", fc["z_r"])
            mapdl.nsla("S", 1)
            mapdl.sf("ALL", "CONV", h_out, T_out_K)

            # floor underside: convection to ground temperature
            mapdl.allsel()
            mapdl.asel("S", "LOC", "Z", fc["z_f"])
            mapdl.nsla("S", 1)
            mapdl.sf("ALL", "CONV", h_out, T_ground_K)

            # floor slab top face: inward heat flux = window solar +
            # internal gains. Select nodes on the film<->floor interface
            # plane, keep only floor-solid nodes (not air, not film), load
            # their faces.
            mapdl.allsel()
            mapdl.nsel("S", "LOC", "Z", floor_top_z)
            mapdl.esel("U", "MAT", "", air_mat)
            mapdl.esel("U", "MAT", "", film_mat)
            mapdl.nsle("R")
            mapdl.sf("ALL", "HFLUX", floor_flux_W_m2)

            mapdl.allsel()
            mapdl.time(i * 3600.0)
            mapdl.solve()

            if i % 6 == 0 or i == n_steps:
                print(f"[{case_name}]   step {i}/{n_steps}  "
                      f"T_out={row.outdoor_temperature_C:6.1f}C  "
                      f"G={G:6.1f}  Q_solar={solar_W:7.1f}W")
        mapdl.finish()

        # ---------------- extract indoor air temperature ----------------
        print(f"[{case_name}] extracting indoor air temperature history...")
        mapdl.post1()
        rows = []
        for step in range(1, n_steps + 1):
            mapdl.set(step, "LAST")
            mapdl.allsel()
            mapdl.esel("S", "MAT", "", air_mat)
            mapdl.nsle("S")
            temps_K = np.asarray(mapdl.post_processing.nodal_temperature())
            rows.append({
                "elapsed_seconds": step * 3600,
                "timestamp": weather["timestamp"].iloc[step - 1],
                "T_ansys_C": float(temps_K.mean()) - KELVIN,
                "T_ansys_min_C": float(temps_K.min()) - KELVIN,
                "T_ansys_max_C": float(temps_K.max()) - KELVIN,
            })
        series = pd.DataFrame(rows)
        series_path = os.path.join(out_dir, "temperature_series.csv")
        series.to_csv(series_path, index=False)
        print(f"[{case_name}] saved {series_path}")

        if fast:
            print(f"[{case_name}] fast mode: skipping mesh + contour exports")
        else:
            try:
                _export_mesh_temperature(mapdl, weather, out_dir, case_name)
            except Exception as exc:                   # noqa: BLE001
                print(f"[{case_name}] mesh_temperature export skipped: {exc}")
            try:
                _export_contours(mapdl, weather, contour_steps, frames_dir, case_name)
            except Exception as exc:                   # noqa: BLE001
                print(f"[{case_name}] contour export skipped: {exc}")

    finally:
        mapdl.exit()

    return series


def _export_mesh_temperature(mapdl, weather, out_dir, case_name, max_nodes=700):
    """Lightweight node positions + per-hour temperatures for the web 3D
    viewer (PRD section 7.5.2). Exterior nodes only, downsampled.

    The full node list / coordinates are read from MAPDL exactly ONCE;
    per-step we only pull the temperature vector for the same fixed
    selection (its order matches mesh.nnum), so nothing re-queries the
    solid-model-associated mesh accessor in a loop."""
    mapdl.post1()
    mapdl.set(1, "LAST")
    mapdl.allsel()
    nnum_all = np.asarray(mapdl.mesh.nnum)
    coord_all = np.asarray(mapdl.mesh.nodes)

    # exterior nodes: on any of the 6 outer coordinate planes
    xyz = coord_all
    xmin, xmax = xyz[:, 0].min(), xyz[:, 0].max()
    ymin, ymax = xyz[:, 1].min(), xyz[:, 1].max()
    zmin, zmax = xyz[:, 2].min(), xyz[:, 2].max()
    tol = 1e-4
    on_skin = (
        np.isclose(xyz[:, 0], xmin, atol=tol) | np.isclose(xyz[:, 0], xmax, atol=tol) |
        np.isclose(xyz[:, 1], ymin, atol=tol) | np.isclose(xyz[:, 1], ymax, atol=tol) |
        np.isclose(xyz[:, 2], zmin, atol=tol) | np.isclose(xyz[:, 2], zmax, atol=tol))
    idx = np.where(on_skin)[0]
    if len(idx) > max_nodes:
        idx = idx[np.linspace(0, len(idx) - 1, max_nodes).astype(int)]

    n_steps = len(weather)
    temps = np.full((n_steps, len(idx)), np.nan)
    for s in range(1, n_steps + 1):
        mapdl.set(s, "LAST")
        mapdl.allsel()
        allK = np.asarray(mapdl.post_processing.nodal_temperature())  # nnum_all order
        temps[s - 1] = allK[idx] - 273.15

    payload = {
        "case": case_name,
        "timesteps": [str(t) for t in weather["timestamp"].tolist()],
        "nodes": [[round(float(v), 3) for v in coord_all[i]] for i in idx],
        "temps_C": [[round(float(v), 2) for v in frame] for frame in temps],
    }
    path = os.path.join(out_dir, "mesh_temperature.json")
    with open(path, "w") as fh:
        json.dump(payload, fh)
    print(f"[{case_name}] saved {path}  ({len(idx)} nodes x {n_steps} steps)")


def _export_contours(mapdl, weather, steps, frames_dir, case_name):
    """Temperature contour PNGs at representative hours, rendered by
    MAPDL's own PNG device (no pyvista dependency). Isometric full-model
    view; the exposed layer cross-sections at the open corners show the
    gradient through each material."""
    print(f"[{case_name}] writing {len(steps)} contour frames...")
    mapdl.run("/SHOW,PNG", mute=True)
    mapdl.run("/VIEW,1,1,-2,1", mute=True)
    mapdl.run("/ANG,1", mute=True)
    mapdl.run("/PLOPTS,INFO,3", mute=True)
    mapdl.run("/EDGE,1,1,30", mute=True)
    for step in steps:
        mapdl.set(step, "LAST")
        mapdl.allsel()
        mapdl.run("PLNSOL,TEMP", mute=True)
    mapdl.run("/SHOW,CLOSE", mute=True)

    produced = sorted(f for f in os.listdir(mapdl.directory)
                      if f.lower().endswith(".png"))
    produced = produced[-len(steps):] if len(produced) >= len(steps) else produced
    for png, step in zip(produced, steps):
        ts = str(weather["timestamp"].iloc[step - 1]).replace(":", "").replace(" ", "_")
        dst = os.path.join(frames_dir, f"temp_step{step:03d}_{ts}.png")
        try:
            os.replace(os.path.join(mapdl.directory, png), dst)
        except OSError:
            pass


if __name__ == "__main__":
    import copy

    ap = argparse.ArgumentParser()
    ap.add_argument("--case", default="case_baseline")
    ap.add_argument("--hours", type=int, default=48)
    ap.add_argument("--weather", default=DEFAULT_WEATHER_CSV)
    ap.add_argument("--element-size", type=float, default=0.15)
    ap.add_argument(
        "--reverse-walls", action="store_true",
        help="build with the wall layer order reversed -- the pre-Step-1 "
             "insulation-inside design that matches case_insulation_inside. "
             "Pair with 'comparison.py --reverse-walls'.")
    args = ap.parse_args()

    cfg = SHELTER_CONFIG
    if args.reverse_walls:
        cfg = copy.deepcopy(SHELTER_CONFIG)
        cfg["walls"] = list(reversed(cfg["walls"]))

    run_case(cfg, args.weather, args.case,
             max_hours=args.hours, element_size_m=args.element_size)
