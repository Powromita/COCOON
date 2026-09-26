"""
Command line for M6.

    python -m optimization --requirements REQ.json --materials MATERIALS.json --weather-id wx_leh_2026 \\
        --seed 42 --count 20 --out OUT_DIR [--evaluator standin] [--economics standin]

M4 and M7 are not connected yet, so the only built-in engines are development STAND-INS (``--evaluator standin``,
``--economics standin``). Everything they produce is stamped development-only and is not a real result. To plug in the
real ones give ``module:factory``:

    --evaluator my_m4_adapter:make_evaluator     factory(materials: MaterialSnapshot, weather_snapshot_id: str) -> Evaluator
    --economics my_m7_adapter:make_economics     factory(materials: MaterialSnapshot, requirements: RequirementsContract) -> EconomicsProvider
    --economics none                             no economics: cost picks are reported as unavailable
    --predictor ml.m5_screen:make_predictor      factory(materials, requirements) -> Predictor (M5 screening; without it every design goes to M4)
                                                 the predictor may carry ``recommended_screening`` = {dimensions, safety_margin, shortlist_size}
    --screening-dimensions a,b,c  --screening-margin 0.1  --shortlist-size 20 (0 = no cap)  --min-shortlist 5     override the screening settings
    --ground-temperature none|-10                the ground temperature of every verification run ('none' = the evaluator's own ground model)

Writes OUT_DIR/result.json (the full OptimizationResult as data) and OUT_DIR/picks/<design_id>.building.json for every
recommended design (the M0 BuildingModel, ready for M4 / M8).

Exit codes: 0 a best design was found; 3 the result was written but there is no eligible design (or no pick);
2 the input was rejected or the plan refused (an error envelope is printed to stderr); 5 M4 could not be reached (retryable);
1 unexpected failure.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from cocoon_contracts.materials import MaterialSnapshot
from cocoon_contracts.requirements import RequirementsContract

from design_generator import GenerationError, RequirementError, UserGeometryError
from optimization import (
    EvaluatorUnavailableError,
    OptimizationError,
    OptimizationSettings,
    PerturbationSpec,
    optimize,
    to_error_envelope,
)
from optimization.ranking import PICKS

STAND_IN_BANNER = ("DEVELOPMENT ONLY: the stand-in M4 / M7 engines were used. These numbers are NOT verified by the real RC engine "
                   "and must not be presented as validated results.")


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _screening_settings(args, predictor):
    """ScreeningSettings from the command line, else the predictor's own recommendation, else None (the M6 defaults)."""
    from optimization.screening import ScreeningSettings
    rec = dict(getattr(predictor, "recommended_screening", None) or {})
    if args.screening_dimensions:
        rec["dimensions"] = tuple(d.strip() for d in args.screening_dimensions.split(",") if d.strip())
    if args.screening_margin is not None:
        rec["safety_margin"] = args.screening_margin
    if args.shortlist_size is not None:
        rec["shortlist_size"] = None if args.shortlist_size == 0 else args.shortlist_size
    if args.min_shortlist is not None:
        rec["min_shortlist"] = args.min_shortlist
    if not rec:
        return None
    if "dimensions" in rec:
        rec["dimensions"] = tuple(rec["dimensions"])
    if rec.get("shortlist_size", 1) is None and "min_shortlist" not in rec:
        rec["min_shortlist"] = 0
    return ScreeningSettings(**rec)


def _factory(spec: str):
    module, _, attr = spec.partition(":")
    if not module or not attr:
        raise ValueError(f"'{spec}' is not 'module:factory'")
    return getattr(importlib.import_module(module), attr)


def _standin_evaluator(materials: MaterialSnapshot, weather_id: str, mean_c: float):
    from optimization.tests.standins import StandInEvaluator, make_winter_weather      # development stand-in, clearly labelled

    return StandInEvaluator(materials, {weather_id: make_winter_weather(weather_id, days=14, mean_c=mean_c)})


def _standin_economics(materials: MaterialSnapshot, requirements: RequirementsContract):
    from optimization.tests.standins import StandInEconomics, default_assumptions

    set_id = requirements.economic_assumption_set_id
    return StandInEconomics(materials, {set_id: default_assumptions(set_id)})


