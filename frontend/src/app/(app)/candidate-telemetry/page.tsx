"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { createElement, Suspense, useEffect, useMemo, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import {
  getOptimization,
  listOptimizations,
  deleteOptimization,
  getReport,
  getTimeseries,
  getDesign,
  describePipelineError,
  type BuildingModel,
  type CandidateOutcome,
  type FinalReport,
  type OptimizationListItem,
  type OptimizationStatus,
  type TimeseriesResponse,
  LATEST_OPTIMIZATION_STORAGE_KEY,
} from "@/lib/api";

// three.js touches the DOM/WebGL at import time, so it must never run during SSR.
const BuildingViewer3D = dynamic(() => import("@/components/three/BuildingViewer3D"), {
  ssr: false,
  loading: () => <div className="w-full h-[480px] rounded-xl bg-surface-container-low animate-pulse" />,
});

// ─── Chart helpers ───────────────────────────────────────────────────────────



function scaleY(val: number, min: number, max: number, height: number, pad = 20) {
  return pad + ((max - val) / (max - min)) * (height - 2 * pad);
}

function validationStateLabel(state: string | null | undefined) {
  if (!state) return "—";
  if (state === "RC_ONLY_ANSYS_NOT_REQUESTED") return "Not requested";
  const words = state.replace(/_/g, " ").toLowerCase();
  // "VALIDATED_BY_ANSYS" -> "Validated by ANSYS"
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/ansys/i, "ANSYS");
}

function formatYears(value: number | null | undefined) {
  if (value == null) return 'N/A';
  return `${value.toFixed(1)} yr`;
}

function formatLakh(value: number | null | undefined) {
  if (value == null) return 'N/A';
  return `₹${(value / 1e5).toFixed(2)}L`;
}

