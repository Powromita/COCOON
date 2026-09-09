# Optimizer reliability report

- designs: 35
- comfort target 18.0 C, band 15.0-24.0 C

## 1. Sensitivity

STABLE: design 33 is rank 1 in >=80% of perturbed rankings -- a single winner is defensible.

Robust shortlist: [33, 15, 6]

|   design_id |   freq_rank1_pct |   freq_top3_pct |   mean_rank |   best_rank |   worst_rank |
|------------:|-----------------:|----------------:|------------:|------------:|-------------:|
|          33 |              100 |             100 |         1   |           1 |            1 |
|          15 |                0 |             100 |         2   |           2 |            2 |
|           6 |                0 |             100 |         3   |           3 |            3 |
|           2 |                0 |               0 |         4   |           4 |            4 |
|           5 |                0 |               0 |         5   |           5 |            5 |
|           7 |                0 |               0 |         6   |           6 |            6 |
|          14 |                0 |               0 |         7   |           7 |            8 |
|          31 |                0 |               0 |         8.4 |           8 |            9 |
|          16 |                0 |               0 |         8.6 |           7 |           10 |
|          34 |                0 |               0 |        10   |           9 |           10 |

## 2. Weather robustness

typical-weather top 5: [33, 15, 6, 2, 5]

worst-case top 5: [33, 15, 6, 5, 20]

top-3 identical across weather: True

## 3. Pareto front

|   design_id |   T_min |   swing_C |   hours_in_band_pct |   comfort_score |
|------------:|--------:|----------:|--------------------:|----------------:|
|          33 |    3.88 |     10.93 |                   0 |             8.5 |

## 4. Logistics

|   design_id |   envelope_mass_kg |   envelope_mass_t |   material_cost_inr |   transportability_1to5 |
|------------:|-------------------:|------------------:|--------------------:|------------------------:|
|           6 |              43794 |             43.79 |              194468 |                    3.29 |
|          15 |              94871 |             94.87 |              181678 |                    3.94 |
|          33 |              84416 |             84.42 |              227728 |                    3.99 |

### Deployability-weighted

|   design_id |   comfort_score |   mass_t |   cost_lakh_inr |   transportability |   deployability_score |
|------------:|----------------:|---------:|----------------:|-------------------:|----------------------:|
|           6 |           -23.5 |    43.79 |            1.94 |               3.29 |                 -83.8 |
|          33 |             8.5 |    84.42 |            2.28 |               3.99 |                -111.3 |
|          15 |           -15.5 |    94.87 |            1.82 |               3.94 |                -149.3 |
