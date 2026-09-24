"""
COCOON: Multi-room RC thermal model
One thermal temperature state per room.

Units:
Temperature = deg C
Area = m2
U-value = W/(m2 K)
Heat flow = W
Thermal capacitance = J/K
Time step = seconds

Positive heat flow in each room's energy balance means heat
entering that room.
"""

import math
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Room:
    room_id: str
    name: str
    room_type: str
    volume_m3: float
    capacitance_J_K: float
    initial_temperature_C: float
    comfort_min_C: Optional[float] = None
    comfort_max_C: Optional[float] = None
    storey: int = 1
    has_floor_boundary: bool = True
    # Optional ideal heater (thermostat). None = free-running room.
    heating_setpoint_C: Optional[float] = None
    heating_capacity_W: Optional[float] = None  # None = unlimited


@dataclass
class Surface:
    surface_id: str
    room_id: str
    area_m2: float
    U_W_m2K: float
    boundary_type: str
    adjacent_room_id: Optional[str] = None


@dataclass
class Window:
    window_id: str
    room_id: str
    area_m2: float
    U_W_m2K: float
    SHGC: float
    orientation: str = "south"
    shading_factor: float = 1.0


@dataclass
class RoomSchedule:
    internal_heat_W: object = 0.0
    ventilation_ACH: object = 0.0

    # window_id -> irradiance series in W/m2
    solar_irradiance: dict = field(default_factory=dict)


def value_at(value, k, default=0.0):
    """Accept either a constant or a time-indexed list."""
    if value is None:
        return float(default)

    if isinstance(value, (int, float)):
        return float(value)

    if k >= len(value):
        return float(default)

    if value[k] is None:
        return float(default)

    return float(value[k])


def validate_model(rooms, surfaces, windows, dt):
    if not rooms:
        raise ValueError("At least one room is required.")

    if dt <= 0:
        raise ValueError("Timestep must be positive.")

    ids = [r.room_id for r in rooms]

    if len(ids) != len(set(ids)):
        raise ValueError("Room IDs must be unique.")

    known_rooms = set(ids)

    for room in rooms:
        if room.volume_m3 <= 0:
            raise ValueError(
                f"{room.name}: volume must be positive."
            )

        if room.capacitance_J_K <= 0:
            raise ValueError(
                f"{room.name}: capacitance must be positive."
            )

        if (
            room.comfort_min_C is not None
            and room.comfort_max_C is not None
            and room.comfort_min_C > room.comfort_max_C
        ):
            raise ValueError(
                f"{room.name}: invalid comfort range."
            )

    surface_ids = set()

    for s in surfaces:
        if s.surface_id in surface_ids:
            raise ValueError(
                f"Duplicate surface: {s.surface_id}"
            )

        surface_ids.add(s.surface_id)

        if s.room_id not in known_rooms:
            raise ValueError(
                f"Unknown room: {s.room_id}"
            )

        if s.area_m2 <= 0 or s.U_W_m2K < 0:
            raise ValueError(
                f"Invalid surface: {s.surface_id}"
            )

        if s.boundary_type not in (
            "outdoor", "ground", "adjacent"
        ):
            raise ValueError(
                f"Invalid boundary: {s.boundary_type}"
            )

        if s.boundary_type == "adjacent":
            if s.adjacent_room_id not in known_rooms:
                raise ValueError(
                    f"Unknown adjacent room: "
                    f"{s.adjacent_room_id}"
                )

            if s.adjacent_room_id == s.room_id:
                raise ValueError(
                    "A room cannot be adjacent to itself."
                )

    window_ids = set()

    for w in windows:
        if w.window_id in window_ids:
            raise ValueError(
                f"Duplicate window: {w.window_id}"
            )

        window_ids.add(w.window_id)

        if w.room_id not in known_rooms:
            raise ValueError(
                f"Unknown window room: {w.room_id}"
            )

        if w.area_m2 < 0 or w.U_W_m2K < 0:
            raise ValueError(
                f"Invalid window: {w.window_id}"
            )

        if not 0 <= w.SHGC <= 1:
            raise ValueError(
                "SHGC must be between 0 and 1."
            )

        if not 0 <= w.shading_factor <= 1:
            raise ValueError(
                "Shading factor must be between 0 and 1."
            )


