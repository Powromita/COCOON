# Materials review — Person 2, Phase 1

**Status: for team decision. No k / ρ / cp value in `material_properties.json` has been changed.**
Phase 1 only added `emissivity`, `solar_absorptance` and their citations. Those fields are unused by legacy physics.

Every U/C figure below comes from `environment.materials.layered_construction`, using the project's current film coefficients (h_in = 2.5, h_out = 10 W/m²K).

## References

| Key | Reference |
|---|---|
| [DIN/Lehm] | Dachverband Lehm, *Lehmbau Regeln* (3rd ed., 2009), and DIN 4108-4. These give design λ of earth building materials by dry density. Minke, G., *Building with Earth* (Birkhäuser, 2006), Ch. 2, reproduces the same relation. |
| [BRE-RE] | Walker, P., Keable, R., Martin, J., Maniatidis, V., *Rammed Earth: Design and Construction Guidelines* (BRE Bookshop, 2005) |
| [ISO10456] | ISO 10456:2007, *Building materials and products — Hygrothermal properties — Tabulated design values*, Table 3 |
| [ISO6946] | ISO 6946:2017, *Building components and building elements — Thermal resistance and thermal transmittance* (R_si, R_se, air layers) |
| [CIBSE-A] | CIBSE Guide A: *Environmental Design* (2015), Ch. 3 |
| [ASHRAE] | ASHRAE Handbook — Fundamentals (2021), Ch. 4 (radiation), Ch. 26 (material properties) |
| [Bergman] | Bergman, Lavine, Incropera & DeWitt, *Fundamentals of Heat and Mass Transfer*, 7th ed. (2011), Tables A.3, A.11, A.12 |
| [EN13165] | EN 13165, factory-made rigid polyurethane (PU) products (aged declared λ) |
| [Sturm97] | Sturm, M., Holmgren, J., König, M., Morris, K. (1997), "The thermal conductivity of seasonal snow", *J. Glaciology* 43(143), 26–41 |
| [Warren82] | Warren, S.G. (1982), "Optical properties of snow", *Rev. Geophys.* 20(1), 67–89 |
| [Levinson07] | Levinson, R., Berdahl, P., Akbari, H., et al. (2007), "Methods of creating solar-reflective nonwhite surfaces and their application to residential roofing materials", *Solar Energy Materials & Solar Cells* 91(4), 304–314 |
| [CRRC] | Cool Roof Rating Council, *Rated Products Directory* (measured solar reflectance and thermal emittance of coil-coated metal, ANSI/CRRC S100) |
| [Dozier82] | Dozier, J., Warren, S.G. (1982), "Effect of viewing angle on the infrared brightness temperature of snow", *Water Resources Research* 18(5), 1424–1434 |
| [EnergyPlus] | EnergyPlus *Input Output Reference*, object `Material` (field defaults: Thermal Absorptance 0.9, Solar Absorptance 0.7) |
| [D&B] | Duffie, J.A., Beckman, W.A., *Solar Engineering of Thermal Processes*, 4th ed. (Wiley, 2013) |
| [IS-SP41] | BIS SP 41 (S&T):1987, *Handbook on Functional Requirements of Buildings*. This is the Indian reference for material thermal properties and is recommended for the final table (not yet consulted for this review). |

**Caveat:** values are typical ranges quoted from these sources. Table and figure numbers should be checked against the team's copy of each edition before they appear in the final report.

The earth-material relation used below ([DIN/Lehm]; λ in W/m·K):

| ρ (kg/m³) | 500 | 600 | 700 | 800 | 1000 | 1200 | 1400 | 1600 | 1800 | 2000 |
|---|---|---|---|---|---|---|---|---|---|---|
| λ | 0.14 | 0.17 | 0.21 | 0.25 | 0.35 | 0.47 | 0.59 | 0.73 | 0.91 | 1.1 |

---

## 1. Suspected errors (ranked by impact)

### 1.1 `adobe` — k = 0.13 W/m·K, ρ = 2210 kg/m³ — **HIGH impact**

| | Current | Typical |
|---|---|---|
| k | 0.13 | 0.5–0.9 for sun-dried adobe of ρ 1500–1800 ([DIN/Lehm], [CIBSE-A]) |
| ρ | 2210 | 1500–1900 ([DIN/Lehm], [BRE-RE]) |
| cp | 1000 | ~1000 ([ISO10456]; earth materials) |

