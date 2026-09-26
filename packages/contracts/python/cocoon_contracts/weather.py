"""
weather.py - Meteorological timeseries, source provenance, and frozen weather snapshots.
"""

from __future__ import annotations

from typing import Literal
from pydantic import Field, field_validator, model_validator
from cocoon_contracts.common import AwareDatetime, ContractModel, SCHEMA_VERSION


class HourlyWeatherPoint(ContractModel):
    """Hourly meteorological observation point."""
    timestamp: AwareDatetime = Field(description="Observation timestamp with timezone")
    outdoor_dry_bulb_temperature_c: float = Field(
        ge=-70.0,
        le=60.0,
        description="Dry-bulb air temperature in °C"
    )
    ghi_w_m2: float = Field(ge=0.0, description="Global horizontal irradiance in W/m²")
    dni_w_m2: float | None = Field(default=None, ge=0.0, description="Direct normal irradiance in W/m²")
    dhi_w_m2: float | None = Field(default=None, ge=0.0, description="Diffuse horizontal irradiance in W/m²")
    wind_speed_m_s: float = Field(default=0.0, ge=0.0, description="Wind speed in m/s")
    wind_direction_deg: float | None = Field(
        default=None,
        ge=0.0,
        le=360.0,
        description="Wind compass direction [0..360]"
    )
    relative_humidity_pct: float = Field(
        default=50.0,
        ge=0.0,
        le=100.0,
        description="Relative humidity percentage [0..100]"
    )
    cloud_cover_pct: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Cloud coverage fraction [0..100]"
    )


class GapInterpolationRecord(ContractModel):
    """Audit log of missing weather data interpolated during processing."""
    start_time: AwareDatetime
    end_time: AwareDatetime
    interpolated_fields: list[str]
    method: str = Field(description="Interpolation method used (e.g. 'linear', 'clamped_spline')")


class WeatherSourceMetadata(ContractModel):
    """Provenance and acquisition details for meteorological dataset."""
    source_name: str = Field(description="Origin repository (e.g. 'NASA_POWER', 'ERA5', 'IMD', 'cached_file')")
    location_name: str = Field(description="Named geographical site (e.g. 'Leh_Ladakh')")
    latitude_deg: float = Field(ge=-90.0, le=90.0, description="Site latitude [-90..90]")
    longitude_deg: float = Field(ge=-180.0, le=180.0, description="Site longitude [-180..180]")
    elevation_m: float = Field(ge=-500.0, le=9000.0, description="Site elevation in meters")
    is_cached: bool = Field(default=False, description="Whether data was loaded from local offline cache")
    fetch_date: AwareDatetime = Field(description="Timestamp when data was fetched or generated")
    time_zone: str = Field(description="IANA timezone identifier")


class WeatherSnapshot(ContractModel):
    """Frozen, immutable hourly weather dataset used for thermal simulations."""
    schema_version: Literal["4.0"] = Field(description="Contract schema version, strictly '4.0'")
    snapshot_id: str = Field(description="Weather snapshot identifier starting with 'wx_'")
    source: WeatherSourceMetadata = Field(description="Origin and location metadata")
    hourly_data: list[HourlyWeatherPoint] = Field(description="Sequence of hourly weather points")
    interpolations: list[GapInterpolationRecord] = Field(
        default_factory=list,
        description="Records of any filled data gaps"
    )
    checksum_sha256: str = Field(description="Integrity hash for the dataset")

    @field_validator("snapshot_id")
    @classmethod
    def validate_snapshot_id(cls, v: str) -> str:
        if not v.startswith("wx_"):
            raise ValueError(f"snapshot_id '{v}' must start with 'wx_'")
        return v

    @field_validator("hourly_data")
    @classmethod
    def validate_hourly_timestamps(cls, v: list[HourlyWeatherPoint]) -> list[HourlyWeatherPoint]:
        seen = set()
        for i, pt in enumerate(v):
            ts = pt.timestamp
            if ts in seen:
                raise ValueError(f"Duplicate weather timestamp detected: {ts}")
            seen.add(ts)
            if i > 0 and ts <= v[i - 1].timestamp:
                raise ValueError(
                    f"Weather timestamps must be strictly ascending: {v[i-1].timestamp} followed by {ts}"
                )
        return v
