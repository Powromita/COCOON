"""
multiroom_input.py

Interactive configuration builder for the multi-room / multi-storey
RC network model (multiroom_rc.py).

Handles two use cases with the SAME engine:

  1. Single room, optionally with NO floor/ground boundary
     ("single room no-floor shelter") - just ask for 1 room and let
     the user skip the ground surface.

  2. Multiple rooms across one or more storeys, with shared walls
     between rooms and floor/ceiling connections between stacked
     rooms on different storeys.

This module turns user answers into the dataclasses defined in
multiroom_rc.py: Room, Surface, Window, RoomSchedule. It reuses the
existing material / construction-profile / glazing-profile database
and heat-transfer helpers so wall/roof/window U-values and
capacitances are computed the same way as the legacy single-zone
model.

Simplifications (disclosed, not hidden):
  - Window solar gain uses solar geometry + Erbs beam/diffuse split
    + isotropic-sky transposition (solar.py). No mountain/horizon
    shading, single ground albedo.
  - Ground-contact floors: U includes ~1 m of soil and the boundary
    is the Kusuda ground temperature at that depth (ground_model.py).
  - Internal heat gain and ventilation (ACH) are entered as a single
    constant value per room rather than an hourly schedule, to keep
    data entry manageable; they can be edited to hourly lists later
    since RoomSchedule accepts either.
"""

from heat_transfer import (
    calculate_layer_capacitance,
    calculate_u_value,
    total_resistance,
)

from solar import ORIENTATIONS, plane_of_window_irradiance

from multiroom_rc import (
    Room,
    RoomSchedule,
    Surface,
    Window,
)

from user_input import (
    choose_option,
    get_float,
    get_nonnegative_float,
    get_positive_float,
    get_positive_int,
    get_yes_no,
)



DEFAULT_H_INSIDE = 2.5
DEFAULT_H_OUTSIDE = 10.0

# Approximate standard air properties, matching multiroom_rc.py.
RHO_AIR = 1.2
CP_AIR = 1005.0

# Effective mass participating thickness fraction used for the
# room-air-coupled capacitance estimate from wall/roof/floor layers.
# Assumes only part of each construction layer thermally couples to
# room air on the timescale of one simulation timestep; this is the
# same simplifying approximation section 5.7 of the design doc flags
# and asks to be explicit about.
EFFECTIVE_MASS_FRACTION = 0.5

# Bare-earth (no constructed floor) contact: indoor surface film
# (1/2.5 = 0.4 m2K/W) plus roughly 1 m of soil at ~1.5 W/mK
# (0.67 m2K/W) -> U ~ 0.9 W/m2K. This is a simplified steady-state
# placeholder, NOT a proper ground-coupling model (e.g. ISO 13370);
# the user can override it at the prompt with a site-specific value.
DEFAULT_BARE_EARTH_U = 0.9

# Ground-contact floors: the boundary temperature is the ground
# temperature at GROUND_DEPTH_M (see ground_model.py), so the heat
# path is  room film -> floor layers -> that depth of soil.
# There is NO outside air film on a ground-contact floor.
GROUND_DEPTH_M = 1.0
SOIL_CONDUCTIVITY_W_MK = 1.5


def _resolve_construction(construction_profiles, category, materials):
    """Let the user pick a named construction profile (wall/roof/
    floor) and return (profile_key, layers, U_value)."""

    profiles = construction_profiles.get(category, {})

    if not profiles:
        raise ValueError(
            f"No '{category}' construction profiles are available."
        )

    key, profile = choose_option(
        profiles,
        f"{category.upper()} CONSTRUCTION",
    )

    layers = []

    for layer in profile["layers"]:
        material_id = layer["material"].lower()

        if material_id not in materials:
            raise ValueError(
                f"Material '{material_id}' referenced by profile "
                f"'{key}' was not found in the material database."
            )

        material = materials[material_id]

        layers.append(
            {
                "material": material_id,
                "thickness_m": layer["thickness_mm"] / 1000.0,
                "thermal_conductivity": material[
                    "thermal_conductivity"
                ],
                "density": material["density"],
                "specific_heat": material["specific_heat"],
            }
        )

    resistance = total_resistance(
        layers, DEFAULT_H_INSIDE, DEFAULT_H_OUTSIDE
    )

    U = calculate_u_value(resistance)

    return key, layers, U