- **The pair is internally inconsistent.** Earth at ρ = 2210 has λ ≈ 1.2–1.3. A λ of 0.13 belongs to light straw-loam at ρ ≈ 450–500. No earth material has both values.
- **Suspected causes, in order of likelihood:**
  - (a) decimal slip, 1.3 → 0.13;
  - (b) the k of a light straw-clay was copied into the adobe row (`wood_timber` also has k = 0.13);
  - (c) the reference quotes a stabilised or compressed block (ρ ≈ 2200) with an unrelated k.
- **Effect on the 600 mm adobe profile** (`construction_profiles.json: adobe_600`):

| Case | U (W/m²K) | C (MJ/m²K) |
|---|---|---|
| current (0.13, 2210) | **0.195** | 1.326 |
| typical sun-dried (0.8, 1700) | 0.800 | 1.020 |
| lighter adobe (0.6, 1500) | 0.667 | 0.900 |
| decimal-slip hypothesis (1.3, 2210) | 1.040 | 1.326 |

- **Net:** today a bare 600 mm adobe wall behaves like ~60 mm of PUF. If corrected, its U rises 3.4–5.3× and C drops up to ~30%.
- **Ranking impact:** adobe-only (uninsulated) designs are currently over-credited. PUF-insulated stone still tops the two archived optimizer runs. The error mainly distorts the "traditional vs modern" comparison, which is a likely judging question.

### 1.2 `rammed_earth` — ρ = 1200 kg/m³ — **MEDIUM impact**

| | Current | Typical |
|---|---|---|
| ρ | 1200 | 1800–2200 ([BRE-RE], [DIN/Lehm]) |
| k | 0.8 | 0.9–1.3 at ρ 1800–2100 ([DIN/Lehm]); 0.8 matches ρ ≈ 1700 |
| cp | 1000 | ~1000 |

- **Suspected cause:** ρ mistyped. With ρ = 1200, the relation predicts λ ≈ 0.47, so k = 0.8 already implies a denser material. The k and ρ come from different sources or different densities.
- **Effect on 500 mm** (`rammed_earth_500`):

| Case | U | C (MJ/m²K) |
|---|---|---|
| current (0.8, 1200) | 0.889 | 0.600 |
| ρ corrected only (0.8, 2000) | 0.889 | 1.000 (+67%) |
| ρ and k corrected (1.1, 2000) | 1.048 | 1.000 |

- **Net:** thermal mass is understated by up to 40%. That matters for the day–night swing, which is rammed earth's main selling point in Ladakh.

### 1.3 `concrete` — k = 1.13, ρ = 1800 — **LOW–MEDIUM, a naming issue**
- These are consistent **medium-density** concrete values ([ISO10456], [CIBSE-A]).
- Ordinary structural concrete is ρ 2300–2400, k 1.6–2.0 ([ISO10456]).
- If the team means ordinary cast concrete, the 200 mm wall goes from U 1.477 to 1.636 and from C 0.363 to 0.464 MJ/m²K.
- **Suggested fix:** rename to `concrete_medium_density`, or correct the values. `reinforced_concrete` (2.3 / 2300 / 1000) matches [ISO10456] for 1% steel.

### 1.4 `puf` — `provisional` — **LOW**
- k = 0.025, ρ = 35, cp = 1400 is within the typical range. [ISO10456] gives cp 1400 for PU. EN 13165 aged λ for gas-blown PU is 0.022–0.028.
- Keep the status as provisional until a supplier datasheet (aged λ_D) is in hand.
- Using a conservative aged λ = 0.028 changes 50 mm PUF from U 0.400 to 0.437 (+9%).
- **α (0.50) is low-confidence.** An exposed PUF face isn't realistic. The scenario generator puts PUF **outermost**, so these walls need an `outer_finish` (render or cladding) before enhanced solar/sky physics is trusted. See §3.