def room_conductances(rooms, surfaces, windows, schedules):
    """Total heat-loss conductance (W/K) seen by each room:
    envelope + windows + interzone + peak ventilation."""

    rho_air, cp_air = 1.2, 1005.0
    result = {}

    for r in rooms:
        g = 0.0

        for s in surfaces:
            if s.room_id == r.room_id or (
                s.boundary_type == "adjacent"
                and s.adjacent_room_id == r.room_id
            ):
                g += s.U_W_m2K * s.area_m2

        for w in windows:
            if w.room_id == r.room_id:
                g += w.U_W_m2K * w.area_m2

        vent = schedules.get(r.room_id, RoomSchedule()).ventilation_ACH

        if isinstance(vent, (int, float)) or vent is None:
            peak_ach = float(vent or 0.0)
        else:
            peak_ach = max(
                [float(v) for v in vent if v is not None] or [0.0]
            )

        g += rho_air * cp_air * max(0.0, peak_ach) * r.volume_m3 / 3600.0
        result[r.room_id] = g

    return result


def run_multiroom_simulation(
    rooms,
    surfaces,
    windows,
    outdoor_temperature_C,
    ground_temperature_C=None,
    schedules=None,
    timestep_seconds=3600,
    timestamps=None,
    hvac_heat_W=None,
    warmup_days="auto",
):
    """
    Run a coupled, one-node-per-room RC simulation.

    outdoor_temperature_C / ground_temperature_C:
        One value per timestep (ground defaults to outdoor).

    schedules:
        Dictionary keyed by room_id.

    hvac_heat_W:
        Optional fixed heat input per room (dict of constant/list).
        Positive = heating; negative = cooling. This is ADDED to the
        ideal-thermostat heating of rooms with heating_setpoint_C.

    warmup_days:
        Spin-up period. The simulated weather period is cycled for
        this many days BEFORE results are recorded, so the
        results are not dominated by the guessed initial
        temperature. "auto" = 3 x the longest room time constant
        (C / total conductance), capped at 30 days. 0 = off.

    Returns:
        Room-by-room time series and summary metrics.
    """

    validate_model(rooms, surfaces, windows, timestep_seconds)

    n = len(outdoor_temperature_C)

    if n == 0:
        raise ValueError("Weather data is empty.")

    if ground_temperature_C is not None and len(ground_temperature_C) < n:
        raise ValueError("Ground weather series is too short.")

    if timestamps is not None and len(timestamps) != n:
        raise ValueError("Timestamp count does not match weather.")

    schedules = schedules or {}
    hvac_heat_W = hvac_heat_W or {}

    room_map = {r.room_id: r for r in rooms}

    rho_air = 1.2
    cp_air = 1005.0

    # ------------------------------------------------------
    # Stability: explicit Euler needs dt * G / C small, so each
    # weather step is split into sub-steps (ratio <= 0.5).
    # ------------------------------------------------------
    G = room_conductances(rooms, surfaces, windows, schedules)

    max_ratio = max(
        timestep_seconds * G[r.room_id] / r.capacitance_J_K
        for r in rooms
    )
    n_substeps = max(1, math.ceil(max_ratio / 0.5))
    dt_sub = timestep_seconds / n_substeps

    time_constants_h = {
        r.room_id: (
            r.capacitance_J_K / G[r.room_id] / 3600.0
            if G[r.room_id] > 0 else float("inf")
        )
        for r in rooms
    }

    steps_per_day = max(1, round(86400 / timestep_seconds))

    if warmup_days == "auto":
        finite = [t for t in time_constants_h.values() if t != float("inf")]
        tau_max_h = max(finite) if finite else 0.0
        warmup_days = min(30, math.ceil(3 * tau_max_h / 24.0))

    warmup_days = max(0, int(warmup_days))

    flow_keys = [
        "Q_envelope_W", "Q_solar_W", "Q_internal_W",
        "Q_ventilation_W", "Q_interzone_W", "Q_HVAC_W",
        "Q_net_W",
    ]

    def compute_flows(T, k, Tout, Tground):
        """Signed heat flow INTO each room for state T."""

        Qenv = {rid: 0.0 for rid in room_map}
        Qsolar = {rid: 0.0 for rid in room_map}
        Qinternal = {rid: 0.0 for rid in room_map}
        Qvent = {rid: 0.0 for rid in room_map}
        Qinterzone = {rid: 0.0 for rid in room_map}
        Qhvac = {rid: 0.0 for rid in room_map}

        for s in surfaces:
            if s.boundary_type == "adjacent":
                continue

            Tb = Tout if s.boundary_type == "outdoor" else Tground
            Qenv[s.room_id] += s.U_W_m2K * s.area_m2 * (Tb - T[s.room_id])

        for w in windows:
            Qenv[w.room_id] += w.U_W_m2K * w.area_m2 * (Tout - T[w.room_id])

        for s in surfaces:
            if s.boundary_type != "adjacent":
                continue

            a, b = s.room_id, s.adjacent_room_id
            q_ab = s.U_W_m2K * s.area_m2 * (T[a] - T[b])
            Qinterzone[a] -= q_ab
            Qinterzone[b] += q_ab

        for w in windows:
            schedule = schedules.get(w.room_id, RoomSchedule())
            irradiance = max(
                0.0,
                value_at(schedule.solar_irradiance.get(w.window_id, 0.0), k),
            )
            Qsolar[w.room_id] += (
                w.area_m2 * w.SHGC * irradiance * w.shading_factor
            )

        for r in rooms:
            rid = r.room_id
            schedule = schedules.get(rid, RoomSchedule())

            Qinternal[rid] = value_at(schedule.internal_heat_W, k)

            ACH = max(0.0, value_at(schedule.ventilation_ACH, k))
            Vdot = ACH * r.volume_m3 / 3600.0
            Qvent[rid] = rho_air * cp_air * Vdot * (Tout - T[rid])

            Qhvac[rid] = value_at(hvac_heat_W.get(rid, 0.0), k)

        Qnet = {
            rid: (
                Qenv[rid] + Qsolar[rid] + Qinternal[rid]
                + Qvent[rid] + Qinterzone[rid] + Qhvac[rid]
            )
            for rid in room_map
        }

        return {
            "Q_envelope_W": Qenv, "Q_solar_W": Qsolar,
            "Q_internal_W": Qinternal, "Q_ventilation_W": Qvent,
            "Q_interzone_W": Qinterzone, "Q_HVAC_W": Qhvac,
            "Q_net_W": Qnet,
        }

    def advance(T, k):
        """Advance all rooms over weather step k. Returns the new
        state, step-averaged flows and boundary temperatures."""

        Tout = float(outdoor_temperature_C[k])
        Tground = (
            Tout if ground_temperature_C is None
            else float(ground_temperature_C[k])
        )

        avg = {key: {rid: 0.0 for rid in room_map} for key in flow_keys}

        for _ in range(n_substeps):
            flows = compute_flows(T, k, Tout, Tground)
            T_new = {}

            for rid, r in room_map.items():
                T_free = (
                    T[rid]
                    + dt_sub * flows["Q_net_W"][rid] / r.capacitance_J_K
                )

                # Ideal thermostat: add just enough heat (up to the
                # capacity) to keep the room at its setpoint.
                q_heat = 0.0

                if (
                    r.heating_setpoint_C is not None
                    and T_free < r.heating_setpoint_C
                ):
                    q_heat = (
                        r.capacitance_J_K
                        * (r.heating_setpoint_C - T_free) / dt_sub
                    )

                    if r.heating_capacity_W is not None:
                        q_heat = min(q_heat, r.heating_capacity_W)

                T_new[rid] = T_free + dt_sub * q_heat / r.capacitance_J_K
                flows["Q_HVAC_W"][rid] += q_heat
                flows["Q_net_W"][rid] += q_heat

            for key in flow_keys:
                for rid in room_map:
                    avg[key][rid] += flows[key][rid] / n_substeps

            T = T_new

        return T, avg, Tout, Tground

    # ------------------------------------------------------
    # Initial state + spin-up (not recorded).
    # ------------------------------------------------------
    T = {r.room_id: float(r.initial_temperature_C) for r in rooms}

    # Cycle the WHOLE simulated period (not just day 1), ending on
    # its last step so the recorded run continues seamlessly. This
    # gives a periodic steady state that is not biased by whether
    # the first day happened to be unusually cold or warm.
    warmup_steps = warmup_days * steps_per_day

    for j in range(warmup_steps):
        T, _, _, _ = advance(T, (j - warmup_steps) % n)

    temperature_after_warmup = dict(T)

    # ------------------------------------------------------
    # Recorded simulation.
    # ------------------------------------------------------
    results = {
        r.room_id: {
            "room_name": r.name,
            "room_type": r.room_type,
            "storey": r.storey,
            "temperature_C": [],
            **{key: [] for key in flow_keys},
            "below_comfort": [],
            "above_comfort": [],
        }
        for r in rooms
    }

    building_results = []

    for k in range(n):

        T, avg, Tout, Tground = advance(T, k)
        timestamp = timestamps[k] if timestamps is not None else k

        for r in rooms:
            rid = r.room_id
            out = results[rid]
            temp = T[rid]

            out["temperature_C"].append(temp)

            for key in flow_keys:
                out[key].append(avg[key][rid])

            out["below_comfort"].append(
                r.comfort_min_C is not None and temp < r.comfort_min_C
            )
            out["above_comfort"].append(
                r.comfort_max_C is not None and temp > r.comfort_max_C
            )

        building_results.append({
            "timestamp": timestamp,
            "outdoor_temperature_C": Tout,
            "ground_temperature_C": Tground,
            "mean_room_temperature_C": sum(T.values()) / len(T),
            "total_solar_gain_W": sum(avg["Q_solar_W"].values()),
            "total_internal_heat_W": sum(avg["Q_internal_W"].values()),
            "total_HVAC_heat_W": sum(avg["Q_HVAC_W"].values()),
        })

    # ------------------------------------------------------
    # Summary metrics per room.
    # ------------------------------------------------------
    hours_per_step = timestep_seconds / 3600.0
    summaries = {}

    for r in rooms:
        rid = r.room_id
        out = results[rid]
        temps = out["temperature_C"]

        degree_hours_below = sum(
            max(0.0, r.comfort_min_C - t) * hours_per_step
            for t in temps
        ) if r.comfort_min_C is not None else 0.0

        degree_hours_above = sum(
            max(0.0, t - r.comfort_max_C) * hours_per_step
            for t in temps
        ) if r.comfort_max_C is not None else 0.0

        heating = [max(0.0, q) for q in out["Q_HVAC_W"]]

        unmet_heating_hours = (
            sum(
                1 for t in temps
                if t < r.heating_setpoint_C - 0.05
            ) * hours_per_step
            if r.heating_setpoint_C is not None else 0.0
        )

        summaries[rid] = {
            "room_name": r.name,
            "storey": r.storey,
            "has_floor_boundary": r.has_floor_boundary,
            "minimum_temperature_C": min(temps),
            "maximum_temperature_C": max(temps),
            "average_temperature_C": sum(temps) / len(temps),
            "comfort_min_C": r.comfort_min_C,
            "comfort_max_C": r.comfort_max_C,
            "below_comfort_hours": sum(out["below_comfort"]) * hours_per_step,
            "above_comfort_hours": sum(out["above_comfort"]) * hours_per_step,
            "degree_hours_below_Kh": degree_hours_below,
            "degree_hours_above_Kh": degree_hours_above,
            "total_simulated_hours": len(temps) * hours_per_step,
            "hours_below_freezing": sum(
                1 for t in temps if t < 0.0
            ) * hours_per_step,
            "heating_setpoint_C": r.heating_setpoint_C,
            "heating_capacity_W": r.heating_capacity_W,
            "heating_energy_kWh": sum(heating) * hours_per_step / 1000.0,
            "peak_heating_W": max(heating) if heating else 0.0,
            "unmet_heating_hours": unmet_heating_hours,
            "total_conductance_W_K": G[rid],
            "capacitance_MJ_K": r.capacitance_J_K / 1e6,
            "time_constant_h": time_constants_h[rid],
            "initial_temperature_C": r.initial_temperature_C,
            "temperature_after_warmup_C": temperature_after_warmup[rid],
        }

    return {
        "metadata": {
            "model": "COCOON multi-room RC (one node per room)",
            "room_count": len(rooms),
            "timestep_seconds": timestep_seconds,
            "internal_substeps_per_timestep": n_substeps,
            "warmup_days": warmup_days,
            "number_of_timesteps": n,
        },
        "rooms": results,
        "room_summaries": summaries,
        "building": building_results,
    }


