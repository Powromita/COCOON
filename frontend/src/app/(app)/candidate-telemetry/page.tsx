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

function TemperatureChart({ data }: { data: { h: string; inside: number; outside: number }[] }) {
  const W = 600, H = 220, PAD = 30;
  if (data.length === 0) return null;
  const allTemps = data.flatMap((d) => [d.inside, d.outside]);
  const allMin = Math.floor(Math.min(...allTemps) - 2);
  const allMax = Math.ceil(Math.max(...allTemps, 24) + 2);
  const ixs = data.map((_, i) => PAD + (i / Math.max(data.length - 1, 1)) * (W - 2 * PAD));
  const y = (v: number) => scaleY(v, allMin, allMax, H);
  const insidePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${ixs[i]},${y(d.inside)}`).join(" ");
  const outsidePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${ixs[i]},${y(d.outside)}`).join(" ");
  const insideArea = `${insidePath} L${ixs[ixs.length - 1]},${H - PAD} L${ixs[0]},${H - PAD} Z`;
  const zeroY = y(0);
  const gridVals = [allMin, Math.round((allMin + allMax) / 2), allMax, 15, 24].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 180 }}>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#CBD5E1" strokeDasharray="3,3" strokeWidth={1} />
      <text x={PAD - 4} y={zeroY + 4} fill="#94A3B8" fontSize={9} textAnchor="end">0°</text>
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={PAD} y1={y(v)} x2={W - PAD} y2={y(v)} stroke="#F1F5F9" strokeWidth={0.5} />
          <text x={PAD - 4} y={y(v) + 4} fill="#94A3B8" fontSize={8} textAnchor="end">{v}°</text>
        </g>
      ))}
      <rect x={PAD} y={y(24)} width={W - 2 * PAD} height={Math.max(y(15) - y(24), 0)} fill="#D1FAE5" opacity={0.35} />
      <path d={insideArea} fill="#3B82F6" opacity={0.08} />
      <path d={outsidePath} fill="none" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4,3" />
      <path d={insidePath} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" />
      {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 ? <circle key={i} cx={ixs[i]} cy={y(d.inside)} r={3} fill="#059669" /> : null))}
      {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 ? <text key={i} x={ixs[i]} y={H - 2} fill="#94A3B8" fontSize={8} textAnchor="middle">{d.h}</text> : null))}
    </svg>
  );
}

function SolarChart({ data }: { data: number[] }) {
  const W = 600, H = 160, PAD = 30;
  if (data.length === 0) return null;
  const maxVal = Math.max(...data, 0.1);
  const barW = (W - 2 * PAD) / data.length - 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const v = maxVal * f;
        const y = PAD + ((maxVal - v) / maxVal) * (H - 2 * PAD);
        return (
          <g key={f}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F1F5F9" strokeWidth={0.7} />
            <text x={PAD - 4} y={y + 4} fill="#94A3B8" fontSize={8} textAnchor="end">{v.toFixed(1)}</text>
          </g>
        );
      })}
      {data.map((val, i) => {
        const x = PAD + i * ((W - 2 * PAD) / data.length) + 2;
        const barH = (val / maxVal) * (H - 2 * PAD);
        const y = H - PAD - barH;
        return <rect key={i} x={x} y={y} width={barW} height={barH} rx={2} fill={val >= maxVal * 0.85 ? "#D97706" : "#3B82F6"} opacity={0.85} />;
      })}
      {data.map((_, i) => (
        <text key={i} x={PAD + i * ((W - 2 * PAD) / data.length) + barW / 2} y={H - 2} fill="#94A3B8" fontSize={8} textAnchor="middle">D{i + 1}</text>
      ))}
    </svg>
  );
}

