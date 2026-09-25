"""
pyansys_runner.py - Solve one frozen validation package in ANSYS MAPDL.

1. rebuild the resolved hex model from the package (deterministic)
2. write it as ONE APDL input file: materials, explicit nodes (N) and
   SOLID70 bricks (EN), stepped load tables, and element-face loads (SFE):
     exterior faces   CONV  h = 1/r_outside_film, bulk = %TOUT% or %TGRD%
     zone slab faces  HFLUX = (window solar + internal gains) / slab area
3. transient solve: backward Euler, fixed step dt = 3600/substeps, run in
   6-hour chunks so progress and the timeout are checked between chunks
4. read nodal temperatures at every whole hour and reduce them to
   zone air temperatures (volume-weighted), surface temperatures and
   surface heat flows

Loads are hourly-constant: tables hold hour k's value over (t_k, t_k+1],
exactly how the RC engine holds weather over a step, so the result at
t_k+1 is compared with the RC state after step k.
"""

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from cocoon_ansys.contracts_io import load_building, load_materials, load_weather
from cocoon_ansys.geometry_builder import resolve
from cocoon_ansys.paths import ansys_executable, ensure_import_paths
from cocoon_ansys.validation_package import mesh_config_for, timestep_s

ensure_import_paths()
from cocoon_contracts import AnsysSolverConfig                 # noqa: E402

CHUNK_HOURS = 6


class AnsysUnavailable(RuntimeError):
    """MAPDL could not be launched (no install/licence/executable)."""


