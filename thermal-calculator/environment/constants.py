"""
environment/constants.py

Every physical constant used by the Person-2 environment modules lives
here, in SI units, with its source. Modules import from this file; no
module hard-codes a constant of its own.

Legacy values that the current RC engine (thermal_model.py) uses are
mirrored here with a ``LEGACY_`` prefix so the "legacy" physics level can
reproduce them exactly. They are NOT used by enhanced physics.
"""

# ==================================================
# FUNDAMENTAL
# ==================================================

# Stefan-Boltzmann constant [W m^-2 K^-4]. CODATA 2018 (exact, derived
# from the SI-defined h, k_B and c).
STEFAN_BOLTZMANN_W_m2K4 = 5.670374419e-8

# Standard acceleration of gravity [m s^-2]. CGPM 1901 / ISO 80000-3.
GRAVITY_m_s2 = 9.80665

# Offset between Celsius and Kelvin [K].
KELVIN_OFFSET_K = 273.15


# ==================================================
# AIR AND WATER VAPOUR
# ==================================================

# Specific gas constant of dry air [J kg^-1 K^-1]. ASHRAE Handbook of
# Fundamentals (2021), ch. 1 "Psychrometrics", eq. (1)-(2) basis.
R_DRY_AIR_J_kgK = 287.05

# Specific gas constant of water vapour [J kg^-1 K^-1]. ASHRAE HoF 2021,
# ch. 1.
R_WATER_VAPOUR_J_kgK = 461.5

# Specific heat of dry air at constant pressure [J kg^-1 K^-1], ~0-20 C.
# ASHRAE HoF 2021, ch. 1 (1.006 kJ/kg K); the project uses 1005.
CP_DRY_AIR_J_kgK = 1005.0

# Latent heat of vaporisation of water at 0 C [J kg^-1]. ASHRAE HoF 2021,
# ch. 1 (2501 kJ/kg).
LATENT_HEAT_VAPORISATION_J_kg = 2.501e6

# ICAO / U.S. Standard Atmosphere 1976 sea-level reference values.
STANDARD_PRESSURE_Pa = 101325.0
STANDARD_TEMPERATURE_K = 288.15

# Barometric formula constants (troposphere, lapse rate 6.5 K/km):
#   p(z) = p0 * (1 - 2.25577e-5 * z) ** 5.25588
# ASHRAE HoF 2021, ch. 1, eq. (3).
BAROMETRIC_COEFF_per_m = 2.25577e-5
BAROMETRIC_EXPONENT = 5.25588


# ==================================================
# SOLAR
# ==================================================

# Total solar irradiance at 1 AU [W m^-2]. Kopp & Lean (2011), Geophys.
# Res. Lett. 38, L01706 (1360.8 +/- 0.5); IAU 2015 Resolution B3 nominal
# 1361 W/m^2.
SOLAR_CONSTANT_W_m2 = 1361.0


# ==================================================
# TIME
# ==================================================

SECONDS_PER_HOUR = 3600.0
DAYS_PER_YEAR = 365.0


# ==================================================
# LEGACY ENGINE VALUES (reproduced bit-for-bit in physics_level="legacy")
# ==================================================

# thermal_model.AIR_DENSITY_KG_M3 -- sea-level density, applied at Leh's
# 3,500 m too (known bias; fixed only in enhanced physics).
LEGACY_AIR_DENSITY_kg_m3 = 1.2

# thermal_model.AIR_SPECIFIC_HEAT_J_KGK
LEGACY_AIR_CP_J_kgK = 1005.0

# shelter_config.FIXED_ASSUMPTIONS["heat_transfer"]
LEGACY_H_INSIDE_W_m2K = 2.5
LEGACY_H_OUTSIDE_W_m2K = 10.0
