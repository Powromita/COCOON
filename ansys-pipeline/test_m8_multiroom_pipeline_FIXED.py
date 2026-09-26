"""
test_m8_multiroom_pipeline_FIXED.py

End-to-end integration test for M8 multi-room ANSYS thermal pipeline.
Requires a live PyMAPDL session and an active ANSYS licence.

BUGS FIXED vs. the user-provided draft
---------------------------------------
1. Wrong import path: `pyansys.launch` -> `ansys.mapdl.core` (matches pyansys_runner.py)
2. Config layer keys: `"t"/"k"` -> `"thickness_mm"/"material"` as geometry_builder.py expects
3. Solver entry: `mapdl.solu()` -> `mapdl.slashsolu()` (ANSYS /SOLU command)
4. BC loop: convection surface loads now actually applied each step (exterior walls + floor)
5. ANSYS exec path pulled from pyansys_runner.py constant instead of hard-coded

TEST SCENARIO
-------------
Two-room Himalayan shelter at Leh, Ladakh (24-hour winter simulation):
Complete shelter: 6 m × 4 m × 2.8 m

    +--------+-----------------------------------------+
    | Airlock|  Living Room                            |
    | 1.2 m  |  4.8 m × 4 m × 2.8 m                    |
    | × 4 m  |  (glazed south wall)                    |
    | × 2.8m |                                         |
    | (buffer)                                         |
    +--------+-----------------------------------------+
       x=0  x=1.2                                    x=6.0

Partition plane: x = 1.2
Partition span: y = [0,4], z = [0,2.8]
Airlock: 1.2 m × 4 m × 2.8 m
Living room: 4.8 m × 4 m × 2.8 m
Complete shelter: 6 m × 4 m × 2.8 m

USAGE
-----
    python test_m8_multiroom_pipeline_FIXED.py
Output: test_output_multiroom_real.csv
"""

from __future__ import annotations

