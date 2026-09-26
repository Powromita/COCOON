"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { getCandidate } from "@/lib/mock-data";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";
import Badge from "@/components/ui/Badge";

function formatSimTime(value: number) {
  const hours = Math.floor(value);
  const minutes = value % 1 === 0.5 ? "30" : "00";
  return `${hours.toString().padStart(2, "0")}:${minutes} HRS`;
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const match = getCandidate(decodeURIComponent(id));
  const [simTime, setSimTime] = useState(12.5);

  if (!match) notFound();
  const candidate = match;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex flex-col gap-6">
      {/* 1. TOP BREADCRUMB & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          href={ROUTES.candidateTelemetry}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-navy no-underline"
        >
          <span className="material-symbols-outlined text-[16px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span className="group-hover:underline"><T>Back to Simulation Results &amp; Telemetry</T></span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={ROUTES.shelterConfigurator.step1}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <T>New Simulation</T>
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-sm hover-lift"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <T>Print / Save Dossier</T>
          </button>
        </div>
      </div>

      {/* 2. CANDIDATE HEADER BANNER */}
      <section className="bg-surface-container-lowest rounded-2xl border border-line p-5 sm:p-6 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="equilibrium">MIL-PRF-32535 READY</Badge>
            <Badge tone="navy">{candidate.archetype}</Badge>
            <Badge tone="teal">Rank {candidate.rank}</Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy tracking-tight">
            Candidate #{candidate.id} · {candidate.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-teal">location_on</span>
              Daulat Beg Oldi (DBO) Sector, Eastern Ladakh
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-navy">landscape</span>
              5,065m AMSL · 35.318° N, 77.922° E
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-thermal">thermostat</span>
              Ext. Ambient: -38.2°C
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-equilibrium-tint text-equilibrium text-xs font-bold">
            <span className="material-symbols-outlined text-[16px]">verified</span>
            <T>Validated by ANSYS FEA</T>
          </div>
          <span className="text-xs text-ink-muted">
            Mesh: 1.4M Elements (SOLID90) · Residual &lt; 10⁻⁶
          </span>
        </div>
      </section>

      {/* 3. MAIN WORKSTATION GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: 3D Digital Twin Viewport (8 Cols) */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          <div className="w-full rounded-2xl bg-[#09111e] overflow-hidden border border-line shadow-feature flex flex-col">
            {/* Viewport Top Header */}
            <div className="w-full bg-[#0d1a2d]/95 px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">view_in_ar</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  <T>Interactive 3D Thermal Cutaway</T>
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/70">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-equilibrium" />
                  +20.8°C Habitation Core
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-thermal" />
                  -38.2°C Exterior Frost
                </span>
              </div>
            </div>

            {/* Graphic SVG Canvas */}
            <div className="relative w-full h-[460px] bg-gradient-to-b from-[#09111e] via-[#0d1c33] to-[#080d17] flex items-center justify-center p-4 select-none overflow-hidden">
              {/* Background grid */}
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(#90a8ff 0.75px, transparent 0.75px), radial-gradient(#90a8ff 0.75px, #09111e 0.75px)",
                  backgroundSize: "32px 32px",
                  backgroundPosition: "0 0, 16px 16px",
                }}
              />

              {/* Cutaway Shelter SVG Model */}
              <div className="relative z-10 w-full max-w-[700px] h-[360px] flex items-center justify-center">
                <svg
                  className="w-full h-full filter drop-shadow-[0_20px_30px_rgba(0,0,0,0.8)]"
                  viewBox="0 0 800 480"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="thermalWallLeft" x1="0%" x2="100%" y1="0%" y2="0%">
                      <stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.95" />
                      <stop offset="35%" stopColor="#006878" stopOpacity="0.9" />
                      <stop offset="70%" stopColor="#059669" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.9" />
                    </linearGradient>
                    <linearGradient id="livingZoneGrad" x1="0%" x2="0%" y1="100%" y2="0%">
                      <stop offset="0%" stopColor="#059669" stopOpacity="0.85" />
                      <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
                      <stop offset="90%" stopColor="#D97706" stopOpacity="0.85" />
                    </linearGradient>
                    <radialGradient cx="30%" cy="20%" id="sunBeam" r="70%">
                      <stop offset="0%" stopColor="#FC922B" stopOpacity="0.45" />
                      <stop offset="60%" stopColor="#FC922B" stopOpacity="0.08" />
                      <stop offset="100%" stopColor="#FC922B" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Sun Direction Vector */}
                  <polygon fill="url(#sunBeam)" points="120,40 380,180 260,340 60,180" />
                  <line opacity="0.7" stroke="#FC922B" strokeDasharray="4 3" strokeWidth="1.5" x1="120" x2="260" y1="40" y2="180" />
                  <text fill="#FC922B" fontFamily="sans-serif" fontSize="11" fontWeight="bold" x="100" y="32">
                    DIRECT SOLAR FLUX: 914 W/m²
                  </text>

                  {/* Permafrost Foundation */}
                  <polygon fill="#0b1726" points="150,380 400,470 700,360 450,280" stroke="#1d2d44" strokeWidth="1.5" />
                  <path d="M 150,380 L 400,470 L 700,360" stroke="#25426e" strokeDasharray="2 4" strokeWidth="1" />

                  {/* Foundation Aerogel Plinth */}
                  <polygon fill="#00236f" fillOpacity="0.85" points="180,360 400,440 670,345 450,275" stroke="#7dd3e7" strokeWidth="1.5" />
                  <text fill="#90a8ff" fontFamily="sans-serif" fontSize="10" x="490" y="390">
                    AEROGEL PLINTH R-84 (-28°C SOIL)
                  </text>

                  {/* Shelter Vault */}
                  <polygon fill="#132742" points="210,190 440,110 680,195 450,275" stroke="#284873" strokeWidth="1.5" />

                  {/* Zone A: VIP Panel */}
                  <polygon fill="url(#thermalWallLeft)" points="210,190 320,150 320,310 210,350" stroke="#38bdf8" strokeWidth="1" />

                  {/* Zone B: Habitation Core */}
                  <polygon fill="url(#livingZoneGrad)" points="320,150 490,195 490,365 320,310" stroke="#10b981" strokeWidth="1.5" />

                  {/* Zone C: PCM Core */}
                  <polygon fill="#D97706" fillOpacity="0.75" points="380,270 450,290 450,340 380,320" stroke="#f59e0b" strokeWidth="1.5" />
                  <text fill="#ffffff" fontFamily="sans-serif" fontSize="9" fontWeight="bold" x="390" y="305">
                    PCM CORE: +22.0°C
                  </text>

                  {/* Convection loop */}
                  <path d="M 350,290 Q 360,220 410,215 Q 460,210 460,250" fill="none" stroke="#fef08a" strokeDasharray="5 3" strokeLinecap="round" strokeWidth="2" />
                  <polygon fill="#fef08a" points="460,250 455,242 465,242" />
                  <text fill="#fef08a" fontFamily="sans-serif" fontSize="10" fontWeight="bold" x="350" y="240">
                    HEAT CONVECTION LOOP
                  </text>

                  {/* Roof glazing */}
                  <polygon fill="#fc922b" fillOpacity="0.3" points="320,150 440,110 570,155 490,195" stroke="#fc922b" strokeWidth="2" />

                  {/* Telemetry Pin 01: Ext */}
                  <circle cx="210" cy="270" fill="#BA1A1A" r="5" stroke="#ffffff" strokeWidth="2" />
                  <line stroke="#ffffff" strokeWidth="1" x1="210" x2="140" y1="270" y2="250" />
                  <rect fill="#0d1a2d" height="24" rx="4" stroke="#BA1A1A" strokeWidth="1" width="90" x="50" y="235" />
                  <text fill="#ffdad6" fontFamily="sans-serif" fontSize="10" fontWeight="bold" x="56" y="251">-38.2°C EXT</text>

                  {/* Telemetry Pin 02: VIP Core */}
                  <circle cx="265" cy="250" fill="#006878" r="4" stroke="#ffffff" strokeWidth="1.5" />
                  <line stroke="#ffffff" strokeWidth="1" x1="265" x2="265" y1="250" y2="195" />
                  <rect fill="#0d1a2d" height="20" rx="4" stroke="#006878" strokeWidth="1" width="96" x="220" y="175" />
                  <text fill="#94eafe" fontFamily="sans-serif" fontSize="9" fontWeight="bold" x="226" y="189">-4.5°C VIP CORE</text>

                  {/* Telemetry Pin 03: Habitation */}
                  <circle cx="410" cy="270" fill="#059669" r="5" stroke="#ffffff" strokeWidth="2" />
                  <line stroke="#ffffff" strokeWidth="1" x1="410" x2="480" y1="270" y2="250" />
                  <rect fill="#0d1a2d" height="24" rx="4" stroke="#059669" strokeWidth="1" width="112" x="480" y="238" />
                  <text fill="#6ee7b7" fontFamily="sans-serif" fontSize="10" fontWeight="bold" x="486" y="254">+20.8°C LIVING</text>
                </svg>
              </div>

              {/* Floating Top Right HUD */}
              <div className="absolute top-4 right-4 z-20 bg-slate-900/90 backdrop-blur-md p-3.5 rounded-xl border border-white/10 text-white flex flex-col gap-1.5 min-w-[200px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/70">Core Delta (ΔT)</span>
                  <span className="font-bold text-white font-data">+59.0 K</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/70">Indoor Air Quality</span>
                  <span className="font-bold text-equilibrium font-data">428 PPM CO₂</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/70">Condensation Risk</span>
                  <span className="font-bold text-equilibrium font-data">0.0%</span>
                </div>
              </div>

              {/* Isotherm Scale Bar */}
              <div className="absolute bottom-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-white/10 flex flex-col gap-1.5 min-w-[280px]">
                <div className="flex items-center justify-between text-[11px] text-white/80 font-semibold">
                  <span>Isotherm Temperature (°C)</span>
                  <span className="text-secondary font-bold">MIL-STD</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-[#1E3A8A] via-[#006878] via-[#059669] via-[#D97706] to-[#BA1A1A]" />
                <div className="flex justify-between text-[10px] text-white/60 font-data">
                  <span>-40°C</span>
                  <span>-20°C</span>
                  <span>0°C</span>
                  <span className="text-equilibrium font-bold">+18°C</span>
                  <span className="text-thermal font-bold">+24°C</span>
                </div>
              </div>
            </div>

            {/* Diurnal Solar Time Slider (Interactive & Functional) */}
            <div className="w-full bg-surface-container-lowest p-4 border-t border-line flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-on-surface">
                  <span className="material-symbols-outlined text-thermal text-[20px]">sunny</span>
                  <span className="text-xs font-bold">
                    <T>Diurnal Sun Path &amp; Solar Absorption Time</T>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-on-surface-variant uppercase">Time of Day:</span>
                  <span className="text-xs font-bold text-navy px-2.5 py-0.5 bg-primary-fixed rounded-full font-data">
                    {formatSimTime(simTime)}
                  </span>
                </div>
              </div>

              <input
                className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-navy"
                max="24"
                min="0"
                step="0.5"
                type="range"
                value={simTime}
                onChange={(e) => setSimTime(parseFloat(e.target.value))}
                aria-label="Simulated time of day"
              />

              <div className="flex justify-between text-[11px] text-on-surface-variant font-data">
                <span>00:00 (Night Min -41°C)</span>
                <span className="text-thermal font-semibold">07:45 (Dawn)</span>
                <span className="text-navy font-bold">12:30 (Solar Peak 980 W/m²)</span>
                <span className="text-thermal font-semibold">17:15 (Dusk)</span>
                <span>23:59 (PCM Discharge)</span>
              </div>
            </div>
          </div>

          {/* Dimensions & Geometric Footprint */}
          <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-line shadow-card flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-container pb-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-navy text-[20px]">square_foot</span>
                <h3 className="text-sm font-bold text-on-surface">
                  <T>Shelter Dimensions &amp; Geometry</T>
                </h3>
              </div>
              <span className="text-xs font-semibold text-teal font-data">
                12-Troop Bunk Capacity
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="p-2.5 bg-surface-container-low rounded-xl border border-line flex flex-col">
                <span className="text-[10px] text-on-surface-variant uppercase font-medium">Length</span>
                <span className="text-base font-bold text-navy font-data mt-0.5">12.0 m</span>
                <span className="text-[9px] text-ink-muted">12,000 mm</span>
              </div>
              <div className="p-2.5 bg-surface-container-low rounded-xl border border-line flex flex-col">
                <span className="text-[10px] text-on-surface-variant uppercase font-medium">Width</span>
                <span className="text-base font-bold text-navy font-data mt-0.5">4.5 m</span>
                <span className="text-[9px] text-ink-muted">4,500 mm span</span>
              </div>
              <div className="p-2.5 bg-surface-container-low rounded-xl border border-line flex flex-col">
                <span className="text-[10px] text-on-surface-variant uppercase font-medium">Height</span>
                <span className="text-base font-bold text-navy font-data mt-0.5">2.8 m</span>
                <span className="text-[9px] text-ink-muted">Apex ceiling</span>
              </div>
              <div className="p-2.5 bg-surface-container-low rounded-xl border border-line flex flex-col">
                <span className="text-[10px] text-on-surface-variant uppercase font-medium">Floor Area</span>
                <span className="text-base font-bold text-navy font-data mt-0.5">54.0 m²</span>
                <span className="text-[9px] text-equilibrium font-medium">4.5 m²/bed</span>
              </div>
              <div className="p-2.5 bg-surface-container-low rounded-xl border border-line flex flex-col">
                <span className="text-[10px] text-on-surface-variant uppercase font-medium">Volume</span>
                <span className="text-base font-bold text-navy font-data mt-0.5">126.5 m³</span>
                <span className="text-[9px] text-ink-muted">Thermal air mass</span>
              </div>
              <div className="p-2.5 bg-surface-container-low rounded-xl border border-line flex flex-col">
                <span className="text-[10px] text-on-surface-variant uppercase font-medium">Dry Weight</span>
                <span className="text-base font-bold text-teal font-data mt-0.5">3,840 kg</span>
                <span className="text-[9px] text-teal font-medium">Heli-liftable</span>
              </div>
            </div>
          </div>

          {/* Composite Wall Cross-Section Breakdown */}
          <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-line shadow-card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-navy text-[20px]">layers</span>
                <h3 className="text-sm font-bold text-on-surface">
                  <T>Multi-Layer Wall Composite Specification</T>
                </h3>
              </div>
              <span className="text-xs font-bold text-navy bg-primary-fixed px-2.5 py-1 rounded-full font-data">
                R-Value: 78.4 m²·K/W
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 bg-surface-container-low rounded-xl border border-line">
                <span className="text-[10px] uppercase font-bold text-on-surface-variant">Layer 01 (Outer)</span>
                <p className="text-xs font-bold text-navy mt-1">Aerodynamic Ti-Zinc Skin</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">1.8mm · Wind load 220 km/h</p>
              </div>

              <div className="p-3 bg-surface-container-low rounded-xl border border-line">
                <span className="text-[10px] uppercase font-bold text-teal">Layer 02 (Thermal Barrier)</span>
                <p className="text-xs font-bold text-navy mt-1">Dual-Cavity VIP Panels</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">60mm · k = 0.0038 W/m·K</p>
              </div>

              <div className="p-3 bg-surface-container-low rounded-xl border border-line">
                <span className="text-[10px] uppercase font-bold text-thermal">Layer 03 (Storage)</span>
                <p className="text-xs font-bold text-navy mt-1">Bio-PCM Thermal Matrix</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">35mm · 21.5°C Latent Phase</p>
              </div>

              <div className="p-3 bg-surface-container-low rounded-xl border border-line">
                <span className="text-[10px] uppercase font-bold text-equilibrium">Layer 04 (Interior)</span>
                <p className="text-xs font-bold text-navy mt-1">Anti-Microbial Spruce Ply</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">12mm · Humidity Balancing</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Key Verified Engineering Telemetry (4 Cols) */}
        <div className="xl:col-span-4 flex flex-col gap-5">
          <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-line shadow-card flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-surface-container pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-navy text-[20px]">analytics</span>
                <h2 className="text-sm font-bold text-on-surface">
                  <T>Engineering Telemetry</T>
                </h2>
              </div>
              <Badge tone="equilibrium">Pass</Badge>
            </div>

            {/* U-Value */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-line flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant font-medium">Overall U-Value (Conductance)</span>
                <Badge tone="equilibrium">ANSYS</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-navy font-data">0.108</span>
                <span className="text-xs text-on-surface-variant font-data">W/m²·K</span>
              </div>
              <p className="text-[11px] text-equilibrium font-medium">
                42.1% lower than MIL-STD 0.220 W/m²·K limit
              </p>
            </div>

            {/* Thermal Lag */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-line flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant font-medium">Thermal Lag (Phase Shift)</span>
                <Badge tone="teal">RC Solver</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-navy font-data">11.4</span>
                <span className="text-xs text-on-surface-variant font-data">Hours</span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Shifts peak daytime solar heat to mitigate sub-zero night freeze
              </p>
            </div>

            {/* Fuel Consumption */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-line flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant font-medium">Fuel Demand (Kerosene)</span>
                <Badge tone="equilibrium">Net Zero</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-equilibrium font-data">0.00</span>
                <span className="text-xs text-on-surface-variant font-data">L/day (Daytime)</span>
              </div>
              <p className="text-[11px] text-equilibrium font-medium">
                100% passive thermal balance during daylight hours
              </p>
            </div>

            {/* Occupant Heat Recovery */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-line flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant font-medium">Biological Heat Recovery</span>
                <Badge tone="thermal">12 Occupants</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-navy font-data">1.44</span>
                <span className="text-xs text-on-surface-variant font-data">kW continuous</span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                120W per soldier metabolic heat captured via HRV system
              </p>
            </div>

            {/* Snow Load */}
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-line flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant font-medium">Structural Snow Load</span>
                <Badge tone="equilibrium">+14.3% Margin</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-navy font-data">4.8</span>
                <span className="text-xs text-on-surface-variant font-data">kN/m²</span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Exceeds Himalayan Mil-Std requirement (4.2 kN/m² @ 5,065m)
              </p>
            </div>
          </div>

          {/* Logistics Feasibility */}
          <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-line shadow-card flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-surface-container pb-2.5">
              <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                <T>Logistics Feasibility</T>
              </span>
              <Badge tone="teal">CH-47 Heli-Lift</Badge>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between py-1 border-b border-surface-container-low">
                <span className="text-on-surface-variant">Total Structure Weight:</span>
                <span className="font-bold text-navy font-data">3,840 kg</span>
              </div>
              <div className="flex justify-between py-1 border-b border-surface-container-low">
                <span className="text-on-surface-variant">Max Single Module:</span>
                <span className="font-medium text-navy font-data">2.4m × 1.8m × 1.2m</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-on-surface-variant">Field Erection Time:</span>
                <span className="font-bold text-equilibrium font-data">18.5 hrs (4 Soldiers)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
