"""
weather.py

Real hourly weather for the COCOON shelter models.

RC network model source: Open-Meteo
  - ERA5 reanalysis archive for past dates (hourly, from 1940, no gaps),
    forecast API for the last few days, today and up to 16 days ahead,
    so every date the user enters returns data.
  - Temperature is downscaled by Open-Meteo to the site elevation, so NO
    manual lapse-rate correction is needed.
  - Free, no API key.

Leh airport (VILH) station observations were tried through the Iowa
Environmental Mesonet but it holds no reports for this station, so that
source was removed. NASA POWER is kept only for the legacy single-room
model (menu option 1).

All weather tables have hourly rows with naive timestamps in Indian
Standard Time (UTC+5:30) and the columns:
    timestamp, temperature_C, solar_radiation_W_m2,
    wind_speed_m_s, humidity_percent, diffuse_radiation_W_m2, dni_W_m2

Radiation timing: Open-Meteo gives the AVERAGE over the preceding hour
(value at 14:00 = mean of 13:00-14:00). This module re-times it so the
value at each timestamp is the estimate AT that time (mean of the two
hour-averages around it). solar.py can therefore compute the sun position
at the timestamp itself, with time_standard="standard", utc_offset 5.5.

No synthetic data is ever used: if the source fails an error is raised.
"""

import hashlib
import io
import json
import os
import time
from datetime import date, datetime, timedelta

import pandas as pd
import requests


# ==================================================
# SETTINGS
# ==================================================

DEFAULT_SITE_ELEVATION_M = 3500          # Leh town
TIMEZONE = "Asia/Kolkata"
IST_OFFSET = pd.Timedelta(hours=5, minutes=30)

CACHE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "cache", "weather"
)

OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_LAG_DAYS = 7                     # ERA5 archive complete up to ~5-7 days ago
OPEN_METEO_HOURLY = [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "shortwave_radiation",
    "diffuse_radiation",
    "direct_normal_irradiance",
]


MAX_ATTEMPTS = 3
REQUEST_TIMEOUT_S = 90
MAX_GAP_HOURS = 3

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"

# Kept only so older imports in main.py do not break.
REGIONAL_WEATHER_URL_ENV_VAR = "COCOON_REGIONAL_WEATHER_URL"



class WeatherUnavailable(RuntimeError):
    """A weather source could not provide usable data."""


# ==================================================
# CLEAN WEATHER DATA
# ==================================================

def clean_weather_data(weather):

    attrs = dict(weather.attrs)
    weather = weather.copy()

    required_columns = ["timestamp", "temperature_C", "solar_radiation_W_m2"]

    for column in required_columns:
        if column not in weather.columns:
            raise ValueError(f"Required column missing: {column}")

    weather["timestamp"] = pd.to_datetime(weather["timestamp"], errors="coerce")

    numeric_columns = [
        "temperature_C",
        "solar_radiation_W_m2",
        "wind_speed_m_s",
        "humidity_percent",
        "earth_skin_temperature_C",
        "diffuse_radiation_W_m2",
        "dni_W_m2",
    ]

    for column in numeric_columns:
        if column in weather.columns:
            weather[column] = pd.to_numeric(weather[column], errors="coerce")
            weather[column] = weather[column].replace(
                [-999, -999.0, -9999, -1000], float("nan")
            )

    # Physical validation
    weather.loc[weather["temperature_C"] < -100, "temperature_C"] = float("nan")
    weather.loc[weather["temperature_C"] > 70, "temperature_C"] = float("nan")
    weather.loc[weather["solar_radiation_W_m2"] < 0, "solar_radiation_W_m2"] = float("nan")

    if "wind_speed_m_s" in weather.columns:
        weather.loc[weather["wind_speed_m_s"] < 0, "wind_speed_m_s"] = float("nan")

    if "humidity_percent" in weather.columns:
        weather.loc[weather["humidity_percent"] < 0, "humidity_percent"] = float("nan")
        weather.loc[weather["humidity_percent"] > 100, "humidity_percent"] = float("nan")

    weather = weather.dropna(subset=required_columns)
    weather = weather.sort_values("timestamp").reset_index(drop=True)

    if len(weather) == 0:
        raise ValueError(
            "No valid weather records available for the selected location and period."
        )

    weather.attrs.update(attrs)
    return weather


