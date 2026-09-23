# Optimizer reliability report

- designs: 16
- comfort target 18.0 C, band 15.0-24.0 C

## 1. Sensitivity

STABLE: design 12 is rank 1 in >=80% of perturbed rankings -- a single winner is defensible.

Robust shortlist: [12, 10, 9]

|   design_id |   freq_rank1_pct |   freq_top3_pct |   mean_rank |   best_rank |   worst_rank |
|------------:|-----------------:|----------------:|------------:|------------:|-------------:|
|          12 |              100 |             100 |           1 |           1 |            1 |
|          10 |                0 |             100 |           2 |           2 |            2 |
|           9 |                0 |             100 |           3 |           3 |            3 |
|          11 |                0 |               0 |           4 |           4 |            4 |
|           1 |                0 |               0 |           5 |           5 |            5 |
|          13 |                0 |               0 |           6 |           6 |            6 |
|          15 |                0 |               0 |           7 |           7 |            7 |
|          14 |                0 |               0 |           8 |           8 |            8 |
|           7 |                0 |               0 |           9 |           9 |            9 |
|           3 |                0 |               0 |          10 |          10 |           10 |

## 2. Weather robustness

typical-weather top 5: [12, 10, 9, 11, 1]

worst-case top 5: [12, 10, 9, 11, 1]

top-3 identical across weather: True

## 3. Pareto front

|   design_id |   T_min |   swing_C |   hours_in_band_pct |   comfort_score |
|------------:|--------:|----------:|--------------------:|----------------:|
|          12 |    7.34 |      7.6  |                 0   |            36.5 |
|          13 |    1.85 |     13.26 |                 4.2 |            -2.5 |

## 4. Logistics

|   design_id |   envelope_mass_kg |   envelope_mass_t |   material_cost_inr |   transportability_1to5 |
|------------:|-------------------:|------------------:|--------------------:|------------------------:|
|           9 |              41311 |             41.31 |              165071 |                    3.46 |
|          10 |              99285 |             99.28 |              245085 |                    3.84 |
|          12 |              97669 |             97.67 |              167799 |                    4.11 |
|          13 |              54133 |             54.13 |              165408 |                    4.36 |

### Deployability-weighted

|   design_id |   comfort_score |   mass_t |   cost_lakh_inr |   transportability |   deployability_score |
|------------:|----------------:|---------:|----------------:|-------------------:|----------------------:|
|           9 |            15.7 |    41.31 |            1.65 |               3.46 |                 -39   |
|          13 |            -2.5 |    54.13 |            1.65 |               4.36 |                 -72.9 |
|          12 |            36.5 |    97.67 |            1.68 |               4.11 |                -100.3 |
|          10 |            16   |    99.28 |            2.45 |               3.84 |                -127.4 |
