"""
Main controller for the
DRDO Shelter Thermal Calculator.
"""

import os

import matplotlib.pyplot as plt

import pandas as pd


from ansys_export import (

    export_ansys_boundary_conditions

)


from materials import (

    get_material_display_name,

    load_materials

)


from thermal_model import (

    run_simulation

)


from user_input import (

    collect_user_configuration,

    load_json

)


from weather import (

    fetch_nasa_power_weather

)


# ==================================================
# DIRECTORIES
# ==================================================

os.makedirs(

    "results",

    exist_ok=True

)


# ==================================================
# FILE PATHS
# ==================================================

MATERIAL_FILE = (

    "data/material_properties.json"

)


CONSTRUCTION_PROFILE_FILE = (

    "data/construction_profiles.json"

)


GLAZING_PROFILE_FILE = (

    "data/glazing_profiles.json"

)


# ==================================================
# PRINT LAYERS
# ==================================================

def print_layers(

    title,

    layers,

    materials

):

    print(

        f"\n{title}:"

    )


    for layer in layers:

        material_id = (

            layer[

                "material"

            ]

        )


        material = (

            materials[

                material_id

            ]

        )


        print(

            f"  "

            f"{get_material_display_name(material_id, material)} "

            f"- {layer['thickness_mm']} mm"

        )


        print(

            f"    Data status: "

            f"{material['data_status']}"

        )


# ==================================================
# PRINT PROFILE METADATA
# ==================================================

def print_profile_metadata(

    configuration

):

    profiles = configuration.get(

        "selected_profiles"

    )


    if not profiles:

        return


    print(

        "\nSelected construction profiles:"

    )


    for section, profile in profiles.items():

        print(

            f"  {section.title()}: "

            f"{profile['name']}"

        )


        print(

            f"    {profile['source_status']}"

        )


# ==================================================
# MAIN
# ==================================================

