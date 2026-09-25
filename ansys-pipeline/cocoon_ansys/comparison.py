"""
comparison.py - The same frozen scenario through the multi-zone RC engine,
then RC-vs-ANSYS metrics (PRD v4 §14.10).

The RC side is thermal-calculator/multiroom_rc.py (run_multiroom_simulation),
unmodified. Its inputs are derived here from the SAME resolved geometry and
the SAME boundary_conditions.csv that ANSYS used:

    U (every surface)  1 / (r_inside_film + sum(t/k) + r_outside_film)
                       from the contract assembly; openings use their U
    areas              built areas (== contract areas, checked in geometry)
    capacitance        air + EFFECTIVE_MASS_FRACTION x layer mass of the
                       zone's exterior constructions, interface mass split
                       half/half - the multiroom_input.py convention
    forcing            T_out, T_ground, window POA, internal gains
    initial state      scenario initial temperature, warm-up OFF (ANSYS
                       starts from the same uniform state)

ANSYS values at t_k+1 are compared with the RC state after step k.
Metrics are descriptive; no accuracy threshold is claimed (PRD §14.10).
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

from cocoon_ansys.paths import ensure_import_paths

ensure_import_paths()

from multiroom_rc import Room, RoomSchedule, Surface, Window, run_multiroom_simulation  # noqa: E402

try:
    from multiroom_input import EFFECTIVE_MASS_FRACTION                                 # noqa: E402
except Exception:                                                                      # noqa: BLE001
    EFFECTIVE_MASS_FRACTION = 0.5

RHO_AIR, CP_AIR = 1.2, 1005.0


def _u(r_in, layers, r_out):
    return 1.0 / (r_in + sum(L["t"] / L["k"] for L in layers) + r_out)


def _areal_heat_capacity(layers):
    return sum(L["rho"] * L["cp"] * L["t"] for L in layers)


# Diagnostic only: the position-weighted rule of the legacy single-zone model
# (thermal-calculator/heat_transfer.position_weight, R_coupling validated at
# 0.8 m2K/W). Each layer counts exp(-R_to_room / R_c) of its mass instead of
# a flat EFFECTIVE_MASS_FRACTION. Reported beside the official result so the
# physics owner can see its effect; the official comparison is unchanged.
POSITION_WEIGHT_R_COUPLING = 0.8


def _weighted_heat_capacity(layers, r_in):
    total, r = 0.0, r_in
    for L in layers:                                   # inner -> outer
        r_layer = L["t"] / L["k"]
        total += L["rho"] * L["cp"] * L["t"] * np.exp(-(r + 0.5 * r_layer)
                                                       / POSITION_WEIGHT_R_COUPLING)
        r += r_layer
    return total


def rc_inputs(model, bc, initial_temperature_c, mass_rule="fraction"):
    """mass_rule: 'fraction' (multiroom_input convention, official) or
    'position_weighted' (diagnostic)."""
    def cap_ext(layers, r_in):
        if mass_rule == "position_weighted":
            return _weighted_heat_capacity(layers, r_in)
        return EFFECTIVE_MASS_FRACTION * _areal_heat_capacity(layers)

    cap = {zid: RHO_AIR * CP_AIR * z["volume_m3"] for zid, z in model.zones.items()}
    surfaces, windows = [], []
    ops_by_surface = {}
    for o in model.openings.values():
        ops_by_surface.setdefault(o["surface_id"], []).append(o)

    for sid, s in model.surfaces.items():
        if s["boundary"] not in ("outdoors", "ground"):
            continue
        ops = ops_by_surface.get(sid, [])
        net = s["built_area_m2"] - sum(o["area_m2"] for o in ops)
        surfaces.append(Surface(surface_id=sid, room_id=s["zone_id"], area_m2=net,
                                U_W_m2K=_u(s["r_inside"], s["layers"], s["r_outside"]),
                                boundary_type="outdoor" if s["boundary"] == "outdoors" else "ground"))
        cap[s["zone_id"]] += cap_ext(s["layers"], s["r_inside"]) * net
        for o in ops:
            windows.append(Window(window_id=o["id"], room_id=s["zone_id"], area_m2=o["area_m2"],
                                  U_W_m2K=o["u_value_w_m2k"],
                                  SHGC=o["shgc"] if o["type"] == "window" else 0.0,
                                  shading_factor=o["shading_factor"]))

    for itf in model.interfaces:
        sid = itf["surface_id"]
        ops = ops_by_surface.get(sid, [])
        net = itf["area_m2"] - sum(o["area_m2"] for o in ops)
        surfaces.append(Surface(surface_id=sid, room_id=itf["a"], area_m2=net,
                                U_W_m2K=_u(itf["r_film_a"], itf["layers"], itf["r_film_b"]),
                                boundary_type="adjacent", adjacent_room_id=itf["b"]))
        if mass_rule == "position_weighted":
            cap[itf["a"]] += 0.5 * _weighted_heat_capacity(itf["layers"], itf["r_film_a"]) * net
            cap[itf["b"]] += 0.5 * _weighted_heat_capacity(itf["layers"][::-1], itf["r_film_b"]) * net
        else:
            half = 0.5 * EFFECTIVE_MASS_FRACTION * _areal_heat_capacity(itf["layers"]) * net
            cap[itf["a"]] += half
            cap[itf["b"]] += half
        for o in ops:
            surfaces.append(Surface(surface_id=o["id"], room_id=itf["a"], area_m2=o["area_m2"],
                                    U_W_m2K=o["u_value_w_m2k"], boundary_type="adjacent",
                                    adjacent_room_id=itf["b"]))

    rooms = [Room(room_id=zid, name=zid, room_type=z["type"], volume_m3=z["volume_m3"],
                  capacitance_J_K=cap[zid], initial_temperature_C=initial_temperature_c,
                  storey=z["level"] + 1, has_floor_boundary=True)
             for zid, z in model.zones.items()]
    schedules = {}
    for zid in model.zones:
        irr = {o["id"]: bc[f"POA_{o['id']}_W_m2"].tolist()
               for o in model.openings.values()
               if o["zone_id"] == zid and f"POA_{o['id']}_W_m2" in bc}
        schedules[zid] = RoomSchedule(internal_heat_W=bc[f"Qint_{zid}_W"].tolist(),
                                      ventilation_ACH=0.0, solar_irradiance=irr)
    return rooms, surfaces, windows, schedules


def run_rc(model, bc, initial_temperature_c, mass_rule="fraction"):
    rooms, surfaces, windows, schedules = rc_inputs(model, bc, initial_temperature_c, mass_rule)
    res = run_multiroom_simulation(
        rooms, surfaces, windows,
        outdoor_temperature_C=bc["T_out_C"].tolist(),
        ground_temperature_C=bc["T_ground_C"].tolist(),
        schedules=schedules, timestep_seconds=3600,
        timestamps=bc["timestamp"].tolist(), warmup_days=0)
    rooms_out = res["rooms"]
    ts_end = [(pd.Timestamp(t) + pd.Timedelta(hours=1)).isoformat() for t in bc["timestamp"]]
    df = pd.DataFrame({"timestamp": ts_end})
    for zid in model.zones:
        r = rooms_out[zid]
        df[f"T_{zid}_C"] = np.round(r["temperature_C"], 4)
        df[f"Qenv_loss_{zid}_W"] = np.round(-np.asarray(r["Q_envelope_W"]), 3)
        df[f"Qinterzone_in_{zid}_W"] = np.round(r["Q_interzone_W"], 3)
    rc_meta = {
        "engine": "thermal-calculator/multiroom_rc.py run_multiroom_simulation",
        "effective_mass_fraction": EFFECTIVE_MASS_FRACTION,
        "rooms": {r.room_id: {"capacitance_MJ_K": round(r.capacitance_J_K / 1e6, 4),
                              "volume_m3": r.volume_m3} for r in rooms},
        "surfaces": [{"id": s.surface_id, "room": s.room_id, "boundary": s.boundary_type,
                      "adjacent": s.adjacent_room_id, "area_m2": round(s.area_m2, 4),
                      "U_W_m2K": round(s.U_W_m2K, 4)} for s in surfaces],
        "windows": [{"id": w.window_id, "room": w.room_id, "area_m2": round(w.area_m2, 4),
                     "U_W_m2K": w.U_W_m2K, "SHGC": w.SHGC} for w in windows],
    }
    return df, rc_meta


def _metrics(ansys, rc):
    a, r = np.asarray(ansys, float), np.asarray(rc, float)
    err = a - r
    ss_tot = float(np.sum((a - a.mean()) ** 2))
    return {"mae_c": round(float(np.mean(np.abs(err))), 4),
            "rmse_c": round(float(np.sqrt(np.mean(err ** 2))), 4),
            "max_abs_error_c": round(float(np.max(np.abs(err))), 4),
            "bias_c": round(float(np.mean(err)), 4),
            "r_squared": round(1.0 - float(np.sum(err ** 2)) / ss_tot, 4) if ss_tot > 0 else None}


def compare(job_dir, model, bc, initial_temperature_c):
    job_dir = Path(job_dir)
    ansys = pd.read_csv(job_dir / "temperature_series.csv")
    flux = pd.read_csv(job_dir / "heat_flux_series.csv")
    surf_t = pd.read_csv(job_dir / "surface_temperature_series.csv")
    rc, rc_meta = run_rc(model, bc, initial_temperature_c)
    rc.to_csv(job_dir / "rc_series.csv", index=False)
    if list(ansys["timestamp"]) != list(rc["timestamp"]):
        raise RuntimeError("RC and ANSYS timestamps do not line up")
    rc_pw, rc_pw_meta = run_rc(model, bc, initial_temperature_c, mass_rule="position_weighted")

    zones, a_all, r_all, pw_all = {}, [], [], []
    diag = {}
    for zid in model.zones:
        a, r = ansys[f"T_{zid}_C"], rc[f"T_{zid}_C"]
        zones[zid] = _metrics(a, r)
        zones[zid].update({"ansys_mean_c": round(float(a.mean()), 3),
                           "rc_mean_c": round(float(r.mean()), 3),
                           "ansys_min_c": round(float(a.min()), 3),
                           "rc_min_c": round(float(r.min()), 3)})
        ext = [(sid, s) for sid, s in model.surfaces.items()
               if s["zone_id"] == zid and s["boundary"] in ("outdoors", "ground")]
        # room-side envelope loss: through each exterior surface's inside film
        # (A/r_in x (T_zone - T_inner_surface)) plus the openings' outer-face
        # flow (glazing/door cores hold ~no heat). Comparable with RC's
        # envelope term, which is heat leaving the zone node.
        qa = pd.Series(0.0, index=ansys.index)
        for sid, s in ext:
            col = f"T_{sid}_C"
            if col in surf_t:
                qa += s["film_face_area_m2"] / s["r_inside"] * (a - surf_t[col])
            qa += flux[[c for c in flux.columns if c.startswith(f"Q_{sid}/")]].sum(axis=1)
        outer = flux[[c for c in flux.columns
                      if any(c == f"Q_{sid}_W" or c.startswith(f"Q_{sid}/") for sid, _ in ext)]].sum(axis=1)
        if ext:
            qr = rc[f"Qenv_loss_{zid}_W"]
            zones[zid]["envelope_loss_ansys_mean_w"] = round(float(qa.mean()), 1)
            zones[zid]["envelope_loss_rc_mean_w"] = round(float(qr.mean()), 1)
            zones[zid]["envelope_loss_mae_w"] = round(float(np.mean(np.abs(qa - qr))), 1)
            zones[zid]["outer_face_loss_ansys_mean_w"] = round(float(outer.mean()), 1)
        diag[zid] = _metrics(a, rc_pw[f"T_{zid}_C"])
        diag[zid]["rc_mean_c"] = round(float(rc_pw[f"T_{zid}_C"].mean()), 3)
        a_all.append(a.to_numpy())
        r_all.append(r.to_numpy())
        pw_all.append(rc_pw[f"T_{zid}_C"].to_numpy())
    pooled = _metrics(np.concatenate(a_all), np.concatenate(r_all))
    diagnostics = {
        "position_weighted_capacitance": {
            "purpose": "diagnostic only - NOT the official RC result",
            "rule": f"layer mass x exp(-R_to_room / {POSITION_WEIGHT_R_COUPLING}) "
                    "(legacy heat_transfer.position_weight) instead of "
                    f"EFFECTIVE_MASS_FRACTION={EFFECTIVE_MASS_FRACTION}",
            "pooled": _metrics(np.concatenate(a_all), np.concatenate(pw_all)),
            "zones": diag,
            "rooms_capacitance_MJ_K": {k: v["capacitance_MJ_K"]
                                       for k, v in rc_pw_meta["rooms"].items()},
        }
    }

    # ranking agreement: order of zones by mean temperature
    rank_a = sorted(model.zones, key=lambda z: -zones[z]["ansys_mean_c"])
    rank_r = sorted(model.zones, key=lambda z: -zones[z]["rc_mean_c"])
    out = {
        "pooled": pooled,
        "zones": zones,
        "zone_ranking_by_mean_temperature": {"ansys": rank_a, "rc": rank_r,
                                             "agree": rank_a == rank_r},
        "hours": int(len(ansys)),
        "compared_quantity": "volume-weighted zone air temperature (ANSYS) vs zone node "
                             "temperature (RC), end of each hour",
        "rc": rc_meta,
        "envelope_loss_definition": "room side: inside-film flow of exterior opaque surfaces "
                                    "+ opening outer-face flow; 'outer_face_loss' also "
                                    "includes heat released by mass outboard of the room",
        "diagnostics": diagnostics,
        "note": "Descriptive agreement for this exact revision and scenario only; "
                "not a general accuracy claim.",
    }
    (job_dir / "comparison_metrics.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    _plot(job_dir, model, ansys, rc, bc)
    return out


def _plot(job_dir, model, ansys, rc, bc):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return
    t = pd.to_datetime(ansys["timestamp"])
    zids = list(model.zones)
    fig, axes = plt.subplots(len(zids), 1, figsize=(10, 2.8 * len(zids) + 0.6), sharex=True,
                             squeeze=False)
    for ax, zid in zip(axes[:, 0], zids):
        ax.plot(t, ansys[f"T_{zid}_C"], color="#3E7CB1", lw=2, label="ANSYS MAPDL (FEM)")
        ax.plot(t, rc[f"T_{zid}_C"], color="#E8934A", lw=2, ls="--", label="Multi-zone RC")
        ax.set_ylabel(f"{zid}\n°C")
        ax.grid(alpha=0.3)
    axes[0, 0].legend(loc="best", frameon=False)
    axes[-1, 0].set_xlabel("time (end of hour)")
    fig.suptitle("Zone air temperature: independent RC vs ANSYS solutions, same scenario")
    fig.tight_layout()
    fig.savefig(job_dir / "rc_vs_ansys.png", dpi=130)
    plt.close(fig)
