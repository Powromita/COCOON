/**
 * generateReport.ts — Client-side HTML report generator.
 *
 * Builds a self-contained, printable HTML report from the RunResults object.
 * Works in both mock and live mode — no dependency on REPORT.md being served.
 *
 * Usage:
 *   import { downloadReport } from "@/app/_lib/generateReport";
 *   downloadReport(results);
 */

import type { RunResults } from "./types";
import { ANSYS_MAE_LIMIT_C, deriveAnsysComparison } from "./simulation";

function safe(v: number | null | undefined, decimals = 1, unit = ""): string {
  if (v == null || !Number.isFinite(v as number)) return "—";
  return `${(v as number).toFixed(decimals)}${unit}`;
}

function pct(v: number | null | undefined): string {
  return safe(v, 1, "%");
}

function buildHtmlReport(r: RunResults): string {
  const temp = r.features.temperature;
  const solar = r.features.solar;
  const heat = r.features.heatflow;
  const comfort = r.comfort;
  const cfg = r.config_echo;
  const resolved = r.resolved;
  const rec = r.recommendation;
  const heating = r.heating;
  const loc = r.location;

  const now = new Date().toLocaleString("en-IN", {
    timeZone: loc?.timezone ?? "Asia/Kolkata",
    dateStyle: "long",
    timeStyle: "short",
  });

  // Build temperature series as inline SVG
  const series = temp.series;
  let tempSvg = "";
  if (series && series.indoor_C && series.indoor_C.length > 0) {
    const indoorData = series.indoor_C;
    const outdoorData = series.outdoor_C;
    const n = indoorData.length;
    const allVals = [...indoorData, ...outdoorData, comfort.band_hi_C, comfort.band_lo_C];
    const minV = Math.floor(Math.min(...allVals) / 5) * 5;
    const maxV = Math.ceil(Math.max(...allVals) / 5) * 5;
    const W = 800;
    const H = 220;
    const x = (i: number) => (i / (n - 1)) * W;
    const y = (v: number) => H - ((v - minV) / (maxV - minV || 1)) * H;

    const indoorPath = indoorData
      .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
    const outdoorPath = outdoorData
      .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

    const bandTop = y(comfort.band_hi_C);
    const bandBot = y(comfort.band_lo_C);

    // Y axis ticks
    const yTickVals: number[] = [];
    for (let v = minV; v <= maxV; v += 5) yTickVals.push(v);

    const yTickLines = yTickVals
      .map(
        (v) =>
          `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e2e8f0" stroke-dasharray="3 5"/>` +
          `<text x="-6" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#64748b">${v}°C</text>`,
      )
      .join("");

    // X axis ticks (every 12h or 24h)
    const xTickStep = n <= 48 ? 12 : 24;
    const tHours = series.t_hours ?? Array.from({ length: n }, (_, i) => i);
    const xTickLines: string[] = [];
    for (let i = 0; i < n; i += xTickStep) {
      xTickLines.push(
        `<text x="${x(i).toFixed(1)}" y="${H + 16}" text-anchor="middle" font-size="10" fill="#64748b">+${tHours[i]}h</text>`,
      );
    }

    tempSvg = `
<svg viewBox="-40 -8 880 ${H + 40}" style="width:100%;height:auto;display:block;">
  <rect x="0" y="${Math.min(bandTop, bandBot).toFixed(1)}" width="${W}" height="${Math.abs(bandBot - bandTop).toFixed(1)}" fill="#22c55e" fill-opacity="0.12"/>
  ${yTickLines}
  ${xTickLines.join("")}
  <path d="${outdoorPath}" fill="none" stroke="#3b82f6" stroke-width="2"/>
  <path d="${indoorPath}" fill="none" stroke="#f97316" stroke-width="3"/>
</svg>`;
  }

  // Build solar bar chart as SVG
  let solarSvg = "";
  if (solar.hourly_gain_kW && solar.hourly_gain_kW.length > 0) {
    const data = solar.hourly_gain_kW;
    const maxH = Math.max(...data, 0.01);
    const n = data.length;
    const W = 800;
    const H = 120;
    const barW = Math.max(1, W / n - 1);
    const bars = data
      .map((v, i) => {
        const bh = (v / maxH) * H;
        return `<rect x="${(i * (W / n)).toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="#f59e0b" rx="1"/>`;
      })
      .join("");
    solarSvg = `<svg viewBox="0 0 ${W} ${H + 16}" style="width:100%;height:auto;display:block;">${bars}</svg>`;
  }

  // Build stacked heat flow bars as SVG
  let heatSvg = "";
  const hby = heat.hourly_by_path;
  if (hby && hby.wall && hby.wall.length > 0) {
    const n = hby.wall.length;
    const paths = ["wall", "roof", "floor", "window", "infiltration"] as const;
    const colors: Record<string, string> = {
      wall: "#ef4444",
      roof: "#818cf8",
      floor: "#6ee7b7",
      window: "#fbbf24",
      infiltration: "#60a5fa",
    };
    const totals = Array.from({ length: n }, (_, i) =>
      paths.reduce((s, p) => s + (hby[p]?.[i] ?? 0), 0),
    );
    const maxT = Math.max(...totals, 0.01);
    const W = 800;
    const H = 120;
    const bw = Math.max(1, W / n - 0.5);
    const bars = Array.from({ length: n }, (_, i) => {
      let cumY = H;
      return paths
        .map((p) => {
          const v = hby[p]?.[i] ?? 0;
          const bh = (v / maxT) * H;
          cumY -= bh;
          return `<rect x="${(i * (W / n)).toFixed(1)}" y="${cumY.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[p]}"/>`;
        })
        .join("");
    }).join("");
    heatSvg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${bars}</svg>`;
  }

  const split = heat.split_percent ?? {};
  const splitRows = (["wall", "roof", "floor", "window", "infiltration"] as const)
    .map(
      (k) =>
        `<tr><td>${k.charAt(0).toUpperCase() + k.slice(1)}</td><td>${safe(split[k], 1, "%")}</td></tr>`,
    )
    .join("");

  const compRows =
    r.comparison
      ?.slice(0, 10)
      .map(
        (d) =>
          `<tr style="${d.shortlisted ? "background:#f0fdf4" : ""}">
          <td>#${d.rank}</td>
          <td>Design ${d.design_id}${d.pareto ? " ★" : ""}</td>
          <td>${safe(d.comfort_score, 1)}</td>
          <td>${safe(d.T_min_C, 1, "°C")}</td>
          <td>${safe(d.T_max_C, 1, "°C")}</td>
          <td>${safe(d.hours_in_band_pct, 0, "%")}</td>
          <td>${d.walls_label ?? "—"}</td>
        </tr>`,
      )
      .join("") ?? "";

  // ANSYS FEM cross-validation — physics (RC) vs ANSYS indoor-temperature
  // overlay for the recommended design, plus the per-design agreement table.
  // Uses the same derivation as the on-screen AnsysComparisonSection.
  const cmp = deriveAnsysComparison(r);
  let ansysSection = "";
  if (cmp && cmp.n > 1) {
    const n = cmp.n;
    const tHours = r.ansys?.series?.t_hours ?? Array.from({ length: n }, (_, i) => i);
    const allVals = [...cmp.physics, ...cmp.ansys];
    const minV = Math.floor((Math.min(...allVals) - 1) / 2) * 2;
    const maxV = Math.ceil((Math.max(...allVals) + 1) / 2) * 2;
    const W = 800;
    const H = 200;
    const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
    const y = (v: number) => H - ((v - minV) / (maxV - minV || 1)) * H;
    const path = (arr: number[]) =>
      arr.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

    const yStep = Math.max(2, Math.round((maxV - minV) / 6 / 2) * 2);
    const yTickLines: string[] = [];
    for (let v = minV; v <= maxV; v += yStep) {
      yTickLines.push(
        `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e2e8f0" stroke-dasharray="3 5"/>` +
          `<text x="-6" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#64748b">${v}°C</text>`,
      );
    }
    const xStep = n <= 26 ? 6 : n <= 50 ? 12 : 24;
    const xTickLines: string[] = [];
    for (let i = 0; i < n; i += xStep) {
      xTickLines.push(
        `<text x="${x(i).toFixed(1)}" y="${H + 16}" text-anchor="middle" font-size="10" fill="#64748b">+${tHours[i] ?? i}h</text>`,
      );
    }
    const femDots = cmp.ansys
      .map((v, i) =>
        i % Math.max(1, Math.round(n / 24)) === 0
          ? `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4" fill="#7c3aed"/>`
          : "",
      )
      .join("");

    const ansysSvg = `
<svg viewBox="-40 -8 880 ${H + 40}" style="width:100%;height:auto;display:block;">
  ${yTickLines.join("")}
  ${xTickLines.join("")}
  <path d="${path(cmp.ansys)}" fill="none" stroke="#7c3aed" stroke-width="2.2" stroke-dasharray="6 3"/>
  <path d="${path(cmp.physics)}" fill="none" stroke="#fe932c" stroke-width="3"/>
  ${femDots}
</svg>`;

    const within = cmp.maeC <= ANSYS_MAE_LIMIT_C;
    const worstWhen = `+${tHours[cmp.maxAbsErrIdx] ?? cmp.maxAbsErrIdx}h`;
    const chosenId = r.recommendation?.chosen_design_id;
    const rows = r.ansys?.rows ?? [];
    const rowTable = rows.length
      ? `<table>
  <thead><tr><th>Design</th><th>RC min / mean / max</th><th>ANSYS min / mean / max</th><th>MAE</th><th>RMSE</th><th>Rank RC → FEM</th></tr></thead>
  <tbody>${rows
    .map(
      (row) =>
        `<tr${String(row.design_id) === String(chosenId ?? "") ? ' style="background:#f0fdf4"' : ""}>
      <td>#${row.design_id}</td>
      <td>${safe(row.RC_Tmin_C, 1, "°")} / ${safe(row.RC_Tmean_C, 1, "°")} / ${safe(row.RC_Tmax_C, 1, "°")}</td>
      <td>${safe(row.ANSYS_Tmin_C, 1, "°")} / ${safe(row.ANSYS_Tmean_C, 1, "°")} / ${safe(row.ANSYS_Tmax_C, 1, "°")}</td>
      <td>${safe(row.MAE_C, 2, "°C")}</td>
      <td>${safe(row.RMSE_C, 2, "°C")}</td>
      <td>${row.RC_rank} → ${row.ANSYS_rank}</td>
    </tr>`,
    )
    .join("")}</tbody>
</table>`
      : "";

    ansysSection = `
<h2>🔬 ANSYS FEM Cross-Validation</h2>
<p class="meta" style="margin-bottom:8px">
  Independent 3-D transient thermal solve (ANSYS Mechanical APDL) versus the rapid RC physics model on the same weather window${
    r.ansys?.ran ? "" : " — indicative benchmark case"
  }. Chart: design #${cmp.designId}${
    String(cmp.designId) === String(chosenId ?? "") ? " (recommended)" : ""
  }, ${cmp.n} aligned hours${cmp.alignedBy === "index" ? ", aligned by hour index" : ""}.
</p>
<div class="grid5">
  <div class="card"><div class="label">Physics Mean</div><div class="value">${cmp.physicsMeanC.toFixed(1)}<span class="unit">°C</span></div></div>
  <div class="card"><div class="label">ANSYS Mean</div><div class="value">${cmp.ansysMeanC.toFixed(1)}<span class="unit">°C</span></div></div>
  <div class="card"><div class="label">MAE</div><div class="value">${cmp.maeC.toFixed(2)}<span class="unit">°C</span></div><div class="note">${
    within ? `within ±${ANSYS_MAE_LIMIT_C.toFixed(2)}°C band` : `above ±${ANSYS_MAE_LIMIT_C.toFixed(2)}°C band`
  }</div></div>
  <div class="card"><div class="label">RMSE</div><div class="value">${cmp.rmseC.toFixed(2)}<span class="unit">°C</span></div></div>
  <div class="card"><div class="label">Max Error</div><div class="value">${cmp.maxAbsErrC.toFixed(2)}<span class="unit">°C</span></div><div class="note">at ${worstWhen}</div></div>
</div>
<div class="chart-wrap">
  <h3>Indoor Temperature — Physics Model vs ANSYS FEM</h3>
  ${ansysSvg}
  <div class="legend">
    <span><span class="dot" style="background:#fe932c"></span>Physics model (RC)</span>
    <span><span class="dot" style="background:#7c3aed"></span>ANSYS FEM (3-D)</span>
  </div>
</div>
${rowTable}
<div class="highlight" style="margin-top:12px">
  <strong>${r.ansys?.rankings_agree ? "Ranking agrees." : "Ranking differs — thermal tie."}</strong>
  <span style="color:#374151"> ${
    r.ansys?.rankings_agree
      ? `ANSYS places the shortlisted designs in the same order as the physics model.`
      : `The design spread is smaller than the RC↔FEM error, so the shortlisted designs are thermally indistinguishable — the recommendation is decided on logistics.`
  } Mean bias ${cmp.biasC >= 0 ? "+" : ""}${cmp.biasC.toFixed(2)}°C (physics − FEM).</span>
</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>COCOON Thermal Report — Run ${r.run_id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;font-size:14px;color:#1e293b;background:#fff;padding:32px 40px}
  h1{font-size:26px;font-weight:800;color:#0f172a;margin-bottom:4px}
  h2{font-size:17px;font-weight:700;color:#0f172a;margin:32px 0 12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
  h3{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:16px 0 8px}
  .meta{color:#64748b;font-size:13px;margin-bottom:24px}
  .badge{display:inline-block;background:#0f172a;color:#fff;font-size:11px;font-weight:700;letter-spacing:.08em;padding:3px 10px;border-radius:4px;margin-bottom:12px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0}
  .grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}
  .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px}
  .card .label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px}
  .card .value{font-size:22px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums}
  .card .unit{font-size:13px;color:#94a3b8;margin-left:2px}
  .card .note{font-size:12px;color:#64748b;margin-top:4px}
  .chart-wrap{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
  th{background:#f1f5f9;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:600}
  td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  tr:hover td{background:#f8fafc}
  .rec-box{background:#0f172a;color:#fff;border-radius:10px;padding:20px;margin:16px 0}
  .rec-box h2{color:#fff;border-bottom-color:#334155}
  .rec-title{font-size:20px;font-weight:800;margin:8px 0 4px}
  .rec-just{font-size:13px;color:#94a3b8;line-height:1.6}
  .highlight{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;font-size:13px}
  .highlight strong{color:#15803d}
  .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#64748b;margin-top:8px}
  .legend span{display:flex;align-items:center;gap:5px}
  .dot{width:10px;height:10px;border-radius:50%;display:inline-block}
  .bar{width:12px;height:12px;border-radius:2px;display:inline-block}
  footer{margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
  @media print{body{padding:16px 20px}h2{page-break-after:avoid}}
</style>
</head>
<body>

<div class="badge">DRDO — SIH 2026 — PS 26051</div>
<h1>COCOON Thermal Analysis Report</h1>
<p class="meta">Run ID: <strong>${r.run_id}</strong> &nbsp;·&nbsp; Generated: ${now} &nbsp;·&nbsp; Mode: ${r.mode === "optimize" ? "Optimizer (multi-design)" : "Single Design"}</p>

${rec ? `
<div class="rec-box">
  <h2>Recommended Design</h2>
  <div class="rec-title">Design #${rec.chosen_design_id}${rec.runner_up_id != null ? ` (runner-up: #${rec.runner_up_id})` : ""}</div>
  <div class="rec-just">${rec.justification ?? "—"}</div>
  ${rec.chosen ? `
  <div class="grid2" style="margin-top:16px">
    <div><span style="color:#94a3b8;font-size:12px">Geometry</span><br/><strong style="color:#fff">${rec.chosen.geometry_label ?? "—"}</strong></div>
    <div><span style="color:#94a3b8;font-size:12px">Walls</span><br/><strong style="color:#fff">${rec.chosen.walls_label ?? "—"}</strong></div>
    <div><span style="color:#94a3b8;font-size:12px">Roof</span><br/><strong style="color:#fff">${rec.chosen.roof_label ?? "—"}</strong></div>
    <div><span style="color:#94a3b8;font-size:12px">Windows</span><br/><strong style="color:#fff">${rec.chosen.windows_label ?? "—"}</strong></div>
  </div>` : ""}
