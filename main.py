"""
main.py

Main controller for the
DRDO Shelter Thermal Calculator.

COCOON:
Physics-Based Thermal Calculator
+
Random Forest ML Prediction
+
ANSYS Boundary Export

Weather:
    Legacy single-room model (option 1): NASA POWER, unchanged.
    RC network model (option 2): Open-Meteo, corrected to the site
    elevation, available for any date from 1940 up to 16 days ahead.
"""


import os
from datetime import date, datetime, timedelta

import matplotlib.pyplot as plt
import pandas as pd


# ==================================================
# ML IMPORTS
# ==================================================

from ml.feature_builder import build_ml_features
from ml.predictor import predict_batch


# ==================================================
# EXISTING PROJECT IMPORTS
# ==================================================

from ansys_export import export_ansys_boundary_conditions

from materials import get_material_display_name, load_materials

from thermal_model import run_simulation

from user_input import (
    collect_location,
    collect_user_configuration,
    collect_weather_period,
    get_float,
    get_yes_no,
    load_json,
)


# ==================================================
# RC NETWORK (MULTI-ROOM / MULTI-STOREY) IMPORTS
# ==================================================

from multiroom_rc import run_multiroom_simulation

from multiroom_input import (
    attach_solar_schedules,
    collect_multiroom_configuration,
)

from ground_model import (
    DEFAULT_DEPTH_M,
    climatology_parameters,
    fetch_monthly_air_climatology,
    kusuda_ground_temperature,
)

from weather import (
    fetch_nasa_power_weather,
    get_best_available_weather,
)


# ==================================================
# DIRECTORIES
# ==================================================

os.makedirs("results", exist_ok=True)


# ==================================================
# FILE PATHS
# ==================================================

MATERIAL_FILE = "data/material_properties.json"
CONSTRUCTION_PROFILE_FILE = "data/construction_profiles.json"
GLAZING_PROFILE_FILE = "data/glazing_profiles.json"


# ==================================================
# PRINT LAYERS
# ==================================================

def print_layers(title, layers, materials):

    print(f"\n{title}:")

    for layer in layers:
        material_id = layer["material"]
        material = materials[material_id]

        print(
            f"  {get_material_display_name(material_id, material)} "
            f"- {layer['thickness_mm']} mm"
        )
        print(f"    Data status: {material['data_status']}")


# ==================================================
# PRINT PROFILE METADATA
# ==================================================

def print_profile_metadata(configuration):

    profiles = configuration.get("selected_profiles")

    if not profiles:
        return

    print("\nSelected construction profiles:")

    for section, profile in profiles.items():
        print(f"  {section.title()}: {profile['name']}")
        print(f"    {profile['source_status']}")


# ==================================================
# LEGACY SINGLE-ROOM MODEL (unchanged behaviour)
# ==================================================

