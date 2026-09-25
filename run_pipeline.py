"""
run_pipeline.py  --  Stage 11: the spine.

One command from inputs to a single report folder.

    python run_pipeline.py optimize --designs 50            # find + recommend a design
    python run_pipeline.py optimize --designs 50 --ansys    # + FEM cross-check
    python run_pipeline.py single --config my_shelter.json   # evaluate one design

Every run creates runs/<UTC-timestamp>/ and writes ALL artifacts there.
Each stage reads/writes only that folder. Non-critical stage failures
(ANSYS, runner-up features) are logged and the pipeline continues.
"""

import argparse
import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "thermal-calculator"))

RATIOS_CSV = "shelter_ratios_recommended.csv"
ELEMENTS_CSV = "shelter_elements_dimensions__1_.csv"

_SEASONS = {"winter": (12, 1, 2), "summer": (6, 7, 8),
            "spring": (3, 4, 5), "autumn": (9, 10, 11)}


def _new_run_dir():
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rd = ROOT / "runs" / ts
    rd.mkdir(parents=True, exist_ok=True)
    return rd


def _status(rd, stage, ok, note=""):
    p = rd / "PIPELINE_STATUS.json"
    data = json.loads(p.read_text()) if p.exists() else {"stages": []}
    data["stages"].append({"stage": stage, "ok": ok, "note": note})
    p.write_text(json.dumps(data, indent=2))


# ==================================================
# MODES
# ==================================================

def run_optimize(args, rd):
    from weather_archive import (write_windows, load_archive,
                                 typical_window, annual_mean_air_C)
    from scenario_generator import ScenarioGenerator
    from design_ranker import DesignRanker
    from optimizer_reliability import run_reliability
    from recommend import recommend
    from feature_reports import run_feature_reports
    from engine_adapter import simulate, get_materials as _materials
    from report_bundle import build_report
    import shelter_config as sc

    months = _SEASONS[args.season]

    # Stage 1 - weather
    info = write_windows(rd, season_months=months,
                         typical_hours=args.typical_hours,
                         worst_hours=args.worst_hours)
    _status(rd, "1_weather", True, str(info))
    arch = load_archive()
    gmean = info["annual_mean_air_C"]

    # Stage 5 - design pool
    gen = ScenarioGenerator(RATIOS_CSV, ELEMENTS_CSV, seed=args.seed)
    pool = gen.generate_candidates(args.designs)
    gen.save_pool(pool, rd / "designs_pool.json")
    _status(rd, "5_pool", True, f"{len(pool)} designs")

    # Stage 6 - RC ranking on the typical window
    typ = typical_window(arch, months=months, hours=args.typical_hours)
    ranker = DesignRanker(typ, ground_mean_C=gmean, ground_mode="annual_mean")
    evaluated = ranker.evaluate_pool(str(rd / "designs_pool.json"))
    ranker.display_results(evaluated, top_n=5)
    ranker.save_results(evaluated, rd / "optimization_results.csv")
    ranker.save_evaluated(evaluated, rd / "evaluated_typical.json")
    _status(rd, "6_rank", True, f"top {[d['design_id'] for d in evaluated[:5]]}")

    # Stage 7 - reliability
    shortlist = run_reliability(rd, trials=args.trials)
    _status(rd, "7_reliability", True, str(shortlist["shortlist_ids"]))

    # Stage 8 - ANSYS (optional, non-critical)
    if args.ansys:
        try:
            from validate_top_designs_ansys import run_validation
            res = run_validation(rd, hours=args.ansys_hours,
                                 max_designs=args.ansys_designs)
            _status(rd, "8_ansys", res is not None,
                    "ok" if res is not None else "skipped")
        except Exception as exc:                               # noqa: BLE001
            _status(rd, "8_ansys", False, str(exc))
            print(f"[pipeline] ANSYS stage failed (non-critical): {exc}")
    else:
        _status(rd, "8_ansys", None, "not requested")

    # Stage 9 - recommendation
    rec = recommend(rd)
    _status(rd, "9_recommend", True, f"chose {rec['chosen_design_id']}")

    # Stage 4 - feature reports for chosen (+ runner-up)
    dmap = {d["design_id"]: d for d in pool}
    for role, did in (("chosen", rec["chosen_design_id"]),
                      ("runner_up", rec.get("runner_up_id"))):
        if did is None:
            continue
        try:
            cfg = sc.from_design(dmap[did], ground_mode="annual_mean",
                                 ground_C=gmean)
            hourly, props = simulate(cfg, typ, ground_mean_C=gmean)
            run_feature_reports(
                hourly, cfg, rd / "features" / str(did),
                properties=props,
                comfort_spec={"target_C": 18, "band_lo_C": 15, "band_hi_C": 24},
                materials_db=_materials(),
                window_meta={"typical_hours": args.typical_hours,
                             "worst_hours": args.worst_hours},
                run_id=rd.name, mode="optimize")
            _status(rd, f"4_features_{role}", True, str(did))
        except Exception as exc:                               # noqa: BLE001
            _status(rd, f"4_features_{role}", False, str(exc))

    # Stage 10 - report
    report = build_report(rd)
    _status(rd, "10_report", True, report)
    return report