def _layers_resistance(layers):
    return total_resistance(layers, DEFAULT_H_INSIDE, DEFAULT_H_OUTSIDE) - (
        1.0 / DEFAULT_H_INSIDE + 1.0 / DEFAULT_H_OUTSIDE
    )


def _u_interior(layers):
    """Interior element (shared wall / slab): inside air film on
    BOTH sides, no outside film."""
    return 1.0 / (2.0 / DEFAULT_H_INSIDE + _layers_resistance(layers))


def _u_ground(layers):
    """Ground-contact floor: inside film + layers + soil to
    GROUND_DEPTH_M. `layers=[]` gives the bare-earth value."""
    return 1.0 / (
        1.0 / DEFAULT_H_INSIDE
        + (_layers_resistance(layers) if layers else 0.0)
        + GROUND_DEPTH_M / SOIL_CONDUCTIVITY_W_MK
    )


def _construction_capacitance(layers, area):
    """Effective thermal capacitance contributed by a construction
    (wall/roof/floor) surface, using a partial-mass approximation."""

    capacitance = 0.0

    for layer in layers:
        capacitance += calculate_layer_capacitance(
            area=area,
            thickness_m=layer["thickness_m"],
            density=layer["density"],
            specific_heat=layer["specific_heat"],
        )

    return capacitance * EFFECTIVE_MASS_FRACTION


def _collect_room_geometry():
    length = get_positive_float("  Room length (m): ")
    width = get_positive_float("  Room width (m): ")
    height = get_positive_float("  Room height (m): ")

    return length, width, height


def _collect_windows_for_room(room_id, glazing_profiles):
    windows = []

    n_windows = 0

    if get_yes_no("  Does this room have windows? (yes/no): "):
        n_windows = get_positive_int("  Number of windows: ")

    for i in range(n_windows):
        print(f"\n  --- Window {i + 1} for room '{room_id}' ---")

        area = get_positive_float("    Window area (m2): ")

        glazing_key, glazing = choose_option(
            glazing_profiles, "GLAZING TYPE"
        )

        orientation = None

        while orientation not in ORIENTATIONS:
            orientation = input(
                "    Orientation "
                f"({'/'.join(ORIENTATIONS)}): "
            ).strip().lower()

        shading_factor = get_float(
            "    Shading factor (0-1, 1 = unshaded): ",
            minimum=0.0,
            maximum=1.0,
        )

        window_id = f"{room_id}_win{i + 1}"

        windows.append(
            Window(
                window_id=window_id,
                room_id=room_id,
                area_m2=area,
                U_W_m2K=glazing["U_W_m2K"],
                SHGC=glazing["SHGC"],
                orientation=orientation,
                shading_factor=shading_factor,
            )
        )

    return windows


def _build_solar_schedule(windows, weather, solar_context):
    """Per-window plane-of-window irradiance series (W/m2) from
    GHI using solar geometry (see solar.py)."""

    solar_irradiance = {}
    cache = {}

    for window in windows:
        if window.orientation not in cache:
            cache[window.orientation] = plane_of_window_irradiance(
                timestamps=weather["timestamp"],
                ghi_W_m2=weather["solar_radiation_W_m2"].tolist(),
                orientation=window.orientation,
                **solar_context,
            )

        solar_irradiance[window.window_id] = cache[window.orientation]

    return solar_irradiance


def _infer_timestep_seconds(weather):
    """Timestep from the weather timestamps (NASA POWER is hourly).
    Falls back to 3600 s if it cannot be inferred."""

    try:
        diffs = (
            weather["timestamp"].sort_values().diff().dropna()
            .dt.total_seconds()
        )
        step = float(diffs.median())

        if step > 0:
            return int(step)
    except Exception:  # noqa: BLE001
        pass

    return 3600