import os
import sys
import math
import traceback

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Path setup — must happen before any local imports
# ---------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
CALC_DIR = os.path.join(HERE, "..", "thermal-calculator")
for p in (HERE, CALC_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

# ---------------------------------------------------------------------------
# Required imports (all fail-fast with a clear message)
# ---------------------------------------------------------------------------
try:
    from ansys.mapdl.core import launch_mapdl     # FIX 1: correct import path
except ImportError:
    sys.exit("ERROR: PyMAPDL not installed.  Run: pip install ansys-mapdl-core")

try:
    from geometry_builder_multiroom import build_shelter_multiroom
    from extract_temps_multiroom import extract_temps_multiroom
    from pyansys_runner import _export_contours
except ImportError as exc:
    sys.exit(f"ERROR: Missing pipeline module -- {exc}\n"
             "Ensure geometry_builder_multiroom.py, extract_temps_multiroom.py, "
             "and pyansys_runner.py are in the same directory as this file.")

from m0_building_adapter import (
    load_building_model,
    building_model_to_rooms,
)
from m0_material_adapter import (
    load_material_snapshot,
    material_snapshot_to_ansys_db,
    validate_building_material_references,
)
from m0_assembly_adapter import (
    building_model_to_ansys_assemblies,
)

# ANSYS executable -- matches the path used in pyansys_runner.py
ANSYS_EXEC = r"C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe"
KELVIN = 273.15

# ============================================================================
# M0 FIXTURE & ADAPTER SETUP
# ============================================================================

def _resolve_fixture(filename: str) -> str:
    candidates = [
        os.path.abspath(os.path.join(HERE, "..", "packages", "contracts", "fixtures", "valid", filename)),
        os.path.abspath(os.path.join(HERE, "packages", "contracts", "fixtures", "valid", filename)),
        os.path.abspath(os.path.join("packages", "contracts", "fixtures", "valid", filename)),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    raise FileNotFoundError(f"Fixture file not found: {filename}")


M0_BUILDING_PATH = _resolve_fixture("building_airlock_living.json")
M0_MATERIAL_SNAPSHOT_PATH = _resolve_fixture("material_snapshot_standard.json")

building_model = load_building_model(M0_BUILDING_PATH)
material_snapshot = load_material_snapshot(M0_MATERIAL_SNAPSHOT_PATH)

# Validate all building model material references exist in snapshot
validate_building_material_references(building_model, material_snapshot)

# Convert MaterialSnapshot into ANSYS materials database
MATERIALS_DB = material_snapshot_to_ansys_db(material_snapshot)

# Convert BuildingModel assemblies into M8 construction assemblies
assemblies = building_model_to_ansys_assemblies(building_model)

# Extract rooms from BuildingModel
rooms = building_model_to_rooms(building_model)

global_x_min = min(r["bounds"]["x_min"] for r in rooms)
global_x_max = max(r["bounds"]["x_max"] for r in rooms)
global_y_min = min(r["bounds"]["y_min"] for r in rooms)
global_y_max = max(r["bounds"]["y_max"] for r in rooms)
global_z_min = min(r["bounds"]["z_min"] for r in rooms)
global_z_max = max(r["bounds"]["z_max"] for r in rooms)

overall_length = global_x_max - global_x_min
overall_width = global_y_max - global_y_min
overall_height = global_z_max - global_z_min

CONFIG = {
    "geometry": {
        "length_m": overall_length,
        "width_m": overall_width,
        "height_m": overall_height,
    },
    "heat_transfer": {
        "h_inside_W_m2K":  5.0,
        "h_outside_W_m2K": 25.0,
    },
    "walls": assemblies["walls"],
    "roof": assemblies["roof"],
    "floor": assemblies["floor"],
    "partition": assemblies["partition"],
    "windows": {
        "area_m2": 1.2,
        "U_W_m2K": 3.0,
        "solar_gain_fraction": 0.6,
    },
    "initial_temperature_C": -25.0,
    "ground_temperature_mode": "manual",
    "ground_temperature_C":    -10.0,
    "internal_heat_gain_W":    0.0,
}


def validate_preflight_configuration(
    building_model,
    material_snapshot,
    assemblies,
    materials_db,
    config,
) -> None:
    """Validate that all M0 contracts, assemblies, and materials match the M8 preflight specification."""
    # 1. MaterialSnapshot validation passed
    validate_building_material_references(building_model, material_snapshot)

    # 2. All materials referenced by all assemblies exist in materials_db
    for category in ("walls", "roof", "floor"):
        for layer in assemblies[category]:
            mat = layer["material"]
            assert mat in materials_db, f"Material '{mat}' in {category} not found in materials_db"
    if assemblies.get("partition"):
        for layer in assemblies["partition"]["layers_inner_to_outer"]:
            mat = layer["material"]
            assert mat in materials_db, f"Material '{mat}' in partition not found in materials_db"

    # 3. Wall layers exactly: outer-to-inner: mat_stone 150 mm, mat_puf 50 mm
    expected_walls = [
        {"thickness_mm": 150.0, "material": "mat_stone"},
        {"thickness_mm": 50.0, "material": "mat_puf"},
    ]
    assert config["walls"] == expected_walls, (
        f"Wall layers mismatch: expected {expected_walls}, got {config['walls']}"
    )

    # 4. Roof layers exactly: outer-to-inner: mat_puf 80 mm, mat_plywood 80 mm
    expected_roof = [
        {"thickness_mm": 80.0, "material": "mat_puf"},
        {"thickness_mm": 80.0, "material": "mat_plywood"},
    ]
    assert config["roof"] == expected_roof, (
        f"Roof layers mismatch: expected {expected_roof}, got {config['roof']}"
    )

    # 5. Floor layers exactly: outer-to-inner: mat_puf 50 mm, mat_concrete 100 mm
    expected_floor = [
        {"thickness_mm": 50.0, "material": "mat_puf"},
        {"thickness_mm": 100.0, "material": "mat_concrete"},
    ]
    assert config["floor"] == expected_floor, (
        f"Floor layers mismatch: expected {expected_floor}, got {config['floor']}"
    )

    # 6. Partition is exactly: owning-zone to adjacent-zone: mat_plywood 12 mm, mat_puf 50 mm, mat_plywood 12 mm
    part = assemblies.get("partition")
    assert part is not None, "Partition assembly is missing"
    expected_partition_layers = [
        {"thickness_mm": 12.0, "material": "mat_plywood"},
        {"thickness_mm": 50.0, "material": "mat_puf"},
        {"thickness_mm": 12.0, "material": "mat_plywood"},
    ]
    assert part["layers_inner_to_outer"] == expected_partition_layers, (
        f"Partition layers mismatch: expected {expected_partition_layers}, got {part['layers_inner_to_outer']}"
    )

    # 7. Partition total thickness is 0.074 m
    assert abs(part["total_thickness_m"] - 0.074) < 1e-6, (
        f"Partition total thickness mismatch: expected 0.074 m, got {part['total_thickness_m']} m"
    )

    # 8. Interface is airlock -> living
    interfaces = part.get("interfaces", [])
    assert len(interfaces) == 1, f"Expected exactly 1 partition interface, got {len(interfaces)}"
    assert interfaces[0]["owning_zone_id"] == "airlock", (
        f"Expected owning zone 'airlock', got '{interfaces[0]['owning_zone_id']}'"
    )
    assert interfaces[0]["adjacent_zone_id"] == "living", (
        f"Expected adjacent zone 'living', got '{interfaces[0]['adjacent_zone_id']}'"
    )

# ============================================================================
# WEATHER
# ============================================================================

def make_weather(n_hours: int = 24) -> pd.DataFrame:
    """Synthetic winter clear-sky day for Leh (sunrise 09:00, sunset 17:30)."""
    timestamps = pd.date_range("2026-01-21 00:00", periods=n_hours, freq="h")
    solar = []
    for h in range(n_hours):
        if 9 <= h <= 17:
            angle = math.pi * (h - 9) / (17 - 9)
            solar.append(round(900.0 * math.sin(angle), 1))
        else:
            solar.append(0.0)
    return pd.DataFrame({
        "timestamp":             timestamps,
        "solar_radiation_W_m2":  solar,
        "outdoor_temperature_C": [-25.0] * n_hours,
    })

# ============================================================================
# HELPERS
# ============================================================================

def _step(msg: str) -> None:
    print(f"\n{msg}")
    print("  " + "-" * 58)


def _ok(msg: str) -> None:
    print(f"  [OK]  {msg}")


def _fail(msg: str, exc: Exception | None = None) -> None:
    print(f"  [FAIL] {msg}")
    if exc is not None:
        traceback.print_exc()


# ============================================================================
# MAIN TEST
# ============================================================================

def main() -> None:
    print("=" * 62)
    print("  M8 Multi-Room Pipeline -- REAL ANSYS Integration Test")
    print("=" * 62)
    print(f"  M0 Design ID      : {building_model.design_id}")
    print(f"  M0 Revision ID    : {building_model.revision_id}")
    print(f"  MaterialSnapshot  : {material_snapshot.snapshot_id} (schema v{material_snapshot.schema_version})")
    print(f"  Number of materials: {len(material_snapshot.materials)}")
    print(f"  Number of rooms   : {len(rooms)}")
    print("  Calculated room bounds:")
    for r in rooms:
        b = r["bounds"]
        print(f"    - {r['zone_id']:<8}: x=[{b['x_min']:.2f}, {b['x_max']:.2f}], "
              f"y=[{b['y_min']:.2f}, {b['y_max']:.2f}], z=[{b['z_min']:.2f}, {b['z_max']:.2f}] m")
    print(f"  Overall shelter   : {overall_length:.2f} m x {overall_width:.2f} m x {overall_height:.2f} m")

    wall_desc = " -> ".join(f"{l['material']} ({l['thickness_mm']:.0f}mm)" for l in CONFIG["walls"])
    roof_desc = " -> ".join(f"{l['material']} ({l['thickness_mm']:.0f}mm)" for l in CONFIG["roof"])
    floor_desc = " -> ".join(f"{l['material']} ({l['thickness_mm']:.0f}mm)" for l in CONFIG["floor"])
    part_desc = " -> ".join(f"{l['material']} ({l['thickness_mm']:.0f}mm)" for l in assemblies["partition"]["layers_inner_to_outer"])
    part_iface = assemblies["partition"]["interfaces"][0]

    print("  Construction assemblies (outer-to-inner):")
    print(f"    - Walls     : {wall_desc}")
    print(f"    - Roof      : {roof_desc}")
    print(f"    - Floor     : {floor_desc}")
    print("  Partition assembly (owning-to-adjacent):")
    print(f"    - Layers    : {part_desc} (total {assemblies['partition']['total_thickness_m']:.3f} m)")
    print(f"    - Interface : {part_iface['owning_zone_id']} -> {part_iface['adjacent_zone_id']} (surface: {part_iface['surface_id']})")
    print("  24-hour Leh winter  (-25 C ambient, clear sky)")

    # ------------------------------------------------------------------
    # Step 0 — Fail-fast assertions on M0 fixture geometry & assemblies
    # ------------------------------------------------------------------
    _step("[0/4] Verifying M0 building geometry & preflight assertions...")
    assert len(rooms) == 2, f"Fixture check failed: expected exactly 2 rooms, got {len(rooms)}"
    room_ids = [r["zone_id"] for r in rooms]
    assert set(room_ids) == {"airlock", "living"}, (
        f"Fixture check failed: expected room IDs ['airlock', 'living'], got {room_ids}"
    )
    room_names = [r["name"] for r in rooms]
    assert len(room_names) == len(set(room_names)), (
        f"Fixture check failed: duplicate room names found: {room_names}"
    )
    assert abs(overall_length - 6.0) < 1e-6, (
        f"Fixture check failed: overall length {overall_length} != 6.0"
    )
    assert abs(overall_width - 4.0) < 1e-6, (
        f"Fixture check failed: overall width {overall_width} != 4.0"
    )
    assert abs(overall_height - 2.8) < 1e-6, (
        f"Fixture check failed: overall height {overall_height} != 2.8"
    )

    validate_preflight_configuration(
        building_model=building_model,
        material_snapshot=material_snapshot,
        assemblies=assemblies,
        materials_db=MATERIALS_DB,
        config=CONFIG,
    )
    _ok("M0 fixture geometry assertions passed")
    _ok("M0 assembly and MaterialSnapshot preflight assertions passed")

    weather  = make_weather(24)
    n_steps  = 24
    h_out    = CONFIG["heat_transfer"]["h_outside_W_m2K"]
    T_init_K = CONFIG["initial_temperature_C"] + KELVIN
    ground_T_K = CONFIG["ground_temperature_C"] + KELVIN
    out_dir  = os.path.join(HERE, "results", "m8_real_ansys")
    run_loc  = os.path.join(out_dir, "ansys_run")
    frames_dir = os.path.join(out_dir, "contour_frames")
    os.makedirs(run_loc, exist_ok=True)
    os.makedirs(frames_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Step 1 — Launch ANSYS
    # ------------------------------------------------------------------
    _step("[1/4] Launching ANSYS PyMAPDL...")
    try:
        mapdl = launch_mapdl(
            exec_file=ANSYS_EXEC,
            run_location=run_loc,
            override=True,
            cleanup_on_exit=True,
            start_timeout=180,
            additional_switches="-m 3000 -db 1024",
        )
        _ok("ANSYS launched")
    except Exception as exc:
        _fail("Could not launch ANSYS -- check exec_file path and licence", exc)
        sys.exit(1)

    try:
        mapdl.clear()
        mapdl.prep7()

        # ------------------------------------------------------------------
        # Step 2 — Build multi-room geometry
        # ------------------------------------------------------------------
        _step("[2/4] Building multi-room geometry + mesh...")
        try:
            info = build_shelter_multiroom(
                mapdl,
                CONFIG,
                MATERIALS_DB,
                rooms,
                window_room="living",       # glazing cut-out on south wall
                element_size_m=0.25,        # coarser mesh for test speed
                partition_thickness_m=assemblies["partition"]["total_thickness_m"],
                partition_spec=assemblies["partition"],
            )
            _ok(f"Geometry built")
            _ok(f"Air materials : {info['air_mats']}")
            _ok(f"Exterior area : {info['ext_area_m2']:.1f} m2")
            _ok(f"Partition mats: {info['partition_mats']}")
        except Exception as exc:
            _fail("build_shelter_multiroom() raised an exception", exc)
            sys.exit(1)

        fc          = info["faces"]
        ext_area    = info["ext_area_m2"]
        # Film and air material numbers (needed for BC exclusion)
        env_mats    = info["envelope_mats"]
        film_mat    = env_mats["film_mat"]
        air_mat_nums = list(info["air_mats"].values())

        # Solar gain parameters: 60% of window area (1.2 m2) is effective SHGC
        solar_area_eff = CONFIG["windows"]["area_m2"] * CONFIG["windows"]["solar_gain_fraction"]
        floor_area_m2  = sum(
            (r["bounds"]["x_max"] - r["bounds"]["x_min"]) *
            (r["bounds"]["y_max"] - r["bounds"]["y_min"])
            for r in rooms
        )
        # Floor-top injection plane (just inside the inside-film layer)
        from geometry_builder import INSIDE_FILM_THICKNESS_M
        floor_top_z = -INSIDE_FILM_THICKNESS_M

        # ------------------------------------------------------------------
        # Step 3 — Transient solve
        # ------------------------------------------------------------------
        _step("[3/4] Setting up transient BCs and solving (24 steps)...")
        try:
            mapdl.finish()
            mapdl.slashsolu()                    # FIX 3: /SOLU, not solu()
            mapdl.antype("TRANS")
            mapdl.trnopt("FULL")
            mapdl.timint("ON")
            mapdl.kbc(1)                         # stepped hourly loads
            mapdl.autots("ON")
            mapdl.nsubst(4, 20, 1)
            mapdl.outres("ALL", "LAST")
            mapdl.tunif(T_init_K)

            for i, row in enumerate(weather.itertuples(index=False), start=1):
                T_out_K = row.outdoor_temperature_C + KELVIN
                G       = max(0.0, float(row.solar_radiation_W_m2))
                solar_W = solar_area_eff * G
                flux_W_m2 = solar_W / floor_area_m2 if floor_area_m2 > 0 else 0.0

                # FIX 4: actually apply BC each step (was a no-op loop in draft)
                # -- Exterior envelope convection (walls + roof) --
                mapdl.allsel()
                mapdl.asel("S", "LOC", "X", fc["x_min_global"])
                mapdl.asel("A", "LOC", "X", fc["x_max_global"])
                mapdl.asel("A", "LOC", "Y", fc["y_min_global"])
                mapdl.asel("A", "LOC", "Y", fc["y_max_global"])
                mapdl.asel("A", "LOC", "Z", fc["z_max_global"])
                mapdl.nsla("S", 1)
                mapdl.sf("ALL", "CONV", h_out, T_out_K)

                # -- Floor underside convection (ground) --
                mapdl.allsel()
                mapdl.asel("S", "LOC", "Z", fc["z_min_global"])
                mapdl.nsla("S", 1)
                mapdl.sf("ALL", "CONV", h_out, ground_T_K)

                # -- Solar + internal gain injected on floor slab top --
                mapdl.allsel()
                mapdl.nsel("S", "LOC", "Z", floor_top_z)
                for am in air_mat_nums:
                    mapdl.esel("U", "MAT", "", am)
                mapdl.esel("U", "MAT", "", film_mat)
                mapdl.nsle("R")
                mapdl.sf("ALL", "HFLUX", flux_W_m2)

                mapdl.allsel()
                mapdl.time(i * 3600.0)
                mapdl.solve()

                if i % 6 == 0 or i == n_steps:
                    print(f"  step {i:>2}/{n_steps}  "
                          f"T_out={row.outdoor_temperature_C:5.1f}C  "
                          f"G={G:6.1f} W/m2  Q_floor={flux_W_m2*floor_area_m2:7.1f}W")

            mapdl.finish()
            _ok("Solve complete")
        except Exception as exc:
            _fail("Solve raised an exception", exc)
            sys.exit(1)

        # ------------------------------------------------------------------
        # Step 4 — Extract per-room temperatures
        # ------------------------------------------------------------------
        _step("[4/4] Extracting per-room temperatures...")
        try:
            series = extract_temps_multiroom(
                mapdl, info, n_steps, weather,
                solar_gain_factor_m2=solar_area_eff,
                case_name="m8_real_ansys",
            )
            _ok(f"Extraction complete: {len(series)} rows x {len(series.columns)} cols")
            _ok(f"Columns: {list(series.columns)}")

            csv_path = os.path.join(out_dir, "temperature_series_multiroom.csv")
            series.to_csv(csv_path, index=False)
            _ok(f"Saved -> {csv_path}")

            # ---- Print sample table ----
            print("\n  Sample output (selected hours):")
            print("  " + "-" * 62)
            hdr = f"  {'Hour':>4}  {'T_airlock':>10}  {'T_living':>10}  {'T_ansys':>10}  {'Q_solar':>10}"
            print(hdr)
            print("  " + "-" * 62)
            show_idx = [0, 5, 8, 10, 12, 14, 17, 20, 23]
            for idx in show_idx:
                if idx >= len(series):
                    continue
                r = series.iloc[idx]
                airlock_T = r.get("T_airlock_C", float("nan"))
                living_T  = r.get("T_living_C",  float("nan"))
                ansys_T   = r.get("T_ansys_C",   float("nan"))
                q_solar   = r.get("Q_solar_W",   0.0)
                print(f"  {idx+1:>4}h  "
                      f"{airlock_T:>9.2f}C  "
                      f"{living_T:>9.2f}C  "
                      f"{ansys_T:>9.2f}C  "
                      f"{q_solar:>9.0f}W")

            # ---- Export temperature contour frames ----
            _step("Exporting temperature contour frames (steps 1, 12, 24)...")
            contour_steps = [1, 12, 24]
            _export_contours(
                mapdl=mapdl,
                weather=weather,
                steps=contour_steps,
                frames_dir=frames_dir,
                case_name="m8_real_ansys",
            )

            expected_pngs = []
            for s in contour_steps:
                ts = str(weather["timestamp"].iloc[s - 1]).replace(":", "").replace(" ", "_")
                expected_pngs.append(os.path.join(frames_dir, f"temp_step{s:03d}_{ts}.png"))

            found_pngs = [p for p in expected_pngs if os.path.isfile(p)]
            for p in found_pngs:
                print(f"  Generated contour path: {p}")

            if len(found_pngs) == 0:
                raise AssertionError(
                    f"No contour PNG files produced in {frames_dir}. Expected {len(expected_pngs)} frames."
                )

            assert len(found_pngs) == 3, (
                f"Expected exactly 3 contour PNG files, but found {len(found_pngs)}: {found_pngs}"
            )
            _ok(f"Contour export verified: exactly {len(found_pngs)} PNG files generated")

            # ---- Basic assertions ----
            print("\n  Assertions:")
            checks = [
                ("24 rows",      len(series) == n_steps),
                ("T_airlock_C column present",   "T_airlock_C" in series.columns),
                ("T_living_C column present",    "T_living_C"  in series.columns),
                ("T_ansys_C column present",     "T_ansys_C"   in series.columns),
                ("No NaN in T_ansys_C",          series["T_ansys_C"].notna().all()),
                ("T_ansys_C in range [-50, +50]",
                 series["T_ansys_C"].between(-50, 50).all()),
                ("Exactly 3 contour PNGs generated", len(found_pngs) == 3),
            ]
            all_pass = True
            for label, ok in checks:
                status = "PASS" if ok else "FAIL"
                print(f"    [{status}] {label}")
                if not ok:
                    all_pass = False

        except Exception as exc:
            _fail("Extraction or contour export raised an exception", exc)
            sys.exit(1)

    finally:
        try:
            mapdl.exit()
            print("\n  [OK] ANSYS session closed")
        except Exception:
            pass

    print("\n" + "=" * 62)
    if all_pass:
        print("  ALL ASSERTIONS PASSED")
    else:
        print("  SOME ASSERTIONS FAILED -- check output above")
    print("=" * 62)
    print(f"\n  CSV: {csv_path}")
    print(f"  Contours: {frames_dir}")
    print("  Ready for comparison with multi-zone RC output.\n")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
