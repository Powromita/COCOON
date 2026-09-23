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

    calculate_contents_capacitance,

    resistance_to_interior,

    position_weight,

    resolve_solar_aperture

)


TIME_STEP_SECONDS = 3600


# ==================================================
# AIR INFILTRATION / VENTILATION
# ==================================================
# Uncontrolled air exchange through cracks, the door and vents is, in a
# real shelter, one of the largest heat-loss paths -- often comparable to
# the whole opaque envelope. The single-zone model adds it as a simple
# air-change term:
#
#     Q_infiltration = rho_air * cp_air * (ACH * V / 3600) * (T_in - T_out)
#
# ACH ("air changes per hour") is taken from
# configuration["air_changes_per_hour"]; DEFAULT_AIR_CHANGES_PER_HOUR is a
# moderately-sealed small shelter. A rough tent/hut is ~1.5-3; a
# well-detailed panel shelter ~0.3-0.5. Set it to 0 to reproduce the old
# no-infiltration behaviour (and for like-for-like comparison with the
# ANSYS model, which does not yet resolve infiltration).
AIR_DENSITY_KG_M3 = 1.2
AIR_SPECIFIC_HEAT_J_KGK = 1005.0
DEFAULT_AIR_CHANGES_PER_HOUR = 0.7


# ==================================================
# POSITION-WEIGHTED THERMAL CAPACITANCE
# ==================================================
# The model collapses the whole shelter onto ONE indoor-air node. A
# construction layer's stored heat is only available to that fast node if
# the conductive path between them is not much larger than the interior
# surface film resistance that bounds the node (1/h_inside is ~0.4 m2K/W
# for the Ladakh config). Layers sitting behind thick insulation have a
# path resistance several times larger and barely exchange heat with the
# room across a multi-day cold spell, so lumping their full mass onto the
# indoor node makes the shelter look far more thermally stable than it is
# -- see ansys-pipeline/VALIDATION_FINDINGS.md, where the position-blind
# sum over-credited the interior by ~4x (MAE 3.75 C vs the ANSYS 3D
# reference for the insulation-inside wall).
#
# Each layer's capacitance is scaled by
#     weight = exp(-R_layer_to_interior / CAPACITANCE_COUPLING_RESISTANCE)
# before it is added to the indoor node (see heat_transfer.position_weight
# and resistance_to_interior). The constant is a single calibration knob,
# tuned so the lumped-node model reproduces the effective thermal mass
# ANSYS resolves for BOTH wall orderings at once (mass-inside and
# insulation-inside); re-tune it as the validation set grows.
#
# Calibration (ansys-pipeline/validate_weighted_capacitance.py, 48 h Jan
# cold spell): Rc = 0.8 m2K/W gives MAE 0.31 C for the mass-inside wall
# and 0.53 C for the insulation-inside wall, both against the ANSYS 3D
# reference and both inside the +/-0.8 C target. The unweighted sum scored
# 0.66 C and 3.75 C on the same two cases.
CAPACITANCE_COUPLING_RESISTANCE_M2K_W = 0.8


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

    h_outside,

    coupling_resistance_m2K_W=None

):

    if coupling_resistance_m2K_W is None:

        coupling_resistance_m2K_W = (

            CAPACITANCE_COUPLING_RESISTANCE_M2K_W

        )


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


    lumped_capacitance = 0.0

    weighted_capacitance = 0.0


    for index, layer in enumerate(layers):


        layer_C = (

            calculate_layer_capacitance(

                area,

                layer["thickness_m"],

                layer["density"],

                layer["specific_heat"]

            )

        )


        R_to_interior = (

            resistance_to_interior(

                layers,

                index,

                h_inside

            )

        )


        weight = (

            position_weight(

                R_to_interior,

                coupling_resistance_m2K_W

            )

        )


        lumped_capacitance += layer_C

        weighted_capacitance += weight * layer_C


    return {

        "resistance_m2K_W":

            resistance,


        "U_W_m2K":

            U,


        "capacitance_J_K":

            weighted_capacitance,


        "lumped_capacitance_J_K":

            lumped_capacitance

    }


# ==================================================
# TOTAL THERMAL CAPACITANCE
# ==================================================

def lumped_mass_C_total(

    wall_properties,

    roof_properties,

    floor_properties,

    contents

):

    """Position-blind capacitance: the raw sum of every envelope layer's

    rho * cp * V plus the contents mass, with no coupling weight applied.

    This is the original pre-validation formula, kept available so

    weighted and unweighted runs can be compared directly (see

    ansys-pipeline/validate_weighted_capacitance.py)."""


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


    return (

        wall_properties[

            "lumped_capacitance_J_K"

        ]

        +

        roof_properties[

            "lumped_capacitance_J_K"

        ]

        +

        floor_properties[

            "lumped_capacitance_J_K"

        ]

        +

        contents_C

    )


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

            total_C,


        "lumped_mass_total_J_K":

            lumped_mass_C_total(

                wall_properties,

                roof_properties,

                floor_properties,

                contents

            )

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


    window_U = (

        windows.get(

            "U_W_m2K",

            0.0

        )

    )


    # Conductive glazing area. A glazing entry with U == 0 is a pure solar
    # aperture (its gain still flows via resolve_solar_aperture) and does
    # NOT displace opaque envelope, so the RC model's conduction stays
    # identical to the windowless ANSYS reference. Only a glazing with a
    # real U-value replaces wall here.

    window_area = (

        windows.get(

            "area_m2",

            0.0

        )

        if window_U > 0

        else 0.0

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
    # Aperture area x glazing SHGC, resolved from configuration["windows"]
    # via the shared helper so the ANSYS boundary builder computes Q_solar
    # from exactly the same inputs and formula (see heat_transfer).

    solar_area, eta_solar = (

        resolve_solar_aperture(

            configuration

        )

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


    # ==============================================
    # AIR INFILTRATION
    # ==============================================

    air_changes_per_hour = (

        configuration.get(

            "air_changes_per_hour",

            DEFAULT_AIR_CHANGES_PER_HOUR

        )

    )


    internal_volume_m3 = (

        configuration["geometry"]["length_m"]

        * configuration["geometry"]["width_m"]

        * configuration["geometry"]["height_m"]

    )


    # conductance of the infiltration path, W/K
    infiltration_UA_W_K = (

        AIR_DENSITY_KG_M3

        * AIR_SPECIFIC_HEAT_J_KGK

        * (

            air_changes_per_hour

            * internal_volume_m3

            / 3600.0

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
        # AIR INFILTRATION
        # ------------------------------------------

        Q_infiltration = (

            infiltration_UA_W_K

            * (

                indoor_temperature

                -

                outdoor_temperature

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

            +

            Q_infiltration

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


            "Q_infiltration_W":

                Q_infiltration,


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


            "infiltration": {

                "air_changes_per_hour":

                    air_changes_per_hour,


                "UA_W_K":

                    infiltration_UA_W_K

            },


            "capacitance":

                capacitance

        }

    )