def run_legacy_model():

    """Original single-room model (unchanged behaviour)."""

    # LOAD DATA
    print("\nLoading material database...")
    materials = load_materials(MATERIAL_FILE)

    print("Loading construction profiles...")
    construction_profiles = load_json(CONSTRUCTION_PROFILE_FILE)

    print("Loading glazing profiles...")
    glazing_profiles = load_json(GLAZING_PROFILE_FILE)

    # USER INPUT
    configuration, location, start_date, end_date = collect_user_configuration(
        materials, construction_profiles, glazing_profiles
    )

    # SHOW CONFIGURATION
    print()
    print("=" * 60)
    print("RESOLVED SIMULATION CONFIGURATION")
    print("=" * 60)

    print(f"\nMode: {configuration['mode']}")

    print_layers("Wall layers", configuration["walls"], materials)
    print_layers("Roof layers", configuration["roof"], materials)
    print_layers("Floor layers", configuration["floor"], materials)

    print_profile_metadata(configuration)

    # WINDOW INFORMATION
    print(f"\nWindow area: {configuration['windows']['area_m2']:.2f} m²")
    print(
        "Glazing: "
        f"{configuration['windows'].get('glazing_display_name', configuration['windows']['glazing_type'])}"
    )

    # MODEL PARAMETERS
    print("\nModel parameters:")
    print(f"  h_inside = {configuration['heat_transfer']['h_inside_W_m2K']} W/m²K")
    print(f"  h_outside = {configuration['heat_transfer']['h_outside_W_m2K']} W/m²K")
    print(
        f"  Ground temperature mode = "
        f"{configuration.get('ground_temperature_mode', 'manual')}"
    )

    # CONTENTS
    if configuration["contents"]["mass_kg"] == 0:
        print("\nContents thermal mass: Not included in this simulation.")
    else:
        print("\nContents thermal mass:")
        print(f"  Mass: {configuration['contents']['mass_kg']} kg")
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

    # CONFIRM
    confirm = input(
        "\nRun simulation with this configuration? (yes/no): "
    ).strip().lower()

    if confirm not in {"yes", "y"}:
        print("Simulation cancelled.")
        return

    # NASA WEATHER
    print("\nFetching real weather data from NASA POWER...")
    print(f"Location: {location['latitude']}, {location['longitude']}")
    print(f"Period: {start_date} to {end_date}")

    weather = fetch_nasa_power_weather(
        latitude=location["latitude"],
        longitude=location["longitude"],
        start_date=start_date,
        end_date=end_date,
    )

    print(f"NASA POWER data loaded: {len(weather)} hourly records")

    # WEATHER SUMMARY
    print("\nWEATHER DATA SUMMARY")
    print("-" * 60)
    print(f"Outdoor temperature minimum: {weather['temperature_C'].min():.2f} °C")
    print(f"Outdoor temperature maximum: {weather['temperature_C'].max():.2f} °C")
    print(
        "Maximum solar radiation: "
        f"{weather['solar_radiation_W_m2'].max():.2f} W/m²"
    )

    # SAVE NASA WEATHER
    weather_file = "results/nasa_weather_used.csv"
    weather.to_csv(weather_file, index=False)

    # RUN PHYSICS SIMULATION
    print("\nRunning thermal simulation...")

    results, properties = run_simulation(weather, configuration, materials)
    results_df = pd.DataFrame(results)

    # ML FEATURE GENERATION
    print("Generating ML features...")
    ml_features_df = build_ml_features(
        results_df, weather, configuration, properties
    )

    # RANDOM FOREST PREDICTION
    print("Running Random Forest predictions...")
    ml_predictions = predict_batch(ml_features_df)

    results_df["ml_predicted_indoor_temperature_C"] = ml_predictions

    results_df["physics_ml_difference_C"] = (
        results_df["indoor_temperature_C"]
        - results_df["ml_predicted_indoor_temperature_C"]
    ).abs()

    # SAVE RESULTS
    results_file = "results/thermal_results.csv"
    results_df.to_csv(results_file, index=False)

    # EXPORT ANSYS DATA
    ansys_file = "results/ansys_boundary_conditions.csv"
    export_ansys_boundary_conditions(results_df, ansys_file)

    # PRINT RESULTS
    print()
    print("=" * 60)
    print("DRDO SHELTER THERMAL CALCULATOR RESULTS")
    print("=" * 60)

    print("\nTHERMAL PROPERTIES")
    print("-" * 60)
    print(f"Wall U-value: {properties['wall']['U_W_m2K']:.4f} W/m²K")
    print(f"Roof U-value: {properties['roof']['U_W_m2K']:.4f} W/m²K")
    print(f"Floor U-value: {properties['floor']['U_W_m2K']:.4f} W/m²K")

    print("\nWINDOW PROPERTIES")
    print("-" * 60)
    print(f"Window area: {properties['window']['area_m2']:.2f} m²")
    print(f"Window U-value: {properties['window']['U_W_m2K']:.2f} W/m²K")

    C = properties["capacitance"]

    print("\nTHERMAL CAPACITANCE")
    print("-" * 60)
    print(f"Walls: {C['walls_J_K']:,.2f} J/K")
    print(f"Roof: {C['roof_J_K']:,.2f} J/K")
    print(f"Floor: {C['floor_J_K']:,.2f} J/K")
    print(f"Contents: {C['contents_J_K']:,.2f} J/K")
    print(f"TOTAL: {C['total_J_K']:,.2f} J/K")

    print("\nTEMPERATURE PREDICTION")
    print("-" * 60)
    print(f"Minimum indoor temperature: {results_df['indoor_temperature_C'].min():.2f} °C")
    print(f"Maximum indoor temperature: {results_df['indoor_temperature_C'].max():.2f} °C")
    print(f"Average indoor temperature: {results_df['indoor_temperature_C'].mean():.2f} °C")
    print(f"Final indoor temperature: {results_df['indoor_temperature_C'].iloc[-1]:.2f} °C")

    print()
    print("ML TEMPERATURE PREDICTION")
    print("-" * 60)
    print(f"Minimum ML temperature: {results_df['ml_predicted_indoor_temperature_C'].min():.2f} °C")
    print(f"Maximum ML temperature: {results_df['ml_predicted_indoor_temperature_C'].max():.2f} °C")
    print(f"Average ML temperature: {results_df['ml_predicted_indoor_temperature_C'].mean():.2f} °C")

    print()
    print("PHYSICS vs ML COMPARISON")
    print("-" * 60)
    print(f"Average prediction difference: {results_df['physics_ml_difference_C'].mean():.4f} °C")
    print(f"Maximum prediction difference: {results_df['physics_ml_difference_C'].max():.4f} °C")

    print(f"\nNASA weather saved to: {weather_file}")
    print(f"Results saved to: {results_file}")
    print(f"ANSYS data saved to: {ansys_file}")

    # GRAPH
    plt.figure(figsize=(12, 6))

    plt.plot(
        results_df["timestamp"],
        results_df["outdoor_temperature_C"],
        label="Outdoor Temperature",
    )
    plt.plot(
        results_df["timestamp"],
        results_df["indoor_temperature_C"],
        label="Physics Model Prediction",
    )
    plt.plot(
        results_df["timestamp"],
        results_df["ml_predicted_indoor_temperature_C"],
        label="Random Forest Prediction",
    )

    plt.xlabel("Time")
    plt.ylabel("Temperature (°C)")
    plt.title("COCOON Shelter Thermal Temperature Prediction")
    plt.legend()
    plt.xticks(rotation=45)
    plt.tight_layout()

    graph_file = "results/temperature_prediction.png"
    plt.savefig(graph_file, dpi=300)
    print(f"Graph saved to: {graph_file}")

    plt.show()


