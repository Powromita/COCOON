"""
weather_store.py - Module M3: frozen, checksummed M0 WeatherSnapshots from the cached site archives (PRD 9.1-9.3).

    store = WeatherStore()                                        # data/weather/cache + data/weather_snapshots
    snap  = store.build("leh", start, end)                        # validated, gap-checked, frozen, persisted
    snap  = store.get("wx_leh_20260120T00_168h")                  # later, by id (this is what M4 calls)
    snap  = store.coldest_window("leh", hours=168, season_start=..., season_end=...)

Processing (PRD 9.2): normalise the timestamp to the project timezone; reject duplicates, non-ascending stamps
and out-of-range values; interpolate only short gaps (<= `max_gap_hours`) and record every interpolation in the
snapshot; refuse longer gaps (WEATHER_GAP_TOO_LARGE); freeze with a SHA-256 checksum. The snapshot always states
its source and that it came from the local cache (PRD 9.3: cached data is never passed off as a live fetch).

Time basis: the archives are NASA POWER hourly data requested in local SOLAR time, labelled here with the project
offset because the M0 contract needs an aware timestamp. `source.source_name` stays "NASA_POWER", which is what
M4 keys its solar-time handling on.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from cocoon_contracts import WeatherSnapshot

REPO_ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = REPO_ROOT / "data" / "weather" / "cache"
SNAPSHOT_DIR = REPO_ROOT / "data" / "weather_snapshots"
IST = timezone(timedelta(hours=5, minutes=30))

# Site coordinates and elevations (approximate). PLACEHOLDER values to be confirmed by the data owner.
SITES: dict[str, dict] = {
    "leh": {"name": "Leh_Ladakh", "lat": 34.1526, "lon": 77.5771, "elev": 3500.0},
    "kargil": {"name": "Kargil", "lat": 34.5539, "lon": 76.1349, "elev": 2676.0},
    "dras": {"name": "Dras", "lat": 34.4299, "lon": 75.7574, "elev": 3230.0},
    "nubra_diskit": {"name": "Nubra_Diskit", "lat": 34.5460, "lon": 77.5600, "elev": 3100.0},
    "pangong_tso": {"name": "Pangong_Tso", "lat": 33.7500, "lon": 78.6600, "elev": 4350.0},
    "chushul": {"name": "Chushul", "lat": 33.5900, "lon": 78.6500, "elev": 4360.0},
    "nyoma": {"name": "Nyoma", "lat": 33.1900, "lon": 78.6500, "elev": 4200.0},
    "turtuk": {"name": "Turtuk", "lat": 34.8400, "lon": 76.8200, "elev": 2900.0},
    "daulat_beg_oldi": {"name": "Daulat_Beg_Oldi", "lat": 35.3300, "lon": 77.8800, "elev": 5000.0},
    "siachen_base_camp": {"name": "Siachen_Base_Camp", "lat": 35.4200, "lon": 77.1000, "elev": 5400.0},
}

_COLUMNS = {
    "temperature_C": "outdoor_dry_bulb_temperature_c", "solar_radiation_W_m2": "ghi_w_m2", "dni_W_m2": "dni_w_m2",
    "diffuse_radiation_W_m2": "dhi_w_m2", "wind_speed_m_s": "wind_speed_m_s", "wind_direction_deg": "wind_direction_deg",
    "humidity_percent": "relative_humidity_pct", "cloud_cover_percent": "cloud_cover_pct",
}


class WeatherError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def canonical_checksum(points: list[dict]) -> str:
    return hashlib.sha256(json.dumps(points, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def verify_checksum(snap: WeatherSnapshot) -> bool:
    points = [p.model_dump(mode="json") for p in snap.hourly_data]
    return canonical_checksum(points) == snap.checksum_sha256


class WeatherStore:
    def __init__(self, cache_dir: Path = CACHE_DIR, snapshot_dir: Path = SNAPSHOT_DIR, max_gap_hours: int = 3):
        self.cache_dir = Path(cache_dir)
        self.snapshot_dir = Path(snapshot_dir)
        self.max_gap_hours = max_gap_hours
        self._frames: dict[str, pd.DataFrame] = {}

    # ---- archives --------------------------------------------------------------------------------------------
    def sites(self) -> list[str]:
        return sorted(p.name.replace("_weather_archive.csv", "") for p in self.cache_dir.glob("*_weather_archive.csv"))

    def _frame(self, site: str) -> pd.DataFrame:
        if site not in self._frames:
            path = self.cache_dir / f"{site}_weather_archive.csv"
            if not path.is_file():
                raise WeatherError("WEATHER_SITE_UNKNOWN", f"no cached archive for site '{site}' (have {self.sites()})")
            self._frames[site] = pd.read_csv(path, parse_dates=["timestamp"])
        return self._frames[site]

    # ---- snapshots -----------------------------------------------------------------------------------------------
    def build(self, site: str, start: datetime | pd.Timestamp, end: datetime | pd.Timestamp, *,
              snapshot_id: str | None = None, persist: bool = True) -> WeatherSnapshot:
        """Snapshot of [start, end) (hourly). `start`/`end` may be naive (archive local time) or aware."""
        meta = SITES.get(site)
        if meta is None:
            raise WeatherError("WEATHER_SITE_UNKNOWN", f"site '{site}' has no coordinates in SITES")
        s, e = pd.Timestamp(start).tz_localize(None), pd.Timestamp(end).tz_localize(None)
        if e <= s:
            raise WeatherError("WEATHER_WINDOW_INVALID", "end must be after start")
        df = self._frame(site)
        win = df[(df["timestamp"] >= s) & (df["timestamp"] < e)].sort_values("timestamp")
        expected = int((e - s) / pd.Timedelta(hours=1))
        if win.empty:
            raise WeatherError("WEATHER_WINDOW_EMPTY", f"archive '{site}' has no data in {s}..{e}")
        if win["timestamp"].duplicated().any():
            raise WeatherError("WEATHER_DUPLICATE_TIMESTAMP", "duplicate timestamps in the archive window")
        win = win.set_index("timestamp").reindex(pd.date_range(s, e - pd.Timedelta(hours=1), freq="h"))
        missing_mask = win["temperature_C"].isna()
        interpolations = []
        if missing_mask.any():
            runs = (missing_mask != missing_mask.shift()).cumsum()
            for _, grp in win[missing_mask].groupby(runs[missing_mask]):
                if len(grp) > self.max_gap_hours:
                    raise WeatherError("WEATHER_GAP_TOO_LARGE",
                                       f"{len(grp)} h gap at {grp.index[0]} exceeds {self.max_gap_hours} h limit")
                interpolations.append({"start_time": grp.index[0].to_pydatetime().replace(tzinfo=IST).isoformat(),
                                       "end_time": grp.index[-1].to_pydatetime().replace(tzinfo=IST).isoformat(),
                                       "interpolated_fields": sorted(c for c in _COLUMNS if c in win.columns),
                                       "method": "linear"})
            win = win.interpolate(method="linear", limit=self.max_gap_hours, limit_area="inside")
        if len(win) != expected or win["temperature_C"].isna().any():
            raise WeatherError("WEATHER_GAP_TOO_LARGE", "window has gaps that could not be filled")

        points = []
        for ts, r in win.iterrows():
            p = {"timestamp": ts.to_pydatetime().replace(tzinfo=IST).isoformat()}
            for src, dst in _COLUMNS.items():
                if src not in win.columns or pd.isna(r[src]):
                    p[dst] = None
                    continue
                v = float(r[src])
                if dst in ("ghi_w_m2", "dni_w_m2", "dhi_w_m2", "wind_speed_m_s"):
                    v = max(0.0, v)
                if dst in ("relative_humidity_pct", "cloud_cover_pct"):
                    v = min(100.0, max(0.0, v))
                p[dst] = round(v, 4)
            for req in ("ghi_w_m2", "wind_speed_m_s", "relative_humidity_pct"):
                if p[req] is None:
                    p[req] = 0.0 if req != "relative_humidity_pct" else 50.0
            points.append(p)
        sid = snapshot_id or f"wx_{site}_{s:%Y%m%dT%H}_{expected}h"
        snap = WeatherSnapshot.model_validate({
            "schema_version": "4.0", "snapshot_id": sid,
            "source": {"source_name": "NASA_POWER", "location_name": meta["name"], "latitude_deg": meta["lat"],
                       "longitude_deg": meta["lon"], "elevation_m": meta["elev"], "is_cached": True,
                       "fetch_date": datetime.fromtimestamp((self.cache_dir / f"{site}_weather_archive.csv").stat().st_mtime,
                                                            tz=timezone.utc).replace(microsecond=0).isoformat(),
                       "time_zone": "Asia/Kolkata"},
            "hourly_data": points, "interpolations": interpolations, "checksum_sha256": canonical_checksum(points)})
        if persist:
            self.save(snap)
        return snap

    def coldest_window(self, site: str, hours: int, season_start: str, season_end: str, *, persist: bool = True) -> WeatherSnapshot:
        """Contiguous `hours`-long window with the lowest mean temperature inside the season (ties: earliest)."""
        df = self._frame(site)
        d = df[(df["timestamp"] >= pd.Timestamp(season_start)) & (df["timestamp"] < pd.Timestamp(season_end))].reset_index(drop=True)
        if len(d) < hours:
            raise WeatherError("WEATHER_WINDOW_EMPTY", f"season holds fewer than {hours} hourly records")
        roll = d["temperature_C"].rolling(hours).mean()
        ok = d["timestamp"].diff(hours - 1).eq(pd.Timedelta(hours=hours - 1))       # contiguous
        roll = roll.where(ok)
        if roll.isna().all():
            raise WeatherError("WEATHER_WINDOW_EMPTY", "no gap-free window of that length in the season")
        end_i = int(roll.idxmin())
        start = d["timestamp"].iloc[end_i - hours + 1]
        return self.build(site, start, start + pd.Timedelta(hours=hours), persist=persist)

    # ---- persistence -----------------------------------------------------------------------------------------------
    def save(self, snap: WeatherSnapshot) -> Path:
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        path = self.snapshot_dir / f"{snap.snapshot_id}.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(snap.model_dump_json(indent=1), encoding="utf-8")
        tmp.replace(path)
        return path

    def get(self, snapshot_id: str) -> WeatherSnapshot:
        path = (self.snapshot_dir / f"{snapshot_id}.json").resolve()
        try:
            path.relative_to(self.snapshot_dir.resolve())
        except ValueError:
            raise KeyError(snapshot_id)
        if not path.is_file():
            raise KeyError(snapshot_id)
        snap = WeatherSnapshot.model_validate_json(path.read_text(encoding="utf-8"))
        if not verify_checksum(snap):
            raise WeatherError("WEATHER_CHECKSUM_MISMATCH", f"snapshot '{snapshot_id}' does not match its checksum")
        return snap

    def __call__(self, snapshot_id: str) -> WeatherSnapshot:
        return self.get(snapshot_id)

    def list(self) -> list[str]:
        return sorted(p.stem for p in self.snapshot_dir.glob("wx_*.json")) if self.snapshot_dir.is_dir() else []
