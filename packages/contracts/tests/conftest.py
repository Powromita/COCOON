import sys
from pathlib import Path

CONTRACTS_PYTHON = Path(__file__).resolve().parent.parent / "python"
if str(CONTRACTS_PYTHON) not in sys.path:
    sys.path.insert(0, str(CONTRACTS_PYTHON))
