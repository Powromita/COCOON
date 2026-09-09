# Optimizer reliability report

- designs: 20
- comfort target 18.0 C, band 15.0-24.0 C

## 1. Sensitivity

STABLE: design 15 is rank 1 in >=80% of perturbed rankings -- a single winner is defensible.

Robust shortlist: [15, 14, 4]

|   design_id |   freq_rank1_pct |   freq_top3_pct |   mean_rank |   best_rank |   worst_rank |
|------------:|-----------------:|----------------:|------------:|------------:|-------------:|
|          15 |              100 |             100 |           1 |           1 |            1 |
|          14 |                0 |             100 |           2 |           2 |            2 |
|           4 |                0 |             100 |           3 |           3 |            3 |
|           7 |                0 |               0 |           4 |           4 |            4 |
|          18 |                0 |               0 |           5 |           5 |            5 |
|           9 |                0 |               0 |           6 |           6 |            6 |
|           8 |                0 |               0 |           7 |           7 |            7 |
|           5 |                0 |               0 |           8 |           8 |            8 |
|           2 |                0 |               0 |           9 |           9 |            9 |
|           6 |                0 |               0 |          10 |          10 |           10 |

## 2. Weather robustness

typical-weather top 5: [15, 14, 4, 7, 18]

worst-case top 5: [14, 15, 4, 18, 8]

top-3 identical across weather: True

## 3. Pareto front

|   design_id |   T_min |   swing_C |   hours_in_band_pct |   comfort_score |
|------------:|--------:|----------:|--------------------:|----------------:|
|          15 |    1.99 |     12.77 |                   0 |            -6.7 |

## 4. Logistics

|   design_id |   envelope_mass_kg |   envelope_mass_t |   material_cost_inr |   transportability_1to5 |
|------------:|-------------------:|------------------:|--------------------:|------------------------:|
|           4 |              63284 |             63.28 |              173163 |                    4.08 |
|          14 |              90033 |             90.03 |              228051 |                    3.72 |
|          15 |              78830 |             78.83 |              180790 |                    3.81 |

### Deployability-weighted

|   design_id |   comfort_score |   mass_t |   cost_lakh_inr |   transportability |   deployability_score |
|------------:|----------------:|---------:|----------------:|-------------------:|----------------------:|
|           4 |           -16   |    63.28 |            1.73 |               4.08 |                -101.5 |
|          15 |            -6.7 |    78.83 |            1.81 |               3.81 |                -116.9 |
|          14 |           -13.4 |    90.03 |            2.28 |               3.72 |                -142.7 |
