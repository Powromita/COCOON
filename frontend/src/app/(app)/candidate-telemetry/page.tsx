"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";

// ─── Mock output data (replace with real API responses) ─────────────────────

const EXEC_SUMMARY = {
  runId: "EXP-LDK-8042",
  site: "Eastern Ladakh – DBO Sector",
  season: "Winter 2026-12-07 to 2027-01-04 (28 days)",
  bestCandidate: "C-8042-4 · Aerogel + PCM Core",
  inside_temp_min: "17.2°C",
  inside_temp_avg: "20.4°C",
  delta_t_achieved: "58.4°C",
  solar_gain_daily: "4.2 kWh/day",
  fuel_saved_pct: "62%",
  fuel_kg_per_day: "1.8 kg/day",
  ansys_status: "Converged",
  ansys_residual: "2.1 × 10⁻⁵",
  uValue: "0.112 W/m²K",
  logisticsMass: "2,450 kg",
};

// 24-hour inside vs outside temperature profile (Task 1)
const TEMP_DATA = [
  { h: "00", inside: 18.1, outside: -38.0 },
  { h: "01", inside: 17.8, outside: -38.5 },
  { h: "02", inside: 17.5, outside: -39.0 },
  { h: "03", inside: 17.2, outside: -39.5 },
  { h: "04", inside: 17.4, outside: -39.8 },
  { h: "05", inside: 17.6, outside: -39.2 },
  { h: "06", inside: 17.9, outside: -38.0 },
  { h: "07", inside: 18.4, outside: -35.0 },
  { h: "08", inside: 19.2, outside: -30.0 },
  { h: "09", inside: 20.0, outside: -24.0 },
  { h: "10", inside: 20.8, outside: -18.0 },
  { h: "11", inside: 21.4, outside: -12.0 },
  { h: "12", inside: 22.0, outside: -8.0 },
  { h: "13", inside: 22.3, outside: -7.0 },
  { h: "14", inside: 22.5, outside: -8.5 },
  { h: "15", inside: 22.1, outside: -11.0 },
  { h: "16", inside: 21.5, outside: -17.0 },
  { h: "17", inside: 20.8, outside: -24.0 },
  { h: "18", inside: 20.1, outside: -30.0 },
  { h: "19", inside: 19.5, outside: -34.0 },
  { h: "20", inside: 19.0, outside: -36.0 },
  { h: "21", inside: 18.7, outside: -37.0 },
  { h: "22", inside: 18.4, outside: -37.5 },
  { h: "23", inside: 18.2, outside: -38.0 },
];

// Daily solar energy generated over 28-day period (Task 2)
const SOLAR_DATA = [
  3.8, 4.1, 3.5, 4.6, 5.0, 4.8, 4.3, 4.5, 4.9, 5.1, 4.7, 4.2,
  4.0, 4.4, 4.8, 5.2, 4.9, 4.6, 4.3, 4.1, 3.9, 4.4, 4.7, 5.0,
  4.8, 4.5, 4.2, 4.0,
];

// Hourly heat flow vs ambient delta-T (Task 3)
const HEATFLOW_DATA = [
  { deltaT: 10, q: 120 }, { deltaT: 15, q: 175 }, { deltaT: 20, q: 230 },
  { deltaT: 25, q: 284 }, { deltaT: 30, q: 340 }, { deltaT: 35, q: 395 },
  { deltaT: 40, q: 448 }, { deltaT: 45, q: 504 }, { deltaT: 50, q: 557 },
  { deltaT: 55, q: 612 }, { deltaT: 58, q: 648 },
];

// Multi-material comparison table
const MATERIAL_COMPARISON = [
  { material: "Aerogel + PCM (Optimal)", uVal: 0.112, mass: 2450, fuel: 1.8, cost: 24.5, comfort: 98.2, badge: "BEST" },
  { material: "PUF Panel + Plywood", uVal: 0.142, mass: 1820, fuel: 2.4, cost: 18.2, comfort: 95.1, badge: "" },
  { material: "Stone Masonry", uVal: 0.820, mass: 8200, fuel: 5.8, cost: 12.0, comfort: 76.3, badge: "" },
  { material: "Rammed Earth", uVal: 0.680, mass: 7100, fuel: 4.9, cost: 9.5, comfort: 78.8, badge: "" },
  { material: "Steel Panel (insulated)", uVal: 0.380, mass: 3100, fuel: 3.2, cost: 21.0, comfort: 88.0, badge: "" },
  { material: "GS-10 Legacy Tent", uVal: 4.800, mass: 680, fuel: 12.0, cost: 5.2, comfort: 42.0, badge: "BASELINE" },
];

