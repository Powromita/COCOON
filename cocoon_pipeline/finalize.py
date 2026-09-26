"""
finalize.py - the FinalDesignReport for the recommended shelter (everything the engine says about it, in one place).

Every number is copied from an M4 simulation result, an M7 analysis or M6's own result; nothing is estimated here.
The one thing built here is the matched baseline: the winner with its insulation layers removed (same layout, openings,
orientation, airtightness), verified and priced by the same M4 / M7 code so M7 can compute NPV and payback.
"""

from __future__ import annotations

import csv
import hashlib
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace
from typing import Any

NOTICE = ("This output is optimized for thermal performance and lifecycle decision support. It is not a structural, "
          "fire-safety, geotechnical, electrical, or construction certification. Qualified engineering review is "
          "required before construction.")

# Documented placeholders that shape every run (module READMEs); the report lists them so nobody reads them as facts.
PLACEHOLDERS = [
    {"item": "cost rates", "where": "data/costs/econ_ladakh_v1.json", "note": "demonstration placeholders, not procurement quotes"},
    {"item": "pick weights, overheating limit (target + 9 C)", "where": "optimization/ranking.py, objectives.py", "note": "team review pending"},
    {"item": "heater sizing (settled peak x 1.25, standard sizes)", "where": "optimization/rc_verification.py", "note": "one size for all heated rooms"},
    {"item": "layer thickness ranges (PUF widened, plywood invented), glazing values, door defaults", "where": "design_generator/candidate_generator.py", "note": "confirm with the materials owner"},
    {"item": "occupant sensible gain and equipment gains", "where": "m4_engine/options.py, design_generator", "note": "editable assumptions"},
]


def _git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5,
                              cwd=Path(__file__).resolve().parents[1]).stdout.strip() or "unknown"
    except Exception:                                               # noqa: BLE001
        return "unknown"


