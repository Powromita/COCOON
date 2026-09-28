"""Physics-based first-pass screening for staged optimization.

Every candidate receives one short, coarse free-floating M4 simulation.  The
result is exposed through M6's existing Predictor protocol, so screening values
can never be mistaken for final objectives: shortlisted designs are always
re-run by the normal full-resolution RC verifier.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Sequence

from cocoon_contracts.simulation import SimulationEngineMode
from optimization.rc_verification import SimulationJob, run_checked
from optimization.screening import Prediction, STATUS_OK, STATUS_UNAVAILABLE


@dataclass(frozen=True)
class FastRCScreeningConfig:
    hours: int = 72
    timestep_seconds: int = 1800
    max_workers: int = 4

    def __post_init__(self) -> None:
        if self.hours < 24:
            raise ValueError("screening hours must be at least 24")
        if self.timestep_seconds < 900:
            raise ValueError("screening timestep must be at least 900 seconds")
        if self.max_workers < 1:
            raise ValueError("screening max_workers must be at least 1")


class FastRCPredictor:
    """Adapter that turns a genuine short M4 run into screening-only values."""

    model_version = "m4-fast-screen-v1"

    def __init__(self, evaluator: Any, weather_snapshot_id: str, window_start: Any,
                 setpoint_c: float, config: FastRCScreeningConfig | None = None):
        self.evaluator = evaluator
        self.weather_snapshot_id = weather_snapshot_id
        self.window_start = window_start
        self.setpoint_c = float(setpoint_c)
        self.config = config or FastRCScreeningConfig()

    def _predict_one(self, candidate: Any) -> Prediction:
        cfg = self.config
        try:
            job = SimulationJob.from_candidate(
                candidate,
                weather_snapshot_id=self.weather_snapshot_id,
                mode=SimulationEngineMode.FREE_FLOATING,
                window_start=self.window_start,
                window_end=self.window_start + timedelta(hours=cfg.hours),
                setpoint_c=self.setpoint_c,
                timestep_seconds=cfg.timestep_seconds,
                initial_temperature_c=self.setpoint_c,
            )
            result = run_checked(self.evaluator, job)
            zones = [z for z in result.zones if z.zone_id not in ("airlock", "equipment")] or list(result.zones)
            if not zones:
                raise ValueError("screening result contains no zones")
            mins = [z.temperature_min_c for z in zones]
            means = [z.temperature_mean_c for z in zones]
            maxes = [z.temperature_max_c for z in zones]
            values = {
                "min_occupied_temperature_c": min(mins),
                "mean_occupied_temperature_c": sum(means) / len(means),
                "max_occupied_temperature_c": max(maxes),
                "comfort_hours": sum(z.comfort_hours for z in zones),
                "max_zone_imbalance_c": max(means) - min(means),
            }
            return Prediction(STATUS_OK, values, model_version=self.model_version, label_source="m4")
        except Exception as exc:  # screening must never prevent full physics fallback
            return Prediction(STATUS_UNAVAILABLE, None, f"fast RC failed: {type(exc).__name__}: {exc}",
                              model_version=self.model_version, label_source="m4")

    def predict(self, candidates: Sequence[Any]) -> list[Prediction]:
        if self.config.max_workers == 1 or len(candidates) <= 1:
            return [self._predict_one(c) for c in candidates]
        with ThreadPoolExecutor(max_workers=self.config.max_workers) as pool:
            return list(pool.map(self._predict_one, candidates))