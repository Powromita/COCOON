"""
COCOON pipeline - the glue that runs the real modules end to end (PRD v4 section 21.1).

    from cocoon_pipeline import PipelineConfig, run_pipeline
    result = run_pipeline(requirements, PipelineConfig(seed=42, count=20))

M3 weather -> M2 designs -> M4 RC verification -> M7 economics -> M6 Pareto and named picks. ML (M5) is not used;
ANSYS (M8) only runs when asked. See README.md.
"""

from cocoon_pipeline.config import PipelineConfig
from cocoon_pipeline.runner import PipelineResult, run_pipeline

__version__ = "0.1.0"

__all__ = ["PipelineConfig", "PipelineResult", "run_pipeline", "__version__"]
