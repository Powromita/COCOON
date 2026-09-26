# m4_engine — COCOON Module M4 (multi-zone RC physics)

PRD v4 section 10. Turns a frozen M0 `BuildingModel` + `WeatherSnapshot` + job settings into an M0 `SimulationResult`.
It imports only `cocoon_contracts`, `numpy` and the standard library. It does **not** import the legacy single-zone
engine (`thermal-calculator/thermal_model.py`), M6, or any other module (a test enforces the M7 equivalent; M4's
job is duck-typed so M6 can call it without either importing the other).

```python
from m4_engine import M4Evaluator, EngineOptions
ev = M4Evaluator(material_snapshot, weather_provider)      # provider: dict or callable  snapshot_id -> WeatherSnapshot
result = ev.simulate(job)                                  # -> cocoon_contracts.SimulationResult
```

`M4Evaluator` satisfies M6's `Evaluator` interface (`optimization/rc_verification.py`), declares
`supported_perturbations = {infiltration, weather, conductivity, internal_gains, door_usage}`, and is deterministic.

## Model

| Part | How |
|---|---|
| Graph | One node per zone; the same code path for 1 room, an airlock, or several floors. Paired internal surfaces are one edge. |
| Conduction | `G = U x A`. The assembly's own `u_value_w_m2k` wins (M2 sets it; M6's conductivity tests rescale it); otherwise it is computed from the layers and films. Openings use their own U and net area is deducted from the parent. |
| Ground / roof | Only surfaces the model marks `ground` exchange with the ground; only `outdoors` surfaces see the weather. |
| Capacitance | air + contents (40 kJ/K per m2 floor) + construction mass counted from the inside outward to 100 mm or the first insulating layer (ISO 13790 style). |
| Exterior film | `h_out = 5.7 + 3.8 v` W/m2K (Juerges/McAdams), clipped to 5.7-25; leeward faces get half the wind speed when wind direction is present. |
| Solar | Directional plane-of-array for any azimuth/tilt (Spencer sun position, measured DNI/DHI else Erbs split, isotropic sky, ground albedo). Windows: `POA x A x (1-frame) x SHGC x shading`. Opaque: sol-air (absorptivity x POA), no double counting. |
| Long-wave | Sol-air term with Martin-Berdahl sky emissivity from dew point (clear sky when cloud cover is missing; option to disable). |
| Infiltration | `rho cp ACH V / 3600`, air density corrected for elevation. |
| Doors / stairs | Open-door and open-stair buoyant exchange (Brown & Solvason). **Empirical**: events/h x duration -> open fraction, discharge coefficient 0.6-0.65. Door leaves also conduct. |
| Gains | Occupants (75 W sensible each, editable) and equipment, from `BuildingModel.schedules`. |
| Solver | Backward Euler, all zones solved simultaneously, non-linear door/stair conductances lagged one step. |
| HVAC | free-floating; ideal-load (heated zones pinned at the setpoint when they would fall below it, heating only); capacity-limited (per-heater cap; a capped zone floats and shows unmet hours). |
| Residual | Stored energy vs the sum of boundary flows each step (inter-zone flows excluded, so an unbalanced exchange would show). Verifies the solve and bookkeeping, not the model physics. Measured about 1e-12 %. |

Every assumption not carried by the M0 contracts is in `EngineOptions` (`options.py`), each marked PLACEHOLDER where it
is one. Setpoint, heater capacity and air changes per hour arrive on the job (the M0 `SimulationRequest` cannot carry
them; this is an open M0 question that M6 already documents).

## Tests (`python -m pytest m4_engine/tests`, 26)

PRD 10.15: energy residual at round-off; zero temperature difference gives zero flow; a hand-solved two-zone steady
state; more insulation, higher setpoint, more infiltration, colder ground, stronger wind and door events each move
heating demand the right way; halving the timestep converges; capacity limit is never exceeded and a bigger heater
cannot increase unmet hours; the ground/roof rules; directional solar (east peaks in the morning, west in the
afternoon); 360-degree rotation is a no-op while a 90-degree rotation changes solar; long-wave loss; determinism;
weather that does not cover the window is refused.

## Measured agreement with ANSYS (M8 evidence, same frozen scenarios)

`cocoon_pipeline.ansys_stage.compare_m4_with_ansys` runs M4 on the *frozen package* ANSYS was given (never the other
way round) with the exclusions ANSYS also applies: no infiltration, door or stair airflow, and no opaque solar or
long-wave (`opaque_absorptivity_override = 0`). Zone-air temperature, 48 h free-floating, pooled:

| Evidence case | MAE | max abs | bias (ANSYS - M4) |
|---|---|---|---|
| 02 insulated single room | 0.24 C | 0.60 C | +0.24 C |
| 04 two-floor, three zones | 0.60 C | 1.56 C | +0.12 C |
| 01 uninsulated stone single room | 1.90 C | 3.65 C | -1.75 C |
| 03 airlock + living | 3.15 C | 6.51 C | +3.15 C |
| pipeline winner (M2 design `des_53b4177cf49f`, real ANSYS run) | 6.42 C | 19.3 C | +6.42 C |

An earlier version of this table showed case 01 at 4.3 C. That was a flaw in the comparison, not in the model: M4 was
still absorbing sun on opaque walls while ANSYS was not. It is fixed and the table above is the re-measured one.

**Open finding.** The two highly insulated, high-gain designs (case 03 and the pipeline winner) run warmer in ANSYS than
in M4. Switching M4's window/door conduction off moves the winner's bias from +6.4 C to -1.4 C, so the engines disagree
mainly about heat lost through openings: M4 applies each opening's contract U-value (an overall value, films included)
times its area; ANSYS loses much less through them. Which is right needs checking against the M8 opening geometry
(possible double-counted films or a solar-aperture simplification, see `ansys-pipeline/VALIDATION_FINDINGS.md`).
Until resolved, treat M4's heating demand as possibly pessimistic for designs with large opening areas, and read
`VALIDATED_BY_ANSYS` as "ANSYS ran for this revision" together with the agreement figures the pipeline prints, not as
agreement in itself. Case 01 also carries the single-node limit M8 documented (all wall mass lumped into the air node).
These numbers describe those exact revisions only (PRD 14.10).

## Not modelled

Two-node air/mass coupling; window incidence-angle modifiers; terrain shading; wind- or stack-driven infiltration;
moisture; airflow inside a zone. Cooling is not modelled (heating only), so overheating shows as high temperatures.
