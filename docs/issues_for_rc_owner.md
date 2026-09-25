# RC network model — issues found during integration

**To:** the author of commit `6223abd` ("Add RC network model (multi-room/multi-storey) with Open-Meteo weather, Kusuda ground model…")
**From:** Person 2 (weather, materials, environmental physics), branch `person2-environment`
**Status:** review notes only. **No file from `6223abd` has been changed.**

Every Person-2 fix below will land in `thermal-calculator/environment/`, behind the `physics_level` / `physics_features` flag, so the RC model's default output doesn't change unless you opt in. Where a fix needs a hook inside your files, I'll send it to you as a small, clearly marked proposal rather than editing them myself.

Line numbers refer to `6223abd` as merged into `person2-environment` (merge commit `d129454`).

## Summary

| # | Issue | Severity | Addressed by (Person 2) |
|---|---|---|---|
| 1 | Sun position evaluated 30 min after the re-timed radiation | **High** (E/W windows) | Phase 2 (measure), Phase 3–4 (fix, flagged) |
| 2 | Open-Meteo DNI/DHI fetched but ignored (GHI re-split with Erbs) | Medium | Phase 2 (columns), Phase 4 |
| 3 | ρ_air = 1.2 kg/m³ hard-coded at 3,500 m | **High** (ventilation loss) | Phase 7 |
| 4 | Elevation-correction guard relies on `DataFrame.attrs` | Medium (latent) | Phase 2 |
| 5 | No offline / bundled weather; forecast never cached | **High** (demo risk) | Phase 2 |
| 6 | No sky longwave, no solar on opaque walls/roof, constant h_in/h_out | High (physics gap) | Phases 4, 5, 6 |
| 7 | `EFFECTIVE_MASS_FRACTION = 0.5` vs legacy position weighting | Note | Person 1's decision |
| 8 | Sign convention opposite to the legacy model | Medium (integration) | Phase 10 (docs, adapters) |
| 9 | No tests for the new modules | Medium | Phase 2 adds the first RC golden; the rest needs the owner |

---

## 1. Sun position is 30 min late relative to the radiation it is paired with

- **Where:**
  - `thermal-calculator/weather.py:238` `_retime_hour_averages`, applied at `weather.py:339`. It turns Open-Meteo's hour-ending averages (value at H = mean of H−1…H) into an estimate **at the instant H**, as the module docstring says.
  - `thermal-calculator/solar.py:56` `_solar_hour` then evaluates the sun at `clock = ts.hour + ts.minute/60 + 0.5`, i.e. at **H + 0.5 h**.
  - `rc_main.py:232-233` passes `time_standard="standard"`, so the +0.5 h shift applies to Open-Meteo data.
- **What's wrong:** two separate half-hour conventions are both applied. Either one alone would be consistent (hour-average paired with mid-hour sun, *or* instant value paired with the sun at H), but together the sun runs 30 min behind the radiation.
- **Measured impact:** I ran `solar.plane_of_window_irradiance` as-is against the aligned case. The setup was Leh (34.15 N, 77.58 E), a synthetic clear-sky GHI (Haurwitz) defined at instant H, current code vs timestamps shifted −30 min.

  | Day | Window | Daily POA, current | Aligned | Difference | Max hourly difference |
  |---|---|---|---|---|---|
  | 15 Jan | east | 1381 Wh/m² | 2098 | **−34%** | 225 W/m² |
  | 15 Jan | west | 3009 | 2086 | **+44%** | 452 W/m² |
  | 15 Jan | south | 5059 | 5008 | +1% | 247 W/m² |
  | 15 Jun | east | 3512 | 4734 | −26% | 300 W/m² |
  | 15 Jun | west | 5942 | 4674 | +27% | 445 W/m² |

  South windows are barely affected on a daily basis, but east/west gains are badly skewed, and the error shows up in afternoon temperatures. These numbers use idealised clear-sky data; Phase 2 repeats the check on real Open-Meteo and NASA data.
- **Suggested fix (pick one):**
  - (a) Drop the re-timing and keep Open-Meteo's native hour-ending averages. Evaluate the sun at the middle of the averaging interval, **H − 0.5 h**, because Open-Meteo labels the *end* of the hour.
  - (b) Keep the re-timing and remove the `+ 0.5` for re-timed data.
  - Option (a) is closer to the source data. Either way, the offset should be an explicit per-source `time_offset_h` rather than two implicit conventions.
- **Person 2 phase:** Phase 2 measures the offset per source (Open-Meteo, NASA) and stores `time_offset_h` in source metadata. Phases 3–4 provide a vectorised, tested sun-position/POA module that the RC path can use behind `enhanced_solar`.

