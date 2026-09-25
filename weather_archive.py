"""
weather_archive.py  --  Stage 1 of the integrated pipeline.

Turns the 10-year NASA POWER export (leh_weather_merged.xlsx, 2016-2026
hourly) into the single weather source for the whole pipeline. Replaces
the live NASA calls and the 24 h synthetic day on the pipeline path.

Provides:
  load_archive()            -> cleaned hourly DataFrame (cached to CSV)
  annual_mean_air_C(df)     -> ground-temperature proxy (no TS column exists)
  typical_window(df, ...)   -> a representative seasonal slice  (optimizer screening)
  worst_case_window(df, ...)-> the coldest contiguous slice     (ANSYS validation)
  date_range(df, a, b)      -> an explicit slice

Column contract of every returned DataFrame:
    timestamp, temperature_C, solar_radiation_W_m2,
    wind_speed_m_s, humidity_percent

CLI:
    python weather_archive.py --out runs/manual --hours 48
"""

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "thermal-calculator"))
from weather import clean_weather_data                     # noqa: E402

ARCHIVE_XLSX = ROOT / "leh_weather_merged.xlsx"
ARCHIVE_CACHE = ROOT / "leh_weather_archive.csv"

# xlsx column -> engine column
_RENAME = {
    "datetime": "timestamp",
    "T2M": "temperature_C",
    "ALLSKY_SFC_SW_DWN": "solar_radiation_W_m2",
    "WS10M": "wind_speed_m_s",
    "RH2M": "humidity_percent",
}
_CORE = ["timestamp", "temperature_C", "solar_radiation_W_m2",
         "wind_speed_m_s", "humidity_percent"]


# ==================================================
# LOAD
# ==================================================

def load_archive(xlsx_path=ARCHIVE_XLSX, cache_path=ARCHIVE_CACHE,
                 rebuild=False) -> pd.DataFrame:
    """Return the cleaned hourly archive.

    First call parses the Excel (~92k rows, slow) and writes
    ``cache_path``; later calls read the cache. Pass ``rebuild=True`` to
    force a re-parse.
    """

    cache_path = Path(cache_path)

    if cache_path.exists() and not rebuild:
        df = pd.read_csv(cache_path, parse_dates=["timestamp"])
        return df

    xlsx_path = Path(xlsx_path)
    if not xlsx_path.exists():
        raise FileNotFoundError(
            f"weather archive not found: {xlsx_path}. Expected the "
            f"10-year NASA POWER export leh_weather_merged.xlsx."
        )

    raw = pd.read_excel(xlsx_path, sheet_name=0)
    missing = [c for c in _RENAME if c not in raw.columns]
    if missing:
        raise ValueError(f"archive xlsx missing columns: {missing}")

    df = raw.rename(columns=_RENAME)[list(_RENAME.values())].copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    # existing project cleaner: -999 -> NaN, physical bounds, drop bad core rows
    df = clean_weather_data(df)

    for col in _CORE:
        if col not in df.columns:
            df[col] = pd.NA
    df = df[_CORE].sort_values("timestamp").reset_index(drop=True)

    df.to_csv(cache_path, index=False)
    print(f"[weather_archive] parsed {len(df)} clean hourly rows "
          f"({df['timestamp'].min().date()} .. {df['timestamp'].max().date()})"
          f" -> cached {cache_path.name}")
    return df


# ==================================================
# DERIVED
# ==================================================

def annual_mean_air_C(df: pd.DataFrame) -> float:
    """Whole-archive mean air temperature -- the slab-on-grade
    deep-ground temperature proxy (the archive has no earth-skin TS)."""
    return round(float(df["temperature_C"].mean()), 2)


def _slice(df, start_idx, n):
    end = min(len(df), start_idx + n)
    return df.iloc[start_idx:end].reset_index(drop=True)


