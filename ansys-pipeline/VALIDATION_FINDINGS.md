> **STATUS.** Fixes, in order: (1) corrected the wall layer order in
> `SHELTER_CONFIG` (stone mass now inside the PUF); (2) gave the RC model
> a position-weighted capacitance (`Rc = 0.8 m²K/W`); (3) reconciled solar
> gain so both pipelines compute it from window area × glazing SHGC and
> inject it into the floor slab; (4) added a real window cut-out +
> glazing to the ANSYS geometry and restored the glazing U-value.
> Validated scope is set out immediately below — the short version is
> **MAE ≈ 0.25 °C for a mass-inside envelope with the window treated as a
> solar aperture, degrading to MAE ≈ 0.87 °C once the window's conductive
> loss is included** (a single-node limitation, not a tuning error). The
> numbers in the body further down are the original pre-fix findings, kept
> for context.

## Validated scope

The RC model is validated against the ANSYS 3D reference only for a
**well-coupled thermal mass** (insulation outside the mass) **and only
while the window is a solar aperture, not a conductive element**. All
figures: 48 h January cold spell, solar on, `Rc = 0.8`.

| Configuration | MAE / max\|err\| vs ANSYS | Status |
|---|---|---|
| **Mass-inside walls, window = solar aperture** (`windows.U_W_m2K = 0`) | **0.25 / 0.63 °C** | **Validated.** |
| **Mass-inside walls, window = solar aperture + conductive glazing** (`U_W_m2K = 2.8`, the current realistic config) | **0.87 / 1.43 °C** | **Outside ±0.8 °C. Documented single-node limit (Step 4).** |
| Insulation-inside walls, solar aperture only | 1.28 / 3.00 °C | **Out of scope.** Documented, not fixed. |
| Insulation-inside walls + conductive glazing | 1.86 / 3.43 °C | **Out of scope.** Both limits stack. |

The defensible claim is **"MAE ≈ 0.25 °C for a mass-inside envelope with
window solar but no window conduction"**, *not* a universal ±0.8 °C
claim, and *not* a claim about a fully realistic shelter.

