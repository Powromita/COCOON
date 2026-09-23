# Optimizer reliability report

- designs: 50
- comfort target 18.0 C, band 15.0-24.0 C

## 1. Sensitivity

STABLE: design 27 is rank 1 in >=80% of perturbed rankings -- a single winner is defensible.

Robust shortlist: [27, 23, 46]

|   design_id |   freq_rank1_pct |   freq_top3_pct |   mean_rank |   best_rank |   worst_rank |
|------------:|-----------------:|----------------:|------------:|------------:|-------------:|
|          27 |              100 |             100 |         1   |           1 |            1 |
|          23 |                0 |             100 |         2.4 |           2 |            3 |
|          46 |                0 |             100 |         2.6 |           2 |            3 |
|          14 |                0 |               0 |         4   |           4 |            5 |
|          20 |                0 |               0 |         5   |           4 |            5 |
|           2 |                0 |               0 |         6.1 |           6 |            7 |
|          44 |                0 |               0 |         6.9 |           6 |            7 |
|          49 |                0 |               0 |         8   |           8 |            8 |
|          18 |                0 |               0 |         9   |           9 |            9 |
|          48 |                0 |               0 |        10.2 |          10 |           11 |

## 2. Weather robustness

typical-weather top 5: [27, 23, 46, 14, 20]

worst-case top 5: [27, 46, 14, 2, 8]

top-3 identical across weather: False

## 3. Pareto front

|   design_id |   T_min |   swing_C |   hours_in_band_pct |   comfort_score |
|------------:|--------:|----------:|--------------------:|----------------:|
|          27 |    3.01 |      1.93 |                   0 |             6.2 |

## 4. Logistics

|   design_id |   envelope_mass_kg |   envelope_mass_t |   material_cost_inr |   transportability_1to5 |
|------------:|-------------------:|------------------:|--------------------:|------------------------:|
|          14 |             122064 |            122.06 |              362553 |                    3.64 |
|          23 |              93470 |             93.47 |              377902 |                    4.27 |
|          27 |             128249 |            128.25 |              330467 |                    3.97 |
|          46 |             115495 |            115.5  |              307506 |                    3.95 |

### Deployability-weighted

|   design_id |   comfort_score |   mass_t |   cost_lakh_inr |   transportability |   deployability_score |
|------------:|----------------:|---------:|----------------:|-------------------:|----------------------:|
|          23 |             3.5 |    93.47 |            3.78 |               4.27 |                -134.7 |
|          46 |             3.5 |   115.5  |            3.08 |               3.95 |                -166.3 |
|          14 |             1.9 |   122.06 |            3.63 |               3.64 |                -181.1 |
|          27 |             6.2 |   128.25 |            3.3  |               3.97 |                -183.5 |
