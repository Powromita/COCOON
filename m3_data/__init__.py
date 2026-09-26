"""
COCOON Module M3 - versioned weather and material snapshots (PRD v4 section 9).

    WeatherStore       hourly site archives -> validated, checksummed M0 WeatherSnapshots (frozen, persisted by id)
    standard_snapshot / extended_snapshot / load_snapshot   M0 MaterialSnapshots

Depends on the M0 contracts, pandas and the standard library.
"""

from m3_data.materials_store import (extended_snapshot, load_snapshot, save_snapshot, standard_snapshot,
                                     verify_snapshot)
from m3_data.weather_store import SITES, WeatherError, WeatherStore, verify_checksum

__all__ = ["WeatherStore", "WeatherError", "SITES", "verify_checksum", "standard_snapshot", "extended_snapshot",
           "load_snapshot", "save_snapshot", "verify_snapshot"]
