# Datasets & Reference Profiles

This directory contains the primary physical, meteorological, and design-space datasets used by COCOON.

## Directory Layout
- `weather/`
  - `leh_weather_merged.xlsx`: 10-year hourly raw meteorological dataset from NASA POWER (2014–2024) for Leh, Ladakh (34.15°N, 77.58°E, altitude 3,500m).
  - `leh_weather_archive.csv`: Cleaned, parsed, and cached hourly meteorological archive containing dry-bulb temperature, global horizontal solar irradiance, wind speed, and relative humidity.
- `shelter/`
  - `shelter_ratios_recommended.csv`: Geometry constraint envelopes (aspect ratio, surface-to-volume ratio A/V, WWR %, ceiling height, and floor area limits).
  - `shelter_elements_dimensions__1_.csv`: Construction envelope specifications, standard layer thicknesses, and build options for cold-climate shelters.
  - `shelter_material_logistics.csv`: Logistics metadata including material density, estimated cost per unit, and transportability ratings for high-altitude deployment.

## Reference Cache
Thermal properties (thermal conductivity, density, specific heat capacity) and glazing profiles (U-value, SHGC) are maintained in `thermal-calculator/data/`.
