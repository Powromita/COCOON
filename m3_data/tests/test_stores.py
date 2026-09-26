"""M3: weather snapshots (PRD 9.2, 9.3) and material snapshots (PRD 9.4)."""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from cocoon_contracts import WeatherSnapshot  # noqa: E402
from m3_data import (WeatherError, WeatherStore, extended_snapshot, load_snapshot, standard_snapshot,  # noqa: E402
                     verify_checksum, verify_snapshot)


def archive(tmp_path, hours=200, drop=(), duplicate=False) -> Path:
    ts = pd.date_range("2026-01-01", periods=hours, freq="h")
    df = pd.DataFrame({"timestamp": ts, "temperature_C": [-10.0 + (i % 24) * 0.5 for i in range(hours)],
                       "solar_radiation_W_m2": [max(0, 400 - abs(i % 24 - 12) * 60) for i in range(hours)],
                       "wind_speed_m_s": 2.0, "humidity_percent": 40.0, "wind_direction_deg": 180, "cloud_cover_percent": 10,
                       "dni_W_m2": 0.0, "diffuse_radiation_W_m2": 0.0})
    df = df.drop(index=list(drop))
    if duplicate:
        df = pd.concat([df, df.iloc[[5]]])
    cache = tmp_path / "cache"
    cache.mkdir()
    df.to_csv(cache / "leh_weather_archive.csv", index=False)
    return cache


def store(tmp_path, **kw) -> WeatherStore:
    return WeatherStore(cache_dir=archive(tmp_path, **kw), snapshot_dir=tmp_path / "snaps")


def test_build_freezes_a_valid_checksummed_snapshot(tmp_path):
    s = store(tmp_path)
    snap = s.build("leh", "2026-01-02", "2026-01-09")
    assert isinstance(snap, WeatherSnapshot) and len(snap.hourly_data) == 168
    assert snap.snapshot_id.startswith("wx_leh_") and snap.source.is_cached and snap.source.source_name == "NASA_POWER"
    assert verify_checksum(snap) and snap.interpolations == []
    assert all(p.timestamp.utcoffset().total_seconds() == 5.5 * 3600 for p in snap.hourly_data)


def test_persist_and_get_round_trip_and_tamper_detection(tmp_path):
    s = store(tmp_path)
    snap = s.build("leh", "2026-01-02", "2026-01-05")
    assert s.get(snap.snapshot_id) == snap and snap.snapshot_id in s.list()
    path = s.snapshot_dir / f"{snap.snapshot_id}.json"
    path.write_text(path.read_text(encoding="utf-8").replace('"ghi_w_m2": 0.0', '"ghi_w_m2": 1.0', 1), encoding="utf-8")
    with pytest.raises(WeatherError) as e:
        s.get(snap.snapshot_id)
    assert e.value.code == "WEATHER_CHECKSUM_MISMATCH"


def test_short_gap_is_interpolated_and_recorded(tmp_path):
    s = store(tmp_path, drop=(50, 51))
    snap = s.build("leh", "2026-01-02", "2026-01-09")
    assert len(snap.hourly_data) == 168 and len(snap.interpolations) == 1
    assert snap.interpolations[0].method == "linear"


def test_long_gap_is_refused_not_papered_over(tmp_path):
    s = store(tmp_path, drop=(50, 51, 52, 53, 54))
    with pytest.raises(WeatherError) as e:
        s.build("leh", "2026-01-02", "2026-01-09")
    assert e.value.code == "WEATHER_GAP_TOO_LARGE"


def test_duplicate_timestamps_and_empty_windows_are_refused(tmp_path):
    with pytest.raises(WeatherError) as e:
        store(tmp_path, duplicate=True).build("leh", "2026-01-01", "2026-01-03")
    assert e.value.code == "WEATHER_DUPLICATE_TIMESTAMP"
    (tmp_path / "b").mkdir()
    with pytest.raises(WeatherError) as e2:
        store(tmp_path / "b").build("leh", "2027-01-01", "2027-01-03")
    assert e2.value.code == "WEATHER_WINDOW_EMPTY"


def test_unknown_site_and_bad_window(tmp_path):
    s = store(tmp_path)
    with pytest.raises(WeatherError) as e:
        s.build("atlantis", "2026-01-02", "2026-01-03")
    assert e.value.code == "WEATHER_SITE_UNKNOWN"
    with pytest.raises(WeatherError):
        s.build("leh", "2026-01-05", "2026-01-02")


def test_coldest_window_picks_the_lowest_mean(tmp_path):
    s = store(tmp_path, hours=400)
    snap = s.coldest_window("leh", 48, "2026-01-01", "2026-01-15")
    others = [s.build("leh", pd.Timestamp("2026-01-01") + pd.Timedelta(hours=h), pd.Timestamp("2026-01-01") + pd.Timedelta(hours=h + 48),
                      persist=False) for h in (0, 24, 100)]
    mean = lambda x: sum(p.outdoor_dry_bulb_temperature_c for p in x.hourly_data) / len(x.hourly_data)   # noqa: E731
    assert mean(snap) <= min(mean(o) for o in others) + 1e-9


def test_get_rejects_path_traversal(tmp_path):
    s = store(tmp_path)
    for bad in ("../x", "..\\x", "/etc/passwd"):
        with pytest.raises(KeyError):
            s.get(bad)


def test_real_archives_cover_every_site():
    real = WeatherStore()
    assert len(real.sites()) == 10
    snap = real.build("leh", "2026-01-01", "2026-01-08", persist=False)
    assert len(snap.hourly_data) == 168 and verify_checksum(snap)
    assert snap.hourly_data[0].wind_direction_deg is not None and snap.hourly_data[0].dni_w_m2 is not None


def test_material_snapshots():
    std, ext = standard_snapshot(), extended_snapshot()
    assert set(std.materials) <= set(ext.materials) and {"mat_adobe", "mat_wood_timber"} <= set(ext.materials)
    assert ext.materials["mat_stone"] == std.materials["mat_stone"]           # the frozen v1 values win
    assert verify_snapshot(ext) and load_snapshot("mat_snap_himalayan_v1") == std
    assert load_snapshot("mat_snap_himalayan_v2").checksum_sha256 == ext.checksum_sha256
    with pytest.raises(KeyError):
        load_snapshot("../mat_x")
