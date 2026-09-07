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

            "material": "stone_masonry",

            "thickness_mm": 300

        },

        {

            "material": "puf",

            "thickness_mm": 50

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


    "solar": {

        "area_m2": 0.0,

        "eta_solar": 0.0

    },


    "windows": {

        "area_m2": 0.0,

        "U_W_m2K": 0.0,

        "SHGC": 0.0,

        "glazing_type": "none"

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