"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { getCandidate } from "@/lib/mock-data";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

type SolverMode = "rc" | "ansys";
type WorkstationTab = "overview" | "thermal" | "energy" | "logistics" | "twin" | "validation" | "dossier";
type CameraView = "ISO" | "PERSP" | "ELEV" | "SECTION";
type FloorLevel = "L-00 GROUND" | "L-01 BUNK DECK";

const TABS: { id: WorkstationTab; icon: string; label: string }[] = [
  { id: "overview", icon: "grid_view", label: "Overview" },
  { id: "thermal", icon: "thermostat", label: "Thermal Stratification & Rooms" },
  { id: "energy", icon: "wb_sunny", label: "Energy & Solar Flux" },
  { id: "logistics", icon: "local_shipping", label: "Logistics & Economics" },
  { id: "twin", icon: "view_in_ar", label: "Interactive 3D Digital Twin" },
  { id: "validation", icon: "tune", label: "Validation & Residuals" },
  { id: "dossier", icon: "folder_shared", label: "Evidence Dossier" },
];
const TAB_ACTIVE = "px-space-sm py-1.5 rounded font-body-sm text-body-sm bg-secondary text-on-secondary font-semibold flex items-center gap-1.5 shadow-sm";
const TAB_IDLE = "px-space-sm py-1.5 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1.5";

const SOLVER_ACTIVE = "px-space-sm py-1.5 rounded-md font-body-sm text-body-sm bg-surface-container-lowest text-secondary font-semibold shadow-sm transition-all flex items-center";
const SOLVER_IDLE = "px-space-sm py-1.5 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-all flex items-center";

const CAMERA_VIEWS: CameraView[] = ["ISO", "PERSP", "ELEV", "SECTION"];
const CAMERA_ACTIVE = "px-2 py-1 rounded bg-primary-container text-on-primary font-label-mono-xs text-label-mono-xs font-semibold";
const CAMERA_IDLE = "px-2 py-1 rounded hover:bg-[#203657] font-label-mono-xs text-label-mono-xs text-surface-variant";

const FLOORS: FloorLevel[] = ["L-00 GROUND", "L-01 BUNK DECK"];
const FLOOR_ACTIVE = "px-2 py-1 rounded bg-[#25426e] text-on-primary font-label-mono-xs text-label-mono-xs font-medium";
const FLOOR_IDLE = "px-2 py-1 rounded hover:bg-[#203657] text-[#90a8ff] font-label-mono-xs text-label-mono-xs";

