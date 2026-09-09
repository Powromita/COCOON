"""
Collect user-friendly shelter inputs and
resolve them into model configuration.
"""

import copy
import json

from datetime import datetime


# ==================================================
# JSON LOADING
# ==================================================

def load_json(

    filepath

):

    with open(

        filepath,

        "r",

        encoding="utf-8"

    ) as file:

        return json.load(

            file

        )


# ==================================================
# INPUT HELPERS
# ==================================================

def get_float(

    prompt,

    minimum=None,

    maximum=None

):

    while True:

        try:

            value = float(

                input(

                    prompt

                )

            )


            if (

                minimum is not None

                and

                value < minimum

            ):

                print(

                    f"Value must be at least {minimum}."

                )

                continue


            if (

                maximum is not None

                and

                value > maximum

            ):

                print(

                    f"Value must be at most {maximum}."

                )

                continue


            return value


        except ValueError:

            print(

                "Please enter a valid number."

            )



def get_positive_float(

    prompt

):

    while True:

        value = get_float(

            prompt

        )


        if value > 0:

            return value


        print(

            "Value must be greater than zero."

        )



def get_nonnegative_float(

    prompt

):

    return get_float(

        prompt,

        minimum=0

    )



def get_positive_int(

    prompt

):

    while True:

        try:

            value = int(

                input(

                    prompt

                )

            )


            if value > 0:

                return value


            print(

                "Value must be greater than zero."

            )


        except ValueError:

            print(

                "Please enter a valid integer."

            )



def get_yes_no(

    prompt

):

    while True:

        answer = (

            input(

                prompt

            )

            .strip()

            .lower()

        )


        if answer in {

            "yes",

            "y"

        }:

            return True


        if answer in {

            "no",

            "n"

        }:

            return False


        print(

            "Please enter yes or no."

        )


# ==================================================
# OPTION SELECTION
# ==================================================

def choose_option(

    options,

    title,

    show_metadata=False

):

    keys = list(

        options.keys()

    )


    print()

    print(

        "=" * 60

    )

    print(

        title

    )

    print(

        "=" * 60

    )


    for index, key in enumerate(

        keys,

        start=1

    ):

        item = options[

            key

        ]


        display_name = (

            item.get(

                "display_name",

                key

            )

            if isinstance(

                item,

                dict

            )

            else key

        )


        print(

            f"{index}. {display_name}"

        )


        if (

            show_metadata

            and

            isinstance(

                item,

                dict

            )

        ):

            if item.get(

                "data_status"

            ):

                print(

                    f"   Data status: "

                    f"{item['data_status']}"

                )


            if item.get(

                "data_source"

            ):

                print(

                    f"   Source: "

                    f"{item['data_source']}"

                )


    while True:

        try:

            choice = int(

                input(

                    "\nSelect option number: "

                )

            )


            if (

                1

                <=

                choice

                <=

                len(

                    keys

                )

            ):

                selected_key = (

                    keys[

                        choice - 1

                    ]

                )


                return (

                    selected_key,

                    options[

                        selected_key

                    ]

                )


            print(

                "Invalid selection."

            )


        except ValueError:

            print(

                "Please enter a valid number."

            )


# ==================================================
# GEOMETRY
# ==================================================

def collect_geometry():

    print()

    print(

        "=" * 60

    )

    print(

        "SHELTER GEOMETRY"

    )

    print(

        "=" * 60

    )


    return {

        "length_m":

            get_positive_float(

                "Length (m): "

            ),


        "width_m":

            get_positive_float(

                "Width (m): "

            ),


        "height_m":

            get_positive_float(

                "Height (m): "

            )

    }


# ==================================================
# LOCATION
# ==================================================

def collect_location():

    print()

    print(

        "=" * 60

    )

    print(

        "LOCATION"

    )

    print(

        "=" * 60

    )


    print(

        "\nDefault location: Leh, Ladakh"

    )

    print(

        "Latitude: 34.1526"

    )

    print(

        "Longitude: 77.5771"

    )


    if get_yes_no(

        "\nUse Leh coordinates? (yes/no): "

    ):

        return {

            "name":

                "Leh, Ladakh",


            "latitude":

                34.1526,


            "longitude":

                77.5771

        }


    latitude = get_float(

        "Latitude (-90 to 90): ",

        minimum=-90,

        maximum=90

    )


    longitude = get_float(

        "Longitude (-180 to 180): ",

        minimum=-180,

        maximum=180

    )


    return {

        "name":

            "Custom Location",


        "latitude":

            latitude,


        "longitude":

            longitude

    }


