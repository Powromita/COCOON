"""
weather_snapshot.py - Freeze a window of the cached Leh NASA POWER archive
as an M0 WeatherSnapshot (PRD v4 §9.2 step 8, §14.4).

Window rule (deterministic, documented): inside [season_start, season_end]
pick the contiguous `hours`-long window with the LOWEST mean outdoor
temperature. Ties resolve to the earliest window.

Time basis: the archive is NASA POWER requested in local solar time
(thermal-calculator/solar.py). Timestamps are stored with the +05:30
offset the contracts require as a label; solar geometry is evaluated with
time_standard="solar". This is recorded in the snapshot description of
every scenario that uses it.
"""

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from cocoon_ansys.contracts_io import WeatherSnapshot, sha256_text, write_json, canonical_json
from cocoon_ansys.paths import WEATHER_ARCHIVE_CSV, CASES_DIR

LEH = {"location_name": "Leh_Ladakh", "latitude_deg": 34.1526,
       "longitude_deg": 77.5771, "elevation_m": 3500.0}
IST = timezone(timedelta(hours=5, minutes=30))


def coldest_window(df, hours, season_start, season_end):
    d = df[(df["timestamp"] >= season_start) & (df["timestamp"] < season_end)]
    d = d.sort_values("timestamp").reset_index(drop=True)
    # only windows made of consecutive hourly records
    step_ok = d["timestamp"].diff().eq(pd.Timedelta(hours=1))
    best, best_mean = None, None
    for i in range(0, len(d) - hours + 1):
        if not step_ok.iloc[i + 1:i + hours].all():
            continue
        m = d["temperature_C"].iloc[i:i + hours].mean()
        if best_mean is None or m < best_mean:
            best, best_mean = i, m
    if best is None:
        raise ValueError("no gap-free window of that length in the season")
    return d.iloc[best:best + hours].reset_index(drop=True)


def build_snapshot(hours=48, season_start="2025-12-01", season_end="2026-03-01",
                   archive_csv=WEATHER_ARCHIVE_CSV) -> WeatherSnapshot:
    df = pd.read_csv(archive_csv, parse_dates=["timestamp"])
    win = coldest_window(df, hours, pd.Timestamp(season_start), pd.Timestamp(season_end))

    points = []
    for r in win.itertuples(index=False):
        points.append({
            "timestamp": r.timestamp.to_pydatetime().replace(tzinfo=IST).isoformat(),
            "outdoor_dry_bulb_temperature_c": round(float(r.temperature_C), 3),
            "ghi_w_m2": round(max(0.0, float(r.solar_radiation_W_m2)), 3),
            "dni_w_m2": None,
            "dhi_w_m2": None,
            "wind_speed_m_s": round(max(0.0, float(r.wind_speed_m_s)), 3),
            "wind_direction_deg": None,
            "relative_humidity_pct": round(min(100.0, max(0.0, float(r.humidity_percent))), 2),
            "cloud_cover_pct": None,
        })

    start = win["timestamp"].iloc[0]
    fetched = datetime.fromtimestamp(Path(archive_csv).stat().st_mtime, tz=timezone.utc)
    body = {
        "schema_version": "4.0",
        "snapshot_id": f"wx_leh_{start:%Y%m%dT%H}_{hours}h",
        "source": {
            "source_name": "NASA_POWER",
            **LEH,
            "is_cached": True,
            "fetch_date": fetched.replace(microsecond=0).isoformat(),
            "time_zone": "Asia/Kolkata",
        },
        "hourly_data": points,
        "interpolations": [],
        "checksum_sha256": "",
    }
    body["checksum_sha256"] = sha256_text(canonical_json(body["hourly_data"]))
    return WeatherSnapshot.model_validate(body)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Freeze the coldest Leh window as a WeatherSnapshot")
    ap.add_argument("--hours", type=int, default=48)
    ap.add_argument("--season-start", default="2025-12-01")
    ap.add_argument("--season-end", default="2026-03-01")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    snap = build_snapshot(a.hours, a.season_start, a.season_end)
    out = Path(a.out) if a.out else CASES_DIR / f"{snap.snapshot_id}.json"
    write_json(out, snap)
    t = [p.outdoor_dry_bulb_temperature_c for p in snap.hourly_data]
    print(f"{snap.snapshot_id}: {snap.hourly_data[0].timestamp} .. "
          f"{snap.hourly_data[-1].timestamp}  T_out {min(t):.1f}..{max(t):.1f} C  -> {out}")