// ANSYS FEA validation metrics
const ANSYS_METRICS = [
  { label: "Convergence residual", value: "2.1 × 10⁻⁵", target: "< 1 × 10⁻⁴", pass: true },
  { label: "Max wall stress", value: "18.4 MPa", target: "< 35 MPa", pass: true },
  { label: "Thermal gradient (peak)", value: "32.1°C/m", target: "< 50°C/m", pass: true },
  { label: "Snow load capacity", value: "1.8 kN/m²", target: "≥ 1.5 kN/m²", pass: true },
  { label: "Wind pressure resistance", value: "0.95 kN/m²", target: "≥ 0.8 kN/m²", pass: true },
  { label: "Mesh quality (Jacobian)", value: "0.94", target: "> 0.85", pass: true },
  { label: "Node count", value: "284,392", target: "> 100k", pass: true },
  { label: "Solver iterations to converge", value: "1,428", target: "< 5,000", pass: true },
];

// ─── Chart helpers ───────────────────────────────────────────────────────────

function scaleY(val: number, min: number, max: number, height: number, pad = 20) {
  return pad + ((max - val) / (max - min)) * (height - 2 * pad);
}

function TemperatureChart() {
  const W = 600; const H = 220; const PAD = 30;
  const insideMin = 17; const insideMax = 23;
  const outsideMin = -42; const outsideMax = 2;

  // Normalize both series to same 0-H range using their own scales
  const ixs = TEMP_DATA.map((_, i) => PAD + (i / (TEMP_DATA.length - 1)) * (W - 2 * PAD));

  // Combined scale for both lines
  const allMin = -42; const allMax = 23;
  const y = (v: number) => scaleY(v, allMin, allMax, H);

  const insidePath = TEMP_DATA.map((d, i) => `${i === 0 ? "M" : "L"}${ixs[i]},${y(d.inside)}`).join(" ");
  const outsidePath = TEMP_DATA.map((d, i) => `${i === 0 ? "M" : "L"}${ixs[i]},${y(d.outside)}`).join(" ");

  // Shaded area under inside line
  const insideArea = `${insidePath} L${ixs[ixs.length - 1]},${H - PAD} L${ixs[0]},${H - PAD} Z`;
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 180 }}>
      {/* Zero line */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#CBD5E1" strokeDasharray="3,3" strokeWidth={1} />
      <text x={PAD - 4} y={zeroY + 4} fill="#94A3B8" fontSize={9} textAnchor="end">0°</text>

      {/* Y axis labels */}
      {[-40, -20, 0, 15, 20].map(v => (
        <g key={v}>
          <line x1={PAD} y1={y(v)} x2={W - PAD} y2={y(v)} stroke="#F1F5F9" strokeWidth={0.5} />
          <text x={PAD - 4} y={y(v) + 4} fill="#94A3B8" fontSize={8} textAnchor="end">{v}°</text>
        </g>
      ))}

      {/* Comfort band (17–22°C) */}
      <rect x={PAD} y={y(22)} width={W - 2 * PAD} height={y(17) - y(22)} fill="#D1FAE5" opacity={0.35} />

      {/* Shaded inside area */}
      <path d={insideArea} fill="#3B82F6" opacity={0.08} />

      {/* Outside temperature line */}
      <path d={outsidePath} fill="none" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4,3" />

      {/* Inside temperature line */}
      <path d={insidePath} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" />

      {/* Data points at a few hours */}
      {[0, 6, 12, 18, 23].map(i => (
        <circle key={i} cx={ixs[i]} cy={y(TEMP_DATA[i].inside)} r={3} fill="#059669" />
      ))}

      {/* X axis labels */}
      {["00", "04", "08", "12", "16", "20", "23"].map((h) => {
        const idx = TEMP_DATA.findIndex(d => d.h === h);
        return (
          <text key={h} x={ixs[idx] ?? 0} y={H - 2} fill="#94A3B8" fontSize={8} textAnchor="middle">{h}:00</text>
        );
      })}
    </svg>
  );
}

function SolarChart() {
  const W = 600; const H = 160; const PAD = 30;
  const maxVal = Math.max(...SOLAR_DATA);
  const barW = (W - 2 * PAD) / SOLAR_DATA.length - 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      {/* Y gridlines */}
      {[2, 3, 4, 5].map(v => {
        const y = PAD + ((maxVal - v) / maxVal) * (H - 2 * PAD);
        return (
          <g key={v}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F1F5F9" strokeWidth={0.7} />
            <text x={PAD - 4} y={y + 4} fill="#94A3B8" fontSize={8} textAnchor="end">{v}</text>
          </g>
        );
      })}
      {SOLAR_DATA.map((val, i) => {
        const x = PAD + i * ((W - 2 * PAD) / SOLAR_DATA.length);
        const barH = ((val / maxVal) * (H - 2 * PAD));
        const y = H - PAD - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={2} fill={val >= 4.8 ? "#D97706" : "#3B82F6"} opacity={0.85} />
          </g>
        );
      })}
      {/* X axis labels (every 7 days) */}
      {[0, 7, 14, 21, 27].map(i => (
        <text key={i} x={PAD + i * ((W - 2 * PAD) / SOLAR_DATA.length)} y={H - 2} fill="#94A3B8" fontSize={8}>Day {i + 1}</text>
      ))}
    </svg>
  );
}

