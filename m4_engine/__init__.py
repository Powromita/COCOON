"""
COCOON Module M4 - multi-zone RC physics engine (PRD v4 section 10).

    from m4_engine import M4Evaluator, EngineOptions
    evaluator = M4Evaluator(material_snapshot, weather_provider)
    result = evaluator.simulate(job)          # -> cocoon_contracts.SimulationResult

Depends on the M0 contracts, numpy and the standard library only. It does not import the legacy single-zone
engine (thermal-calculator/thermal_model.py), M6, or any other module.
"""

from m4_engine.errors import M4Error
from m4_engine.evaluator import ENGINE_NAME, ENGINE_VERSION, M4Evaluator
from m4_engine.options import EngineOptions

__all__ = ["M4Evaluator", "EngineOptions", "M4Error", "ENGINE_NAME", "ENGINE_VERSION"]
