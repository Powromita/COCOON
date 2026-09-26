"""
provider.py - M7 as the `EconomicsProvider` M6 expects (optimization/rc_verification.py):

    analyse(building, quantities, simulation, assumption_set_id, scenario) -> EconomicAnalysisResult

M6 hands over its capacity-limited run. M7 recomputes quantities from the building itself (M2's own bill of
quantities is not used, so M7 stays the single source of prices), prices the requested scenario and returns the
M0 result. `assumption_set_id` may be the base set ID or any alias/scenario ID of it. M6 requires the returned
`assumption_set_id` to equal the one it passed, so it is echoed verbatim; the fully resolved per-scenario ID and
every assumption stay in `last_report`.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cocoon_contracts import (BuildingModel, CostScenario, EconomicAnalysisResult, ErrorCode, MaterialSnapshot,
                              RequirementsContract, SimulationResult)

from economics.analysis import run_analysis
from economics.assumptions import LifecycleAssumptionSet, load_assumption_set
from economics.errors import EconomicsError
from economics.models import DesignInput, EconomicAnalysisReport, EconomicsRequest

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ASSUMPTIONS_DIR = REPO_ROOT / "data" / "costs"


class M7EconomicsProvider:
    def __init__(self, materials: MaterialSnapshot, assumptions_dir: Path = DEFAULT_ASSUMPTIONS_DIR,
                 occupants: int | None = None, code_commit: str = "unknown"):
        self.materials = materials
        self.assumptions_dir = Path(assumptions_dir)
        self.occupants = occupants
        self.code_commit = code_commit
        self.last_report: EconomicAnalysisReport | None = None

    def _set(self, set_id: str) -> LifecycleAssumptionSet:
        aset = load_assumption_set(self.assumptions_dir, set_id)
        if aset is None:
            raise EconomicsError(ErrorCode.MISSING_REFERENCE, f"unknown economic assumption set '{set_id}'")
        return aset

    def analyse(self, building: BuildingModel, quantities: Any, simulation: SimulationResult, assumption_set_id: str,
                scenario: CostScenario) -> EconomicAnalysisResult:
        aset = self._set(assumption_set_id)
        req = EconomicsRequest(assumption_set_id=aset.id, occupants=self.occupants,
                               design=DesignInput(building=building, simulation=simulation))
        key = f"{building.revision_id}|{simulation.simulation_id}|{aset.id}|{aset.version}|{scenario.value}"
        analysis_id = "econ_run_" + hashlib.sha1(key.encode()).hexdigest()[:12]
        report = run_analysis(req, aset, self.materials, analysis_id=analysis_id, code_commit=self.code_commit,
                              now=datetime.now(timezone.utc), only_scenarios=(scenario,), with_sensitivity=False)
        self.last_report = report
        result = report.scenarios[scenario.value].result
        return result.model_copy(update={"assumption_set_id": assumption_set_id})


def make_economics(materials: MaterialSnapshot, requirements: RequirementsContract) -> M7EconomicsProvider:
    """Factory for `python -m optimization --economics economics.provider:make_economics`."""
    return M7EconomicsProvider(materials, occupants=requirements.mission.occupants)
