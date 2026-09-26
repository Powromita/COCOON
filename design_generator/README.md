# design_generator — COCOON Module M2

Requirement and layout generator (PRD v4 section 8). It turns mission requirements into feasible, validated
shelter designs, or turns a user-described existing shelter into the same design format. It does **not**
calculate temperatures, costs or rankings: M4, M7 and M6 judge what M2 produces.

- **Version:** 1.0.0 (`layout_generator_v1`)
- **Depends on:** the M0 contracts (`cocoon_contracts`), `numpy`, `pydantic`. No other COCOON module.
- **Scope:** rectangular rooms, one footprint shared by all floors, thermal design only. Not a structural,
  fire, geotechnical or construction design.

## Quick start

```bash
pip install -e packages/packages/contracts/python pytest numpy   # from the repo root

# new shelter: requirements -> candidates
python -m design_generator --requirements packages/packages/contracts/fixtures/valid/requirements_ladakh_30p.json \
  --materials packages/packages/contracts/fixtures/valid/material_snapshot_standard.json \
  --seed 42 --count 20 --out out/ladakh --created-at 2026-01-01T00:00:00+00:00

# existing shelter: user description -> BuildingModel + topology report
python -m design_generator --existing design_generator/fixtures/existing_shelter_valid.json \
  --materials packages/packages/contracts/fixtures/valid/material_snapshot_standard.json --out out/existing

python -m pytest design_generator          # 350 tests
```

Exit codes: `0` ok, `3` fewer candidates than requested (results still written), `2` input rejected (a PRD 16.6
error envelope is printed to stderr), `1` unexpected failure.

## Public interface

Everything else in the package is internal. See `design_generator/__init__.py`.

```python
from design_generator import generate_designs, resolve_user_geometry, to_error_envelope

result = generate_designs(requirements, material_snapshot, seed=42, count=20)   # -> GenerationResult
shelter = resolve_user_geometry(user_description, material_snapshot)            # -> UserGeometryResult
envelope = to_error_envelope(exc)                                               # -> ErrorEnvelope
```

`requirements` is a `RequirementsContract` (or its dict), `material_snapshot` a `MaterialSnapshot`.

**GenerationResult** — `candidates` (valid), `rejected` (every failed attempt with `stage`, `code`, `message`, and for
constraint failures the full `report` and the `building`), `attempts`, `requested`, `complete`, `reasons` (tally),
`max_attempts`. An incomplete result is returned, never raised.

**Candidate** — `building` (`BuildingModel`, `source="generated"`), `quantities`, `report` (all checks passed),
`layout`, `door_placements`, `window_placements`, and `extras`:
`template_id, layout_seed, orientation_deg, glazing, airtightness_class, air_changes_per_hour, wwr_target,
occupants_by_zone, heater_zone_ids, merged_rooms`.

**UserGeometryResult** — `building` (`source="user_defined"`), `quantities`, `report` (advisory), `topology`
(plain-language view to confirm before simulating), placements, `extras`.

Same requirements + snapshot + seed + options give identical designs. `created_at` (default: now) only changes the
timestamp in metadata; `design_id` and `revision_id` are content hashes and do not depend on it.

## How a candidate is made

```
requirements -> parse (Stage 2) -> templates that fit (1) -> per attempt i, own random stream [seed, i]:
  layout (3) -> geometry (4) -> doors + stairs (5) -> orientation -> assemblies -> windows -> schedules
  -> BuildingModel -> 18 checks (6) -> quantities (7) -> keep or record the rejection
```

| File | Role |
|---|---|
| `requirement_parser.py` | requirements -> `GenerationSpec` (room minimums, feasible floor counts, limits) |
| `template_catalog.py`, `templates/*.json` | 7 topology templates; which rooms exist and how they link |
| `layout_generator.py` | places rooms on a footprint (integer 0.1 m grid, seeded), with an independent verifier |
| `geometry_resolver.py` | zones -> contract Floors/Zones/Surfaces (area, azimuth, tilt, vertices, paired internal surfaces) |
| `connection_detector.py` | doors, stair and partition connections, door positions, reachability |
| `constraints.py` | `validate_candidate`: 18 named checks, never raises on a bad candidate |
| `quantities.py` | net areas, opening counts, layer volumes and masses (no prices) |
| `candidate_generator.py` | the orchestrator, assemblies, windows, schedules, rejection ledger, error envelope |
| `existing_shelter.py`, `__main__.py`, `fixtures/` | existing-shelter path, CLI, one valid and one invalid example |

