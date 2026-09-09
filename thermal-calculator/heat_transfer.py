"""
heat_transfer.py

All heat transfer equations.
"""

import math


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


def resolve_solar_aperture(
    configuration
):
    """Return ``(area_m2, shgc)`` for the solar-gain term from the single
    source of truth: ``configuration["windows"]``. The instantaneous gain
    is then ``shgc * area_m2 * irradiance`` (see ``calculate_solar_gain``).

    Both the fast RC model (``thermal_model.run_simulation``) and the
    ANSYS boundary builder (``ansys-pipeline/pyansys_runner.py``) call
    this, so the two pipelines cannot drift apart on how solar gain is
    computed or which inputs it uses -- glazing area times glazing SHGC,
    nothing else.

    The legacy ``configuration["solar"]`` block
    (``{area_m2, eta_solar}``) is honoured only as a fallback for configs
    that carry no ``windows`` block, so older callers keep working.
    """

    windows = configuration.get(
        "windows"
    ) or {}

    if "area_m2" in windows and "SHGC" in windows:

        return (
            float(windows.get("area_m2", 0.0)),
            float(windows.get("SHGC", 0.0))
        )

    legacy = configuration.get(
        "solar"
    ) or {}

    return (
        float(legacy.get("area_m2", 0.0)),
        float(legacy.get("eta_solar", 0.0))
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


def resistance_to_interior(
    layers,
    layer_index,
    h_inside
):
    """Series thermal resistance (m2K/W) from the indoor-air node to the
    mid-plane of layer ``layer_index``.

    ``layers`` follows the project convention: index 0 is the outermost
    layer and the last index is the layer touching the indoor air. The
    conductive path from the room to the middle of layer ``i`` is the
    inside surface film (``1 / h_inside``), plus the full resistance of
    every layer inboard of ``i``, plus half of layer ``i``'s own
    resistance (its stored heat is treated as lumped at its centre).
    """

    R = 1.0 / h_inside

    for inboard_layer in layers[layer_index + 1:]:

        R += layer_resistance(
            inboard_layer["thickness_m"],
            inboard_layer["thermal_conductivity"]
        )

    this_layer = layers[layer_index]

    R += 0.5 * layer_resistance(
        this_layer["thickness_m"],
        this_layer["thermal_conductivity"]
    )

    return R


def position_weight(
    resistance_to_interior_m2K_W,
    coupling_resistance_m2K_W
):
    """Fraction in ``(0, 1]`` of a construction layer's thermal mass that
    is dynamically available to the single lumped indoor-air node, given
    the conductive resistance between them:

        weight = exp(-R_to_interior / R_coupling)

    A layer whose path to the room is small compared with ``R_coupling``
    is almost fully available (weight -> 1); a layer buried behind thick
    insulation has ``R_to_interior >> R_coupling`` and is effectively
    decoupled from the interior over the simulation window (weight -> 0).

    ``coupling_resistance_m2K_W`` is a calibration constant, not a
    measured property -- see
    ``thermal_model.CAPACITANCE_COUPLING_RESISTANCE_M2K_W``.
    """

    if coupling_resistance_m2K_W <= 0:

        raise ValueError(
            "Coupling resistance must be greater than zero."
        )

    return math.exp(
        -resistance_to_interior_m2K_W
        / coupling_resistance_m2K_W
    )