**Why the conductive window costs ~0.6 °C (Step 4).** The window's
steady-state U·A is correct on both sides (measured: +5.7 W/K vs the RC
model's +6.0). The gap is transient and structural: a window is a
low-resistance bridge from the **indoor air** — which has almost no heat
capacity — straight to outdoors. In ANSYS the air then sits ~1 °C *below*
the surrounding thermal mass (measured: stone surface 9.4 °C, air 8.3 °C
after 12 h). The RC model has only one node, dominated by the envelope
capacitance, so it effectively reports the *mass* temperature and cannot
show the air being pulled down. Result: the RC model over-predicts indoor
**air** temperature by ~0.9 °C whenever a conductive window is present.
Three different ANSYS window treatments (merged to air, edge-inset,
standard interior film) all give MAE 0.87 — the offset is insensitive to
window detail, confirming it is the single-node structure, not a
parameter. The fix is a 2R–2C model (separate air and mass nodes);
deferred.

**Why insulation-inside is out of scope.** Both model corrections assume
the bulk of the envelope mass exchanges heat freely with the indoor air:
the position-weighted capacitance (`Rc = 0.8`) discounts a layer by the
resistance between it and the interior, so behind thick insulation it is
running on a small, uncertain fraction of the real mass; and window solar
goes into that lumped mass in the RC model but into the floor slab in
ANSYS, part of which drains to the 0 °C ground. Re-tuning `Rc` does not
rescue it (best MAE over the whole sweep ~1.1 °C).

**Also still outside validated scope:** seasons other than deep winter,
runs longer than 48 h, and any non-zero `internal_heat_gain_W` (the ANSYS
side supports it but it has not been exercised).

# Validation Findings — case_baseline (48 h, Jan cold spell, no solar)

**Run:** `SHELTER_CONFIG` as committed, weather = `ansys_boundary_conditions.csv`
(48 h, T_out −15 to −1 °C, ground 0 °C, **solar = 0** because
`SHELTER_CONFIG["solar"]` is still `{area_m2: 0, eta_solar: 0}`).

| Metric | Python RC vs ANSYS |
|---|---|
| MAE | **3.75 °C** |
| RMSE | 4.42 °C |
| max \|error\| | 7.15 °C |
| t = 0 agreement | < 0.05 °C |

Both models start together and **diverge monotonically**: after 48 h the RC
model sits at **7.8 °C** while ANSYS is at **0.7 °C** and still falling toward
the analytical steady state (≈ −5 °C, the UA-weighted mix of ambient and
ground). ANSYS is on the physically correct trajectory.

## Why they diverge — this is a physics-model finding, not an ANSYS bug

The RC model computes `C_total = Σ (ρ·cₚ·A·d)` over **every** layer of wall,
roof and floor and lumps all of it onto the single indoor node
(`thermal_model.calculate_total_capacitance`, PRD §3.4). For this config that
is **40.8 MJ/K**, dominated by the 300 mm stone (27 MJ/K).

But in the wall stack the 50 mm PUF (R ≈ 2.0 m²K/W) sits **between the indoor
air and the stone** (layer-list convention: first entry = outermost, so
`[stone, puf]` → stone outside, PUF inside). The stone is therefore thermally
**decoupled** from the interior — it cannot buffer the indoor air on a 48 h
timescale. ANSYS resolves this; the RC model does not, so it credits the
interior with ~4× more usable thermal mass than physically exists and badly
over-predicts thermal stability.

## Actions for the team

1. **RC capacitance needs position-awareness.** Options, cheapest first:
   - discount each layer's capacitance by the fraction of total envelope
     resistance that lies *outboard* of it (a layer behind most of the
     insulation contributes almost nothing);
   - or move to a 2R–2C wall model (one node for the inner leaf, one for the
     outer mass) — a bigger change but the standard fix.
   Until then the deck's **±0.8 °C claim is not supported** — the measured
   MAE is 3.75 °C.
2. **Confirm the layer-order convention.** `geometry_builder.py` treats the
   first list entry as the outermost layer. If the design intent is
   stone-*inside* (mass accessible to the interior, PUF as exterior
   sheathing), flip the `SHELTER_CONFIG` wall list — the ANSYS result and the
   RC error both change a lot.
3. **Set real solar params** in `SHELTER_CONFIG["solar"]` (e.g.
   `area_m2: 6, eta_solar: 0.5`) and re-run, so the validated case actually
   exercises the solar path.
4. Re-run `python comparison.py --case case_baseline` after any of the above;
   `results/comparison_report.csv` is regenerated each time and is the live
   source for the accuracy number.

## What the ANSYS side does correctly (verified this run)

- exterior envelope area computed at runtime = **47.0 m²** = `2(LH+WH) + LW`
  = 35 + 12, matching the RC model's areas exactly
- total envelope resistance aligned with the RC model via the tuned
  inside-film layer (`d/k = 1/h_inside`)
- clean mapped-hex mesh, ~18.7 k nodes, solves in ~7 min on ANSYS Student
- indoor air stays near-isothermal (min/max within ~0.06 °C per hour), i.e. a
  faithful FEM analogue of the RC model's single indoor node

## Resolution

### Step 1 — wall design corrected (`thermal-calculator/config.py`)

The `SHELTER_CONFIG` wall list was `[stone_masonry 300, puf 50]`
(outer → inner), i.e. insulation on the *inside* face with the stone mass
stranded outside it. This was reversed to `[puf 50, stone_masonry 300]`,
matching standard passive-solar practice (mass inside, insulation
outside) and the Ladakh Trombe-wall / SECMOL / LEDeG precedent. ANSYS was
re-run on the new geometry (`case_baseline`); the original design was kept
as `case_insulation_inside` for regression.

The RC model is layer-order-independent, so its prediction did not move —
but ANSYS now shows the stone buffering the interior, and MAE dropped
**3.75 → 0.66 °C** on this step alone.

### Step 2 — position-weighted capacitance (`thermal_model.py` / `heat_transfer.py`)

`calculate_construction_properties` now scales each layer's
`ρ·cₚ·V` by

    weight = exp(−R_layer_to_interior / CAPACITANCE_COUPLING_RESISTANCE_M2K_W)

before adding it to the indoor node, where `R_layer_to_interior` is the
series resistance from the indoor-air node to the layer's mid-plane
(inside film + inboard layers + half the layer itself,
`heat_transfer.resistance_to_interior`). A layer close to the interior
keeps ~full weight; one behind thick insulation is discounted toward
zero. Contents mass is unweighted. The unweighted sum is still available
as `thermal_model.lumped_mass_C_total` and is surfaced as
`lumped_mass_total_J_K`.

`CAPACITANCE_COUPLING_RESISTANCE_M2K_W` is a single named calibration
constant. Sweeping it against **both** ANSYS cases at once
(`validate_weighted_capacitance.py`) — this **no-solar** run:

| model | mass-inside MAE / RMSE | insulation-inside MAE / RMSE |
|---|---|---|
| lumped (unweighted) | 0.66 / 0.80 | 3.75 / 4.42 |
| weighted, Rc = 0.7 | 0.48 / 0.49 | 0.81 / 0.91 |
| **weighted, Rc = 0.8** | **0.31 / 0.31** | **0.53 / 0.62** |
| weighted, Rc = 1.0 | 0.13 / 0.16 | 0.94 / 1.11 |
| weighted, Rc = 2.0 | 0.38 / 0.45 | 2.44 / 2.92 |

(`results/weighted_capacitance_sweep.csv` is regenerated by every run of
the script and now holds the Step 3 solar-on numbers — see that table
below.)

`Rc = 0.8 m²K/W` is the committed default: it is the only value that puts
**both** wall orderings inside the ±0.8 °C target on both MAE and RMSE,
and it restores a positive R² (0.92 / 0.94) because the weighted model now
tracks the ANSYS *trajectory*, not just the endpoint. Physically it is of
the order of the interior surface-film resistance (1/h_inside = 0.4) plus
a light finish layer — the scale below which a layer's mass is "seen" by
the fast indoor node.

### Step 3 — solar gain reconciled and turned on

**Diagnosis.** `main.py` computed `Q_solar = SHGC * window_area * G` via
`heat_transfer.calculate_solar_gain`, with `run_simulation` reading
`config["solar"]["area_m2"]/["eta_solar"]` — which `user_input` fills from
the interactively-entered window area and glazing SHGC. `main.py` never
imports `SHELTER_CONFIG`. The ANSYS pipeline (`pyansys_runner.py`) read
the *same two keys* with the *same formula*, but `SHELTER_CONFIG["solar"]`
was `{0, 0}`, so **every ANSYS run so far (both cases) had exactly zero
solar flux on any surface** and `comparison.py` re-ran the RC model with
zero solar too — the two sides were consistent, both missing solar.

**Reconciliation.**
- New `heat_transfer.resolve_solar_aperture(config)` is the single
  source: `(windows.area_m2, windows.SHGC)`, with the legacy `solar`
  block as fallback only. Both `thermal_model.run_simulation` and
  `pyansys_runner.run_case` call it — same inputs, same `SHGC * area * G`.
- `SHELTER_CONFIG["windows"]` now carries a real 2.5 m² south aperture,
  double glazing (SHGC 0.70). `U_W_m2K` is left `0` on purpose: the ANSYS
  envelope has no window cut-out, so a conductive glazing patch would
  make the RC model lose heat the FEM never does. A `U == 0` glazing is
  treated as a pure solar aperture that does not displace opaque wall
  (`run_simulation`). Adding the conductive window to *both* models is
  deferred.
- **Injection point matters as much as the watts.** The RC model adds
  `Q_solar` to its single lumped node (which carries the envelope mass).
  `pyansys_runner` now injects it as an inward heat flux on the **floor
  slab top face** — where direct-gain solar physically lands, and where
  the stone absorbs it without a surface-temperature runaway. Rejected,
  in order: sol-air bump on the exterior (models opaque-wall absorption,
  underdelivers a transparent aperture — MAE 0.72 / 2.36); heat
  generation in the indoor-air volume (air races many °C ahead of the
  mass — MAE 2.11 / 2.40); flux over all interior faces (the PUF inner
  face of the insulation-inside wall spikes — MAE 0.34 / 2.40).

**Result (Rc held at 0.8, not re-tuned):**

| | mass-inside MAE / RMSE | insulation-inside MAE / RMSE |
|---|---|---|
| Step 2, no solar | 0.31 / 0.31 | 0.53 / 0.62 |
| **Step 3, solar on** | **0.25 / 0.33** | **1.28 / 1.55** |

Solar in the RC model raises the 48 h endpoint by +1.8 °C (mass-inside)
and +4.1 °C (insulation-inside) — the second is large because that design
has ~1/3 the effective capacitance, so the same gain moves it further.

`Rc` sweep, **solar on, no conductive window** (this was the Step 3 state;
`results/weighted_capacitance_sweep.csv` has since been overwritten with
the Step 4 window-on run — see Step 4):

| model | mass-inside MAE / RMSE | insulation-inside MAE / RMSE |
|---|---|---|
| lumped (unweighted) | 0.59 / 0.74 | 2.99 / 3.63 |
| weighted, Rc = 0.5 | 0.45 / 0.51 | 1.25 / 1.44 |
| weighted, Rc = 0.7 | 0.25 / 0.32 | 1.10 / 1.37 |
| **weighted, Rc = 0.8** | **0.25 / 0.33** | **1.28 / 1.55** |
| weighted, Rc = 1.0 | 0.33 / 0.39 | 1.58 / 1.91 |
| weighted, Rc = 2.0 | 0.47 / 0.56 | 2.28 / 2.83 |

**Does solar break the Rc calibration?** For the real (mass-inside)
design, **no** — MAE stays at target (0.25) and the `Rc` sweep still
bottoms out at 0.7–0.8. For insulation-inside, MAE jumps to 1.28 and the
sweep minimum over all `Rc` is ~1.1 — i.e. **re-tuning `Rc` cannot close
it**, so this is not an `Rc` problem. It is the solar-distribution
difference: the RC model spreads window solar across its whole weighted
envelope node, while ANSYS puts it all in the floor slab, part of which
drains straight to the 0 °C ground before it can warm the room. The gap
is only visible on the (rejected) insulation-inside design because of its
small capacitance.

### Step 4 — conductive window added to the ANSYS geometry

`geometry_builder.py` now cuts a real opening in the south wall when the
config carries a glazing with `area_m2 > 0` **and** `U_W_m2K > 0`: a
4-piece frame around a centred, grid-snapped opening (2.0 × 1.25 m =
2.5 m², matching the RC window area), filled by a two-layer window stack
(ISO 6946 interior film + a glazing block) spanning the wall depth, with
the glazing conductivity solved so the whole air-to-air U equals
`windows.U_W_m2K`. The glazing is inset one element inside the opening so
its edges face an adiabatic reveal gap. Because the frame pieces no longer
share full faces, the element size is forced to `WINDOW_ELEMENT_SIZE_M =
0.125` (divides L, W, H and the window rectangle) so NUMMRG still merges
every interface node. `pyansys_runner` also now injects
`internal_heat_gain_W` with the solar gain, and drops the sol-air term for
plain `T_out` convection. `config.py` `windows.U_W_m2K` restored to 2.8
(the `double` glazing profile); a `--reverse-walls` flag was added to
`pyansys_runner` to match `comparison.py`.

**Result (mass-inside, solar on, `Rc` held at 0.8):**

| window model | MAE / RMSE / max\|err\| |
|---|---|
| solar aperture only (`U = 0`) | 0.25 / 0.33 / 0.63 |
| **+ conductive glazing (`U = 2.8`)** | **0.87 / 0.94 / 1.43** |

**Does the validated accuracy survive a conductive window? No — MAE moves
from 0.25 to 0.87, outside ±0.8 °C.** The cause is not tuning:

- Steady-state window U·A is correct on both sides — a static probe (air
  held at 10 °C, outdoors −10 °C) measured the window adding **+5.72 W/K**
  to the ANSYS envelope, versus the RC model's net **+6.0 W/K** (`+7.0`
  window − `0.95` displaced wall).
