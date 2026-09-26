"""
economics - Module M7, advanced lifecycle economics (PRD Section 13).

Turns a frozen BuildingModel revision plus its conditioned multi-zone RC
SimulationResult into quantities, CAPEX, yearly cash flows, lifecycle cost,
baseline NPV/payback and low/expected/high sensitivity.

Dependency rule: this package consumes only the M0 contracts
(`cocoon_contracts`) and the standard library. It must never import the
legacy single-zone engine (thermal-calculator/thermal_model.py) or any
other module's private files (PRD Section 5).
"""

from economics.version import M7_VERSION
from economics.analysis import run_analysis
from economics.assumptions import (
    Estimate,
    LifecycleAssumptionSet,
    ResolvedAssumptions,
    list_assumption_sets,
    load_assumption_set,
)
from economics.models import (
    DesignInput,
    EconomicAnalysisReport,
    EconomicsRequest,
    QuantityOverride,
)

__all__ = [
    "run_analysis",
    "Estimate",
    "LifecycleAssumptionSet",
    "ResolvedAssumptions",
    "list_assumption_sets",
    "load_assumption_set",
    "DesignInput",
    "EconomicAnalysisReport",
    "EconomicsRequest",
    "QuantityOverride",
    "M7_VERSION",
]