# ==================================================
# RC NETWORK MODEL (MULTI-ROOM / MULTI-STOREY /
# SINGLE-ROOM NO-FLOOR)
# ==================================================

LEH_SITE_ELEVATION_M = 3500.0

# Open-Meteo: ERA5 archive from 1940, forecast up to 16 days ahead.
EARLIEST_WEATHER_DATE = date(1940, 1, 1)
MAX_FORECAST_DAYS = 15


def check_weather_period(start_date, end_date, today=None):
    """Return an error message if Open-Meteo cannot cover the period,
    otherwise None. Dates are 'YYYYMMDD' strings."""

    today = today or date.today()

    try:
        start = datetime.strptime(str(start_date), "%Y%m%d").date()
        end = datetime.strptime(str(end_date), "%Y%m%d").date()
    except ValueError:
        return "Dates must be in YYYYMMDD format."

    if end < start:
        return "End date is before start date."

    if start < EARLIEST_WEATHER_DATE:
        return f"Weather data starts on {EARLIEST_WEATHER_DATE:%Y%m%d}."

    latest = today + timedelta(days=MAX_FORECAST_DAYS)

    if end > latest:
        return (
            f"Weather is available up to {latest:%Y%m%d} "
            f"({MAX_FORECAST_DAYS} days of forecast)."
        )

    return None


def collect_valid_weather_period():
    """Ask for dates until Open-Meteo can cover them."""

    while True:
        start_date, end_date = collect_weather_period()
        problem = check_weather_period(start_date, end_date)

        if problem is None:
            return start_date, end_date

        print(f"\n{problem} Please enter the dates again.")


