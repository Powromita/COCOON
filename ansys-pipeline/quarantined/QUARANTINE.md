# Quarantined ANSYS evidence

Material in this folder must **never** be shown as validation of any design
(PRD v4 §0.3 rule 1, §14.12). It is kept only for audit history.

## legacy_ansys_reference_20260909/

Moved here from `benchmarks/ansys_reference/` on 2026-09-25.

Reason: the package is internally inconsistent.

| Claim in its README.md | What its data files actually contain |
|---|---|
| Design under test: #33 | `ansys_validation_summary.csv` holds designs **12** and **10** |
| MAE 0.25 °C, RMSE 0.31 °C | MAE **0.86 °C** (design 12) and **3.83 °C** (design 10) |
| Ranking agreement 100 % | RC ranks 12 > 10, ANSYS ranks 10 > 12 — **ranking disagrees** |

It was also injected by `web_results.py` into every custom run whose own
ANSYS stage did not run, so unrelated designs displayed it as their
validation. That fallback has been removed; a run without its own ANSYS
result now reports `ran: false`.

Replacement evidence is generated reproducibly by the M8 multi-zone
pipeline (`ansys-pipeline/cocoon_ansys/`), one immutable job folder per
design revision, under `ansys-pipeline/evidence/`.
