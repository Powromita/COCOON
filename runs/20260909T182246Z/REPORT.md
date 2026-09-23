# COCOON shelter pipeline report

_run: `20260909T182246Z`  |  mode: single_

## 1. Inputs

- **weather_typical.csv**: 72 h, -29.8 to -10.8 C (mean -20.9 C)
- **weather_worstcase.csv**: 48 h, -39.3 to -16.7 C (mean -28.5 C)
- ground temperature: -3.58 C (10-yr annual-mean air)

## 2. Recommended design: #single

> Free-running, this envelope holds 1.42-9.91 C indoors over 72 h (0.0% of hours below the 15-24 C band, 100.0% frost-free). Holding the lower edge needs ~17.1 kWh/day (~2.37 L/day kerosene).

- Geometry: 4.0 x 3.0 x 2.5 m
- Walls: puf (50 mm) + stone_masonry (300 mm)
- Roof: wood_timber (100 mm) + straw_clay (250 mm)
- Floor: stone_masonry (300 mm)
- Windows: - x double (2.5 m2)

- comfort score None, worst-hour T_min None C, envelope mass None t

## 3. DRDO feature reports (chosen design)

**Feature 1 - inside temperature:** min 1.42 / mean 5.28 / max 9.91 C over 72 h
![temperature](features/single/temperature.png)

**Feature 2 - solar energy:** total 18507.9 Wh (66.63 MJ), peak gain 1187.0 W
![solar](features/single/solar_analysis.png)

**Feature 3 - heat flow:** total loss 66139.0 Wh; walls None% / roof None% / floor None% / windows None% / infiltration None%
![heatflow](features/single/heat_flow_analysis.png)

## 5. ANSYS cross-validation

_not run for this pipeline pass._