def _sha(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()


# ----- matched baseline ------------------------------------------------------------------------------------------------------
def uninsulated_baseline(building: Any, materials: Any):
    """The same building with every insulation-category layer removed and the U-values recomputed. None when the
    building has no insulation (the baseline would be the design itself)."""
    from cocoon_contracts import BuildingModel
    doc = building.model_dump(mode="json")
    changed = 0
    for asm in doc["assemblies"].values():
        kept = [l for l in asm["layers"] if materials.materials[l["material_id"]].category != "insulation"]
        if len(kept) == len(asm["layers"]) or not kept:
            continue
        r = asm["r_inside_film_m2k_w"] + asm["r_outside_film_m2k_w"] + sum(
            l["thickness_mm"] / 1000.0 / materials.materials[l["material_id"]].properties.thermal_conductivity_w_mk for l in kept)
        asm.update(layers=kept, u_value_w_m2k=round(1.0 / r, 4), name=asm["name"] + " (uninsulated baseline)")
        changed += 1
    if not changed:
        return None
    doc["design_id"] = building.design_id + "_base"
    doc["revision_id"] = building.revision_id + "_base"
    doc["source"] = building.source if isinstance(building.source, str) else building.source.value
    return BuildingModel.model_validate(doc)


# ----- economics -------------------------------------------------------------------------------------------------------------
def full_economics(requirements, materials, building, sim, baseline_building, baseline_sim, setpoint_c, warnings: list[str]):
    """M7 on the winner: low/expected/high, sensitivity and (when a baseline exists) NPV and payback."""
    from economics.analysis import run_analysis
    from economics.assumptions import load_assumption_set
    from economics.models import BaselineInput, DesignInput, EconomicsRequest
    from economics.provider import DEFAULT_ASSUMPTIONS_DIR

    aset = load_assumption_set(DEFAULT_ASSUMPTIONS_DIR, requirements.economic_assumption_set_id)
    if aset is None:
        warnings.append(f"economics skipped: unknown assumption set '{requirements.economic_assumption_set_id}'")
        return None
    design = DesignInput(building=building, simulation=sim, target_temperature_c=setpoint_c)
    baseline = None
    if baseline_building is not None and baseline_sim is not None:
        baseline = BaselineInput(building=baseline_building, simulation=baseline_sim, target_temperature_c=setpoint_c,
                                 kind="standard_uninsulated_template",
                                 label="same layout and openings, insulation layers removed")
    else:
        warnings.append("no baseline: the design has no insulation layer to remove, so NPV/payback vs a baseline are absent")
    for attempt in (baseline, None) if baseline is not None else (None,):
        try:
            req = EconomicsRequest(assumption_set_id=aset.id, materials=materials, occupants=requirements.mission.occupants,
                                   design=design, baseline=attempt)
            return run_analysis(req, aset, materials, code_commit=_git_commit(), with_sensitivity=True)
        except Exception as exc:                                    # noqa: BLE001
            warnings.append(f"economics {'with' if attempt else 'without'} baseline failed: {type(exc).__name__}: {exc}")
    return None


def _econ_summary(report) -> dict | None:
    if report is None:
        return None
    out = {"analysis_id": report.analysis_id, "assumption_set_id": report.assumption_set.id,
           "assumption_set_version": report.assumption_set.version, "currency": report.currency,
           "price_date": str(report.assumption_set.effective_date), "placeholder_prices": True,
           "baseline": None if report.baseline is None else {"kind": report.baseline.kind, "label": report.baseline.label,
                                                            "revision_id": report.baseline.revision_id},
           "scenarios": {}, "sensitivity": [s.model_dump(mode="json") for s in report.parameter_sensitivity],
           "warnings": list(report.warnings)}
    for name, sc in report.scenarios.items():
        r = sc.result
        out["scenarios"][name] = {
            "capex": r.capex.model_dump(mode="json"), "lcc_inr": r.lcc_inr, "annual_fuel_litres": r.annual_fuel_litres,
            "npv_vs_baseline_inr": r.npv_vs_baseline_inr, "simple_payback_years": r.simple_payback_years,
            "discounted_payback_years": r.discounted_payback_years, "break_even_year": r.break_even_year,
            "total_opex_inr": sc.total_opex_inr, "residual_value_inr": sc.residual_value_inr,
            "installed_heater_capacity_kw": sc.installed_heater_capacity_kw,
            "annual_cash_flows": [p.model_dump(mode="json") for p in r.annual_cash_flows]}
    return out


# ----- the recommended design ------------------------------------------------------------------------------------------------
def _design_section(building, materials, cand, vc) -> dict:
    doc = building.model_dump(mode="json")
    surfaces = {s["id"]: s for s in doc["surfaces"]}
    zones = [{"id": z["id"], "type": z["type"], "floor": f["level"], "origin_m": z["origin_m"], "size_m": z["size_m"],
              "heated": bool(z["hvac_id"])} for f in doc["floors"] for z in f["zones"]]
    openings = []
    for o in doc["openings"]:
        s = surfaces.get(o["parent_surface_id"], {})
        openings.append({"id": o["id"], "type": o["opening_type"], "zone": s.get("owning_zone_id"), "area_m2": o["area_m2"],
                         "azimuth_deg": s.get("azimuth_deg"), "boundary": s.get("boundary_type"), "u_value_w_m2k": o["u_value_w_m2k"],
                         "shgc": o.get("shgc"), "glazing_id": o.get("glazing_id")})
    used: dict[str, set] = {}
    for s in doc["surfaces"]:
        used.setdefault(s["assembly_id"], set()).add(s["surface_type"])
    assemblies = [{"id": a["id"], "name": a["name"], "used_for": sorted(used.get(a["id"], [])), "u_value_w_m2k": a["u_value_w_m2k"],
                   "layers_inner_to_outer": [{"material": l["material_id"], "name": materials.materials[l["material_id"]].display_name,
                                              "thickness_mm": l["thickness_mm"]} for l in a["layers"]]}
                  for a in doc["assemblies"].values()]
    q = getattr(cand, "quantities", None)
    if q is not None:
        q = q.to_dict() if hasattr(q, "to_dict") else (q.model_dump(mode="json") if hasattr(q, "model_dump") else str(q))
    h = vc.heater
    return {"design_id": doc["design_id"], "revision_id": doc["revision_id"], "orientation_deg": doc["orientation_deg"],
            "template": (cand.extras or {}).get("template_id"), "glazing": (cand.extras or {}).get("glazing"),
            "airtightness_class": (cand.extras or {}).get("airtightness_class"),
            "air_changes_per_hour": (cand.extras or {}).get("air_changes_per_hour"),
            "floors": len(doc["floors"]), "zones": zones, "openings": openings, "assemblies": assemblies,
            "heater_plan": None if h is None else {"capacity_kw_each": h.capacity_kw, "zone_ids": list(h.zone_ids), "fuel": h.fuel,
                                                   "settled_peak_kw": h.settled_peak_kw, "margin": h.margin},
            "quantities": q}


def _perf(result) -> dict:
    return {"simulation_id": result.simulation_id, "engine": result.engine.model_dump(mode="json"),
            "summary": None if result.summary is None else result.summary.model_dump(mode="json"),
            "zones": [z.model_dump(mode="json") for z in result.zones],
            "recommendation_state": result.recommendation_state.value if result.recommendation_state else None}


def write_timeseries(path: Path, result) -> None:
    pts = result.time_series or []
    if not pts:
        return
    zones = sorted(pts[0].zone_temperatures_c)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["timestamp", "ambient_c"] + [f"{z}_temp_c" for z in zones] + [f"{z}_heating_w" for z in zones]
                   + [f"{z}_solar_w" for z in zones])
        for p in pts:
            w.writerow([p.timestamp.isoformat(), p.ambient_temperature_c] + [round(p.zone_temperatures_c.get(z, 0.0), 3) for z in zones]
                       + [round(p.heating_power_w.get(z, 0.0), 1) for z in zones] + [round(p.solar_gain_w.get(z, 0.0), 1) for z in zones])


