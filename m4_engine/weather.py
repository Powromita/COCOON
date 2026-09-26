"""
weather.py - an M0 WeatherSnapshot resampled to the simulation timestep.

Temperature and wind are linearly interpolated between the hourly stamps; irradiance is an hourly *average*, so
it is held constant across its hour. Every value is evaluated at the middle of each step (the implicit step
integrates over it). A window the snapshot does not cover is refused - M4 never extrapolates weather.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from cocoon_contracts import WeatherSnapshot

from m4_engine.errors import M4Error


@dataclass(frozen=True)
class StepWeather:
    time: datetime               # step midpoint
    t_out_c: float
    ghi: float
    dni: float | None
    dhi: float | None
    wind_ms: float
    wind_dir_deg: float | None
    rh_pct: float
    cloud_pct: float | None


@dataclass(frozen=True)
class WeatherSeries:
    snapshot_id: str
    latitude_deg: float
    longitude_deg: float
    elevation_m: float
    source_name: str
    steps: tuple[StepWeather, ...]
    mean_outdoor_c: float


def solar_standard_for(source_name: str, requested: str) -> str:
    if requested != "auto":
        return requested
    # NASA POWER hourly data in this project is requested as local SOLAR time (thermal-calculator/solar.py)
    return "solar" if source_name.upper().startswith("NASA") else "clock"


def build_series(snapshot: WeatherSnapshot, start: datetime, end: datetime, timestep_s: int) -> WeatherSeries:
    pts = snapshot.hourly_data
    if not pts:
        raise M4Error("WEATHER_EMPTY", f"weather snapshot '{snapshot.snapshot_id}' has no data")
    stamps = [p.timestamp for p in pts]
    first, last = stamps[0], stamps[-1] + timedelta(hours=1)
    if start < first or end > last:
        raise M4Error("WEATHER_DOES_NOT_COVER_WINDOW",
                      f"simulation window {start.isoformat()}..{end.isoformat()} is outside weather "
                      f"{first.isoformat()}..{last.isoformat()} of '{snapshot.snapshot_id}'",
                      {"weather_first": first.isoformat(), "weather_end": last.isoformat()})
    n = int(round((end - start).total_seconds() / timestep_s))
    if n < 1 or abs(n * timestep_s - (end - start).total_seconds()) > 1e-6:
        raise M4Error("WINDOW_NOT_MULTIPLE_OF_TIMESTEP",
                      f"window length {(end - start).total_seconds()} s is not a whole number of {timestep_s} s steps")
    secs = [(s - first).total_seconds() for s in stamps]
    steps: list[StepWeather] = []
    for k in range(n):
        mid = start + timedelta(seconds=(k + 0.5) * timestep_s)
        x = (mid - first).total_seconds()
        j = min(max(bisect.bisect_right(secs, x) - 1, 0), len(pts) - 1)          # hour containing `mid`
        j2 = min(j + 1, len(pts) - 1)
        span = (secs[j2] - secs[j]) if j2 != j else 1.0
        f = 0.0 if j2 == j else min(1.0, max(0.0, (x - secs[j]) / span))
        a, b = pts[j], pts[j2]
        lin = lambda u, v: u + f * (v - u)                                          # noqa: E731
        wd = None
        if a.wind_direction_deg is not None:
            wd = a.wind_direction_deg
        steps.append(StepWeather(
            time=mid,
            t_out_c=lin(a.outdoor_dry_bulb_temperature_c, b.outdoor_dry_bulb_temperature_c),
            ghi=a.ghi_w_m2, dni=a.dni_w_m2, dhi=a.dhi_w_m2,
            wind_ms=lin(a.wind_speed_m_s, b.wind_speed_m_s), wind_dir_deg=wd,
            rh_pct=lin(a.relative_humidity_pct, b.relative_humidity_pct), cloud_pct=a.cloud_cover_pct))
    src = snapshot.source
    return WeatherSeries(snapshot.snapshot_id, src.latitude_deg, src.longitude_deg, src.elevation_m, src.source_name,
                         tuple(steps), sum(s.t_out_c for s in steps) / len(steps))


def dew_point_c(t_c: float, rh_pct: float) -> float:
    """Magnus formula."""
    rh = min(100.0, max(1.0, rh_pct))
    a, b = 17.62, 243.12
    g = math.log(rh / 100.0) + a * t_c / (b + t_c)
    return b * g / (a - g)