function HeatFlowChart({ data }: { data: { deltaT: number; q: number }[] }) {
  const W = 600, H = 160, PAD = 30;
  if (data.length === 0) return null;
  const maxQ = Math.max(...data.map((d) => d.q), 10);
  const maxDT = Math.max(...data.map((d) => d.deltaT), 10);
  const xs = data.map((d) => PAD + (d.deltaT / maxDT) * (W - 2 * PAD));
  const ys = data.map((d) => H - PAD - (d.q / maxQ) * (H - 2 * PAD));
  const path = data.map((_, i) => `${i === 0 ? "M" : "L"}${xs[i]},${ys[i]}`).join(" ");
  const area = `${path} L${xs[xs.length - 1]},${H - PAD} L${xs[0]},${H - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      {[0.33, 0.66, 1].map((f) => {
        const q = maxQ * f;
        const y = H - PAD - (q / maxQ) * (H - 2 * PAD);
        return (
          <g key={f}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F1F5F9" strokeWidth={0.7} />
            <text x={PAD - 4} y={y + 4} fill="#94A3B8" fontSize={8} textAnchor="end">{Math.round(q)}W</text>
          </g>
        );
      })}
      <path d={area} fill="#0F7A8C" opacity={0.1} />
      <path d={path} fill="none" stroke="#0F7A8C" strokeWidth={2.5} strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={xs[i]} cy={ys[i]} r={3} fill="#0F7A8C" />)}
      {data.map((d, i) => <text key={i} x={xs[i]} y={H - 2} fill="#94A3B8" fontSize={8} textAnchor="middle">ΔT={Math.round(d.deltaT)}°</text>)}
    </svg>
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
  const [activeTab, setActiveTab] = useState<"results" | "3d" | "solver">("results");
  const [building, setBuilding] = useState<BuildingModel | null>(null);
  const [buildingError, setBuildingError] = useState<string | null>(null);
  const [savedRuns, setSavedRuns] = useState<OptimizationListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (optId) {
      localStorage.setItem(LATEST_OPTIMIZATION_STORAGE_KEY, optId);
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
          setError(st.error?.message ?? "The pipeline run failed.");
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
  useEffect(() => {
    if (!optId || !report?.recommendation.design_id) return;
    let cancelled = false;
    getDesign(optId, report.recommendation.design_id)
      .then((b) => { if (!cancelled) setBuilding(b); })
      .catch((err) => { if (!cancelled) setBuildingError(err instanceof Error ? err.message : "Could not load the 3D model."); });
    return () => { cancelled = true; };
  }, [optId, report?.recommendation.design_id]);

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
    return (
      <div className="w-full px-gutter-lg py-12 max-w-[900px] mx-auto flex flex-col items-center text-center gap-4">
        <span className="material-symbols-outlined text-[40px] text-error">error</span>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface"><T>Simulation failed</T></h1>
        <p className="font-body-sm text-body-sm text-error">{error}</p>
        <Link href={ROUTES.shelterConfigurator.step1} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-body-sm font-semibold hover-lift">
          <T>Configure a new run</T>
        </Link>
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
                {[
                  { label: "Minimum inside temp", value: `${insideMin.toFixed(1)}°C` },
                  { label: "Mean inside temp", value: `${insideMean.toFixed(1)}°C` },
                  { label: "Outside minimum", value: `${ambientMin.toFixed(1)}°C` },
                  { label: "Unmet comfort hours", value: `${obj.unmet_hours.toFixed(0)} h` },
                ].map((s) => (
                  <div key={s.label} className="p-3 bg-surface-container-low rounded-xl">
                    <div className="font-data text-base font-bold text-equilibrium">{s.value}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Task 2 */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold bg-thermal/20 text-thermal uppercase">Task 2</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Solar Thermal Energy Generated</T></h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Daily solar gain through glazing · {days}-day window</p>
              <div className="bg-surface-container-low rounded-xl p-4"><SolarChart data={solarData} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Average daily solar gain", value: `${(solarData.reduce((a, b) => a + b, 0) / Math.max(solarData.length, 1)).toFixed(2)} kWh/day` },
                  { label: "Peak solar day", value: `${Math.max(...solarData, 0).toFixed(2)} kWh` },
                  { label: "Total over window", value: `${solarData.reduce((a, b) => a + b, 0).toFixed(1)} kWh` },
                ].map((s) => (
                  <div key={s.label} className="p-3 bg-surface-container-low rounded-xl">
                    <div className="font-data text-base font-bold text-thermal">{s.value}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Task 3 */}
            <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded font-label-mono-xs text-label-mono-xs font-bold uppercase" style={{ backgroundColor: "#CFFAFE", color: "#0F7A8C" }}>Task 3</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Heat Flow vs. Ambient Temperature Difference</T></h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Sized-heater power vs. inside−outside ΔT (proxy for envelope heat loss)</p>
              <div className="bg-surface-container-low rounded-xl p-4"><HeatFlowChart data={heatFlowData} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Peak heating power", value: `${(cond.peak_heating_kw ?? 0).toFixed(2)} kW` },
                  { label: "Total heating energy", value: `${cond.heating_energy_kwh.toFixed(1)} kWh` },
                  { label: "Wall U-value", value: wallAssembly ? `${wallAssembly.u_value_w_m2k.toFixed(3)} W/m²K` : "—" },
                  { label: "Temperature swing", value: `${obj.temperature_swing_c.toFixed(1)}°C` },
                ].map((s) => (
                  <div key={s.label} className="p-3 bg-surface-container-low rounded-xl">
                    <div className="font-data text-base font-bold" style={{ color: "#0F7A8C" }}>{s.value}</div>
                    <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Economics */}
            {econScenario && (
              <section className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">payments</span>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold"><T>Lifecycle Economics (M7)</T></h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Capex", value: `₹${(econScenario.capex.total_capex_inr / 1e5).toFixed(2)}L` },
                    { label: "Lifecycle Cost", value: `₹${(econScenario.lcc_inr / 1e5).toFixed(2)}L` },
                    { label: "NPV vs. Baseline", value: formatLakh(econScenario.npv_vs_baseline_inr) },
                    { label: "Simple Payback", value: formatYears(econScenario.simple_payback_years) },
                    { label: "Annual Fuel", value: `${econScenario.annual_fuel_litres.toFixed(0)} L` },
                  ].map((s) => (
                    <div key={s.label} className="p-3 bg-surface-container-low rounded-xl">
                      <div className="font-data text-base font-bold text-navy">{s.value}</div>
                      <div className="font-body-sm text-[10px] text-on-surface-variant mt-0.5">{s.label}</div>
                    </div>
                  ))}
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
