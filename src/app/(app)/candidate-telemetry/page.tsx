"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { CandidateId } from "@/lib/mock-data";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

type LogLine = { key: number; ts?: string; msg: string };
type PlotMode = "pareto" | "envelope" | "radar";

const MAX_LOG_LINES = 25;
const TICK_MS = 3200;

// Residual history captured in the Stitch prototype; the live tick appends to it.
const SEED_LOG: [string, string][] = [
  ["14:34:27.544", "SOLV: Res: 0.000047 | Courant: 0.417 | T_core: 20.46°C"],
  ["14:34:31.223", "SOLV: Res: 0.000024 | Courant: 0.413 | T_core: 20.44°C"],
  ["14:34:34.225", "SOLV: Res: 0.000034 | Courant: 0.430 | T_core: 20.40°C"],
  ["14:34:37.144", "SOLV: Res: 0.000062 | Courant: 0.421 | T_core: 20.45°C"],
  ["14:34:40.344", "SOLV: Res: 0.000039 | Courant: 0.426 | T_core: 20.45°C"],
  ["14:34:43.544", "SOLV: Res: 0.000040 | Courant: 0.424 | T_core: 20.43°C"],
  ["14:34:46.744", "SOLV: Res: 0.000058 | Courant: 0.417 | T_core: 20.42°C"],
  ["14:34:49.945", "SOLV: Res: 0.000040 | Courant: 0.435 | T_core: 20.48°C"],
  ["14:34:53.145", "SOLV: Res: 0.000076 | Courant: 0.438 | T_core: 20.40°C"],
  ["14:34:56.345", "SOLV: Res: 0.000037 | Courant: 0.435 | T_core: 20.48°C"],
  ["14:34:59.545", "SOLV: Res: 0.000079 | Courant: 0.418 | T_core: 20.41°C"],
  ["14:35:02.745", "SOLV: Res: 0.000077 | Courant: 0.417 | T_core: 20.41°C"],
  ["14:35:05.945", "SOLV: Res: 0.000065 | Courant: 0.411 | T_core: 20.48°C"],
  ["14:35:09.144", "SOLV: Res: 0.000080 | Courant: 0.438 | T_core: 20.47°C"],
  ["14:35:12.345", "SOLV: Res: 0.000046 | Courant: 0.434 | T_core: 20.40°C"],
  ["14:35:15.545", "SOLV: Res: 0.000048 | Courant: 0.423 | T_core: 20.46°C"],
  ["14:35:18.744", "SOLV: Res: 0.000029 | Courant: 0.420 | T_core: 20.44°C"],
  ["14:35:21.945", "SOLV: Res: 0.000025 | Courant: 0.417 | T_core: 20.43°C"],
  ["14:35:25.145", "SOLV: Res: 0.000050 | Courant: 0.434 | T_core: 20.44°C"],
  ["14:35:28.345", "SOLV: Res: 0.000042 | Courant: 0.435 | T_core: 20.46°C"],
  ["14:35:31.545", "SOLV: Res: 0.000022 | Courant: 0.422 | T_core: 20.47°C"],
  ["14:35:34.745", "SOLV: Res: 0.000068 | Courant: 0.435 | T_core: 20.41°C"],
  ["14:35:37.944", "SOLV: Res: 0.000070 | Courant: 0.431 | T_core: 20.44°C"],
  ["14:35:41.144", "SOLV: Res: 0.000030 | Courant: 0.440 | T_core: 20.45°C"],
  ["14:35:44.345", "SOLV: Res: 0.000053 | Courant: 0.420 | T_core: 20.41°C"]
];

const PLOT_ACTIVE = "px-space-sm py-1 bg-surface-container-lowest text-on-surface rounded shadow-sm font-label-mono-xs text-label-mono-xs font-semibold";
const PLOT_IDLE = "px-space-sm py-1 text-on-surface-variant hover:text-on-surface rounded font-label-mono-xs text-label-mono-xs font-medium";
const CARD_SECONDARY = "hover-lift py-1 px-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface rounded text-label-mono-xs font-label-mono-xs font-medium text-center transition-colors";