### 1.5 Minor / low priority
- **`stone_masonry` k = 2.3:** right for solid sandstone or limestone ([ISO10456]: sandstone 2.3, granite 2.8). Random-rubble masonry with mud mortar, typical in Ladakh, is likely lower (~1.3–1.8). This is not well sourced yet; ask Person 4 or local data. 300 mm at k = 1.5 gives U 1.429 vs 1.586.
- **`wood_timber` cp = 1500:** [ISO10456] gives 1600 for softwood. Negligible effect.
- **`straw_clay` (0.19 / 660 / 1500):** k matches [DIN/Lehm] for ρ ≈ 650. cp 1500 is plausible for an earth + straw blend. OK.

### 1.6 Not a material value, but it dominates U: surface films
Moved to **§6 Film coefficients (for Person 1 and Person 4)**. In short, the project films halve U for bare mass walls compared with ISO 6946. The decision belongs to Persons 1 and 4, and nothing has been changed.

### 1.7 Glazing — OK
The single (5.8 / 0.86), double (2.8 / 0.70) and triple (1.8 / 0.55) entries match typical clear, air-filled units ([ASHRAE] Ch. 15). Low-e and argon options (U 1.1–1.6 for double, 0.6–0.9 for triple) are absent and would matter in Ladakh.

---

## 2. Radiative properties added (all materials ε = 0.90)

| Material | α_solar | Status | Basis |
|---|---|---|---|
| adobe, rammed_earth, straw_clay | 0.70 | typical_literature | bare earth, range 0.6–0.8 [ASHRAE], [CIBSE-A] |
| stone_masonry | 0.65 | typical_literature | natural stone 0.5–0.8 by colour [ASHRAE], [Bergman] A.12 |
| wood_timber | 0.60 | typical_literature | unpainted timber 0.5–0.75 [ASHRAE] |
| concrete, reinforced_concrete | 0.65 | typical_literature | bare concrete 0.6–0.7 [Bergman] A.12 (~0.60) |
| puf | 0.50 | **estimate_low_confidence** | bare foam 0.4–0.6; should be covered by a finish |

- **ε:** 0.90 for every material, from the non-metallic building-surface range 0.85–0.95 ([Bergman] A.11, [ASHRAE] Ch. 4).
- **Defaults** when a material has no radiative data: α 0.7, ε 0.9, the EnergyPlus `Material` object defaults.

## 3. Outer finishes (`data/surface_finishes.json`)

Absorptance is a property of the **surface finish**, not the bulk material. A whitewashed adobe wall absorbs less than half the sun a bare one does.

`layered_construction(..., outer_finish="lime_whitewash", finishes=load_finishes())` replaces the outermost layer's α and ε with the finish's values. U and C are unchanged, since a finish is treated as radiatively active but thermally negligible.

| Finish | α | ε | Source |
|---|---|---|---|
| mud_plaster | 0.65 | 0.90 | [ASHRAE], [CIBSE-A] |
| lime_whitewash | 0.30 | 0.90 | fresh 0.2–0.3, aged 0.35–0.5 [ASHRAE], [CIBSE-A] |
| white_paint | 0.26 | 0.90 | white acrylic [Bergman] A.12 |
| cement_render_grey | 0.60 | 0.90 | [ASHRAE], [Bergman] A.12 |
| dark_paint | 0.90 | 0.90 | 0.85–0.97 [ASHRAE], [Bergman] A.12 |
| red_brick | 0.70 | 0.90 | 0.63–0.77 [ASHRAE], [CIBSE-A] |
| bare_timber | 0.60 | 0.90 | [ASHRAE] |
| galvanised_steel_new | 0.65 | **0.13** | weathered: α 0.8–0.9, ε 0.2–0.3 [ASHRAE] |
| prepainted_steel_sheet (PPGI) — **default for PUF-outermost walls** | light 0.30 / **medium 0.60** / dark 0.85 | 0.87 | coil-coated steel; ε 0.85–0.90 [Levinson07], [CRRC]. Ids `prepainted_steel_sheet` (= medium), `_light`, `_medium`, `_dark` |
| snow_fresh | 0.15 | 0.98 | albedo 0.8–0.9 [Warren82]; ε 0.97–0.99 [Dozier82] |

