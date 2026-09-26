"""
runner.py - run_pipeline: requirements -> M3 weather -> M2 designs -> M4 verification -> M7 economics -> M6 ranking.

    M3  freeze a weather snapshot for the requirements' analysis window (never another location's data)
    M6  optimize() drives the rest:  M2 generate -> constraints -> (M5 screening, OFF here) -> M4 verify -> M7 price
                                     -> Pareto -> four named picks -> reliability
    M8  optional: freeze and queue the recommended revision

ML is off on purpose (predictor=None): every design that passes the constraints is simulated by M4.
Nothing returned here is ANSYS-validated unless `validation` says a job was queued, and even then the result of that
job lives with the ANSYS job, not in this result.
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Any

from cocoon_contracts import RequirementsContract, WeatherSnapshot

from cocoon_pipeline.ansys_stage import run_ansys_validation
from cocoon_pipeline.config import ANSYS_SUBMIT, PipelineConfig
from cocoon_pipeline.finalize import build_final_report, render_markdown, write_timeseries
from cocoon_pipeline.persist import write_run

VALIDATION_NOT_REQUESTED = "RC_ONLY_ANSYS_NOT_REQUESTED"
VALIDATION_NO_DESIGN = "NO_ELIGIBLE_DESIGN"          # nothing to validate; ANSYS was not asked about a design that does not exist


@dataclass(frozen=True)
class PipelineResult:
    optimization: Any                                   # optimization.OptimizationResult
    recommended_design_id: str | None
    validation: dict[str, Any]                          # {"state": "RC_ONLY_ANSYS_...", ...detail}; the backend and the UI read ["state"]
    weather_snapshot_id: str
    site_used: dict[str, Any]
    timings_s: dict[str, float]
    warnings: tuple[str, ...]
    run_id: str | None = None
    run_dir: str | None = None
    final_report: dict[str, Any] | None = None          # also written to final_report.json / REPORT.md; not repeated in result.json

    def to_dict(self) -> dict[str, Any]:
        return {"run_id": self.run_id, "recommended_design_id": self.recommended_design_id, "validation": dict(self.validation),
                "weather_snapshot_id": self.weather_snapshot_id,
                "site_used": dict(self.site_used), "timings_s": dict(self.timings_s), "warnings": list(self.warnings),
                "optimization": self.optimization.to_dict()}


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def nearest_site(store: Any, latitude_deg: float, longitude_deg: float) -> tuple[str, float]:
    """The cached archive closest to the coordinates. The distance is reported so a far-away match is visible."""
    from m3_data import SITES, WeatherError
    cached = [s for s in store.sites() if s in SITES]
    if not cached:
        raise WeatherError("WEATHER_SITE_UNKNOWN", "no cached weather archive has known coordinates")
    dist = {s: _distance_km(latitude_deg, longitude_deg, SITES[s]["lat"], SITES[s]["lon"]) for s in cached}
    site = min(sorted(dist), key=lambda s: dist[s])
    return site, round(dist[site], 1)


def _freeze_weather(requirements: RequirementsContract, cfg: PipelineConfig, store: Any) -> tuple[WeatherSnapshot, dict[str, Any]]:
    from m3_data import SITES
    if cfg.weather_snapshot_id:
        snap = store.get(cfg.weather_snapshot_id)
        return snap, {"site": None, "distance_km": None, "chosen": "given", "snapshot_id": snap.snapshot_id,
                      "location_name": snap.source.location_name, "is_cached": snap.source.is_cached}
    site_req = requirements.site
    if cfg.site:
        site, distance, chosen = cfg.site, None, "requested"
    else:
        site, distance = nearest_site(store, site_req.latitude_deg, site_req.longitude_deg)
        chosen = "nearest_cached_site"
    snap = store.build(site, site_req.analysis_start.replace(tzinfo=None), site_req.analysis_end.replace(tzinfo=None))
    return snap, {"site": site, "distance_km": distance, "chosen": chosen, "snapshot_id": snap.snapshot_id,
                  "location_name": SITES[site]["name"], "is_cached": snap.source.is_cached}


def _ml_predictor(cfg: PipelineConfig, requirements: RequirementsContract, weather: WeatherSnapshot):
    """M5 screening predictor, or None with the reason. ML only shortlists; M4 re-simulates every finalist."""
    info: dict[str, Any] = {"mode": cfg.use_ml, "used": False}
    if cfg.use_ml == "off":
        return None, {**info, "reason": "disabled (use_ml=off)"}
    if cfg.use_ml == "auto" and cfg.count < cfg.ml_min_designs:
        return None, {**info, "reason": f"auto: fewer than {cfg.ml_min_designs} designs, so every design goes to the RC engine"}
    from ml.m6_predictor import M5Predictor
    p = M5Predictor(weather, requirements.mission.target_temperature_c)
    if not p.available:
        return None, {**info, "reason": p.reason}
    return p, {**info, "used": True, "model_version": p.model_version, "reason": "screening only; every finalist is re-simulated by M4"}


def run_pipeline(requirements: RequirementsContract | dict, cfg: PipelineConfig | None = None) -> PipelineResult:
    from economics.provider import make_economics
    from m3_data import WeatherStore, standard_snapshot
    from m4_engine import M4Evaluator
    from optimization import OptimizationSettings, ScreeningSettings, optimize

    cfg = cfg or PipelineConfig()
    if not isinstance(requirements, RequirementsContract):
        requirements = RequirementsContract.model_validate(requirements)
    t0 = time.perf_counter()
    timings: dict[str, float] = {}

    materials = cfg.materials or standard_snapshot()
    store = cfg.weather_store or WeatherStore()

    t = time.perf_counter()
    weather, site_used = _freeze_weather(requirements, cfg, store)
    timings["weather_s"] = round(time.perf_counter() - t, 6)

    evaluator = M4Evaluator(materials, store)
    economics = make_economics(materials, requirements)
    settings = cfg.optimization if cfg.optimization is not None else OptimizationSettings()

    predictor, ml_info = _ml_predictor(cfg, requirements, weather)
    if predictor is not None and settings.screening is None:
        # M6's default caps the shortlist at 20 designs. That cap is a budget, not a safety rule: measured on 80 designs
        # it dropped 12 of 18 Pareto-front designs, so the pipeline screens without it (see ml/ACCEPTANCE.md).
        settings = replace(settings, screening=ScreeningSettings(shortlist_size=None))
    opt = optimize(requirements, materials, evaluator, economics, weather_snapshot_id=weather.snapshot_id,
                   seed=cfg.seed, count=cfg.count, predictor=predictor, settings=settings)
    if predictor is not None:
        ml_info["screening"] = opt.screening.summary()
    timings.update({f"m6_{k}": v for k, v in opt.timings_s.items()})

    warnings = list(opt.warnings)
    if opt.development_only:
        raise RuntimeError("the pipeline produced a development_only result; stand-in evaluators must never run here")

    pick = opt.recommended
    recommended = pick.design_id if pick.status == "selected" else None

    if recommended is None:
        validation = {"state": VALIDATION_NO_DESIGN, "reason": pick.reason}
    elif cfg.ansys == ANSYS_SUBMIT:
        t = time.perf_counter()
        sub = run_ansys_validation(opt.candidate(recommended).building, weather, materials, hours=cfg.ansys_hours,
                                   wait=cfg.ansys_wait)
        timings["ansys_submit_s"] = round(time.perf_counter() - t, 6)
        validation = dict(sub)
    else:
        validation = {"state": VALIDATION_NOT_REQUESTED}

    report, series = None, {}
    if recommended is not None and cfg.final_report:
        from optimization.rc_verification import VerificationSettings
        vsettings = VerificationSettings.from_requirements(requirements, weather_snapshot_id=weather.snapshot_id,
                                                           **dict(settings.verification))
        t = time.perf_counter()
        report, series = build_final_report(requirements, cfg, opt, weather, site_used, evaluator, materials, vsettings, timings,
                                            warnings, validation, ml_info)
        timings["final_report_s"] = round(time.perf_counter() - t, 6)
        warnings = report["warnings"]

    timings["total_s"] = round(time.perf_counter() - t0, 6)
    result = PipelineResult(optimization=opt, recommended_design_id=recommended, validation=validation,
                            weather_snapshot_id=weather.snapshot_id, site_used=site_used,
                            timings_s=timings, warnings=tuple(warnings), run_id=cfg.run_id,
                            run_dir=str(cfg.runs_dir / cfg.run_id) if cfg.persist else None, final_report=report)
    if cfg.persist:
        doc = result.to_dict()
        doc["created_at"] = datetime.now().astimezone().isoformat()
        files = {}
        if report is not None:
            report["timings_s"] = dict(timings)
            files = {"final_report.json": json.dumps(report, indent=1, default=str), "REPORT.md": render_markdown(report)}
            for name, sim in series.items():
                if sim is not None:
                    write_timeseries(cfg.runs_dir / cfg.run_id / "recommended" / f"timeseries_{name}.csv", sim)
        write_run(cfg.runs_dir / cfg.run_id, doc, (c.building for c in opt.candidates), files)
    return result