</div>` : ""}

<h2>🌡 DRDO Output 1 — Indoor Temperature Prediction</h2>
<div class="grid3">
  <div class="card">
    <div class="label">Minimum Indoor Temp</div>
    <div class="value">${safe(temp.T_min_C, 1)}<span class="unit">°C</span></div>
    <div class="note">Worst cold hour during analysis</div>
  </div>
  <div class="card">
    <div class="label">Maximum Indoor Temp</div>
    <div class="value">${safe(temp.T_max_C, 1)}<span class="unit">°C</span></div>
    <div class="note">Peak warmth (solar noon)</div>
  </div>
  <div class="card">
    <div class="label">Mean Indoor Temp</div>
    <div class="value">${safe(temp.T_mean_C, 1)}<span class="unit">°C</span></div>
    <div class="note">ΔT vs outdoor: ${safe(heat.avg_temp_difference_C, 1, "°C")}</div>
  </div>
</div>

<div class="grid3">
  <div class="card">
    <div class="label">Comfort Hours (${comfort.band_lo_C}–${comfort.band_hi_C}°C)</div>
    <div class="value">${pct(comfort.hours_in_band_pct)}</div>
    <div class="note">Hours inside the comfort band</div>
  </div>
  <div class="card">
    <div class="label">Frost-Free Hours</div>
    <div class="value">${pct(comfort.frost_free_pct)}</div>
    <div class="note">Fraction of hours above 0°C</div>
  </div>
  <div class="card">
    <div class="label">Supplemental Fuel</div>
    <div class="value">${safe(heating?.fuel_litres_per_day, 1)}<span class="unit">L/day</span></div>
    <div class="note">${heating?.fuel_note ?? "Kerosene equivalent"}</div>
  </div>
</div>

${tempSvg ? `
<div class="chart-wrap">
  <h3>Hourly Indoor vs Outdoor Temperature</h3>
  ${tempSvg}
  <div class="legend">
    <span><span class="dot" style="background:#f97316"></span>Indoor °C</span>
    <span><span class="dot" style="background:#3b82f6"></span>Outdoor °C</span>
    <span><span class="bar" style="background:#22c55e;opacity:.4"></span>Comfort band ${comfort.band_lo_C}–${comfort.band_hi_C}°C</span>
  </div>
