# Changelog — design_generator (M2)

## 1.0.0 — first integrated release

New shelter and existing shelter paths, the public interface, the CLI and the fixtures.

### Added
- `generate_designs`, `resolve_user_geometry`, `to_error_envelope` (public interface, `__all__`).
- Requirement parser, 7 topology templates, layout generator, geometry resolver, connection detector,
  constraint checker (18 checks), quantities, candidate generator, existing-shelter path.
- CLI: `python -m design_generator` (generate, or `--existing`).
- Fixtures: `fixtures/existing_shelter_valid.json`, `fixtures/existing_shelter_invalid.json`.

### Contract-facing notes (no M0 contract was changed)
- Every `BuildingModel` is validated against M0 before it is returned. Internal surfaces are reciprocal pairs.
- Air changes per hour, glazing choice and occupant shares are returned in `Candidate.extras` because the contract
  has no field for them.
- Error codes map onto the closed `ErrorCode` list; the specific code is in `details["m2_code"]`.

### Fixed during integration
- Two-room templates made the airlock a strip narrower than its minimum width (about 90 % of attempts failed).
- Small shelters got a footprint narrower than a room's minimum width (about 95 % of attempts failed).
- Windows were skipped on 2.3 m ceilings because of a floating-point comparison.
- The envelope mass limit from the requirements was not carried into the spec; it is now checked.

### Known placeholders
See "Assumptions to review" in README.md. The sizing rules, thickness ranges (PUF widened beyond the project CSV),
door and window numbers, glazing and airtightness values need review before results are quoted.

### Migration
None (first release). To change an assumption, pass `GenerationOptions`, `SizingTable` or `CandidateContext`.