def run_single(args, rd):
    from weather_archive import (write_windows, load_archive,
                                 typical_window, annual_mean_air_C)
    from engine_adapter import simulate, get_materials
    from feature_reports import run_feature_reports
    from report_bundle import build_report
    import shelter_config as sc

    cfg = sc.load(args.config)
    sc.save(cfg, rd / "shelter_config.json")
    comfort_spec = dict(getattr(args, "comfort", None) or
                        {"target_C": 18, "band_lo_C": 15, "band_hi_C": 24})

    info = write_windows(rd, typical_hours=args.typical_hours,
                         worst_hours=args.worst_hours)
    _status(rd, "1_weather", True, str(info))
    arch = load_archive()
    typ = typical_window(arch, hours=args.typical_hours)
    gmean = annual_mean_air_C(arch)

    hourly, props = simulate(cfg, typ, ground_mean_C=gmean)
    hourly.to_csv(rd / "thermal_results.csv", index=False)
    summary = run_feature_reports(
        hourly, cfg, rd / "features" / "single",
        properties=props, comfort_spec=comfort_spec,
        materials_db=get_materials(),
        window_meta={"typical_hours": args.typical_hours,
                     "worst_hours": args.worst_hours,
                     "typical_mean_C": round(float(typ["temperature_C"].mean()), 1),
                     "worst_min_C": None},
        run_id=rd.name, mode="single")
    _status(rd, "4_features", True, "single design")

    cm = summary["comfort"]
    band = "inside" if cm["hours_in_band_pct"] >= 40 else "below"
    justification = (
        f"Free-running, this envelope holds {summary['feature1_temperature']['T_min_C']}"
        f"-{summary['feature1_temperature']['T_max_C']} C indoors over "
        f"{summary['feature1_temperature']['hours']} h ({cm['hours_in_band_pct']}% of hours "
        f"{band} the {cm['band_lo_C']}-{cm['band_hi_C']} C band, "
        f"{cm['frost_free_pct']}% frost-free). Holding the lower edge needs "
        f"~{summary['heating']['demand_kWh_per_day']} kWh/day "
        f"(~{summary['heating']['fuel_litres_per_day']} L/day kerosene)."
    )
    (rd / "recommendation.json").write_text(json.dumps({
        "chosen_design_id": "single", "runner_up_id": None,
        "thermal_tie": False,
        "justification": justification,
        "basis": {"comfort_score": cm["comfort_score"]},
    }, indent=2))
    (rd / "designs_pool.json").write_text(json.dumps([{
        "design_id": "single", "geometry": cfg["geometry"],
        "walls": cfg["walls"], "roof": cfg["roof"], "floor": cfg["floor"],
        "windows": {**cfg["windows"], "count": "-", "type":
                    cfg["windows"].get("glazing_type", "-")},
    }]))
    report = build_report(rd)
    _status(rd, "10_report", True, report)
    return report


# ==================================================
# CLI
# ==================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="mode", required=True)

    o = sub.add_parser("optimize")
    o.add_argument("--designs", type=int, default=50)
    o.add_argument("--season", choices=list(_SEASONS), default="winter")
    o.add_argument("--seed", type=int, default=0)
    o.add_argument("--trials", type=int, default=400)
    o.add_argument("--typical-hours", type=int, default=168)
    o.add_argument("--worst-hours", type=int, default=48)
    o.add_argument("--ansys", action="store_true",
                   help="also run the ANSYS FEM cross-check (slow)")
    o.add_argument("--ansys-hours", type=int, default=24)
    o.add_argument("--ansys-designs", type=int, default=2)

    s = sub.add_parser("single")
    s.add_argument("--config", required=True)
    s.add_argument("--typical-hours", type=int, default=72)
    s.add_argument("--worst-hours", type=int, default=48)

    args = ap.parse_args()
    rd = _new_run_dir()
    (rd / "run_config.json").write_text(json.dumps(vars(args), indent=2))
    print(f"[pipeline] run folder: {rd}\n")

    try:
        report = (run_optimize if args.mode == "optimize" else run_single)(args, rd)
    except Exception:                                          # noqa: BLE001
        _status(rd, "FATAL", False, traceback.format_exc())
        print(traceback.format_exc())
        print(f"[pipeline] FAILED -- see {rd / 'PIPELINE_STATUS.json'}")
        return 1

    print(f"\n[pipeline] done -> {report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