The PRD tree lists the first eight; the last row is the only addition (plus this README, the changelog and fixtures).

## Conventions other modules depend on

- **Frame:** x east, y north, z up, origin at a corner; at `orientation_deg = 180` local axes are compass axes.
  `orientation_deg` is the compass azimuth of the outward normal of the local **south** face. Wall azimuth =
  `(base + orientation_deg - 180) mod 360`, base: south 180, east 90, north 0, west 270. Horizontal surfaces: azimuth 0;
  tilt roof/ceiling 0, wall 90, floor 180.
- **Layers:** `ConstructionAssembly.layers` run **inner -> outer**; insulation is last = outside.
- **Internal surfaces come in reciprocal pairs** (`adjacent_surface_id`), each with equal area. **Count a pair once.**
  Areas are **gross**: doors, windows and stair voids are not subtracted (`quantities.py` does that).
- **Connections** mirror the M0 fixtures: a `partition` connection per pair of rooms that share a wall
  (`is_conditioned` = a door joins them), a `stair` connection per stair. Doors are `Opening`s attached to one side of
  the pair. Slabs between floors get no connection; the paired slab surfaces carry that heat flow.
- **Floor elevation** = level x ceiling height (slab thickness ignored). One ceiling height per building.

## Assumptions to review (all placeholders)

| Assumption | Where | Value |
|---|---|---|
| Room minimum area / width per type | `requirement_parser.DEFAULT_SIZING` | e.g. sleeping 1.2 m2/person, living 0.8, equipment 4 + 0.1/person, airlock 3 m2 |
| Circulation, stair allowance | same | +10 %, 3 m2 on each of the 2 floors it joins |
| Footprint aspect, slack | `layout_generator` | 1.0-1.8 (ratios CSV); 1.00-1.15 over the busiest floor |
| Shared wall for a door | `layout_generator` | >= 1.0 m; room aspect <= 4 |
| Assembly thickness clamps | `constraints.DEFAULT_ASSEMBLY_MM` | wall 250-650, roof 180-450, floor 130-400 mm |
| Layer thickness per material | `candidate_generator.DEFAULT_THICKNESS_MM` | CSV values where a row exists; **PUF widened** (250/250/150 mm) and plywood invented |
| Insulation probability | `GenerationOptions` | wall 0.75, roof 0.75, floor 0.55, partition 0.5 |
| Glazing | `GenerationOptions` | single 5.8/0.86, double 2.8/0.70, triple 1.8/0.55 (U/SHGC); weights 0.12/0.50/0.38 |
| Airtightness | `GenerationOptions` | tight 0.35, standard 0.7, leaky 1.2 air changes per hour |
| Windows | `GenerationOptions` | 1.0-1.4 x 1.2 m, sill 0.9, gap 0.3, glazing target 8-18 %, south-biased |
| Glazing limits | `constraints.WwrBounds` | overall <= 25 %, per orientation <= 30 % |
| Doors | `connection_detector.DoorDefaults` | 0.9 x 2.0 m, U 2.2, entrance 4/h x 10 s, internal 6/h x 8 s |
| Occupants, equipment | `candidate_generator` | occupants split by floor area; equipment 150-400 W constant |
| Support of upper floors | `constraints` | >= 95 % of an upper room sits on rooms below |

Change them through `GenerationOptions` / `SizingTable` / `CandidateContext`, not by editing files.

## Checks (`validate_candidate`)

`contract_valid, zones_do_not_overlap, all_zones_reachable, room_min_area, room_min_dimension,
ceiling_height_in_range, footprint_within_cap, floor_count_allowed, upper_zones_supported, stairs_allocated,
openings_fit_parent_surface, door_boundaries_consistent, internal_surfaces_paired, window_to_wall_ratio,
assembly_materials_in_snapshot, assembly_materials_allowed, assembly_thickness_buildable, envelope_mass_within_limit`

A check that cannot run (no snapshot, no requirements) is listed under `skipped`, never `passed`.

## Error codes

Raised errors carry `.code` and `.details`; `to_error_envelope` maps them onto the closed M0 `ErrorCode` list and keeps
the specific code in `details["m2_code"]`.