## 2. DNI and DHI are downloaded but not used

- **Where:** `weather.py:64-65` requests `diffuse_radiation` and `direct_normal_irradiance`, which land in the columns `diffuse_radiation_W_m2` and `dni_W_m2`. `multiroom_input.py:237-248` `_build_solar_schedule` passes only `solar_radiation_W_m2` (GHI) to `solar.plane_of_window_irradiance`, which re-splits it with the Erbs correlation.
- **What's wrong:** Erbs is an empirical fallback for when only GHI is known. ERA5's own beam/diffuse split is better, especially at high altitude, where clear-sky diffuse fractions are low and Erbs tends to over-predict diffuse.
- **Impact:** not measured yet. The Phase 2 closure check (DHI + DNI·cos Z vs GHI) and the Erbs-vs-ERA5 comparison will quantify it. A related gap: window gain uses SHGC at every incidence angle (no IAM, `multiroom_rc.py` compute_flows), so beam through east/west glazing at grazing angles is overstated.
- **Suggested fix:** use DNI/DHI when present and keep Erbs as the fallback. Apply an incidence-angle modifier (`environment.materials.iam_ashrae`, Phase 1).
- **Person 2 phase:** 2 (columns and closure statistics), 4 (POA from DNI/DHI with IAM, behind `enhanced_solar`).

## 3. Air density fixed at sea-level value

- **Where:** `multiroom_rc.py:194` and `:281` (`rho_air = 1.2`), used in `:220` (conductance) and `:367` (ventilation heat flow), plus `multiroom_input.py:66` `RHO_AIR = 1.2`, used in `:738` (air capacitance). The legacy model has the same value at `thermal_model.py:50`.
- **What's wrong:** at Leh (3,500 m) the standard pressure is about 65.8 kPa. ρ = p/(R·T) gives 0.87 kg/m³ at −10 °C and 0.84 kg/m³ at 0 °C.
- **Impact:** ventilation/infiltration heat loss (and air heat capacity) are overstated by **about 38% at −10 °C** (1.2/0.87) and about 43% at 0 °C. Infiltration is one of the largest loss paths in a small shelter, so this biases indoor temperatures cold.
- **Suggested fix:** `ρ = p(z)/(R_air·T)`, with p from the barometric formula (or Open-Meteo `surface_pressure`, added in Phase 2).
- **Person 2 phase:** 7 (`airflow.air_density_kg_m3`, `infiltration_conductance_W_K`, behind `enhanced_air`). The legacy default stays at 1.2 until the flag is switched on.

## 4. The elevation-correction guard depends on `DataFrame.attrs`

- **Where:** `weather.py:368-377` sets `attrs["elevation_corrected_by"] = "open_meteo_downscaling"`. `weather.py:564-572` `apply_elevation_correction` skips the lapse-rate correction only if that attr survives.
- **What's wrong:** pandas doesn't reliably carry `attrs`. I checked on pandas 3.0.5: `attrs` **are lost** after `pd.concat` with a frame that lacks them, after a CSV round-trip, and after `merge`.
- **Impact:** latent. Today nothing calls `apply_elevation_correction` on Open-Meteo data. But as soon as data is cached as CSV, concatenated (e.g. archive + forecast done outside `fetch_open_meteo_weather`) or merged, the guard silently disappears. Open-Meteo data would then be lapse-corrected **twice**: at 3,500 m vs an ERA5 grid height of a few hundred metres off, that's several kelvin.
- **Suggested fix:** carry the correction state in the data itself (a column such as `elevation_correction_K` / `elevation_corrected_by`) or in an explicit result object returned by the loader, and test that a second correction is a no-op.
- **Person 2 phase:** 2 (loader returns data + metadata explicitly; test for no double correction).

## 5. The RC path can't run offline

- **Where:** `weather.py:52` `CACHE_DIR` = `thermal-calculator/cache/weather/`, which is gitignored (so nothing ships). `weather.py:265` `use_cache = url == OPEN_METEO_ARCHIVE_URL` means forecast responses are never cached. `fetch_monthly_air_climatology_open_meteo` needs 10 years of daily data from the network on first use.
- **Impact:** at a demo without internet, or with Open-Meteo rate-limiting, the RC model and its Kusuda ground temperature fail. The code raises by design, with no synthetic fallback, which is right, but there is no local data to fall back on either.
- **Suggested fix:**
  - A committed offline Leh dataset (ERA5 archive, enough years for typical/worst-case windows and the Kusuda fit).
  - A cache with metadata (endpoint, variables, units, grid/site elevation, schema version).
  - An explicit `allow_network=False` mode that uses only local data and raises a clear error otherwise.