function solverTick(): Omit<LogLine, "key"> {
  const now = new Date();
  const ts = `${now.toTimeString().split(" ")[0]}.${now.getMilliseconds()}`;
  const residual = (Math.random() * (0.00008 - 0.00002) + 0.00002).toFixed(6);
  const courant = (0.41 + Math.random() * 0.03).toFixed(3);
  return { ts, msg: `SOLV: Res: ${residual} | Courant: ${courant} | T_core: 20.4${Math.floor(Math.random() * 9)}°C` };
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CandidateTelemetryPage() {
  const router = useRouter();
  const t = useT();
  const nextKey = useRef(SEED_LOG.length);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<LogLine[]>(() => SEED_LOG.map(([ts, msg], key) => ({ key, ts, msg })));
  const [suspended, setSuspended] = useState(false);
  const [plotMode, setPlotMode] = useState<PlotMode>("pareto");
  const [queued, setQueued] = useState<Partial<Record<CandidateId, boolean>>>({});

  // Live solver residual stream (paused while suspended).
  useEffect(() => {
    if (suspended) return;
    const id = setInterval(() => {
      setLog((prev) => [...prev, { key: nextKey.current++, ...solverTick() }].slice(-MAX_LOG_LINES));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [suspended]);

  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  function clearTerminalLog() {
    setLog([{ key: nextKey.current++, msg: "[TERMINAL BUFFER RESET] Awaiting live MAPDL convergence packet..." }]);
  }

  function exportResiduals() {
    const rows = log.filter((l) => l.ts).map((l) => `${l.ts},"${l.msg}"`);
    download("EXP-LDK-8042-residuals.csv", ["timestamp,entry", ...rows].join("\n"), "text/csv");
  }

  function snapshotState() {
    const snapshot = { run: "EXP-LDK-8042", generation: 48, suspended, capturedAt: new Date().toISOString(), log };
    download("EXP-LDK-8042-snapshot.json", JSON.stringify(snapshot, null, 2), "application/json");
  }

  const toggleQueued = (id: CandidateId) => setQueued((q) => ({ ...q, [id]: !q[id] }));

  // Whole candidate card opens its dossier; inner buttons/links keep their own behaviour.
  const cardLink = (id: CandidateId) => ({
    role: "link" as const,
    tabIndex: 0,
    "aria-label": `${t("Open candidate dossier")} #${id}`,
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      if (!(e.target as HTMLElement).closest("a, button")) router.push(ROUTES.candidateDetail(id));
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && e.target === e.currentTarget) router.push(ROUTES.candidateDetail(id));
    },
  });

  return (
    <>
      <div className="flex flex-col w-full">
        {/* Top Command & Status Ribbon */}
        <section className="w-full bg-surface-container-lowest px-gutter-lg py-space-md shadow-sm">
          <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="font-label-mono-xs text-label-mono-xs px-space-xs py-0.5 rounded-full font-semibold tracking-wider uppercase" style={{ backgroundColor: "rgb(236, 251, 252)", color: "rgb(15, 122, 140)" }}>
                  <T>GENERATIVE SOLVER RUN</T>
                </span>
                <span className="font-label-mono-md text-label-mono-md text-on-surface-variant font-bold tracking-tight font-data">
                  #EXP-LDK-8042
                </span>
                <span className="text-outline-variant font-label-mono-xs">/</span>
                <span className="font-label-mono-xs text-label-mono-xs font-medium tracking-wide" style={{ color: "rgb(100, 116, 139)" }}>
                  <T>MIL-STD-810H CLIMATE ZONE VII-EXTREME COLD</T>
                </span>
              </div>
              <div className="flex items-center gap-space-md">
                <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                  <T>Eastern Ladakh Forward Post 12-Man Shelter Optimization</T>
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-space-md">
              <div className="flex items-center gap-space-sm px-space-md py-1.5 rounded-xl shadow-sm" style={{ backgroundColor: "rgb(255, 251, 235)" }}>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#D97706" }} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: "#D97706" }} />
                </span>
                <div className="flex flex-col">
                  <span className="font-label-mono-xs text-label-mono-xs font-semibold tracking-wide uppercase" style={{ color: "#D97706" }}>
                    <T>{suspended ? "PARETO SOLVER SUSPENDED" : "ACTIVE PARETO SOLVER RUNNING"}</T>
                  </span>
                  <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
                    <T>Generation</T>{" "}
                    <span className="font-bold font-data" style={{ color: "#D97706" }}>48</span>
                    {" "}/ <span className="font-data">100</span> • <span className="font-data">32</span> <T>parallel worker nodes</T>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-xs">
                <button type="button" aria-pressed={suspended} onClick={() => setSuspended((v) => !v)} className="flex items-center gap-space-xs px-space-md py-1.5 bg-primary-container text-on-primary rounded text-label-mono-sm font-label-mono-sm font-medium hover:bg-primary transition-colors hover-lift">
                  <span className="material-symbols-outlined text-[16px]">{suspended ? "play_circle" : "pause_circle"}</span>
                  <span className="">
                    <T>{suspended ? "RESUME SOLVER" : "SUSPEND SOLVER"}</T>
                  </span>
                </button>
                <button type="button" onClick={snapshotState} className="flex items-center gap-space-xs px-space-md py-1.5 bg-surface-container text-on-surface rounded text-label-mono-sm font-label-mono-sm font-medium hover:bg-surface-container-high transition-colors hover-lift">
                  <span className="material-symbols-outlined text-[16px]">file_download</span>
                  <span className=""><T>SNAPSHOT STATE</T></span>
                </button>
              </div>
            </div>
          </div>
        </section>
        {/* Pipeline Decomposition Stages (Horizontal Stage Flow) */}
        <section className="w-full px-gutter-lg py-6 bg-surface">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Stage 1 */}
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-card flex flex-col justify-between gap-space-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center font-label-mono-xs text-label-mono-xs font-bold shrink-0" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                    01
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface"><T>Spatial Geometry</T></span>
                </div>
                <span className="material-symbols-outlined text-[16px] font-bold" style={{ color: "#059669" }}>check_circle</span>
              </div>
              <div className="flex flex-col gap-0.5 mt-space-xs">
                <span className="font-label-mono-xs text-label-mono-xs font-medium" style={{ color: "#059669" }}>
                  <T>COMPLETED (</T><span className="font-data">100%</span>)
                </span>
                <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant"><span className="font-data">3,200</span> <T>valid meshes generated</T></span>
              </div>
              <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden mt-1">
                <div className="h-full w-full" style={{ backgroundColor: "#059669" }} />
              </div>
            </div>
            {/* Stage 2 */}
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-card flex flex-col justify-between gap-space-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center font-label-mono-xs text-label-mono-xs font-bold shrink-0" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                    02
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface"><T>RC Network Solver</T></span>
                </div>
                <span className="material-symbols-outlined text-[16px] font-bold" style={{ color: "#059669" }}>check_circle</span>
              </div>
              <div className="flex flex-col gap-0.5 mt-space-xs">
                <span className="font-label-mono-xs text-label-mono-xs font-medium" style={{ color: "#059669" }}>
                  <T>COMPLETED (</T><span className="font-data">100%</span>)
                </span>
                <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant"><span className="font-data">3,200</span> <T>runs evaluated in</T> <span className="font-data">4.2s</span></span>
              </div>
              <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden mt-1">
                <div className="h-full w-full" style={{ backgroundColor: "#059669" }} />
              </div>
            </div>
            {/* Stage 3 */}
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-card flex flex-col justify-between gap-space-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center font-label-mono-xs text-label-mono-xs font-bold shrink-0" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                    03
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface"><T>ML Surrogate Filter</T></span>
                </div>
                <span className="material-symbols-outlined text-[16px] font-bold" style={{ color: "#059669" }}>check_circle</span>
              </div>
              <div className="flex flex-col gap-0.5 mt-space-xs">
                <span className="font-label-mono-xs text-label-mono-xs font-medium" style={{ color: "#059669" }}>
                  <T>SURROGATE SCREEN</T>
                </span>
                <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant"><T>Top</T> <span className="font-data">120</span> <T>candidates shortlisted</T></span>
              </div>
              <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden mt-1">
                <div className="h-full w-full" style={{ backgroundColor: "#059669" }} />
              </div>
            </div>
            {/* Stage 4 */}
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-card flex flex-col justify-between gap-space-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: "#D97706" }} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center font-label-mono-xs text-label-mono-xs font-bold shrink-0" style={{ backgroundColor: "#FEF3C7", color: "#D97706" }}>
                    04
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface"><T>ANSYS MAPDL</T></span>
                </div>
                <span className="material-symbols-outlined text-[16px] animate-spin" style={{ color: "#D97706" }}>autorenew</span>
              </div>
              <div className="flex flex-col gap-0.5 mt-space-xs">
                <span className="font-label-mono-xs text-label-mono-xs font-medium" style={{ color: "#D97706" }}>
                  <T>CONVERGING (</T><span className="font-data">58%</span>)
                </span>
                <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant"><T>Candidate</T> <span className="font-data">14</span> <T>of</T> <span className="font-data">24</span> <T>• Res:</T> <span className="font-data">10⁻⁵</span></span>
              </div>
              <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden mt-1">
                <div className="h-full w-[58%]" style={{ backgroundColor: "#D97706" }} />
              </div>
            </div>
            {/* Stage 5 */}
            <div className="bg-surface-container-low p-5 rounded-xl shadow-card flex flex-col justify-between gap-space-xs opacity-85">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center font-label-mono-xs text-label-mono-xs font-bold shrink-0" style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}>
                    05
                  </span>
                  <span className="font-headline-sm text-headline-sm text-on-surface"><T>Wind / Snow Load</T></span>
                </div>
                <span className="material-symbols-outlined text-[16px]" style={{ color: "#64748B" }}>hourglass_empty</span>
              </div>
              <div className="flex flex-col gap-0.5 mt-space-xs">
                <span className="font-label-mono-xs text-label-mono-xs font-medium" style={{ color: "#64748B" }}>
                  <T>QUEUED FOR BATCH</T>
                </span>
                <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
                  <T>IS:875 (Part 4) &amp; DRDO criteria</T>
                </span>
              </div>
              <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden mt-1">
                <div className="h-full w-0" style={{ backgroundColor: "#94A3B8" }} />
              </div>
            </div>
          </div>
        </section>
        {/* Main Multi-Physics Telemetry Workspace */}
        <div className="w-full px-gutter-lg pb-space-xl flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg">
            {/* Left Column: Interactive Pareto Frontier Scatter Plot (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-space-sm">
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-space-md">
                {/* Chart Header & HUD Controls */}
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-primary text-[18px]">scatter_plot</span>
                      <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Multiobjective Pareto Exploration</T></h2>
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      <T>Minimizing Total Thermal Loss [Q_aux] vs Structural Logistics Weight</T>
                    </span>
                  </div>
                  {/* View Modes & Toggles */}
                  <div className="flex items-center gap-space-xs bg-surface-container-low p-1 rounded-xl">
                    {([
                      ["pareto", "PARETO 2D"],
                      ["envelope", "3D ENVELOPE"],
                      ["radar", "RADAR VIZ"],
                    ] as const).map(([mode, label]) => (
                      <button key={mode} type="button" aria-pressed={plotMode === mode} onClick={() => setPlotMode(mode)} className={plotMode === mode ? PLOT_ACTIVE : PLOT_IDLE}>
                        <T>{label}</T>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Scatter Plot Canvas Container */}
                <div className="relative w-full h-[410px] bg-surface-container-low rounded-xl p-space-md flex flex-col justify-between overflow-hidden">
                  {/* Gridlines & Background Axis Simulation */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern height="40" id="grid" patternUnits="userSpaceOnUse" width="40">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#C5C5D3" strokeDasharray="2,2" strokeWidth="0.75" />
                      </pattern>
                    </defs>
                    <rect fill="url(#grid)" height="100%" width="100%" />
                  </svg>
                  {/* Plot HUD Top Metadata */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-space-sm bg-surface-container-lowest/90 backdrop-blur px-space-sm py-1 rounded-full shadow-sm">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                        <T>EVALUATED:</T>{" "}
                        <strong className="text-on-surface font-data">3,200</strong>
                      </span>
                      <span className="text-outline-variant font-label-mono-xs">|</span>
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                        <T>NON-DOMINATED:</T>{" "}
                        <strong style={{ color: "#059669" }}><span className="font-data">38</span> <T>SEEDS</T></strong>
                      </span>
                      <span className="text-outline-variant font-label-mono-xs">|</span>
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                        <T>CONVERGENCE TOL:</T>{" "}
                        <strong className="text-on-surface font-data">1e-4</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-space-xs bg-surface-container-lowest/90 backdrop-blur px-space-sm py-1 rounded-full shadow-sm">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#059669" }} />
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-medium">
                        <T>Pareto Optimal Frontier Active</T>
                      </span>
                    </div>
                  </div>
                  {/* SVG Data Plot Graphic */}
                  <div className="relative z-10 w-full h-[290px] my-auto">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 300">
                      {/* Y-Axis Unit Marks */}
                      <text className="font-label-mono-xs text-[10px] font-data" fill="#64748B" x="5" y="25">6.0 t</text>
                      <text className="font-label-mono-xs text-[10px] font-data" fill="#64748B" x="5" y="90">4.8 t</text>
                      <text className="font-label-mono-xs text-[10px] font-data" fill="#64748B" x="5" y="155">3.6 t</text>
                      <text className="font-label-mono-xs text-[10px] font-data" fill="#64748B" x="5" y="220">2.4 t</text>
                      <text className="font-label-mono-xs text-[10px] font-data" fill="#64748B" x="5" y="285">1.5 t</text>
                      {/* Pareto Optimal Curve Interpolation (Dashed line in Equilibrium Green) */}
                      <path className="opacity-80" d="M 90 270 Q 150 180, 260 115 T 520 60" fill="none" stroke="#059669" strokeDasharray="4,3" strokeWidth="2" />
                      {/* Cluster 1: Ultra-Light Pod (Slate Teal #0F7A8C) */}
                      <g fill="#0F7A8C" opacity="0.8">
                        <circle cx="480" cy="265" r="4.5" />
                        <circle cx="510" cy="250" r="4" />
                        <circle cx="460" cy="240" r="5" />
                        <circle cx="530" cy="275" r="3.5" />
                        <circle cx="440" cy="230" r="4" />
                        <circle cx="495" cy="220" r="4.5" />
                      </g>
                      {/* Cluster 2: High Thermal Mass (Muted Plum #6B4C9A) */}
                      <g fill="#6B4C9A" opacity="0.85">
                        <circle cx="105" cy="45" r="5" />
                        <circle cx="130" cy="55" r="4.5" />
                        <circle cx="115" cy="75" r="5.5" />
                        <circle cx="85" cy="90" r="4" />
                        <circle cx="140" cy="85" r="5" />
                        <circle cx="160" cy="65" r="4" />
                      </g>
                      {/* Cluster 3: Solar Passive Core (Thermal Amber #D97706) */}
                      <g fill="#D97706" opacity="0.85">
                        <circle cx="280" cy="180" r="4.5" />
                        <circle cx="310" cy="165" r="5" />
                        <circle cx="340" cy="195" r="4" />
                        <circle cx="295" cy="150" r="4.5" />
                        <circle cx="365" cy="175" r="5.5" />
                        <circle cx="260" cy="205" r="3.5" />
                      </g>
                      {/* Sub-optimal interior scatter points (Dominated solutions) */}
                      <g fill="#94A3B8" opacity="0.45">
                        <circle cx="220" cy="230" r="3" />
                        <circle cx="350" cy="240" r="3" />
                        <circle cx="400" cy="140" r="3" />
                        <circle cx="180" cy="180" r="3.5" />
                        <circle cx="320" cy="110" r="3" />
                        <circle cx="420" cy="80" r="3" />
                        <circle cx="270" cy="85" r="3.5" />
                        <circle cx="380" cy="210" r="3" />
                      </g>
                      {/* Pareto Optimal Seeds (Equilibrium Green #059669) along front */}
                      <g fill="#059669">
                        <circle className="animate-pulse" cx="90" cy="270" r="6" />
                        <circle cx="140" cy="205" r="5.5" />
                        <circle cx="185" cy="160" r="6" />
                        <circle cx="260" cy="115" r="6" />
                        <circle cx="350" cy="85" r="5.5" />
                        <circle cx="430" cy="70" r="5" />
                        <circle cx="520" cy="60" r="5" />
                      </g>
                      {/* Selected Optimal Candidate Spotlight (#C-8042-4): Primary Navy #1E3A8A with Green highlight ring */}
                      <g transform="translate(185, 160)">
                        <circle className="animate-ping" cx="0" cy="0" fill="#A7F3D0" opacity="0.6" r="14" />
                        <circle cx="0" cy="0" fill="#1E3A8A" stroke="#059669" strokeWidth="2" r="8" />
                        <polygon fill="#FFFFFF" points="0,-5 1.5,-1.5 5,-1.5 2,1 3.5,4.5 0,2.5 -3.5,4.5 -2,1 -5,-1.5 -1.5,-1.5" />
                        <rect fill="#1E3A8A" height="34" rx="4" stroke="#059669" strokeWidth="1" width="135" x="12" y="-24" />
                        <text className="font-label-mono-xs text-[10px] font-bold" fill="#FFFFFF" x="18" y="-12"><tspan className="font-data">#C-8042-4</tspan> <T>(CHOSEN)</T></text>
                        <text className="font-label-mono-xs text-[9px]" fill="#A7F3D0" x="18" y="-2"><tspan className="font-data">2,450 kg</tspan> • <tspan className="font-data">8.4 kWh/d</tspan></text>
                      </g>
                    </svg>
                  </div>
                  {/* X-Axis Labels */}
                  <div className="relative z-10 flex items-center justify-between pt-1 border-t border-outline-variant/30 text-on-surface-variant font-label-mono-xs text-label-mono-xs">
                    <div className="flex items-center gap-space-sm bg-surface-container-lowest/90 backdrop-blur px-space-sm py-1 rounded-full shadow-sm">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                        <T>EVALUATED:</T>{" "}
                        <strong className="text-on-surface font-data">3,200</strong>
                      </span>
                      <span className="text-outline-variant font-label-mono-xs">|</span>
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                        <T>NON-DOMINATED:</T>{" "}
                        <strong style={{ color: "#059669" }}><span className="font-data">38</span> <T>SEEDS</T></strong>
                      </span>
                      <span className="text-outline-variant font-label-mono-xs">|</span>
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                        <T>CONVERGENCE TOL:</T>{" "}
                        <strong className="text-on-surface font-data">1e-4</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-space-xs bg-surface-container-lowest/90 backdrop-blur px-space-sm py-1 rounded-full shadow-sm">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#059669" }} />
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-medium">
                        <T>Pareto Optimal Frontier Active</T>
                      </span>
                    </div>
                  </div>
                </div>
                {/* Color Legend & Quick Metrics Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-space-xs pt-1">
                  <div className="flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1.5 rounded-xl">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: "#059669" }} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-semibold truncate"><T>Pareto Optimal</T></span>
                      <span className="font-label-mono-xs text-[9px] text-on-surface-variant truncate"><T>Comfort 18-22°C</T></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1.5 rounded-xl">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: "#6B4C9A" }} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-semibold truncate">
                        <T>High Thermal Mass</T>
                      </span>
                      <span className="font-label-mono-xs text-[9px] text-on-surface-variant truncate"><T>&gt;</T><span className="font-data">4.5t</span> <T>Logistics Heavy</T></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1.5 rounded-xl">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: "#D97706" }} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-semibold truncate">
                        <T>Solar Passive Core</T>
                      </span>
                      <span className="font-label-mono-xs text-[9px] text-on-surface-variant truncate"><T>Moderate Auxiliary Req</T></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1.5 rounded-xl">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: "#0F7A8C" }} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-semibold truncate"><T>Ultra-Light Pod</T></span>
                      <span className="font-label-mono-xs text-[9px] text-on-surface-variant truncate"><T>High Heating Fuel Need</T></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Right Column: Live Solver Terminal & Residual Log (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-space-sm">
              <div className="mono-scope bg-inverse-surface text-inverse-on-surface rounded-xl p-5 shadow-card flex flex-col justify-between h-full min-h-[490px]">
                {/* Terminal Header */}
                <div className="flex items-center justify-between pb-space-sm border-b border-outline/30">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[16px]" style={{ color: "#0F7A8C" }}>terminal</span>
                    <span className="font-label-mono-sm text-label-mono-sm font-semibold tracking-wide text-inverse-on-surface">
                      ANSYS MAPDL + RC SOLVER ENGINE LOG
                    </span>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#0F7A8C" }} />
                    <span className="font-label-mono-xs text-label-mono-xs" style={{ color: "#7DD3E7" }}>STREAMING (20 Hz)</span>
                  </div>
                </div>
                {/* Real-Time Metrics Telemetry Bar inside Terminal */}
                <div className="grid grid-cols-3 gap-space-xs my-space-sm bg-inverse-surface/80 p-space-xs rounded-xl border border-outline/20">
                  <div className="flex flex-col">
                    <span className="font-label-mono-xs text-[10px] text-outline-variant">EXTERIOR T_INF</span>
                    <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#90A8FF" }}>-38.20 °C</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-mono-xs text-[10px] text-outline-variant">HAB CORE T_INT</span>
                    <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#34D399" }}>+20.42 °C</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-mono-xs text-[10px] text-outline-variant">COURANT NO. (C)</span>
                    <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#FBBF24" }}>0.421 (STABLE)</span>
                  </div>
                </div>
                {/* Console Output Screen */}
                <div className="font-label-mono-xs text-label-mono-xs text-surface-container-high leading-relaxed flex-1 flex flex-col gap-1 overflow-y-auto max-h-[300px] p-space-xs bg-black/30 rounded-xl select-text" id="terminal-screen" ref={terminalRef} aria-live="polite">
                  {log.map((line) =>
                    line.ts ? (
                      <div key={line.key} className="">
                        <span className="text-secondary-fixed">[{line.ts}]</span> {line.msg}
                      </div>
                    ) : (
                      <div key={line.key} className="text-secondary-fixed">
                        {line.msg}
                      </div>
                    ),
                  )}
                </div>
                {/* Solver Controls & Real-Time Convergence Badge */}
                <div className="pt-space-sm mt-space-xs border-t border-outline/30 flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-label-mono-xs text-label-mono-xs text-outline-variant">SURROGATE MSE:</span>
                    <span className="font-label-mono-xs text-label-mono-xs text-secondary-container font-bold">0.0014</span>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <button className="px-space-xs py-0.5 bg-surface-container/20 hover:bg-surface-container/30 text-surface-container rounded font-label-mono-xs text-label-mono-xs transition-colors hover-lift" type="button" onClick={clearTerminalLog}>
                      CLEAR
                    </button>
                    <button className="px-space-xs py-0.5 bg-surface-container/20 hover:bg-surface-container/30 text-surface-container rounded font-label-mono-xs text-label-mono-xs transition-colors hover-lift" type="button" onClick={exportResiduals}>
                      EXP RESIDUALS
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Shortlisted Candidates Comparison Cards (Bottom Strip) */}
          <section className="w-full flex flex-col gap-space-md pt-space-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary text-[20px]">view_comfy_alt</span>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                  <T>Shortlisted Optimal Solutions for Forward Deployment</T>
                </h3>
              </div>
              <div className="flex items-center gap-space-sm">
                <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
                  <T>Click candidate card to lock CAD/CFD viewport inspector</T>
                </span>
              </div>
            </div>
            {/* 3 Equal Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Candidate A: Pareto Champion */}
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow flex flex-col justify-between gap-space-md relative overflow-hidden group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container" {...cardLink("C-8042-4")}>
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: "#059669" }} />
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-xs">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-space-xs">
                        <span className="font-label-mono-md text-label-mono-md font-bold text-primary font-data">#C-8042-4</span>
                        <span className="font-label-mono-xs text-label-mono-xs px-space-xs py-0.5 rounded-full font-bold uppercase" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                          <T>PARETO CHAMPION</T>
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Aerogel Composite + Phase Change Core</T></span>
                    </div>
                    <span className="material-symbols-outlined text-[24px]" style={{ color: "#059669" }}>verified</span>
                  </div>
                  <div className="w-full h-32 rounded-lg overflow-hidden relative shadow-inner bg-surface-container">
                    <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" data-alt="Technical CAD thermal render of an aerodynamic military dome shelter on snow, showing aerogel insulated panels with multi-point temperature gradient vectors in deep navy and bright teal tones, clean high altitude military engineering visualization." src="/images/candidate-arx-dome.jpg" />
                    <div className="absolute bottom-1 right-1 bg-surface-container-lowest/90 px-space-xs py-0.5 rounded-full font-label-mono-xs text-[10px] text-on-surface font-semibold backdrop-blur">
                      <T>12-BED ARX DOME</T>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-space-xs pt-space-xs">
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>OVERALL U-VALUE</T></span>
                      <span className="font-label-mono-md text-label-mono-md text-on-surface font-bold">
                        <span className="font-data">0.112</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant">W/m²K</span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>LOGISTICS MASS</T></span>
                      <span className="font-label-mono-md text-label-mono-md text-on-surface font-bold">
                        <span className="font-data">2,450</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant"><T>kg</T></span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>TEMP INTERIOR</T></span>
                      <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#059669" }}>
                        <span className="font-data">+19.8 °C</span>{" "}
                        <span className="text-[9px] font-normal text-on-surface-variant">(<span className="font-data">-38°</span> <T>ext)</T></span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>AUXILIARY HEAT</T></span>
                      <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#1E3A8A" }}>
                        <span className="font-data">8.4</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant"><T>kWh/d</T></span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-space-xs pt-space-xs border-t border-surface-container">
                  <button type="button" aria-pressed={!!queued["C-8042-4"]} onClick={() => toggleQueued("C-8042-4")} className="w-full py-1.5 px-space-sm bg-primary-container hover:bg-primary text-on-primary rounded text-label-mono-xs font-label-mono-xs font-semibold flex items-center justify-center gap-space-xs transition-colors hover-lift">
                    <span className="material-symbols-outlined text-[14px]">{queued["C-8042-4"] ? "check_circle" : "tune"}</span>
                    <span className="">
                      <T>{queued["C-8042-4"] ? "QUEUED — ANSYS MAPDL" : "PROMOTE TO FULL ANSYS MAPDL"}</T>
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-space-xs">
                    <Link href={ROUTES.candidateDetail("C-8042-4")} className={CARD_SECONDARY}>
                      <T>VIEW DOSSIER</T>
                    </Link>
                    <Link href={ROUTES.candidateDetail("C-8042-4")} className={CARD_SECONDARY} title={t("CAD export is available in the candidate dossier")}>
                      <T>EXPORT CAD (.STEP)</T>
                    </Link>
                  </div>
                </div>
              </div>
              {/* Candidate B: Fast Deployment Modular */}
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow flex flex-col justify-between gap-space-md relative overflow-hidden group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container" {...cardLink("C-8042-19")}>
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: "#6B4C9A" }} />
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-xs">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-space-xs">
                        <span className="font-label-mono-md text-label-mono-md font-bold text-primary font-data">#C-8042-19</span>
                        <span className="font-label-mono-xs text-label-mono-xs px-space-xs py-0.5 rounded-full font-bold uppercase" style={{ backgroundColor: "#F3EEFA", color: "#6B4C9A" }}>
                          <T>RAPID DEPLOY</T>
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Pneumatic Double-Walled Inflatable Ribs</T></span>
                    </div>
                    <span className="material-symbols-outlined text-[24px]" style={{ color: "#6B4C9A" }}>flight_takeoff</span>
                  </div>
                  <div className="w-full h-32 rounded-lg overflow-hidden relative shadow-inner bg-surface-container">
                    <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" data-alt="Technical CAD architectural schematic of an inflatable high-altitude pressurized expedition shelter with heavy snow skirts and anchoring points, rendered in precision engineering blueprints with cyan and amber stress marks." src="/images/candidate-rib-pod.jpg" />
                    <div className="absolute bottom-1 right-1 bg-surface-container-lowest/90 px-space-xs py-0.5 rounded-full font-label-mono-xs text-[10px] text-on-surface font-semibold backdrop-blur">
                      <T>MODULAR RIB POD</T>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-space-xs pt-space-xs">
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>OVERALL U-VALUE</T></span>
                      <span className="font-label-mono-md text-label-mono-md text-on-surface font-bold">
                        <span className="font-data">0.178</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant">W/m²K</span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>LOGISTICS MASS</T></span>
                      <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#0F7A8C" }}>
                        <span className="font-data">1,620</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant"><T>kg</T></span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>TEMP INTERIOR</T></span>
                      <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#D97706" }}>
                        <span className="font-data">+16.4 °C</span>{" "}
                        <span className="text-[9px] font-normal text-on-surface-variant">(<span className="font-data">-38°</span> <T>ext)</T></span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>AUXILIARY HEAT</T></span>
                      <span className="font-label-mono-md text-label-mono-md text-on-surface font-bold">
                        <span className="font-data">18.6</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant"><T>kWh/d</T></span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-space-xs pt-space-xs border-t border-surface-container">
                  <button type="button" aria-pressed={!!queued["C-8042-19"]} onClick={() => toggleQueued("C-8042-19")} className="w-full py-1.5 px-space-sm bg-surface-container-highest hover:bg-surface-container-high text-on-surface rounded text-label-mono-xs font-label-mono-xs font-semibold flex items-center justify-center gap-space-xs transition-colors hover-lift">
                    <span className="material-symbols-outlined text-[14px]">{queued["C-8042-19"] ? "check_circle" : "tune"}</span>
                    <span className="">
                      <T>{queued["C-8042-19"] ? "QUEUED — ANSYS MAPDL" : "QUEUE MAPDL CO-SIMULATION"}</T>
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-space-xs">
                    <Link href={ROUTES.candidateDetail("C-8042-19")} className={CARD_SECONDARY}>
                      <T>VIEW DOSSIER</T>
                    </Link>
                    <Link href={ROUTES.candidateDetail("C-8042-19")} className={CARD_SECONDARY} title={t("CAD export is available in the candidate dossier")}>
                      <T>EXPORT CAD (.STEP)</T>
                    </Link>
                  </div>
                </div>
              </div>
              {/* Candidate C: Zero-Fuel Passive Solar */}
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow flex flex-col justify-between gap-space-md relative overflow-hidden group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-container" {...cardLink("C-8042-28")}>
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: "#D97706" }} />
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-start justify-between gap-space-xs">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-space-xs">
                        <span className="font-label-mono-md text-label-mono-md font-bold text-primary font-data">#C-8042-28</span>
                        <span className="font-label-mono-xs text-label-mono-xs px-space-xs py-0.5 rounded-full font-bold uppercase" style={{ backgroundColor: "#FFFBEB", color: "#D97706" }}>
                          <T>ZERO-FUEL PASSIVE</T>
                        </span>
                      </div>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        <T>Triple Trombe Glazing + Heavy Basalt Rockbed</T>
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[24px]" style={{ color: "#D97706" }}>wb_sunny</span>
                  </div>
                  <div className="w-full h-32 rounded-lg overflow-hidden relative shadow-inner bg-surface-container">
                    <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" data-alt="Technical CAD model showing an earth-bermed high altitude solar bunker shelter with south-facing high efficiency multi-pane solar glazing, thermal mass heat storage graphic overlays, clean precision military blueprint style." src="/images/candidate-bermed-unit.jpg" />
                    <div className="absolute bottom-1 right-1 bg-surface-container-lowest/90 px-space-xs py-0.5 rounded-full font-label-mono-xs text-[10px] text-on-surface font-semibold backdrop-blur">
                      <T>BERMED PASSIVE UNIT</T>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-space-xs pt-space-xs">
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>OVERALL U-VALUE</T></span>
                      <span className="font-label-mono-md text-label-mono-md text-on-surface font-bold">
                        <span className="font-data">0.089</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant">W/m²K</span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>LOGISTICS MASS</T></span>
                      <span className="font-label-mono-md text-label-mono-md text-error font-bold">
                        <span className="font-data">4,890</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant"><T>kg (Heavy)</T></span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>TEMP INTERIOR</T></span>
                      <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#059669" }}>
                        <span className="font-data">+21.2 °C</span>{" "}
                        <span className="text-[9px] font-normal text-on-surface-variant">(<span className="font-data">-38°</span> <T>ext)</T></span>
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-space-xs rounded-xl flex flex-col">
                      <span className="font-label-mono-xs text-[10px] text-on-surface-variant uppercase"><T>AUXILIARY HEAT</T></span>
                      <span className="font-label-mono-md text-label-mono-md font-bold" style={{ color: "#059669" }}>
                        <span className="font-data">1.2</span>{" "}
                        <span className="text-[10px] font-normal text-on-surface-variant"><T>kWh/d (Near Zero)</T></span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-space-xs pt-space-xs border-t border-surface-container">
                  <button type="button" aria-pressed={!!queued["C-8042-28"]} onClick={() => toggleQueued("C-8042-28")} className="w-full py-1.5 px-space-sm bg-surface-container-highest hover:bg-surface-container-high text-on-surface rounded text-label-mono-xs font-label-mono-xs font-semibold flex items-center justify-center gap-space-xs transition-colors hover-lift">
                    <span className="material-symbols-outlined text-[14px]">{queued["C-8042-28"] ? "check_circle" : "tune"}</span>
                    <span className="">
                      <T>{queued["C-8042-28"] ? "QUEUED — ANSYS MAPDL" : "QUEUE MAPDL CO-SIMULATION"}</T>
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-space-xs">
                    <Link href={ROUTES.candidateDetail("C-8042-28")} className={CARD_SECONDARY}>
                      <T>VIEW DOSSIER</T>
                    </Link>
                    <Link href={ROUTES.candidateDetail("C-8042-28")} className={CARD_SECONDARY} title={t("CAD export is available in the candidate dossier")}>
                      <T>EXPORT CAD (.STEP)</T>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