# ==================================================
# WEATHER PERIOD
# ==================================================

def collect_weather_period():

    print()

    print(

        "=" * 60

    )

    print(

        "NASA POWER WEATHER PERIOD"

    )

    print(

        "=" * 60

    )


    print(

        "Format: YYYYMMDD"

    )


    while True:

        start_date = input(

            "Start date: "

        ).strip()


        end_date = input(

            "End date: "

        ).strip()


        try:

            start_dt = datetime.strptime(

                start_date,

                "%Y%m%d"

            )


            end_dt = datetime.strptime(

                end_date,

                "%Y%m%d"

            )


        except ValueError:

            print(

                "Dates must be valid and in YYYYMMDD format."

            )

            continue


        if end_dt < start_dt:

            print(

                "End date cannot be before start date."

            )

            continue


        return (

            start_date,

            end_date

        )


# ==================================================
# WINDOWS
# ==================================================

def collect_windows(

    geometry,

    glazing_profiles

):

    print()

    print(

        "=" * 60

    )

    print(

        "WINDOW / SOLAR OPENINGS"

    )

    print(

        "=" * 60

    )


    window_count = int(

        get_nonnegative_float(

            "Number of windows: "

        )

    )


    if window_count == 0:

        return {

            "count":

                0,


            "area_m2":

                0.0,


            "U_W_m2K":

                0.0,


            "SHGC":

                0.0,


            "glazing_type":

                "none",


            "glazing_display_name":

                "No glazing"

        }


    window_width = get_positive_float(

        "Window width (m): "

    )


    window_height = get_positive_float(

        "Window height (m): "

    )


    window_area = (

        window_count

        *

        window_width

        *

        window_height

    )


    gross_wall_area = (

        2

        *

        (

            geometry[

                "length_m"

            ]

            *

            geometry[

                "height_m"

            ]

            +

            geometry[

                "width_m"

            ]

            *

            geometry[

                "height_m"

            ]

        )

    )


    if window_area >= gross_wall_area:

        raise ValueError(

            "Total window area cannot be greater than "

            "or equal to total wall area."

        )


    glazing_key, glazing = choose_option(

        glazing_profiles,

        "SELECT GLAZING TYPE"

    )


    return {

        "count":

            window_count,


        "area_m2":

            window_area,


        "U_W_m2K":

            glazing[

                "U_W_m2K"

            ],


        "SHGC":

            glazing[

                "SHGC"

            ],


        "glazing_type":

            glazing_key,


        "glazing_display_name":

            glazing[

                "display_name"

            ]

    }


# ==================================================
# PROFILE METADATA
# ==================================================

def profile_metadata(

    profile_id,

    profile

):

    return {

        "id":

            profile_id,


        "name":

            profile.get(

                "display_name",

                profile_id

            ),


        "source_status":

            profile.get(

                "source_status",

                "Not specified"

            )

    }


# ==================================================
# BASIC MODE
# ==================================================

