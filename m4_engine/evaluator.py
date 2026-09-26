"""
evaluator.py - M4 public entry: a job in, an M0 SimulationResult out.

`M4Evaluator.simulate(job)` matches the `Evaluator` interface M6 defines (optimization/rc_verification.py). The
job is duck-typed (M4 does not import M6): it needs `building`, `weather_snapshot_id`, `mode`, `window_start`,
`window_end`, `setpoint_c`, `timestep_seconds`, `initial_temperature_c`, `ground_temperature_c`,
`heater_capacity_kw`, `air_changes_per_hour` and `extras` (which may hold a `perturbation` dict).

The three inputs the M0 SimulationRequest cannot carry - setpoint, heater capacity, air changes per hour - arrive
on the job (see docs in optimization/README.md, "Open questions").
"""

from __future__ import annotations

import subprocess
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Mapping

from cocoon_contracts import (
    BuildingModel,
    EngineMetadata,
    MaterialSnapshot,
    SimulationProvenance,
    SimulationResult,
    SimulationStatus,
    SimulationSummary,
    TimeSeriesPoint,
    WeatherSnapshot,
    ZoneSummary,
)

from m4_engine.errors import M4Error
from m4_engine.network import build_network
from m4_engine.options import EngineOptions
from m4_engine.solver import run
from m4_engine.solar import solar_time_hours  # noqa: F401  (re-exported for tests)
from m4_engine.weather import build_series, solar_standard_for

ENGINE_NAME = "cocoon_multizone_rc"
ENGINE_VERSION = "1.0.0"
COMFORT_UPPER_MARGIN_K = 9.0        # comfort band = [setpoint - 0.05, setpoint + 9]  (matches M6's placeholder)
UNMET_TOLERANCE_K = 0.05
REPO_ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def _code_commit() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or "unknown"
    except Exception:                                           # noqa: BLE001
        return "unknown"


WeatherProvider = Callable[[str], WeatherSnapshot]


