"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { RECENT_RUNS, TOTAL_CACHED_RUNS, type SimulationRun } from "@/lib/mock-data";
import { ROUTES } from "@/lib/routes";
import { T, useT } from "@/lib/i18n";

type ViewMode = "cfd" | "diurnal";

const SEGMENT_ACTIVE = "px-space-sm py-1 rounded font-label-mono-xs text-label-mono-xs text-on-surface bg-surface-container-lowest shadow-sm font-semibold";
const SEGMENT_IDLE = "px-space-sm py-1 rounded font-label-mono-xs text-label-mono-xs text-on-surface-variant hover:text-on-surface transition-colors";

const VERIFICATION: Record<SimulationRun["verification"], { icon: string; label: string; tone: string }> = {
  ansys: { icon: "verified", label: "Validated by ANSYS", tone: "text-primary" },
  ml: { icon: "filter_vintage", label: "Screened by ML", tone: "text-secondary" },
  rc: { icon: "functions", label: "Calculated by RC", tone: "text-on-surface" },
};

function StatusBadge({ status }: { status: SimulationRun["status"] }) {
  if (status.kind === "solving") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-mono-xs text-label-mono-xs font-bold uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping" />
        <span>
          <T>Solving (Iter</T> <span className="font-data">{status.iter}</span>)
        </span>
      </span>
    );
  }
  if (status.kind === "archived") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-outline font-label-mono-xs text-label-mono-xs font-bold uppercase">
        <T>Archived (Ref)</T>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-secondary font-label-mono-xs text-label-mono-xs font-bold uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
      {" "}<T>Converged</T>
    </span>
  );
}

function RunRow({ run }: { run: SimulationRun }) {
  const router = useRouter();
  const t = useT();
  const verification = VERIFICATION[run.verification];
  const isBaseline = run.status.kind === "archived";
  const inspectHref = run.candidateId ? ROUTES.candidateDetail(run.candidateId) : ROUTES.benchmarkLibrary;
  return (
    // Whole row opens the telemetry view; Inspect / download keep their own targets.
    <tr
      className="h-14 hover:bg-surface-container-low/40 transition-colors group cursor-pointer"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a, button")) router.push(ROUTES.candidateTelemetry);
      }}
    >
      <td className="px-space-lg py-2 font-label-mono-sm text-label-mono-sm font-bold text-primary whitespace-nowrap">
        <Link href={ROUTES.candidateTelemetry} className="font-data hover:underline">
          {run.id}
        </Link>
      </td>
      <td className="px-space-md py-2 font-medium text-on-surface">
        <div className="flex flex-col">
          <span className="">{run.archetype}</span>
          <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
            <T>{run.envelope}</T>
          </span>
        </div>
      </td>
      <td className="px-space-md py-2 text-on-surface-variant whitespace-nowrap">
        <span className="flex items-center gap-1 font-label-mono-xs text-label-mono-xs">
          <span className="material-symbols-outlined text-[14px] text-secondary">location_on</span>
          {" "}{run.site}
        </span>
      </td>
      <td className={`px-space-md py-2 text-right whitespace-nowrap font-label-mono-sm text-label-mono-sm font-semibold ${run.deltaTCritical ? "text-error" : "text-on-surface"}`}>
        <span className="font-data">{run.deltaT}</span>{" "}
        <span className={`font-data text-label-mono-xs ${run.deltaTCritical ? "text-on-surface-variant" : "text-secondary font-normal"}`}>
          {run.tempRange}
        </span>
      </td>
      <td className={`px-space-md py-2 text-right whitespace-nowrap font-label-mono-sm text-label-mono-sm font-medium ${isBaseline ? "text-on-surface-variant" : "text-tertiary-container"}`}>
        <span className="font-data">{run.shgc}</span>{" "}
        <span className="font-data text-label-mono-xs text-on-surface-variant">{run.irradiance}</span>
      </td>
      <td className="px-space-md py-2 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container font-label-mono-xs text-label-mono-xs font-semibold ${verification.tone}`}>
          <span className="material-symbols-outlined text-[12px]">{verification.icon}</span>
          {" "}<T>{verification.label}</T>
        </span>
      </td>
      <td className="px-space-md py-2 whitespace-nowrap">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-space-lg py-2 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-space-xs">
          <Link href={inspectHref} className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high font-body-sm text-body-sm font-medium text-on-surface transition-colors hover-lift" title={t(isBaseline ? "Open reference in Benchmark Library" : "Inspect Visual Geometry")}>
            <T>Inspect</T>
          </Link>
          <button type="button" onClick={() => downloadRunLog(run)} className="p-1 hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors rounded-full" title={t("Download Log")} aria-label={`${t("Download Log")} ${run.id}`}>
            <span className="material-symbols-outlined text-[18px]">download</span>
          </button>
        </div>
      </td>
    </tr>
  );
}

