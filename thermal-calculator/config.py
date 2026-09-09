"""
Example programmatic configuration using
the Ladakh-specific material IDs.
"""


SHELTER_CONFIG = {


    "geometry": {

        "length_m": 4.0,

        "width_m": 3.0,

        "height_m": 2.5

    },


    "walls": [

        {

            "material": "puf",

            "thickness_mm": 50

        },

        {

            "material": "stone_masonry",

            "thickness_mm": 300

        }

    ],


    "roof": [

        {

            "material": "wood_timber",

            "thickness_mm": 100

        },

        {

            "material": "straw_clay",

            "thickness_mm": 250

        }

    ],


    "floor": [

        {

            "material": "stone_masonry",

            "thickness_mm": 300

        }

    ],


    "contents": {

        "mass_kg": 0.0,

        "specific_heat_J_kgK": 0.0

    },


    # Solar gain is resolved from "windows" below (area_m2 * SHGC) by
    # heat_transfer.resolve_solar_aperture, which BOTH the RC model and the
    # ANSYS boundary builder call. This "solar" block is a legacy fallback
    # only, kept in sync by hand; do not read it directly.
    "solar": {

        "area_m2": 2.5,

        "eta_solar": 0.70

    },


    # Direct-gain south glazing for the passive shelter: 2.5 m^2 (~25% of
    # the 10 m^2 south wall), double glazing (the "double" entry in
    # data/glazing_profiles.json -> U 2.8 W/m2K, SHGC 0.70).
    #   - area_m2 * SHGC drives Q_solar identically on the RC and ANSYS
    #     sides (heat_transfer.resolve_solar_aperture).
    #   - U_W_m2K > 0 makes the RC model replace 2.5 m2 of opaque wall
    #     with glazing (Q_window = U*A*dT) AND makes geometry_builder cut
    #     a real window opening + glazing block into the ANSYS south wall,
    #     tuned to the same air-to-air U. Set U to 0 to model a pure solar
    #     aperture with no conductive path / no cut-out.
    "windows": {

        "area_m2": 2.5,

        "U_W_m2K": 2.8,

        "SHGC": 0.70,

        "glazing_type": "double"

    },


    "initial_temperature_C": 10.0,


    "heat_transfer": {

        "h_inside_W_m2K": 2.5,

        "h_outside_W_m2K": 10.0

    },


    "ground_temperature_mode": "manual",


    "ground_temperature_C": 0.0,


    "internal_heat_gain_W": 0.0

}