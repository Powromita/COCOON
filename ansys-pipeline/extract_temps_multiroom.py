"""
extract_temps_multiroom.py

Drop-in replacement for the single-room temperature-extraction loop in
pyansys_runner.py.  Handles any number of rooms; stays backward-compatible
with the single-room path (comparison.py still finds "T_ansys_C" when
exactly one room is present).

USAGE IN pyansys_runner.py
--------------------------
Replace lines 202-221 (the existing extraction block) with:

    from extract_temps_multiroom import extract_temps_multiroom

    # After mapdl.finish() / before _export_mesh_temperature():
    series = extract_temps_multiroom(mapdl, info, n_steps, weather,
                                     solar_gain_factor_m2=solar_gain_factor_m2,
                                     case_name=case_name)
    series_path = os.path.join(out_dir, "temperature_series.csv")
    series.to_csv(series_path, index=False)
    print(f"[{case_name}] saved {series_path}")

where `solar_gain_factor_m2` = SHGC × glazing area, so Q_solar_W = irradiance × solar_gain_factor_m2,
and `info` is the dict returned by build_shelter_multiroom() (or the
existing build_shelter(), whose return dict can be normalised by wrapping
it: info["air_mats"] = {"room": info["air_mat"]}).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

KELVIN = 273.15     # same constant used throughout pyansys_runner.py


def extract_temps_multiroom(
    mapdl,
    info: dict,
    n_steps: int,
    weather: pd.DataFrame,
    solar_gain_factor_m2: float,
    case_name: str = "",
) -> pd.DataFrame:
    """
    Extract per-room indoor air temperatures for every solved time step.

    Reads from a completed ANSYS transient solution (must be called after
    mapdl.finish() and before mapdl.exit()).  Enters POST1 internally.

    Parameters
    ----------
    mapdl : ansys.mapdl.core.Mapdl
        Active PyMAPDL session with a completed transient solve.
    info : dict
        Return value of build_shelter_multiroom() (or build_shelter() with
        air_mats normalised -- see module docstring).

        Required keys
        ~~~~~~~~~~~~~
        info["air_mats"] : dict
            {room_name: ansys_mat_num, ...}
            e.g. {"airlock": 5, "living": 6}
        info["ext_area_m2"] : float
            Total exterior envelope area.

        Optional keys (silently ignored if absent)
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        info["faces"]        -- global face coordinates (not used here)
        info["envelope_mats"], info["partition_mats"]  -- not used here

    n_steps : int
        Number of load steps in the transient solution (e.g. 24 for 24 h).

    weather : pd.DataFrame
        Must contain columns:
            "timestamp"          -- datetime-like, one row per hour
            "solar_radiation_W_m2"  -- GHI used to compute Q_solar_W
                                       (column name matches ansys_export.py)
        If "solar_radiation_W_m2" is absent the column is tried as
        "G_solar_W_m2" for callers that rename it, then falls back to 0.

    solar_gain_factor_m2 : float
        Effective solar aperture area (m²), defined as SHGC × glazing area.
        Used to calculate Q_solar_W = irradiance × solar_gain_factor_m2,
        matching the solar heat actually applied during the solve.

    case_name : str
        Used only for progress print statements. Default "".

    Returns
    -------
    pd.DataFrame
        One row per time step. Columns:

        elapsed_seconds : int
            Wall-clock seconds from simulation start (step * 3600).
        timestamp : object
            Copied from weather["timestamp"].
        T_<room>_C : float
            Volume-averaged indoor air temperature for each room, in °C.
            Example: T_airlock_C, T_living_C.
        T_ansys_C : float
            Backward-compatibility alias.
            Single-room: identical to the one T_<room>_C column.
            Multi-room:  volume-weighted mean across all rooms (arithmetic
                         mean of per-room means, since all rooms use the same
                         artificially high air conductivity and are therefore
                         effectively isothermal nodes of similar volume).
        T_ansys_min_C : float
            Global minimum nodal temperature across the entire model (°C).
        T_ansys_max_C : float
            Global maximum nodal temperature across the entire model (°C).
        T_mean_C : float
            Global arithmetic mean of all nodal temperatures (°C).
        Q_solar_W : float
            Solar irradiance × solar_gain_factor_m2 (W).  Provided for
            reference; it is the same number that was injected as a floor
            heat flux during the solve.

    Notes
    -----
    *  Per-room temps are computed by selecting ONLY that room's air
       elements (mapdl.esel("S", "MAT", "", room_mat)), then querying
       nodal_temperature().  Each room's air material number is unique, so
       the filtered node set is room-exclusive.
    *  Global min/max use a full-model allsel() query to capture exterior
       wall skin temperatures as well.
    *  comparison.py reads "T_ansys_C" from temperature_series.csv.  The
       T_ansys_C column defined above ensures it always exists.
    *  Independence rule (physics architecture doc section 9): no physics-
       engine predicted temperature is read here.
    """

    # ------------------------------------------------------------------
    # Validate inputs
    # ------------------------------------------------------------------
    air_mats: dict[str, int] = info.get("air_mats", {})
    if not air_mats:
        # Try single-room legacy key so callers don't have to adapt build_shelter()
        legacy_mat = info.get("air_mat")
        if legacy_mat is not None:
            air_mats = {"room": int(legacy_mat)}
        else:
            raise ValueError(
                "info must contain 'air_mats' (dict) or 'air_mat' (int). "
                "Wrap build_shelter() output: info['air_mats'] = {'room': info['air_mat']}"
            )

    ext_area_m2: float = float(info.get("ext_area_m2", 0.0))
    room_names: list[str] = list(air_mats.keys())

    # Solar column: try the name used in ansys_export.py, then the
    # alternative name the caller may have used.
    if "solar_radiation_W_m2" in weather.columns:
        solar_col = "solar_radiation_W_m2"
    elif "G_solar_W_m2" in weather.columns:
        solar_col = "G_solar_W_m2"
    else:
        solar_col = None   # will store 0.0 every step

    # ------------------------------------------------------------------
    # Enter POST1
    # ------------------------------------------------------------------
    mapdl.post1()

    rows: list[dict] = []

    for step in range(1, n_steps + 1):
        # Set result set for this load step
        mapdl.set(step, "LAST")

        row: dict = {
            "elapsed_seconds": step * 3600,
            "timestamp": weather["timestamp"].iloc[step - 1],
        }

        # ----------------------------------------------------------
        # Per-room temperature (one filtered query per room)
        # ----------------------------------------------------------
        room_temps_C: list[float] = []

        for room_name, mat_num in air_mats.items():
            mapdl.allsel()
            mapdl.esel("S", "MAT", "", mat_num)   # this room's air elements only
            mapdl.nsle("S")                        # nodes of those elements

            temps_K = np.asarray(mapdl.post_processing.nodal_temperature())

            if temps_K.size == 0:
                # Guard: if the material number matched nothing, use NaN
                T_room_C = float("nan")
            else:
                T_room_C = float(np.mean(temps_K)) - KELVIN

            col = f"T_{room_name}_C"
            row[col] = round(T_room_C, 4)
            room_temps_C.append(T_room_C)

        # ----------------------------------------------------------
        # Backward-compat alias: T_ansys_C
        #   single-room -> identical to the only T_<room>_C column
        #   multi-room  -> arithmetic mean of per-room means
        # ----------------------------------------------------------
        if room_temps_C:
            valid = [t for t in room_temps_C if not (t != t)]   # drop NaNs
            T_ansys_mean_C = float(np.mean(valid)) if valid else float("nan")
        else:
            T_ansys_mean_C = float("nan")

        row["T_ansys_C"] = round(T_ansys_mean_C, 4)

        # ----------------------------------------------------------
        # Global stats over the entire model (walls + air + floor)
        # ----------------------------------------------------------
        mapdl.allsel()
        all_K = np.asarray(mapdl.post_processing.nodal_temperature())

        if all_K.size > 0:
            row["T_ansys_min_C"] = round(float(np.min(all_K))  - KELVIN, 4)
            row["T_ansys_max_C"] = round(float(np.max(all_K))  - KELVIN, 4)
            row["T_mean_C"]      = round(float(np.mean(all_K)) - KELVIN, 4)
        else:
            row["T_ansys_min_C"] = float("nan")
            row["T_ansys_max_C"] = float("nan")
            row["T_mean_C"]      = float("nan")

        # ----------------------------------------------------------
        # Solar input (W) = GHI * solar_gain_factor_m2 (SHGC * glazing area)
        # ----------------------------------------------------------
        if solar_col is not None:
            G = max(0.0, float(weather[solar_col].iloc[step - 1]))
        else:
            G = 0.0
        row["Q_solar_W"] = round(G * solar_gain_factor_m2, 2)

        rows.append(row)

        if step % 6 == 0 or step == n_steps:
            room_summary = "  ".join(
                f"T_{rn}={row.get(f'T_{rn}_C', float('nan')):.1f}C"
                for rn in room_names
            )
            tag = f"[{case_name}]" if case_name else "[extract]"
            print(f"{tag}  step {step:>3}/{n_steps}  {room_summary}")

    # ------------------------------------------------------------------
    # Assemble and column-order the DataFrame
    # ------------------------------------------------------------------
    df = pd.DataFrame(rows)

    # Canonical column order: fixed columns first, then any extras
    fixed_cols = [
        "elapsed_seconds",
        "timestamp",
    ]
    room_cols   = [f"T_{rn}_C" for rn in room_names]
    summary_cols = [
        "T_ansys_C",
        "T_ansys_min_C",
        "T_ansys_max_C",
        "T_mean_C",
        "Q_solar_W",
    ]
    ordered = fixed_cols + room_cols + summary_cols
    # Append any unexpected extra columns at the end (defensive)
    extra = [c for c in df.columns if c not in ordered]
    df = df[ordered + extra]

    return df


# ---------------------------------------------------------------------------
# Self-test (no ANSYS — validates DataFrame structure with a mock mapdl)
# ---------------------------------------------------------------------------

class _MockMapdl:
    """Minimal mock that returns constant 250 K for every nodal_temperature()."""

    class _PostProc:
        def nodal_temperature(self):
            return [250.0, 250.5, 249.8]

    post_processing = _PostProc()

    def post1(self):        pass
    def set(self, *a):      pass
    def allsel(self):       pass
    def esel(self, *a):     pass
    def nsle(self, *a):     pass


if __name__ == "__main__":
    import io

    weather_mock = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-21", periods=3, freq="h"),
        "solar_radiation_W_m2": [0.0, 300.0, 600.0],
    })

    info_mock = {
        "air_mats":    {"airlock": 5, "living": 6},
        "ext_area_m2": 40.0,
    }

    df = extract_temps_multiroom(
        _MockMapdl(), info_mock, n_steps=3, weather=weather_mock,
        solar_gain_factor_m2=2.0,
        case_name="test"
    )

    print("\n--- DataFrame ---")
    print(df.to_string(index=False))

    # ---- structural checks ----
    assert "T_airlock_C"   in df.columns, "FAIL: T_airlock_C missing"
    assert "T_living_C"    in df.columns, "FAIL: T_living_C missing"
    assert "T_ansys_C"     in df.columns, "FAIL: T_ansys_C missing (backward-compat)"
    assert "T_ansys_min_C" in df.columns, "FAIL: T_ansys_min_C missing"
    assert "T_ansys_max_C" in df.columns, "FAIL: T_ansys_max_C missing"
    assert "T_mean_C"      in df.columns, "FAIL: T_mean_C missing"
    assert "Q_solar_W"     in df.columns, "FAIL: Q_solar_W missing"
    assert len(df) == 3,                  f"FAIL: expected 3 rows, got {len(df)}"

    assert df["elapsed_seconds"].tolist() == [3600, 7200, 10800], "FAIL: elapsed_seconds"
    assert df["Q_solar_W"].iloc[1] == round(300.0 * 2.0, 2),     "FAIL: Q_solar_W"

    # single-room backward-compat check
    info_single = {"air_mat": 3, "ext_area_m2": 20.0}
    df2 = extract_temps_multiroom(
        _MockMapdl(), info_single, n_steps=2, weather=weather_mock.iloc[:2].reset_index(drop=True),
        solar_gain_factor_m2=1.0,
        case_name="single"
    )
    assert "T_room_C"  in df2.columns, "FAIL: legacy single-room column T_room_C missing"
    assert "T_ansys_C" in df2.columns, "FAIL: T_ansys_C missing for single-room"
    assert df2["T_room_C"].equals(df2["T_ansys_C"].rename("T_room_C")), \
        "FAIL: single-room T_room_C != T_ansys_C"
    print("\nPASS: all self-tests passed.")