function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadRunLog(run: SimulationRun) {
  downloadBlob(`${run.id}.json`, JSON.stringify(run, null, 2), "application/json");
}

function exportBatchLog(runs: SimulationRun[]) {
  const header = ["run_id", "archetype", "site", "delta_t", "temp_range", "shgc", "verification", "status"];
  const rows = runs.map((r) =>
    [r.id, r.archetype, r.site, r.deltaT, r.tempRange, r.shgc, r.verification, r.status.kind]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  downloadBlob("cocoon-batch-log.csv", [header.join(","), ...rows].join("\n"), "text/csv");
}

export default function DashboardPage() {
  const t = useT();
  const [viewMode, setViewMode] = useState<ViewMode>("cfd");
  const [query, setQuery] = useState("");

  const visibleRuns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RECENT_RUNS;
    return RECENT_RUNS.filter((r) =>
      [r.id, r.archetype, r.envelope, r.site, VERIFICATION[r.verification].label, r.status.kind]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  return (
    <>
      <div className="flex flex-col w-full">
        {/* Top Engineering Notification Bar */}
        <section className="w-full bg-surface-container-high px-gutter-lg py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-sm min-w-0">
            <span className="inline-flex items-center gap-1.5 px-space-xs py-0.5 rounded-full bg-surface-container-lowest text-primary font-label-mono-xs text-label-mono-xs uppercase tracking-wider font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              {" "}<T>MESH SOLVER: ONLINE</T>
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
              <T>ANSYS MAPDL v24.1 + OpenFOAM-v2312 node cluster active across 64 cores. Convergence residual threshold:</T>{" "}
              <span className="font-label-mono-xs text-label-mono-xs text-on-surface font-medium font-data">1.4e-6</span>
              .
            </p>
          </div>
          <div className="flex items-center gap-space-md shrink-0">
            <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
              <T>SOLSTICE SIM WINDOW:</T>{" "}
              <span className="text-on-surface font-semibold"><T>DEC</T> <span className="font-data">21</span> <span className="font-data">± 14</span> <T>DAYS</T></span>
            </span>
            <div className="h-3 w-px bg-outline-variant" />
            <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
              <T>SOLVER LOAD:</T>{" "}
              <span className="text-secondary font-semibold font-data">73.8%</span>
            </span>
          </div>
        </section>
        <div className="w-full px-gutter-lg py-space-xl flex flex-col gap-space-xl">
          {/* Section 1: Welcome Display Banner & Live Telemetry Strip */}
          <section className="flex flex-col gap-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
              <div className="flex flex-col max-w-4xl">
                <div className="flex items-center gap-space-xs mb-space-xs">
                  <span className="px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-label-mono-xs text-label-mono-xs font-semibold tracking-wider uppercase">
                    <T>SECTOR GRID REF:</T> <span className="font-data">35.234° N</span>, <span className="font-data">77.892° E</span>
                  </span>
                  <span className="text-on-surface-variant font-label-mono-xs text-label-mono-xs">•</span>
                  <span className="text-on-surface-variant font-label-mono-xs text-label-mono-xs uppercase"><T>AMSL</T> <span className="font-data">5,065 M</span></span>
                </div>
                <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">
                  <T>Operational Simulation Console</T>
                </h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
                  <T>Himalayan Cold-Arid Frontline Infrastructure Synthesis — Active Deployment Zone: Eastern Ladakh Sub-Sector North (Depsang Plains / DBO Sector).</T>
                </p>
              </div>
              {/* System Controls */}
              <div className="flex items-center gap-space-sm shrink-0">
                <div className="flex items-center rounded-lg bg-surface-container p-0.5">
                  <button type="button" aria-pressed={viewMode === "cfd"} onClick={() => setViewMode("cfd")} className={viewMode === "cfd" ? SEGMENT_ACTIVE : SEGMENT_IDLE}>
                    <T>REAL-TIME CFD</T>
                  </button>
                  <button type="button" aria-pressed={viewMode === "diurnal"} onClick={() => setViewMode("diurnal")} className={viewMode === "diurnal" ? SEGMENT_ACTIVE : SEGMENT_IDLE}>
                    <T>DIURNAL SYNTHESIS</T>
                  </button>
                </div>
                <Link href={ROUTES.shelterConfigurator.step1} className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container-lowest shadow-sm hover:bg-surface-container-low transition-colors text-on-surface font-body-sm text-body-sm font-medium hover-lift">
                  <span className="material-symbols-outlined text-[16px] text-secondary">tune</span>
                  <span className=""><T>Boundary Layer</T></span>
                </Link>
              </div>
            </div>
            {/* Live Telemetry Status Strip (4 Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {/* Card 1: Ambient Exterior Temp */}
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col justify-between relative overflow-hidden group hover:shadow-card-hover transition-shadow">
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary-container" />
                <div className="flex items-start justify-between gap-space-sm mb-space-sm">
                  <div className="flex flex-col">
                    <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Ambient Exterior Temp</T></span>
                    <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                      <T>AWS Mast 04 • Surface Air</T>
                    </span>
                  </div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary-container text-on-primary font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>EXTREME COLD</T>
                  </span>
                </div>
                <div className="flex items-baseline gap-space-xs mt-space-sm mb-space-xs">
                  <span className="font-display-lg text-display-lg font-bold text-primary-container tracking-tight">-38.4°C</span>
                  <span className="font-label-mono-sm text-label-mono-sm text-primary font-semibold font-data">234.75 K</span>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-xl p-space-sm flex flex-col gap-0.5">
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Min Sensor Recorded:</T></span>
                    <span className="text-on-surface font-semibold font-data">-44.1°C</span>
                  </div>
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Effective Wind Chill:</T></span>
                    <span className="text-error font-semibold"><span className="font-data">-51.2°C</span> <T>(38kt gust NW)</T></span>
                  </div>
                </div>
              </div>
              {/* Card 2: Solar Irradiance */}
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col justify-between relative overflow-hidden group hover:shadow-card-hover transition-shadow">
                <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary-container" />
                <div className="flex items-start justify-between gap-space-sm mb-space-sm">
                  <div className="flex flex-col">
                    <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Solar Irradiance (GHI)</T></span>
                    <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>Pyrheliometer CMP22</T></span>
                  </div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-tertiary-container text-on-tertiary font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>DNI PEAK</T>
                  </span>
                </div>
                <div className="flex items-baseline gap-space-xs mt-space-sm mb-space-xs">
                  <span className="font-display-lg text-display-lg font-bold text-tertiary-container tracking-tight">842</span>
                  <span className="font-label-mono-md text-label-mono-md text-tertiary font-semibold">W/m²</span>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-xl p-space-sm flex flex-col gap-0.5">
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Atmospheric Transmittance:</T></span>
                    <span className="text-on-surface font-semibold"><span className="font-data">0.89</span> <T>(Thin Stratum)</T></span>
                  </div>
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Albedo Feedback (Snow):</T></span>
                    <span className="text-tertiary font-semibold"><span className="font-data">+312 W/m²</span> <T>Diffuse</T></span>
                  </div>
                </div>
              </div>
              {/* Card 3: Ground Permafrost Boundary */}
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col justify-between relative overflow-hidden group hover:shadow-card-hover transition-shadow">
                <div className="absolute top-0 left-0 right-0 h-1 bg-secondary" />
                <div className="flex items-start justify-between gap-space-sm mb-space-sm">
                  <div className="flex flex-col">
                    <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Ground Permafrost Boundary</T></span>
                    <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>Borehole Array T-11</T></span>
                  </div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-secondary text-on-secondary font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>THERMAL SLAB</T>
                  </span>
                </div>
                <div className="flex items-baseline gap-space-xs mt-space-sm mb-space-xs">
                  <span className="font-display-lg text-display-lg font-bold text-secondary tracking-tight">-14.2°C</span>
                  <span className="font-label-mono-sm text-label-mono-sm text-secondary font-semibold">@ <span className="font-data">1.2m</span> <T>depth</T></span>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-xl p-space-sm flex flex-col gap-0.5">
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Freeze Depth (Active Layer):</T></span>
                    <span className="text-on-surface font-semibold"><span className="font-data">2.85 m</span> <T>Stable</T></span>
                  </div>
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Bedrock Conductivity (k):</T></span>
                    <span className="text-secondary font-semibold font-data">2.45 W/m·K</span>
                  </div>
                </div>
              </div>
              {/* Card 4: Target Internal Comfort Equilibrium */}
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col justify-between relative overflow-hidden group hover:shadow-card-hover transition-shadow">
                <div className="absolute top-0 left-0 right-0 h-1 bg-surface-tint" />
                <div className="flex items-start justify-between gap-space-sm mb-space-sm">
                  <div className="flex flex-col">
                    <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Internal Target Equilibrium</T></span>
                    <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>MIL-SPEC 810H Spec</T></span>
                  </div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-surface-tint text-on-primary font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>ASHRAE 55 COLD</T>
                  </span>
                </div>
                <div className="flex items-baseline gap-space-xs mt-space-sm mb-space-xs">
                  <span className="font-display-lg text-display-lg font-bold text-on-surface tracking-tight">+19.5°C</span>
                  <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant font-medium"><span className="font-data">± 1.5°C</span> <T>Margin</T></span>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-low rounded-xl p-space-sm flex flex-col gap-0.5">
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Relative Humidity Target:</T></span>
                    <span className="text-on-surface font-semibold"><span className="font-data">35%</span> - <span className="font-data">45%</span> <T>Non-condensing</T></span>
                  </div>
                  <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs">
                    <span className="text-on-surface-variant"><T>Occupant Metabolic Load:</T></span>
                    <span className="text-on-surface font-semibold"><span className="font-data">120</span> <T>W/person (</T><span className="font-data">12</span> <T>pax)</T></span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          {/* Section 2: Primary Action Hub */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Hero Action Tile (Navy) */}
            <div className="lg:col-span-6 bg-primary-container text-on-primary rounded-2xl p-space-xl shadow-feature flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute -right-8 -bottom-8 w-64 h-64 rounded-full bg-surface-tint opacity-20 pointer-events-none blur-2xl" />
              <div className="flex flex-col relative z-10">
                <div className="flex items-center justify-between gap-space-sm mb-space-md">
                  <span className="px-space-xs py-0.5 rounded-full bg-on-primary/10 text-on-primary font-label-mono-xs text-label-mono-xs uppercase tracking-wider font-semibold">
                    <T>CORE ITERATION PIPELINE</T>
                  </span>
                  <span className="font-label-mono-xs text-label-mono-xs text-on-primary-container"><T>GEN-OPT SOLVER</T> <span className="font-data">v4.2</span></span>
                </div>
                <h2 className="font-headline-lg text-headline-lg font-bold text-on-primary mb-space-sm">
                  <Link href={ROUTES.shelterConfigurator.step1} className="group/cta inline-flex items-center gap-space-sm hover:underline underline-offset-4">
                    <span className=""><T>New Shelter Simulation</T></span>
                    <span className="material-symbols-outlined text-[24px] text-on-primary group-hover/cta:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </Link>
                </h2>
                <p className="font-body-md text-body-md text-on-primary-container leading-relaxed max-w-xl">
                  <T>Configure geometry, thermal envelope stratification, glazing, and occupancy heat flux for automated generative Pareto optimization. Synthesize aerodynamic wind profiles against high-altitude blizzard loads.</T>
                </p>
              </div>
              <div className="mt-space-xl pt-space-md border-t border-on-primary/10 flex flex-wrap items-center justify-between gap-space-md relative z-10">
                <div className="flex items-center gap-space-lg">
                  <div className="flex flex-col">
                    <span className="font-label-mono-xs text-label-mono-xs text-on-primary-container uppercase"><T>Thermal RC Steps</T></span>
                    <span className="font-label-mono-md text-label-mono-md font-semibold text-on-primary"><span className="font-data">8,760 h</span> <T>Diurnal</T></span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-mono-xs text-label-mono-xs text-on-primary-container uppercase"><T>Pareto Bounds</T></span>
                    <span className="font-label-mono-md text-label-mono-md font-semibold text-on-primary"><T>Cost / Fuel / Mass</T></span>
                  </div>
                </div>
                <Link href={ROUTES.shelterConfigurator.step1} className="px-space-lg py-2 rounded-lg bg-surface-container-lowest text-primary font-body-sm text-body-sm font-semibold shadow-sm hover:bg-surface-container-low transition-colors flex items-center gap-space-xs hover-lift">
                  <span className="material-symbols-outlined text-[18px]">add_box</span>
                  <span className=""><T>Initialize Solver Studio</T></span>
                </Link>
              </div>
            </div>
            {/* Secondary Tile 1: Multiphysics Solvers */}
            <div className="lg:col-span-3 bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col justify-between group hover:shadow-card-hover transition-shadow">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-space-sm">
                  <span className="ml-auto font-label-mono-xs text-label-mono-xs text-secondary font-semibold"><span className="font-data">v2.8.4</span> <T>ACTIVE</T></span>
                </div>
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface mb-space-xs">
                  <T>Advanced RC/FEM Multiphysics Solvers</T>
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed mb-space-md">
                  <T>Direct interface for coupling fluid convection (Rayleigh-Bénard cells), phase-change paraffin PCM walls, and permafrost heat sinks.</T>
                </p>
                <div className="bg-surface-container-low rounded-xl p-space-sm flex flex-col gap-1 mb-space-sm font-label-mono-xs text-label-mono-xs">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant"><T>FEM Mesh Resolution:</T></span>
                    <span className="text-on-surface font-semibold"><span className="font-data">0.5mm</span> <T>Boundary</T></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant"><T>Solvers Active:</T></span>
                    <span className="text-on-surface font-semibold"><T>CFD + Heat Transfer</T></span>
                  </div>
                </div>
              </div>
              <Link href={ROUTES.shelterConfigurator.step1} className="w-full py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center justify-center gap-space-xs hover-lift">
                <span className="material-symbols-outlined text-[16px] text-secondary">memory</span>
                <span className=""><T>Open Solver Parameters</T></span>
              </Link>
            </div>
            {/* Secondary Tile 2: Batch Parametric Sensitivity Matrix */}
            <div className="lg:col-span-3 bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col justify-between group hover:shadow-card-hover transition-shadow">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-space-sm">
                  <span className="px-space-xs py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>STOCHASTIC ENGINE</T>
                  </span>
                  <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant"><span className="font-data">10,000</span> <T>ITERATIONS</T></span>
                </div>
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface mb-space-xs">
                  <T>Batch Parametric Sensitivity Matrix</T>
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed mb-space-md">
                  <T>Executes Monte Carlo winter solstice passes testing extreme wind shifts, thermal bridge degradation, and window VIP seal micro-failures.</T>
                </p>
                <div className="bg-surface-container-low rounded-xl p-space-sm flex flex-col gap-1 mb-space-sm font-label-mono-xs text-label-mono-xs">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant"><T>Worst Case Scenarios:</T></span>
                    <span className="text-error font-semibold"><span className="font-data">99.7%</span> <T>Resilient</T></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant"><T>Sensitivity Vector:</T></span>
                    <span className="text-on-surface font-semibold"><T>VIP Vacuum R-Value</T></span>
                  </div>
                </div>
              </div>
              <Link href={ROUTES.candidateTelemetry} className="w-full py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center justify-center gap-space-xs hover-lift">
                <span className="material-symbols-outlined text-[16px] text-tertiary-container">hub</span>
                <span className=""><T>Execute Matrix Queue</T></span>
              </Link>
            </div>
          </section>
          {/* Section 3: Metric Summary Trio */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* Metric 1: Active Deployments & Runs */}
            <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-surface-container">
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface"><T>Active Deployments &amp; Runs</T></h3>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>RUN AUDIT</T>
                  </span>
                </div>
                <div className="flex items-baseline gap-space-sm mb-space-md">
                  <span className="font-display-lg text-display-lg font-bold text-on-surface"><T>14 Solved</T></span>
                  <span className="font-headline-md text-headline-md text-secondary font-semibold"><T>/ 2 Solving</T></span>
                </div>
                {/* Progress and Convergence Breakdown */}
                <div className="space-y-space-md">
                  <div>
                    <div className="flex justify-between font-label-mono-xs text-label-mono-xs text-on-surface-variant mb-1">
                      <span className=""><T>CONVERGENCE HEALTH RATIO</T></span>
                      <span className="text-on-surface font-semibold"><span className="font-data">87.5%</span> <T>PASS RATE</T></span>
                    </div>
                    <div className="w-full h-2 rounded bg-surface-container overflow-hidden flex">
                      <div className="bg-secondary h-full" style={{ width: "87.5%" }} />
                      <div className="bg-tertiary-container h-full" style={{ width: "12.5%" }} />
                    </div>
                  </div>
                  {/* Mini List of Active Queue */}
                  <div className="flex flex-col gap-space-xs">
                    <Link href={ROUTES.candidateTelemetry} className="flex items-center justify-between p-space-sm bg-surface-container-low hover:bg-surface-container rounded-lg font-label-mono-xs text-label-mono-xs transition-colors hover-lift">
                      <div className="flex items-center gap-space-xs">
                        <span className="w-2 h-2 rounded-full bg-secondary" />
                        <span className="font-medium text-on-surface"><span className="font-data">RUN-8821</span><T>: Siachen North Base</T></span>
                      </div>
                      <span className="text-secondary font-semibold"><T>CONVERGED (</T><span className="font-data">0.002</span>)</span>
                    </Link>
                    <Link href={ROUTES.candidateTelemetry} className="flex items-center justify-between p-space-sm bg-surface-container-low hover:bg-surface-container rounded-lg font-label-mono-xs text-label-mono-xs transition-colors hover-lift">
                      <div className="flex items-center gap-space-xs">
                        <span className="w-2 h-2 rounded-full bg-tertiary-container animate-pulse" />
                        <span className="font-medium text-on-surface"><span className="font-data">RUN-8822</span><T>: Galwan Point 4170</T></span>
                      </div>
                      <span className="text-tertiary-container font-semibold"><T>SOLVING ITER</T> <span className="font-data">440</span></span>
                    </Link>
                    <Link href={ROUTES.candidateTelemetry} className="flex items-center justify-between p-space-sm bg-surface-container-low hover:bg-surface-container rounded-lg font-label-mono-xs text-label-mono-xs transition-colors hover-lift">
                      <div className="flex items-center gap-space-xs">
                        <span className="w-2 h-2 rounded-full bg-tertiary-container animate-pulse" />
                        <span className="font-medium text-on-surface"><span className="font-data">RUN-8823</span><T>: Saser Kangri Post</T></span>
                      </div>
                      <span className="text-tertiary-container font-semibold"><T>SOLVING ITER</T> <span className="font-data">120</span></span>
                    </Link>
                  </div>
                </div>
              </div>
              <div className="mt-space-lg pt-space-sm border-t border-surface-container flex items-center justify-between">
                <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Cluster Allocation</T></span>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold"><span className="font-data">48/64</span> <T>Cores Dedicated</T></span>
              </div>
            </div>
            {/* Metric 2: Candidate Solution Gallery */}
            <div className="bg-surface-container-lowest rounded-2xl p-space-xl shadow-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-surface-container">
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface"><T>Top Pareto Candidate</T></h3>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container text-secondary font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>RANK #1 OPTIMAL</T>
                  </span>
                </div>
                <div className="flex flex-col gap-1 mb-space-md">
                  <span className="font-label-mono-md text-label-mono-md font-bold text-primary tracking-tight">
                    <T>HIM-SHELTER-GEN4-V3</T>
                  </span>
                  <div className="flex items-center gap-space-xs">
                    <span className="font-display-lg text-display-lg font-bold text-on-surface">21.2°C</span>
                    <span className="font-label-mono-xs text-label-mono-xs text-secondary font-semibold uppercase">
                      <T>STEADY-STATE EQUILIBRIUM</T>
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    <T>Zero kW auxiliary kerosene burn achieved during direct solar window (10:00 - 15:30 IST) via aerogel envelope &amp; high-mass Trombe floor.</T>
                  </p>
                </div>
                {/* Thermal Mesh Gradient Visualization Indicator */}
                <div className="bg-surface-container-low rounded-xl p-space-sm mb-space-sm">
                  <div className="flex items-center justify-between font-label-mono-xs text-label-mono-xs text-on-surface-variant mb-1">
                    <span className=""><T>THERMAL GRADIENT SPECTRUM</T></span>
                    <span className="text-on-surface font-semibold">ΔT = <span className="font-data">59.6 K</span></span>
                  </div>
                  <div className="h-3 w-full rounded flex overflow-hidden">
                    <div className="w-1/5 bg-primary-container" title={t("Exterior Cold (-38°C)")} />
                    <div className="w-1/5 bg-secondary" title={t("Slab Perimeter (-8°C)")} />
                    <div className="w-1/5 bg-secondary-container" title={t("Vestibule (+6°C)")} />
                    <div className="w-1/5 bg-surface-tint" title={t("Inner Shell (+18°C)")} />
                    <div className="w-1/5 bg-tertiary-container" title={t("Core Zone (+21.2°C)")} />
                  </div>
                  <div className="flex justify-between font-label-mono-xs text-label-mono-xs text-on-surface-variant mt-1">
                    <span className=""><span className="font-data">-38°C</span> <T>(Outer Air)</T></span>
                    <span className=""><span className="font-data">+21.2°C</span> <T>(Habitat Core)</T></span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-space-sm font-label-mono-xs text-label-mono-xs">
                  <div className="p-2 bg-surface-container-low rounded-xl">
                    <span className="text-on-surface-variant block"><T>U-Value (Composite):</T></span>
                    <span className="text-on-surface font-semibold text-label-mono-sm font-data">0.078 W/m²·K</span>
                  </div>
                  <div className="p-2 bg-surface-container-low rounded-xl">
                    <span className="text-on-surface-variant block"><T>Solar Heat Gain (SHGC):</T></span>
                    <span className="text-tertiary-container font-semibold text-label-mono-sm"><span className="font-data">0.71</span> <T>(Glazing)</T></span>
                  </div>
                </div>
              </div>
              <div className="mt-space-lg pt-space-sm border-t border-surface-container flex items-center justify-between">
                <Link className="font-body-sm text-body-sm text-primary hover:underline font-semibold flex items-center gap-1" href={ROUTES.candidateDetail("C-8042-4")}>
                  <span className=""><T>View 3D FEA Heat Flux Map</T></span>
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                </Link>
                <span className="font-label-mono-xs text-label-mono-xs text-secondary font-semibold"><T>MIL-STD CONVERGED</T></span>
              </div>
            </div>
            {/* Metric 3: Reference Benchmark Baseline */}
            <div className="bg-surface-container-lowest rounded-2xl p-space-xl shadow-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-surface-container">
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface"><T>Reference Baseline Delta</T></h3>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-mono-xs text-label-mono-xs font-semibold">
                    <T>LEGACY COMPARISON</T>
                  </span>
                </div>
                <div className="flex items-baseline gap-space-xs mb-space-xs">
                  <span className="font-display-lg text-display-lg font-bold text-secondary tracking-tight">-68.4%</span>
                  <span className="font-label-mono-md text-label-mono-md text-on-surface font-semibold"><T>Fuel Demand</T></span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                  <T>Direct metric variance against standard 1984 Arctic Quonset Bunkhouse (Single-skin corrugated galvanized iron with 50mm glass-wool insulation).</T>
                </p>
                {/* Metric Comparison Barrels */}
                <div className="space-y-space-sm mb-space-md">
                  <div className="bg-surface-container-low rounded-xl p-space-sm">
                    <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs mb-1">
                      <span className="text-on-surface-variant"><T>Legacy 1984 Quonset:</T></span>
                      <span className="text-error font-semibold"><span className="font-data">48.2 L/day</span> <T>Kerosene</T></span>
                    </div>
                    <div className="w-full h-2 rounded bg-surface-container overflow-hidden">
                      <div className="bg-error h-full" style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-space-sm">
                    <div className="flex justify-between items-center font-label-mono-xs text-label-mono-xs mb-1">
                      <span className="text-on-surface-variant"><T>COCOON GEN-4 V3:</T></span>
                      <span className="text-secondary font-semibold"><span className="font-data">15.2 L/day</span> <T>Kerosene</T></span>
                    </div>
                    <div className="w-full h-2 rounded bg-surface-container overflow-hidden">
                      <div className="bg-secondary h-full" style={{ width: "31.6%" }} />
                    </div>
                  </div>
                </div>
                {/* Logistics Saving Tag */}
                <div className="p-space-sm rounded-xl bg-surface-container flex items-center justify-between font-label-mono-xs text-label-mono-xs">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[16px] text-tertiary-container">flight_takeoff</span>
                    <span className="text-on-surface font-semibold"><T>Aviation Air-Drop Savings:</T></span>
                  </div>
                  <span className="text-tertiary font-bold"><span className="font-data">12</span> <T>sorties/month avoided</T></span>
                </div>
              </div>
              <div className="mt-space-lg pt-space-sm border-t border-surface-container flex items-center justify-between">
                <span className="font-body-sm text-body-sm text-on-surface-variant"><T>Annual Operational Delta</T></span>
                <span className="font-label-mono-sm text-label-mono-sm text-secondary font-semibold">₹<span className="font-data">4.24 Cr</span> / <span className="font-data">10</span> <T>Shelters</T></span>
              </div>
            </div>
          </section>
          {/* Section 4: Recent Activity & Simulation Runs Table */}
          <section className="bg-surface-container-lowest rounded-xl shadow-card overflow-hidden flex flex-col">
            {/* Table Header & Filter Toolbar */}
            <div className="p-space-lg border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-lowest">
              <div className="flex items-center gap-space-md">
                <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
                  <T>Recent Activity &amp; Simulation Runs</T>
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-label-mono-xs text-label-mono-xs font-semibold">
                  <span className="font-data">16</span> <T>RUNS CACHED</T>
                </span>
              </div>
              <div className="flex items-center gap-space-sm flex-wrap">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-2 text-[18px] text-on-surface-variant">search</span>
                  <input className="h-9 pl-9 pr-3 rounded-lg bg-surface-container-low border-0 text-on-surface font-label-mono-xs text-label-mono-xs placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-64" placeholder={t("Filter Run ID, site, or tag...")} type="search" aria-label={t("Filter runs")} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <button className="h-9 px-space-md rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-colors flex items-center gap-space-xs hover-lift">
                  <span className="material-symbols-outlined text-[16px]">filter_list</span>
                  <span className=""><T>Filters</T></span>
                </button>
                <button type="button" onClick={() => exportBatchLog(visibleRuns)} className="h-9 px-space-md rounded-lg bg-primary text-on-primary hover:bg-primary/90 font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-space-xs hover-lift">
                  <span className="material-symbols-outlined text-[16px]">file_download</span>
                  <span className=""><T>Export Batch Log</T></span>
                </button>
              </div>
            </div>
            {/* High Density Scientific Data Table */}
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/70 border-b border-surface-container font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase tracking-wider">
                    <th className="py-space-md px-space-lg font-semibold"><T>Run ID</T></th>
                    <th className="py-space-md px-space-md font-semibold"><T>Archetype Architecture</T></th>
                    <th className="py-space-md px-space-md font-semibold"><T>Deployment Site</T></th>
                    <th className="py-space-md px-space-md font-semibold text-right"><T>Ext vs Int ΔT</T></th>
                    <th className="py-space-md px-space-md font-semibold text-right"><T>Solar Gain (SHGC)</T></th>
                    <th className="py-space-md px-space-md font-semibold"><T>Verification Level</T></th>
                    <th className="py-space-md px-space-md font-semibold"><T>Solver Status</T></th>
                    <th className="py-space-md px-space-lg font-semibold text-right"><T>Actions</T></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
                  {visibleRuns.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                  {visibleRuns.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-space-lg py-space-xl text-center font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                        <T>No cached runs match &ldquo;</T>{query}<T>&rdquo;</T>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Table Footer Pagination */}
            <div className="p-space-md border-t border-surface-container flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-lowest font-label-mono-xs text-label-mono-xs text-on-surface-variant">
              <span className="">
                <T>SHOWING</T> <span className="font-data">{visibleRuns.length}</span> <T>OF</T> <span className="font-data">{TOTAL_CACHED_RUNS}</span> <T>GENERATIVE RUNS</T>
              </span>
              <div className="flex items-center gap-space-xs">
                <button className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container text-on-surface font-semibold disabled:opacity-50 font-data" aria-current="page">
                  1
                </button>
                {/* Only the first page is cached client-side; paging arrives with the runs API. */}
                <button disabled title={t("Not cached yet")} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-data">
                  2
                </button>
                <button disabled title={t("Not cached yet")} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-data">
                  3
                </button>
                <button disabled title={t("Not cached yet")} className="px-2 py-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <T>Next</T>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
