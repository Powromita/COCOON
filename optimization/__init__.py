"""
COCOON Module M6 - optimization and reliability.

Public interface (everything else in this package is internal detail or a stage you may call on its own):

    optimize(requirements, material_snapshot, evaluator, economics=None, *, weather_snapshot_id, seed, count,
             predictor=None, created_at=None, settings=None) -> OptimizationResult
        M2 designs -> constraints -> M5 screening (optional) -> M4 verification -> M7 economics -> Pareto ->
        four named picks -> reliability. See ``pipeline.py``.

    to_error_envelope(exc) -> ErrorEnvelope
        Any error optimize() raises, as the standard PRD 16.6 envelope.

The interfaces M6 needs from other modules (``Evaluator`` for M4, ``EconomicsProvider`` for M7, ``Predictor`` for M5) are
in ``rc_verification.py`` and ``screening.py``. Nothing returned here is ANSYS-validated.
"""

from __future__ import annotations

from optimization.pipeline import (
    DesignOutcome,
    GenerationSummary,
    OptimizationError,
    OptimizationResult,
    OptimizationSettings,
    optimize,
    to_error_envelope,
)
from optimization.ranking import NamedPick, RankingSettings
from optimization.rc_verification import (
    EconomicsProvider,
    Evaluator,
    EvaluatorUnavailableError,
    SimulationJob,
    VerificationSettings,
)
from optimization.reliability import PerturbationSpec
from optimization.screening import Prediction, Predictor, ScreeningSettings

__version__ = "0.10.0"

__all__ = [
    "optimize", "to_error_envelope", "OptimizationResult", "OptimizationSettings", "OptimizationError", "DesignOutcome",
    "GenerationSummary", "NamedPick", "RankingSettings", "PerturbationSpec", "VerificationSettings", "ScreeningSettings",
    "Evaluator", "EconomicsProvider", "Predictor", "Prediction", "SimulationJob", "EvaluatorUnavailableError", "__version__",
]