def build_final_report(requirements, cfg, opt, weather, site_used, evaluator, materials, vsettings, timings, warnings, validation,
                       ml_info) -> tuple[dict, dict]:
    """Returns (report, extras) where extras holds the simulation results the caller writes as CSV."""
    from optimization.rc_verification import verify_candidate
    from optimization import __version__ as m6_version
    from m4_engine import ENGINE_NAME, ENGINE_VERSION

    win = opt.recommended.design_id
    cand, vc = opt.candidate(win), opt.verified[win]
    ev = vc.evaluation
    warnings = list(warnings)

    base_b = uninsulated_baseline(cand.building, materials)
    base_sim = base_perf = None
    if base_b is not None:
        bv = verify_candidate(SimpleNamespace(building=base_b, extras=cand.extras, quantities=None), evaluator, vsettings)
        if bv.status == "verified":
            base_sim = bv.evaluation.capacity_limited
            base_perf = {"design_id": base_b.design_id, "heater_capacity_kw": bv.heater.capacity_kw,
                         "free_floating": _perf(bv.evaluation.free_floating), "conditioned": _perf(bv.evaluation.capacity_limited)}
        else:
            warnings.append(f"baseline could not be verified ({bv.failure.code}: {bv.failure.message}); NPV/payback absent")
            base_b = None
    econ = full_economics(requirements, materials, cand.building, ev.capacity_limited, base_b, base_sim, vsettings.setpoint_c, warnings)

    reliability = None if opt.reliability is None else opt.reliability.to_dict()
    ranking = opt.ranking.to_dict()
    picks_summary = {n: {"design_id": p["design_id"], "status": p["status"], "reason": p["reason"]} for n, p in ranking["picks"].items()}
    outcome = opt.outcome(win)

    report = {
        "report_type": "cocoon_final_design_report", "schema": "PROPOSED cocoon.final_design_report 0 (not an M0 contract)",
        "provenance": {
            "code_commit": _git_commit(), "seed": cfg.seed, "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "m6_version": m6_version, "requirements_sha256": _sha(requirements.model_dump(mode="json")),
            "weather_snapshot_id": weather.snapshot_id, "weather_checksum_sha256": weather.checksum_sha256,
            "weather_is_cached": weather.source.is_cached, "material_snapshot_id": materials.snapshot_id,
            "material_checksum_sha256": materials.checksum_sha256, "ml": ml_info,
            "simulation_window": [str(vsettings.window_start), str(vsettings.window_end)],
            "warmup_hours_excluded": vsettings.warmup_hours, "setpoint_c": vsettings.setpoint_c,
            "ground_temperature_c": vsettings.ground_temperature_c, "timestep_seconds": vsettings.timestep_seconds},
        "input": {"site": requirements.site.model_dump(mode="json"), "mission": requirements.mission.model_dump(mode="json"),
                  "constraints": requirements.constraints.model_dump(mode="json"), "weather_site_used": site_used},
        "recommendation": {"design_id": win, "recommendation_state": vc.recommendation_state.value if vc.recommendation_state else None,
                           "picked_as": list(outcome.picked_as), "why": ranking["picks"]["best_overall"].get("explanation", [])},
        "design": _design_section(cand.building, materials, cand, vc),
        "performance": {"free_floating": _perf(ev.free_floating), "ideal_load": _perf(ev.ideal_load),
                        "conditioned_with_sized_heater": _perf(ev.capacity_limited), "objectives": dict(outcome.objectives),
                        "matched_uninsulated_baseline": base_perf},
        "economics": _econ_summary(econ),
        "picks": ranking["picks"], "pick_summary": picks_summary,
        "alternatives": [o.to_dict() for o in opt.outcomes], "pareto": None if opt.pareto is None else opt.pareto.to_dict(),
        "reliability": reliability, "validation": validation,
        "generation": {"requested": opt.generation.requested, "generated": opt.generation.generated, "summary": opt.summary()},
        "timings_s": dict(timings), "warnings": warnings, "placeholders": PLACEHOLDERS, "notice": NOTICE}
    return report, {"free_floating": ev.free_floating, "conditioned": ev.capacity_limited,
                    "baseline_conditioned": base_sim}