def ask_site_elevation(location):
    default = (
        LEH_SITE_ELEVATION_M
        if location.get("name", "").startswith("Leh") else None
    )
    prompt = "Site elevation above sea level in metres"
    prompt += f" [Enter = {default:.0f}]: " if default else ": "

    while True:
        raw = input(prompt).strip()

        if not raw and default:
            return default

        try:
            return float(raw)
        except ValueError:
            print("Please enter a number.")


def describe_period(weather, start_date, end_date):
    """Explain which part of the period is observed-based and which is
    forecast, so users know how much to trust it."""

    apis = weather.attrs.get("open_meteo_apis", [])

    if apis == ["archive"]:
        return "ERA5 reanalysis (past weather)"

    today = date.today()
    end = datetime.strptime(str(end_date), "%Y%m%d").date()

    if end >= today:
        return (
            "includes FORECAST hours (today and later) - "
            "results for those days are a prediction"
        )

    if "archive" in apis:
        return "ERA5 reanalysis + recent days from the Open-Meteo forecast API"

    return "recent weather from the Open-Meteo forecast API"


def resolve_ground_temperature(weather, location, site_elevation_m):
    """Ground boundary temperature series for the RC network."""

    print()
    print("=" * 60)
    print("GROUND TEMPERATURE (used only by rooms on the ground)")
    print("=" * 60)
    print(
        f"1. Undisturbed soil at {DEFAULT_DEPTH_M} m depth "
        "(Kusuda model from 10-year Open-Meteo climate at the site "
        "elevation) - recommended"
    )
    print("2. Constant value you enter (sensitivity tests or measured data)")

    while True:
        choice = input("\nSelect ground model: ").strip()

        if choice in {"1", "2"}:
            break

        print("Please enter 1 or 2.")

    if choice == "2":
        ground_C = get_float(
            "Constant ground temperature (deg C): ",
            minimum=-60,
            maximum=60,
        )
        return [ground_C] * len(weather), "manual_constant"

    try:
        monthly, info = fetch_monthly_air_climatology(
            location["latitude"],
            location["longitude"],
            site_elevation_m=site_elevation_m,
        )
        tm, amplitude, t0 = climatology_parameters(monthly)
        print(
            f"Climatology ({info['source']}, {info['period']}, "
            f"{site_elevation_m:.0f} m): annual mean {tm:.1f} deg C, "
            f"amplitude {amplitude:.1f} K, coldest around day {t0}"
        )
    except Exception as error:  # noqa: BLE001
        print(f"Could not fetch the climatology ({error}).")
        print("Enter the site climate manually instead:")
        tm = get_float("  Annual mean air temperature (deg C): ")
        coldest = get_float("  Coldest-month mean (deg C): ")
        warmest = get_float("  Warmest-month mean (deg C): ")
        amplitude = (warmest - coldest) / 2.0
        t0 = 15  # mid-January

    series = kusuda_ground_temperature(weather["timestamp"], tm, amplitude, t0)

    print(
        f"Ground temperature over the period: {min(series):.1f} "
        f"to {max(series):.1f} deg C"
    )

    return series, "kusuda_soil_1m"


def choose_solar_context(weather, location):
    """Settings for the plane-of-window solar calculation."""

    print()
    print("=" * 60)
    print("SOLAR SETTINGS")
    print("=" * 60)

    raw = input(
        "Ground albedo (0.2 bare ground, 0.6-0.8 fresh snow) "
        "[Enter = 0.2]: "
    ).strip()

    try:
        albedo = min(0.9, max(0.0, float(raw))) if raw else 0.2
    except ValueError:
        albedo = 0.2

    # Open-Meteo data is requested in Indian Standard Time and its
    # radiation is re-timed in weather.py to the timestamp itself.
    return {
        "latitude_deg": location["latitude"],
        "longitude_deg": location["longitude"],
        "time_standard": weather.attrs.get("time_standard", "standard"),
        "utc_offset_h": weather.attrs.get("utc_offset_h", 5.5),
        "albedo": albedo,
    }


