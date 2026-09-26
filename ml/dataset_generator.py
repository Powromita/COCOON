"""
ml/dataset_generator.py

Generates a physics-informed machine learning dataset
using the existing COCOON thermal calculator.

Pipeline:

NASA POWER Weather
        +
Shelter Configurations
        +
Existing RC Thermal Model
        ↓
Hourly Thermal Simulation
        ↓
ML Training Dataset
"""


import os
import sys
import random

import pandas as pd


# ==================================================
# ADD PROJECT ROOT TO PYTHON PATH
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
# IMPORT EXISTING THERMAL CALCULATOR MODULES
# ==================================================

from materials import load_materials

from weather import fetch_nasa_power_weather

from thermal_model import run_simulation


# ==================================================
# PROJECT PATHS
# ==================================================

MATERIAL_FILE = "data/material_properties.json"

DATASET_FILE = (
    "datasets/thermal_ml_dataset.csv"
)


# ==================================================
# LEH LOCATION
# ==================================================

LEH_LATITUDE = 34.1526
LEH_LONGITUDE = 77.5771


# ==================================================
# CREATE DIRECTORIES
# ==================================================

os.makedirs(
    "datasets",
    exist_ok=True
)


# ==================================================
# RANDOM CONFIGURATION RANGES
# ==================================================

GEOMETRY_RANGES = {

    "length_m": (3.0, 10.0),

    "width_m": (3.0, 8.0),

    "height_m": (2.0, 4.0)

}


# ==================================================
# CREATE RANDOM SHELTER CONFIGURATION
# ==================================================

def generate_random_config(
    materials
):

    material_ids = list(
        materials.keys()
    )


    # ==============================================
    # GEOMETRY
    # ==============================================

    length = round(

        random.uniform(

            *GEOMETRY_RANGES[
                "length_m"
            ]

        ),

        2

    )


    width = round(

        random.uniform(

            *GEOMETRY_RANGES[
                "width_m"
            ]

        ),

        2

    )


    height = round(

        random.uniform(

            *GEOMETRY_RANGES[
                "height_m"
            ]

        ),

        2

    )


    # ==============================================
    # RANDOM MATERIAL SELECTION
    # ==============================================

    wall_material = random.choice(
        material_ids
    )


    roof_material = random.choice(
        material_ids
    )


    floor_material = random.choice(
        material_ids
    )


    # ==============================================
    # INSULATION POSSIBILITY
    # ==============================================

    insulation_material = None


    if "puf" in materials:

        insulation_material = "puf"


    # ==============================================
    # WALL LAYERS
    # ==============================================

    walls = [

        {

            "material":

                wall_material,

            "thickness_mm":

                random.choice(

                    [

                        200,

                        250,

                        300,

                        400,

                        500

                    ]

                )

        }

    ]


    # Randomly add PUF insulation

    if (

        insulation_material

        and

        random.random() > 0.4

    ):

        walls.append(

            {

                "material":

                    insulation_material,

                "thickness_mm":

                    random.choice(

                        [

                            25,

                            50,

                            75,

                            100

                        ]

                    )

            }

        )


    # ==============================================
    # ROOF
    # ==============================================

    roof = [

        {

            "material":

                roof_material,

            "thickness_mm":

                random.choice(

                    [

                        100,

                        150,

                        200,

                        250,

                        300

                    ]

                )

        }

    ]


    if (

        insulation_material

        and

        random.random() > 0.4

    ):

        roof.append(

            {

                "material":

                    insulation_material,

                "thickness_mm":

                    random.choice(

                        [

                            25,

                            50,

                            75,

                            100

                        ]

                    )

            }

        )


    # ==============================================
    # FLOOR
    # ==============================================

    floor = [

        {

            "material":

                floor_material,

            "thickness_mm":

                random.choice(

                    [

                        150,

                        200,

                        250,

                        300,

                        400

                    ]

                )

        }

    ]


    # ==============================================
    # INTERNAL CONTENTS
    # ==============================================

    contents_mass = round(

        random.uniform(

            0,

            500

        ),

        2

    )


    contents_specific_heat = random.choice(

        [

            800,

            1000,

            1500,

            2000

        ]

    )


    # ==============================================
    # WINDOWS
    # ==============================================

    floor_area = (

        length

        *

        width

    )


    window_area = round(

        random.uniform(

            0,

            floor_area * 0.25

        ),

        2

    )


    # ==============================================
    # FINAL CONFIGURATION
    # ==============================================

    config = {

        "geometry": {

            "length_m":

                length,

            "width_m":

                width,

            "height_m":

                height

        },


        "walls":

            walls,


        "roof":

            roof,


        "floor":

            floor,


        "contents": {

            "mass_kg":

                contents_mass,

            "specific_heat_J_kgK":

                contents_specific_heat

        },


        "solar": {

            "area_m2":

                window_area,

            "eta_solar":

                random.choice(

                    [

                        0.3,

                        0.4,

                        0.5,

                        0.6,

                        0.7

                    ]

                )

        },


        "windows": {

            "area_m2":

                window_area,

            "U_W_m2K":

                random.choice(

                    [

                        2.0,

                        2.5,

                        3.0,

                        4.0,

                        5.0

                    ]

                ),

            "SHGC":

                random.choice(

                    [

                        0.3,

                        0.4,

                        0.5,

                        0.6,

                        0.7

                    ]

                ),

            "glazing_type":

                "generic"

        },


        "initial_temperature_C":

            random.choice(

                [

                    5,

                    10,

                    15,

                    20

                ]

            ),


        "heat_transfer": {

            "h_inside_W_m2K":

                2.5,

            "h_outside_W_m2K":

                10.0

        },


        "ground_temperature_mode":

            "manual",


        "ground_temperature_C":

            random.choice(

                [

                    -5,

                    0,

                    5,

                    10

                ]

            ),


        "internal_heat_gain_W":

            random.choice(

                [

                    0,

                    50,

                    100,

                    200,

                    500

                ]

            )

    }


    return config


