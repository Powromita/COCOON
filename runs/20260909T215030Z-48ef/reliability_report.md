# Optimizer reliability report

- designs: 50
- comfort target 18.0 C, band 15.0-24.0 C

## 1. Sensitivity

NOT a clean single winner: the top spot moves under weight perturbation. Report the robust shortlist [46, 18] instead of one design.

Robust shortlist: [46, 18]

|   design_id |   freq_rank1_pct |   freq_top3_pct |   mean_rank |   best_rank |   worst_rank |
|------------:|-----------------:|----------------:|------------:|------------:|-------------:|
|          46 |             43.2 |            61.2 |         3.8 |           1 |           10 |
|          18 |              8.2 |            55   |         6.8 |           1 |           30 |
|          23 |             42.2 |            49.8 |         9.3 |           1 |           35 |
|          27 |              0   |            43.5 |         5.2 |           2 |           11 |
|          14 |              0   |            43.5 |         6.4 |           2 |           14 |
|          31 |              0   |            37.5 |        11.3 |           3 |           33 |
|           8 |              6.2 |             7.2 |        12.1 |           1 |           19 |
|          19 |              0   |             1.2 |        13.6 |           2 |           19 |
|          44 |              0   |             1   |         9.7 |           3 |           26 |
|           2 |              0   |             0   |         8.1 |           4 |           13 |

## 2. Weather robustness

typical-weather top 5: [46, 18, 27, 23, 14]

worst-case top 5: [46, 27, 14, 2, 18]

top-3 identical across weather: False

## 3. Pareto front

|   design_id |   T_min |   swing_C |   hours_in_band_pct |   comfort_score |
|------------:|--------:|----------:|--------------------:|----------------:|
|          46 |    4.82 |      2.51 |                   0 |            19.4 |
|          14 |    4.78 |      2.33 |                   0 |            19   |
|          10 |    4.43 |      1.34 |                   0 |            16.7 |
|           8 |    4.42 |      0.64 |                   0 |            17.1 |

## 4. Logistics

|   design_id |   envelope_mass_kg |   envelope_mass_t |   material_cost_inr |   transportability_1to5 |
|------------:|-------------------:|------------------:|--------------------:|------------------------:|
|           8 |              98078 |             98.08 |              217666 |                    4    |
|          10 |              73735 |             73.73 |              187842 |                    4.08 |
|          14 |              88788 |             88.79 |              234727 |                    3.8  |
|          18 |              67680 |             67.68 |              167381 |                    4.7  |
|          27 |              88907 |             88.91 |              213837 |                    4.03 |
|          46 |              79054 |             79.05 |              197516 |                    4.02 |

### Deployability-weighted

|   design_id |   comfort_score |   mass_t |   cost_lakh_inr |   transportability |   deployability_score |
|------------:|----------------:|---------:|----------------:|-------------------:|----------------------:|
|          18 |            19.3 |    67.68 |            1.67 |               4.7  |                 -70.1 |
|          10 |            16.7 |    73.73 |            1.88 |               4.08 |                 -85.1 |
|          46 |            19.4 |    79.05 |            1.98 |               4.02 |                 -91   |
|          27 |            19.2 |    88.91 |            2.14 |               4.03 |                -106.6 |
|          14 |            19   |    88.79 |            2.35 |               3.8  |                -108.4 |
|           8 |            17.1 |    98.08 |            2.18 |               4    |                -122.7 |