def print_rc_layout(rooms, surfaces, windows):
    print()
    print("=" * 60)
    print("RESOLVED RC NETWORK")
    print("=" * 60)

    for room in rooms:
        floor_note = (
            "has floor" if room.has_floor_boundary
            else "NO floor (no-floor shelter)"
        )

        print(
            f"\nRoom '{room.room_id}' ({room.name}) - storey "
            f"{room.storey}, {room.volume_m3:.1f} m3, "
            f"C = {room.capacitance_J_K / 1e6:.2f} MJ/K, "
            f"{floor_note}"
        )

        for s in surfaces:
            if s.room_id == room.room_id:
                target = (
                    f"-> {s.adjacent_room_id}"
                    if s.boundary_type == "adjacent"
                    else f"-> {s.boundary_type}"
                )
                print(
                    f"    {s.surface_id:32s} {s.area_m2:7.2f} m2  "
                    f"U={s.U_W_m2K:.3f}  {target}"
                )

        for w in windows:
            if w.room_id == room.room_id:
                print(
                    f"    {w.window_id:32s} {w.area_m2:7.2f} m2  "
                    f"U={w.U_W_m2K:.2f} SHGC={w.SHGC:.2f} "
                    f"{w.orientation}"
                )


def print_heat_loss_breakdown(rooms, surfaces, windows, schedules):
    """Where the heat escapes: conductance (W/K) of each envelope
    element for the whole shelter. The biggest share is the first
    thing to improve for a passive (unheated) design."""

    element = {
        "Walls": 0.0, "Roof": 0.0, "Floor / ground": 0.0,
        "Windows": 0.0, "Ventilation / air leakage": 0.0,
    }

    for s in surfaces:
        ua = s.U_W_m2K * s.area_m2

        if s.boundary_type == "adjacent":
            continue
        if s.boundary_type == "ground" or "floor" in s.surface_id:
            element["Floor / ground"] += ua
        elif s.surface_id.endswith("_roof"):
            element["Roof"] += ua
        else:
            element["Walls"] += ua

    for w in windows:
        element["Windows"] += w.U_W_m2K * w.area_m2

    for r in rooms:
        ach = schedules[r.room_id].ventilation_ACH
        ach = ach if isinstance(ach, (int, float)) else max(ach)
        element["Ventilation / air leakage"] += (
            1.2 * 1005 * ach * r.volume_m3 / 3600.0
        )

    total = sum(element.values())

    print()
    print("=" * 60)
    print("HEAT-LOSS BREAKDOWN (whole shelter, to outdoors/ground)")
    print("=" * 60)

    for name, ua in sorted(element.items(), key=lambda x: -x[1]):
        print(
            f"  {name:28s} {ua:7.1f} W/K  "
            f"{(ua / total * 100 if total else 0):5.1f} %"
        )

    print(f"  {'TOTAL':28s} {total:7.1f} W/K")
    print(
        f"  (Every 1 K of indoor-outdoor difference costs "
        f"{total:.0f} W. Reduce the largest rows first.)"
    )