if __name__ == "__main__":

    # Example: living room and bedroom.

    rooms = [
        Room(
            "living",
            "Living Room",
            "living",
            45.0,
            2_000_000.0,
            20.0,
            18.0,
            26.0,
        ),
        Room(
            "bedroom",
            "Bedroom",
            "bedroom",
            30.0,
            1_500_000.0,
            18.0,
            16.0,
            24.0,
        ),
    ]

    surfaces = [
        Surface(
            "living_ext",
            "living",
            20.0,
            0.8,
            "outdoor",
        ),
        Surface(
            "bedroom_ext",
            "bedroom",
            15.0,
            0.8,
            "outdoor",
        ),
        Surface(
            "shared_wall",
            "living",
            10.0,
            1.2,
            "adjacent",
            "bedroom",
        ),
        Surface(
            "living_floor",
            "living",
            20.0,
            0.5,
            "ground",
        ),
        Surface(
            "bedroom_floor",
            "bedroom",
            15.0,
            0.5,
            "ground",
        ),
    ]

    windows = [
        Window(
            "living_window",
            "living",
            3.0,
            2.5,
            0.55,
            "south",
            0.9,
        ),
        Window(
            "bedroom_window",
            "bedroom",
            2.0,
            2.5,
            0.55,
            "east",
            0.9,
        ),
    ]

    schedules = {
        "living": RoomSchedule(
            internal_heat_W=[150.0] * 24,
            ventilation_ACH=[0.5] * 24,
            solar_irradiance={
                "living_window": [0, 0, 0, 0, 0, 20,
                                  100, 250, 400, 500, 550,
                                  600, 550, 450, 300, 150,
                                  50, 0, 0, 0, 0, 0, 0, 0]
            },
        ),
        "bedroom": RoomSchedule(
            internal_heat_W=[80.0] * 24,
            ventilation_ACH=[0.3] * 24,
            solar_irradiance={
                "bedroom_window": [0, 0, 0, 0, 0, 0,
                                   0, 0, 0, 50, 150, 250,
                                   300, 250, 150, 50,
                                   0, 0, 0, 0, 0, 0, 0, 0]
            },
        ),
    }

    result = run_multiroom_simulation(
        rooms=rooms,
        surfaces=surfaces,
        windows=windows,
        outdoor_temperature_C=[-10.0] * 24,
        ground_temperature_C=[-3.0] * 24,
        schedules=schedules,
    )

    print("\n--- Comfort-hour sanity check ---")
    
    for room_id, summary in (
            result["room_summaries"].items()
        ):
            total_hours = summary.get(
                "total_simulated_hours", 0
            )
    
            below_hours = summary["below_comfort_hours"]
            above_hours = summary["above_comfort_hours"]
    
            print(f"\n{room_id}:")
            print(f"Total simulated hours: {total_hours}")
            print(f"Below comfort: {below_hours}")
            print(f"Above comfort: {above_hours}")
    
            if below_hours + above_hours > total_hours:
                print("WARNING: Comfort hours exceed simulation duration.")

    for room_id, summary in (
        result["room_summaries"].items()
    ):
        print(room_id, summary)

        print("\n--- Hourly temperature profile ---")

    for room_id, room_data in result["rooms"].items():
        print(f"\n{room_data['room_name']}")

        for hour, temperature in enumerate(
            room_data["temperature_C"]
        ):
            print(
                f"Hour {hour + 1:02d}: "
                f"{temperature:.2f} °C"
            )