"""
Command line for M2.

Generate new-shelter candidates:
    python -m design_generator --requirements REQ.json --materials MATERIALS.json --seed 42 --count 20 --out OUT_DIR

Resolve an existing shelter:
    python -m design_generator --existing SHELTER.json --materials MATERIALS.json --out OUT_DIR

Exit codes: 0 ok; 3 generation returned fewer candidates than requested (results still written);
2 the input was rejected (an error envelope is printed to stderr); 1 unexpected failure.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from design_generator import (
    GenerationOptions,
    GenerationError,
    RequirementError,
    UserGeometryError,
    generate_designs,
    resolve_user_geometry,
    to_error_envelope,
)


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True, default=str), encoding="utf-8")


def _placements(items) -> list[dict]:
    return [dataclasses.asdict(p) for p in items]


def _run_generate(args, materials: dict, created_at) -> int:
    options = GenerationOptions(max_attempts=args.max_attempts) if args.max_attempts else None
    result = generate_designs(_load(args.requirements), materials, seed=args.seed, count=args.count,
                              created_at=created_at, options=options)
    out = Path(args.out)
    entries = []
    for c in result.candidates:
        stem = f"{c.index:04d}_{c.building.design_id}"
        _write(out / "candidates" / f"{stem}.building.json", c.building.model_dump(mode="json"))
        _write(out / "candidates" / f"{stem}.details.json", {
            "extras": c.extras, "quantities": c.quantities.to_dict(), "report": c.report.to_dict(),
            "door_placements": _placements(c.door_placements), "window_placements": _placements(c.window_placements)})
        entries.append({"index": c.index, "design_id": c.building.design_id, "revision_id": c.building.revision_id,
                        "template_id": c.extras["template_id"], "file": f"candidates/{stem}.building.json",
                        "envelope_mass_kg": round(sum(m.mass_kg for m in c.quantities.materials), 1)})
    _write(out / "rejected.json", [
        {"index": r.index, "template_id": r.template_id, "stage": r.stage, "code": r.code, "message": r.message,
         "failed_checks": list(r.report.failed_checks) if r.report else []} for r in result.rejected])
    _write(out / "summary.json", {
        "generator_version": "layout_generator_v1", "seed": args.seed, "requested": result.requested,
        "valid": len(result.candidates), "attempts": result.attempts, "max_attempts": result.max_attempts,
        "complete": result.complete, "rejection_reasons": dict(result.reasons), "candidates": entries})
    print(f"{len(result.candidates)} of {result.requested} candidates in {result.attempts} attempts -> {out}")
    if result.reasons:
        print("rejections:", dict(result.reasons))
    return 0 if result.complete else 3


def _run_existing(args, materials: dict, created_at) -> int:
    r = resolve_user_geometry(_load(args.existing), materials, created_at=created_at)
    out = Path(args.out)
    _write(out / "existing.building.json", r.building.model_dump(mode="json"))
    _write(out / "existing.details.json", {
        "extras": r.extras, "quantities": r.quantities.to_dict(), "report": r.report.to_dict(),
        "topology": r.topology.to_dict(), "door_placements": _placements(r.door_placements),
        "window_placements": _placements(r.window_placements)})
    print(f"{r.building.design_id} {r.building.revision_id} (source user_defined) -> {out}")
    print("checks:", "all passed" if r.report.ok else "problems: " + ", ".join(r.report.failed_checks))
    for note in r.topology.notes:
        print("note:", note)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m design_generator", description=__doc__.split("\n\n")[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--requirements", help="RequirementsContract JSON (generate new-shelter candidates)")
    mode.add_argument("--existing", help="existing-shelter description JSON")
    ap.add_argument("--materials", required=True, help="MaterialSnapshot JSON")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--count", type=int, default=20)
    ap.add_argument("--max-attempts", type=int, default=None, help="stop after this many attempts")
    ap.add_argument("--created-at", default=None, help="ISO-8601 timestamp with zone, for reproducible files")
    args = ap.parse_args(argv)

    try:
        created_at = datetime.fromisoformat(args.created_at) if args.created_at else None
        if created_at is not None and created_at.tzinfo is None:
            raise ValueError("--created-at needs a timezone, e.g. 2026-01-01T00:00:00+00:00")
        materials = _load(args.materials)
        return (_run_generate if args.requirements else _run_existing)(args, materials, created_at)
    except (RequirementError, GenerationError, UserGeometryError, ValidationError, ValueError, KeyError, OSError) as exc:
        print(json.dumps(to_error_envelope(exc).model_dump(mode="json"), indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