- **Person 2 phase:** 2.

## 6. Physics not yet modelled on the RC path

- **Where:** `multiroom_rc.py` compute_flows (about lines 330–367). The envelope term is `U·A·(T_boundary − T_room)` against **air** temperature. The only solar term is window `A·SHGC·I·shading`. h_in/h_out are fixed at `multiroom_input.py:62-63` (2.5 / 10 W/m²K).
- **Missing:**
  - (a) **Solar absorbed by opaque walls and the roof.** A sol-air temperature or an absorbed flux. It's significant on south walls and roofs at Leh's irradiance levels.
  - (b) **Night-sky longwave loss.** At 3,500 m with dry, clear nights, the effective sky temperature is often 20–30 K below air temperature. The roof loses heat to it continuously.
  - (c) **Wind-dependent exterior convection.** A constant h_out = 10 corresponds to light wind.
- **Impact:** (a) and (b) partly cancel by day but not at night, so night-time roof losses are under-predicted. Magnitudes will be reported per feature in Phase 11 (one-at-a-time toggles).
- **Person 2 phase:** 4 (opaque absorbed flux, sol-air), 5 (h_conv(wind)), 6 (T_sky, net longwave). All go behind flags, and all are delivered as precomputed boundary conditions (Phase 10) so the solver changes stay minimal.

## 7. Capacitance approximation differs from the legacy model (note only)

- **Where:** `multiroom_input.py:75` `EFFECTIVE_MASS_FRACTION = 0.5`: half of every layer's ρcV is coupled to the room air.
- **Legacy equivalent:** `thermal_model.py` weights each layer by `exp(−R_to_interior / 0.8)` (`heat_transfer.position_weight`), calibrated against ANSYS (MAE 0.31 / 0.53 °C for the mass-inside and insulation-inside walls, `ansys-pipeline/VALIDATION_FINDINGS.md`).
- **Why it matters:** the flat 0.5 doesn't care where the insulation sits. A wall with insulation inside gets the same credit as one with insulation outside, which is exactly the case the legacy calibration was built to fix. The two models will therefore disagree on thermal mass for the same wall.
- **Decision:** Person 1's (solver owner), with Person 4 for validation. Person 2 has no change planned. `environment.materials.Construction` already exposes per-layer R and C arrays if a position-aware weight is wanted.

## 8. Sign convention is the opposite of the legacy model

- **Where:** `multiroom_rc.py:13`: "Positive heat flow … means heat entering that room". The legacy `thermal_model.py` reports **losses as positive** (`Q_wall_W`, `Q_total_loss_W`, and `Q_net = gains − Q_loss`, `thermal_model.py:1283-1320`).
- **Impact:** any code that compares or plots Q terms from both models (backend `results.json`, the frontend heat-flow charts, `heat_flow_analysis.py`, ANSYS comparisons) will show sign-flipped bars unless it knows which model produced them. Nothing breaks yet, because the RC model isn't wired into the backend, but it will as soon as it is.
- **Suggested fix:** document the convention in the RC results (e.g. column suffix `_in_W` or a metadata field), and add an adapter that converts to the legacy "positive = loss" view for existing consumers. Tell Person 5 (backend) and Person 6 (frontend).
- **Person 2 phase:** 10 (handoff docs and adapters). No change to your files.

## 9. No automated tests for the new modules

- **Untested:** `multiroom_rc.py`, `multiroom_input.py`, `solar.py`, `ground_model.py`, and the Open-Meteo path in `weather.py`. There are also no tests for `rc_main.py`, which is interactive.
- **Risk:** my Phase 2 moves `weather.py` into `environment/` (behind a shim). Without a reference output, nobody can prove the RC model is unchanged by that or any later refactor.
- **Plan:**
  - Before touching any weather code, Phase 2 **adds an RC golden test**: fixed rooms, surfaces and windows, frozen weather, frozen ground series, run through `run_multiroom_simulation`, outputs stored at 1e-9, following the pattern of the legacy golden.
  - Known-answer unit tests for the solver itself (e.g. a single room with no gains decays exponentially at τ = C/G; two rooms coupled by an adjacent wall conserve energy) are best written by the solver owner. I'm happy to pair on them.
  - HTTP-mocked tests for the Open-Meteo path come in Phase 2.

---

### Contact / next steps
- Each numbered item can become a GitHub issue. Tell me if you'd prefer that to this doc.
- Nothing in this doc changes your code. Any hook I need inside your files will come as a separate proposal for your review.
