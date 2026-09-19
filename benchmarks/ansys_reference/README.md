# ANSYS Reference Benchmark

This folder contains the pre-computed ANSYS Mechanical FEM validation benchmark for COCOON.

## Background
- **Source Run:** `20260909T193431Z-8d13`
- **Design Under Test:** Design #33 (Stone masonry with PUF insulation, 6.0m x 4.0m x 2.8m)
- **Weather Window:** Jan 21, 2026 (48-hour sub-zero cold wave in Leh, Ladakh)
- **Engine Comparison:** Lumped RC Physics Model vs. PyANSYS/MAPDL 3D Transient Thermal FEM
- **Key Metrics:**
  - Mean Absolute Error (MAE): 0.25 °C
  - Root Mean Square Error (RMSE): 0.31 °C
  - Ranking Agreement: 100% (RC rank matches ANSYS rank)

## Files
- `ansys_validation_summary.csv`: Summary error metrics (MAE, RMSE, Tmin, Tmean, Tmax) per candidate design.
- `ansys_validation_series.json`: Hourly time-series for RC predicted indoor temperature vs. ANSYS FEM indoor temperature (consumed by frontend validation charts).
- `ansys_validation_weather.csv`: Weather forcing conditions during the 48-hour validation window.
- `REPORT.md`: Full Markdown report detailing the benchmark execution.
- `results.json`: Complete pipeline results payload for this reference run.

## Code Integration
`web_results.py` loads this benchmark dataset when a live ANSYS simulation is not requested or executed, allowing the frontend to display validation curves against the reference baseline.
