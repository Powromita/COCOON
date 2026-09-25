# COCOON shelter pipeline report

_run: `20260909T193431Z-8d13`  |  mode: optimize_

## 1. Inputs

- **weather_typical.csv**: 72 h, -29.8 to -10.8 C (mean -20.9 C)
- **weather_worstcase.csv**: 24 h, -38.8 to -17.2 C (mean -28.7 C)
- ground temperature: -3.58 C (10-yr annual-mean air)
- design pool: 16 candidates

## 2. Recommended design: #9

> ANSYS FEM: the shortlisted designs are 2.35 C apart in mean indoor temperature, inside the 3.83 C RC-vs-FEM error -> thermally indistinguishable; tie broken on logistics: design 9 is the lightest (41.31 t) with transportability 3.46/5.

Runner-up: #12

- Geometry: 5.26 x 3.87 x 2.62 m
- Walls: puf (84 mm) + concrete (242 mm)
- Roof: puf (101 mm) + straw_clay (229 mm)
- Floor: puf (45 mm) + stone_masonry (337 mm)
- Windows: 4 x double (5.6 m2)

- comfort score 15.7, worst-hour T_min 4.49 C, envelope mass 41.31 t

## 3. DRDO feature reports (chosen design)

**Feature 1 - inside temperature:** min 4.49 / mean 9.31 / max 14.93 C over 72 h
![temperature](features/9/temperature.png)

**Feature 2 - solar energy:** total 41457.7 Wh (149.25 MJ), peak gain 2658.9 W
![solar](features/9/solar_analysis.png)

**Feature 3 - heat flow:** total loss 99769.0 Wh; walls None% / roof None% / floor None% / windows None% / infiltration None%
![heatflow](features/9/heat_flow_analysis.png)

## 4. Reliability

- verdict: STABLE: design 12 is rank 1 in >=80% of perturbed rankings -- a single winner is defensible.
- robust shortlist: [12, 10, 9]
- Pareto-optimal: [12, 13]
- top-3 stable across typical vs worst-case weather: True
![sensitivity](reliability_sensitivity.png)
![pareto](reliability_pareto.png)

## 5. ANSYS cross-validation

|   design_id |   RC_Tmin_C |   ANSYS_Tmin_C |   RC_Tmean_C |   ANSYS_Tmean_C |   RC_Tmax_C |   ANSYS_Tmax_C |   MAE_C |   RMSE_C |     R2 |   RC_rank |   ANSYS_rank |
|------------:|------------:|---------------:|-------------:|----------------:|------------:|---------------:|--------:|---------:|-------:|----------:|-------------:|
|          12 |       12.44 |          13.61 |        13.94 |           14.8  |       15.03 |          15.91 |   0.86  |    0.878 |  0.061 |         1 |            2 |
|          10 |       10.52 |          16.12 |        13.32 |           17.15 |       15.4  |          18.66 |   3.833 |    4.065 | -4.576 |         2 |            1 |

Design spread 0.62 C vs worst MAE 3.833 C.