# ==================================================
# CALCULATE GEOMETRY FEATURES
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


    roof_area = floor_area


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
# GENERATE DATASET
# ==================================================

def generate_dataset(


    num_configurations=50,

    start_date="20260101",

    end_date="20260107"

):


    print(

        "\n"

        +

        "=" * 60

    )


    print(

        "COCOON ML DATASET GENERATOR"

    )


    print(

        "=" * 60

    )


    # ==============================================
    # LOAD MATERIALS
    # ==============================================

    print(

        "\nLoading material database..."

    )


    materials = load_materials(

        MATERIAL_FILE

    )


    # ==============================================
    # LOAD REAL NASA WEATHER
    # ==============================================

    print(

        "Fetching NASA POWER weather..."

    )


    weather = fetch_nasa_power_weather(

        LEH_LATITUDE,

        LEH_LONGITUDE,

        start_date,

        end_date

    )


    print(

        f"Weather records loaded: "

        f"{len(weather)}"

    )


    dataset_rows = []


    # ==============================================
    # GENERATE CONFIGURATIONS
    # ==============================================

    for config_number in range(

        num_configurations

    ):


        print(

            f"\nRunning configuration "

            f"{config_number + 1}/"

            f"{num_configurations}"

        )


        config = generate_random_config(

            materials

        )


        # ==========================================
        # RUN EXISTING PHYSICS MODEL
        # ==========================================

        try:

            results, properties = run_simulation(

                weather,

                config,

                materials

            )


        except Exception as error:

            print(

                f"Configuration skipped: "

                f"{error}"

            )


            continue


        results_df = pd.DataFrame(

            results

        )


        # ==========================================
        # GEOMETRY FEATURES
        # ==========================================

        geometry_features = (

            calculate_geometry_features(

                config

            )

        )


        # ==========================================
        # PROPERTY FEATURES
        # ==========================================

        wall_u = (

            properties["wall"]

            [

                "U_W_m2K"

            ]

        )


        roof_u = (

            properties["roof"]

            [

                "U_W_m2K"

            ]

        )


        floor_u = (

            properties["floor"]

            [

                "U_W_m2K"

            ]

        )


        capacitance = properties[

            "capacitance"

        ]


        # ==========================================
        # CREATE ML ROWS
        # ==========================================

        previous_temperature = (

            config[

                "initial_temperature_C"

            ]

        )


        for _, row in (

            results_df.iterrows()

        ):


            ml_row = {


                # ==============================
                # TIME
                # ==============================

                "timestamp":

                    row[

                        "timestamp"

                    ],


                "hour":

                    pd.to_datetime(

                        row[

                            "timestamp"

                        ]

                    ).hour,


                "month":

                    pd.to_datetime(

                        row[

                            "timestamp"

                        ]

                    ).month,


                # ==============================
                # WEATHER
                # ==============================

                "outdoor_temperature_C":

                    row[

                        "outdoor_temperature_C"

                    ],


                "solar_radiation_W_m2":

                    row.get(

                        "solar_radiation_W_m2",

                        0

                    ),


                "wind_speed_m_s":

                    row.get(

                        "wind_speed_m_s",

                        0

                    ),


                "humidity_percent":

                    row.get(

                        "humidity_percent",

                        0

                    ),


                # ==============================
                # GEOMETRY
                # ==============================

                **geometry_features,


                # ==============================
                # THERMAL PROPERTIES
                # ==============================

                "wall_U_W_m2K":

                    wall_u,


                "roof_U_W_m2K":

                    roof_u,


                "floor_U_W_m2K":

                    floor_u,


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


                # ==============================
                # WINDOWS / SOLAR
                # ==============================

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


                # ==============================
                # OTHER
                # ==============================

                "ground_temperature_C":

                    config[

                        "ground_temperature_C"

                    ],


                "internal_heat_gain_W":

                    config[

                        "internal_heat_gain_W"

                    ],


                # ==============================
                # THERMAL STATE
                # ==============================

                "previous_indoor_temperature_C":

                    previous_temperature,


                # ==============================
                # TARGET
                # ==============================

                "target_indoor_temperature_C":

                    row[

                        "indoor_temperature_C"

                    ]

            }


            dataset_rows.append(

                ml_row

            )


            previous_temperature = (

                row[

                    "indoor_temperature_C"

                ]

            )


    # ==================================================
    # SAVE DATASET
    # ==================================================

    dataset = pd.DataFrame(

        dataset_rows

    )


    dataset = dataset.dropna()


    dataset.to_csv(

        DATASET_FILE,

        index=False

    )


    print(

        "\n"

        +

        "=" * 60

    )


    print(

        "DATASET GENERATION COMPLETE"

    )


    print(

        "=" * 60

    )


    print(

        f"\nTotal samples: "

        f"{len(dataset)}"

    )


    print(

        f"Total features: "

        f"{len(dataset.columns) - 1}"

    )


    print(

        f"\nDataset saved to: "

        f"{DATASET_FILE}"

    )


    return dataset


# ==================================================
# RUN DIRECTLY
# ==================================================

if __name__ == "__main__":


    generate_dataset(

        num_configurations=50,

        start_date="20260101",

        end_date="20260107"

    )