# ==================================================
# LOAD LOCAL WEATHER CSV (legacy model)
# ==================================================

def load_weather_data(filepath):
    return clean_weather_data(pd.read_csv(filepath))


# ==================================================
# SHARED HELPERS
# ==================================================

def _to_date(value):
    """Accept 'YYYYMMDD', 'YYYY-MM-DD', date or datetime."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Unrecognised date: {value!r} (use YYYYMMDD)")


def _hourly_index(start, end):
    """Hourly IST timestamps from start 00:00 to end 23:00."""
    first = datetime.combine(start, datetime.min.time())
    last = datetime.combine(end, datetime.min.time()) + timedelta(hours=23)
    return pd.date_range(first, last, freq="h")


def _cache_path(kind, key, extension):
    digest = hashlib.sha1(
        json.dumps(key, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"{kind}_{digest}.{extension}")


def _http_get(url, params):
    """GET with retry on HTTP 429/5xx and network errors. Returns text."""
    last_error = None

    for attempt in range(1, MAX_ATTEMPTS + 1):

        try:
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_S)
        except requests.RequestException as error:
            last_error = f"network error: {error}"
            if attempt < MAX_ATTEMPTS:
                time.sleep(2 ** attempt)
            continue

        if response.status_code in (429, 502, 503, 504):
            last_error = f"HTTP {response.status_code}"
            if attempt < MAX_ATTEMPTS:
                retry_after = str(response.headers.get("Retry-After", ""))
                try:
                    delay = float(retry_after)
                except ValueError:
                    delay = 2 ** attempt
                delay = min(max(delay, 1.0), 120.0)
                print(
                    f"  {url.split('/')[2]}: HTTP {response.status_code}, "
                    f"retrying in {delay:.0f} s (attempt {attempt}/{MAX_ATTEMPTS})"
                )
                time.sleep(delay)
            continue

        if response.status_code != 200:
            raise WeatherUnavailable(
                f"HTTP {response.status_code} from {url}: {response.text[:200]}"
            )

        return response.text

    raise WeatherUnavailable(f"{url} failed after {MAX_ATTEMPTS} attempts ({last_error})")


def _fill_short_gaps(series, max_gap=MAX_GAP_HOURS):
    """Interpolate NaN runs of length <= max_gap; longer runs stay NaN."""
    values = series.astype(float).copy()
    is_nan = values.isna()
    if not is_nan.any():
        return values
    run_id = (is_nan != is_nan.shift()).cumsum()
    run_length = is_nan.groupby(run_id).transform("sum")
    fillable = is_nan & (run_length <= max_gap)
    interpolated = values.interpolate(method="linear", limit_direction="both")
    values[fillable] = interpolated[fillable]
    return values


def _retime_hour_averages(series):
    """
    Convert hour-ending averages (value at H = mean of H-1..H) into an
    estimate at H: the mean of the averages for H-1..H and H..H+1.
    """
    following = series.shift(-1)
    return ((series + following) / 2.0).fillna(series)


# ==================================================
# OPEN-METEO
# ==================================================

def _open_meteo_request(url, latitude, longitude, start, end, elevation_m):

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "hourly": ",".join(OPEN_METEO_HOURLY),
        "wind_speed_unit": "ms",
        "timezone": TIMEZONE,
        "elevation": elevation_m,
    }

    # Archive answers never change -> cache. Forecast answers do -> no cache.
    use_cache = url == OPEN_METEO_ARCHIVE_URL
    path = _cache_path("openmeteo", {"url": url, **params}, "json")

    if use_cache and os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    data = json.loads(_http_get(url, params))

    if data.get("error"):
        raise WeatherUnavailable(f"Open-Meteo error: {data.get('reason')}")

    if use_cache:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(data, handle)

    return data


def _open_meteo_frame(data):
    hourly = data["hourly"]
    return pd.DataFrame({
        "timestamp": pd.to_datetime(hourly["time"]),
        "temperature_C": hourly["temperature_2m"],
        "solar_radiation_W_m2": hourly["shortwave_radiation"],
        "wind_speed_m_s": hourly["wind_speed_10m"],
        "humidity_percent": hourly["relative_humidity_2m"],
        "diffuse_radiation_W_m2": hourly["diffuse_radiation"],
        "dni_W_m2": hourly["direct_normal_irradiance"],
    })


def fetch_open_meteo_weather(
    latitude,
    longitude,
    start_date,
    end_date,
    site_elevation_m=DEFAULT_SITE_ELEVATION_M,
    today=None,
):
    """
    Hourly Open-Meteo weather in IST, downscaled to site_elevation_m.
    Uses the ERA5 archive for dates older than ARCHIVE_LAG_DAYS and the
    forecast API (which also holds recent past days) for newer dates.
    """

    start, end = _to_date(start_date), _to_date(end_date)
    if end < start:
        raise ValueError("End date cannot be before start date.")

    today = today or date.today()
    cutoff = today - timedelta(days=ARCHIVE_LAG_DAYS)

    # One extra day so the last hour can be re-timed.
    fetch_end = end + timedelta(days=1)

    parts, apis_used = [], []

    if start <= cutoff:
        parts.append(_open_meteo_request(
            OPEN_METEO_ARCHIVE_URL, latitude, longitude,
            start, min(fetch_end, cutoff), site_elevation_m))
        apis_used.append("archive")

    if fetch_end > cutoff:
        parts.append(_open_meteo_request(
            OPEN_METEO_FORECAST_URL, latitude, longitude,
            max(start, cutoff + timedelta(days=1)), fetch_end, site_elevation_m))
        apis_used.append("forecast")

    frame = pd.concat([_open_meteo_frame(part) for part in parts], ignore_index=True)
    frame = frame.drop_duplicates("timestamp").set_index("timestamp").sort_index()

    for column in ("solar_radiation_W_m2", "diffuse_radiation_W_m2", "dni_W_m2"):
        frame[column] = _retime_hour_averages(frame[column].clip(lower=0.0))

    frame = frame.reindex(_hourly_index(start, end))

    missing = frame["temperature_C"].isna().mean()
    if missing > 0.2:
        raise WeatherUnavailable(
            f"Open-Meteo returned {missing:.0%} missing temperatures for this period."
        )

    for column in frame.columns:
        frame[column] = _fill_short_gaps(frame[column])

    if frame["temperature_C"].isna().any():
        raise WeatherUnavailable(
            f"Open-Meteo data has gaps longer than {MAX_GAP_HOURS} h."
        )

    for column in ("solar_radiation_W_m2", "diffuse_radiation_W_m2", "dni_W_m2"):
        frame[column] = frame[column].fillna(0.0)

    label = {
        "archive": "open_meteo_archive_era5",
        "forecast": "open_meteo_forecast",
    }.get("+".join(apis_used), "open_meteo_archive+forecast")

    weather = clean_weather_data(frame.rename_axis("timestamp").reset_index())
    weather["weather_source"] = label

    weather.attrs.update({
        "weather_source": label,
        "open_meteo_apis": apis_used,
        "requested_elevation_m": site_elevation_m,
        "open_meteo_elevation_m": parts[0].get("elevation"),
        "grid_latitude": parts[0].get("latitude"),
        "grid_longitude": parts[0].get("longitude"),
        "time_standard": "standard",
        "utc_offset_h": 5.5,
        "elevation_corrected_by": "open_meteo_downscaling",
    })

    return weather


def fetch_monthly_air_climatology_open_meteo(
    latitude,
    longitude,
    site_elevation_m=DEFAULT_SITE_ELEVATION_M,
    years=10,
    today=None,
):
    """
    Long-term monthly mean air temperature at the site elevation from the
    last `years` full calendar years of the Open-Meteo ERA5 archive.
    Returns the Kusuda inputs: annual mean, amplitude (half the range of
    monthly means) and coldest day of year (middle of the coldest month).
    """

    today = today or date.today()
    last_year = today.year - 1
    start, end = date(last_year - years + 1, 1, 1), date(last_year, 12, 31)

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": "temperature_2m_mean",
        "timezone": TIMEZONE,
        "elevation": site_elevation_m,
    }

    path = _cache_path("openmeteo_climatology", params, "json")

    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    else:
        data = json.loads(_http_get(OPEN_METEO_ARCHIVE_URL, params))
        if data.get("error"):
            raise WeatherUnavailable(f"Open-Meteo error: {data.get('reason')}")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(data, handle)

    daily = pd.Series(
        data["daily"]["temperature_2m_mean"],
        index=pd.to_datetime(data["daily"]["time"]),
        dtype=float,
    ).dropna()

    monthly = daily.groupby(daily.index.month).mean().reindex(range(1, 13))

    if monthly.isna().any():
        raise WeatherUnavailable("Open-Meteo climatology is missing months.")

    middle_of_month = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349]
    coldest_month = int(monthly.idxmin())

    return {
        "monthly_means_C": [round(value, 2) for value in monthly.tolist()],
        "annual_mean_C": round(float(monthly.mean()), 2),
        "amplitude_K": round(float((monthly.max() - monthly.min()) / 2.0), 2),
        "coldest_day_of_year": middle_of_month[coldest_month - 1],
        "period": f"{start.year}-{end.year}",
        "source": "open_meteo_archive_era5",
    }


# ==================================================
# UNIFIED FETCH (called by main.py)
# ==================================================

def get_best_available_weather(
    latitude,
    longitude,
    start_date,
    end_date,
    site_elevation_m=DEFAULT_SITE_ELEVATION_M,
    today=None,
    **_unused_legacy_arguments,
):
    """
    Returns (weather_dataframe, source_label) from Open-Meteo.

    Old arguments from the previous menu (prefer_regional, regional_source,
    regional_path, regional_api_url, ...) are accepted and ignored, so an
    older main.py keeps working. Raises RuntimeError if Open-Meteo fails;
    no synthetic data is substituted.
    """

    try:
        weather = fetch_open_meteo_weather(
            latitude, longitude, start_date, end_date,
            site_elevation_m=site_elevation_m, today=today,
        )
    except (WeatherUnavailable, requests.RequestException, ValueError, KeyError) as error:
        raise RuntimeError(
            f"Could not obtain real weather data from Open-Meteo: {error}\n"
            "Check the internet connection and the dates, then try again. "
            "No synthetic weather is used."
        ) from error

    return weather, weather.attrs["weather_source"]


# ==================================================
# NASA POWER (legacy single-room model only)
# ==================================================

def fetch_nasa_power_weather(
    latitude,
    longitude,
    start_date,
    end_date,
    time_standard="LST",
):

    start_dt = datetime.strptime(start_date, "%Y%m%d")
    end_dt = datetime.strptime(end_date, "%Y%m%d")

    if end_dt < start_dt:
        raise ValueError("End date cannot be before start date.")

    request_params = {
        "parameters": "T2M,ALLSKY_SFC_SW_DWN,WS10M,RH2M,TS",
        "community": "RE",
        "longitude": longitude,
        "latitude": latitude,
        "start": start_date,
        "end": end_date,
        "format": "JSON",
        "time-standard": time_standard,
    }

    response = requests.get(NASA_POWER_URL, params=request_params, timeout=60)
    response.raise_for_status()
    data = response.json()

    if "properties" not in data:
        raise ValueError("Unexpected NASA POWER response.")

    parameters_data = data["properties"].get("parameter", {})

    if not parameters_data:
        raise ValueError("NASA POWER returned no parameter data.")

    timestamps = set()
    for parameter_values in parameters_data.values():
        timestamps.update(parameter_values.keys())

    records = []

    for timestamp_key in sorted(timestamps):
        try:
            timestamp = pd.to_datetime(timestamp_key, format="%Y%m%d%H")
        except ValueError:
            continue

        records.append({
            "timestamp": timestamp,
            "temperature_C": parameters_data.get("T2M", {}).get(timestamp_key),
            "solar_radiation_W_m2": parameters_data.get("ALLSKY_SFC_SW_DWN", {}).get(timestamp_key),
            "wind_speed_m_s": parameters_data.get("WS10M", {}).get(timestamp_key),
            "humidity_percent": parameters_data.get("RH2M", {}).get(timestamp_key),
            "earth_skin_temperature_C": parameters_data.get("TS", {}).get(timestamp_key),
        })

    weather = clean_weather_data(pd.DataFrame(records))

    coordinates = data.get("geometry", {}).get("coordinates", [])
    if len(coordinates) >= 3 and coordinates[2] is not None:
        weather.attrs["nasa_grid_elevation_m"] = float(coordinates[2])

    return weather


# ==================================================
# ELEVATION (LAPSE-RATE) CORRECTION - NASA POWER ONLY
# ==================================================
# Do NOT apply to Open-Meteo data: Open-Meteo already downscales
# temperature to the requested site elevation.

STANDARD_LAPSE_RATE_K_PER_M = 0.0065


def apply_elevation_correction(
    weather,
    grid_elevation_m,
    site_elevation_m,
    lapse_rate_K_per_m=STANDARD_LAPSE_RATE_K_PER_M,
):
    """Return (corrected_copy, delta_K). Positive delta = warmer."""

    if weather.attrs.get("elevation_corrected_by") == "open_meteo_downscaling":
        return weather.copy(), 0.0

    delta_K = (grid_elevation_m - site_elevation_m) * lapse_rate_K_per_m

    corrected = weather.copy()
    for column in ("temperature_C", "earth_skin_temperature_C"):
        if column in corrected.columns:
            corrected[column] = corrected[column] + delta_K

    corrected["elevation_correction_K"] = delta_K

    return corrected, delta_K


# ==================================================
# SELF-CHECK:  python weather.py
# ==================================================

if __name__ == "__main__":

    LAT, LON, ELEVATION = 34.1526, 77.5771, 3500
    today = date.today()

    checks = [
        ("Past week (ERA5 archive)", "20250110", "20250116"),
        ("Last 3 days (forecast API)",
         (today - timedelta(days=3)).strftime("%Y%m%d"),
         (today - timedelta(days=1)).strftime("%Y%m%d")),
        ("Spanning archive and recent",
         (today - timedelta(days=12)).strftime("%Y%m%d"),
         (today - timedelta(days=1)).strftime("%Y%m%d")),
    ]

    for name, start, end in checks:
        weather, label = get_best_available_weather(
            LAT, LON, start, end, site_elevation_m=ELEVATION)
        print(f"{name}: {start}-{end} -> {label}, {len(weather)} records, "
              f"{weather['temperature_C'].min():.1f} to "
              f"{weather['temperature_C'].max():.1f} deg C, "
              f"peak sun {weather['solar_radiation_W_m2'].max():.0f} W/m2, "
              f"elevation used {weather.attrs.get('open_meteo_elevation_m')} m")

    print("\nGround climatology (Open-Meteo, 10 years):")
    print(" ", fetch_monthly_air_climatology_open_meteo(LAT, LON, ELEVATION))