**Default for PUF-outermost walls.** The scenario generator puts PUF on the outside. An exposed PUF face isn't buildable, since in practice such walls are PPGI-clad sandwich panels. So when no finish is given and the outermost layer is PUF, `adapters.default_outer_finish` / `construction_from_contract` assign `prepainted_steel_sheet` (medium colour). An explicit `outer_finish` always wins, and non-PUF walls keep their own material's α/ε. This rule lives only in the defaults/adapter layer. The legacy engine never reads finishes, so legacy results are unchanged (golden test).

The contract has no finish field yet. It will be proposed in Phase 10 as an optional per-construction `outer_finish`.

## 4. Proposed additional materials (NOT added to the JSON)

All values are typical design values. Insulation λ must come from the supplier's declared (aged) λ_D in the final design.

| Proposed id | k (W/m·K) | ρ (kg/m³) | cp (J/kg·K) | α | ε | Sources / notes |
|---|---|---|---|---|---|---|
| eps | 0.035–0.040 (use 0.038) | 15–30 (20) | 1450 | 0.4 (bare, white) | 0.9 | [ISO10456] cp; λ per EN 13163 product range |
| xps | 0.030–0.035 (0.034) | 30–40 (35) | 1450 | 0.5 | 0.9 | [ISO10456] cp; EN 13164. Moisture-tolerant, suits below-grade / floor |
| glass_wool | 0.032–0.040 (0.035) | 12–48 (20) | 1030 | — (always covered) | 0.9 | [ISO10456] mineral wool cp; EN 13162 |
| rock_wool | 0.034–0.040 (0.036) | 40–140 (100) | 1030 | — | 0.9 | [ISO10456]; EN 13162 |
| steel_gi_sheet | 50 | 7800 | 450 | 0.65 new / 0.8–0.9 weathered | 0.13 new / 0.2–0.3 weathered | [ISO10456] steel; α/ε [ASHRAE]. Radiative values via finish `galvanised_steel_new` |
| aluminium | 160 (alloy) | 2800 | 880 | 0.1–0.2 bare | 0.05–0.1 bare; ~0.8 anodised | [ISO10456]; [Bergman] A.11/A.12 |
| plywood | 0.13 (ρ 500) – 0.17 (ρ 700) | 500–700 | 1600 | 0.6 | 0.9 | [ISO10456] |
| osb | 0.13 | 650 | 1700 | 0.6 | 0.9 | [ISO10456] |
| cement_plaster | 1.0 | 1800 | 1000 | 0.60 | 0.9 | [ISO10456] cement/sand render |
| mud_plaster | 0.7 (ρ 1600) | 1500–1700 | 1000 | 0.65 | 0.9 | [DIN/Lehm] |
| fired_brick | 0.6–1.0 (0.84 outer leaf) | 1700 | 800 | 0.70 | 0.9 | [CIBSE-A] brickwork; [ISO10456] |
| aac_block | 0.14–0.20 (0.16) | 500–700 (600) | 1000 | 0.6 (rendered) | 0.9 | [ISO10456] aerated concrete; IS 2185-3 density classes |
| sandwich_panel | *composite, not a material* | | | | | Model as 3 layers: 0.5 mm steel + PUF core (50–100 mm) + 0.5 mm steel. An 80 mm core with λ 0.022 gives U = 0.242 with project films (computed). Joints and fixings add ~5–15% ([ISO6946] correction principles). |
| air_gap_unventilated | *use R, not k* | 1.2 | 1005 | — | — | [ISO6946] Table 8 (2017), high-emissivity faces (m²K/W), see below |
| snow | ~0.05–0.1 fresh, 0.1–0.25 settled, 0.3–0.6 wind-packed | 50–200 / 200–350 / 350–500 | 2090 (ice) | 0.1–0.2 fresh, 0.3–0.5 old | 0.97–0.99 | k(ρ) = 0.138 − 1.01ρ + 3.233ρ² (ρ in g/cm³, valid 0.156–0.6) [Sturm97]; α/ε [Warren82]. A roof snow layer is significant insulation. |

**Air-gap R values** ([ISO6946] Table 8, high-emissivity faces, m²K/W):

| Gap | Horizontal heat flow | Upward | Downward |
|---|---|---|---|
| 5 mm | 0.11 | 0.11 | 0.11 |
| 10 mm | 0.15 | 0.15 | 0.15 |
| 25 mm | 0.18 | 0.16 | 0.19 |
| 50 mm | 0.18 | 0.16 | 0.21 |
| 100 mm | 0.18 | 0.16 | 0.22 |
| 300 mm | 0.18 | 0.16 | 0.23 |

