"""
run_optimization.py

One entry point for the COCOON shelter-design optimization pipeline:

    1. generate N random valid shelter designs   (scenario_generator.py)
    2. run the Python RC thermal engine on each  (design_ranker.py)
    3. rank by mean indoor temperature, print the winner + alternatives,
       write results/optimization_results.csv and the winner's hourly
       series to results/best_design_timeseries.csv

Usage:
    python run_optimization.py --designs 50
    python run_optimization.py --designs 40 --hours 48 --seed 1
"""

import argparse
import sys

from scenario_generator import ScenarioGenerator
from design_ranker import DesignRanker


def main():
    parser = argparse.ArgumentParser(
        description="COCOON shelter design optimization pipeline"
    )
    parser.add_argument("--designs", type=int, default=50,
                        help="number of random designs to generate (default 50)")
    parser.add_argument("--hours", type=int, default=72,
                        help="weather window length in hours (default 72)")
    parser.add_argument("--seed", type=int, default=0,
                        help="random seed for a reproducible design pool")
    parser.add_argument("--weather", type=str,
                        default="thermal-calculator/data/weather_data.csv",
                        help="weather CSV path")
    parser.add_argument("--ratios", type=str,
                        default="shelter_ratios_recommended.csv",
                        help="design-ratio constraints CSV")
    parser.add_argument("--elements", type=str,
                        default="shelter_elements_dimensions__1_.csv",
                        help="element material/dimension options CSV")
    parser.add_argument("--output", type=str,
                        default="results/optimization_results.csv",
                        help="ranking output CSV path")
    parser.add_argument("--top", type=int, default=5,
                        help="how many designs to list (default 5)")

    args = parser.parse_args()

    line = "=" * 80
    print("\n" + line)
    print("COCOON SHELTER DESIGN OPTIMIZATION".center(80))
    print(line)

    # --- Step 1: generate ----------------------------------------
    print(f"\n[step 1] generating {args.designs} random shelter designs")
    print(f"         ratios   : {args.ratios}")
    print(f"         elements : {args.elements}")
    try:
        gen = ScenarioGenerator(args.ratios, args.elements, seed=args.seed)
        candidates = gen.generate_candidates(num_designs=args.designs)
    except Exception as exc:                               # noqa: BLE001
        print(f"[fatal] scenario generation failed: {exc}")
        return 1

    if not candidates:
        print("[fatal] no candidate designs were generated")
        return 1

    # --- Step 2: evaluate --------------------------------------
    print(f"\n[step 2] evaluating thermal performance")
    print(f"         weather  : {args.weather}  (target {args.hours} h)")
    try:
        ranker = DesignRanker(args.weather, target_hours=args.hours)
        ranked = ranker.evaluate_all(candidates)
    except Exception as exc:                               # noqa: BLE001
        print(f"[fatal] evaluation failed: {exc}")
        return 1

    # --- Step 3: report ---------------------------------------
    print(f"\n[step 3] results")
    ranker.display_results(ranked, top_n=args.top)
    ranker.save_results(ranked, args.output)
    if ranked:
        ranker.save_best_timeseries(ranked[0])

    print("[done] pipeline complete")
    print(
        "\nThis is a screening pass. Before trusting a single winner, run:\n"
        "  python optimizer_reliability.py --designs %d --seed %d\n"
        "  (weight-sensitivity, real worst-case weather, Pareto front, logistics)\n"
        "then cross-check the shortlist with validate_top_designs_ansys.py."
        % (args.designs, args.seed)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