def main():


    print(

        "\nLoading material database..."

    )


    materials = load_materials(

        MATERIAL_FILE

    )


    print(

        "Loading construction profiles..."

    )


    construction_profiles = load_json(

        CONSTRUCTION_PROFILE_FILE

    )


    print(

        "Loading glazing profiles..."

    )


    glazing_profiles = load_json(

        GLAZING_PROFILE_FILE

    )


    configuration, location, start_date, end_date = (

        collect_user_configuration(

            materials,

            construction_profiles,

            glazing_profiles

        )

    )


    # ==============================================
    # SHOW RESOLVED CONFIGURATION
    # ==============================================

    print()

    print(

        "=" * 60

    )

    print(

        "RESOLVED SIMULATION CONFIGURATION"

    )

    print(

        "=" * 60

    )


    print(

        f"\nMode: "

        f"{configuration['mode']}"

    )


    print_layers(

        "Wall layers",

        configuration[

            "walls"

        ],

        materials

    )


    print_layers(

        "Roof layers",

        configuration[

            "roof"

        ],

        materials

    )


    print_layers(

        "Floor layers",

        configuration[

            "floor"

        ],

        materials

    )


    print_profile_metadata(

        configuration

    )


    print(

        f"\nWindow area: "

        f"{configuration['windows']['area_m2']:.2f} m²"

    )


    print(

        "Glazing: "

        f"{configuration['windows'].get('glazing_display_name', configuration['windows']['glazing_type'])}"

    )


    print(

        "\nModel parameters:"

    )


    print(

        f"  h_inside = "

        f"{configuration['heat_transfer']['h_inside_W_m2K']} "

        f"W/m²K"

    )


    print(

        f"  h_outside = "

        f"{configuration['heat_transfer']['h_outside_W_m2K']} "

        f"W/m²K"

    )


    print(

        f"  Ground temperature mode = "

        f"{configuration.get('ground_temperature_mode', 'manual')}"

    )


    if (

        configuration[

            "contents"

        ][

            "mass_kg"

        ]

        ==

        0

    ):

        print(

            "\nContents thermal mass: "

            "Not included in this simulation."

        )


    else:

        print(

            "\nContents thermal mass:"

        )


        print(

            f"  Mass: "

            f"{configuration['contents']['mass_kg']} kg"

        )


        print(

            "  Specific heat: "

            f"{configuration['contents']['specific_heat_J_kgK']} J/kg·K"

        )


    print(

        "\nTransparency note: all material values come from "

        "the selected database entry and its displayed data status."

    )


    print(

        "Basic and Detailed Modes use explicitly displayed "

        "model defaults for convection coefficients; "

        "they are not user-entered values."

    )


    confirm = (

        input(

            "\nRun simulation with this configuration? "

            "(yes/no): "

        )

        .strip()

        .lower()

    )


    if confirm not in {

        "yes",

        "y"

    }:

        print(

            "Simulation cancelled."

        )

        return


    # ==============================================
    # NASA WEATHER
    # ==============================================

    print(

        "\nFetching real weather data from NASA POWER..."

    )


    print(

        f"Location: "

        f"{location['latitude']}, "

        f"{location['longitude']}"

    )


    print(

        f"Period: "

        f"{start_date} to {end_date}"

    )


    weather = fetch_nasa_power_weather(

        latitude=location[

            "latitude"

        ],

        longitude=location[

            "longitude"

        ],

        start_date=start_date,

        end_date=end_date

    )


    print(

        f"NASA POWER data loaded: "

        f"{len(weather)} hourly records"

    )


    # ==============================================
    # WEATHER SUMMARY
    # ==============================================

    print(

        "\nWEATHER DATA SUMMARY"

    )


    print(

        "-" * 60

    )


    print(

        f"Outdoor temperature minimum: "

        f"{weather['temperature_C'].min():.2f} °C"

    )


    print(

        f"Outdoor temperature maximum: "

        f"{weather['temperature_C'].max():.2f} °C"

    )


    print(

        "Maximum solar radiation: "

        f"{weather['solar_radiation_W_m2'].max():.2f} W/m²"

    )


    # ==============================================
    # SAVE WEATHER
    # ==============================================

    weather_file = (

        "results/nasa_weather_used.csv"

    )


    weather.to_csv(

        weather_file,

        index=False

    )


    # ==============================================
    # RUN SIMULATION
    # ==============================================

    print(

        "\nRunning thermal simulation..."

    )


    results, properties = run_simulation(

        weather,

        configuration,

        materials

    )


    results_df = pd.DataFrame(

        results

    )


    # ==============================================
    # SAVE RESULTS
    # ==============================================

    results_file = (

        "results/thermal_results.csv"

    )


    results_df.to_csv(

        results_file,

        index=False

    )


    # ==============================================
    # EXPORT ANSYS DATA
    # ==============================================

    ansys_file = (

        "results/ansys_boundary_conditions.csv"

    )


    export_ansys_boundary_conditions(

        results_df,

        ansys_file

    )


    # ==============================================
    # PRINT RESULTS
    # ==============================================

    print()

    print(

        "=" * 60

    )

    print(

        "DRDO SHELTER THERMAL CALCULATOR RESULTS"

    )

    print(

        "=" * 60

    )


    print(

        "\nTHERMAL PROPERTIES"

    )


    print(

        "-" * 60

    )


    print(

        f"Wall U-value: "

        f"{properties['wall']['U_W_m2K']:.4f} W/m²K"

    )


    print(

        f"Roof U-value: "

        f"{properties['roof']['U_W_m2K']:.4f} W/m²K"

    )


    print(

        f"Floor U-value: "

        f"{properties['floor']['U_W_m2K']:.4f} W/m²K"

    )


    print(

        "\nWINDOW PROPERTIES"

    )


    print(

        "-" * 60

    )


    print(

        f"Window area: "

        f"{properties['window']['area_m2']:.2f} m²"

    )


    print(

        f"Window U-value: "

        f"{properties['window']['U_W_m2K']:.2f} W/m²K"

    )


    C = properties[

        "capacitance"

    ]


    print(

        "\nTHERMAL CAPACITANCE"

    )


    print(

        "-" * 60

    )


    print(

        f"Walls: "

        f"{C['walls_J_K']:,.2f} J/K"

    )


    print(

        f"Roof: "

        f"{C['roof_J_K']:,.2f} J/K"

    )


    print(

        f"Floor: "

        f"{C['floor_J_K']:,.2f} J/K"

    )


    print(

        f"Contents: "

        f"{C['contents_J_K']:,.2f} J/K"

    )


    print(

        f"TOTAL: "

        f"{C['total_J_K']:,.2f} J/K"

    )


    print(

        "\nTEMPERATURE PREDICTION"

    )


    print(

        "-" * 60

    )


    print(

        f"Minimum indoor temperature: "

        f"{results_df['indoor_temperature_C'].min():.2f} °C"

    )


    print(

        f"Maximum indoor temperature: "

        f"{results_df['indoor_temperature_C'].max():.2f} °C"

    )


    print(

        f"Average indoor temperature: "

        f"{results_df['indoor_temperature_C'].mean():.2f} °C"

    )


    print(

        f"Final indoor temperature: "

        f"{results_df['indoor_temperature_C'].iloc[-1]:.2f} °C"

    )


    print(

        f"\nNASA weather saved to: "

        f"{weather_file}"

    )


    print(

        f"Results saved to: "

        f"{results_file}"

    )


    print(

        f"ANSYS data saved to: "

        f"{ansys_file}"

    )


    # ==============================================
    # GRAPH
    # ==============================================

    plt.figure(

        figsize=(12, 6)

    )


    plt.plot(

        results_df[

            "timestamp"

        ],

        results_df[

            "outdoor_temperature_C"

        ],

        label="Outdoor Temperature"

    )


    plt.plot(

        results_df[

            "timestamp"

        ],

        results_df[

            "indoor_temperature_C"

        ],

        label="Predicted Indoor Temperature"

    )


    plt.xlabel(

        "Time"

    )


    plt.ylabel(

        "Temperature (°C)"

    )


    plt.title(

        "Shelter Thermal Temperature Prediction"

    )


    plt.legend()


    plt.xticks(

        rotation=45

    )


    plt.tight_layout()


    graph_file = (

        "results/temperature_prediction.png"

    )


    plt.savefig(

        graph_file,

        dpi=300

    )


    print(

        f"Graph saved to: "

        f"{graph_file}"

    )


    plt.show()


if __name__ == "__main__":

    main()