def collect_basic_mode(

    construction_profiles,

    glazing_profiles

):

    print()

    print(

        "#" * 60

    )

    print(

        "BASIC USER MODE"

    )

    print(

        "#" * 60

    )


    print(

        "\nBasic Mode uses explicit construction profiles "

        "and database material properties."

    )


    print(

        "It does not ask the user for thermal conductivity, "

        "density, specific heat, R-value or thermal capacitance."

    )


    geometry = collect_geometry()


    wall_key, wall_profile = choose_option(

        construction_profiles[

            "wall"

        ],

        "SELECT WALL CONSTRUCTION"

    )


    roof_key, roof_profile = choose_option(

        construction_profiles[

            "roof"

        ],

        "SELECT ROOF CONSTRUCTION"

    )


    floor_key, floor_profile = choose_option(

        construction_profiles[

            "floor"

        ],

        "SELECT FLOOR CONSTRUCTION"

    )


    windows = collect_windows(

        geometry,

        glazing_profiles

    )


    initial_temperature = get_float(

        "\nInitial indoor temperature (°C): "

    )


    internal_heat = get_nonnegative_float(

        "Known internal heat gain (W), "

        "enter 0 if not included: "

    )


    return {

        "mode":

            "basic",


        "geometry":

            geometry,


        "walls":

            copy.deepcopy(

                wall_profile[

                    "layers"

                ]

            ),


        "roof":

            copy.deepcopy(

                roof_profile[

                    "layers"

                ]

            ),


        "floor":

            copy.deepcopy(

                floor_profile[

                    "layers"

                ]

            ),


        "contents": {

            "mass_kg":

                0.0,


            "specific_heat_J_kgK":

                0.0

        },


        "solar": {

            "area_m2":

                windows[

                    "area_m2"

                ],


            "eta_solar":

                windows[

                    "SHGC"

                ]

        },


        "windows":

            windows,


        "initial_temperature_C":

            initial_temperature,


        "heat_transfer": {

            "h_inside_W_m2K":

                2.5,


            "h_outside_W_m2K":

                10.0

        },


        "ground_temperature_mode":

            "nasa_earth_skin",


        "ground_temperature_C":

            0.0,


        "internal_heat_gain_W":

            internal_heat,


        "selected_profiles": {

            "wall":

                profile_metadata(

                    wall_key,

                    wall_profile

                ),


            "roof":

                profile_metadata(

                    roof_key,

                    roof_profile

                ),


            "floor":

                profile_metadata(

                    floor_key,

                    floor_profile

                )

        },


        "model_defaults": {

            "h_inside_W_m2K":

                2.5,


            "h_outside_W_m2K":

                10.0,


            "ground_temperature_mode":

                "NASA earth skin temperature when available",


            "contents_included":

                False

        }

    }


# ==================================================
# CUSTOM LAYERS
# ==================================================

def collect_custom_layers(

    section_name,

    materials

):

    print()

    print(

        "=" * 60

    )

    print(

        section_name.upper()

    )

    print(

        "=" * 60

    )


    layer_count = get_positive_int(

        f"How many layers in the {section_name}? "

    )


    material_ids = list(

        materials.keys()

    )


    layers = []


    for layer_number in range(

        1,

        layer_count + 1

    ):

        print()

        print(

            f"{section_name} Layer {layer_number}"

        )


        for index, material_id in enumerate(

            material_ids,

            start=1

        ):

            material = materials[

                material_id

            ]


            print(

                f"{index}. "

                f"{material['display_name']}"

            )


            print(

                f"   Data status: "

                f"{material['data_status']}"

            )


        while True:

            try:

                choice = int(

                    input(

                        "Select material number: "

                    )

                )


                if (

                    1

                    <=

                    choice

                    <=

                    len(

                        material_ids

                    )

                ):

                    break


                print(

                    "Invalid selection."

                )


            except ValueError:

                print(

                    "Enter a valid number."

                )


        material_id = material_ids[

            choice - 1

        ]


        thickness = get_positive_float(

            "Thickness (mm): "

        )


        layers.append({

            "material":

                material_id,


            "thickness_mm":

                thickness

        })


    return layers


# ==================================================
# DETAILED MODE
# ==================================================