| M2 code | Envelope code | Meaning |
|---|---|---|
| `INFEASIBLE_REQUIREMENTS`, `UNKNOWN_ROOM_TYPE`, `INVALID_ROOM_LIST`, `UNSUPPORTED_MODE`, `NO_TEMPLATE_FITS`, `USER_INPUT_INVALID`, `FLOOR_LEVELS_INVALID`, `STAIR_LEVELS_INVALID`, `ENTRANCE_NOT_GROUND_FLOOR` | `VALIDATION_ERROR` | requirements or input cannot be used |
| `NO_FEASIBLE_LAYOUT`, `GEOMETRY_RESOLVE_ERROR`, `DOOR_DOES_NOT_FIT`, `NO_ENTRANCE_WALL`, `OPENINGS_EXCEED_SURFACE`, `OFF_GRID`, `ZONES_OVERLAP`, `STAIR_DOES_NOT_FIT`, `NO_EXTERIOR_WALL_FOR_WINDOW`, `WINDOW_DOES_NOT_FIT` | `ZONE_GEOMETRY_INVALID` | geometry cannot be built |
| `DUPLICATE_ZONE_ID` | `DUPLICATE_ID` | |
| `UNKNOWN_ZONE`, `MISSING_ASSEMBLY` | `MISSING_REFERENCE` | |
| `UNKNOWN_MATERIAL`, `MATERIAL_NOT_IN_SNAPSHOT` | `UNSUPPORTED_MATERIAL` | |

Rejection ledger stages (not raised): `layout`, `geometry`, `connections`, `composition`
(`no_materials_for_<element>`, `assembly_composition_failed`), `contract`, `quantities`, `constraints`
(one tally entry per failed check, e.g. `constraints:envelope_mass_within_limit`), `duplicate`.

## Existing-shelter input

See `fixtures/existing_shelter_valid.json` (valid) and `existing_shelter_invalid.json` (off the 0.1 m grid ->
`OFF_GRID`). Rooms, `doors` (pairs), `stairs`, `windows` (zone + face + size + count), the real `assemblies`
(inner -> outer), optional `occupants`, `heater_zones`, `air_changes_per_hour`. The report is advisory: requirement
checks are skipped and the buildable-thickness limit is off. Problems (no entrance, unreachable rooms, too much
glass, shared wall with no door) are reported in `report` and `topology.notes`, not raised.

## Performance (measured: Python 3.14.2, Windows 11, one core)

| Case | Time |
|---|---|
| Ladakh request, 15 t mass limit, 50 valid candidates (583 attempts, 91 % rejected for weight) | 2.3 s (45 ms per valid candidate) |
| Same, no mass limit, 50 candidates | 0.15 s (3 ms each); 200 candidates 0.7 s |
| Existing shelter, 3 zones, 2 floors | 2 ms |

## Known limits

- Rectangular rooms, guillotine (slicing) layouts; all floors share one L x W footprint.
- Only templates whose floor count the footprint allows are used (for the Ladakh fixture only `two_floor_compact`).
- Candidate variety comes from seeds, orientation, materials, glazing, airtightness and windows; layouts vary within a template.
- Heater capacity and fuel are not chosen here (M6/M7). No prices.
- Windows have positions along a wall but the contract has no field for them; use `window_placements` / `door_placements`.
- Not certified for structure, fire, snow or seismic loads.

## Decisions and questions for other owners

1. **M4** — internal surfaces are paired (count once); connections mirror the fixtures, so conduction can be
   double-counted if both the surface pair and the partition connection are summed; gross areas; the orientation rule above.
2. **M0** — `BuildingModel` has no field for air changes per hour (returned in `extras`); the M0 building fixtures use
   one-sided partitions (fail the pairing check); the Ladakh requirements allow `mat_steel_panel` (not in the snapshot)
   and not `mat_concrete` (in the snapshot); `packages/packages/contracts` is nested one level too deep.
3. **M3** — glazing and thickness values here are stand-ins for the real databases.
4. **M6 / M7** — with a 15 t limit no heavy (stone, concrete) envelope can pass, so candidates have little thermal mass.
   `maximum_capex_inr` and `max_assembly_time_hours` are carried in the spec but not checked here.
5. **Team** — confirm the sizing placeholders above, and whether PUF may exceed the CSV's 120/120/90 mm.
