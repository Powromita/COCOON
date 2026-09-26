# M5 screening acceptance (v2 model, labelled by m4_engine 1.0.0)

Model: `data/m5_dataset_v2/model/m5_baseline_v2` (gradient-boosted, one model per target). Held-out weather periods:
heating energy R2 0.974, peak load R2 0.982, minimum occupied temperature R2 0.954, mean 0.963 (see its metadata.json for
all targets, the Extra Trees / Random Forest baselines and the held-out site Kargil). `comfort_hours` and `unmet_hours` had
constant labels and are not predicted.

Pipeline check (Ladakh 30-person requirement, 80 designs, reliability off, ML on vs off, same seeds):

| Setting | Result |
|---|---|
| M6 default (shortlist cap 20, margin 0.10), seed 5 | 59 of 80 designs discarded; the winner and 12 of 18 Pareto-front designs were lost (front recall 0.33) |
| No cap, margin 0.10 / 0.20 / 0.30, seeds 5 and 6 | 0 designs discarded; winner and whole front kept (recall 1.00); no time saved |

So the cap is unsafe and the pipeline turns it off whenever ML is used (`cocoon_pipeline/runner.py`). With the safe rule,
ML did not discard anything on this requirement type, so it currently gives no speed-up; it is wired, guarded and
harmless, and it stays a screening step only: every finalist is re-simulated by M4. Anything outside the training ranges
(for example a window that is not 168 hours) goes straight to M4. The model is refused if its labelling engine version is
not the installed M4 version.