def _table(result) -> list[str]:
    lines = []
    width = max(len(n) for n in PICKS)
    for name in PICKS:
        p = result.pick(name)
        if p.status != "selected":
            lines.append(f"  {name:<{width}}  unavailable: {p.reason}")
            continue
        o = result.outcome(p.design_id)
        bits = [f"{o.objectives.get('unmet_hours', float('nan')):g} unmet h", f"{o.objectives.get('heating_energy_kwh', float('nan')):,.0f} kWh"]
        if o.objectives.get("lcc_inr") is not None:
            bits.append(f"LCC {o.objectives['lcc_inr']:,.0f} INR")
        if o.heater_capacity_kw is not None:
            bits.append(f"heaters {o.heater_capacity_kw:g} kW each")
        lines.append(f"  {name:<{width}}  {p.design_id}  " + ", ".join(bits) + ("  [breaks the unmet-hours limit]" if p.flagged else ""))
    return lines


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m optimization", description=__doc__.split("\n\n")[0])
    ap.add_argument("--requirements", required=True, help="RequirementsContract JSON")
    ap.add_argument("--materials", required=True, help="MaterialSnapshot JSON")
    ap.add_argument("--weather-id", required=True, help="weather snapshot id (wx_...) the evaluator will use")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--count", type=int, default=20, help="how many designs M2 should generate")
    ap.add_argument("--evaluator", default="standin", help="'standin' or module:factory (see --help text)")
    ap.add_argument("--economics", default="standin", help="'standin', 'none' or module:factory")
    ap.add_argument("--standin-mean-c", type=float, default=-35.0, help="mean winter temperature of the stand-in weather")
    ap.add_argument("--predictor", default=None, help="module:factory of an M5 predictor (default: none, every design goes to M4)")
    ap.add_argument("--screening-dimensions", default=None, help="comma-separated screening dimensions")
    ap.add_argument("--screening-margin", type=float, default=None, help="safety margin of the screening (fraction of each dimension's range)")
    ap.add_argument("--shortlist-size", type=int, default=None, help="cap on the designs M5 sends to M4 (0 = no cap)")
    ap.add_argument("--min-shortlist", type=int, default=None, help="at least this many ML-screened designs go to M4")
    ap.add_argument("--ground-temperature", default=None, help="'none' or a number (deg C) for every verification run; default: the M6 setting (-10)")
    ap.add_argument("--no-reliability", action="store_true", help="skip the perturbation tests")
    ap.add_argument("--reliability-trials", type=int, default=0, help="seeded Monte-Carlo combinations on top of the one-at-a-time cases")
    ap.add_argument("--reliability-max-designs", type=int, default=8)
    ap.add_argument("--max-runs", type=int, default=None, help="refuse a plan that needs more simulator runs than this")
    ap.add_argument("--created-at", default=None, help="ISO-8601 timestamp with zone, for reproducible files")
    ap.add_argument("--omit-timings", action="store_true", help="leave wall-clock timings out of result.json (reproducible file)")
    args = ap.parse_args(argv)

    try:
        created_at = datetime.fromisoformat(args.created_at) if args.created_at else None
        if created_at is not None and created_at.tzinfo is None:
            raise ValueError("--created-at needs a timezone, e.g. 2026-01-01T00:00:00+00:00")
        requirements = RequirementsContract.model_validate(_load(args.requirements))
        materials = MaterialSnapshot.model_validate(_load(args.materials))

        evaluator = (_standin_evaluator(materials, args.weather_id, args.standin_mean_c) if args.evaluator == "standin"
                     else _factory(args.evaluator)(materials, args.weather_id))
        economics: Any = (None if args.economics == "none" else _standin_economics(materials, requirements) if args.economics == "standin"
                          else _factory(args.economics)(materials, requirements))
        predictor = _factory(args.predictor)(materials, requirements) if args.predictor else None
        screening = _screening_settings(args, predictor)
        verification = {}
        if args.ground_temperature is not None:
            verification["ground_temperature_c"] = None if args.ground_temperature.lower() == "none" else float(args.ground_temperature)
        settings = OptimizationSettings(
            reliability=None if args.no_reliability else PerturbationSpec(monte_carlo_trials=args.reliability_trials),
            reliability_max_designs=args.reliability_max_designs, max_runs=args.max_runs, screening=screening, verification=verification)

        result = optimize(requirements, materials, evaluator, economics, weather_snapshot_id=args.weather_id, seed=args.seed,
                          count=args.count, created_at=created_at, settings=settings, predictor=predictor)
    except EvaluatorUnavailableError as exc:
        print(json.dumps(to_error_envelope(exc).model_dump(mode="json"), indent=2), file=sys.stderr)
        return 5
    except (RequirementError, GenerationError, UserGeometryError, OptimizationError, ValidationError, ValueError, KeyError, OSError,
            ImportError, AttributeError) as exc:
        print(json.dumps(to_error_envelope(exc).model_dump(mode="json"), indent=2), file=sys.stderr)
        return 2

    out = Path(args.out)
    data = result.to_dict()
    if args.omit_timings:
        data.pop("timings_s", None)
    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps(data, indent=2, sort_keys=True, default=str), encoding="utf-8")
    for design_id in dict.fromkeys(result.pick(n).design_id for n in PICKS if result.pick(n).design_id):
        target = out / "picks" / f"{design_id}.building.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result.candidate(design_id).building.model_dump(mode="json"), indent=2, sort_keys=True, default=str),
                          encoding="utf-8")

    if result.development_only:
        print(STAND_IN_BANNER)
    g = result.generation
    print(f"{g.generated} of {g.requested} designs generated; outcomes: " + ", ".join(f"{k} {v}" for k, v in result.summary().items() if k != "generated"))
    print(f"simulator runs: {result.runs['verification']} verification + {result.runs['reliability']} reliability")
    print("recommended:")
    for line in _table(result):
        print(line)
    for w in result.warnings:
        print("warning:", w)
    print(f"-> {out / 'result.json'}")
    best = result.recommended
    return 0 if best.status == "selected" and not best.flagged else 3


if __name__ == "__main__":
    sys.exit(main())
