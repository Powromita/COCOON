"""
ml/m6_predictor.py - M5 as the `Predictor` that M6's screening expects (optimization/screening.py).

    predictor = M5Predictor(weather_snapshot, setpoint_c)      # -> predictor.available, predictor.reason
    predictor.predict(m2_candidates) -> [Prediction, ...]      # one per candidate, same order

It wraps ml/surrogate.py, which runs the coverage guard first. Anything the models have not seen (a layout, a material,
a weather window that is not 168 hourly points, a feature outside the training range) comes back
`out_of_distribution` and M6 sends it straight to M4. The model is refused outright (`model_unavailable`) unless it was
labelled by the SAME M4 engine version that is installed, so stale labels can never screen anything.
Predictions are for SCREENING only; M6 re-simulates every design that matters.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Sequence

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

MODEL_DIR = REPO / "data" / "m5_dataset_v2" / "model" / "m5_baseline_v2"
ML_TARGETS = ("min_occupied_temperature_c", "mean_occupied_temperature_c", "max_occupied_temperature_c", "comfort_hours",
              "peak_heating_kw", "heating_energy_kwh", "max_zone_imbalance_c")


class M5Predictor:
    def __init__(self, weather: Any, setpoint_c: float, model_dir: Path = MODEL_DIR):
        self.weather, self.setpoint_c, self.model_dir = weather, setpoint_c, Path(model_dir)
        self.model_version: str | None = None
        self.available, self.reason = self._check()

    def _check(self) -> tuple[bool, str | None]:
        from m4_engine import ENGINE_NAME, ENGINE_VERSION
        meta_path = self.model_dir / "metadata.json"
        if not meta_path.is_file():
            return False, f"no trained M5 model at {self.model_dir}"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        self.model_version = meta.get("model_version") or self.model_dir.name
        eng = meta.get("engine") or {}
        if eng.get("name") != ENGINE_NAME or eng.get("version") != ENGINE_VERSION:
            return False, (f"model was labelled by {eng.get('name')} {eng.get('version')}, the installed M4 is "
                           f"{ENGINE_NAME} {ENGINE_VERSION}; retrain before using it")
        family = json.loads((self.model_dir / "surrogate_support.json").read_text(encoding="utf-8")).get("production_model_family", "gbt_reference")
        if not any(self.model_dir.glob(f"{family}__*.joblib")):
            return False, f"model files ({family}__*.joblib) are missing; run ml/m5_train_v2.py"
        return True, None

    def predict(self, candidates: Sequence[Any]) -> list:
        from optimization.screening import STATUS_OK, STATUS_OOD, STATUS_UNAVAILABLE, Prediction
        if not self.available:
            return [Prediction(STATUS_UNAVAILABLE, None, self.reason, self.model_version) for _ in candidates]
        import surrogate
        try:
            rows = surrogate.predict(
                [surrogate.Candidate(c.building, self.weather, self.setpoint_c,
                                     float((getattr(c, "extras", None) or {}).get("air_changes_per_hour") or 0.0)) for c in candidates],
                self.model_dir)
        except Exception as exc:                                    # noqa: BLE001  ML must never block the physics
            return [Prediction(STATUS_UNAVAILABLE, None, f"{type(exc).__name__}: {exc}", self.model_version) for _ in candidates]
        out = []
        for r in rows:
            if r["ml_status"] != STATUS_OK:
                out.append(Prediction(STATUS_OOD, None, "; ".join(r["ood_reasons"]) or "out of distribution", r["model_version"]))
            else:
                vals = {t: v["value"] for t, v in r["predictions"].items() if t in ML_TARGETS}
                out.append(Prediction(STATUS_OK, vals, None, r["model_version"], "m4"))
        return out
