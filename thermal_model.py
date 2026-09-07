"""
thermal_model.py

Transient RC thermal model.
"""


from heat_transfer import (

    total_resistance,

    calculate_u_value,

    calculate_heat_transfer,

    calculate_solar_gain,

    calculate_layer_capacitance,

    calculate_contents_capacitance

)


TIME_STEP_SECONDS = 3600


# ==================================================
# GEOMETRY
# ==================================================

def calculate_geometry(

    geometry,

    window_area_m2=0.0

):

    L = geometry["length_m"]

    W = geometry["width_m"]

    H = geometry["height_m"]


    gross_wall_area = (

        2

        * (

            L * H

            +

            W * H

        )

    )


    opaque_wall_area = (

        gross_wall_area

        - window_area_m2

    )


    if opaque_wall_area < 0:

        raise ValueError(

            "Window area cannot exceed wall area."

        )


    roof_area = (

        L

        * W

    )


    floor_area = (

        L

        * W

    )


    return {

        "gross_wall_area_m2":

            gross_wall_area,


        "wall_area_m2":

            opaque_wall_area,


        "window_area_m2":

            window_area_m2,


        "roof_area_m2":

            roof_area,


        "floor_area_m2":

            floor_area

    }


# ==================================================
# PREPARE MATERIAL LAYERS
# ==================================================

def prepare_layers(

    layer_configuration,

    materials

):

    prepared_layers = []


    for layer in layer_configuration:


        material_name = (

            layer["material"]

            .lower()

        )


        thickness_m = (

            layer["thickness_mm"]

            / 1000

        )


        if material_name not in materials:

            raise ValueError(

                f"Material '{material_name}' not found."

            )


        material = (

            materials[

                material_name

            ]

        )


        prepared_layers.append({

            "material":

                material_name,


            "thickness_m":

                thickness_m,


            "thermal_conductivity":

                material[

                    "thermal_conductivity"

                ],


            "density":

                material[

                    "density"

                ],


            "specific_heat":

                material[

                    "specific_heat"

                ]

        })


    return prepared_layers


# ==================================================
# CONSTRUCTION PROPERTIES
# ==================================================

def calculate_construction_properties(

    layers,

    area,

    h_inside,

    h_outside

):

    resistance = (

        total_resistance(

            layers,

            h_inside,

            h_outside

        )

    )


    U = (

        calculate_u_value(

            resistance

        )

    )


    capacitance = 0.0


    for layer in layers:


        layer_C = (

            calculate_layer_capacitance(

                area,

                layer["thickness_m"],

                layer["density"],

                layer["specific_heat"]

            )

        )


        capacitance += layer_C


    return {

        "resistance_m2K_W":

            resistance,


        "U_W_m2K":

            U,


        "capacitance_J_K":

            capacitance

    }


# ==================================================
# TOTAL THERMAL CAPACITANCE
# ==================================================

def calculate_total_capacitance(

    wall_properties,

    roof_properties,

    floor_properties,

    contents

):

    contents_C = (

        calculate_contents_capacitance(

            contents[

                "mass_kg"

            ],

            contents[

                "specific_heat_J_kgK"

            ]

        )

    )


    total_C = (

        wall_properties[

            "capacitance_J_K"

        ]

        +

        roof_properties[

            "capacitance_J_K"

        ]

        +

        floor_properties[

            "capacitance_J_K"

        ]

        +

        contents_C

    )


    return {

        "walls_J_K":

            wall_properties[

                "capacitance_J_K"

            ],


        "roof_J_K":

            roof_properties[

                "capacitance_J_K"

            ],


        "floor_J_K":

            floor_properties[

                "capacitance_J_K"

            ],


        "contents_J_K":

            contents_C,


        "total_J_K":

            total_C

    }


# ==================================================
# MAIN SIMULATION
# ==================================================

