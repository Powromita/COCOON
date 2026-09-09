"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { defaultDesignForm } from "@/mock/design";
import { buildSimulationResult, getSavedDesign, getSavedSimulation } from "@/services/design";
import type { DesignForm, SimulationResult } from "@/types/design";

const fallbackDesign: DesignForm = defaultDesignForm;

export default function IndividualResultsPage() {
  const [design, setDesign] = useState<DesignForm>(fallbackDesign);
  const [result, setResult] = useState<SimulationResult | null>(null);

  useEffect(() => {
    const savedDesign = getSavedDesign() ?? fallbackDesign;
    const savedResult = getSavedSimulation() ?? buildSimulationResult(savedDesign);
    setDesign(savedDesign);
    setResult(savedResult);
  }, []);

  const chart = useMemo(() => {
    if (!result) {
      return { indoorPath: "", outdoorPath: "", points: [] as Array<{ x: number; y: number; indoor: number; outdoor: number }> };
    }

    const values = result.forecast.flatMap((point) => [point.indoor, point.outdoor]);
    const min = Math.min(...values, result.comfortBand.min) - 2;
    const max = Math.max(...values, result.comfortBand.max) + 2;

    const toY = (value: number) => 200 - ((value - min) / (max - min || 1)) * 150;
    const indoorPath = result.forecast
      .map((point, index) => {
        const x = 40 + (index / (result.forecast.length - 1)) * 900;
        const y = toY(point.indoor);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
    const outdoorPath = result.forecast
      .map((point, index) => {
        const x = 40 + (index / (result.forecast.length - 1)) * 900;
        const y = toY(point.outdoor);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

    const points = result.forecast.map((point, index) => ({
      x: 40 + (index / (result.forecast.length - 1)) * 900,
      y: toY(point.indoor),
      indoor: point.indoor,
      outdoor: point.outdoor,
    }));

    return { indoorPath, outdoorPath, points, min, max };
  }, [result]);

  if (!result) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#111827_18%,_#0b1220_48%,_#030712_100%)] text-slate-100 antialiased">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-700 text-xl font-bold text-white shadow-lg shadow-cyan-500/25">
              C
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-black tracking-tight text-white">COCOON</span>
                <span className="hidden h-5 w-px bg-slate-600 sm:block" />
                <span className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200 sm:block">PGML SUITE</span>
              </div>
              <span className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Predict. Compare. Validate.</span>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link href="/guide" className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20">
              User guide
            </Link>
            <Link href="/individual/configure" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10">
              Back to setup
            </Link>
            <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100">
              Individual mode
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-8 overflow-hidden rounded-[28px] border border-cyan-500/20 bg-gradient-to-r from-cyan-500/15 via-sky-500/10 to-indigo-500/10 p-6 shadow-[0_20px_60px_rgba(14,116,144,0.18)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200">Thermal telemetry</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">{result.projectName}</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-300">
                Estimated comfort and energy behavior for {design.region} with a {design.shape.toLowerCase()} form and {design.wall.toLowerCase()} envelope.
              </p>
            </div>
            <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
              <span className="font-semibold text-emerald-200">Status:</span> Ready for review
            </div>
          </div>
        </div>

        <nav aria-label="Results sections" className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 p-2">
          <a href="#overview" className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-950">Overview</a>
          <a href="#forecast" className="rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 transition hover:bg-slate-800 hover:text-cyan-200">Forecast graph</a>
          <a href="#recommendations" className="rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 transition hover:bg-slate-800 hover:text-cyan-200">Recommendations</a>
        </nav>

        <section id="overview" className="mb-8 grid scroll-mt-28 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Indoor temp", value: `${result.metrics.indoorTemp}°C`, tint: "from-cyan-500/20 to-sky-500/5", accent: "text-cyan-200" },
            { label: "Comfort score", value: `${result.metrics.comfortScore}%`, tint: "from-emerald-500/20 to-teal-500/5", accent: "text-emerald-200" },
            { label: "Energy load", value: `${result.metrics.energyLoad} kWh/day`, tint: "from-violet-500/20 to-fuchsia-500/5", accent: "text-violet-200" },
            { label: "Occupancy", value: `${result.metrics.occupancy} people`, tint: "from-amber-500/20 to-orange-500/5", accent: "text-amber-200" },
          ].map((metric) => (
            <div key={metric.label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${metric.tint} p-4`}> 
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">{metric.label}</p>
              <p className={`mt-3 text-2xl font-black ${metric.accent}`}>{metric.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <div id="forecast" className="scroll-mt-28 rounded-[28px] border border-slate-700/80 bg-slate-900/75 p-5 shadow-[0_20px_60px_rgba(14,116,144,0.18)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Temperature profile</p>
                <h2 className="mt-2 text-xl font-bold text-white">48-hour thermal forecast</h2>
              </div>
              <div className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                12 intervals
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
              <svg viewBox="0 0 980 260" className="h-72 w-full" preserveAspectRatio="none" aria-label="Indoor temperature chart">
                <defs>
                  <linearGradient id="comfortBand" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(34,211,238,0.20)" />
                    <stop offset="100%" stopColor="rgba(34,211,238,0.02)" />
                  </linearGradient>
                </defs>

                {[0, 1, 2, 3, 4].map((line) => (
                  <line key={line} x1="40" y1={20 + line * 42} x2="940" y2={20 + line * 42} stroke="rgba(148,163,184,0.15)" strokeDasharray="4 6" />
                ))}

                <rect x="40" y="34" width="900" height="160" fill="url(#comfortBand)" rx="12" />
                <rect x="40" y="103" width="900" height="18" fill="rgba(16,185,129,0.25)" rx="9" />

                <path d={chart.outdoorPath} fill="none" stroke="#818cf8" strokeWidth="3" strokeDasharray="8 8" strokeLinecap="round" strokeLinejoin="round" />
                <path d={chart.indoorPath} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

                {chart.points.map((point) => (
                  <circle key={`${point.x}-${point.indoor}`} cx={point.x} cy={point.y} r="4.5" fill="#67e8f9" />
                ))}
              </svg>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-cyan-400"/> Indoor</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-indigo-400"/> Outdoor</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400"/> Comfort band</span>
            </div>
          </div>

          <div className="space-y-6">
            <div id="recommendations" className="scroll-mt-28 rounded-[28px] border border-indigo-500/30 bg-gradient-to-br from-indigo-500/15 to-sky-500/10 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-200">Recommendation</p>
              <h3 className="mt-2 text-xl font-bold text-white">Design guidance</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-200">
                {result.recommendations.map((recommendation) => (
                  <li key={recommendation} className="flex gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
                    <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-200">✓</span>
                    <span>{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[28px] border border-slate-700/80 bg-slate-900/75 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Design summary</p>
              <dl className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-2">
                  <dt>Location</dt>
                  <dd className="text-right text-slate-100">{result.location}</dd>
                </div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-2">
                  <dt>Climate</dt>
                  <dd className="text-right text-slate-100">{result.climate}</dd>
                </div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-2">
                  <dt>Geometry</dt>
                  <dd className="text-right text-slate-100">{result.geometry}</dd>
                </div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-700 pb-2">
                  <dt>Envelope</dt>
                  <dd className="text-right text-slate-100">{result.materials}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt>Comfort band</dt>
                  <dd className="text-right text-slate-100">{result.comfortBand.min}°C to {result.comfortBand.max}°C</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </main>
    </main>
  );
}
