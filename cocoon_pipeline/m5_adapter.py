"""
m5_adapter.py - M5 as the `Predictor` M6 expects (optimization/screening.py).

    predictor = M5Predictor(weather_snapshot, setpoint_c=15.0)
    predictor.predict(candidates) -> [Prediction, ...]      # same order as the candidates

M5 (ml/surrogate.py) runs its out-of-distribution guard FIRST. A candidate outside the training coverage (unseen
layout, material, opening kind, or a numeric feature outside the training range, or a weather window that is not
168 hourly points) is returned as `out_of_distribution` with the reasons and no value, and M6 sends it straight to M4.
ML only screens: every finalist is re-simulated by M4 (PRD 11.7).

Targets handed on to M6 are the ones it screens on: heating energy, peak heating power, min / mean / max occupied
temperature and max zone imbalance (all measured on M4 runs of the same definitions M6 uses; see
data/m5_dataset_v2/metadata.json). `label_source` is "m4": the labels come from the M4 that ships in this repository.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from cocoon_contracts import WeatherSnapshot
from optimization.screening import STATUS_OK, STATUS_OOD, STATUS_UNAVAILABLE, Prediction

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_DIR = REPO_ROOT / "data" / "m5_dataset_v2" / "model" / "m5_baseline_v2"

# M5 target -> the key M6's screening reads
_KEYMAP = {"heating_energy_kwh": "heating_energy_kwh", "peak_heating_kw": "peak_heating_kw",
           "min_occupied_temperature_c": "min_occupied_temperature_c", "mean_occupied_temperature_c": "mean_occupied_temperature_c",
           "max_occupied_temperature_c": "max_occupied_temperature_c", "max_zone_imbalance_c": "max_zone_imbalance_c"}


class M5Predictor:
    def __init__(self, weather: WeatherSnapshot, setpoint_c: float, model_dir: Path = DEFAULT_MODEL_DIR):
        self.weather = weather
        self.setpoint_c = float(setpoint_c)
        self.model_dir = Path(model_dir)

    def available(self) -> bool:
        return (self.model_dir / "metadata.json").is_file() and (self.model_dir / "surrogate_support.json").is_file()

    def predict(self, candidates: Sequence[Any]) -> list[Prediction]:
        if not self.available():
            return [Prediction(STATUS_UNAVAILABLE, None, f"no M5 model at {self.model_dir}") for _ in candidates]
        try:
            from ml import surrogate as sg
            batch = [sg.Candidate(building=c.building, weather=self.weather, setpoint_c=self.setpoint_c,
                                  air_changes_per_hour=float(getattr(c, "extras", {}).get("air_changes_per_hour") or 0.6),
                                  candidate_id=c.building.design_id) for c in candidates]
            raw = sg.predict(batch, model_dir=self.model_dir)
        except Exception as exc:                                                   # noqa: BLE001
            return [Prediction(STATUS_UNAVAILABLE, None, f"M5 failed: {type(exc).__name__}: {exc}") for _ in candidates]
        out: list[Prediction] = []
        for r in raw:
            if r["ml_status"] == "ok":
                vals = {_KEYMAP[t]: v["value"] for t, v in r["predictions"].items() if t in _KEYMAP}
                out.append(Prediction(STATUS_OK, vals, None, r["model_version"], "m4"))
            else:
                out.append(Prediction(STATUS_OOD, None, "; ".join(r["ood_reasons"])[:400], r["model_version"], "m4"))
        return out