def run_simulation(

    weather,

    configuration,

    materials

):


    windows = (

        configuration.get(

            "windows",

            {

                "area_m2": 0.0,

                "U_W_m2K": 0.0,

                "SHGC": 0.0

            }

        )

    )


    window_area = (

        windows.get(

            "area_m2",

            0.0

        )

    )


    window_U = (

        windows.get(

            "U_W_m2K",

            0.0

        )

    )


    # ==============================================
    # GEOMETRY
    # ==============================================

    geometry = calculate_geometry(

        configuration[

            "geometry"

        ],

        window_area

    )


    # ==============================================
    # HEAT TRANSFER COEFFICIENTS
    # ==============================================

    h_inside = (

        configuration[

            "heat_transfer"

        ][

            "h_inside_W_m2K"

        ]

    )


    h_outside = (

        configuration[

            "heat_transfer"

        ][

            "h_outside_W_m2K"

        ]

    )


    # ==============================================
    # MATERIAL LAYERS
    # ==============================================

    wall_layers = prepare_layers(

        configuration[

            "walls"

        ],

        materials

    )


    roof_layers = prepare_layers(

        configuration[

            "roof"

        ],

        materials

    )


    floor_layers = prepare_layers(

        configuration[

            "floor"

        ],

        materials

    )


    # ==============================================
    # CONSTRUCTION PROPERTIES
    # ==============================================

    wall_properties = (

        calculate_construction_properties(

            wall_layers,

            geometry[

                "wall_area_m2"

            ],

            h_inside,

            h_outside

        )

    )


    roof_properties = (

        calculate_construction_properties(

            roof_layers,

            geometry[

                "roof_area_m2"

            ],

            h_inside,

            h_outside

        )

    )


    floor_properties = (

        calculate_construction_properties(

            floor_layers,

            geometry[

                "floor_area_m2"

            ],

            h_inside,

            h_outside

        )

    )


    # ==============================================
    # CAPACITANCE
    # ==============================================

    capacitance = (

        calculate_total_capacitance(

            wall_properties,

            roof_properties,

            floor_properties,

            configuration[

                "contents"

            ]

        )

    )


    C_total = (

        capacitance[

            "total_J_K"

        ]

    )


    if C_total <= 0:

        raise ValueError(

            "Total thermal capacitance must be greater than zero."

        )


    # ==============================================
    # INITIAL TEMPERATURE
    # ==============================================

    indoor_temperature = (

        configuration[

            "initial_temperature_C"

        ]

    )


    # ==============================================
    # SOLAR
    # ==============================================

    solar_area = (

        configuration[

            "solar"

        ][

            "area_m2"

        ]

    )


    eta_solar = (

        configuration[

            "solar"

        ][

            "eta_solar"

        ]

    )


    # ==============================================
    # INTERNAL HEAT
    # ==============================================

    internal_heat = (

        configuration[

            "internal_heat_gain_W"

        ]

    )


    # ==============================================
    # GROUND MODE
    # ==============================================

    ground_mode = (

        configuration.get(

            "ground_temperature_mode",

            "manual"

        )

    )


    default_ground_temperature = (

        configuration.get(

            "ground_temperature_C",

            0.0

        )

    )


    results = []


    # ==============================================
    # HOURLY LOOP
    # ==============================================

    for _, row in weather.iterrows():


        timestamp = (

            row[

                "timestamp"

            ]

        )


        outdoor_temperature = (

            row[

                "temperature_C"

            ]

        )


        solar_radiation = (

            row[

                "solar_radiation_W_m2"

            ]

        )


        # ------------------------------------------
        # GROUND TEMPERATURE
        # ------------------------------------------

        if (

            ground_mode == "nasa_earth_skin"

            and

            "earth_skin_temperature_C"

            in weather.columns

            and

            not row.get(

                "earth_skin_temperature_C"

            ) is None

        ):

            candidate_ground_temperature = (

                row[

                    "earth_skin_temperature_C"

                ]

            )


            if candidate_ground_temperature == candidate_ground_temperature:

                ground_temperature = (

                    candidate_ground_temperature

                )

            else:

                ground_temperature = (

                    default_ground_temperature

                )


        else:

            ground_temperature = (

                default_ground_temperature

            )


        # ------------------------------------------
        # SOLAR HEAT GAIN
        # ------------------------------------------

        Q_solar = (

            calculate_solar_gain(

                eta_solar,

                solar_area,

                solar_radiation

            )

        )


        # ------------------------------------------
        # WALL HEAT TRANSFER
        # ------------------------------------------

        Q_wall = (

            calculate_heat_transfer(

                wall_properties[

                    "U_W_m2K"

                ],

                geometry[

                    "wall_area_m2"

                ],

                indoor_temperature,

                outdoor_temperature

            )

        )


        # ------------------------------------------
        # WINDOW HEAT TRANSFER
        # ------------------------------------------

        Q_window = (

            window_U

            * window_area

            * (

                indoor_temperature

                -

                outdoor_temperature

            )

        )


        # ------------------------------------------
        # ROOF
        # ------------------------------------------

        Q_roof = (

            calculate_heat_transfer(

                roof_properties[

                    "U_W_m2K"

                ],

                geometry[

                    "roof_area_m2"

                ],

                indoor_temperature,

                outdoor_temperature

            )

        )


        # ------------------------------------------
        # FLOOR
        # ------------------------------------------

        Q_floor = (

            calculate_heat_transfer(

                floor_properties[

                    "U_W_m2K"

                ],

                geometry[

                    "floor_area_m2"

                ],

                indoor_temperature,

                ground_temperature

            )

        )


        # ------------------------------------------
        # TOTAL LOSS
        # ------------------------------------------

        Q_loss = (

            Q_wall

            +

            Q_window

            +

            Q_roof

            +

            Q_floor

        )


        # ------------------------------------------
        # NET HEAT
        # ------------------------------------------

        Q_net = (

            Q_solar

            +

            internal_heat

            -

            Q_loss

        )


        # ------------------------------------------
        # TEMPERATURE UPDATE
        # ------------------------------------------

        delta_temperature = (

            Q_net

            *

            TIME_STEP_SECONDS

            /

            C_total

        )


        new_indoor_temperature = (

            indoor_temperature

            +

            delta_temperature

        )


        # ------------------------------------------
        # SAVE RESULT
        # ------------------------------------------

        results.append({

            "timestamp":

                timestamp,


            "outdoor_temperature_C":

                outdoor_temperature,


            "earth_skin_temperature_C":

                ground_temperature,


            "solar_radiation_W_m2":

                solar_radiation,


            "wind_speed_m_s":

                row.get(

                    "wind_speed_m_s",

                    None

                ),


            "humidity_percent":

                row.get(

                    "humidity_percent",

                    None

                ),


            "Q_solar_W":

                Q_solar,


            "Q_wall_W":

                Q_wall,


            "Q_window_W":

                Q_window,


            "Q_roof_W":

                Q_roof,


            "Q_floor_W":

                Q_floor,


            "Q_total_loss_W":

                Q_loss,


            "Q_internal_W":

                internal_heat,


            "Q_net_W":

                Q_net,


            "indoor_temperature_C":

                new_indoor_temperature

        })


        indoor_temperature = (

            new_indoor_temperature

        )


    return (

        results,

        {

            "geometry":

                geometry,


            "wall":

                wall_properties,


            "roof":

                roof_properties,


            "floor":

                floor_properties,


            "window": {

                "area_m2":

                    window_area,


                "U_W_m2K":

                    window_U

            },


            "capacitance":

                capacitance

        }

    )