"""
heat_transfer.py

All heat transfer equations.
"""


def layer_resistance(
    thickness_m,
    thermal_conductivity
):

    if thickness_m <= 0:

        raise ValueError(
            "Thickness must be greater than zero."
        )

    if thermal_conductivity <= 0:

        raise ValueError(
            "Thermal conductivity must be greater than zero."
        )

    return (

        thickness_m
        /
        thermal_conductivity

    )


def total_resistance(
    layers,
    h_inside,
    h_outside
):

    R_inside = 1 / h_inside

    R_outside = 1 / h_outside


    R_materials = 0.0


    for layer in layers:

        R_materials += layer_resistance(

            layer["thickness_m"],

            layer["thermal_conductivity"]

        )


    R_total = (

        R_inside

        + R_materials

        + R_outside

    )


    return R_total


def calculate_u_value(
    resistance
):

    if resistance <= 0:

        raise ValueError(
            "Resistance must be greater than zero."
        )

    return 1 / resistance


def calculate_heat_transfer(
    U,
    area,
    indoor_temperature,
    boundary_temperature
):

    return (

        U

        * area

        * (

            indoor_temperature

            - boundary_temperature

        )

    )


def calculate_solar_gain(
    eta_solar,
    solar_area,
    solar_radiation
):

    if solar_radiation < 0:

        solar_radiation = 0


    return (

        eta_solar

        * solar_area

        * solar_radiation

    )


def calculate_layer_capacitance(
    area,
    thickness_m,
    density,
    specific_heat
):

    volume = (

        area

        * thickness_m

    )


    mass = (

        density

        * volume

    )


    capacitance = (

        mass

        * specific_heat

    )


    return capacitance


def calculate_contents_capacitance(
    mass,
    specific_heat
):

    return (

        mass

        * specific_heat

    )