**Implementation notes if these are adopted:**
- `air_gap` and `sandwich_panel` need special handling: an R-lookup layer type and a composite profile. They should not be ordinary k/ρ/cp rows.
- `snow` should be a time-varying roof layer, not a construction choice. That is a Phase 8+/team decision.

## 5. Decisions requested from the team
1. adobe: which k and ρ? What is the original reference's value?
2. rammed_earth: correct ρ, and k if the reference supports it.
3. concrete: rename, or change to normal-weight values?
4. PUF-outermost constructions: which default exterior finish (cement render? GI cladding?)?
5. Which proposed materials to add. Suggested priority: xps (floors), mud_plaster, cement_plaster, steel_gi_sheet, eps, aac_block.
6. Surface films (Persons 1 and 4): see §6.
7. Verify the §8 source list against physical copies (any teammate with library access).

---

## 6. Film coefficients (for Person 1 and Person 4)

**Status: information only. The decision belongs to Persons 1 and 4, and nothing has been changed.**

### Where the values live

| Constant | Value | Where |
|---|---|---|
| h_in / h_out, legacy model | 2.5 / 10 W/m²K | `shelter_config.FIXED_ASSUMPTIONS["heat_transfer"]`, `thermal-calculator/config.py`, and every config via the backend `HeatTransfer` model |
| h_in / h_out, RC network model | 2.5 / 10 W/m²K | `thermal-calculator/multiroom_input.py:62-63` (`DEFAULT_H_INSIDE`, `DEFAULT_H_OUTSIDE`). `multiroom_rc.py` itself hard-codes only ρ_air = 1.2 and cp = 1005 |
| ANSYS reference | same h_out; inside film modelled as a solid layer with d/k = 1/h_in | `ansys-pipeline/pyansys_runner.py:93`, `ansys-pipeline/geometry_builder.py:11-12, 45` |
| ISO 6946:2017 design values | R_si = 0.13 m²K/W (horizontal heat flow, h ≈ 7.7), R_se = 0.04 m²K/W (h = 25) | ISO 6946:2017, conventional surface resistances table |

### U-value impact (repo material values; computed with `layered_construction`)

| Wall | Σ d/k (m²K/W) | U, project films 2.5/10 | U, ISO 6946 films | ratio |
|---|---|---|---|---|
| 200 mm `concrete` (k 1.13) | 0.177 | 1.477 | 2.882 | **1.95×** |
| 450 mm `stone_masonry` (k 2.3) | 0.196 | 1.438 | 2.735 | **1.90×** |
| PUF sandwich: 0.5 mm steel + 80 mm `puf` (k 0.025) + 0.5 mm steel | 3.200 | 0.270 | 0.297 | 1.10× |

The steel skins use ISO 10456 steel (k 50). Steel isn't in the repo database, but its resistance (2 × 1e-5 m²K/W) is negligible.