# ----- REPORT.md -------------------------------------------------------------------------------------------------------------
def _f(v, n=1):
    return "-" if v is None else (f"{v:,.{n}f}" if isinstance(v, (int, float)) else str(v))


def render_markdown(r: dict) -> str:
    d, p, e, v = r["design"], r["performance"], r["economics"], r["validation"]
    L = [f"# COCOON final design report", "", f"**Recommended design:** `{d['design_id']}` (revision `{d['revision_id']}`)  ",
         f"**State:** {r['recommendation']['recommendation_state']} | **Validation:** {v['state']}  ",
         f"**Site/weather:** {r['input']['weather_site_used'].get('location_name')} - `{r['provenance']['weather_snapshot_id']}` "
         f"(cached: {r['provenance']['weather_is_cached']})  ",
         f"**Seed:** {r['provenance']['seed']} | **Engine:** {r['provenance']['engine']['name']} {r['provenance']['engine']['version']} "
         f"| **Commit:** {r['provenance']['code_commit'][:8]}", "", "## Why this design"]
    L += [f"- {x['sentence']}" for x in r["recommendation"]["why"]] or ["- (no explanation fields available)"]
    L += ["", "## Shelter", f"Orientation {d['orientation_deg']} deg | {d['floors']} floor(s) | template `{d['template']}` | "
          f"glazing `{d['glazing']}` | airtightness `{d['airtightness_class']}` ({_f(d['air_changes_per_hour'], 2)} ACH)", "",
          "| Room | Type | Floor | Size L x W x H (m) | Heated |", "|---|---|---|---|---|"]
    L += [f"| {z['id']} | {z['type']} | {z['floor']} | {z['size_m']['length_m']} x {z['size_m']['width_m']} x {z['size_m']['height_m']} | "
          f"{'yes' if z['heated'] else 'no'} |" for z in d["zones"]]
    L += ["", "| Assembly | Used for | U (W/m2K) | Layers inner -> outer |", "|---|---|---|---|"]
    L += [f"| {a['id']} | {', '.join(a['used_for'])} | {_f(a['u_value_w_m2k'], 3)} | " +
          " + ".join(f"{l['name']} {l['thickness_mm']:g} mm" for l in a["layers_inner_to_outer"]) + " |" for a in d["assemblies"]]
    L += ["", "| Opening | Type | Room | Area (m2) | Azimuth | U | SHGC |", "|---|---|---|---|---|---|---|"]
    L += [f"| {o['id']} | {o['type']} | {o['zone']} | {o['area_m2']} | {_f(o['azimuth_deg'], 0)} | {o['u_value_w_m2k']} | {_f(o['shgc'], 2)} |"
          for o in d["openings"]]
    h = d["heater_plan"]
    L += ["", f"**Heater:** " + ("none" if not h else f"{h['capacity_kw_each']} kW in each of {', '.join(h['zone_ids'])} ({h['fuel']})"), ""]
    L += ["## Room temperatures (deg C)", "", "| Room | Mode | Min | Mean | Max | Comfort h | Unmet h |", "|---|---|---|---|---|---|---|"]
    for mode in ("free_floating", "conditioned_with_sized_heater"):
        L += [f"| {z['zone_id']} | {mode.replace('_', ' ')} | {_f(z['temperature_min_c'])} | {_f(z['temperature_mean_c'])} | "
              f"{_f(z['temperature_max_c'])} | {_f(z['comfort_hours'])} | {_f(z.get('unmet_hours'))} |" for z in p[mode]["zones"]]
    s = p["ideal_load"]["summary"] or {}
    c = p["conditioned_with_sized_heater"]["summary"] or {}
    L += ["", f"**Heating (ideal load, whole window):** {_f(s.get('heating_energy_kwh'))} kWh, peak {_f(s.get('peak_heating_kw'), 2)} kW. "
          f"**With sized heater:** {_f(c.get('heating_energy_kwh'))} kWh, peak {_f(c.get('peak_heating_kw'), 2)} kW. "
          f"Max energy residual {c.get('energy_residual_max_pct')} %."]
    if p["matched_uninsulated_baseline"]:
        b = p["matched_uninsulated_baseline"]["conditioned"]["summary"] or {}
        L += [f"**Uninsulated baseline (same layout):** {_f(b.get('heating_energy_kwh'))} kWh, peak {_f(b.get('peak_heating_kw'), 2)} kW "
              f"with a {p['matched_uninsulated_baseline']['heater_capacity_kw']} kW heater."]
    L += ["", "## Economics (placeholder prices - not quotes)"]
    if e:
        L += ["", "| Scenario | CAPEX (INR) | Lifecycle cost (INR) | Fuel (L/yr) | NPV vs baseline | Payback (y) | Discounted (y) |", "|---|---|---|---|---|---|---|"]
        for n in ("low", "expected", "high"):
            x = e["scenarios"].get(n)
            if x:
                L.append(f"| {n} | {_f(x['capex']['total_capex_inr'], 0)} | {_f(x['lcc_inr'], 0)} | {_f(x['annual_fuel_litres'])} | "
                         f"{_f(x['npv_vs_baseline_inr'], 0)} | {_f(x['simple_payback_years'])} | {_f(x['discounted_payback_years'])} |")
        L += [f"", f"Assumption set `{e['assumption_set_id']}` v{e['assumption_set_version']} ({e['price_date'][:10]}); baseline: "
              f"{e['baseline']['label'] if e['baseline'] else 'none'}."]
    else:
        L += ["", "Economics were not produced (see warnings)."]
    L += ["", "## The four picks", "", "| Pick | Design | Reason |", "|---|---|---|"]
    L += [f"| {n} | {x['design_id'] or '-'} | {x['reason']} |" for n, x in r["pick_summary"].items()]
    g = r["generation"]
    L += ["", f"{g['generated']} designs generated; outcomes: {g['summary']}."]
    rel = r["reliability"]
    if rel:
        L += ["", "## Reliability", f"Not tested (with reasons): {rel.get('not_tested')}"]
    L += ["", "## Validation", f"State: **{v['state']}**." + (f" {v['reason']}" if v.get("reason") else "")]
    if r["warnings"]:
        L += ["", "## Warnings"] + [f"- {w}" for w in r["warnings"]]
    L += ["", "## Placeholders used"] + [f"- {x['item']} ({x['where']}): {x['note']}" for x in r["placeholders"]]
    L += ["", f"> {r['notice']}", ""]
    return "\n".join(L)
