# ANSYS Validation Pipeline

Independent transient-thermal FEM validation of a shelter design, run with
PyMAPDL against a local ANSYS install (Student edition is fine for the
prototype). This is Stage 4 of the COCOON pipeline (PRD §7): it does **not**
sit in the interactive path — it validates representative cases and produces
the accuracy numbers behind the deck's claim.

## Files

| File | Role |
|---|---|
| `geometry_builder.py` | Builds the multi-layer shelter geometry + mesh in MAPDL from `SHELTER_CONFIG`. |
| `pyansys_runner.py` | Orchestrates one case: geometry → materials → mesh → transient BCs → solve → extract. |
| `comparison.py` | Re-runs the Python physics engine on the same weather window and computes MAE / RMSE / R² vs ANSYS. |

## Run it

```bash
# from ansys-pipeline/, with a Python that has ansys-mapdl-core + pandas + numpy
python pyansys_runner.py --case case_baseline --hours 48 --element-size 0.16
python comparison.py --case case_baseline
```

Outputs land in `results/<case>/`:

- `temperature_series.csv` — indoor air temperature per hour (`T_ansys_C`)
- `contour_frames/*.png` — temperature contour snapshots at 5 representative hours
- `mesh_temperature.json` — downsampled exterior node temps per hour, for the web 3D viewer (PRD §7.5.2)
- `comparison_report.csv` — hour-by-hour Python vs ANSYS, plus a rolled-up row in `results/comparison_report.csv`

## Modeling choices (say these out loud in the pitch)

The ANSYS model represents the **same scenario** as the Python RC model, not a
different one — that is what makes the comparison meaningful (independence
rule, physics architecture doc §9). ANSYS is given only geometry, materials,
h-values and the **weather** boundary; it never sees the physics engine's
predicted indoor temperature.

- **Enclosed box, real areas.** Four walls + roof + floor, each an
  independent multi-layer slab whose inner face exactly covers one face of a
  solid "indoor air" volume. Surface areas match the RC model exactly:
  `A_wall = 2(LH+WH)`, `A_roof = A_floor = LW` (checked at runtime: the
  baseline prints `ext envelope area = 47.0 m²` = 35 + 12).
- **Indoor air** is a solid volume with artificially high conductivity
  (50 W/m·K) so it stays near-isothermal — the FEM equivalent of the RC
  model's single well-mixed indoor node — but carries an honest air thermal
  mass (ρ = 1.2, cₚ = 1005).
- **Inside film.** A 20 mm layer on every envelope element with
  `k = 0.02·h_inside`, so its resistance equals the `1/h_i` term the RC model
  puts in `R_total`. This keeps the two models' total envelope resistance
  aligned.
- **Solar** is applied as a **sol-air temperature** on the exterior film:
  `T_solair = T_out + (η·A_solar·G)/(h_out·A_ext)`. Total radiative+convective
  gain on the envelope equals the RC model's `Q_solar` for that hour, without
  needing per-surface absorptivity the material DB doesn't have yet.
  *(If `SHELTER_CONFIG["solar"]` is left at 0, the baseline is a pure
  heat-loss case — still a valid validation, just not showcasing solar.)*
- **Corners are left as empty adiabatic gaps.** The RC model ignores corner
  thermal bridging entirely, so this makes the two models *more* comparable,
  and keeps meshing cheap on ANSYS Student.
- **Transient:** `ANTYPE,TRANS`, `KBC,1` (hourly-stepped loads, mirroring the
  RC loop's piecewise-constant weather), one load step per weather row,
  initial temperature = `SHELTER_CONFIG["initial_temperature_C"]`.

## Known differences the comparison will surface

- ANSYS resolves the real temperature **gradient through each material**; the
  RC model lumps all envelope mass onto the indoor node. Expect ANSYS to show
  a slightly less damped indoor swing.
- ANSYS captures 3-D conduction near edges; the RC model is purely 1-D
  per surface.

These are the gaps the validation step is meant to quantify — not bugs.
