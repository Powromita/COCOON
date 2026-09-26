"""
options.py - every physical assumption M4 makes that the M0 contracts do not carry.

All values are visible and editable (PRD 10.11: no hidden constants). They are copied into the
`SimulationResult` provenance notes by the evaluator so a result can be traced to the assumptions used.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class EngineOptions:
    # ---- internal gains -------------------------------------------------------------------------
    occupant_sensible_w: float = 75.0          # W per person, sensible (ASHRAE seated/light activity); PLACEHOLDER
    # ---- thermal mass -------------------------------------------------------------------------------
    contents_kj_per_k_per_m2: float = 40.0     # furniture/contents capacity per m2 floor area; PLACEHOLDER
    max_effective_mass_thickness_m: float = 0.10   # ISO 13790 style: mass deeper than this is not coupled to the zone
    # ---- air ---------------------------------------------------------------------------------------------------
    default_ach: float = 0.6                   # used only when the job carries no air_changes_per_hour
    air_reference_temperature_c: float = 10.0  # for the altitude-corrected air density
    # ---- exterior film (wind) -----------------------------------------------------------------------------------
    h_out_base_w_m2k: float = 5.7              # Juerges / McAdams: h_out = 5.7 + 3.8 v  (convection + radiation)
    h_out_wind_w_m2k_per_ms: float = 3.8
    h_out_min_w_m2k: float = 5.7               # validated range of the correlation
    h_out_max_w_m2k: float = 25.0
    leeward_wind_factor: float = 0.5           # applied to wind speed on sheltered faces when wind direction is known
    # ---- solar and sky ---------------------------------------------------------------------------------------
    ground_albedo: float = 0.2                 # 0.6-0.8 with fresh snow: set per season
    default_opaque_absorptivity: float = 0.6   # used when the outer material has no solar_absorptivity
    default_opaque_emissivity: float = 0.9
    opaque_absorptivity_override: float | None = None   # force every opaque surface's absorptivity (0 = no opaque solar)
    default_window_shgc: float = 0.6           # used when an opening has no shgc
    longwave_sky: bool = True                  # sol-air long-wave loss; needs dew point (RH) - see `assume_clear_sky`
    assume_clear_sky: bool = True              # when cloud cover is missing: clear sky (documented approximation)
    solar_time_standard: str = "auto"          # auto: NASA_POWER archives are local SOLAR time; others are clock time
    # ---- openings, doors, stairs (EMPIRICAL - PRD 10.8) --------------------------------------------------
    door_height_m: float = 2.0
    default_door_cd: float = 0.6
    stair_cd: float = 0.6
    stair_height_m: float | None = None        # None: the zone ceiling height
    stair_open_fraction: float = 1.0
    # ---- ground ------------------------------------------------------------------------------------------------
    ground_temperature_fallback: str = "window_mean_outdoor"   # when the job has no ground temperature

    def as_dict(self) -> dict:
        return asdict(self)