- The gap is transient and appears from hour 1. A 12 h constant-weather
  probe with the window showed the interior stone surface at **9.36 °C**
  while the indoor air sat at **8.28 °C** — the window drains the
  low-capacity air faster than the film can resupply it from the mass, so
  the air runs ~1 °C below the mass.
- The RC model has a single node, dominated by `C_total` (the envelope
  mass), so it tracks the *mass* temperature and structurally cannot
  represent the air being pulled below it. It therefore over-predicts
  indoor **air** temperature by ~0.9 °C whenever a conductive window is
  present.
- Three ANSYS window treatments (inner face merged to the air; glazing
  edge-inset; standard ISO interior film) **all** give MAE 0.87 — the
  offset does not respond to window detail, which rules out a parameter
  error and points at the single-node structure.

`Rc` was **not** re-tuned for this (the calibration is fine; the
single-node assumption is the limit). The `Rc` sweep *with* the
conductive window (`weighted_capacitance_sweep.csv`) does shift its
optimum down to `Rc ≈ 0.5` (mass-inside MAE 0.38, insulation-inside 0.81):

| model | mass-inside MAE / RMSE | insulation-inside MAE / RMSE |
|---|---|---|
| lumped (unweighted) | 1.61 / 1.72 | 4.75 / 5.12 |
| weighted, Rc = 0.5 | 0.38 / 0.42 | 0.81 / 1.00 |
| weighted, Rc = 0.7 | 0.73 / 0.81 | 1.46 / 1.67 |
| **weighted, Rc = 0.8** | **0.87 / 0.94** | **1.86 / 2.05** |
| weighted, Rc = 1.0 | 1.04 / 1.12 | 2.46 / 2.66 |

but that lower `Rc` is **compensation, not calibration** — it shrinks the
effective capacitance so the single node cools toward the air temperature,
papering over the missing air/mass split with a parameter that means
something else (how far a layer sits behind insulation). It would break
the no-window cases (which want `Rc ≈ 0.7–0.8`). Left at 0.8. The fix is a
2R–2C model with separate air and mass nodes.

### Not done

- **2R–2C RC model** (air node + mass node). This is what both remaining
  gaps need — the conductive-window air/mass split and the
  insulation-inside solar distribution.
- Solar split between floor and interior walls (currently 100 % floor).
- Single 48 h winter window only. Everything above should be re-checked
  against a summer window and a longer run.
