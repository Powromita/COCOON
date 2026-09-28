"""
config.py - PipelineConfig: every choice `run_pipeline` needs beyond the requirements themselves.

The field names are the ones backend/routes/pipeline.py already passes.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cocoon_contracts import MaterialSnapshot

ANSYS_NOT_REQUESTED = "not_requested"
ANSYS_SUBMIT = "submit"


@dataclass(frozen=True)
class PipelineConfig:
    seed: int = 42
    count: int = 20
    site: str | None = None                       # M3 site key; None = the cached site nearest to the requirements' coordinates
    materials: MaterialSnapshot | None = None     # None = m3_data.standard_snapshot()
    baseline_economics: bool = True               # the final report always tries a matched uninsulated baseline
    persist: bool = False                         # write result.json and candidates/*.building.json under runs_dir/run_id
    run_id: str | None = None
    runs_dir: Path | None = None
    ansys: str = ANSYS_NOT_REQUESTED              # "not_requested" | "submit"
    optimization: Any = None                      # optimization.OptimizationSettings; None = its defaults
    weather_snapshot_id: str | None = None        # use this frozen snapshot instead of building one from the requirements window
    weather_store: Any = None                     # m3_data.WeatherStore; None = the default store
    ansys_wait: bool = False                      # with ansys="submit": block until the solve ends and attach the M4-vs-ANSYS comparison
    ansys_hours: int = 48                         # length of the weather window given to ANSYS (48 h solves in about 2-4 minutes)
    ansys_designs: int = 1                        # recommended design plus optionally one distinct alternative
    validation_strategy: str = "exhaustive"       # exhaustive preserves legacy behaviour; staged enables fast RC screening
    shortlist_size: int = 20
    reliability_designs: int = 5
    rc_workers: int = 4
    screening_hours: int = 72
    screening_timestep_seconds: int = 1800
    use_ml: str = "auto"                          # "auto" = M5 screening only when count >= ml_min_designs and the model is valid
    ml_min_designs: int = 60                      # below this the RC engine simulates everything (ML saves nothing on small runs)
    final_report: bool = True                     # build final_report.json / REPORT.md for the recommended design
    progress_callback: Any = None                  # optional backend status hook: (phase, message)

    def __post_init__(self) -> None:
        if self.ansys not in (ANSYS_NOT_REQUESTED, ANSYS_SUBMIT):
            raise ValueError(f"ansys must be '{ANSYS_NOT_REQUESTED}' or '{ANSYS_SUBMIT}', not {self.ansys!r}")
        if self.use_ml not in ("auto", "on", "off"):
            raise ValueError("use_ml must be 'auto', 'on' or 'off'")
        if self.count < 1:
            raise ValueError("count must be at least 1")
        if self.validation_strategy not in ("exhaustive", "staged"):
            raise ValueError("validation_strategy must be exhaustive or staged")
        if self.validation_strategy == "staged" and not 1 <= self.shortlist_size <= self.count:
            raise ValueError("shortlist_size must be between 1 and count in staged mode")
        if self.validation_strategy == "staged" and not 1 <= self.reliability_designs <= self.shortlist_size:
            raise ValueError("reliability_designs must be between 1 and shortlist_size in staged mode")
        if self.rc_workers < 1:
            raise ValueError("rc_workers must be at least 1")
        if self.ansys_designs not in (1, 2):
            raise ValueError("ansys_designs must be 1 or 2")
        if self.persist and (self.run_id is None or self.runs_dir is None):
            raise ValueError("persist=True needs run_id and runs_dir")