class SolveTimeout(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# APDL model file
# ---------------------------------------------------------------------------

def _table(lines, name, times_values):
    """Stepped 1-D table: value v_k held over (t_k, t_k+1]."""
    rows = [(0.0, times_values[0][1])]
    for k, (t0, v) in enumerate(times_values):
        if k > 0:
            rows.append((t0 + 1e-3, v))
        rows.append((t0 + 3600.0, v))
    lines.append(f"*DIM,{name},TABLE,{len(rows)},1,1,TIME")
    lines.append(f"{name}(0,1)=1")
    for i, (t, v) in enumerate(rows, start=1):
        lines.append(f"{name}({i},0)={t:.4f}")
        lines.append(f"{name}({i},1)={v:.6g}")


def write_apdl(model, bc: pd.DataFrame, path: Path):
    lines = ["/NERR,,99999999", "/NOPR", "/PREP7", "ET,1,SOLID70"]

    mat_keys = sorted(model.materials)
    matnum = {k: i + 1 for i, k in enumerate(mat_keys)}
    for key in mat_keys:
        p = model.materials[key]
        n = matnum[key]
        lines += [f"MP,KXX,{n},{p['kx']:.8g}", f"MP,KYY,{n},{p['ky']:.8g}",
                  f"MP,KZZ,{n},{p['kz']:.8g}", f"MP,DENS,{n},{p['dens']:.8g}",
                  f"MP,C,{n},{p['c']:.8g}"]

    gids, coords = model.node_table()
    for i, (x, y, z) in enumerate(coords, start=1):
        lines.append(f"N,{i},{x:.9g},{y:.9g},{z:.9g}")

    cells = model.cells()
    cell_mat = np.array([matnum[model.blocks[int(model.owner[tuple(c)])].mat] for c in cells])
    order = np.argsort(cell_mat, kind="stable")
    cells, cell_mat = cells[order], cell_mat[order]
    enodes = model.node_numbers(model.element_node_gids(cells).ravel()).reshape(-1, 8)
    eid = np.zeros(model.owner.shape, dtype=np.int64)
    current = None
    for e, (c, m, nn) in enumerate(zip(cells, cell_mat, enodes), start=1):
        if m != current:
            lines += ["TYPE,1", f"MAT,{m}"]
            current = m
        lines.append("EN,{},{}".format(e, ",".join(str(int(v)) for v in nn)))
        eid[tuple(c)] = e

    hours = bc["elapsed_start_s"].to_numpy()
    _table(lines, "TOUT", list(zip(hours, bc["T_out_C"])))
    _table(lines, "TGRD", list(zip(hours, bc["T_ground_C"])))
    have_wind = "h_out_wind_W_m2K" in bc.columns
    if have_wind:
        _table(lines, "HOUT", list(zip(hours, bc["h_out_wind_W_m2K"])))
    flux_tables = {}
    for n, (zid, z) in enumerate(model.zones.items(), start=1):
        if z["gain_area_m2"] <= 0:
            continue
        name = f"QF{n}"
        flux_tables[zid] = name
        _table(lines, name, list(zip(hours, bc[f"Qfloor_{zid}_W"] / z["gain_area_m2"])))

    for f in model.bc_faces:
        tab = "TOUT" if f["kind"] == "outdoors" else "TGRD"
        # wind-modulated film only for opaque exterior faces (§14.6); ground
        # floors and openings keep the static contract h (see module docstring)
        wind_face = have_wind and f["kind"] == "outdoors" and f["opening_id"] is None
        h_val = "%HOUT%" if wind_face else f"{f['h']:.8g}"
        for c in f["cells"]:
            e = int(eid[tuple(c)])
            lines.append(f"SFE,{e},{f['lkey']},CONV,1,{h_val}")
            lines.append(f"SFE,{e},{f['lkey']},CONV,2,%{tab}%")
    for zid, name in flux_tables.items():
        for c in model.zones[zid]["gain_cells"]:
            lines.append(f"SFE,{int(eid[tuple(c)])},6,HFLUX,,%{name}%")

    lines += ["ALLSEL", "FINISH", "/GOPR"]
    path.write_text("\n".join(lines) + "\n", encoding="ascii")
    return {"matnum": matnum, "eid": eid, "n_nodes": len(coords), "n_elems": len(cells),
            "flux_tables": flux_tables}


# ---------------------------------------------------------------------------
# post-processing helpers (pure numpy on a nodal temperature vector)
# ---------------------------------------------------------------------------

class Reducer:
    def __init__(self, model):
        self.m = model
        dx, dy, dz = np.diff(model.xs), np.diff(model.ys), np.diff(model.zs)
        self.zone_idx, self.zone_w = {}, {}
        for zid, z in model.zones.items():
            c = z["air_cells"]
            self.zone_idx[zid] = model.node_numbers(model.element_node_gids(c).ravel()).reshape(-1, 8) - 1
            self.zone_w[zid] = dx[c[:, 0]] * dy[c[:, 1]] * dz[c[:, 2]]
        self.surf_idx = {sid: model.node_numbers(s["inner_face_gids"]) - 1
                         for sid, s in model.surfaces.items()
                         if len(s.get("inner_face_gids", [])) > 0}
        self.faces = []
        for f in model.bc_faces:
            idx = model.node_numbers(model.face_node_gids(f["cells"], f["axis"], f["sign"]).ravel())
            self.faces.append((f, idx.reshape(-1, 4) - 1))

    def zone_temps(self, T):
        out = {}
        for zid, idx in self.zone_idx.items():
            cell_T = T[idx].mean(axis=1)
            w = self.zone_w[zid]
            out[zid] = (float((cell_T * w).sum() / w.sum()), float(T[idx].min()),
                        float(T[idx].max()))
        return out

    def surface_temps(self, T):
        return {sid: float(T[idx].mean()) for sid, idx in self.surf_idx.items()}

    def heat_flows(self, T, t_out, t_ground, zone_T):
        """W leaving each surface's zone: exterior via convection faces,
        interfaces via the zone-a film (positive = a -> b)."""
        q = {}
        for f, idx in self.faces:
            bulk = t_out if f["kind"] == "outdoors" else t_ground
            face_T = T[idx].mean(axis=1)
            key = f["surface_id"] if not f["opening_id"] else f"{f['surface_id']}/{f['opening_id']}"
            q[key] = q.get(key, 0.0) + float((f["h"] * f["areas"] * (face_T - bulk)).sum())
        for itf in self.m.interfaces:
            sid = itf["surface_id"]
            if sid in self.surf_idx:
                s = self.m.surfaces[sid]
                t_face = float(T[self.surf_idx[sid]].mean())
                q[sid] = s["film_face_area_m2"] / itf["r_film_a"] * (zone_T[itf["a"]] - t_face)
        return q


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------

def run(job_dir, on_stage=None, export_images=True, n_proc=4):
    """Solve the package in job_dir. Writes result files into job_dir and
    returns a dict for the worker. on_stage(status, detail) reports
    PREPARING / MESHING / SOLVING / EXPORTING."""
    job_dir = Path(job_dir)
    pkg = job_dir / "package"
    report = on_stage or (lambda s, d="": None)
    t_start = time.time()
    timings = {}

    report("PREPARING", "rebuilding model from frozen package")
    building = load_building(pkg / "building.json")
    weather = load_weather(pkg / "weather.json")
    materials = load_materials(pkg / "materials.json")
    solver_cfg = AnsysSolverConfig.model_validate_json((pkg / "solver_config.json").read_text(encoding="utf-8"))
    scenario = json.loads((pkg / "scenario.json").read_text(encoding="utf-8"))
    bc = pd.read_csv(pkg / "boundary_conditions.csv")
    model = resolve(building, materials, mesh_config_for(solver_cfg))
    dt = timestep_s(solver_cfg)
    n_hours = len(bc)
    work = job_dir / "_mapdl_work"
    work.mkdir(exist_ok=True)
    apdl_path = work / "model.inp"
    info = write_apdl(model, bc, apdl_path)
    timings["prepare_s"] = round(time.time() - t_start, 1)

    exe = ansys_executable()
    if not Path(exe).exists():
        raise AnsysUnavailable(f"ANSYS executable not found at {exe} "
                               "(set ANSYS_EXECUTABLE_PATH)")
    try:
        from ansys.mapdl.core import launch_mapdl
    except ImportError as exc:
        raise AnsysUnavailable(f"ansys-mapdl-core not installed: {exc}") from exc

    report("MESHING", f"{info['n_nodes']} nodes / {info['n_elems']} SOLID70 elements")
    t0 = time.time()
    try:
        mapdl = launch_mapdl(exec_file=exe, run_location=str(work), override=True,
                             cleanup_on_exit=True, start_timeout=240,
                             additional_switches=f"-m 3000 -db 1024 -np {n_proc}")
    except Exception as exc:                                   # noqa: BLE001
        raise AnsysUnavailable(f"MAPDL failed to launch: {exc}") from exc

    result = {}
    try:
        mapdl.clear()
        mapdl.input(str(apdl_path))
        n_nodes = int(mapdl.get_value("NODE", 0, "COUNT"))
        n_elems = int(mapdl.get_value("ELEM", 0, "COUNT"))
        if n_nodes != info["n_nodes"] or n_elems != info["n_elems"]:
            raise RuntimeError(f"MAPDL mesh mismatch: {n_nodes}/{n_elems} vs "
                               f"{info['n_nodes']}/{info['n_elems']}")
        timings["mesh_s"] = round(time.time() - t0, 1)

        # ---- transient solve --------------------------------------------
        t0 = time.time()
        mapdl.slashsolu()
        mapdl.antype("TRANS")
        mapdl.trnopt("FULL")
        mapdl.timint("ON")
        mapdl.run("TINTP,,,,1.0")                # backward Euler, like the RC step
        mapdl.autots("OFF")
        mapdl.deltim(dt)
        mapdl.kbc(1)
        mapdl.outres("ERASE")
        mapdl.outres("NSOL", int(round(3600.0 / dt)))
        mapdl.allsel()
        mapdl.ic("ALL", "TEMP", scenario["initial_temperature_c"])
        done = 0
        while done < n_hours:
            step = min(CHUNK_HOURS, n_hours - done)
            done += step
            mapdl.time(done * 3600.0)
            mapdl.solve()
            elapsed = time.time() - t_start
            report("SOLVING", f"{done}/{n_hours} h solved ({elapsed:.0f} s)")
            if elapsed > solver_cfg.timeout_seconds and done < n_hours:
                raise SolveTimeout(f"stopped after {done}/{n_hours} h: "
                                   f"{elapsed:.0f} s > timeout {solver_cfg.timeout_seconds} s")
        mapdl.finish()
        timings["solve_s"] = round(time.time() - t0, 1)

        # ---- extraction --------------------------------------------------
        report("EXPORTING", "reading nodal temperatures")
        t0 = time.time()
        mapdl.post1()
        red = Reducer(model)
        zone_rows, surf_rows, flux_rows = [], [], []
        frames = []
        for k in range(n_hours):
            t_end = (k + 1) * 3600.0
            mapdl.set(time=t_end)
            mapdl.allsel()
            T = np.asarray(mapdl.post_processing.nodal_temperature(), float)
            if len(T) != info["n_nodes"]:
                raise RuntimeError("nodal temperature vector length mismatch")
            frames.append(T)
            ts_end = (pd.Timestamp(bc["timestamp"].iloc[k]) + pd.Timedelta(hours=1)).isoformat()
            zt = red.zone_temps(T)
            row = {"timestamp": ts_end, "elapsed_s": t_end}
            for zid, (mean, lo, hi) in zt.items():
                row[f"T_{zid}_C"] = round(mean, 4)
                row[f"T_{zid}_min_C"] = round(lo, 4)
                row[f"T_{zid}_max_C"] = round(hi, 4)
            zone_rows.append(row)
            surf_rows.append({"timestamp": ts_end,
                              **{f"T_{s}_C": round(v, 4) for s, v in red.surface_temps(T).items()}})
            q = red.heat_flows(T, bc["T_out_C"].iloc[k], bc["T_ground_C"].iloc[k],
                               {z: v[0] for z, v in zt.items()})
            flux_rows.append({"timestamp": ts_end, **{f"Q_{s}_W": round(v, 3) for s, v in q.items()}})

        pd.DataFrame(zone_rows).to_csv(job_dir / "temperature_series.csv", index=False)
        pd.DataFrame(surf_rows).to_csv(job_dir / "surface_temperature_series.csv", index=False)
        pd.DataFrame(flux_rows).to_csv(job_dir / "heat_flux_series.csv", index=False)
        _write_viewer_payload(job_dir, model, red, frames, zone_rows, scenario)
        timings["extract_s"] = round(time.time() - t0, 1)

        images = {}
        if export_images:
            from cocoon_ansys.contour_export import export_images as _export
            report("EXPORTING", "rendering geometry, mesh and contour frames")
            t0 = time.time()
            try:
                images = _export(mapdl, model, info, n_hours, job_dir, bc)
            except Exception as exc:                            # noqa: BLE001
                images = {"error": f"image export failed: {exc}"}
            timings["images_s"] = round(time.time() - t0, 1)

        result = {
            "nodes": n_nodes, "elements": n_elems, "element_type": "SOLID70",
            "element_size_m": solver_cfg.element_size_m,
            "max_layer_slice_m": mesh_config_for(solver_cfg).layer_slice,
            "grid_lines": model.summary()["grid_lines"],
            "timestep_s": dt, "hours": n_hours, "time_integration": "backward Euler",
            "mapdl_version": str(getattr(mapdl, "version", "")),
            "solver_type": "SPARSE (MAPDL default for transient thermal)",
            "timings_s": timings, "runtime_s": round(time.time() - t_start, 1),
            "images": images, "warnings": model.warnings,
        }
    finally:
        try:
            mapdl.exit()
        except Exception:                                      # noqa: BLE001
            pass
    return result


def _write_viewer_payload(job_dir, model, red, frames, zone_rows, scenario, max_nodes=1500):
    """Downsampled exterior-skin node temperatures + zone air temperatures
    for the web/mobile 3D viewer's ANSYS mode (PRD §17.4)."""
    skin = np.unique(np.concatenate([idx.ravel() for _, idx in red.faces]))
    if len(skin) > max_nodes:
        skin = skin[np.linspace(0, len(skin) - 1, max_nodes).astype(int)]
    coords = model.node_table()[1][skin]
    payload = {
        "source": "ansys",
        "label": f"ANSYS MAPDL validation for revision {scenario['design_revision_id']}",
        "job_id": scenario["job_id"],
        "timestamps": [r["timestamp"] for r in zone_rows],
        "skin_nodes_m": np.round(coords, 3).tolist(),
        "skin_temps_C": [np.round(F[skin], 2).tolist() for F in frames],
        "zone_air_C": {z: [r[f"T_{z}_C"] for r in zone_rows] for z in model.zones},
        "zone_boxes_m": {z: {"lo": list(v["plo"]), "hi": list(v["phi"])}
                         for z, v in model.zones.items()},
        "note": "coordinates are FE coordinates: partition/slab gaps are inserted at "
                "shared planes, so zones beyond a gap are shifted by its thickness",
    }
    (job_dir / "mesh_temperature.json").write_text(json.dumps(payload), encoding="utf-8")
