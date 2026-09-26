"""Evaluator / economics factories the CLI tests load with ``--evaluator module:factory`` (test doubles only)."""

from __future__ import annotations

from optimization.rc_verification import EvaluatorUnavailableError
from optimization.tests.standins import StandInEvaluator, make_winter_weather

from cocoon_contracts.simulation import SimulationEngineMode


def _weather(materials, weather_id, mean_c=-35.0):
    return StandInEvaluator(materials, {weather_id: make_winter_weather(weather_id, days=14, mean_c=mean_c)})


class _Cold(StandInEvaluator):
    """Every capacity-limited run comes back 8 K colder, so no design can meet the unmet-hours limit."""

    def simulate(self, job):
        result = super().simulate(job)
        if job.mode != SimulationEngineMode.CAPACITY_LIMITED_CONDITIONED:
            return result
        pts = [p.model_copy(update={"zone_temperatures_c": {z: t - 8.0 for z, t in p.zone_temperatures_c.items()}})
               for p in result.time_series]
        return result.model_copy(update={"time_series": pts})


def cold_evaluator(materials, weather_id):
    return _Cold(materials, {weather_id: make_winter_weather(weather_id, days=14, mean_c=-35.0)})


class _Down:
    engine_name, engine_version = "m4_down", "0"

    def simulate(self, job):
        raise EvaluatorUnavailableError("M4 is not reachable")


def down_evaluator(materials, weather_id):
    return _Down()


def standin_like_economics(materials, requirements):
    from optimization.tests.standins import StandInEconomics, default_assumptions

    set_id = requirements.economic_assumption_set_id
    return StandInEconomics(materials, {set_id: default_assumptions(set_id)})