def collect_detailed_mode(

    materials,

    glazing_profiles

):

    print()

    print(

        "#" * 60

    )

    print(

        "DETAILED USER MODE"

    )

    print(

        "#" * 60

    )


    geometry = collect_geometry()


    walls = collect_custom_layers(

        "Wall",

        materials

    )


    roof = collect_custom_layers(

        "Roof",

        materials

    )


    floor = collect_custom_layers(

        "Floor",

        materials

    )


    windows = collect_windows(

        geometry,

        glazing_profiles

    )


    initial_temperature = get_float(

        "\nInitial indoor temperature (°C): "

    )


    internal_heat = get_nonnegative_float(

        "Known internal heat gain (W), "

        "enter 0 if not included: "

    )


    return {

        "mode":

            "detailed",


        "geometry":

            geometry,


        "walls":

            walls,


        "roof":

            roof,


        "floor":

            floor,


        "contents": {

            "mass_kg":

                0.0,


            "specific_heat_J_kgK":

                0.0

        },


        "solar": {

            "area_m2":

                windows[

                    "area_m2"

                ],


            "eta_solar":

                windows[

                    "SHGC"

                ]

        },


        "windows":

            windows,


        "initial_temperature_C":

            initial_temperature,


        "heat_transfer": {

            "h_inside_W_m2K":

                2.5,


            "h_outside_W_m2K":

                10.0

        },


        "ground_temperature_mode":

            "nasa_earth_skin",


        "ground_temperature_C":

            0.0,


        "internal_heat_gain_W":

            internal_heat,


        "model_defaults": {

            "h_inside_W_m2K":

                2.5,


            "h_outside_W_m2K":

                10.0,


            "ground_temperature_mode":

                "NASA earth skin temperature when available",


            "contents_included":

                False

        }

    }


# ==================================================
# ADVANCED MODE
# ==================================================

def collect_advanced_mode(

    materials,

    glazing_profiles

):

    print()

    print(

        "#" * 60

    )

    print(

        "ADVANCED ENGINEERING MODE"

    )

    print(

        "#" * 60

    )


    geometry = collect_geometry()


    walls = collect_custom_layers(

        "Wall",

        materials

    )


    roof = collect_custom_layers(

        "Roof",

        materials

    )


    floor = collect_custom_layers(

        "Floor",

        materials

    )


    windows = collect_windows(

        geometry,

        glazing_profiles

    )


    print()

    print(

        "=" * 60

    )

    print(

        "INTERNAL CONTENTS"

    )

    print(

        "=" * 60

    )


    contents_mass = get_nonnegative_float(

        "Internal contents mass (kg): "

    )


    contents_cp = get_nonnegative_float(

        "Contents specific heat (J/kg·K): "

    )


    initial_temperature = get_float(

        "\nInitial indoor temperature (°C): "

    )


    ground_temperature = get_float(

        "Ground temperature (°C): "

    )


    internal_heat = get_nonnegative_float(

        "Internal heat gain (W): "

    )


    h_inside = get_positive_float(

        "Inside heat transfer coefficient (W/m²K): "

    )


    h_outside = get_positive_float(

        "Outside heat transfer coefficient (W/m²K): "

    )


    return {

        "mode":

            "advanced",


        "geometry":

            geometry,


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

                contents_cp

        },


        "solar": {

            "area_m2":

                windows[

                    "area_m2"

                ],


            "eta_solar":

                windows[

                    "SHGC"

                ]

        },


        "windows":

            windows,


        "initial_temperature_C":

            initial_temperature,


        "heat_transfer": {

            "h_inside_W_m2K":

                h_inside,


            "h_outside_W_m2K":

                h_outside

        },


        "ground_temperature_mode":

            "manual",


        "ground_temperature_C":

            ground_temperature,


        "internal_heat_gain_W":

            internal_heat

    }


# ==================================================
# MODE SELECTOR
# ==================================================

def collect_user_configuration(

    materials,

    construction_profiles,

    glazing_profiles

):

    print()

    print(

        "=" * 60

    )

    print(

        "DRDO SHELTER THERMAL CALCULATOR"

    )

    print(

        "=" * 60

    )


    print(

        "\n1. Basic User Mode"

    )


    print(

        "2. Detailed User Mode"

    )


    print(

        "3. Advanced Engineering Mode"

    )


    while True:

        try:

            choice = int(

                input(

                    "\nSelect mode: "

                )

            )


            if choice in {

                1,

                2,

                3

            }:

                break


            print(

                "Invalid selection."

            )


        except ValueError:

            print(

                "Please enter 1, 2 or 3."

            )


    if choice == 1:

        configuration = collect_basic_mode(

            construction_profiles,

            glazing_profiles

        )


    elif choice == 2:

        configuration = collect_detailed_mode(

            materials,

            glazing_profiles

        )


    else:

        configuration = collect_advanced_mode(

            materials,

            glazing_profiles

        )


    location = collect_location()


    start_date, end_date = (

        collect_weather_period()

    )


    return (

        configuration,

        location,

        start_date,

        end_date

    )