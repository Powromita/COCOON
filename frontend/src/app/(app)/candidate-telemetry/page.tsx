"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { createElement, Suspense, useEffect, useMemo, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { T } from "@/lib/i18n";
import {
  getOptimization,
  listOptimizations,
  getReport,
  getTimeseries,
  getDesign,
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

function TemperatureChart({ data }: { data: { h: string; inside: number; outside: number }[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 840, H = 260;
  const PAD_LEFT = 60, PAD_RIGHT = 30, PAD_TOP = 25, PAD_BOTTOM = 40;

  if (data.length === 0) return null;

  const allTemps = data.flatMap((d) => [d.inside, d.outside]);
  const rawMin = Math.min(...allTemps, 15);
  const rawMax = Math.max(...allTemps, 24);

  const range = rawMax - rawMin;
  const step = range <= 30 ? 5 : range <= 65 ? 10 : 15;
  const minVal = Math.floor(rawMin / step) * step;
  const maxVal = Math.ceil(rawMax / step) * step;

  const ticks: number[] = [];
  for (let v = minVal; v <= maxVal; v += step) {
    ticks.push(v);
  }

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const y = (val: number) => PAD_TOP + ((maxVal - val) / (maxVal - minVal || 1)) * chartH;
  const x = (i: number) => PAD_LEFT + (i / Math.max(data.length - 1, 1)) * chartW;

  const insidePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(d.inside).toFixed(1)}`).join(" ");
  const outsidePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(d.outside).toFixed(1)}`).join(" ");
  const insideArea = `${insidePath} L ${x(data.length - 1).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} L ${x(0).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} Z`;

  const yComfortHigh = y(24);
  const yComfortLow = y(15);
  const comfortH = Math.max(yComfortLow - yComfortHigh, 0);

  const zeroY = y(0);
  const showZero = 0 >= minVal && 0 <= maxVal;

  const activePoint = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < data.length ? data[hoverIdx] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-[#0284c7] rounded-full inline-block" />
            <span className="font-body-sm font-semibold text-on-surface">Inside Heated Zone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-[#64748b] inline-block" />
            <span className="font-body-sm text-on-surface-variant font-medium">Outside Ambient</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2.5 bg-emerald-100 border border-emerald-300 rounded inline-block" />
            <span className="font-body-sm text-emerald-800 font-medium">Comfort Range (15°C–24°C)</span>
          </div>
        </div>

        {activePoint && (
          <div className="flex items-center gap-3 px-2.5 py-1 bg-surface-container rounded-lg font-data text-xs border border-outline-variant/60 shadow-sm">
            <span className="font-semibold text-on-surface">{activePoint.h}</span>
            <span className="text-[#0284c7] font-bold">Inside: {activePoint.inside.toFixed(1)}°C</span>
            <span className="text-[#64748b]">Outside: {activePoint.outside.toFixed(1)}°C</span>
            <span className="text-emerald-700 font-medium">ΔT: +{(activePoint.inside - activePoint.outside).toFixed(1)}°C</span>
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

          <path d={insideArea} fill="url(#insideTempGrad)" />
          <path d={outsidePath} fill="none" stroke="#64748b" strokeWidth={2} strokeDasharray="5,4" />
          <path d={insidePath} fill="none" stroke="#0284c7" strokeWidth={3} strokeLinejoin="round" />

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
              <circle cx={x(hoverIdx)} cy={y(activePoint.outside)} r={4} fill="#64748b" stroke="#ffffff" strokeWidth={2} />
              <circle cx={x(hoverIdx)} cy={y(activePoint.inside)} r={5} fill="#0284c7" stroke="#ffffff" strokeWidth={2} />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function SolarChart({ data }: { data: number[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 840, H = 220;
  const PAD_LEFT = 60, PAD_RIGHT = 30, PAD_TOP = 25, PAD_BOTTOM = 40;

  if (data.length === 0) return null;

  const rawMax = Math.max(...data, 0.5);
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
          <span className="font-body-sm font-semibold text-on-surface">Daily Incident Solar Heat Gain</span>
        </div>
        {hoverIdx !== null && data[hoverIdx] !== undefined && (
          <span className="font-data text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            Day {hoverIdx + 1}: <strong>{data[hoverIdx].toFixed(2)} kWh</strong>
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

          {data.map((val, i) => {
            const barH = (val / (maxVal || 1)) * chartH;
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
                  {val.toFixed(1)}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={H - 12}
                  fill="#64748b"
                  fontSize={11}
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  Day {i + 1}
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
  const maxDTRaw = Math.max(...data.map((d) => d.deltaT), 10);

  const stepQ = maxQRaw <= 1000 ? 200 : maxQRaw <= 3000 ? 500 : 1000;
  const maxQ = Math.ceil(maxQRaw / stepQ) * stepQ;

  const stepDT = maxDTRaw <= 20 ? 5 : maxDTRaw <= 40 ? 10 : 15;
  const maxDT = Math.ceil(maxDTRaw / stepDT) * stepDT;

  const ticksQ: number[] = [];
  for (let v = 0; v <= maxQ; v += stepQ) {
    ticksQ.push(v);
  }

  const ticksDT: number[] = [];
  for (let v = 0; v <= maxDT; v += stepDT) {
    ticksDT.push(v);
  }

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const x = (dt: number) => PAD_LEFT + (dt / (maxDT || 1)) * chartW;
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
          <span className="font-body-sm font-semibold text-on-surface">Heat Loss vs Temperature Lift (ΔT)</span>
        </div>
        {activePoint && (
          <span className="font-data text-xs text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
            ΔT = {activePoint.deltaT.toFixed(1)}°C → Heat Loss Rate: <strong>{Math.round(activePoint.q)} W</strong>
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
                  ΔT={dtVal}°
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

function buildTemperatureSeries(series: TimeseriesResponse | null) {
  if (!series || series.points.length === 0) return [];
  const heated = series.zone_ids.filter((z) => z !== "airlock" && z !== "equipment");
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
  const hourly = window.filter((_, i) => i % 4 === 0); // 15-min -> hourly
  return hourly.map((p) => ({
    h: p.timestamp.slice(11, 16),
    inside: zones.reduce((s, z) => s + (p.zone_temp_c[z] ?? 0), 0) / zones.length,
    outside: p.ambient_c,
  }));
}

function buildSolarDaily(series: TimeseriesResponse | null): number[] {
  if (!series || series.points.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const p of series.points) {
    const day = p.timestamp.slice(0, 10);
    const wattsSum = series.zone_ids.reduce((s, z) => s + (p.zone_solar_w[z] ?? 0), 0);
    byDay.set(day, (byDay.get(day) ?? 0) + wattsSum * 0.25 /* 15-min -> Wh */ / 1000 /* -> kWh */);
  }
  return Array.from(byDay.values());
}

function buildHeatFlow(series: TimeseriesResponse | null): { deltaT: number; q: number }[] {
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
    .map(([deltaT, values]) => ({ deltaT, q: values.reduce((a, b) => a + b, 0) / values.length }))
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
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<"results" | "3d" | "solver">("results");
  const [building, setBuilding] = useState<BuildingModel | null>(null);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const [savedRuns, setSavedRuns] = useState<OptimizationListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (optId) {
      localStorage.setItem(LATEST_OPTIMIZATION_STORAGE_KEY, optId);
      setStatus(null);
      setReport(null);
      setSeries(null);
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
              const [rep, ts] = await Promise.all([getReport(optId!), getTimeseries(optId!, "conditioned")]);
              if (cancelled) return;
              setReport(rep);
              setSeries(ts);
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

  const tempData = useMemo(() => buildTemperatureSeries(series), [series]);
  const solarData = useMemo(() => buildSolarDaily(series), [series]);
  const heatFlowData = useMemo(() => buildHeatFlow(series), [series]);

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

  const days = series ? Math.round(series.points.length / 96) : 0;

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
              <Link href={`${ROUTES.candidateTelemetry}?opt=${encodeURIComponent(run.optimization_id)}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-hover shrink-0">
                <span className="material-symbols-outlined text-[16px]">analytics</span>
                {run.status === "completed" ? "View saved result" : "View status"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // ── Backend unreachable / run failed ─────────────────────────────────────
  if (error) {
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
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface"><T>Simulation Unsuccessful</T></h1>
          <p className="font-body-sm text-body-sm text-error font-medium">{error}</p>
        </div>

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
  const zoneTemps = series.points.flatMap((p) => Object.values(p.zone_temp_c));
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
    { label: "ANSYS Status", value: report.validation.state === "RC_ONLY_ANSYS_NOT_REQUESTED" ? "Not requested" : report.validation.state, sub: "Validation state", icon: "verified", color: "text-primary", bg: "bg-primary-fixed/20" },
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
          <button type="button" onClick={printReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-label-mono-xs text-label-mono-xs font-semibold uppercase tracking-wide hover:bg-primary/90">
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            Print / Save PDF
          </button>          <button type="button" onClick={downloadReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant bg-surface-container-lowest text-primary font-label-mono-xs text-label-mono-xs font-semibold uppercase tracking-wide hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download JSON
          </button>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm" style={{ backgroundColor: "rgb(236,253,245)" }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#059669" }}>check_circle</span>
            <span className="font-label-mono-xs text-label-mono-xs font-semibold tracking-wide uppercase" style={{ color: "#059669" }}>
              All tasks complete
            </span>
          </div>
        </div>
      </section>

      <div className="w-full px-gutter-lg bg-surface-container-low border-b border-outline-variant">
        <div className="max-w-[1720px] mx-auto flex items-center gap-1 pt-2">
          {[{ id: "results", label: "Simulation Results", icon: "analytics" }, { id: "3d", label: "3D Model", icon: "view_in_ar" }, { id: "solver", label: "Run Details", icon: "terminal" }].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as "results" | "3d" | "solver")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-label-mono-sm text-label-mono-sm font-medium transition-colors border-b-2 ${activeTab === tab.id ? "bg-surface-container-lowest border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container"}`}>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {EXEC.map((card) => (
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
              <div className="bg-surface-container-low rounded-xl p-4"><TemperatureChart data={tempData} /></div>
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
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Solar Thermal Energy Generated</T></h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Daily solar gain through glazing · {days}-day window</p>
              <div className="bg-surface-container-low rounded-xl p-4"><SolarChart data={solarData} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricCard
                  label="Average Daily Solar Gain"
                  value={(solarData.reduce((a, b) => a + b, 0) / Math.max(solarData.length, 1)).toFixed(2)}
                  unit="kWh/day"
                  subtext="Passive solar harvest"
                  icon="wb_sunny"
                  variant="thermal"
                />
                <MetricCard
                  label="Peak Solar Day"
                  value={Math.max(...solarData, 0).toFixed(2)}
                  unit="kWh"
                  subtext="Max diurnal radiation"
                  icon="solar_power"
                  variant="thermal"
                />
                <MetricCard
                  label="Total Over Window"
                  value={solarData.reduce((a, b) => a + b, 0).toFixed(1)}
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
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Heat Flow vs. Ambient Temperature Difference</T></h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Sized-heater power vs. inside−outside ΔT (proxy for envelope heat loss)</p>
              <div className="bg-surface-container-low rounded-xl p-4"><HeatFlowChart data={heatFlowData} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Peak Heating Power"
                  value={(cond.peak_heating_kw ?? 0).toFixed(2)}
                  unit="kW"
                  subtext="Worst-case sizing load"
                  icon="mode_heat"
                  variant="primary"
                />
                <MetricCard
                  label="Total Heating Energy"
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
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Candidate Comparison (M6)</T></h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">All generated candidates, ranked by the optimizer</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="py-3 px-4 font-semibold">Design</th>
                      <th className="py-3 px-4 font-semibold text-right">Capex (₹L)</th>
                      <th className="py-3 px-4 font-semibold text-right">LCC (₹L)</th>
                      <th className="py-3 px-4 font-semibold text-right">Mass (kg)</th>
                      <th className="py-3 px-4 font-semibold text-right">Comfort (h)</th>
                      <th className="py-3 px-4 font-semibold text-right">Reliability</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {report.alternatives.map((row) => (
                      <tr key={row.design_id} className={`hover:bg-surface-container-low/40 transition-colors ${row.status === "selected" ? "bg-equilibrium-tint/20" : ""}`}>
                        <td className="py-3 px-4"><span className="font-data text-body-sm text-on-surface font-medium">{row.design_id}</span></td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.capex_inr == null ? "—" : (row.objectives.capex_inr / 1e5).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.lcc_inr == null ? "—" : (row.objectives.lcc_inr / 1e5).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.mass_kg == null ? "—" : row.objectives.mass_kg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.occupied_comfort_hours == null ? "—" : row.objectives.occupied_comfort_hours.toFixed(0)}</td>
                        <td className="py-3 px-4 text-right font-data text-sm text-on-surface-variant">{row.objectives.reliability == null ? "—" : `${(row.objectives.reliability * 100).toFixed(0)}%`}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${row.status === "selected" ? "text-equilibrium" : "text-on-surface-variant"}`}>
                            {row.status === "selected" && <span className="material-symbols-outlined text-[13px]">check_circle</span>}
                            {STATUS_LABEL[row.status]}
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
                <pre className="font-data text-[11px] bg-surface-container-low rounded-xl p-3 overflow-x-auto">{JSON.stringify(report.validation, null, 1)}</pre>
              )}
            </section>
          </div>
        )}

        {activeTab === "3d" && (
          <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">view_in_ar</span>
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>3D Structure Model</T></h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  The exact geometry M2 generated for design {report.recommendation.design_id} — real wall/roof/floor polygons, not an approximation. Drag to orbit, scroll to zoom.
                </p>
              </div>
            </div>
            {buildingError && <p className="text-error font-body-sm text-body-sm">{buildingError}</p>}
            {!building && !buildingError && (
              <div className="w-full h-[480px] rounded-xl bg-surface-container-low animate-pulse flex items-center justify-center text-on-surface-variant text-sm">
                Loading 3D model…
              </div>
            )}
            {building && <BuildingViewer3D building={building} />}
            <div className="flex flex-wrap gap-4 text-[11px] text-on-surface-variant">
              {[
                { swatch: "#9a9a92", label: "Stone" },
                { swatch: "#b9b9b9", label: "Concrete" },
                { swatch: "#c9a06a", label: "Plywood" },
                { swatch: "#f2e9c9", label: "PUF insulation" },
                { swatch: "#7ec8e3", label: "Window" },
                { swatch: "#5a3d24", label: "Door" },
              ].map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: l.swatch }} />
                  {l.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {activeTab === "solver" && (
          <div className="flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card">
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-3"><T>Run timings</T></h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(status.timings_s ?? {}).map(([k, v]) => (
                  <div key={k} className="p-3 bg-surface-container-low rounded-xl">
                    <div className="font-data text-sm font-bold text-navy">{v.toFixed(2)}s</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{k}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card">
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-3"><T>Weather & site</T></h3>
              <pre className="font-data text-[11px] bg-surface-container-low rounded-xl p-3 overflow-x-auto">{JSON.stringify(status.result?.site_used, null, 1)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CandidateTelemetryPage() {
  return createElement(Suspense, { fallback: null }, createElement(CandidateTelemetryContent));
}
