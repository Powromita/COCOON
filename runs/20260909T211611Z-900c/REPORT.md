# COCOON shelter pipeline report

_run: `20260909T211611Z-900c`  |  mode: single_

## 1. Inputs

- **weather_typical.csv**: 168 h, -31.1 to -9.2 C (mean -19.8 C)
- **weather_worstcase.csv**: 48 h, -39.3 to -16.7 C (mean -28.5 C)
- ground temperature: -3.58 C (10-yr annual-mean air)

## 2. Recommended design: #single

> Free-running, this envelope holds -3.89-4.64 C indoors over 168 h (0.0% of hours below the 15.0-24.0 C band, 24.4% frost-free). Holding the lower edge needs ~18.6 kWh/day (~2.59 L/day kerosene).

- Geometry: 6.0 x 4.0 x 2.8 m
- Walls: adobe (600.0 mm)
- Roof: straw_clay (250.0 mm)
- Floor: stone_masonry (300.0 mm)
- Windows: - x double (3.6 m2)

- comfort score None, worst-hour T_min None C, envelope mass None t

## 3. DRDO feature reports (chosen design)

**Feature 1 - inside temperature:** min -3.89 / mean -1.31 / max 4.64 C over 168 h
![temperature](features/single/temperature.png)

**Feature 2 - solar energy:** total 61236.6 Wh (220.45 MJ), peak gain 1744.0 W
![solar](features/single/solar_analysis.png)

**Feature 3 - heat flow:** total loss 168301.0 Wh; walls None% / roof None% / floor None% / windows None% / infiltration None%
![heatflow](features/single/heat_flow_analysis.png)

## 5. ANSYS cross-validation

_not run for this pipeline pass._