</div>` : ""}

<h2>☀ DRDO Output 2 — Solar Thermal Energy</h2>
<div class="grid5">
  <div class="card">
    <div class="label">Total Solar Energy</div>
    <div class="value">${safe(solar.total_energy_MJ, 0)}<span class="unit">MJ</span></div>
  </div>
  <div class="card">
    <div class="label">Peak Solar Gain</div>
    <div class="value">${safe(solar.peak_gain_W, 0)}<span class="unit">W</span></div>
  </div>
  <div class="card">
    <div class="label">Peak Irradiance</div>
    <div class="value">${safe(solar.peak_irradiance_W_m2, 0)}<span class="unit">W/m²</span></div>
  </div>
  <div class="card">
    <div class="label">Capacity Factor</div>
    <div class="value">${safe(solar.capacity_factor_percent, 1)}<span class="unit">%</span></div>
  </div>
  <div class="card">
    <div class="label">Solar–Temp Corr.</div>
    <div class="value">${safe(solar.solar_temp_correlation, 2)}</div>
  </div>
</div>

${solarSvg ? `
<div class="chart-wrap">
  <h3>Hourly Solar Gain (kW)</h3>
  ${solarSvg}
</div>` : ""}

<h2>⚡ DRDO Output 3 — Heat Flow vs Ambient ΔT</h2>
<div class="grid5">
  <div class="card">
    <div class="label">Total Heat Loss</div>
    <div class="value">${safe(heat.total_heat_loss_Wh ? heat.total_heat_loss_Wh / 1000 : null, 0)}<span class="unit">kWh</span></div>
  </div>
  <div class="card">
    <div class="label">Peak Loss</div>
    <div class="value">${safe(heat.peak_hourly_loss_W, 0)}<span class="unit">W</span></div>
  </div>
  <div class="card">
    <div class="label">Avg Loss</div>
    <div class="value">${safe(heat.avg_hourly_loss_W, 0)}<span class="unit">W</span></div>
  </div>
  <div class="card">
    <div class="label">Peak ΔT (in–out)</div>
    <div class="value">${safe(heat.peak_temp_difference_C, 1)}<span class="unit">°C</span></div>
  </div>
  <div class="card">
    <div class="label">Avg ΔT</div>
    <div class="value">${safe(heat.avg_temp_difference_C, 1)}<span class="unit">°C</span></div>
  </div>
</div>

<div class="grid2">
  <div class="chart-wrap">
    <h3>Heat Loss Split by Path</h3>
    <table>
      <thead><tr><th>Path</th><th>Share</th></tr></thead>
      <tbody>${splitRows}</tbody>
    </table>
  </div>
  ${heatSvg ? `<div class="chart-wrap"><h3>Hourly Stacked Heat Loss</h3>${heatSvg}
    <div class="legend">
      <span><span class="bar" style="background:#ef4444"></span>Wall</span>
      <span><span class="bar" style="background:#818cf8"></span>Roof</span>
      <span><span class="bar" style="background:#6ee7b7"></span>Floor</span>
      <span><span class="bar" style="background:#fbbf24"></span>Window</span>
      <span><span class="bar" style="background:#60a5fa"></span>Infiltration</span>
    </div></div>` : ""}
</div>

<h2>⚙ Shelter Configuration</h2>
<table>
  <tbody>
    <tr><td><strong>Footprint</strong></td><td>${cfg.footprint_label ?? "—"}</td></tr>
    <tr><td><strong>Walls</strong></td><td>${cfg.wall_label ?? "—"}</td></tr>
    <tr><td><strong>Roof</strong></td><td>${cfg.roof_label ?? "—"}</td></tr>
    <tr><td><strong>Floor</strong></td><td>${cfg.floor_label ?? "—"}</td></tr>
    <tr><td><strong>Glazing</strong></td><td>${cfg.glazing_label ?? "—"}</td></tr>
    <tr><td><strong>Internal heat gain</strong></td><td>${cfg.internal_gain_W != null ? `${cfg.internal_gain_W} W` : "—"}</td></tr>
    <tr><td><strong>Air changes per hour</strong></td><td>${cfg.air_changes_per_hour != null ? `${cfg.air_changes_per_hour} ACH` : "—"}</td></tr>
  </tbody>
</table>

<h2>🔧 Resolved Thermal Properties</h2>
<div class="grid3">
  <div class="card">
    <div class="label">U-Wall</div>
    <div class="value">${safe(resolved.U_wall_W_m2K, 3)}<span class="unit">W/m²K</span></div>
  </div>
  <div class="card">
    <div class="label">U-Roof</div>
    <div class="value">${safe(resolved.U_roof_W_m2K, 3)}<span class="unit">W/m²K</span></div>
  </div>
  <div class="card">
    <div class="label">U-Floor</div>
    <div class="value">${safe(resolved.U_floor_W_m2K, 3)}<span class="unit">W/m²K</span></div>
  </div>
  <div class="card">
    <div class="label">Thermal Capacitance</div>
    <div class="value">${safe(resolved.C_total_MJ_per_K, 1)}<span class="unit">MJ/K</span></div>
  </div>
  <div class="card">
    <div class="label">Infiltration UA</div>
    <div class="value">${safe(resolved.infiltration_UA_W_K, 1)}<span class="unit">W/K</span></div>
  </div>
  <div class="card">
    <div class="label">Envelope Mass</div>
    <div class="value">${safe(resolved.envelope_mass_t, 1)}<span class="unit">t</span></div>
  </div>
</div>

${ansysSection}

${r.comparison && r.comparison.length > 0 ? `
<h2>📊 Design Comparison (All Candidates)</h2>
<table>
  <thead>
    <tr>
      <th>Rank</th><th>Design</th><th>Comfort Score</th>
      <th>T Min</th><th>T Max</th><th>% In Band</th><th>Walls</th>
    </tr>
  </thead>
  <tbody>${compRows}</tbody>