class M4Evaluator:
    engine_name = ENGINE_NAME
    engine_version = ENGINE_VERSION
    supported_perturbations = frozenset({"infiltration", "weather", "conductivity", "internal_gains", "door_usage"})

    def __init__(self, materials: MaterialSnapshot, weather: WeatherProvider | Mapping[str, WeatherSnapshot],
                 options: EngineOptions | None = None):
        self.materials = materials
        self.options = options or EngineOptions()
        self._weather = weather
        self.last_notes: list[str] = []

    def _snapshot(self, snapshot_id: str) -> WeatherSnapshot:
        try:
            if callable(self._weather):
                snap = self._weather(snapshot_id)
            else:
                snap = self._weather[snapshot_id]
        except KeyError:
            snap = None
        if snap is None:
            raise M4Error("WEATHER_SNAPSHOT_NOT_FOUND", f"weather snapshot '{snapshot_id}' is not available")
        return snap

    # ------------------------------------------------------------------------------------------------------
    def simulate(self, job: Any) -> SimulationResult:
        building: BuildingModel = job.building
        mode = job.mode.value if hasattr(job.mode, "value") else str(job.mode)
        if mode not in ("free_floating", "ideal_load_conditioned", "capacity_limited_conditioned"):
            raise M4Error("UNSUPPORTED_MODE", f"unsupported engine mode '{mode}'")
        perturb = dict((getattr(job, "extras", None) or {}).get("perturbation") or {})
        opts = self.options
        snap = self._snapshot(job.weather_snapshot_id)
        series = build_series(snap, job.window_start, job.window_end, job.timestep_seconds)
        standard = solar_standard_for(series.source_name, opts.solar_time_standard)

        ach = job.air_changes_per_hour if job.air_changes_per_hour is not None else opts.default_ach
        net = build_network(building, self.materials, opts, ach=float(ach), elevation_m=series.elevation_m,
                            door_factor=float(perturb.get("door_usage", 1.0)))
        notes = list(net.warnings)
        if job.air_changes_per_hour is None:
            notes.append(f"job carried no air_changes_per_hour; default {opts.default_ach} used")
        if job.ground_temperature_c is None:
            ground_c = series.mean_outdoor_c
            notes.append("no ground temperature given: window-mean outdoor temperature used")
        else:
            ground_c = float(job.ground_temperature_c)
        cap_w = None if job.heater_capacity_kw is None else float(job.heater_capacity_kw) * 1000.0

        records = run(net, series, opts, mode=mode, setpoint_c=float(job.setpoint_c), timestep_s=int(job.timestep_seconds),
                      initial_c=float(job.initial_temperature_c), ground_c=ground_c, capacity_w=cap_w,
                      gains_factor=float(perturb.get("internal_gains", 1.0)), solar_standard=standard)

        self.last_notes = notes
        return self._package(job, building, mode, net, records, series.snapshot_id, standard, notes)

    # ------------------------------------------------------------------------------------------------------
    def _package(self, job, building, mode, net, records, weather_id, standard, notes) -> SimulationResult:
        zones = net.zones
        dt_h = job.timestep_seconds / 3600.0
        setpoint = float(job.setpoint_c)
        lo, hi = setpoint - UNMET_TOLERANCE_K, setpoint + COMFORT_UPPER_MARGIN_K
        ids = [z.id for z in zones]

        series: list[TimeSeriesPoint] = []
        for r in records:
            series.append(TimeSeriesPoint(
                timestamp=r.time + timedelta(seconds=job.timestep_seconds / 2.0),        # state at the END of the step
                zone_temperatures_c={zid: float(r.temps[i]) for i, zid in enumerate(ids)},
                ambient_temperature_c=float(r.t_out_c),
                solar_gain_w={zid: float(r.solar_w[i]) for i, zid in enumerate(ids)},
                heating_power_w={zid: float(r.heater_w[i]) for i, zid in enumerate(ids) if zones[i].heated},
                energy_residual_w=float(r.residual_w)))

        zone_summaries: list[ZoneSummary] = []
        for i, z in enumerate(zones):
            temps = [float(r.temps[i]) for r in records]
            heater = [float(r.heater_w[i]) for r in records]
            in_band = sum(1 for t in temps if lo <= t <= hi) * dt_h
            unmet = (sum(1 for t in temps if t < lo) * dt_h) if (z.occupied and mode != "free_floating") else \
                    (sum(1 for t in temps if t < lo) * dt_h if z.occupied else None)
            zone_summaries.append(ZoneSummary(
                zone_id=z.id, temperature_min_c=min(temps), temperature_mean_c=sum(temps) / len(temps),
                temperature_max_c=max(temps), comfort_hours=in_band if z.occupied else 0.0,
                peak_heating_kw=(max(heater) / 1000.0) if z.heated else None, unmet_hours=unmet))

        occupied = [i for i, z in enumerate(zones) if z.occupied]
        total_wh = sum(float(r.heater_w.sum()) for r in records) * dt_h
        peak_kw = max((float(r.heater_w.sum()) for r in records), default=0.0) / 1000.0
        if occupied:
            all_ok = sum(1 for r in records if all(lo <= r.temps[i] <= hi for i in occupied)) * dt_h
            any_cold = sum(1 for r in records if any(r.temps[i] < lo for i in occupied)) * dt_h
        else:
            all_ok = any_cold = 0.0
        resid_pct = max((abs(r.residual_w) / max(r.boundary_flow_abs_w, 1.0) * 100.0 for r in records), default=0.0)

        summary = SimulationSummary(heating_energy_kwh=total_wh / 1000.0, peak_heating_kw=peak_kw,
                                    occupied_comfort_hours=all_ok, unmet_hours=any_cold, energy_residual_max_pct=resid_pct,
                                    airlock_benefit_vs_baseline_pct=None)
        prov = SimulationProvenance(weather_snapshot_id=weather_id, material_version=self.materials.snapshot_id,
                                    code_commit=_code_commit(), created_at=datetime.now(timezone.utc))
        request_id = job.request_id() if hasattr(job, "request_id") else "sim_m4_adhoc"
        return SimulationResult(
            schema_version="4.0", simulation_id=request_id, design_revision_id=building.revision_id,
            engine=EngineMetadata(name=ENGINE_NAME, version=ENGINE_VERSION, mode=mode, timestep_seconds=int(job.timestep_seconds)),
            status=SimulationStatus.COMPLETED, summary=summary, zones=zone_summaries, time_series=series, provenance=prov,
            recommendation_state=None)