function HeatFlowChart() {
  const W = 600; const H = 160; const PAD = 30;
  const maxQ = 700; const maxDT = 60;

  const xs = HEATFLOW_DATA.map(d => PAD + (d.deltaT / maxDT) * (W - 2 * PAD));
  const ys = HEATFLOW_DATA.map(d => H - PAD - (d.q / maxQ) * (H - 2 * PAD));
  const path = HEATFLOW_DATA.map((_, i) => `${i === 0 ? "M" : "L"}${xs[i]},${ys[i]}`).join(" ");
  const area = `${path} L${xs[xs.length - 1]},${H - PAD} L${xs[0]},${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      {[200, 400, 600].map(q => {
        const y = H - PAD - (q / maxQ) * (H - 2 * PAD);
        return (
          <g key={q}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F1F5F9" strokeWidth={0.7} />
            <text x={PAD - 4} y={y + 4} fill="#94A3B8" fontSize={8} textAnchor="end">{q}W</text>
          </g>
        );
      })}
      <path d={area} fill="#0F7A8C" opacity={0.1} />
      <path d={path} fill="none" stroke="#0F7A8C" strokeWidth={2.5} strokeLinejoin="round" />
      {HEATFLOW_DATA.map((d, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r={3} fill="#0F7A8C" />
      ))}
      {[10, 20, 30, 40, 50, 58].map(dt => {
        const x = PAD + (dt / maxDT) * (W - 2 * PAD);
        return <text key={dt} x={x} y={H - 2} fill="#94A3B8" fontSize={8} textAnchor="middle">ΔT={dt}°</text>;
      })}
    </svg>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CandidateTelemetryPage() {
  const [activeTab, setActiveTab] = useState<"results" | "solver">("results");
  const [solverRunning, setSolverRunning] = useState(true);
  const [progress, setProgress] = useState(58);
  const logRef = useRef<HTMLDivElement>(null);
  const [logLines, setLogLines] = useState<string[]>([
    "[14:34:27] SOLV: Res: 0.000047 | Courant: 0.417 | T_core: 20.46°C",
    "[14:34:31] SOLV: Res: 0.000024 | Courant: 0.413 | T_core: 20.44°C",
    "[14:34:34] TASK1: Inside temp profile computed for 24h window",
    "[14:34:37] TASK2: Solar GHI integrated — 4.2 kWh/day average",
    "[14:34:40] TASK3: Heat flow vs ΔT curve — 11 data points",
    "[14:34:43] ANSYS: Meshing candidate C-8042-4 — 284,392 nodes",
    "[14:34:46] ANSYS: Iterating... step 200/1428 — Res: 6.2e-3",
    "[14:34:49] SOLV: Res: 0.000040 | Courant: 0.424 | T_core: 20.43°C",
  ]);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!solverRunning) return;
    const id = setInterval(() => {
      const now = new Date();
      const ts = now.toTimeString().slice(0, 8);
      const res = (Math.random() * 0.00006 + 0.00002).toFixed(6);
      const courant = (0.41 + Math.random() * 0.03).toFixed(3);
      const tcore = (20.4 + Math.random() * 0.09).toFixed(2);
      setLogLines(prev => [...prev, `[${ts}] SOLV: Res: ${res} | Courant: ${courant} | T_core: ${tcore}°C`].slice(-30));
      setProgress(p => Math.min(p + 0.3, 100));
      tickRef.current++;
    }, 2800);
    return () => clearInterval(id);
  }, [solverRunning]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const TABS = [
    { id: "results", label: "Simulation Results", icon: "analytics" },
    { id: "solver", label: "Live Solver Log", icon: "terminal" },
  ] as const;

  return (
    <div className="flex flex-col w-full">

      {/* ── Top Ribbon ────────────────────────────────────────────────── */}
      <section className="w-full bg-surface-container-lowest px-gutter-lg py-space-md shadow-sm">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-md max-w-[1720px] mx-auto">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-space-sm">
              <span className="font-label-mono-xs text-label-mono-xs px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase" style={{ backgroundColor: "rgb(236, 251, 252)", color: "rgb(15, 122, 140)" }}>
                DRDO PS 26051 · Simulation Run
              </span>
              <span className="font-label-mono-md text-label-mono-md text-on-surface-variant font-bold font-data">#EXP-LDK-8042</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
              <T>Eastern Ladakh Forward Post – 12-Man Shelter</T>
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              DBO Sector · Elevation 5,065 m · Winter 2026 (28-day analysis)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Solver status badge */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm" style={{ backgroundColor: solverRunning ? "rgb(255,251,235)" : "rgb(236,253,245)" }}>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: solverRunning ? "#D97706" : "#059669" }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: solverRunning ? "#D97706" : "#059669" }} />
              </span>
              <div className="flex flex-col">
                <span className="font-label-mono-xs text-label-mono-xs font-semibold tracking-wide uppercase" style={{ color: solverRunning ? "#D97706" : "#059669" }}>
                  {solverRunning ? `ANSYS RUNNING · ${Math.round(progress)}%` : "ALL TASKS COMPLETE"}
                </span>
                <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
                  {solverRunning ? "Candidate 14 of 24 · 3 tasks active" : "Tasks 1, 2, 3 + ANSYS done"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSolverRunning(v => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary rounded-lg font-label-mono-sm text-label-mono-sm font-medium hover:bg-primary transition-colors hover-lift"
            >
              <span className="material-symbols-outlined text-[16px]">{solverRunning ? "pause_circle" : "play_circle"}</span>
              <T>{solverRunning ? "Pause Solver" : "Resume Solver"}</T>
            </button>
          </div>
        </div>
      </section>

      {/* ── Tab Navigation ────────────────────────────────────────────── */}
      <div className="w-full px-gutter-lg bg-surface-container-low border-b border-outline-variant">
        <div className="max-w-[1720px] mx-auto flex items-center gap-1 pt-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-label-mono-sm text-label-mono-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "bg-surface-container-lowest border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <T>{tab.label}</T>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="w-full px-gutter-lg py-6 max-w-[1720px] mx-auto">

        {activeTab === "results" && (
          <div className="flex flex-col gap-8">

            {/* ══ EXECUTIVE SUMMARY ══════════════════════════════════════ */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[22px]">summarize</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  <T>Executive Summary</T>
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-equilibrium-tint text-equilibrium font-label-mono-xs text-label-mono-xs font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                  Best candidate: {EXEC_SUMMARY.bestCandidate}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                  { label: "Min. Interior Temp", value: EXEC_SUMMARY.inside_temp_min, sub: "During coldest night", icon: "thermostat", color: "text-equilibrium", bg: "bg-equilibrium-tint/30" },
                  { label: "Avg. Interior Temp", value: EXEC_SUMMARY.inside_temp_avg, sub: "28-day average", icon: "thermometer", color: "text-equilibrium", bg: "bg-equilibrium-tint/30" },
                  { label: "ΔT Achieved", value: EXEC_SUMMARY.delta_t_achieved, sub: "Inside vs outside", icon: "thermostat_auto", color: "text-primary", bg: "bg-primary-fixed/20" },
                  { label: "Solar Gain", value: EXEC_SUMMARY.solar_gain_daily, sub: "Daily average", icon: "solar_power", color: "text-thermal", bg: "bg-thermal/10" },
                  { label: "Fuel Saved", value: EXEC_SUMMARY.fuel_saved_pct, sub: "vs GS-10 baseline", icon: "local_fire_department", color: "text-equilibrium", bg: "bg-equilibrium-tint/30" },
                  { label: "Fuel Required", value: EXEC_SUMMARY.fuel_kg_per_day, sub: "Kerosene per day", icon: "oil_barrel", color: "text-on-surface", bg: "bg-surface-container-low" },
                  { label: "ANSYS Status", value: EXEC_SUMMARY.ansys_status, sub: `Residual: ${EXEC_SUMMARY.ansys_residual}`, icon: "verified", color: "text-equilibrium", bg: "bg-equilibrium-tint/30" },
                  { label: "U-Value (Overall)", value: EXEC_SUMMARY.uValue, sub: "Envelope thermal trans.", icon: "layers", color: "text-primary", bg: "bg-primary-fixed/20" },
                ].map((card) => (
                  <div key={card.label} className={`${card.bg} rounded-xl p-4 flex flex-col gap-1.5 border border-white/50`}>
                    <div className="flex items-center justify-between">
                      <span className="font-body-sm text-[10px] text-on-surface-variant uppercase tracking-wide leading-tight">{card.label}</span>
                      <span className={`material-symbols-outlined text-[16px] ${card.color}`}>{card.icon}</span>
                    </div>
                    <span className={`font-data text-xl font-extrabold leading-tight ${card.color}`}>{card.value}</span>
                    <span className="font-body-sm text-[10px] text-on-surface-variant">{card.sub}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ══ SELECTED SHELTER: DIMENSIONS & MATERIALS SPECIFICATION ══ */}
            <section className="bg-surface-container-lowest rounded-2xl border border-line p-5 sm:p-6 shadow-card flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container pb-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-navy text-[22px]">architecture</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                      <T>Selected Shelter: Dimensions &amp; Materials Used</T>
                    </h2>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Configured Archetype: <span className="font-semibold text-navy">12-Man Vaulted Stratified Quonset (Candidate C-8042-4)</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-primary-fixed text-navy text-xs font-bold font-data">
                    R-Value: 78.4 m²·K/W
                  </span>
                  <span className="px-3 py-1 rounded-full bg-equilibrium-tint text-equilibrium text-xs font-bold font-data">
                    U-Value: 0.108 W/m²·K
                  </span>
                </div>
              </div>

              {/* Physical Dimensions Row */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-navy uppercase tracking-wider">
                  <T>1. Physical Dimensions &amp; Geometric Footprint</T>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-3.5 bg-surface-container-low rounded-xl border border-line flex flex-col justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">Length (L)</span>
                    <span className="text-xl font-bold text-navy font-data mt-1">12.0 m</span>
                    <span className="text-[10px] text-ink-muted">12,000 mm overall</span>
                  </div>

                  <div className="p-3.5 bg-surface-container-low rounded-xl border border-line flex flex-col justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">Width (W)</span>
                    <span className="text-xl font-bold text-navy font-data mt-1">4.5 m</span>
                    <span className="text-[10px] text-ink-muted">4,500 mm span</span>
                  </div>

                  <div className="p-3.5 bg-surface-container-low rounded-xl border border-line flex flex-col justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">Apex Height (H)</span>
                    <span className="text-xl font-bold text-navy font-data mt-1">2.8 m</span>
                    <span className="text-[10px] text-ink-muted">2,800 mm ceiling</span>
                  </div>

                  <div className="p-3.5 bg-surface-container-low rounded-xl border border-line flex flex-col justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">Usable Floor Area</span>
                    <span className="text-xl font-bold text-navy font-data mt-1">54.0 m²</span>
                    <span className="text-[10px] text-equilibrium font-medium">4.5 m² / soldier (12 Beds)</span>
                  </div>

                  <div className="p-3.5 bg-surface-container-low rounded-xl border border-line flex flex-col justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">Enclosed Volume</span>
                    <span className="text-xl font-bold text-navy font-data mt-1">126.5 m³</span>
                    <span className="text-[10px] text-ink-muted">Air volume buffer</span>
                  </div>

                  <div className="p-3.5 bg-surface-container-low rounded-xl border border-line flex flex-col justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">Total Dry Weight</span>
                    <span className="text-xl font-bold text-teal font-data mt-1">3,840 kg</span>
                    <span className="text-[10px] text-teal font-medium">CH-47 Heli-Liftable</span>
                  </div>
                </div>
              </div>

              {/* Materials Used Breakdown */}
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-bold text-navy uppercase tracking-wider">
                  <T>2. Materials Used &amp; Multi-Layer Envelope Composition</T>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Layer 1 */}
                  <div className="p-4 bg-surface-container-low rounded-xl border border-line flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant">Outer Protective Layer</span>
                      <span className="text-[10px] font-bold font-data bg-surface-container px-2 py-0.5 rounded text-navy">1.8 mm</span>
                    </div>
                    <h4 className="text-xs font-bold text-navy">Aerodynamic Titanium-Zinc Skin</h4>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Hydrophobic nano-coated exterior designed to shed snow build-up and resist 220 km/h high-altitude blizzard wind loads.
                    </p>
                  </div>

                  {/* Layer 2 */}
                  <div className="p-4 bg-surface-container-low rounded-xl border border-line flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-teal">Thermal Core Insulation</span>
                      <span className="text-[10px] font-bold font-data bg-teal/10 px-2 py-0.5 rounded text-teal">60 mm</span>
                    </div>
                    <h4 className="text-xs font-bold text-navy">Dual-Cavity VIP + Aerogel Blanket</h4>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Ultra-low conductivity core (k = 0.0038 W/m·K) providing extreme sub-zero thermal resistance against -38.2°C ambient frost.
                    </p>
                  </div>

                  {/* Layer 3 */}
                  <div className="p-4 bg-surface-container-low rounded-xl border border-line flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-thermal">Latent Heat Storage</span>
                      <span className="text-[10px] font-bold font-data bg-thermal/10 px-2 py-0.5 rounded text-thermal">35 mm</span>
                    </div>
                    <h4 className="text-xs font-bold text-navy">Bio-PCM Phase Change Core</h4>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Paraffin salt matrix with 21.5°C melting point that absorbs peak daytime solar gains and discharges heat passively at night.
                    </p>
                  </div>

                  {/* Layer 4 */}
                  <div className="p-4 bg-surface-container-low rounded-xl border border-line flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-equilibrium">Internal Habitation Face</span>
                      <span className="text-[10px] font-bold font-data bg-equilibrium/10 px-2 py-0.5 rounded text-equilibrium">12 mm</span>
                    </div>
                    <h4 className="text-xs font-bold text-navy">Anti-Microbial Spruce Timber Ply</h4>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Hygroscopic moisture-buffering timber that prevents condensation and maintains 45% relative humidity indoors.
                    </p>
                  </div>
                </div>

                {/* Additional Component Specs (Glazing, Foundation, Frame) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                  <div className="p-3 bg-surface-container-low/70 rounded-xl border border-line flex items-center gap-3">
                    <span className="material-symbols-outlined text-thermal text-[24px] shrink-0">solar_power</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-on-surface-variant font-medium uppercase">Glazing &amp; Passive Solar</span>
                      <span className="text-xs font-bold text-navy">Triple-Glazed Argon Low-E (SHGC 0.62)</span>
                      <span className="text-[10px] text-ink-muted">U = 0.65 W/m²·K with Trombe wall</span>
                    </div>
                  </div>

                  <div className="p-3 bg-surface-container-low/70 rounded-xl border border-line flex items-center gap-3">
                    <span className="material-symbols-outlined text-teal text-[24px] shrink-0">foundation</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-on-surface-variant font-medium uppercase">Sub-Base &amp; Foundation</span>
                      <span className="text-xs font-bold text-navy">Basalt Rockbed + Aerogel Plinth</span>
                      <span className="text-[10px] text-ink-muted">R-84 barrier against -28°C permafrost</span>
                    </div>
                  </div>

                  <div className="p-3 bg-surface-container-low/70 rounded-xl border border-line flex items-center gap-3">
                    <span className="material-symbols-outlined text-navy text-[24px] shrink-0">view_in_ar</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-on-surface-variant font-medium uppercase">Structural Spaceframe</span>
                      <span className="text-xs font-bold text-navy">Aluminium 6061-T6 Modular Truss</span>
                      <span className="text-[10px] text-ink-muted">Zero wet-trades · 18.5 hr field erection</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ══ TASK 1: INSIDE TEMPERATURE PREDICTION ══════════════════ */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold bg-primary-container text-on-primary uppercase">Task 1</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                      <T>Inside Temperature Prediction</T>
                    </h2>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Typical 24-hour diurnal cycle · Best candidate C-8042-4 · Dec 21, 2026 (coldest day)
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-6 rounded-full" style={{ backgroundColor: "#059669" }} />
                    <span className="font-body-sm text-[11px] text-on-surface">Inside temp</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-0.5 w-6 border-t-2 border-dashed border-slate-400" />
                    <span className="font-body-sm text-[11px] text-on-surface">Outside temp</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-6 rounded opacity-40" style={{ backgroundColor: "#D1FAE5" }} />
                    <span className="font-body-sm text-[11px] text-on-surface">Comfort zone (17–22°C)</span>
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-low rounded-xl p-4">
                <TemperatureChart />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Minimum inside temp", value: "17.2°C", sub: "03:00 – coldest hour" },
                  { label: "Maximum inside temp", value: "22.5°C", sub: "14:00 – solar peak" },
                  { label: "Outside range", value: "−39.8 to −7.0°C", sub: "Diurnal swing: 32.8°C" },
                  { label: "Hours below 15°C", value: "0 hours", sub: "✓ Meets DRDO requirement" },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 bg-surface-container-low rounded-xl">
                    <div className="font-data text-base font-bold text-equilibrium">{stat.value}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{stat.label}</div>
                    <div className="font-body-sm text-[10px] text-primary mt-0.5">{stat.sub}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* ══ TASK 2: SOLAR THERMAL ENERGY ═══════════════════════════ */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold bg-thermal/20 text-thermal uppercase">Task 2</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                      <T>Solar Thermal Energy Generated</T>
                    </h2>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Daily solar energy harvested by shelter envelope · 28-day analysis period
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded" style={{ backgroundColor: "#D97706" }} />
                    <span className="font-body-sm text-[11px] text-on-surface">High solar day (≥ 4.8 kWh)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded" style={{ backgroundColor: "#3B82F6" }} />
                    <span className="font-body-sm text-[11px] text-on-surface">Normal day</span>
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-low rounded-xl p-4">
                <SolarChart />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Average daily solar gain", value: "4.2 kWh/day", sub: "28-day mean" },
                  { label: "Peak solar day", value: "5.2 kWh", sub: "Day 16 (clear sky)" },
                  { label: "Total over analysis", value: "117.6 kWh", sub: "28-day cumulative" },
                  { label: "GHI at site", value: "312 W/m²", sub: "Average daily peak irradiance" },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 bg-surface-container-low rounded-xl">
                    <div className="font-data text-base font-bold text-thermal">{stat.value}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{stat.label}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{stat.sub}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* ══ TASK 3: HEAT FLOW VS AMBIENT ΔT ═══════════════════════ */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold uppercase" style={{ backgroundColor: "#CFFAFE", color: "#0F7A8C" }}>Task 3</span>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                      <T>Heat Flow vs. Ambient Temperature Difference</T>
                    </h2>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Total heat loss through envelope as a function of inside-to-outside temperature difference (ΔT)
                  </p>
                </div>
              </div>
              <div className="bg-surface-container-low rounded-xl p-4">
                <HeatFlowChart />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Heat loss at ΔT = 58°C", value: "648 W", sub: "Ladakh winter worst case" },
                  { label: "Effective U-value", value: "0.112 W/m²K", sub: "Whole-envelope thermal transmittance" },
                  { label: "Peak auxiliary heat needed", value: "8.4 kWh/day", sub: "To maintain 18°C inside" },
                  { label: "Thermal mass buffer", value: "6.2 h", sub: "Passive thermal lag time" },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 bg-surface-container-low rounded-xl">
                    <div className="font-data text-base font-bold" style={{ color: "#0F7A8C" }}>{stat.value}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{stat.label}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{stat.sub}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* ══ MULTI-MATERIAL COMPARISON ═══════════════════════════════ */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">compare</span>
                <div>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                    <T>Multi-Material Comparative Analysis</T>
                  </h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    All selected materials evaluated under identical site and occupancy conditions
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="py-3 px-4 font-semibold">Material / Configuration</th>
                      <th className="py-3 px-4 font-semibold text-right">U-Value (W/m²K)</th>
                      <th className="py-3 px-4 font-semibold text-right">Mass (kg)</th>
                      <th className="py-3 px-4 font-semibold text-right">Fuel (kg/day)</th>
                      <th className="py-3 px-4 font-semibold text-right">Cost (₹L)</th>
                      <th className="py-3 px-4 font-semibold text-right">Comfort hrs (%)</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {MATERIAL_COMPARISON.map((row) => (
                      <tr key={row.material} className={`hover:bg-surface-container-low/40 transition-colors ${row.badge === "BEST" ? "bg-equilibrium-tint/20" : row.badge === "BASELINE" ? "bg-surface-container-low" : ""}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-body-sm text-body-sm text-on-surface font-medium">{row.material}</span>
                            {row.badge === "BEST" && (
                              <span className="px-1.5 py-0.5 rounded font-label-mono-xs text-[10px] font-bold bg-equilibrium text-white uppercase">✓ Optimal</span>
                            )}
                            {row.badge === "BASELINE" && (
                              <span className="px-1.5 py-0.5 rounded font-label-mono-xs text-[10px] font-bold bg-surface-container text-on-surface-variant uppercase">Baseline</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-data text-sm font-semibold" style={{ color: row.uVal < 0.2 ? "#059669" : row.uVal > 1 ? "#DC2626" : "#D97706" }}>
                          {row.uVal}
                        </td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.mass.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-data text-sm font-semibold" style={{ color: row.fuel < 3 ? "#059669" : row.fuel > 8 ? "#DC2626" : "#D97706" }}>
                          {row.fuel}
                        </td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.cost}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-20 h-1.5 rounded-full bg-surface-container overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${row.comfort}%`, backgroundColor: row.comfort > 90 ? "#059669" : row.comfort > 70 ? "#D97706" : "#DC2626" }} />
                            </div>
                            <span className="font-data text-xs font-bold" style={{ color: row.comfort > 90 ? "#059669" : row.comfort > 70 ? "#D97706" : "#DC2626" }}>
                              {row.comfort}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {row.badge === "BEST" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-equilibrium">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>Recommended
                            </span>
                          ) : row.badge === "BASELINE" ? (
                            <span className="text-[11px] text-on-surface-variant">Legacy ref</span>
                          ) : (
                            <span className="text-[11px] text-on-surface-variant">Evaluated</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ══ ANSYS FEA VALIDATION ════════════════════════════════════ */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">verified</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                      <T>ANSYS FEA Validation Metrics</T>
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      High-fidelity finite element analysis results for best candidate C-8042-4
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-equilibrium-tint">
                  <span className="material-symbols-outlined text-equilibrium text-[18px]">check_circle</span>
                  <span className="font-label-mono-sm text-label-mono-sm text-equilibrium font-semibold">ALL CHECKS PASSED</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ANSYS_METRICS.map((metric) => (
                  <div key={metric.label} className="flex items-center justify-between p-4 rounded-xl border border-outline-variant bg-surface-container-low">
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined text-[20px] ${metric.pass ? "text-equilibrium" : "text-error"}`}>
                        {metric.pass ? "check_circle" : "cancel"}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-body-sm text-body-sm text-on-surface font-medium">{metric.label}</span>
                        <span className="font-body-sm text-[11px] text-on-surface-variant">Required: {metric.target}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`font-data text-sm font-bold ${metric.pass ? "text-equilibrium" : "text-error"}`}>
                        {metric.value}
                      </span>
                      <span className={`font-label-mono-xs text-[10px] font-semibold ${metric.pass ? "text-equilibrium" : "text-error"}`}>
                        {metric.pass ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href={ROUTES.candidateDetail("C-8042-4")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary/90 transition-colors hover-lift shadow-md"
                >
                  <span className="material-symbols-outlined text-[18px]">view_in_ar</span>
                  <T>Inspect 3D Cutaway &amp; Materials</T>
                </Link>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors hover-lift"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  <T>Print / Save Telemetry Report</T>
                </button>
              </div>
            </section>

          </div>
        )}

        {/* ── Solver Log Tab ─────────────────────────────────────────── */}
        {activeTab === "solver" && (
          <div className="flex flex-col gap-6">

            {/* Pipeline stage cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { num: "01", title: "Geometry Generation", status: "done", detail: "3,200 configurations generated", pct: 100 },
                { num: "02", title: "RC Network Solver", status: "done", detail: "Evaluated in 4.2 seconds", pct: 100 },
                { num: "03", title: "ML Surrogate Filter", status: "done", detail: "Top 120 candidates shortlisted", pct: 100 },
                { num: "04", title: "ANSYS MAPDL FEA", status: "running", detail: `Candidate 14/24 · Res: 2.1e-5`, pct: progress },
                { num: "05", title: "Report Generation", status: "pending", detail: "Awaiting ANSYS completion", pct: 0 },
              ].map((stage) => (
                <div key={stage.num} className={`rounded-xl p-4 shadow-card flex flex-col gap-2 relative overflow-hidden ${stage.status === "running" ? "bg-surface-container-lowest border border-thermal/30" : stage.status === "done" ? "bg-surface-container-lowest" : "bg-surface-container-low opacity-75"}`}>
                  {stage.status === "running" && <div className="absolute top-0 left-0 right-0 h-0.5 bg-thermal" />}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center font-label-mono-xs text-label-mono-xs font-bold shrink-0 text-[10px]"
                        style={{ backgroundColor: stage.status === "done" ? "#ECFDF5" : stage.status === "running" ? "#FEF3C7" : "#F1F5F9", color: stage.status === "done" ? "#059669" : stage.status === "running" ? "#D97706" : "#64748B" }}>
                        {stage.num}
                      </span>
                      <span className="font-headline-sm text-headline-sm text-on-surface text-sm">{stage.title}</span>
                    </div>
                    <span className={`material-symbols-outlined text-[16px] ${stage.status === "done" ? "text-equilibrium" : stage.status === "running" ? "animate-spin text-thermal" : "text-outline-variant"}`}>
                      {stage.status === "done" ? "check_circle" : stage.status === "running" ? "autorenew" : "hourglass_empty"}
                    </span>
                  </div>
                  <span className="font-label-mono-xs text-[11px] text-on-surface-variant">{stage.detail}</span>
                  <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${stage.pct}%`, backgroundColor: stage.status === "done" ? "#059669" : stage.status === "running" ? "#D97706" : "#94A3B8" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Live ANSYS terminal */}
            <div className="mono-scope bg-inverse-surface text-inverse-on-surface rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-outline/30">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]" style={{ color: "#0F7A8C" }}>terminal</span>
                  <span className="font-label-mono-sm text-label-mono-sm font-semibold">ANSYS MAPDL · RC SOLVER ENGINE LOG</span>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#0F7A8C" }} />
                  <span className="font-label-mono-xs text-[11px]" style={{ color: "#7DD3E7" }}>
                    {solverRunning ? "STREAMING" : "PAUSED"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="px-2 py-0.5 bg-surface-container/20 hover:bg-surface-container/30 text-surface-container rounded font-label-mono-xs text-label-mono-xs transition-colors" type="button"
                    onClick={() => setLogLines(["[BUFFER RESET] Awaiting live MAPDL convergence packet..."])}>
                    CLEAR
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 bg-black/20 p-3 rounded-xl border border-outline/10">
                {[
                  { label: "EXTERIOR T_INF", val: "-38.20 °C", col: "#90A8FF" },
                  { label: "INTERIOR T_CORE", val: "+20.42 °C", col: "#34D399" },
                  { label: "COURANT NO.", val: `0.421 (STABLE)`, col: "#FBBF24" },
                ].map(m => (
                  <div key={m.label} className="flex flex-col">
                    <span className="font-label-mono-xs text-[9px] text-outline-variant">{m.label}</span>
                    <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: m.col }}>{m.val}</span>
                  </div>
                ))}
              </div>
              <div
                ref={logRef}
                aria-live="polite"
                className="font-label-mono-xs text-label-mono-xs leading-relaxed flex flex-col gap-0.5 overflow-y-auto max-h-80 p-3 bg-black/30 rounded-xl select-text"
              >
                {logLines.map((line, i) => (
                  <div key={i} className="text-surface-container-high">
                    <span className="text-secondary-fixed">{line.slice(0, 11)}</span>
                    {line.slice(11)}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
