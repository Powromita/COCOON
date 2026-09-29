"""sites.py - which cached weather archive serves a requirement's coordinates."""

from __future__ import annotations

import math

from m3_data import SITES

MAX_SITE_DISTANCE_KM = 60.0       # PLACEHOLDER: beyond this the nearest archive is not "the same place"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def nearest_site(lat: float, lon: float, available: list[str] | None = None) -> tuple[str, float]:
    names = [s for s in SITES if available is None or s in available]
    if not names:
        raise ValueError("no cached weather archives available")
    best = min(names, key=lambda s: haversine_km(lat, lon, SITES[s]["lat"], SITES[s]["lon"]))
    return best, haversine_km(lat, lon, SITES[best]["lat"], SITES[best]["lon"])
