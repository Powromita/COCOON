"""
ml/feature_builder.py

Converts physics calculator results and
shelter configuration data into the exact
feature format required by the trained
Random Forest model.
"""


import os
import sys

import pandas as pd


# ==================================================
# PROJECT ROOT
# ==================================================

PROJECT_ROOT = os.path.dirname(

    os.path.dirname(

        os.path.abspath(

            __file__

        )

    )

)


if PROJECT_ROOT not in sys.path:

    sys.path.insert(

        0,

        PROJECT_ROOT

    )


# ==================================================
# GEOMETRY FEATURES
# ==================================================

def calculate_geometry_features(

    config

):


    geometry = config[

        "geometry"

    ]


    length = geometry[

        "length_m"

    ]


    width = geometry[

        "width_m"

    ]


    height = geometry[

        "height_m"

    ]


    floor_area = (

        length

        *

        width

    )


    roof_area = (

        floor_area

    )


    wall_area = (

        2

        *

        (

            length

            +

            width

        )

        *

        height

    )


    volume = (

        length

        *

        width

        *

        height

    )


    return {

        "length_m":

            length,


        "width_m":

            width,


        "height_m":

            height,


        "wall_area_m2":

            wall_area,


        "roof_area_m2":

            roof_area,


        "floor_area_m2":

            floor_area,


        "volume_m3":

            volume

    }


# ==================================================
# BUILD ML FEATURES
# ==================================================

def build_ml_features(

    results_df,

    weather_df,

    config,

    properties

):


    results_df = (

        results_df.copy()

    )


    weather_df = (

        weather_df.copy()

    )


    # ==============================================
    # ENSURE TIMESTAMP FORMAT
    # ==============================================

    results_df[

        "timestamp"

    ] = pd.to_datetime(

        results_df[

            "timestamp"

        ]

    )


    weather_df[

        "timestamp"

    ] = pd.to_datetime(

        weather_df[

            "timestamp"

        ]

    )


    # ==============================================
    # MERGE REAL WEATHER WITH PHYSICS RESULTS
    # ==============================================

    merged = pd.merge(

        results_df,

        weather_df,

        on="timestamp",

        how="left",

        suffixes=(

            "",

            "_weather"

        )

    )


    # ==============================================
    # GEOMETRY
    # ==============================================

    geometry_features = (

        calculate_geometry_features(

            config

        )

    )


    # ==============================================
    # THERMAL PROPERTIES
    # ==============================================

    wall_u = (

        properties[

            "wall"

        ][

            "U_W_m2K"

        ]

    )


    roof_u = (

        properties[

            "roof"

        ][

            "U_W_m2K"

        ]

    )


    floor_u = (

        properties[

            "floor"

        ][

            "U_W_m2K"

        ]

    )


    capacitance = (

        properties[

            "capacitance"

        ]

    )


    # ==============================================
    # PREVIOUS TEMPERATURE
    # ==============================================

    previous_temperatures = [


        config[

            "initial_temperature_C"

        ]


    ]


    physics_temperatures = (

        merged[

            "indoor_temperature_C"

        ]

        .tolist()

    )


    previous_temperatures.extend(

        physics_temperatures[

            :-1

        ]

    )


    # ==============================================
    # BUILD FEATURES
    # ==============================================

    feature_rows = []


    for index, row in (

        merged.iterrows()

    ):


        timestamp = (

            row[

                "timestamp"

            ]

        )


        feature_row = {


            # ======================================
            # TIME
            # ======================================

            "hour":

                timestamp.hour,


            "month":

                timestamp.month,


            # ======================================
            # REAL WEATHER
            # ======================================

            "outdoor_temperature_C":

                row[

                    "outdoor_temperature_C"

                ],


            "solar_radiation_W_m2":

                row.get(

                    "solar_radiation_W_m2",

                    0.0

                ),


            "wind_speed_m_s":

                row.get(

                    "wind_speed_m_s",

                    0.0

                ),


            "humidity_percent":

                row.get(

                    "humidity_percent",

                    0.0

                ),


            # ======================================
            # GEOMETRY
            # ======================================

            **geometry_features,


            # ======================================
            # U VALUES
            # ======================================

            "wall_U_W_m2K":

                wall_u,


            "roof_U_W_m2K":

                roof_u,


            "floor_U_W_m2K":

                floor_u,


            # ======================================
            # CAPACITANCE
            # ======================================

            "wall_capacitance_J_K":

                capacitance[

                    "walls_J_K"

                ],


            "roof_capacitance_J_K":

                capacitance[

                    "roof_J_K"

                ],


            "floor_capacitance_J_K":

                capacitance[

                    "floor_J_K"

                ],


            "contents_capacitance_J_K":

                capacitance[

                    "contents_J_K"

                ],


            "total_capacitance_J_K":

                capacitance[

                    "total_J_K"

                ],


            # ======================================
            # WINDOW
            # ======================================

            "window_area_m2":

                config[

                    "windows"

                ][

                    "area_m2"

                ],


            "window_U_W_m2K":

                config[

                    "windows"

                ][

                    "U_W_m2K"

                ],


            "window_SHGC":

                config[

                    "windows"

                ][

                    "SHGC"

                ],


            # ======================================
            # SOLAR
            # ======================================

            "solar_area_m2":

                config[

                    "solar"

                ][

                    "area_m2"

                ],


            "solar_efficiency":

                config[

                    "solar"

                ][

                    "eta_solar"

                ],


            # ======================================
            # OTHER
            # ======================================

            "ground_temperature_C":

                config[

                    "ground_temperature_C"

                ],


            "internal_heat_gain_W":

                config[

                    "internal_heat_gain_W"

                ],


            # ======================================
            # PREVIOUS THERMAL STATE
            # ======================================

            "previous_indoor_temperature_C":

                previous_temperatures[

                    index

                ]

        }


        feature_rows.append(

            feature_row

        )


    features_df = (

        pd.DataFrame(

            feature_rows

        )

    )


    return features_df