"""
python -m cocoon_pipeline --requirements requirements.json [--count 20] [--seed 42] [--site leh] [--out DIR] [--ansys]

Runs the real M3 -> M2 -> M4 -> M7 -> M6 chain and prints the four named picks and the per-stage timings.
Exit codes: 0 ok, 2 the input was rejected (a PRD 16.6 error envelope goes to stderr), 1 unexpected failure.
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path

from cocoon_pipeline.config import ANSYS_NOT_REQUESTED, ANSYS_SUBMIT, PipelineConfig
from cocoon_pipeline.runner import run_pipeline


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="cocoon_pipeline", description=__doc__.split("\n\n")[0])
    ap.add_argument("--requirements", required=True, type=Path, help="RequirementsContract JSON")
    ap.add_argument("--count", type=int, default=20)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--site", default=None, help="cached weather site key; default: nearest to the requirements' coordinates")
    ap.add_argument("--out", type=Path, default=None, help="write result.json and candidates/ into this folder")
    ap.add_argument("--ml", choices=("auto", "on", "off"), default="auto", help="M5 screening (auto: only for 60+ designs)")
    ap.add_argument("--ansys", action="store_true", help="solve the recommended design in ANSYS (a few minutes) and compare with M4")
    args = ap.parse_args(argv)

    from optimization import to_error_envelope
    try:
        requirements = json.loads(args.requirements.read_text(encoding="utf-8"))
        cfg = PipelineConfig(seed=args.seed, count=args.count, site=args.site, persist=args.out is not None, use_ml=args.ml,
                             run_id=args.out.name if args.out else None, runs_dir=args.out.parent if args.out else None,
                             ansys=ANSYS_SUBMIT if args.ansys else ANSYS_NOT_REQUESTED, ansys_wait=args.ansys)
        res = run_pipeline(requirements, cfg)
    except Exception as exc:                                        # noqa: BLE001
        try:
            print(to_error_envelope(exc).model_dump_json(indent=1), file=sys.stderr)
            return 2
        except Exception:                                           # noqa: BLE001
            traceback.print_exc()
            return 1

    opt = res.optimization
    print(f"site: {res.site_used['location_name']} ({res.site_used['chosen']}), weather {res.weather_snapshot_id}")
    print(f"designs: {opt.summary()}")
    print(f"ml: {res.final_report['provenance']['ml'] if res.final_report else 'n/a'}")
    for name, pick in opt.ranking.picks.items():
        print(f"  {name:15s} {pick.status:11s} {pick.design_id or '-':40s} {pick.reason}")
    print(f"recommended: {res.recommended_design_id}   validation: {res.validation['state']}")
    for w in res.warnings:
        print(f"warning: {w}")
    print("timings_s:", json.dumps(res.timings_s))
    if args.out:
        print(f"written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
