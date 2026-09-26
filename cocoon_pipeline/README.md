# cocoon_pipeline

The glue that runs COCOON's real modules end to end (PRD v4 section 21.1). It contains no physics, costing or
ranking of its own.

```text
requirements ─► M3 freeze weather ─► M6 optimize():  M2 generate ─► constraints ─► M4 verify ─► M7 price
                                                     ─► Pareto ─► four named picks ─► reliability
                                  └► (optional) M8: freeze + queue the recommended revision
```

- **ML (M5) is screening only, and automatic.** `use_ml="auto"` turns it on for 60+ designs when the trained model was
  labelled by the installed M4 version; otherwise (or for a stale/missing model, or an out-of-range design) every design goes to
  M4. It never supplies a final number. Uncapped screening is used because M6's default shortlist cap dropped Pareto-front
  designs (measured in `ml/ACCEPTANCE.md`); on the tested requirement it discards nothing, so it saves no time yet.
- **ANSYS (M8) is off unless asked, and not proven end to end here.** `validation["state"]` is
  `RC_ONLY_ANSYS_NOT_REQUESTED` by default. With `ansys="submit"` the recommended revision is frozen with the same weather
  and queued (`RC_ONLY_ANSYS_QUEUED`), or `RC_ONLY_ANSYS_UNAVAILABLE` with the reason; with `ansys_wait=True` (CLI `--ansys`)
  it blocks, and `VALIDATED_BY_ANSYS` plus an M4-vs-ANSYS comparison (`ansys_stage.py`, checked against the M8 evidence
  jobs) is returned only if the job COMPLETED. A real pipeline-design solve was started once and stopped after 12+ minutes
  (a two-floor, 20-opening design solves far slower than the evidence cases), so that path is untested with a real solve.
  Importing this package never imports ANSYS.
- **Weather** comes from the cached archives only. With no `site`, the cached site nearest to the requirements'
  coordinates is used and reported in `site_used`. A window the archive does not cover raises `WeatherError`; another
  location is never substituted.
- **Final report.** For the recommended design it writes `final_report.json` and `REPORT.md` (design, room temperatures,
  heating, full M7 low/expected/high economics with sensitivity, the four picks, reliability, validation state, warnings,
  placeholders, provenance) plus `recommended/timeseries_*.csv`. A matched baseline (same layout, insulation layers
  removed) is verified by M4 and given to M7, so NPV and payback are real; if the design has no insulation to remove, the
  baseline is omitted and a warning says so.
- `development_only` results (stand-in evaluators) are refused with a `RuntimeError`.

## Use

```python
from cocoon_pipeline import PipelineConfig, run_pipeline
res = run_pipeline(requirements_dict_or_contract, PipelineConfig(seed=42, count=20))
res.recommended_design_id, res.validation["state"], res.optimization.ranking.picks
```

```bash
python -m cocoon_pipeline --requirements packages/packages/contracts/fixtures/valid/requirements_ladakh_30p.json \
  --count 8 --seed 42 --out data/pipeline_runs/opt_demo
python -m pytest cocoon_pipeline
```

With `persist=True` (needs `run_id` and `runs_dir`) it writes `<runs_dir>/<run_id>/result.json` and
`candidates/<design_id>.building.json` for every generated design, atomically. `status.json` belongs to the backend.
`backend/routes/pipeline.py` runs this as the `POST /api/v1/optimizations` job.

## Cost

M4 runs are the cost: about 2-3 s of verification plus 8 s of reliability for 8 designs on a laptop (measured, Leh,
7 days). Keep `count` small until you have timed your machine; 500 designs with no ML is about 1,500 verification runs.