def save_rc_results(result, weather, weather_label, ground_mode,
                    site_elevation_m=None):
    """Write CSVs + plot to results/ and return the file paths."""

    rows = []

    timestamps = [b["timestamp"] for b in result["building"]]

    for room_id, data in result["rooms"].items():
        for k, timestamp in enumerate(timestamps):
            rows.append({
                "timestamp": timestamp,
                "room_id": room_id,
                "room_name": data["room_name"],
                "storey": data["storey"],
                "temperature_C": data["temperature_C"][k],
                "Q_envelope_W": data["Q_envelope_W"][k],
                "Q_solar_W": data["Q_solar_W"][k],
                "Q_internal_W": data["Q_internal_W"][k],
                "Q_ventilation_W": data["Q_ventilation_W"][k],
                "Q_interzone_W": data["Q_interzone_W"][k],
                "Q_HVAC_W": data["Q_HVAC_W"][k],
                "Q_net_W": data["Q_net_W"][k],
                "below_comfort": data["below_comfort"][k],
                "above_comfort": data["above_comfort"][k],
            })

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    def writable(path):
        """Windows locks files open in Excel/OneDrive. If the usual
        name is locked, write a timestamped copy instead of
        crashing and losing the run."""
        try:
            with open(path, "a"):
                pass
            return path
        except PermissionError:
            root, ext = os.path.splitext(path)
            alternative = f"{root}_{stamp}{ext}"
            print(
                f"  WARNING: {path} is open in another program "
                f"(Excel?). Saving to {alternative} instead."
            )
            return alternative

    os.makedirs("results", exist_ok=True)

    paths = {
        key: writable(path)
        for key, path in {
            "room_timeseries": "results/rc_room_timeseries.csv",
            "room_summary": "results/rc_room_summary.csv",
            "building": "results/rc_building_timeseries.csv",
            "weather": "results/rc_weather_used.csv",
            "plot": "results/rc_room_temperatures.png",
        }.items()
    }

    pd.DataFrame(rows).to_csv(paths["room_timeseries"], index=False)

    summary = pd.DataFrame.from_dict(result["room_summaries"], orient="index")
    summary.index.name = "room_id"
    summary["weather_source"] = weather_label
    summary["ground_temperature_mode"] = ground_mode
    summary["site_elevation_m"] = site_elevation_m
    summary.to_csv(paths["room_summary"])

    pd.DataFrame(result["building"]).to_csv(paths["building"], index=False)

    weather_out = weather.copy()
    weather_out["weather_source"] = weather_label
    weather_out["site_elevation_m"] = site_elevation_m
    weather_out.to_csv(paths["weather"], index=False)

    plt.figure(figsize=(12, 6))

    plt.plot(
        timestamps,
        [b["outdoor_temperature_C"] for b in result["building"]],
        label="Outdoor",
        color="black",
        linestyle="--",
        linewidth=1,
    )

    for room_id, data in result["rooms"].items():
        plt.plot(
            timestamps,
            data["temperature_C"],
            label=f"{data['room_name']} (storey {data['storey']})",
        )

    plt.xlabel("Time")
    plt.ylabel("Temperature (deg C)")
    plt.title(f"COCOON RC network - room temperatures ({weather_label})")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(paths["plot"], dpi=150)
    plt.close()

    return paths