### Reading
- For heavy, uninsulated walls the films make up most of the total resistance: 0.5 of 0.68 m²K/W for 200 mm concrete. The film choice therefore **roughly halves U**, a bigger effect than any material-value question in §1.
- For insulated walls the effect is about 10%.
- **h_in = 2.5 may be deliberate.** It looks like a *convective-only* interior coefficient (ISO's 7.7 includes interior longwave radiation). In a one-node-per-room model with no separate interior surface nodes, a lower h_in partly stands in for that missing radiative coupling. The ANSYS model was also built with the same 1/h_in film, so the RC-vs-ANSYS calibration, including `CAPACITANCE_COUPLING_RESISTANCE_M2K_W = 0.8`, is tied to it. Changing h_in without re-running the ANSYS validation would invalidate that calibration.
- **h_out = 10** is on the low side for Ladakh winds. ISO 6946's 25 assumes about 4 m/s. Phase 5 (Person 2) makes h_out wind-dependent **behind the physics_level flag**, so default results don't change.
- The same constants now appear in **two** models (legacy and RC network). Whatever Persons 1 and 4 decide should be applied to both, or the two models will disagree for this reason alone.

**Decision owners:** Person 1 (both RC solvers) and Person 4 (ANSYS parity). Person 2 has changed nothing.

---

## 7. How to apply a data correction

Correcting a material property (k, ρ, cp, α, ε) is a **physics change**. It shifts every U-value, capacitance, design ranking, ML training row and RC-vs-ANSYS comparison built on it. Follow this procedure.

1. **Decide with a source.** Agree the new value in the team and record its citation (book, edition, table or page, or a supplier datasheet or lab test). If the value is judged rather than read from a table, set `data_status` accordingly (e.g. `team_estimate`).
2. **Separate commit, data only.** One commit changes only `thermal-calculator/data/material_properties.json` (plus the golden files, step 4), with a message such as `data: correct adobe k 0.13 -> 0.8 W/mK (DIN 4108-4 / Lehmbau Regeln, rho 1700)`. Don't mix it with code changes, so it can be reviewed and reverted on its own.
3. **Update the entry's metadata.** Set `data_source` / `property_sources` to the new citation, set `data_status` (or `property_status`), and keep the old value in the commit message.
4. **Regenerate the golden intentionally**, and only with the Person-2 owner's approval: run `python thermal-calculator/tests/make_golden.py` (outputs only; the frozen weather and designs stay as they are). Add a note to `tests/golden/manifest.json` giving the reason, the material, the old and new values, and the commit. Then check that the diff of the golden CSVs is limited to cases that use the corrected material.
5. **Run all tests** (`pytest`). Only the golden files should have changed.
6. **Tell the people affected:**
   - **Person 1**: RC model outputs and U/C tables change in both the legacy and network models.
   - **Person 3**: optimizer rankings may reorder, and the `ml/` training dataset must be regenerated before retraining.
   - **Person 4**: RC-vs-ANSYS comparisons must be re-run. The ANSYS model reads the same material JSON, so both sides move together, but the validation reports become stale.
   - **Person 5**: materials returned by `/reference` and any cached reports change.
7. **Record it** in `docs/CHANGELOG_person2.md` under a "Data corrections" heading.

### Worked example (NOT applied; values unchanged)

| Material | Current | Candidate correction | Golden cases affected | Expected effect |
|---|---|---|---|---|
| `adobe` | k 0.13, ρ 2210 | k 0.8, ρ 1700 (sun-dried adobe, [DIN/Lehm]) | `design03_typical168` (PUF + adobe wall) | 600 mm wall U 0.195 → 0.800 and C −23%. Adobe-only designs lose their "free insulation" |
| `rammed_earth` | ρ 1200 | ρ 2000 (k 0.8 kept unless the reference supports 1.1) | `design07_typical168` | 500 mm wall C 0.60 → 1.00 MJ/m²K, so a smaller daily swing |
| `concrete` | k 1.13, ρ 1800 | either rename to `concrete_medium_density` (no value change; update `construction_profiles.json`, `shelter_elements_dimensions__1_.csv`, the backend `MaterialId` literal and the frontend types together), or change to k 1.8, ρ 2300 ([ISO10456]) | `design02_typical168` (wall), roof/floor of several designs | 200 mm U 1.477 → 1.636, C +28% |

The rename option touches the **contract** (`backend/models.py` `MaterialId`, frontend types). That requires Person 5 and Person 6, so it can't be a data-only commit.

---

## 8. SOURCES TO VERIFY

Every radiative value added in Phase 1, with the reference I believe it comes from. **Page numbers were not available to me.** The chapter/table locators come from memory of these editions and must be checked against physical or library copies. Confidence covers both the value and the locator.

- **high**: standard, widely tabulated value; locator well known
- **medium**: the value is typical, but the exact table or edition entry is unconfirmed
- **low**: an engineering estimate, or the locator is uncertain

### Materials (`material_properties.json`)

| Item | Value | Believed source (book, edition, chapter / table) | Confidence |
|---|---|---|---|
| ε, all 8 materials | 0.90 | Bergman et al., *Fundamentals of Heat and Mass Transfer*, 7th ed. (2011), App. A, Table A.11 (total normal emissivity, non-metallic solids 0.85–0.95); ASHRAE HoF 2021, Ch. 4 (radiation properties table) | value **high**, locator medium |
| α adobe / rammed_earth / straw_clay | 0.70 | ASHRAE HoF 2021, Ch. 4 (solar absorptance of surfaces); CIBSE Guide A 2015, Ch. 3 (absorptivity table). Earth/clay surfaces are not always listed separately; the value is interpolated from brick, clay and "brown" surfaces | **low** |
| α stone_masonry | 0.65 | ASHRAE HoF 2021, Ch. 4; Bergman 2011, Table A.12 (only some stones listed) | medium (value), low (locator) |
| α wood_timber | 0.60 | ASHRAE HoF 2021, Ch. 4 | medium / low |
| α concrete, reinforced_concrete | 0.65 | Bergman 2011, Table A.12, "concrete" α_S ≈ 0.60, ε ≈ 0.88; ASHRAE HoF 2021, Ch. 4 | **medium** |
| α puf | 0.50 | Engineering estimate for bare cream/yellow foam; no tabulated source. Superseded in practice by the PPGI default finish | **low** |
| defaults α 0.7 / ε 0.9 | — | EnergyPlus *Input Output Reference*, `Material` object, fields "Solar Absorptance" (default 0.7) and "Thermal Absorptance" (default 0.9) | **high** |

### Finishes (`surface_finishes.json`)

| Finish | α | ε | Believed source | Confidence |
|---|---|---|---|---|
| mud_plaster | 0.65 | 0.90 | ASHRAE HoF 2021, Ch. 4; CIBSE Guide A 2015, Ch. 3 | low |
| lime_whitewash | 0.30 | 0.90 | ASHRAE HoF 2021, Ch. 4 ("whitewash"); CIBSE Guide A 2015, Ch. 3 | medium |
| white_paint | 0.26 | 0.90 | Bergman 2011, Table A.12, "paint, white acrylic" (α_S 0.26, ε 0.90) | **medium–high** |
| cement_render_grey | 0.60 | 0.90 | Bergman 2011, Table A.12 (concrete ≈ 0.60) as a proxy; ASHRAE HoF 2021, Ch. 4 | medium |
| dark_paint | 0.90 | 0.90 | Bergman 2011, Table A.12 (black paints 0.95–0.98); ASHRAE HoF 2021, Ch. 4 | medium |
| red_brick | 0.70 | 0.90 | ASHRAE HoF 2021, Ch. 4 (red brick ≈ 0.63–0.77); CIBSE Guide A 2015, Ch. 3 | medium |
| bare_timber | 0.60 | 0.90 | ASHRAE HoF 2021, Ch. 4 | medium / low |
| galvanised_steel_new | 0.65 | 0.13 | ASHRAE HoF 2021 (galvanised iron, new; appears in solar-absorptance tables used for sol-air) | medium |
| prepainted_steel_sheet_light | 0.30 | 0.87 | Levinson et al. 2007 (*Sol. Energy Mater. Sol. Cells* 91(4)); CRRC Rated Products Directory (coil-coated metal) | medium |
| prepainted_steel_sheet (= _medium) | 0.60 | 0.87 | as above | medium |
| prepainted_steel_sheet_dark | 0.85 | 0.87 | as above | medium |
| snow_fresh | 0.15 | 0.98 | α: Warren 1982, *Rev. Geophys.* 20(1) (fresh-snow albedo 0.8–0.9); ε: Dozier & Warren 1982, *Water Resour. Res.* 18(5) | **high** (α range), medium (ε locator) |

### Glazing defaults (`environment/materials.py`)

| Item | Value | Believed source | Confidence |
|---|---|---|---|
| IAM form and b₀ | IAM = 1 − b₀(1/cosθ − 1), b₀ = 0.10 | Souka & Safwat (1966); Duffie & Beckman 4th ed. (2013). Note D&B write K_τα = 1 + b₀(1/cosθ − 1) with **b₀ = −0.10** for one glass cover, the same physics with the opposite sign. The code docstring cites §5.12; the IAM discussion may instead be in the collector-testing chapter (§6.17). **Locator to check.** | value medium, locator **low** |
| SHGC_diffuse = SHGC/(1+b₀) | 0.909·SHGC | Derived in closed form (docstring of `hemispherical_iam`), checked numerically in tests. No external source needed | high |
