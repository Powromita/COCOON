"""
backend/settings.py — configuration for the COCOON API service.

Env overrides (all optional):
  COCOON_RUNS_DIR        default <repo>/runs
  COCOON_PIPELINE_PYTHON default the interpreter running the API
  COCOON_MAX_WORKERS     default 2   (concurrent pipeline subprocesses)
  COCOON_RUN_TTL_HOURS   default 168 (run folders older than this are swept)
  COCOON_CORS_ORIGINS    default http://localhost:3000,http://127.0.0.1:3000
  COCOON_RUN_TIMEOUT_S   default 2400 (hard kill for a stuck subprocess)
"""

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

RUNS_DIR = Path(os.environ.get("COCOON_RUNS_DIR", REPO_ROOT / "runs"))
PIPELINE_SCRIPT = REPO_ROOT / "run_pipeline.py"
PIPELINE_PYTHON = os.environ.get("COCOON_PIPELINE_PYTHON", sys.executable)

MAX_WORKERS = int(os.environ.get("COCOON_MAX_WORKERS", "2"))
RUN_TTL_HOURS = int(os.environ.get("COCOON_RUN_TTL_HOURS", "168"))
RUN_TIMEOUT_S = int(os.environ.get("COCOON_RUN_TIMEOUT_S", "2400"))

CORS_ORIGINS = os.environ.get(
    "COCOON_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

# reference data files
DATA_DIR = REPO_ROOT / "thermal-calculator" / "data"
MATERIALS_JSON = DATA_DIR / "material_properties.json"
GLAZING_JSON = DATA_DIR / "glazing_profiles.json"
RATIOS_CSV = (REPO_ROOT / "data" / "shelter" / "shelter_ratios_recommended.csv"
              if (REPO_ROOT / "data" / "shelter" / "shelter_ratios_recommended.csv").exists()
              else REPO_ROOT / "shelter_ratios_recommended.csv")
ELEMENTS_CSV = (REPO_ROOT / "data" / "shelter" / "shelter_elements_dimensions__1_.csv"
                if (REPO_ROOT / "data" / "shelter" / "shelter_elements_dimensions__1_.csv").exists()
                else REPO_ROOT / "shelter_elements_dimensions__1_.csv")

# stages the pipeline is expected to emit, per mode (for status translation)
EXPECTED_STAGES = {
    "single": ["1_weather", "4_features", "10_report"],
    "optimize": [
        "1_weather", "5_pool", "6_rank", "7_reliability",
        "8_ansys", "9_recommend", "4_features_chosen",
        "4_features_runner_up", "10_report",
    ],
}
CRITICAL_STAGES = {"1_weather", "5_pool", "6_rank", "4_features",
                   "4_features_chosen", "10_report", "FATAL"}

RUNS_DIR.mkdir(parents=True, exist_ok=True)