def run_rc_network_model(materials, construction_profiles,
                         glazing_profiles):

    location = collect_location()
    start_date, end_date = collect_valid_weather_period()
    site_elevation_m = ask_site_elevation(location)

    print()
    print("=" * 60)
    print("WEATHER DATA (Open-Meteo)")
    print("=" * 60)
    print(f"Location: {location['latitude']}, {location['longitude']}")
    print(f"Period: {start_date} to {end_date}")
    print(f"Site elevation: {site_elevation_m:.0f} m")
    print("Fetching real weather data...")

    try:
        weather, weather_label = get_best_available_weather(
            latitude=location["latitude"],
            longitude=location["longitude"],
            start_date=start_date,
            end_date=end_date,
            site_elevation_m=site_elevation_m,
        )
    except RuntimeError as error:
        print(f"\n{error}")
        return None

    print(
        f"Weather loaded from '{weather_label}': "
        f"{len(weather)} hourly records, "
        f"{weather['temperature_C'].min():.1f} to "
        f"{weather['temperature_C'].max():.1f} deg C, "
        f"peak sunlight {weather['solar_radiation_W_m2'].max():.0f} W/m2"
    )
    print(
        f"  Temperatures corrected to {site_elevation_m:.0f} m by "
        "Open-Meteo (no manual lapse-rate correction needed)."
    )
    print(f"  Data type: {describe_period(weather, start_date, end_date)}")

    ground_series, ground_mode = resolve_ground_temperature(
        weather, location, site_elevation_m
    )

    solar_context = choose_solar_context(weather, location)

    (
        rooms,
        surfaces,
        windows,
        schedules,
        timestep_seconds,
        n_timesteps,
    ) = collect_multiroom_configuration(
        materials,
        construction_profiles,
        glazing_profiles,
        weather,
    )

    attach_solar_schedules(schedules, windows, weather, solar_context)

    print_rc_layout(rooms, surfaces, windows)
    print_heat_loss_breakdown(rooms, surfaces, windows, schedules)

    if not get_yes_no(
        "\nRun RC network simulation with this layout? (yes/no): "
    ):
        print("Simulation cancelled.")
        return None

    result = run_multiroom_simulation(
        rooms=rooms,
        surfaces=surfaces,
        windows=windows,
        outdoor_temperature_C=weather["temperature_C"].tolist(),
        ground_temperature_C=ground_series,
        schedules=schedules,
        timestep_seconds=timestep_seconds,
        timestamps=weather["timestamp"].tolist(),
    )

    print()
    print("=" * 60)
    print("RC NETWORK RESULTS")
    print("=" * 60)
    print(
        f"Weather source: {weather_label} | ground: {ground_mode} | "
        f"{n_timesteps} steps of {timestep_seconds} s "
        f"(internal sub-steps: "
        f"{result['metadata']['internal_substeps_per_timestep']}, "
        f"warm-up: {result['metadata']['warmup_days']} days)"
    )

    for room_id, s in result["room_summaries"].items():
        print(f"\n{s['room_name']} ({room_id}, storey {s['storey']})")
        print(
            f"  Min / Avg / Max: {s['minimum_temperature_C']:.2f} / "
            f"{s['average_temperature_C']:.2f} / "
            f"{s['maximum_temperature_C']:.2f} deg C"
        )
        print(
            f"  Heat loss {s['total_conductance_W_K']:.1f} W/K, "
            f"time constant {s['time_constant_h']:.0f} h, "
            f"temperature after warm-up "
            f"{s['temperature_after_warmup_C']:.1f} deg C"
        )
        print(
            f"  Hours below 0 deg C (freezing): "
            f"{s['hours_below_freezing']:.0f} / "
            f"{s['total_simulated_hours']:.0f}"
        )

        if s.get("heating_setpoint_C") is not None:
            print(
                f"  [Benchmark, not part of the shelter] a heated "
                f"room at {s['heating_setpoint_C']} deg C would need: "
                f"{s['heating_energy_kWh']:.1f} kWh over the period, "
                f"peak {s['peak_heating_W']:.0f} W, unmet "
                f"{s['unmet_heating_hours']:.0f} h"
            )

        if s.get("comfort_min_C") is not None:
            print(
                f"  Hours below {s['comfort_min_C']} deg C: "
                f"{s['below_comfort_hours']:.0f} / "
                f"{s['total_simulated_hours']:.0f} "
                f"({s['degree_hours_below_Kh']:.0f} degree-hours)"
            )
            print(
                f"  Hours above {s['comfort_max_C']} deg C: "
                f"{s['above_comfort_hours']:.0f} / "
                f"{s['total_simulated_hours']:.0f}"
            )

    paths = save_rc_results(
        result, weather, weather_label, ground_mode, site_elevation_m
    )

    print("\nSaved:")
    for path in paths.values():
        print(f"  {path}")

    print(
        "\nNote: the ML predictor and ANSYS export currently target "
        "the legacy single-room model only, so they are skipped for "
        "the RC network path."
    )

    return result


# ==================================================
# ENTRY POINT
# ==================================================

def main():

    print("\nLoading material database...")
    materials = load_materials(MATERIAL_FILE)

    print("Loading construction profiles...")
    construction_profiles = load_json(CONSTRUCTION_PROFILE_FILE)

    print("Loading glazing profiles...")
    glazing_profiles = load_json(GLAZING_PROFILE_FILE)

    print()
    print("=" * 60)
    print("COCOON - DRDO SHELTER THERMAL CALCULATOR")
    print("=" * 60)
    print(
        "1. Legacy single-room model "
        "(walls/roof/floor + ML prediction + ANSYS export)"
    )
    print(
        "2. RC network model "
        "(single room with/without floor, or multi-room "
        "multi-storey)"
    )

    while True:
        choice = input("\nSelect model: ").strip()

        if choice in {"1", "2"}:
            break

        print("Please enter 1 or 2.")

    if choice == "1":
        run_legacy_model()
    else:
        run_rc_network_model(
            materials, construction_profiles, glazing_profiles
        )


if __name__ == "__main__":

    main()