def typical_window(df: pd.DataFrame, months=(12, 1, 2),
                   hours=168) -> pd.DataFrame:
    """A representative slice of the given season.

    Picks the calendar year whose seasonal mean ``temperature_C`` is
    closest to the all-years seasonal mean, then returns the coldest
    ``hours``-long contiguous run inside that year's season -- a
    pragmatic stand-in for a Typical Meteorological Week that still
    stresses the heating case.
    """

    seas = df[df["timestamp"].dt.month.isin(months)].copy()
    if seas.empty:
        raise ValueError(f"no archive rows in months {months}")

    seas["season_year"] = seas["timestamp"].dt.year
    # December belongs to the winter that rolls into the next year
    if set(months) & {12} and set(months) & {1, 2}:
        seas.loc[seas["timestamp"].dt.month == 12, "season_year"] += 1

    per_year = seas.groupby("season_year")["temperature_C"].mean()
    target = per_year.mean()
    best_year = int((per_year - target).abs().idxmin())

    yr = seas[seas["season_year"] == best_year].sort_values("timestamp")
    yr = yr.reset_index(drop=True)
    roll = yr["temperature_C"].rolling(hours).mean()
    end = int(roll.idxmin())
    start = max(0, end - hours + 1)
    out = yr.iloc[start:end + 1][_CORE].reset_index(drop=True)
    print(f"[weather_archive] typical window: season year {best_year}, "
          f"{out['timestamp'].iloc[0]} .. {out['timestamp'].iloc[-1]} "
          f"(mean {out['temperature_C'].mean():.1f} C)")
    return out


def worst_case_window(df: pd.DataFrame, hours=48) -> pd.DataFrame:
    """The coldest ``hours``-long contiguous run in the whole archive."""

    d = df.sort_values("timestamp").reset_index(drop=True)
    roll = d["temperature_C"].rolling(hours).mean()
    end = int(roll.idxmin())
    start = max(0, end - hours + 1)
    out = d.iloc[start:end + 1][_CORE].reset_index(drop=True)
    print(f"[weather_archive] worst-case window: "
          f"{out['timestamp'].iloc[0]} .. {out['timestamp'].iloc[-1]} "
          f"(mean {out['temperature_C'].mean():.1f} C, "
          f"min {out['temperature_C'].min():.1f} C)")
    return out


def date_range(df: pd.DataFrame, start, end) -> pd.DataFrame:
    m = (df["timestamp"] >= pd.Timestamp(start)) & \
        (df["timestamp"] <= pd.Timestamp(end))
    return df.loc[m, _CORE].reset_index(drop=True)


# ==================================================
# PIPELINE ENTRYPOINT
# ==================================================

def write_windows(out_dir, season_months=(12, 1, 2),
                  typical_hours=168, worst_hours=48, rebuild=False) -> dict:
    """Write weather_typical.csv, weather_worstcase.csv and
    ground_temperature.json into ``out_dir``. Returns the paths."""

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = load_archive(rebuild=rebuild)

    typ = typical_window(df, months=season_months, hours=typical_hours)
    wcs = worst_case_window(df, hours=worst_hours)
    ground = annual_mean_air_C(df)

    p_typ = out_dir / "weather_typical.csv"
    p_wcs = out_dir / "weather_worstcase.csv"
    p_grd = out_dir / "ground_temperature.json"

    typ.to_csv(p_typ, index=False)
    wcs.to_csv(p_wcs, index=False)
    pd.Series({"annual_mean_air_C": ground}).to_json(p_grd)

    return {"typical": str(p_typ), "worstcase": str(p_wcs),
            "ground": str(p_grd), "annual_mean_air_C": ground}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="runs/manual")
    ap.add_argument("--typical-hours", type=int, default=168)
    ap.add_argument("--hours", type=int, default=48, help="worst-case window")
    ap.add_argument("--rebuild", action="store_true")
    a = ap.parse_args()
    info = write_windows(a.out, typical_hours=a.typical_hours,
                         worst_hours=a.hours, rebuild=a.rebuild)
    print(info)