function formatSimTime(value: number) {
  const hours = Math.floor(value);
  const minutes = value % 1 === 0.5 ? "30" : "00";
  return `${hours.toString().padStart(2, "0")}:${minutes} HRS`;
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tr = useT(); // `t` is used as the tab loop variable below
  const match = getCandidate(decodeURIComponent(id));
  const [tab, setTab] = useState<WorkstationTab>("twin");
  const [solverMode, setSolverMode] = useState<SolverMode>("ansys");
  const [camera, setCamera] = useState<CameraView>("ISO");
  const [floor, setFloor] = useState<FloorLevel>("L-00 GROUND");
  const [simTime, setSimTime] = useState(13.5);
  const [locked, setLocked] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!match) notFound();
  const candidate = match;

  function handleProcurementPush() {
    setCommitted(true);
    setStatus("Candidate committed to DHADI Ladakh Procurement Database with Digital Hash SHA-256 validation.");
  }

  return (
    <>
      <div className="flex flex-col w-full">
        <div className="w-full bg-surface-container-lowest px-gutter-lg pt-space-md">
          <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-space-sm">
            <Link href={ROUTES.candidateTelemetry} className="inline-flex items-center gap-1 font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              <T>Back to Candidates</T>
              <span className="text-outline-variant normal-case"><T>/ Run</T> <span className="font-data">#EXP-LDK-8042</span></span>
            </Link>
            <Link href={ROUTES.shelterConfigurator.step1} className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary hover:bg-primary font-body-sm text-body-sm font-semibold shadow-sm transition-colors hover-lift">
              <span className="material-symbols-outlined text-[16px]">add_box</span>
              <T>New Simulation</T>
            </Link>
          </div>
        </div>
        {/* Command Header & Candidate Metadata Sub-bar */}
        <div className="w-full bg-surface-container-lowest px-gutter-lg py-space-md shadow-sm">
          <div className="max-w-[1720px] mx-auto flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-md">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex flex-wrap items-center gap-space-xs text-on-surface">
                <span className="font-label-mono-xs text-label-mono-xs uppercase px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] font-semibold tracking-wide">
                  <T>MIL-PRF-32535 READY</T>
                </span>
                <span className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold truncate">
                  <T>Candidate #</T>{candidate.id}
                </span>
                <span className="text-outline-variant font-light px-1">/</span>
                <span className="font-headline-md text-headline-md text-on-surface-variant font-medium">
                  {candidate.title}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-space-md text-on-surface-variant">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-secondary">domain</span>
                  <span className="font-body-sm text-body-sm font-medium text-on-surface">
                    <T>Project: DBO Sub-Sector Logistics Shelter</T>
                  </span>
                </div>
                <span className="text-outline-variant text-[11px]">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-on-surface-variant">history_toggle_off</span>
                  <span className="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface-variant">
                    <T>Revision</T> <span className="font-data">R4.2</span> <T>(STABLE)</T>
                  </span>
                </div>
                <span className="text-outline-variant text-[11px]">•</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-on-surface-variant">landscape</span>
                  <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                    <T>COORDINATES:</T> <span className="font-data">35.318° N</span>, <span className="font-data">77.922° E</span> | <span className="font-data">5,065m</span> <T>AMSL</T>
                  </span>
                </div>
              </div>
            </div>
            {/* Provenance Verification Badges Stack */}
            <div className="flex flex-wrap items-center gap-space-xs shrink-0">
              <div className="flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-[#ECFBFC] text-[#0F7A8C]">
                <span className="material-symbols-outlined text-[14px]">calculate</span>
                <span className="font-label-mono-xs text-label-mono-xs font-semibold tracking-wider uppercase">
                  <T>Calculated by RC</T>
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-[#FFFBEB] text-[#D97706]">
                <span className="material-symbols-outlined text-[14px]">psychology</span>
                <span className="font-label-mono-xs text-label-mono-xs font-semibold tracking-wider uppercase"><T>Screened by ML</T></span>
              </div>
              <div className="flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-[#ECFDF5] text-[#059669]">
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
                <span className="font-label-mono-xs text-label-mono-xs font-semibold tracking-wider uppercase">
                  <T>Validated by ANSYS MAPDL</T> <span className="font-data">v24.1</span>
                </span>
              </div>
              <button type="button" aria-pressed={locked} onClick={() => setLocked((v) => !v)} className={`ml-space-xs p-1.5 hover:bg-surface-container transition-colors rounded-full ${locked ? "text-primary bg-surface-container" : "text-on-surface-variant hover:text-on-surface"}`} title={tr(locked ? "Unlock Design State" : "Lock Design State")}>
                <span className="material-symbols-outlined text-[18px]" style={locked ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                  {locked ? "lock" : "lock_open"}
                </span>
              </button>
            </div>
          </div>
        </div>
        {/* Workstation Navigation Tabs Bar */}
        <div className="w-full bg-surface-container-low shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="max-w-[1720px] mx-auto px-gutter-lg flex items-center justify-between overflow-x-auto">
            <div className="flex items-center gap-space-xs min-w-max py-1.5" role="tablist" aria-label={tr("Workstation views")}>
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={tab === t.id ? TAB_ACTIVE : TAB_IDLE}>
                  <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                  {" "}
                  <T>{t.label}</T>
                  {tab === t.id && t.id === "twin" && (
                    <>
                      {" "}(Active) <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" />
                    </>
                  )}
                </button>
              ))}
            </div>
            <div className="hidden lg:flex items-center gap-space-sm pl-space-lg">
              <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>Solver Status:</T></span>
              <span className="font-label-mono-xs text-label-mono-xs px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] font-medium">
                <T>L2 RESIDUAL &lt;</T> <span className="font-data">10⁻⁶</span>
              </span>
            </div>
          </div>
        </div>
        {/* Main Multi-Physics Workstation Layout */}
        <div className="w-full max-w-[1720px] mx-auto px-gutter-lg py-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Central CAD / CFD 3D Digital Twin Viewport (8 Columns on desktop) */}
            <div className="xl:col-span-8 flex flex-col gap-6">
              {/* Solver Display Mode Segmented Switch */}
              <div className="w-full bg-surface-container-lowest p-3 rounded-xl shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-sm">
                <div className="flex items-center gap-space-xs p-1 bg-surface-container-low rounded-xl w-full md:w-auto">
                  <button className={`${solverMode === "rc" ? SOLVER_ACTIVE : SOLVER_IDLE} gap-1.5`} id="btnSolverRC" type="button" aria-pressed={solverMode === "rc"} onClick={() => setSolverMode("rc")}>
                    <span className="material-symbols-outlined text-[16px]">flash_on</span>
                    {" "}<T>Multi-zone RC Visualization (Dynamic Quick-Solve)</T>
                  </button>
                  <button className={`${solverMode === "ansys" ? SOLVER_ACTIVE : SOLVER_IDLE} gap-2`} id="btnSolverAnsys" type="button" aria-pressed={solverMode === "ansys"} onClick={() => setSolverMode("ansys")}>
                    <span className="material-symbols-outlined text-[16px] text-secondary">memory</span>
                    {" "}<T>ANSYS MAPDL Validation (R4.2)</T>{" "}
                    <span className="font-label-mono-xs text-label-mono-xs bg-[#ECFBFC] text-[#0F7A8C] px-1.5 py-0.5 rounded-full font-bold tracking-tight">
                      <span className="font-data">1.4M</span> <T>ELEMENTS</T>
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2 px-space-xs justify-end">
                  <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>Mesh Fidelity:</T></span>
                  <span className="font-label-mono-xs text-label-mono-xs text-secondary font-bold"><T>SOLID90 / SHELL131</T></span>
                  <button className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full">
                    <span className="material-symbols-outlined text-[16px]">fit_screen</span>
                  </button>
                </div>
              </div>
              {/* Primary 3D Canvas Box */}
              <div className="relative w-full rounded-xl bg-[#09111e] overflow-hidden shadow-card flex flex-col">
                {/* Viewport HUD Header Bar */}
                <div className="w-full bg-[#0d1a2d]/90 backdrop-blur-md px-space-md py-2.5 flex flex-wrap items-center justify-between gap-space-sm z-20">
                  {/* View Controls */}
                  <div className="flex items-center gap-space-xs">
                    <div className="flex items-center bg-[#162740] rounded p-0.5 text-surface-container-high">
                      {CAMERA_VIEWS.map((v) => (
                        <button key={v} type="button" aria-pressed={camera === v} onClick={() => setCamera(v)} className={camera === v ? CAMERA_ACTIVE : CAMERA_IDLE}>
                          {v}
                        </button>
                      ))}
                    </div>
                    {/* Floor Level Selector */}
                    <div className="flex items-center bg-[#162740] rounded p-0.5 ml-1">
                      {FLOORS.map((f) => (
                        <button key={f} type="button" aria-pressed={floor === f} onClick={() => setFloor(f)} className={floor === f ? FLOOR_ACTIVE : FLOOR_IDLE}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Layer Toggles */}
                  <div className="flex items-center gap-space-xs">
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[#162740] hover:bg-[#203657] cursor-pointer text-surface-variant">
                      <input defaultChecked className="w-3.5 h-3.5 rounded bg-primary-container accent-secondary" type="checkbox" />
                      <span className="font-label-mono-xs text-label-mono-xs font-medium text-surface-bright"><T>VIP Envelope</T></span>
                    </label>
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[#162740] hover:bg-[#203657] cursor-pointer text-surface-variant">
                      <input defaultChecked className="w-3.5 h-3.5 rounded bg-primary-container accent-secondary" type="checkbox" />
                      <span className="font-label-mono-xs text-label-mono-xs font-medium text-surface-bright"><T>PCM Core</T></span>
                    </label>
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[#162740] hover:bg-[#203657] cursor-pointer text-surface-variant">
                      <input defaultChecked className="w-3.5 h-3.5 rounded bg-primary-container accent-secondary" type="checkbox" />
                      <span className="font-label-mono-xs text-label-mono-xs font-medium text-surface-bright"><T>Air Ducts</T></span>
                    </label>
                  </div>
                </div>
                {/* Graphic Viewport Canvas with Thermal Field Overlay */}
                <div className="relative w-full h-[520px] bg-gradient-to-b from-[#09111e] via-[#0d1c33] to-[#080d17] flex items-center justify-center p-space-md select-none overflow-hidden">
                  {/* Grid Coordinate Background Matrix (Simulated Engineering Canvas) */}
                  <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: "radial-gradient(#90a8ff 0.75px, transparent 0.75px), radial-gradient(#90a8ff 0.75px, #09111e 0.75px)", backgroundSize: "32px 32px", backgroundPosition: "0 0, 16px 16px" }} />
                  {/* Real Site Overlay Visual Texture */}
                  <div className="absolute inset-0 opacity-20 bg-cover bg-center pointer-events-none mix-blend-screen" data-alt="High altitude Karakoram mountain ridge at Daulat Beg Oldi Ladakh covered with hard wind packed snow and extreme sub zero atmosphere, technical blue hour tint, crisp cold air haze." style={{ backgroundImage: "url('/images/digital-twin-mesh.jpg')" }} />
                  {/* Interactive 3D Cutaway Shelter SVG Model with Gradient Isotherms */}
                  <div className="relative z-10 w-full max-w-[700px] h-[380px] flex items-center justify-center">
                    <svg className="w-full h-full filter drop-shadow-[0_20px_30px_rgba(0,0,0,0.8)]" viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        {/* Exterior to Interior Thermal Boundary Gradient */}
                        <linearGradient id="thermalWallLeft" x1="0%" x2="100%" y1="0%" y2="0%">
                          <stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.95" />
                          {/* -38.2C Exterior */}
                          <stop offset="35%" stopColor="#006878" stopOpacity="0.9" />
                          {/* -10C Vacuum Barrier */}
                          <stop offset="70%" stopColor="#059669" stopOpacity="0.9" />
                          {/* +12C Thermal Mass */}
                          <stop offset="100%" stopColor="#10B981" stopOpacity="0.9" />
                          {/* +19.5C Inner Living Face */}
                        </linearGradient>
                        {/* Inner Habitation Core Gradient */}
                        <linearGradient id="livingZoneGrad" x1="0%" x2="0%" y1="100%" y2="0%">
                          <stop offset="0%" stopColor="#059669" stopOpacity="0.85" />
                          <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
                          <stop offset="90%" stopColor="#D97706" stopOpacity="0.85" />
                          {/* High Solar Ceiling Accumulation */}
                        </linearGradient>
                        {/* Exterior Sub-Zero Ice Crust Shield */}
                        <linearGradient id="exteriorRoof" x1="0%" x2="100%" y1="0%" y2="100%">
                          <stop offset="0%" stopColor="#172554" />
                          <stop offset="100%" stopColor="#1E3A8A" />
                        </linearGradient>
                        {/* Solar Radiation Cone */}
                        <radialGradient cx="30%" cy="20%" id="sunBeam" r="70%">
                          <stop offset="0%" stopColor="#FC922B" stopOpacity="0.45" />
                          <stop offset="60%" stopColor="#FC922B" stopOpacity="0.08" />
                          <stop offset="100%" stopColor="#FC922B" stopOpacity="0" />
                        </radialGradient>
                      </defs>
                      {/* High Sun Direction Vector (Ladakh Solar Altitude 32.5°) */}
                      <polygon fill="url(#sunBeam)" points="120,40 380,180 260,340 60,180" />
                      <line opacity="0.7" stroke="#FC922B" strokeDasharray="4 3" strokeWidth="1.5" x1="120" x2="260" y1="40" y2="180" />
                      <text fill="#FC922B" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600" x="100" y="32">
                        <T>DIRECT IR SOLAR FLUX: 914 W/m²</T>
                      </text>
                      {/* Ground Foundation Bedrock / Permafrost Anchor (5,065m AMSL) */}
                      <polygon fill="#0b1726" points="150,380 400,470 700,360 450,280" stroke="#1d2d44" strokeWidth="1.5" />
                      <path d="M 150,380 L 400,470 L 700,360" stroke="#25426e" strokeDasharray="2 4" strokeWidth="1" />
                      {/* Foundation Aerogel Thermal Isolation Plinth */}
                      <polygon fill="#00236f" fillOpacity="0.85" points="180,360 400,440 670,345 450,275" stroke="#7dd3e7" strokeWidth="1.5" />
                      <text fill="#90a8ff" fontFamily="JetBrains Mono" fontSize="10" x="490" y="390">
                        <T>AEROGEL PLINTH R-84 (-28°C SOIL)</T>
                      </text>
                      {/* Shelter Main Vault: Back Shell (Isometric) */}
                      <polygon fill="#132742" points="210,190 440,110 680,195 450,275" stroke="#284873" strokeWidth="1.5" />
                      {/* Internal Section Cut Planes (Thermal Field Contours) */}
                      {/* Zone A: Exterior Multi-layer Aerogel / VIP Panel Section */}
                      <polygon fill="url(#thermalWallLeft)" points="210,190 320,150 320,310 210,350" stroke="#38bdf8" strokeWidth="1" />
                      {/* Zone B: Habitation Living Core Section Cut (+20.8°C Steady State) */}
                      <polygon fill="url(#livingZoneGrad)" points="320,150 490,195 490,365 320,310" stroke="#10b981" strokeWidth="1.5" />
                      {/* Zone C: PCM Thermal Storage Battery Core (Phase Change Paraffin Salt Hexahydrate) */}
                      <polygon fill="#D97706" fillOpacity="0.75" points="380,270 450,290 450,340 380,320" stroke="#f59e0b" strokeWidth="1.5" />
                      <text fill="#ffffff" fontFamily="JetBrains Mono" fontSize="9" fontWeight="bold" x="400" y="305">
                        <T>PCM CORE: +22.0°C</T>
                      </text>
                      {/* Interior Stratification Flow Vectors (Natural Buoyancy Air Loop) */}
                      <path d="M 350,290 Q 360,220 410,215 Q 460,210 460,250" fill="none" stroke="#fef08a" strokeDasharray="5 3" strokeLinecap="round" strokeWidth="2" />
                      <polygon fill="#fef08a" points="460,250 455,242 465,242" />
                      <text fill="#fef08a" fontFamily="JetBrains Mono" fontSize="10" fontWeight="600" x="350" y="240">
                        <T>HEAT CONVECTION LOOP</T>
                      </text>
                      {/* Upper Roof Stratification Layer (Triple-glazed Translucent Solar Collector) */}
                      <polygon fill="#fc922b" fillOpacity="0.3" points="320,150 440,110 570,155 490,195" stroke="#fc922b" strokeWidth="2" />
                      {/* Exterior Cold Sheath Envelope Cut line */}
                      <path d="M 210,190 L 440,110 L 680,195 L 680,310 L 400,440 L 180,360 Z" fill="none" opacity="0.6" stroke="#7dd3e7" strokeDasharray="4 4" strokeWidth="1" />
                      {/* Telemetry Pin 01: Outer Wall Face */}
                      <circle cx="210" cy="270" fill="#BA1A1A" r="5" stroke="#ffffff" strokeWidth="2" />
                      <line stroke="#ffffff" strokeWidth="1" x1="210" x2="140" y1="270" y2="250" />
                      <rect fill="#0d1a2d" height="24" rx="3" stroke="#BA1A1A" strokeWidth="1" width="90" x="50" y="235" />
                      <text fill="#ffdad6" fontFamily="JetBrains Mono" fontSize="10" fontWeight="bold" x="56" y="251"><T>-38.2°C EXT</T></text>
                      {/* Telemetry Pin 02: VIP Insulation Interface */}
                      <circle cx="265" cy="250" fill="#006878" r="4" stroke="#ffffff" strokeWidth="1.5" />
                      <line stroke="#ffffff" strokeWidth="1" x1="265" x2="265" y1="250" y2="195" />
                      <rect fill="#0d1a2d" height="20" rx="3" stroke="#006878" strokeWidth="1" width="96" x="220" y="175" />
                      <text fill="#94eafe" fontFamily="JetBrains Mono" fontSize="9" fontWeight="bold" x="226" y="189">
                        <T>-4.5°C VIP CORE</T>
                      </text>
                      {/* Telemetry Pin 03: Central Habitation Zone */}
                      <circle cx="410" cy="270" fill="#059669" r="5" stroke="#ffffff" strokeWidth="2" />
                      <line stroke="#ffffff" strokeWidth="1" x1="410" x2="480" y1="270" y2="250" />
                      <rect fill="#0d1a2d" height="24" rx="3" stroke="#059669" strokeWidth="1" width="112" x="480" y="238" />
                      <text fill="#6ee7b7" fontFamily="JetBrains Mono" fontSize="10" fontWeight="bold" x="486" y="254">
                        <T>+20.8°C HABITATION</T>
                      </text>
                      {/* Internal Micro Bunk Silhouettes (Human Scale Reference) */}
                      <rect fill="#334155" height="12" opacity="0.8" rx="2" width="28" x="360" y="235" />
                      <rect fill="#334155" height="12" opacity="0.8" rx="2" width="28" x="360" y="215" />
                      <circle cx="395" cy="225" fill="#64748b" r="4" />
                    </svg>
                  </div>
                  {/* Floating Top Right HUD Status Overlay */}
                  <div className="absolute top-4 right-4 z-20 bg-surface-container-lowest/90 backdrop-blur-md p-3 rounded-xl shadow-sm flex flex-col gap-1.5 min-w-[210px]">
                    <div className="flex items-center justify-between">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase font-medium">
                        <T>Core Delta (ΔT)</T>
                      </span>
                      <span className="font-label-mono-sm text-label-mono-sm font-bold text-primary font-data">59.0 K</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase font-medium">
                        <T>Indoor Air Qual.</T>
                      </span>
                      <span className="font-label-mono-sm text-label-mono-sm font-bold text-[#059669]"><span className="font-data">428 PPM</span> <T>CO₂</T></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase font-medium">
                        <T>Condensation Risk</T>
                      </span>
                      <span className="font-label-mono-sm text-label-mono-sm font-bold text-[#059669]"><span className="font-data">0.0%</span> <T>(DP &lt;</T> <span className="font-data">-12°C</span>)</span>
                    </div>
                    <div className="w-full h-1 bg-surface-container rounded-full overflow-hidden mt-1">
                      <div className="bg-secondary h-full rounded-full w-full" />
                    </div>
                  </div>
                  {/* Temperature Legend Scale Bar (Anchored Bottom Center-Left) */}
                  <div className="absolute bottom-4 left-4 z-20 bg-surface-container-lowest/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-sm flex flex-col gap-1.5 min-w-[320px]">
                    <div className="flex items-center justify-between">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase font-semibold">
                        <T>Isotherm Temperature Field (°C)</T>
                      </span>
                      <span className="font-label-mono-xs text-label-mono-xs text-primary font-bold"><T>MIL-STD RANGE</T></span>
                    </div>
                    {/* Gradient Ribbon */}
                    <div className="w-full h-3 rounded bg-gradient-to-r from-[#1E3A8A] via-[#006878] via-[#059669] via-[#D97706] to-[#BA1A1A]" />
                    {/* Mono Spaced Ticks */}
                    <div className="flex justify-between font-label-mono-xs text-label-mono-xs text-on-surface-variant font-medium">
                      <span className=" font-data">-40°C</span>
                      <span className=" font-data">-25°C</span>
                      <span className=" font-data">-10°C</span>
                      <span className=" font-data">+5°C</span>
                      <span className="text-[#059669] font-bold font-data">+18°C</span>
                      <span className="text-[#D97706] font-bold font-data">+24°C</span>
                    </div>
                  </div>
                </div>
                {/* Bottom Viewport Controls: Diurnal Solar Timestamp Slider */}
                <div className="w-full bg-surface-container-lowest px-space-md py-3 shadow-inner flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-space-sm">
                      <span className="material-symbols-outlined text-[18px] text-tertiary-container">sunny</span>
                      <span className="font-body-sm text-body-sm font-semibold text-on-surface">
                        <T>Diurnal Sun Path &amp; Solar Thermal Heat Absorption</T>
                      </span>
                      <span className="font-label-mono-xs text-label-mono-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium">
                        <T>WINTER SOLSTICE (</T><span className="font-data">21</span> <T>DEC)</T>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>SIMULATED TIME:</T></span>
                      <span className="font-label-mono-md text-label-mono-md font-bold text-primary px-2 py-0.5 bg-primary-fixed rounded-full font-data" id="sliderValDisplay">
                        {formatSimTime(simTime)}
                      </span>
                    </div>
                  </div>
                  {/* Timestamp Range Slider */}
                  <div className="relative flex items-center w-full">
                    <input className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary" id="timeSlider" max="24" min="0" step="0.5" type="range" value={simTime} onChange={(e) => setSimTime(parseFloat(e.target.value))} aria-label={tr("Simulated time of day")} />
                  </div>
                  <div className="flex justify-between font-label-mono-xs text-label-mono-xs text-on-surface-variant px-0.5">
                    <span className=""><span className="font-data">00:00</span> <T>(Night Min</T> <span className="font-data">-41.2°C</span>)</span>
                    <span className="text-tertiary-container font-semibold"><span className="font-data">07:45</span> <T>(Dawn Irradiation)</T></span>
                    <span className="text-primary font-bold"><span className="font-data">12:30</span> <T>(Solar Peak</T> <span className="font-data">980 W/m²</span>)</span>
                    <span className="text-tertiary-container font-semibold"><span className="font-data">17:15</span> <T>(Dusk)</T></span>
                    <span className=""><span className="font-data">23:59</span> <T>(PCM Discharge Loop)</T></span>
                  </div>
                </div>
              </div>
              {/* Material Multilayer Section Inspector Details Card */}
              <div className="w-full bg-surface-container-lowest p-5 rounded-xl shadow-card">
                <div className="flex items-center justify-between mb-space-sm">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">layers</span>
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      <T>Cross-Section Composite Wall Architecture (R-Val: 78.4 m²K/W)</T>
                    </span>
                  </div>
                  <span className="font-label-mono-xs text-label-mono-xs text-secondary font-bold">
                    <T>PASSIVE ENVELOPE SPECIFICATION</T>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-space-sm">
                  <div className="p-space-sm bg-surface-container-low rounded-xl">
                    <div className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>Layer 01 (Outermost)</T></div>
                    <div className="font-body-sm text-body-sm font-semibold text-on-surface mt-0.5"><T>Aerodynamic Titanium-Zinc Skin</T></div>
                    <div className="font-label-mono-xs text-label-mono-xs text-on-surface-variant mt-1"><span className="font-data">1.8mm</span> <T>• Wind Load</T> <span className="font-data">220 km/h</span></div>
                  </div>
                  <div className="p-space-sm bg-surface-container-low rounded-xl">
                    <div className="font-label-mono-xs text-label-mono-xs text-[#0F7A8C] uppercase font-semibold">
                      <T>Layer 02 (Thermal Core)</T>
                    </div>
                    <div className="font-body-sm text-body-sm font-semibold text-on-surface mt-0.5"><T>Dual-Cavity VIP Panels</T></div>
                    <div className="font-label-mono-xs text-label-mono-xs text-on-surface-variant mt-1"><span className="font-data">60mm</span> • k = <span className="font-data">0.0038 W/m·K</span></div>
                  </div>
                  <div className="p-space-sm bg-surface-container-low rounded-xl">
                    <div className="font-label-mono-xs text-label-mono-xs text-[#D97706] uppercase font-semibold">
                      <T>Layer 03 (Phase Change)</T>
                    </div>
                    <div className="font-body-sm text-body-sm font-semibold text-on-surface mt-0.5"><T>Bio-PCM Thermal Matrix</T></div>
                    <div className="font-label-mono-xs text-label-mono-xs text-on-surface-variant mt-1">
                      <span className="font-data">35mm</span> <T>• Melting</T> <span className="font-data">21.5°C</span> <T>Latent</T>
                    </div>
                  </div>
                  <div className="p-space-sm bg-surface-container-low rounded-xl">
                    <div className="font-label-mono-xs text-label-mono-xs text-[#059669] uppercase font-semibold">
                      <T>Layer 04 (Internal Face)</T>
                    </div>
                    <div className="font-body-sm text-body-sm font-semibold text-on-surface mt-0.5"><T>Anti-Microbial Spruce Ply</T></div>
                    <div className="font-label-mono-xs text-label-mono-xs text-on-surface-variant mt-1">
                      <span className="font-data">12mm</span> <T>• Hygroscopic Balancing</T>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Right Telemetry & Verification Dock (4 Columns / 380px nominal) */}
            <div className="xl:col-span-4 flex flex-col gap-6">
              {/* Key Engineering Telemetry Panel */}
              <div className="w-full bg-surface-container-lowest p-5 rounded-xl shadow-card flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-primary">assessment</span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold"><T>Key Engineering Telemetry</T></h2>
                  </div>
                  <span className="font-label-mono-xs text-label-mono-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium">
                    <T>RUN #</T><span className="font-data">4288</span>
                  </span>
                </div>
                {/* Card 1: Heat Loss Coefficient */}
                <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-1 transition-all hover:bg-surface-container">
                  <div className="flex items-center justify-between">
                    <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
                      <T>Overall Heat Loss Coefficient (U-Value)</T>
                    </span>
                    <span className="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] font-bold">
                      <T>ANSYS VALIDATED</T>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-display-lg text-display-lg font-bold text-primary">0.108</span>
                    <span className="font-label-mono-lg text-label-mono-lg text-on-surface-variant">W/m²K</span>
                  </div>
                  <div className="flex items-center gap-1 font-label-mono-xs text-label-mono-xs text-[#059669] mt-0.5">
                    <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                    <span className=""><span className="font-data">42.1%</span> <T>lower than standard Mil-Std</T> <span className="font-data">0.220</span> <T>spec threshold</T></span>
                  </div>
                </div>
                {/* Card 2: Thermal Lag / Phase Shift */}
                <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-1 transition-all hover:bg-surface-container">
                  <div className="flex items-center justify-between">
                    <span className="font-body-sm text-body-sm text-on-surface-variant font-medium"><T>Thermal Lag / Phase Shift</T></span>
                    <span className="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded-full bg-[#ECFBFC] text-[#0F7A8C] font-bold">
                      <T>RC SOLVER CALC</T>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-display-lg text-display-lg font-bold text-on-surface">11.4</span>
                    <span className="font-label-mono-lg text-label-mono-lg text-on-surface-variant"><T>Hours</T></span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
                    <T>Allows peak daytime solar gain (11:00-14:00) to naturally radiate inward during 02:00-06:00 peak night cold.</T>
                  </p>
                </div>
                {/* Card 3: Fuel Consumption */}
                <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-1 transition-all hover:bg-surface-container">
                  <div className="flex items-center justify-between">
                    <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
                      <T>Kerosene / Diesel Fuel Consumption</T>
                    </span>
                    <span className="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] font-bold">
                      <T>NET ZERO EMISSION</T>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-display-lg text-display-lg font-bold text-[#059669]">0.00</span>
                    <span className="font-label-mono-lg text-label-mono-lg text-on-surface-variant"><T>L/day</T></span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2 h-2 rounded-full bg-[#059669]" />
                    <span className="font-body-sm text-body-sm text-[#059669] font-medium">
                      <T>100% Passive Solar Equilibrium between 09:00 - 17:30</T>
                    </span>
                  </div>
                </div>
                {/* Card 4: Biological Heat Flux */}
                <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-1 transition-all hover:bg-surface-container">
                  <div className="flex items-center justify-between">
                    <span className="font-body-sm text-body-sm text-on-surface-variant font-medium"><T>Biological Heat Flux Recovery</T></span>
                    <span className="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded-full bg-[#FFFBEB] text-[#D97706] font-bold">
                      <T>ACTIVE FLUX</T>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-display-lg text-display-lg font-bold text-[#D97706]">1.44</span>
                    <span className="font-label-mono-lg text-label-mono-lg text-on-surface-variant"><T>kW Continuous</T></span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
                    <T>Based on 12 Occupants @ 120W metabolic output routed through HRV heat exchangers.</T>
                  </p>
                </div>
                {/* Card 5: Structural Snow Load Rating */}
                <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-1 transition-all hover:bg-surface-container">
                  <div className="flex items-center justify-between">
                    <span className="font-body-sm text-body-sm text-on-surface-variant font-medium"><T>Structural Snow Load Rating</T></span>
                    <span className="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] font-bold">
                      <T>PASS (</T><span className="font-data">+14.3%</span>)
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-display-lg text-display-lg font-bold text-primary">4.8</span>
                    <span className="font-label-mono-lg text-label-mono-lg text-on-surface-variant"><T>kN/m²</T></span>
                  </div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    <T>Exceeds Himalayan Mil-Std requirement (4.2 kN/m² @ 5,000m AMSL drifting).</T>
                  </div>
                </div>
                {/* Quick Actions & Mil-Spec Procurement Push */}
                <div className="flex flex-col gap-space-xs pt-2">
                  <button className="w-full h-10 px-space-md rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary-container shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-80 disabled:cursor-default hover-lift" type="button" disabled={committed} onClick={handleProcurementPush}>
                    <span className="material-symbols-outlined text-[18px]">{committed ? "task_alt" : "cloud_upload"}</span>
                    <T>{committed ? " Committed to Procurement Baseline" : " Push to Ladakh Procurement Baseline"}</T>
                  </button>
                  <div className="grid grid-cols-2 gap-space-xs mt-1">
                    <button className="h-9 px-space-sm rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm font-medium hover:bg-surface-container flex items-center justify-center gap-1.5 transition-colors hover-lift" type="button" onClick={() => setStatus("Compiling 48-page Mil-Spec Mission Pack (ASHRAE Cold Zone 8 & ISO 13790 Compliant)...")}>
                      <span className="material-symbols-outlined text-[16px] text-error">picture_as_pdf</span>
                      {" "}<T>Spec Pack (PDF)</T>
                    </button>
                    <button className="h-9 px-space-sm rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm font-medium hover:bg-surface-container flex items-center justify-center gap-1.5 transition-colors hover-lift" type="button" onClick={() => setStatus("Exporting STEP AP242 and IFC 4x3 Multi-Physics Tessellated Solids...")}>
                      <span className="material-symbols-outlined text-[16px] text-secondary">deployed_code</span>
                      {" "}<T>STEP / IFC 3D</T>
                    </button>
                  </div>
                  {status && (
                    <p role="status" className="mt-1 px-space-sm py-1.5 rounded-xl bg-surface-container-low font-label-mono-xs text-label-mono-xs text-on-surface-variant flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-secondary">info</span>
                      <span>
                        <T>{status}</T>{" "}
                        <Link href={ROUTES.reports} className="text-primary font-semibold hover:underline">
                          <T>View in Reports</T>
                        </Link>
                      </span>
                    </p>
                  )}
                </div>
              </div>
              {/* High Altitude Logistics & Micro Environmental Summary Card */}
              <div className="w-full bg-surface-container-lowest p-5 rounded-xl shadow-card flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold"><T>Logistics Feasibility Index</T></span>
                  <span className="font-label-mono-xs text-label-mono-xs px-2 py-0.5 rounded-full bg-[#F3EEFA] text-[#6B4C9A] font-bold">
                    <T>CH-47 HELI-LIFT</T>
                  </span>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex justify-between items-center text-body-sm font-body-sm">
                    <span className="text-on-surface-variant"><T>Total Sub-Assembly Weight</T></span>
                    <span className="font-label-mono-sm text-label-mono-sm font-bold text-on-surface font-data">3,840 kg</span>
                  </div>
                  <div className="flex justify-between items-center text-body-sm font-body-sm">
                    <span className="text-on-surface-variant"><T>Max Single Module Envelope</T></span>
                    <span className="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface"><span className="font-data">2.4m</span> × <span className="font-data">1.8m</span> × <span className="font-data">1.2m</span></span>
                  </div>
                  <div className="flex justify-between items-center text-body-sm font-body-sm">
                    <span className="text-on-surface-variant"><T>Field Assembly Time (4 Sappers)</T></span>
                    <span className="font-label-mono-sm text-label-mono-sm font-semibold text-[#059669]">
                      <span className="font-data">18.5</span> <T>Hours (No Wet Trades)</T>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