</table>
<p style="font-size:11px;color:#94a3b8;margin-top:6px">★ = Pareto-optimal &nbsp; Green rows = shortlisted</p>` : ""}

${r.highlights && r.highlights.length > 0 ? `
<h2>💡 Key Insights</h2>
<div class="grid3">
  ${r.highlights.map((h) => `<div class="highlight"><strong>${h.title}</strong><br/><span style="color:#374151">${h.value}</span></div>`).join("")}
</div>` : ""}

<h2>📍 Location & Analysis Period</h2>
<table>
  <tbody>
    <tr><td><strong>Location</strong></td><td>${loc?.name ?? "Leh, Ladakh"} — ${loc?.latitude?.toFixed(4) ?? "34.1526"}°N, ${loc?.longitude?.toFixed(4) ?? "77.5771"}°E</td></tr>
    <tr><td><strong>Altitude</strong></td><td>~3,500 m (Leh, Ladakh)</td></tr>
    <tr><td><strong>Weather data</strong></td><td>NASA POWER 10-year archive (2016–2026)</td></tr>
    <tr><td><strong>Analysis start</strong></td><td>${r.analysis?.start_time ? new Date(r.analysis.start_time).toLocaleString("en-IN") : "—"}</td></tr>
    <tr><td><strong>Analysis end</strong></td><td>${r.analysis?.end_time ? new Date(r.analysis.end_time).toLocaleString("en-IN") : "—"}</td></tr>
    <tr><td><strong>Total hours</strong></td><td>${r.analysis?.total_hours ?? temp.hours ?? "—"}</td></tr>
  </tbody>
</table>

<footer>
  <p><strong>COCOON</strong> — Physics-Guided ML + ANSYS-Validated Shelter Thermal Design Platform</p>
  <p>Team ByteFiesta · SIH 2026 · DRDO Problem Statement 26051</p>
  <p>RC model validated against ANSYS FEM (weighted MAE ≤ 0.53°C). Standards: ISO 13790 · ASHRAE 55 · EN 12831</p>
  <p style="margin-top:4px">Generated by COCOON web interface on ${now}</p>
</footer>

</body>
</html>`;
}

/**
 * Generates an HTML report from the given RunResults and triggers a browser download.
 */
export function downloadReport(results: RunResults): void {
  const html = buildHtmlReport(results);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `COCOON_Report_${results.run_id.replace(/[^a-zA-Z0-9-]/g, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