def _ask_unique_room_id(index, existing_ids):
    while True:
        room_id = input(
            "  Room ID (short, unique, e.g. 'living', 'bed1'): "
        ).strip() or f"room{index + 1}"

        if " " in room_id:
            print("  Please use an ID without spaces.")
            continue

        if room_id in existing_ids:
            print(f"  '{room_id}' is already used - pick another.")
            continue

        return room_id


def collect_multiroom_configuration(
    materials,
    construction_profiles,
    glazing_profiles,
    weather,
):
    """
    Interactively collect a full multi-room / multi-storey (or
    single-room, optionally no-floor) configuration.

    Area bookkeeping (so no heat path is counted twice):
      - Exterior wall area of a room = perimeter x height
        - its window area - any shared interior wall area.
      - Roof area of a room = footprint - footprint of rooms that
        sit directly on top of it (that part becomes an internal
        floor/ceiling instead of an outdoor roof).
      - A ground-storey room's floor is either a ground boundary
        or omitted entirely (no-floor shelter).
      - An upper-storey room's floor is either a shared slab with
        the room below, or (if nothing is below it) an exposed
        floor facing outdoor air.

    Returns:
        rooms, surfaces, windows, schedules, timestep_seconds,
        n_timesteps
    """

    print()
    print("=" * 60)
    print("RC NETWORK MODEL - SHELTER LAYOUT")
    print("=" * 60)

    shelter_mode, _ = choose_option(
        {
            "single": {
                "display_name": (
                    "Single room (choose whether it has a floor/"
                    "ground boundary)"
                )
            },
            "multi": {
                "display_name": "Multiple rooms, one or more storeys"
            },
        },
        "SHELTER TYPE",
    )

    n_timesteps = len(weather)

    if shelter_mode == "single":
        n_rooms = 1
        n_storeys = 1
    else:
        n_storeys = get_positive_int("\nNumber of storeys: ")

        while True:
            n_rooms = get_positive_int(
                "Total number of rooms across all storeys: "
            )

            if n_rooms >= n_storeys:
                break

            print(
                "  Need at least one room per storey "
                f"({n_storeys})."
            )

    wall_key, wall_layers, wall_U = _resolve_construction(
        construction_profiles, "wall", materials
    )
    roof_key, roof_layers, roof_U = _resolve_construction(
        construction_profiles, "roof", materials
    )
    floor_key, floor_layers, floor_U = _resolve_construction(
        construction_profiles, "floor", materials
    )

    floor_ground_U = _u_ground(floor_layers)
    slab_U = _u_interior(floor_layers)

    print(
        f"\n  Floor U on ground (incl. {GROUND_DEPTH_M} m soil) = "
        f"{floor_ground_U:.3f}, floor U as inter-storey slab = "
        f"{slab_U:.3f}, floor U exposed to air = {floor_U:.3f} W/m2K"
    )
    print(
        f"  Wall U = {wall_U:.3f} W/m2K ({wall_key}), "
        f"Roof U = {roof_U:.3f} W/m2K ({roof_key}), "
        f"Floor U = {floor_U:.3f} W/m2K ({floor_key})"
    )
    print(
        "  (The same wall/roof/floor construction is applied to "
        "every room. Re-run with different profiles to compare "
        "constructions.)"
    )

    # Per-room working data; Room objects are built at the end
    # once all shared areas are known.
    room_data = {}
    room_order = []
    room_ids_by_storey = {s: [] for s in range(1, n_storeys + 1)}
    windows = []
    schedules = {}
    interzone = []  # (surface_id, room_a, room_b, area, U, layers)

    for i in range(n_rooms):

        print(f"\n--- Room {i + 1} of {n_rooms} ---")

        room_id = _ask_unique_room_id(i, room_data)

        name = input("  Room name: ").strip() or room_id

        room_type = input(
            "  Room type (living/bedroom/kitchen/bathroom/"
            "storage/other): "
        ).strip().lower() or "other"

        length, width, height = _collect_room_geometry()
        footprint = length * width

        if n_storeys > 1:
            while True:
                storey = get_positive_int(
                    f"  Which storey is '{room_id}' on "
                    f"(1 = ground, max {n_storeys}): "
                )

                if storey <= n_storeys:
                    break

                print(f"  Storey must be 1-{n_storeys}.")
        else:
            storey = 1

        initial_temperature = get_float(
            "  Initial room temperature (deg C): ",
            minimum=-60,
            maximum=60,
        )

        comfort_min = comfort_max = None

        if get_yes_no(
            "  Set a comfort temperature band? (yes/no): "
        ):
            comfort_min = get_float(
                "    Comfort minimum (deg C): ",
                minimum=-60, maximum=60,
            )

            while True:
                comfort_max = get_float(
                    "    Comfort maximum (deg C): ",
                    minimum=-60, maximum=60,
                )

                if comfort_max >= comfort_min:
                    break

                print("    Maximum must be >= minimum.")

        # ---------------- floor handling ----------------
        floor_mode = None      # "ground" | "none" | "exposed"
        room_below_id = None

        bare_earth_U = None

        if storey == 1:
            floor_mode, _ = choose_option(
                {
                    "ground": {
                        "display_name": (
                            "Constructed floor on the ground "
                            "(uses the selected floor profile)"
                        )
                    },
                    "bare_earth": {
                        "display_name": (
                            "NO floor - shelter sits directly on "
                            "bare earth (heat flows into the soil)"
                        )
                    },
                    "none": {
                        "display_name": (
                            "NO floor - no downward heat path "
                            "modelled (only valid if well insulated "
                            "/ adiabatic below)"
                        )
                    },
                },
                f"FLOOR / GROUND BOUNDARY FOR '{room_id}'",
            )

            if floor_mode == "bare_earth":
                default_U = round(_u_ground([]), 3)
                raw = input(
                    "  Bare-earth U-value in W/m2K [Enter = "
                    f"{default_U}]: "
                ).strip()

                try:
                    bare_earth_U = float(raw) if raw else default_U
                except ValueError:
                    bare_earth_U = default_U

                bare_earth_U = max(0.01, bare_earth_U)
        else:
            existing_below = room_ids_by_storey.get(storey - 1, [])

            if existing_below and get_yes_no(
                "  Does this room sit directly above an existing "
                "room (shared floor/ceiling)? (yes/no): "
            ):
                print("  Rooms below: " + ", ".join(existing_below))

                while room_below_id is None:
                    candidate = input(
                        "  Enter the room ID directly below "
                        "(blank = nothing below): "
                    ).strip()

                    if not candidate:
                        break

                    if candidate in existing_below:
                        room_below_id = candidate
                    else:
                        print(
                            "  Not a room on storey "
                            f"{storey - 1}. Choose from: "
                            + ", ".join(existing_below)
                        )
            elif not existing_below:
                print(
                    f"  (No rooms entered on storey {storey - 1} "
                    "yet - enter lower storeys first if you want "
                    "a shared floor/ceiling.)"
                )

            if room_below_id is None:
                floor_mode = "exposed"
                print(
                    "  Nothing below this room: its floor will be "
                    "modelled as exposed to outdoor air."
                )

        # ---------------- gains / ventilation ----------------
        internal_heat_W = get_nonnegative_float(
            "  Constant internal heat gain (people + equipment, "
            "W): "
        )

        ventilation_ACH = get_nonnegative_float(
            "  Ventilation/infiltration rate (air changes per "
            "hour, ACH): "
        )

        # ---------------- optional heater ----------------
        heating_setpoint = heating_capacity = None

        # Passive shelters answer "no". "yes" adds an IDEAL virtual
        # heater used only as a benchmark: the kWh it reports is the
        # energy the design still falls short by (lower = better
        # passive design). It is never part of the shelter itself.
        if get_yes_no(
            "  Benchmark only: estimate the heating a CONVENTIONAL "
            "room would need? (passive design: answer no) (yes/no): "
        ):
            heating_setpoint = get_float(
                "    Heating setpoint (deg C): ", minimum=-20, maximum=40
            )
            capacity = get_nonnegative_float(
                "    Heater capacity in W (0 = unlimited, to find the "
                "required size): "
            )
            heating_capacity = capacity if capacity > 0 else None

        # ---------------- windows ----------------
        room_windows = _collect_windows_for_room(
            room_id, glazing_profiles
        )

        gross_wall_area = 2 * (length + width) * height
        window_area = sum(w.area_m2 for w in room_windows)

        if window_area > gross_wall_area:
            print(
                "  WARNING: window area exceeds wall area; wall "
                "area set to zero."
            )

        room_data[room_id] = {
            "name": name,
            "room_type": room_type,
            "volume": footprint * height,
            "footprint": footprint,
            "storey": storey,
            "initial_temperature": initial_temperature,
            "comfort_min": comfort_min,
            "comfort_max": comfort_max,
            "floor_mode": floor_mode,
            "bare_earth_U": bare_earth_U,
            "heating_setpoint": heating_setpoint,
            "heating_capacity": heating_capacity,
            "ext_wall_area": max(0.0, gross_wall_area - window_area),
            "roof_area": footprint,
        }
        room_order.append(room_id)
        room_ids_by_storey[storey].append(room_id)

        # Stacked room: its footprint is no longer outdoor roof
        # for the room below.
        if room_below_id is not None:
            below = room_data[room_below_id]
            slab_area = min(footprint, below["roof_area"])

            if slab_area < footprint:
                print(
                    f"  NOTE: '{room_id}' is larger than the "
                    f"remaining roof of '{room_below_id}'; shared "
                    f"slab limited to {slab_area:.2f} m2, the rest "
                    "is treated as exposed floor."
                )

            below["roof_area"] -= slab_area

            if slab_area > 0:
                interzone.append((
                    f"{room_id}_floor_to_{room_below_id}",
                    room_id, room_below_id, slab_area,
                    slab_U, floor_layers,
                ))

            overhang = footprint - slab_area
            room_data[room_id]["exposed_floor_area"] = overhang
        else:
            room_data[room_id]["exposed_floor_area"] = (
                footprint if floor_mode == "exposed" else 0.0
            )

        windows.extend(room_windows)

        schedules[room_id] = RoomSchedule(
            internal_heat_W=internal_heat_W,
            ventilation_ACH=ventilation_ACH,
        )

    # ------------------------------------------------------
    # Shared interior walls (multi-room only)
    # ------------------------------------------------------
    if shelter_mode == "multi" and len(room_order) > 1:
        print(
            "\nNow define shared interior walls between rooms "
            "(press Enter with a blank room ID to stop)."
        )
        print("  Room IDs: " + ", ".join(room_order))

        shared_index = 1
        defined_pairs = set()

        while True:
            room_a = input(
                "\n  Shared wall - first room ID (blank to "
                "finish): "
            ).strip()

            if not room_a:
                break

            if room_a not in room_data:
                print("  Unknown room ID.")
                continue

            room_b = input("  Shared wall - second room ID: ").strip()

            if room_b not in room_data or room_b == room_a:
                print("  Invalid second room ID.")
                continue

            pair = frozenset((room_a, room_b))

            if pair in defined_pairs and not get_yes_no(
                f"  A shared wall between '{room_a}' and '{room_b}' "
                "already exists. Add ANOTHER, separate wall? "
                "(yes/no): "
            ):
                print("  Skipped (existing shared wall kept).")
                continue

            shared_area = get_positive_float("  Shared wall area (m2): ")

            limit = min(
                room_data[room_a]["ext_wall_area"],
                room_data[room_b]["ext_wall_area"],
            )

            if shared_area > limit:
                print(
                    f"  Shared area capped at {limit:.2f} m2 (the "
                    "remaining exterior wall area of the smaller "
                    "room)."
                )
                shared_area = limit

            if shared_area <= 0:
                print("  No wall area left to share; skipped.")
                continue

            if get_yes_no(
                "  Same construction as the exterior walls? "
                "(yes/no): "
            ):
                shared_layers = wall_layers
            else:
                _, shared_layers, _ = _resolve_construction(
                    construction_profiles, "wall", materials
                )

            shared_U = _u_interior(shared_layers)
            defined_pairs.add(pair)

            # These square metres are now interior, not exterior.
            room_data[room_a]["ext_wall_area"] -= shared_area
            room_data[room_b]["ext_wall_area"] -= shared_area

            interzone.append((
                f"shared_wall_{shared_index}",
                room_a, room_b, shared_area,
                shared_U, shared_layers,
            ))
            shared_index += 1

    # ------------------------------------------------------
    # Build Room / Surface objects from the final areas.
    # ------------------------------------------------------
    rooms = []
    surfaces = []
    capacitance = {}

    for rid in room_order:
        d = room_data[rid]

        C = RHO_AIR * CP_AIR * d["volume"]
        C += _construction_capacitance(wall_layers, d["ext_wall_area"])
        C += _construction_capacitance(roof_layers, d["roof_area"])

        if d["floor_mode"] == "ground":
            C += _construction_capacitance(floor_layers, d["footprint"])

        C += _construction_capacitance(
            floor_layers, d["exposed_floor_area"]
        )

        capacitance[rid] = C

        if d["ext_wall_area"] > 0:
            surfaces.append(Surface(
                surface_id=f"{rid}_walls",
                room_id=rid,
                area_m2=d["ext_wall_area"],
                U_W_m2K=wall_U,
                boundary_type="outdoor",
            ))

        if d["roof_area"] > 0:
            surfaces.append(Surface(
                surface_id=f"{rid}_roof",
                room_id=rid,
                area_m2=d["roof_area"],
                U_W_m2K=roof_U,
                boundary_type="outdoor",
            ))

        if d["floor_mode"] == "ground":
            surfaces.append(Surface(
                surface_id=f"{rid}_floor",
                room_id=rid,
                area_m2=d["footprint"],
                U_W_m2K=floor_ground_U,
                boundary_type="ground",
            ))

        if d["exposed_floor_area"] > 0:
            surfaces.append(Surface(
                surface_id=f"{rid}_exposed_floor",
                room_id=rid,
                area_m2=d["exposed_floor_area"],
                U_W_m2K=floor_U,
                boundary_type="outdoor",
            ))
        if d["floor_mode"] == "bare_earth":
            surfaces.append(Surface(
                surface_id=f"{rid}_bare_earth",
                room_id=rid,
                area_m2=d["footprint"],
                U_W_m2K=d["bare_earth_U"],
                boundary_type="ground",
            ))

        # floor_mode == "none" -> no floor surface at all.

    # Interior surfaces: half of their mass is assigned to each
    # of the two rooms they separate.
    for sid, a, b, area, U, layers in interzone:
        surfaces.append(Surface(
            surface_id=sid,
            room_id=a,
            area_m2=area,
            U_W_m2K=U,
            boundary_type="adjacent",
            adjacent_room_id=b,
        ))

        half = 0.5 * _construction_capacitance(layers, area)
        capacitance[a] += half
        capacitance[b] += half

    for rid in room_order:
        d = room_data[rid]

        rooms.append(Room(
            room_id=rid,
            name=d["name"],
            room_type=d["room_type"],
            volume_m3=d["volume"],
            capacitance_J_K=capacitance[rid],
            initial_temperature_C=d["initial_temperature"],
            comfort_min_C=d["comfort_min"],
            comfort_max_C=d["comfort_max"],
            storey=d["storey"],
            has_floor_boundary=(d["floor_mode"] != "none"),
            heating_setpoint_C=d["heating_setpoint"],
            heating_capacity_W=d["heating_capacity"],
        ))

    timestep_seconds = _infer_timestep_seconds(weather)

    return (
        rooms,
        surfaces,
        windows,
        schedules,
        timestep_seconds,
        n_timesteps,
    )


def attach_solar_schedules(schedules, windows, weather, solar_context):
    """Fill in schedule.solar_irradiance for every window, in
    place, from the weather series (see module docstring for the
    orientation-factor approximation used)."""

    per_window_series = _build_solar_schedule(
        windows, weather, solar_context
    )

    windows_by_room = {}

    for window in windows:
        windows_by_room.setdefault(window.room_id, []).append(
            window
        )

    for room_id, room_windows in windows_by_room.items():
        schedule = schedules.get(room_id)

        if schedule is None:
            continue

        for window in room_windows:
            schedule.solar_irradiance[window.window_id] = (
                per_window_series[window.window_id]
            )

    return schedules