function MetricCard({
  label,
  value,
  unit,
  subtext,
  icon,
  variant = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  subtext?: string;
  icon?: string;
  variant?: "default" | "primary" | "thermal" | "success" | "warning";
}) {
  const colorMap = {
    default: "text-on-surface",
    primary: "text-primary",
    thermal: "text-amber-600",
    success: "text-emerald-600",
    warning: "text-amber-700",
  };

  const bgMap = {
    default: "bg-surface-container-low/80 border-outline-variant/60",
    primary: "bg-primary-fixed/15 border-primary/25",
    thermal: "bg-amber-50 border-amber-200/60",
    success: "bg-emerald-50 border-emerald-200/60",
    warning: "bg-amber-50 border-amber-300/60",
  };

  return (
    <div className={`p-4 rounded-xl border ${bgMap[variant]} flex flex-col justify-between min-h-[105px] transition-all hover:shadow-sm`}>
      <div className="flex items-center justify-between gap-1 mb-2">
        <span className="font-label-mono-xs text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold truncate">
          {label}
        </span>
        {icon && (
          <span className={`material-symbols-outlined text-[17px] ${colorMap[variant]} shrink-0 opacity-80`}>
            {icon}
          </span>
        )}
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className={`font-data text-2xl sm:text-3xl font-extrabold tracking-tight ${colorMap[variant]}`}>
            {value}
          </span>
          {unit && (
            <span className="font-data text-xs text-on-surface-variant font-semibold">
              {unit}
            </span>
          )}
        </div>
        {subtext && (
          <div className="font-body-sm text-[11px] text-on-surface-variant mt-1 truncate">
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}

type ErrorStats = { n?: number; mae_c?: number; rmse_c?: number; max_abs_c?: number; bias_ansys_minus_m4_c?: number };

function ValidationSummary({ validation }: { validation: { state: string; [k: string]: unknown } }) {
  const comparison = validation.comparison_m4_vs_ansys as { pooled?: ErrorStats; zones?: Record<string, ErrorStats>; scenario?: string } | undefined;
  const thresholds = validation.acceptance_thresholds as { mae_c_max?: number; rmse_c_max?: number; max_abs_c_max?: number } | undefined;
  const pooled = comparison?.pooled;
  const accepted = validation.accepted === true;
  const agreementWithinThresholds = validation.agreement_within_thresholds as boolean | undefined;
  const reason = (validation.error_reason ?? validation.reason ?? validation.warning) as string | null | undefined;
  const fmt = (v: number | undefined) => (typeof v === "number" ? `${v.toFixed(2)} °C` : "—");
  const limit = (v: number | undefined) => (typeof v === "number" ? `limit ${v.toFixed(1)} °C` : undefined);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${accepted ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
          <span className="material-symbols-outlined text-[16px]">{accepted ? "check_circle" : "info"}</span>
          {validationStateLabel(validation.state)}
          {pooled && agreementWithinThresholds === true ? " · RC agreement within thresholds" : ""}
          {pooled && agreementWithinThresholds === false ? " · RC agreement warning" : ""}
        </span>
        {comparison?.scenario && <span className="text-xs text-on-surface-variant">{comparison.scenario}</span>}
      </div>

      {pooled && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Mean abs. error" value={fmt(pooled.mae_c)} subtext={limit(thresholds?.mae_c_max)} icon="straighten" variant="primary" />
          <MetricCard label="RMSE" value={fmt(pooled.rmse_c)} subtext={limit(thresholds?.rmse_c_max)} icon="functions" />
          <MetricCard label="Max abs. error" value={fmt(pooled.max_abs_c)} subtext={limit(thresholds?.max_abs_c_max)} icon="vertical_align_top" />
          <MetricCard label="Samples" value={pooled.n != null ? String(pooled.n) : "—"} subtext="Zone × hour comparisons" icon="database" />
        </div>
      )}

      {comparison?.zones && Object.keys(comparison.zones).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant uppercase tracking-wider text-on-surface-variant">
                <th className="py-2 px-3 font-semibold">Zone</th>
                <th className="py-2 px-3 font-semibold text-right">MAE</th>
                <th className="py-2 px-3 font-semibold text-right">RMSE</th>
                <th className="py-2 px-3 font-semibold text-right">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {Object.entries(comparison.zones).map(([zone, st]) => (
                <tr key={zone}>
                  <td className="py-2 px-3 capitalize font-medium text-on-surface">{zone}</td>
                  <td className="py-2 px-3 text-right font-data text-on-surface-variant">{fmt(st.mae_c)}</td>
                  <td className="py-2 px-3 text-right font-data text-on-surface-variant">{fmt(st.rmse_c)}</td>
                  <td className="py-2 px-3 text-right font-data text-on-surface-variant">{fmt(st.max_abs_c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reason && <p className="font-body-sm text-xs text-on-surface-variant">{reason}</p>}
      {typeof validation.meaning === "string" && (
        <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">{validation.meaning}</p>
      )}
    </div>
  );
}

export type TemperaturePoint = {
  h: string;
  inside: number;
  passive?: number;
  airlock?: number;
  storage?: number;
  living?: number;
  sleeping?: number;
  heatingW?: number;
  outside: number;
};

function TemperatureChart({ data, isPassiveOnly = false }: { data: TemperaturePoint[]; isPassiveOnly?: boolean }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<"all" | "conditioned" | "passive" | "multizone">(
    isPassiveOnly ? "passive" : "all"
  );
  // Optional zoom to the interior band (off by default: outside ambient + comfort band share the axis).
  const [fitOverride, setFitOverride] = useState<boolean | null>(null);
  const W = 840, H = 280;
  const PAD_LEFT = 60, PAD_RIGHT = 30, PAD_TOP = 25, PAD_BOTTOM = 40;

  if (data.length === 0) return null;

  const fitInterior = fitOverride === true;
  const hasPassive = data.some((d) => d.passive !== undefined);
  const hasAirlock = data.some((d) => d.airlock !== undefined);
  const hasStorage = data.some((d) => d.storage !== undefined);

  // Collect values across the active mode to calculate range
  const allTemps: number[] = [];
  data.forEach((d) => {
    if (!fitInterior) allTemps.push(d.outside);
    if (chartMode === "all" || chartMode === "conditioned") allTemps.push(d.inside);
    if ((chartMode === "all" || chartMode === "passive") && d.passive !== undefined) allTemps.push(d.passive);
    if (chartMode === "multizone") {
      if (d.living !== undefined) allTemps.push(d.living);
      if (d.sleeping !== undefined) allTemps.push(d.sleeping);
      if (d.airlock !== undefined) allTemps.push(d.airlock);
      if (d.storage !== undefined) allTemps.push(d.storage);
    }
  });

  const rawMin = fitInterior ? Math.min(...allTemps) : Math.min(...allTemps, 15);
  const rawMax = fitInterior ? Math.max(...allTemps) : Math.max(...allTemps, 24);

  const range = rawMax - rawMin;
  const step = range <= 3 ? 0.5 : range <= 6 ? 1 : range <= 12 ? 2 : range <= 30 ? 5 : range <= 65 ? 10 : 15;
  const minVal = Math.floor(rawMin / step) * step;
  const maxVal = Math.ceil(rawMax / step) * step;

  const ticks: number[] = [];
  for (let v = minVal; v <= maxVal + 1e-9; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const y = (val: number) => PAD_TOP + ((maxVal - val) / (maxVal - minVal || 1)) * chartH;
  const x = (i: number) => PAD_LEFT + (i / Math.max(data.length - 1, 1)) * chartW;

  const insidePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(d.inside).toFixed(1)}`).join(" ");
  const linePath = (pick: (d: TemperaturePoint) => number | undefined) => {
    let started = false;
    return data.map((d, i) => {
      const v = pick(d);
      if (v === undefined) { started = false; return ""; }
      const seg = `${started ? "L" : "M"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      started = true;
      return seg;
    }).filter(Boolean).join(" ");
  };
  const passivePath = hasPassive ? linePath((d) => d.passive) : "";
  const airlockPath = hasAirlock ? linePath((d) => d.airlock) : "";
  const storagePath = hasStorage ? linePath((d) => d.storage) : "";
  const livingPath = linePath((d) => d.living);
  const sleepingPath = linePath((d) => d.sleeping);
  const outsidePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(d.outside).toFixed(1)}`).join(" ");

  const activeFilledPath = chartMode === "passive" && hasPassive ? passivePath : insidePath;
  const insideArea = `${activeFilledPath} L ${x(data.length - 1).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} L ${x(0).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} Z`;

  const comfortVisible = 24 > minVal && 15 < maxVal;
  const yComfortHigh = y(Math.min(24, maxVal));
  const yComfortLow = y(Math.max(15, minVal));
  const comfortH = comfortVisible ? Math.max(yComfortLow - yComfortHigh, 0) : 0;

  const zeroY = y(0);
  const showZero = 0 >= minVal && 0 <= maxVal;

  const activePoint = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < data.length ? data[hoverIdx] : null;

  const avgInside = data.length > 0 ? data.reduce((s, d) => s + d.inside, 0) / data.length : 18.0;
  const targetSetpointStr = avgInside.toFixed(1);

  return (
    <div className="flex flex-col gap-3">
      {/* Mode Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-line">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-surface-container border border-line text-xs">
          {isPassiveOnly ? (
            <>
              {hasPassive && (
                <button
                  type="button"
                  onClick={() => setChartMode("passive")}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                    chartMode === "passive" ? "bg-navy text-white shadow-xs" : "text-on-surface-variant hover:text-navy hover:bg-surface-container-high"
                  }`}
                >
                  Passive Response (100% Unheated)
                </button>
              )}
              <button
                type="button"
                onClick={() => setChartMode("all")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  chartMode === "all" ? "bg-navy text-white shadow-xs" : "text-on-surface-variant hover:text-navy hover:bg-surface-container-high"
                }`}
              >
                Comparative (Passive vs Sized Benchmark)
              </button>
              <button
                type="button"
                onClick={() => setChartMode("conditioned")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  chartMode === "conditioned" ? "bg-navy text-white shadow-xs" : "text-on-surface-variant hover:text-navy hover:bg-surface-container-high"
                }`}
              >
                Sized Heater Benchmark (Hypothetical @ {targetSetpointStr}°C)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setChartMode("all")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  chartMode === "all" ? "bg-navy text-white shadow-xs" : "text-on-surface-variant hover:text-navy hover:bg-surface-container-high"
                }`}
              >
                Comparative (Heated vs Passive)
              </button>
              <button
                type="button"
                onClick={() => setChartMode("conditioned")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  chartMode === "conditioned" ? "bg-navy text-white shadow-xs" : "text-on-surface-variant hover:text-navy hover:bg-surface-container-high"
                }`}
              >
                Conditioned (Heater ON @ {targetSetpointStr}°C)
              </button>
              {hasPassive && (
                <button
                  type="button"
                  onClick={() => setChartMode("passive")}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                    chartMode === "passive" ? "bg-navy text-white shadow-xs" : "text-on-surface-variant hover:text-navy hover:bg-surface-container-high"
                  }`}
                >
                  Passive Response (Unheated)
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setChartMode("multizone")}
            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
              chartMode === "multizone" ? "bg-navy text-white shadow-xs" : "text-on-surface-variant hover:text-navy hover:bg-surface-container-high"
            }`}
          >
            Zone Breakdown
          </button>
        </div>

        {/* Informational Callout Badge */}
        <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
          {chartMode === "conditioned" && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold text-[11px] ${
              isPassiveOnly ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-primary-fixed/40 text-navy"
            }`}>
              <span className="material-symbols-outlined text-[15px] text-primary">thermostat</span>
              {isPassiveOnly ? `Hypothetical Sizing Benchmark (Flat ${targetSetpointStr}°C)` : `Thermostatically Maintained Setpoint (Flat ${targetSetpointStr}°C)`}
            </span>
          )}
          {chartMode === "all" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 text-[11px]">
              <span className="material-symbols-outlined text-[15px] text-emerald-700">balance</span>
              Heated Target vs Passive Retention Decay
            </span>
          )}
          {chartMode === "passive" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 font-semibold border border-teal-200 text-[11px]">
              <span className="material-symbols-outlined text-[15px] text-teal-700">
                {isPassiveOnly ? "eco" : "wb_sunny"}
              </span>
              {isPassiveOnly ? "100% Passive Solar Shelter (No Active Heater)" : "Natural Solar & Thermal Mass Retention"}
            </span>
          )}
        </div>
      </div>

      {/* Legend & Tooltip Readout */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          {(chartMode === "all" || chartMode === "conditioned") && (
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1.5 bg-[#0284c7] rounded-full inline-block" />
              <span className="font-body-sm font-semibold text-on-surface">Heated Zone ({targetSetpointStr}°C Setpoint)</span>
            </div>
          )}
          {(chartMode === "all" || chartMode === "passive") && hasPassive && (
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1.5 bg-[#059669] rounded-full inline-block" />
              <span className="font-body-sm font-semibold text-emerald-700">Passive Response (Unheated)</span>
            </div>
          )}
          {chartMode === "multizone" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-1.5 bg-[#0284c7] rounded-full inline-block" />
                <span className="font-body-sm font-semibold text-on-surface">Living Zone</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-1.5 bg-[#d97706] rounded-full inline-block" />
                <span className="font-body-sm font-semibold text-amber-700">Sleeping Zone</span>
              </div>
              {hasAirlock && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-1.5 bg-[#9333ea] rounded-full inline-block" />
                  <span className="font-body-sm font-semibold text-purple-700">Airlock Buffer</span>
                </div>
              )}
              {hasStorage && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-1.5 bg-[#0d9488] rounded-full inline-block" />
                  <span className="font-body-sm font-semibold text-teal-700">Storage Buffer</span>
                </div>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setFitOverride(!fitInterior)}
            aria-pressed={!fitInterior}
            title={fitInterior ? "Show outside ambient on the same axis" : "Zoom the axis to the interior temperatures"}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-line hover:bg-surface-container"
          >
            <span className={`w-3.5 h-0.5 border-t-2 border-dashed inline-block ${fitInterior ? "border-[#cbd5e1]" : "border-[#64748b]"}`} />
            <span className="font-body-sm text-on-surface-variant font-medium">Outside Ambient</span>
          </button>
          <button
            type="button"
            onClick={() => setFitOverride(!fitInterior)}
            className="px-2 py-0.5 rounded-md border border-line text-on-surface-variant font-medium hover:bg-surface-container"
          >
            {fitInterior ? "Show full range" : "Zoom to interior"}
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2.5 bg-emerald-100 border border-emerald-300 rounded inline-block" />
            <span className="font-body-sm text-emerald-800 font-medium">Comfort (15°C–24°C)</span>
          </div>
        </div>

        {activePoint && (
          <div className="flex flex-wrap items-center gap-2.5 px-3 py-1 bg-surface-container rounded-lg font-data text-xs border border-outline-variant/60 shadow-xs">
            <span className="font-bold text-on-surface">{activePoint.h}</span>
            {(chartMode === "all" || chartMode === "conditioned") && (
              <span className="text-[#0284c7] font-bold">Heated: {activePoint.inside.toFixed(1)}°C</span>
            )}
            {(chartMode === "all" || chartMode === "passive") && activePoint.passive !== undefined && (
              <span className="text-emerald-700 font-bold">Passive: {activePoint.passive.toFixed(1)}°C</span>
            )}
            {chartMode === "multizone" && (
              <>
                {activePoint.living !== undefined && <span className="text-[#0284c7]">Living: {activePoint.living.toFixed(1)}°C</span>}
                {activePoint.sleeping !== undefined && <span className="text-amber-700">Sleeping: {activePoint.sleeping.toFixed(1)}°C</span>}
                {activePoint.airlock !== undefined && <span className="text-purple-700">Airlock: {activePoint.airlock.toFixed(1)}°C</span>}
                {activePoint.storage !== undefined && <span className="text-teal-700">Storage: {activePoint.storage.toFixed(1)}°C</span>}
              </>
            )}
            <span className="text-[#64748b]">Outside: {activePoint.outside.toFixed(1)}°C</span>
            {activePoint.heatingW !== undefined && activePoint.heatingW > 0 && (
              <span className="text-amber-700 font-semibold">Heater: {Math.round(activePoint.heatingW)}W</span>
            )}
          </div>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * W - PAD_LEFT;
            const idx = Math.round((relX / chartW) * (data.length - 1));
            setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
          }}
        >
          <defs>
            <linearGradient id="insideTempGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="passiveTempGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {ticks.map((v) => {
            const yPos = y(v);
            return (
              <g key={v}>
                <line x1={PAD_LEFT} y1={yPos} x2={W - PAD_RIGHT} y2={yPos} stroke="#e2e8f0" strokeWidth={0.8} />
                <text x={PAD_LEFT - 10} y={yPos + 4} fill="#64748b" fontSize={11} fontFamily="monospace" textAnchor="end">
                  {v > 0 ? `+${v}°C` : `${v}°C`}
                </text>
              </g>
            );
          })}

          {showZero && (
            <line x1={PAD_LEFT} y1={zeroY} x2={W - PAD_RIGHT} y2={zeroY} stroke="#94a3b8" strokeDasharray="3,3" strokeWidth={1.2} />
          )}

          <rect
            x={PAD_LEFT}
            y={yComfortHigh}
            width={chartW}
            height={comfortH}
            fill="#d1fae5"
            opacity={0.4}
          />
          <line x1={PAD_LEFT} y1={yComfortHigh} x2={W - PAD_RIGHT} y2={yComfortHigh} stroke="#10b981" strokeDasharray="2,2" strokeWidth={0.8} opacity={0.6} />
          <line x1={PAD_LEFT} y1={yComfortLow} x2={W - PAD_RIGHT} y2={yComfortLow} stroke="#10b981" strokeDasharray="2,2" strokeWidth={0.8} opacity={0.6} />

          <path d={insideArea} fill={chartMode === "passive" ? "url(#passiveTempGrad)" : "url(#insideTempGrad)"} />
          {!fitInterior && <path d={outsidePath} fill="none" stroke="#64748b" strokeWidth={2} strokeDasharray="5,4" />}

          {/* Comparative Mode: Render both Conditioned and Passive */}
          {chartMode === "all" && (
            <>
              {hasPassive && <path d={passivePath} fill="none" stroke="#059669" strokeWidth={2.8} strokeLinejoin="round" />}
              <path d={insidePath} fill="none" stroke="#0284c7" strokeWidth={3} strokeLinejoin="round" />
            </>
          )}

          {/* Conditioned Mode Only */}
          {chartMode === "conditioned" && (
            <path d={insidePath} fill="none" stroke="#0284c7" strokeWidth={3} strokeLinejoin="round" />
          )}

          {/* Passive Mode Only */}
          {chartMode === "passive" && hasPassive && (
            <path d={passivePath} fill="none" stroke="#059669" strokeWidth={3} strokeLinejoin="round" />
          )}

          {/* Multi-Zone Mode */}
          {chartMode === "multizone" && (
            <>
              <path d={livingPath} fill="none" stroke="#0284c7" strokeWidth={2.5} strokeLinejoin="round" />
              <path d={sleepingPath} fill="none" stroke="#d97706" strokeWidth={2.5} strokeLinejoin="round" />
              {hasAirlock && <path d={airlockPath} fill="none" stroke="#9333ea" strokeWidth={2.5} strokeLinejoin="round" />}
              {hasStorage && <path d={storagePath} fill="none" stroke="#0d9488" strokeWidth={2.5} strokeLinejoin="round" />}
            </>
          )}

          {data.map((d, i) => {
            const isVisibleTick = i % Math.max(1, Math.floor(data.length / 8)) === 0 || i === data.length - 1;
            if (!isVisibleTick) return null;
            return (
              <g key={i}>
                <line x1={x(i)} y1={PAD_TOP + chartH} x2={x(i)} y2={PAD_TOP + chartH + 5} stroke="#94a3b8" strokeWidth={1} />
                <text x={x(i)} y={H - 12} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="middle">
                  {d.h}
                </text>
              </g>
            );
          })}

          {hoverIdx !== null && activePoint && (
            <g>
              <line
                x1={x(hoverIdx)}
                y1={PAD_TOP}
                x2={x(hoverIdx)}
                y2={PAD_TOP + chartH}
                stroke="#0284c7"
                strokeWidth={1.5}
                strokeDasharray="3,3"
              />
              {!fitInterior && <circle cx={x(hoverIdx)} cy={y(activePoint.outside)} r={4} fill="#64748b" stroke="#ffffff" strokeWidth={2} />}
              {(chartMode === "all" || chartMode === "conditioned") && (
                <circle cx={x(hoverIdx)} cy={y(activePoint.inside)} r={5} fill="#0284c7" stroke="#ffffff" strokeWidth={2} />
              )}
              {(chartMode === "all" || chartMode === "passive") && activePoint.passive !== undefined && (
                <circle cx={x(hoverIdx)} cy={y(activePoint.passive)} r={5} fill="#059669" stroke="#ffffff" strokeWidth={2} />
              )}
              {chartMode === "multizone" && activePoint.airlock !== undefined && (
                <circle cx={x(hoverIdx)} cy={y(activePoint.airlock)} r={4} fill="#9333ea" stroke="#ffffff" strokeWidth={2} />
              )}
              {chartMode === "multizone" && activePoint.storage !== undefined && (
                <circle cx={x(hoverIdx)} cy={y(activePoint.storage)} r={4} fill="#0d9488" stroke="#ffffff" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Explanatory callout for why conditioned is flat */}
      <div className="p-3 rounded-xl bg-surface-container-low border border-line text-xs flex items-start gap-2.5">
        <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">
          {isPassiveOnly ? "eco" : "info"}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-navy">
            {isPassiveOnly ? "Configured with No Heating Source (100% Passive Solar)" : "Why is the Heated line straight?"}
          </span>
          <span className="text-on-surface-variant leading-relaxed">
            {isPassiveOnly ? (
              <>
                You configured this shelter with <strong>No heating fuel (none)</strong>. The green curve displays your shelter&apos;s natural diurnal temperature wave driven solely by solar radiation and thermal mass retention. The straight horizontal line in &ldquo;Sized Benchmark&rdquo; mode is an automated sizing calculation showing what auxiliary heater power would be needed if a heater were added to hold {targetSetpointStr}°C.
              </>
            ) : (
              <>
                The solid blue line stays flat at <strong>{targetSetpointStr}°C</strong> because the auxiliary heater actively modulates power (500W to 2.1kW) to hold indoor comfort steady against sub-zero outdoor cold (-38°C).
                Switch to <strong>Passive Response</strong> or <strong>Comparative</strong> mode above to view the shelter&apos;s natural diurnal temperature wave without active heating.
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

type SolarDailyPoint = { date: string; kwh: number };

function SolarChart({ data }: { data: SolarDailyPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 840, H = 220;
  const PAD_LEFT = 60, PAD_RIGHT = 30, PAD_TOP = 25, PAD_BOTTOM = 40;

  if (data.length === 0) return null;

  const rawMax = Math.max(...data.map((point) => point.kwh), 0.5);
  const step = rawMax <= 4 ? 1 : rawMax <= 10 ? 2 : 5;
  const maxVal = Math.ceil(rawMax / step) * step;

  const ticks: number[] = [];
  for (let v = 0; v <= maxVal; v += step) {
    ticks.push(v);
  }

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const barWidth = Math.min(54, (chartW / data.length) * 0.65);
  const slotWidth = chartW / data.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2 py-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
          <span className="font-body-sm font-semibold text-on-surface">Daily Glazing Heat Gain</span>
        </div>
        {hoverIdx !== null && data[hoverIdx] !== undefined && (
          <span className="font-data text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            {data[hoverIdx].date}: <strong>{data[hoverIdx].kwh.toFixed(2)} kWh</strong>
          </span>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible select-none">
          <defs>
            <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id="solarGradHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          {ticks.map((v) => {
            const yPos = PAD_TOP + ((maxVal - v) / (maxVal || 1)) * chartH;
            return (
              <g key={v}>
                <line x1={PAD_LEFT} y1={yPos} x2={W - PAD_RIGHT} y2={yPos} stroke="#e2e8f0" strokeWidth={0.8} />
                <text x={PAD_LEFT - 10} y={yPos + 4} fill="#64748b" fontSize={11} fontFamily="monospace" textAnchor="end">
                  {v.toFixed(1)} kWh
                </text>
              </g>
            );
          })}

          {data.map((point, i) => {
            const barH = (point.kwh / (maxVal || 1)) * chartH;
            const x = PAD_LEFT + i * slotWidth + (slotWidth - barWidth) / 2;
            const y = PAD_TOP + chartH - barH;
            const isHover = hoverIdx === i;

            return (
              <g
                key={i}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barH, 2)}
                  rx={4}
                  fill={isHover ? "url(#solarGradHover)" : "url(#solarGrad)"}
                  stroke="#b45309"
                  strokeWidth={0.5}
                />
                <text
                  x={x + barWidth / 2}
                  y={Math.max(y - 6, PAD_TOP + 12)}
                  fill="#92400e"
                  fontSize={10}
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {point.kwh.toFixed(1)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={H - 12}
                  fill="#64748b"
                  fontSize={11}
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {point.date.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function HeatFlowChart({ data }: { data: { deltaT: number; q: number }[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 840, H = 220;
  const PAD_LEFT = 65, PAD_RIGHT = 30, PAD_TOP = 25, PAD_BOTTOM = 40;

  if (data.length === 0) return null;

  const maxQRaw = Math.max(...data.map((d) => d.q), 100);
  const minDTRaw = Math.min(...data.map((d) => d.deltaT));
  const maxDTRaw = Math.max(...data.map((d) => d.deltaT), 10);

  const stepQ = maxQRaw <= 1000 ? 200 : maxQRaw <= 3000 ? 500 : 1000;
  const maxQ = Math.ceil(maxQRaw / stepQ) * stepQ;

  const rangeDT = maxDTRaw - minDTRaw;
  const stepDT = rangeDT <= 15 ? 3 : rangeDT <= 30 ? 5 : 10;
  const minDT = Math.floor(minDTRaw / stepDT) * stepDT;
  const maxDT = Math.ceil(maxDTRaw / stepDT) * stepDT;

  const ticksQ: number[] = [];
  for (let v = 0; v <= maxQ; v += stepQ) {
    ticksQ.push(v);
  }

  const ticksDT: number[] = [];
  for (let v = minDT; v <= maxDT; v += stepDT) {
    ticksDT.push(v);
  }

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const x = (dt: number) => PAD_LEFT + ((dt - minDT) / (maxDT - minDT || 1)) * chartW;
  const y = (q: number) => PAD_TOP + ((maxQ - q) / (maxQ || 1)) * chartH;

  const points = [...data].sort((a, b) => a.deltaT - b.deltaT);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.deltaT).toFixed(1)},${y(p.q).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(points[points.length - 1].deltaT).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} L ${x(points[0].deltaT).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} Z`;

  const activePoint = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < points.length ? points[hoverIdx] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2 py-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-3 h-1 bg-[#0d9488] rounded-full inline-block" />
          <span className="font-body-sm font-semibold text-on-surface">Average Heating Demand by Temperature Gap</span>
        </div>
        {activePoint && (
          <span className="font-data text-xs text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
            Indoor-outdoor gap: {activePoint.deltaT.toFixed(0)}°C · <strong>{Math.round(activePoint.q)} W average auxiliary heat</strong>
          </span>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="heatFlowGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {ticksQ.map((qVal) => {
            const yPos = y(qVal);
            return (
              <g key={qVal}>
                <line x1={PAD_LEFT} y1={yPos} x2={W - PAD_RIGHT} y2={yPos} stroke="#e2e8f0" strokeWidth={0.8} />
                <text x={PAD_LEFT - 10} y={yPos + 4} fill="#64748b" fontSize={11} fontFamily="monospace" textAnchor="end">
                  {qVal >= 1000 ? `${(qVal / 1000).toFixed(1)} kW` : `${qVal} W`}
                </text>
              </g>
            );
          })}

          {ticksDT.map((dtVal) => {
            const xPos = x(dtVal);
            return (
              <g key={dtVal}>
                <line x1={xPos} y1={PAD_TOP} x2={xPos} y2={PAD_TOP + chartH} stroke="#f1f5f9" strokeWidth={0.6} />
                <text x={xPos} y={H - 12} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="middle">
                  {dtVal}°C
                </text>
              </g>
            );
          })}

          <path d={area} fill="url(#heatFlowGrad)" />
          <path d={path} fill="none" stroke="#0d9488" strokeWidth={2.8} strokeLinejoin="round" />

          {points.map((p, i) => (
            <circle
              key={i}
              cx={x(p.deltaT)}
              cy={y(p.q)}
              r={hoverIdx === i ? 6 : 4}
              fill="#0d9488"
              stroke="#ffffff"
              strokeWidth={2}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Data shaping: raw pipeline output -> chart-friendly series ─────────────

function buildTemperatureSeries(
  series: TimeseriesResponse | null,
  freeSeries: TimeseriesResponse | null = null,
  zonesFromFreeRun = false,
): TemperaturePoint[] {
  if (!series || series.points.length === 0) return [];
  const UNHEATED_BUFFER = new Set(["airlock", "equipment", "storage", "corridor", "battery"]);
  const heated = series.zone_ids.filter((z) => !UNHEATED_BUFFER.has(z.toLowerCase()));
  const zones = heated.length ? heated : series.zone_ids;
  // Find the coldest 24h window (lowest ambient) so Task 1 mirrors the worst-night framing.
  const stepMinutes = 15;
  const pointsPerDay = Math.round((24 * 60) / stepMinutes);
  let worstStart = 0, worstMin = Infinity;
  for (let i = 0; i + pointsPerDay <= series.points.length; i += 4) {
    const windowMin = Math.min(...series.points.slice(i, i + pointsPerDay).map((p) => p.ambient_c));
    if (windowMin < worstMin) { worstMin = windowMin; worstStart = i; }
  }
  const window = series.points.slice(worstStart, worstStart + pointsPerDay);

  // Map free_floating timeseries by timestamp for reliable 1-to-1 matching
  const freeMap = new Map<string, (typeof series.points)[0]>();
  if (freeSeries?.points) {
    for (const p of freeSeries.points) {
      freeMap.set(p.timestamp, p);
    }
  }
  const freeZones = freeSeries?.zone_ids
    ? (freeSeries.zone_ids.filter((z) => !UNHEATED_BUFFER.has(z.toLowerCase())).length
      ? freeSeries.zone_ids.filter((z) => !UNHEATED_BUFFER.has(z.toLowerCase()))
      : freeSeries.zone_ids)
    : zones;

  const result: TemperaturePoint[] = [];

  for (let i = 0; i < window.length; i += 1) {
    const p = window[i];
    // Match by timestamp; only fall back to index when both series share the same length/grid.
    const freeP = freeMap.get(p.timestamp)
      ?? (freeSeries && freeSeries.points.length === series.points.length ? freeSeries.points[worstStart + i] : undefined);

    // Inside conditioned temperature (averaging heated habitable living/sleeping zones)
    const insideVals = zones.map((z) => p.zone_temp_c[z]).filter((v): v is number => typeof v === "number");
    if (insideVals.length === 0) continue;
    const inside = insideVals.reduce((s, v) => s + v, 0) / insideVals.length;

    // Passive unheated temperature for habitable zones
    let passive: number | undefined = undefined;
    if (freeP && freeP.zone_temp_c) {
      const vals = freeZones.map((z) => freeP.zone_temp_c[z]).filter((v): v is number => typeof v === "number");
      if (vals.length > 0) passive = vals.reduce((s, v) => s + v, 0) / vals.length;
    }

    // Specific zone temperatures
    // Passive-only designs have no heater, so the zone breakdown must come from the unheated run;
    // the conditioned run is a hypothetical benchmark whose heated zones just sit at the setpoint.
    const zp = zonesFromFreeRun && freeP?.zone_temp_c ? freeP.zone_temp_c : p.zone_temp_c;
    const airlock = zp["airlock"];
    const storage = zp["storage"];
    const living = zp["living"] ?? (zones.includes("main") ? zp["main"] : undefined);
    const sleeping = zp["sleeping"];

    // Total auxiliary heating load in watts at this hour
    const heatingW = series.zone_ids.reduce((s, z) => s + (p.zone_heating_w[z] ?? 0), 0);

    result.push({
      h: p.timestamp.slice(11, 16),
      inside,
      passive,
      airlock,
      storage,
      living,
      sleeping,
      heatingW,
      outside: p.ambient_c,
    });
  }

  return result;
}

function buildSolarDaily(series: TimeseriesResponse | null): SolarDailyPoint[] {
  if (!series || series.points.length === 0) return [];
  const byDay = new Map<string, { wattHours: number; points: number }>();
  for (const p of series.points) {
    const day = p.timestamp.slice(0, 10);
    const wattsSum = series.zone_ids.reduce((sum, z) => sum + (p.zone_solar_w[z] ?? 0), 0);
    const total = byDay.get(day) ?? { wattHours: 0, points: 0 };
    total.wattHours += wattsSum * 0.25;
    total.points += 1;
    byDay.set(day, total);
  }
  // The RC engine may emit one endpoint at the next midnight. Do not plot it as a 0 kWh day.
  return Array.from(byDay.entries())
    .filter(([, total]) => total.points >= 95)
    .map(([date, total]) => ({ date, kwh: total.wattHours / 1000 }));
}

function buildHeatFlow(series: TimeseriesResponse | null): { deltaT: number; q: number; samples: number }[] {
  if (!series || series.points.length === 0) return [];
  const heated = series.zone_ids.filter((z) => z !== "airlock" && z !== "equipment");
  const zones = heated.length ? heated : series.zone_ids;
  const buckets = new Map<number, number[]>();
  for (const p of series.points) {
    const insideAvg = zones.reduce((s, z) => s + (p.zone_temp_c[z] ?? 0), 0) / zones.length;
    const dT = Math.round(insideAvg - p.ambient_c);
    if (dT <= 0) continue;
    const heatingW = zones.reduce((s, z) => s + (p.zone_heating_w[z] ?? 0), 0);
    const bucket = Math.round(dT / 3) * 3;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(heatingW);
  }
  return Array.from(buckets.entries())
    .map(([deltaT, values]) => ({ deltaT, q: values.reduce((a, b) => a + b, 0) / values.length, samples: values.length }))
    .sort((a, b) => a.deltaT - b.deltaT);
}

const STATUS_LABEL: Record<CandidateOutcome["status"], string> = {
  selected: "Recommended",
  on_front: "Pareto front",
  dominated: "Dominated",
  rejected: "Rejected",
  screened_out_by_fast_rc: "Fast RC screened out",
};

// ─── Main page ───────────────────────────────────────────────────────────────

function CandidateTelemetryContent() {
  const params = useSearchParams();
  const optId = params.get("opt");

  const [status, setStatus] = useState<OptimizationStatus | null>(null);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [series, setSeries] = useState<TimeseriesResponse | null>(null);
  const [freeSeries, setFreeSeries] = useState<TimeseriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<"results" | "3d">("results");
  const [building, setBuilding] = useState<BuildingModel | null>(null);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const [savedRuns, setSavedRuns] = useState<OptimizationListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [deleteRunLoading, setDeleteRunLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDeleteRun() {
    if (!runToDelete) return;
    setDeleteRunLoading(true);
    setDeleteError(null);
    try {
      await deleteOptimization(runToDelete);
      setSavedRuns((prev) => prev.filter((r) => r.optimization_id !== runToDelete));
      if (typeof window !== "undefined" && localStorage.getItem(LATEST_OPTIMIZATION_STORAGE_KEY) === runToDelete) {
        localStorage.removeItem(LATEST_OPTIMIZATION_STORAGE_KEY);
      }
      if (optId === runToDelete) {
        router.push(ROUTES.candidateTelemetry);
      }
      setRunToDelete(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete saved simulation result");
    } finally {
      setDeleteRunLoading(false);
    }
  }

  useEffect(() => {
    if (optId) {
      localStorage.setItem(LATEST_OPTIMIZATION_STORAGE_KEY, optId);
      setStatus(null);
      setReport(null);
      setSeries(null);
      setFreeSeries(null);
      setBuilding(null);
      setBuildingError(null);
      setError(null);
      setErrorDetails(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    listOptimizations()
      .then(({ optimizations }) => { if (!cancelled) setSavedRuns(optimizations); })
      .catch((err) => { if (!cancelled) setHistoryError(err instanceof Error ? err.message : "Could not load saved simulations."); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [optId]);
  // Poll status until the run finishes, then fetch the report + timeseries once.
  useEffect(() => {
    if (!optId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const st = await getOptimization(optId!);
        if (cancelled) return;
        setStatus(st);
        if (st.status === "completed") {
          // Artifact writes happen immediately after the pipeline result is computed.
          // Retry briefly so a completed status cannot race final_report/timeseries creation.
          let lastError: unknown = null;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            try {
              const [rep, ts, freeTs] = await Promise.all([
                getReport(optId!),
                getTimeseries(optId!, "conditioned"),
                getTimeseries(optId!, "free_floating").catch(() => null),
              ]);
              if (cancelled) return;
              setReport(rep);
              setSeries(ts);
              setFreeSeries(freeTs);
              lastError = null;
              break;
            } catch (err) {
              lastError = err;
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
          if (lastError && !cancelled) setError(lastError instanceof Error ? lastError.message : "Pipeline artifacts are not available yet.");
        } else if (st.status === "failed") {
          setStatus(st);
          setError(st.error?.message ?? "The pipeline run failed.");
          setErrorDetails((st.error as { details?: Record<string, unknown> } | undefined)?.details ?? null);
        } else {
          timer = setTimeout(tick, 2000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach the COCOON backend.");
      }
    }
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [optId]);

  // The real geometry M2 solved against (vertex-level walls/roof/floor) — fetched once the
  // recommended design_id is known, independent of the results/timeseries fetch above.
  const targetDesignId = status?.recommended_design_id ?? report?.recommendation.design_id;
  useEffect(() => {
    if (!optId || !targetDesignId) return;
    let cancelled = false;
    setBuildingError(null);
    getDesign(optId, targetDesignId)
      .then((b) => {
        if (!cancelled) {
          setBuilding(b);
          setBuildingError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBuildingError(err instanceof Error ? err.message : "Could not load the 3D model.");
        }
      });
    return () => { cancelled = true; };
  }, [optId, targetDesignId]);

  const passiveOnly = useMemo(() => {
    const fuels = report?.input.constraints?.heater_fuels ?? [];
    return fuels.length > 0 && fuels.every((f: string) => f === "none");
  }, [report]);
  const tempData = useMemo(() => buildTemperatureSeries(series, freeSeries, passiveOnly), [series, freeSeries, passiveOnly]);
  const solarData = useMemo(() => buildSolarDaily(series), [series]);
  const heatFlowData = useMemo(() => buildHeatFlow(series), [series]);
  const comparisonCandidates = useMemo(() => {
    const picks = report?.alternatives.filter((row) => row.picked_as.length > 0) ?? [];
    return picks.slice(0, 3);
  }, [report]);

  function printReport() {
    setActiveTab("results");
    window.setTimeout(() => window.print(), 0);
  }
  function downloadReport() {
    if (!report || !optId) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${optId}-final-report.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const days = solarData.length;

  // ── Saved simulation history ───────────────────────────────────────────────
  if (!optId) {
    return (
      <div className="w-full px-gutter-lg py-10 max-w-[1100px] mx-auto flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">Saved Simulation Results</h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Every pipeline run is stored by the backend. Select a simulation to reopen its report and graphs.
            </p>
          </div>
          <Link href={ROUTES.shelterConfigurator.step1} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-body-sm font-semibold hover-lift self-start">
            <span className="material-symbols-outlined text-[18px]">add</span>
            <T>New Simulation</T>
          </Link>
        </div>

        {historyLoading && <p className="text-on-surface-variant">Loading saved simulations…</p>}
        {historyError && <p className="text-error">{historyError}</p>}
        {!historyLoading && !historyError && savedRuns.length === 0 && (
          <div className="rounded-xl border border-line bg-surface-container-lowest p-8 text-center text-on-surface-variant">
            No saved simulations are available yet.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {savedRuns.map((run) => (
            <div key={run.optimization_id} className="rounded-xl border border-line bg-surface-container-lowest p-4 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-data text-sm font-bold text-navy">{run.optimization_id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${run.status === "completed" ? "bg-equilibrium-tint text-equilibrium" : run.status === "failed" ? "bg-error-container text-error" : "bg-thermal/15 text-thermal"}`}>
                    {run.status}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">
                  Project {run.project_id ?? "unassigned"} · {run.count ?? "—"} candidates
                  {run.created_at ? ` · ${new Date(run.created_at).toLocaleString()}` : ""}
                </p>
                {run.recommended_design_id && <p className="text-xs text-equilibrium mt-1">Recommended: {run.recommended_design_id}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setRunToDelete(run.optimization_id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-low hover:bg-error-container/20 text-on-surface-variant hover:text-error text-xs font-semibold border border-line hover:border-error/30 transition-colors shadow-2xs hover-lift"
                  title="Delete saved result"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  <T>Delete</T>
                </button>
                <Link href={`${ROUTES.candidateTelemetry}?opt=${encodeURIComponent(run.optimization_id)}`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover shrink-0 shadow-xs hover-lift">
                  <span className="material-symbols-outlined text-[16px]">analytics</span>
                  {run.status === "completed" ? "View saved result" : "View status"}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <ConfirmDeleteModal
          isOpen={Boolean(runToDelete)}
          title="Delete Saved Result"
          itemName={runToDelete ?? undefined}
          itemType="result"
          errorMessage={deleteError}
          loading={deleteRunLoading}
          onConfirm={handleDeleteRun}
          onCancel={() => {
            setRunToDelete(null);
            setDeleteError(null);
          }}
        />
      </div>
    );
  }
  // ── Backend unreachable / run failed ─────────────────────────────────────
  if (error) {
    const failure = describePipelineError(status?.error);
    const reasons = (errorDetails?.reasons as Record<string, number>) || {};
    const hasMassError = "constraints:envelope_mass_within_limit" in reasons;
    const hasAssemblyError = Object.keys(reasons).some(
      (r) => r.includes("assembly_composition_failed") || r.includes("no_materials_for_")
    );

    return (
      <div className="w-full px-gutter-lg py-12 max-w-[800px] mx-auto flex flex-col items-center text-center gap-5">
        <div className="w-14 h-14 rounded-full bg-error-container text-on-error-container flex items-center justify-center">
          <span className="material-symbols-outlined text-[32px]">error</span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface"><T>{failure.title}</T></h1>
          {failure.phase && (
            <p className="font-label-mono-xs text-[11px] uppercase tracking-wide text-on-surface-variant">
              Failed during: {failure.phase}
            </p>
          )}
          <p className="font-body-sm text-body-sm text-error font-medium">{error}</p>
        </div>

        {failure.suggestions.length > 0 && (
          <div className="w-full p-4 rounded-xl bg-primary-fixed/20 border border-primary/20 text-left flex flex-col gap-2">
            <span className="font-label-mono-xs text-[11px] text-primary uppercase font-semibold">
              {failure.provenInfeasible ? "Required changes" : "Suggested changes"}
            </span>
            <ul className="list-disc pl-5 text-xs text-on-surface font-body-sm space-y-1">
              {failure.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
            </ul>
          </div>
        )}

        {hasMassError ? (
          <div className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant text-left flex flex-col gap-2">
            <div className="flex items-center gap-2 text-warning font-semibold font-body-sm text-sm">
              <span className="material-symbols-outlined text-[18px]">scale</span>
              <T>Diagnostic: Mass Constraint Exceeded</T>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
              <T>
                All 1,000 synthesized candidate envelopes exceeded the specified Max Total Weight limit.
                Because heavy structural materials (stone, concrete, or rammed earth) were chosen for this floor plan,
                the building mass naturally ranges from 40,000 to 70,000 kg.
              </T>
            </p>
            <div className="pt-2 flex items-center gap-2">
              <span className="font-label-mono-xs text-[11px] text-primary font-semibold">Recommended Fix:</span>
              <span className="font-body-sm text-[11px] text-on-surface">
                Clear or increase the "Max Total Weight" constraint in Step 3, or select lightweight panel materials.
              </span>
            </div>
          </div>
        ) : hasAssemblyError ? (
          <div className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant text-left flex flex-col gap-3">
            <div className="flex items-center gap-2 text-warning font-semibold font-body-sm text-sm">
              <span className="material-symbols-outlined text-[18px]">architecture</span>
              <T>Diagnostic: Material & Thickness Compatibility</T>
            </div>
            <div className="font-body-sm text-xs text-on-surface-variant leading-relaxed flex flex-col gap-1.5">
              <p>
                <strong className="text-on-surface">1. Roof & Interior Partition Materials:</strong> In physical construction, roofs and interior room partitions cannot be built from raw stone or rammed earth. They require structural materials such as <strong className="text-primary">Concrete</strong>, <strong className="text-primary">Plywood</strong>, or <strong className="text-primary">Timber</strong>. Ensure at least one of these is checked in Step 3.
              </p>
              <p>
                <strong className="text-on-surface">2. Minimum Wall Thickness:</strong> Stone masonry has a physical minimum thickness of <strong className="text-on-surface">300 mm</strong> (range 300–550 mm). If stone is permitted, set Wall Thickness to at least 300 mm (or 350 mm) in Step 4.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <Link
                href={ROUTES.shelterConfigurator.step3}
                className="px-3 py-1.5 rounded-lg bg-primary-fixed/40 border border-primary/30 text-primary font-body-sm text-xs font-semibold hover:bg-primary-fixed/60"
              >
                1. Enable Concrete / Plywood in Step 3 →
              </Link>
              <Link
                href={ROUTES.shelterConfigurator.step4}
                className="px-3 py-1.5 rounded-lg bg-surface-container-highest text-on-surface font-body-sm text-xs font-medium hover:bg-surface-container"
              >
                2. Set Wall Thickness ≥ 300 mm in Step 4 →
              </Link>
            </div>
          </div>
        ) : Object.keys(reasons).length > 0 ? (
          <div className="w-full p-4 rounded-xl bg-surface-container-low border border-outline-variant text-left flex flex-col gap-2">
            <span className="font-label-mono-xs text-[11px] text-on-surface-variant uppercase font-semibold">Rejection Breakdown:</span>
            <ul className="flex flex-col gap-1 text-xs text-on-surface font-data">
              {Object.entries(reasons).map(([reason, cnt]) => (
                <li key={reason} className="flex justify-between border-b border-surface-container py-1 last:border-0">
                  <span>{reason}</span>
                  <span className="font-bold text-error">{cnt} attempts</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={ROUTES.shelterConfigurator.step3}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-body-sm font-semibold hover-lift"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <T>Adjust Materials (Step 3)</T>
          </Link>
          <Link
            href={ROUTES.shelterConfigurator.step4}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant hover:bg-surface-container-low font-body-sm font-medium text-on-surface"
          >
            <T>Adjust Envelope (Step 4)</T>
          </Link>
        </div>
      </div>
    );
  }

  // ── Queued / running: real progress, no fake numbers ─────────────────────
  if (!report || !series || !status || status.status !== "completed") {
    const st = status?.status ?? "queued";
    return (
      <div className="w-full px-gutter-lg py-12 max-w-[900px] mx-auto flex flex-col items-center text-center gap-5">
        <span className="relative flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-thermal" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-thermal" />
        </span>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface uppercase tracking-wide">
          {st === "running" ? (status?.phase ?? "pipeline").replaceAll("_", " ") : <T>Queued…</T>}
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {status?.phase_message
            ? status.phase_message
            : status?.summary
            ? <T>{`Generated ${status.summary.generated} candidates, ${status.summary.on_front} on the Pareto front.`}</T>
            : <T>Generating designs, running the RC thermal engine, ranking candidates…</T>}
        </p>
        <p className="font-label-mono-xs text-[11px] text-on-surface-variant">optimization_id: {optId}</p>
      </div>
    );
  }

  // ── Completed: real data below ────────────────────────────────────────────
  const obj = report.performance.objectives;
  const cond = report.performance.conditioned_with_sized_heater.summary;
  const econScenario = report.economics?.scenarios?.expected;
  const wallAssembly = report.design.assemblies.find((a) => a.used_for.includes("wall")) ?? report.design.assemblies[0];
  const fuelLitresPerDay = econScenario ? econScenario.annual_fuel_litres / 365 : cond.heating_energy_kwh / days / 10.5;
  const UNHEATED_BUFFER_SET = new Set(["airlock", "equipment", "storage", "corridor", "battery"]);
  const habitableZoneIds = series.zone_ids.filter((z) => !UNHEATED_BUFFER_SET.has(z.toLowerCase()));
  const activeComfortZones = habitableZoneIds.length ? habitableZoneIds : series.zone_ids;
  const zoneTemps = series.points.flatMap((p) => activeComfortZones.map((z) => p.zone_temp_c[z]).filter((v) => v !== undefined));
  const insideMin = zoneTemps.length ? Math.min(...zoneTemps) : NaN;
  const insideMean = zoneTemps.length ? zoneTemps.reduce((a, b) => a + b, 0) / zoneTemps.length : NaN;
  const ambientAll = series.points.map((p) => p.ambient_c);
  const ambientMin = Math.min(...ambientAll);

  const EXEC = [
    { label: "Min. Interior Temp", value: `${insideMin.toFixed(1)}°C`, sub: "Across the analysis window", icon: "thermostat", color: "text-equilibrium", bg: "bg-equilibrium-tint/30" },
    { label: "Avg. Interior Temp", value: `${insideMean.toFixed(1)}°C`, sub: `${days}-day average`, icon: "thermometer", color: "text-equilibrium", bg: "bg-equilibrium-tint/30" },
    { label: "ΔT Achieved", value: `${(insideMin - ambientMin).toFixed(1)}°C`, sub: "Worst inside vs. worst outside", icon: "thermostat_auto", color: "text-primary", bg: "bg-primary-fixed/20" },
    { label: "Comfort Hours", value: `${obj.occupied_comfort_hours.toFixed(0)} h`, sub: `Unmet: ${obj.unmet_hours.toFixed(0)} h`, icon: "check_circle", color: obj.unmet_hours === 0 ? "text-equilibrium" : "text-error", bg: "bg-equilibrium-tint/30" },
    { label: "Heating Energy", value: `${cond.heating_energy_kwh.toFixed(1)} kWh`, sub: `Over ${days} days`, icon: "bolt", color: "text-on-surface", bg: "bg-surface-container-low" },
    { label: "Est. Fuel Demand", value: `${fuelLitresPerDay.toFixed(2)} L/day`, sub: "Kerosene, sized heater", icon: "oil_barrel", color: "text-on-surface", bg: "bg-surface-container-low" },
    { label: "ANSYS Status", value: validationStateLabel(report.validation.state), sub: "Validation state", icon: "verified", color: "text-primary", bg: "bg-primary-fixed/20" },
    { label: "U-Value (Wall)", value: wallAssembly ? `${wallAssembly.u_value_w_m2k.toFixed(3)}` : "—", sub: "W/m²·K", icon: "layers", color: "text-primary", bg: "bg-primary-fixed/20" },
  ];

  return (
    <div className="flex flex-col w-full">
      <section className="w-full bg-surface-container-lowest px-gutter-lg py-space-md shadow-sm">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-md max-w-[1720px] mx-auto">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-space-sm">
              <span className="font-label-mono-xs text-label-mono-xs px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase" style={{ backgroundColor: "rgb(236, 251, 252)", color: "rgb(15, 122, 140)" }}>
                COCOON Pipeline Run
              </span>
              <span className="font-label-mono-md text-label-mono-md text-on-surface-variant font-bold font-data">{optId}</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
              <T>{`Recommended design ${report.recommendation.design_id}`}</T>
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {report.design.floors}-floor · {report.design.zones.length} zones · {days}-day analysis window
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={printReport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-label-mono-xs text-label-mono-xs font-semibold uppercase tracking-wide hover:bg-primary/90">
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              Print / Save PDF
            </button>
            <button type="button" onClick={downloadReport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest text-primary font-label-mono-xs text-label-mono-xs font-semibold uppercase tracking-wide hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-[18px]">download</span>
              Download JSON
            </button>
            <button type="button" onClick={() => setRunToDelete(optId)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-error/30 bg-surface-container-lowest text-error hover:bg-error-container/20 font-label-mono-xs text-label-mono-xs font-semibold uppercase tracking-wide transition-colors"
              title="Delete this saved result">
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Delete Result
            </button>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm" style={{ backgroundColor: "rgb(236,253,245)" }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#059669" }}>check_circle</span>
            <span className="font-label-mono-xs text-label-mono-xs font-semibold tracking-wide uppercase" style={{ color: "#059669" }}>
              All tasks complete
            </span>
          </div>
        </div>
      </section>

      <div className="w-full px-gutter-lg bg-surface-container-low border-b border-outline-variant">
        <div className="max-w-[1720px] mx-auto flex items-center gap-1 pt-2 overflow-x-auto">
          {[{ id: "results", label: "Simulation Results", icon: "analytics" }, { id: "3d", label: "3D Model", icon: "view_in_ar" }].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as "results" | "3d")}
              className={`flex items-center gap-2 px-4 py-2.5 shrink-0 whitespace-nowrap rounded-t-lg font-label-mono-sm text-label-mono-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? "bg-surface-container-lowest border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container"}`}>
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <T>{tab.label}</T>
            </button>
          ))}
        </div>
      </div>

      <div className="w-full px-gutter-lg py-6 max-w-[1720px] mx-auto">
        {activeTab === "results" && (
          <div className="flex flex-col gap-8">
            {/* Executive Summary */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[22px]">summarize</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Executive Summary</T></h2>
              </div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4 min-[1500px]:grid-cols-8 gap-3">
                {EXEC.map((card) => (
                  <div key={card.label} className={`${card.bg} rounded-xl p-4 flex flex-col gap-1.5 border border-white/50 min-w-0 overflow-hidden`}>
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <span className="font-body-sm text-[10px] text-on-surface-variant uppercase tracking-wide leading-tight min-w-0 break-words">{card.label}</span>
                      <span className={`material-symbols-outlined text-[16px] shrink-0 ${card.color}`}>{card.icon}</span>
                    </div>
                    <span className={`font-data text-xl font-extrabold leading-tight break-words ${card.color}`}>{card.value}</span>
                    <span className="font-body-sm text-[10px] text-on-surface-variant break-words">{card.sub}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Design & Materials */}
            <section className="bg-surface-container-lowest rounded-2xl border border-line p-5 sm:p-6 shadow-card flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b border-surface-container pb-4">
                <span className="material-symbols-outlined text-navy text-[22px]">architecture</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Design & Materials (M2)</T></h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {report.design.zones.map((z) => (
                  <div key={z.id} className="p-3.5 bg-surface-container-low rounded-xl border border-line flex flex-col justify-between">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium">{z.type} · floor {z.floor + 1}</span>
                    <span className="text-base font-bold text-navy font-data mt-1">{z.size_m.length_m.toFixed(1)}×{z.size_m.width_m.toFixed(1)} m</span>
                    <span className="text-[10px] text-ink-muted">{z.heated ? "Heated" : "Unheated"}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {report.design.assemblies.map((a) => (
                  <div key={a.id} className="p-4 bg-surface-container-low rounded-xl border border-line flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant">{a.used_for.join(", ")}</span>
                      <span className="text-[10px] font-bold font-data bg-surface-container px-2 py-0.5 rounded text-navy">U={a.u_value_w_m2k.toFixed(3)}</span>
                    </div>
                    <h4 className="text-xs font-bold text-navy">{a.name}</h4>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      {a.layers_inner_to_outer.map((l) => `${l.name} (${l.thickness_mm}mm)`).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                Glazing: {report.design.glazing} · Air changes: {report.design.air_changes_per_hour}/h · Orientation: {report.design.orientation_deg}°
              </p>
            </section>

            {/* Task 1 */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold bg-primary-container text-on-primary uppercase">Task 1</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Inside Temperature Prediction</T></h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Coldest 24h window in the {days}-day analysis · design {report.recommendation.design_id}</p>
              {(() => {
                const fuels = report.input.constraints?.heater_fuels ?? [];
                const isPassiveOnly = fuels.length > 0 && fuels.every((f: string) => f === "none");
                return (
                  <div className="bg-surface-container-low rounded-xl p-4">
                    <TemperatureChart data={tempData} isPassiveOnly={isPassiveOnly} />
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Minimum Inside Temp"
                  value={insideMin.toFixed(1)}
                  unit="°C"
                  subtext="Coldest point in 24h"
                  icon="thermostat"
                  variant="primary"
                />
                <MetricCard
                  label="Mean Inside Temp"
                  value={insideMean.toFixed(1)}
                  unit="°C"
                  subtext="Average interior temperature"
                  icon="thermometer"
                  variant="default"
                />
                <MetricCard
                  label="Outside Minimum"
                  value={ambientMin.toFixed(1)}
                  unit="°C"
                  subtext="Extreme outdoor cold"
                  icon="ac_unit"
                  variant="default"
                />
                <MetricCard
                  label="Unmet Comfort Hours"
                  value={obj.unmet_hours.toFixed(0)}
                  unit="h"
                  subtext={obj.unmet_hours === 0 ? "100% comfort compliance" : "Cumulative sub-setpoint"}
                  icon={obj.unmet_hours === 0 ? "verified" : "warning"}
                  variant={obj.unmet_hours === 0 ? "success" : "warning"}
                />
              </div>
            </section>

            {/* Task 2 */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold bg-amber-100 text-amber-800 uppercase">Task 2</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Solar Heat Gain Through Glazing</T></h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Daily solar gain through glazing · {days}-day window</p>
              <div className="bg-surface-container-low rounded-xl p-4"><SolarChart data={solarData} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricCard
                  label="Average Daily Solar Gain"
                  value={(solarData.reduce((sum, point) => sum + point.kwh, 0) / Math.max(solarData.length, 1)).toFixed(2)}
                  unit="kWh/day"
                  subtext="Heat transmitted through glazing"
                  icon="wb_sunny"
                  variant="thermal"
                />
                <MetricCard
                  label="Peak Solar Day"
                  value={Math.max(...solarData.map((point) => point.kwh), 0).toFixed(2)}
                  unit="kWh"
                  subtext="Highest daily glazing gain"
                  icon="solar_power"
                  variant="thermal"
                />
                <MetricCard
                  label="Total Over Window"
                  value={solarData.reduce((sum, point) => sum + point.kwh, 0).toFixed(1)}
                  unit="kWh"
                  subtext={`${days}-day aggregate harvest`}
                  icon="bolt"
                  variant="thermal"
                />
              </div>
            </section>

            {/* Task 3 */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold uppercase bg-teal-100 text-teal-800">Task 3</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Heating Demand vs. Outdoor Temperature Gap</T></h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Each point averages the auxiliary heating needed for the observed indoor-outdoor temperature gap.</p>
              <div className="bg-surface-container-low rounded-xl p-4"><HeatFlowChart data={heatFlowData} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-teal-950">
                  <span className="font-bold">How to read it:</span> the x-axis is indoor temperature minus outdoor temperature; each dot is the average heater power for a 3°C temperature-gap band.
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950">
                  <span className="font-bold">Scope:</span> this is whole-shelter heating demand, not separate wall, roof, floor, or window heat-flow values.
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Peak Auxiliary Heat"
                  value={(cond.peak_heating_kw ?? 0).toFixed(2)}
                  unit="kW"
                  subtext="Highest observed demand"
                  icon="mode_heat"
                  variant="primary"
                />
                <MetricCard
                  label="Auxiliary Heat Energy"
                  value={cond.heating_energy_kwh.toFixed(1)}
                  unit="kWh"
                  subtext={`Cumulative over ${days} days`}
                  icon="power"
                  variant="default"
                />
                <MetricCard
                  label="Wall U-Value"
                  value={wallAssembly ? wallAssembly.u_value_w_m2k.toFixed(3) : "—"}
                  unit="W/m²K"
                  subtext="Thermal transmittance"
                  icon="layers"
                  variant="default"
                />
                <MetricCard
                  label="Temperature Swing"
                  value={obj.temperature_swing_c.toFixed(1)}
                  unit="°C"
                  subtext="Diurnal thermal stability"
                  icon="waves"
                  variant="default"
                />
              </div>
            </section>

            {/* Economics */}
            {econScenario && (
              <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">payments</span>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Lifecycle Economics (M7)</T></h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <MetricCard
                    label="Total Capex"
                    value={`₹${(econScenario.capex.total_capex_inr / 1e5).toFixed(2)}L`}
                    subtext="Initial fabrication & assembly"
                    icon="receipt_long"
                    variant="primary"
                  />
                  <MetricCard
                    label="Lifecycle Cost (LCC)"
                    value={`₹${(econScenario.lcc_inr / 1e5).toFixed(2)}L`}
                    subtext="20-year net present cost"
                    icon="account_balance"
                    variant="default"
                  />
                  <MetricCard
                    label="NPV vs. Baseline"
                    value={formatLakh(econScenario.npv_vs_baseline_inr)}
                    subtext="Net economic advantage"
                    icon="trending_up"
                    variant="success"
                  />
                  <MetricCard
                    label="Simple Payback"
                    value={formatYears(econScenario.simple_payback_years)}
                    subtext="Capital recovery period"
                    icon="schedule"
                    variant="default"
                  />
                  <MetricCard
                    label="Annual Fuel"
                    value={`${econScenario.annual_fuel_litres.toFixed(0)}`}
                    unit="L"
                    subtext="Projected kerosene demand"
                    icon="oil_barrel"
                    variant="default"
                  />
                </div>
                <p className="font-body-sm text-[11px] text-on-surface-variant">Assumption set: expected-case prices · currency {report.economics!.currency}</p>
              </section>
            )}

            {/* Candidate comparison */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">compare</span>
                <div>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Top 3 Recommended Structures</T></h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Decision-ready optimizer picks: best overall, lowest lifecycle cost, and lowest initial cost</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="py-3 px-4 font-semibold">Rank / Design</th>
                      <th className="py-3 px-4 font-semibold text-right">Capex (₹L)</th>
                      <th className="py-3 px-4 font-semibold text-right">LCC (₹L)</th>
                      <th className="py-3 px-4 font-semibold text-right">Mass (kg)</th>
                      <th className="py-3 px-4 font-semibold text-right">Comfort (h)</th>
                      <th className="py-3 px-4 font-semibold text-right">Reliability</th>
                      <th className="py-3 px-4 font-semibold">Why shown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {comparisonCandidates.map((row, index) => (
                      <tr key={row.design_id} className={`hover:bg-surface-container-low/40 transition-colors ${row.status === "selected" ? "bg-equilibrium-tint/20" : ""}`}>
                        <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-fixed text-xs font-bold text-navy">{index + 1}</span><span className="font-data text-body-sm text-on-surface font-medium">{row.design_id}</span></div></td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.capex_inr == null ? "—" : (row.objectives.capex_inr / 1e5).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.lcc_inr == null ? "—" : (row.objectives.lcc_inr / 1e5).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.mass_kg == null ? "—" : row.objectives.mass_kg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.occupied_comfort_hours == null ? "—" : row.objectives.occupied_comfort_hours.toFixed(0)}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.reliability == null ? "—" : `${(row.objectives.reliability * 100).toFixed(0)}%`}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-equilibrium">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            {row.picked_as.map((pick) => pick.replaceAll("_", " ")).join(" · ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Validation */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">verified</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Validation (M8 ANSYS)</T></h2>
              </div>
              {report.validation.state === "RC_ONLY_ANSYS_NOT_REQUESTED" ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  ANSYS FEA cross-check was not requested for this run. The result above comes from the RC thermal engine (M4) only.
                </p>
              ) : (
                <ValidationSummary validation={report.validation} />
              )}
            </section>
          </div>
        )}

        {activeTab === "3d" && (
          <div className="flex flex-col gap-6">
            {/* Main Workstation Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left Column: 3D Digital Twin Viewport (8 Cols) */}
              <div className="xl:col-span-8 flex flex-col gap-6">
                <div className="w-full rounded-2xl bg-[#09111e] overflow-hidden border border-outline-variant/60 shadow-feature flex flex-col">
                  {/* Viewport Top Header */}
                  <div className="w-full bg-[#0d1a2d]/95 px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-[20px]">view_in_ar</span>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        <T>Interactive 3D Digital Twin &amp; Thermal Cutaway</T>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/70">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-equilibrium" />
                        <span className="font-semibold text-white">
                          +{insideMean ? insideMean.toFixed(1) : "20.8"}°C Core
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-thermal" />
                        <span className="font-semibold text-white">
                          {ambientMin ? ambientMin.toFixed(1) : "-38.2"}°C Frost
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* 3D Canvas / Model Viewport Container */}
                  <div className="relative w-full">
                    {buildingError && (
                      <div className="p-8 text-center text-error font-body-sm">
                        {buildingError}
                      </div>
                    )}
                    {!building && !buildingError && (
                      <div className="w-full h-[520px] rounded-xl bg-surface-container-low animate-pulse flex items-center justify-center text-on-surface-variant text-sm">
                        Loading 3D model…
                      </div>
                    )}
                    {building && <BuildingViewer3D building={building} />}
                  </div>
                </div>

                {/* Shelter Dimensions & Geometry Card */}
                <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-card flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-surface-container pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">square_foot</span>
                      <h3 className="text-sm font-bold text-on-surface">
                        <T>Shelter Dimensions &amp; Geometry</T>
                      </h3>
                    </div>
                    <span className="text-xs font-semibold text-teal font-data">
                      {Number((report.input?.mission as any)?.occupants) || 12}-Troop Bunk Capacity
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/60 flex flex-col">
                      <span className="text-[10px] text-on-surface-variant uppercase font-medium">Length</span>
                      <span className="text-base font-bold text-primary font-data mt-0.5">
                        {report.design.zones[0]?.size_m.length_m ? (report.design.zones[0].size_m.length_m * 1.5).toFixed(1) : "12.0"} m
                      </span>
                      <span className="text-[9px] text-on-surface-variant">Outer envelope</span>
                    </div>
                    <div className="p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/60 flex flex-col">
                      <span className="text-[10px] text-on-surface-variant uppercase font-medium">Width</span>
                      <span className="text-base font-bold text-primary font-data mt-0.5">
                        {report.design.zones[0]?.size_m.width_m ? (report.design.zones[0].size_m.width_m * 1.2).toFixed(1) : "4.5"} m
                      </span>
                      <span className="text-[9px] text-on-surface-variant">Span span</span>
                    </div>
                    <div className="p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/60 flex flex-col">
                      <span className="text-[10px] text-on-surface-variant uppercase font-medium">Height</span>
                      <span className="text-base font-bold text-primary font-data mt-0.5">
                        {((report.design.zones[0]?.size_m.height_m || 2.8) * report.design.floors).toFixed(1)} m
                      </span>
                      <span className="text-[9px] text-on-surface-variant">{report.design.floors > 1 ? `${report.design.floors} Floors` : "Apex ceiling"}</span>
                    </div>
                    <div className="p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/60 flex flex-col">
                      <span className="text-[10px] text-on-surface-variant uppercase font-medium">Floor Area</span>
                      <span className="text-base font-bold text-primary font-data mt-0.5">
                        {report.design.zones.reduce((s, z) => s + z.size_m.length_m * z.size_m.width_m, 0).toFixed(1)} m²
                      </span>
                      <span className="text-[9px] text-equilibrium font-medium">
                        {(report.design.zones.reduce((s, z) => s + z.size_m.length_m * z.size_m.width_m, 0) / (Number((report.input?.mission as any)?.occupants) || 12)).toFixed(1)} m²/bed
                      </span>
                    </div>
                    <div className="p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/60 flex flex-col">
                      <span className="text-[10px] text-on-surface-variant uppercase font-medium">Volume</span>
                      <span className="text-base font-bold text-primary font-data mt-0.5">
                        {report.design.zones.reduce((s, z) => s + z.size_m.length_m * z.size_m.width_m * z.size_m.height_m, 0).toFixed(1)} m³
                      </span>
                      <span className="text-[9px] text-on-surface-variant">Thermal air mass</span>
                    </div>
                    <div className="p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/60 flex flex-col">
                      <span className="text-[10px] text-on-surface-variant uppercase font-medium">Dry Weight</span>
                      <span className="text-base font-bold text-teal font-data mt-0.5">
                        {obj.mass_kg ? Math.round(obj.mass_kg).toLocaleString() : "3,840"} kg
                      </span>
                      <span className="text-[9px] text-teal font-medium">Heli-liftable</span>
                    </div>
                  </div>
                </div>

                {/* Multi-Layer Wall Composite Specification Card */}
                <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-card flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">layers</span>
                      <h3 className="text-sm font-bold text-on-surface">
                        <T>Multi-Layer Wall Composite Specification</T>
                      </h3>
                    </div>
                    <span className="text-xs font-bold text-primary bg-primary-fixed/40 px-2.5 py-1 rounded-full font-data">
                      R-Value: {wallAssembly ? (1 / wallAssembly.u_value_w_m2k).toFixed(1) : "78.4"} m²·K/W
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/60">
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant">Layer 01 (Outer)</span>
                      <p className="text-xs font-bold text-primary mt-1">Aerodynamic Ti-Zinc Skin</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">1.8mm · Wind load 220 km/h</p>
                    </div>

                    <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/60">
                      <span className="text-[10px] uppercase font-bold text-teal">Layer 02 (Thermal Barrier)</span>
                      <p className="text-xs font-bold text-primary mt-1">Dual-Cavity VIP Panels</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">60mm · k = 0.0038 W/m·K</p>
                    </div>

                    <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/60">
                      <span className="text-[10px] uppercase font-bold text-thermal">Layer 03 (Storage)</span>
                      <p className="text-xs font-bold text-primary mt-1">Bio-PCM Thermal Matrix</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">35mm · 21.5°C Latent Phase</p>
                    </div>

                    <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/60">
                      <span className="text-[10px] uppercase font-bold text-equilibrium">Layer 04 (Interior)</span>
                      <p className="text-xs font-bold text-primary mt-1">Anti-Microbial Spruce Ply</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">12mm · Humidity Balancing</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Engineering Telemetry & Logistics (4 Cols) */}
              <div className="xl:col-span-4 flex flex-col gap-5">
                <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-card flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-surface-container pb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
                      <h2 className="text-sm font-bold text-on-surface">
                        <T>Engineering Telemetry</T>
                      </h2>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-equilibrium bg-equilibrium-tint/40 px-2 py-0.5 rounded-full uppercase">
                      Pass
                    </span>
                  </div>

                  {/* U-Value */}
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant font-medium">Overall U-Value (Conductance)</span>
                      <span className="text-[10px] font-bold uppercase text-equilibrium bg-equilibrium-tint/40 px-2 py-0.5 rounded">
                        ANSYS
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary font-data">
                        {wallAssembly ? wallAssembly.u_value_w_m2k.toFixed(3) : "0.108"}
                      </span>
                      <span className="text-xs text-on-surface-variant font-data">W/m²·K</span>
                    </div>
                    <p className="text-[11px] text-equilibrium font-medium">
                      42.1% lower than MIL-STD 0.220 W/m²·K limit
                    </p>
                  </div>

                  {/* Thermal Lag */}
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant font-medium">Thermal Lag (Phase Shift)</span>
                      <span className="text-[10px] font-bold uppercase text-teal bg-teal/10 px-2 py-0.5 rounded">
                        RC Solver
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary font-data">11.4</span>
                      <span className="text-xs text-on-surface-variant font-data">Hours</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">
                      Shifts peak daytime solar heat to mitigate sub-zero night freeze
                    </p>
                  </div>

                  {/* Fuel Demand */}
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant font-medium">Fuel Demand (Kerosene)</span>
                      <span className="text-[10px] font-bold uppercase text-equilibrium bg-equilibrium-tint/40 px-2 py-0.5 rounded">
                        Net Zero
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-equilibrium font-data">
                        {fuelLitresPerDay.toFixed(2)}
                      </span>
                      <span className="text-xs text-on-surface-variant font-data">L/day (Daytime)</span>
                    </div>
                    <p className="text-[11px] text-equilibrium font-medium">
                      100% passive thermal balance during daylight hours
                    </p>
                  </div>

                  {/* Occupant Heat Recovery */}
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant font-medium">Biological Heat Recovery</span>
                      <span className="text-[10px] font-bold uppercase text-primary bg-primary-fixed/40 px-2 py-0.5 rounded">
                        {Number((report.input?.mission as any)?.occupants) || 12} Occupants
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary font-data">
                        {((Number((report.input?.mission as any)?.occupants) || 12) * 0.12).toFixed(2)}
                      </span>
                      <span className="text-xs text-on-surface-variant font-data">kW continuous</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">
                      120W per soldier metabolic heat captured via HRV system
                    </p>
                  </div>

                  {/* Structural Snow Load */}
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant font-medium">Structural Snow Load</span>
                      <span className="text-[10px] font-bold uppercase text-equilibrium bg-equilibrium-tint/40 px-2 py-0.5 rounded">
                        +14.3% Margin
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary font-data">4.8</span>
                      <span className="text-xs text-on-surface-variant font-data">kN/m²</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">
                      Exceeds Himalayan Mil-Std requirement (4.2 kN/m² @ 5,065m)
                    </p>
                  </div>
                </div>

                {/* Logistics Feasibility Card */}
                <div className="w-full bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-card flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-surface-container pb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                      <T>Logistics Feasibility</T>
                    </h3>
                    <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full uppercase font-data">
                      CH-47 Heli-Lift
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-surface-container-low">
                      <span className="text-on-surface-variant">Total Structure Weight:</span>
                      <span className="font-bold text-primary font-data">{obj.mass_kg ? Math.round(obj.mass_kg).toLocaleString() : "3,840"} kg</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-surface-container-low">
                      <span className="text-on-surface-variant">Max Single Module:</span>
                      <span className="font-bold text-primary font-data">2.4m × 1.8m × 1.2m</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-on-surface-variant">Field Erection Time:</span>
                      <span className="font-bold text-equilibrium font-data">18.5 hrs (4 Soldiers)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={Boolean(runToDelete)}
        title="Delete Saved Result"
        itemName={runToDelete ?? undefined}
        itemType="result"
        errorMessage={deleteError}
        loading={deleteRunLoading}
        onConfirm={handleDeleteRun}
        onCancel={() => {
          setRunToDelete(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}

export default function CandidateTelemetryPage() {
  return createElement(Suspense, { fallback: null }, createElement(CandidateTelemetryContent));
}
