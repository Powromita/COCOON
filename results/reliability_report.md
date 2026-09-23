# Optimizer reliability report

- designs: 50  seed: 0
- weather: tiled synthetic  (72 h)
- comfort target 18.0 C, band 15.0-24.0 C

## 1. Sensitivity

STABLE: design 49 is rank 1 in >=80% of perturbed rankings -- a single winner is defensible.

Robust shortlist: [49, 7, 45]

|   design_id |   freq_rank1_pct |   freq_top3_pct |   mean_rank |   best_rank |   worst_rank |
|------------:|-----------------:|----------------:|------------:|------------:|-------------:|
|          49 |              100 |           100   |         1   |           1 |            1 |
|           7 |                0 |           100   |         2   |           2 |            2 |
|          45 |                0 |            90.8 |         3.1 |           3 |            4 |
|          28 |                0 |             9.2 |         3.9 |           3 |            4 |
|          20 |                0 |             0   |         5   |           5 |            5 |
|          15 |                0 |             0   |         6   |           6 |            6 |
|          14 |                0 |             0   |         7.3 |           7 |            9 |
|           4 |                0 |             0   |         7.7 |           7 |            8 |
|          27 |                0 |             0   |         9.1 |           7 |           11 |
|           9 |                0 |             0   |        10   |           9 |           11 |

## 3. Pareto front

|   design_id |   T_min |   swing_C |   hours_in_band_pct |   comfort_score |
|------------:|--------:|----------:|--------------------:|----------------:|
|          49 |   13.69 |      2.43 |                45.8 |            90.9 |
|           7 |   13.11 |      3.9  |                51.4 |            88   |

## 4. Logistics

|   design_id |   envelope_mass_kg |   envelope_mass_t |   material_cost_inr |   transportability_1to5 |
|------------:|-------------------:|------------------:|--------------------:|------------------------:|
|           7 |              44858 |             44.86 |              218499 |                    4.08 |
|          45 |              37684 |             37.68 |              231689 |                    3.08 |
|          49 |              81926 |             81.93 |              200613 |                    4.09 |

### Deployability-weighted

|   design_id |   comfort_score |   mass_t |   cost_lakh_inr |   transportability |   deployability_score |
|------------:|----------------:|---------:|----------------:|-------------------:|----------------------:|
|          45 |            83.5 |    37.68 |            2.32 |               3.08 |                 -76.5 |
|           7 |            88   |    44.86 |            2.18 |               4.08 |                 -96.7 |
|          49 |            90.9 |    81.93 |            2.01 |               4.09 |                -240.6 |
