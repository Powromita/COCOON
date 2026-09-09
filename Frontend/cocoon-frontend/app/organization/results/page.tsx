"use client";

import SiteHeader from "@/app/_components/SiteHeader";
import ResolvedConfigStrip from "@/app/_components/ResolvedConfigStrip";
import SolarEnergyPanel from "@/app/_components/SolarEnergyPanel";
import HeatFlowPanel from "@/app/_components/HeatFlowPanel";
import AnsysValidationPanel from "@/app/_components/AnsysValidationPanel";
import DesignComparisonTable from "@/app/_components/DesignComparisonTable";
import ReliabilityPanel from "@/app/_components/ReliabilityPanel";
import RecommendationCard from "@/app/_components/RecommendationCard";
import LogisticsPanel from "@/app/_components/LogisticsPanel";
import { ResultsProvider, useResults } from "@/app/_components/ResultsProvider";
import RunProgress from "@/app/_components/RunProgress";
import TemperatureChart from "@/app/_components/TemperatureChart";
import { artifactUrl } from "@/app/_lib/api";
import { useT } from "@/app/_lib/i18n";

export default function OrganizationResultsPage() {
  return (
    <ResultsProvider>
      <OrganizationResultsBody />
    </ResultsProvider>
  );
}

function OrganizationResultsBody() {
  const t = useT();
  const { results, isReal } = useResults();
  const temp = results.features.temperature;
  const cfg = results.config_echo;
  const ansys = results.ansys;
  const isOptimize = results.mode === "optimize";
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}°C`;

  const cards = [
    { labelKey: "ores.minHab", value: fmt(temp.T_min_C), subKey: "ores.minHabSub", icon: "❄" },
    { labelKey: "ores.maxHab", value: fmt(temp.T_max_C), subKey: "ores.maxHabSub", icon: "☀" },
    { labelKey: "ores.avgReg", value: fmt(temp.T_mean_C), subKey: "ores.avgRegSub", icon: "◌" },
    {
      labelKey: "ores.envLoss",
      value: `${Math.round(results.features.heatflow.avg_hourly_loss_W).toLocaleString()} W`,
      subKey: "ores.envLossSub",
      icon: "⚡",
    },
  ];

  const artifact = (name: string) =>
    results.run_id && !results.run_id.startsWith("mock")
      ? artifactUrl(results.run_id, name)
      : undefined;

  const csvHref = artifact(isOptimize ? "optimization_results.csv" : "features/single/temperature.csv");
  const reportHref = artifact("REPORT.md");

  return (
    <main className="min-h-screen bg-surface text-on-surface antialiased">
      <SiteHeader mode="Organization" active="results" />

      <main className="w-full flex-1 bg-surface pt-16">
        <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8">
          <RunProgress />

          <div className="flex flex-col justify-between gap-space-lg pb-space-xs lg:flex-row lg:items-end">
            <div className="min-w-0 space-y-space-2xs">
              <div className="flex items-center gap-space-xs">
                <span className="rounded bg-surface-container px-space-xs py-0.5 font-mono-metric-sm uppercase tracking-wider text-primary">{t("ores.eyebrow")}</span>
                <span className="text-outline">•</span>
                <span className="font-mono-metric-sm text-outline">RUN {results.run_id}</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
                {isOptimize ? t("res.mode.optimizeTitle") : t("res.mode.singleTitle")}
              </h1>
              <p className="w-full min-w-0 max-w-3xl font-body-md text-on-surface-variant">
                {temp.hours} h · {cfg.footprint_label} · {cfg.wall_label} · {cfg.glazing_label} · Leh
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-space-sm">
              <div className="inline-flex rounded-lg bg-surface-container p-1 shadow-sm">
                <button type="button" className="rounded bg-primary px-space-sm py-1.5 font-body-sm font-semibold text-on-primary shadow-sm">
                  {t("ores.physRC")}
                </button>
                <button type="button" disabled title={t("ires.mlDisabled")} className="cursor-not-allowed rounded px-space-sm py-1.5 font-body-sm font-medium text-outline-variant">
                  {t("ores.mlSurrogate")}
                </button>
                {ansys?.ran ? (
                  <button type="button" className="rounded px-space-sm py-1.5 font-body-sm font-medium text-on-surface-variant">
                    {t("ores.ansysVal")}
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-space-xs">
                <a
                  href={csvHref ?? "#"}
                  aria-disabled={!csvHref}
                  className={`rounded px-space-sm py-2 font-body-sm font-medium shadow-sm ${
                    csvHref ? "bg-surface-container-lowest text-on-surface hover:bg-surface-container" : "pointer-events-none bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {t("res.exportCsv")}
                </a>
                <a
                  href={reportHref ?? "#"}
                  aria-disabled={!reportHref}
                  className={`rounded px-space-sm py-2 font-body-sm font-medium shadow-sm ${
                    reportHref ? "bg-primary text-on-primary hover:bg-primary-container" : "pointer-events-none bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {t("res.exportReport")}
                </a>
              </div>
            </div>
          </div>

          <TemperatureChart />

          <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div key={card.labelKey} className="rounded-xl border border-surface-container-high/50 bg-surface-container-lowest p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between text-outline">
                  <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t(card.labelKey)}</span>
                  <span className="text-[20px]">{card.icon}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="font-mono-metric-lg text-[28px] font-bold text-on-surface">{card.value}</div>
                  <div className="font-mono-metric-sm text-xs text-on-surface">{t(card.subKey)}</div>
                </div>
              </div>
            ))}
          </div>

          <ResolvedConfigStrip />

          {/* physical rationale — shown in both modes */}
          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-secondary-container">◍</span>
                <h2 className="text-xl font-bold tracking-tight text-on-surface">{t("ores.whyTitle")}</h2>
              </div>
              <span className="font-mono-metric-sm text-xs tracking-wide text-outline">{t("ores.highAltSpecs")}</span>
            </div>
            <p className="mt-3 text-[15px] leading-7 text-on-surface-variant">
              {results.recommendation?.justification ?? t("ores.whyBody")}
            </p>
            <div className="mt-3 grid gap-space-sm sm:grid-cols-3">
              {results.highlights.map((h) => (
                <div key={h.key} className="rounded-lg border border-surface-container-high/40 bg-surface-container-low p-3.5">
                  <span className="font-headline-sm text-on-surface">{h.title}</span>
                  <span className="mt-1 block font-body-sm text-on-surface-variant">{h.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-surface-container-high/40 bg-surface-container-low p-4">
              <p className="text-xs text-on-surface-variant sm:text-sm">{t("ores.opImpact")}</p>
            </div>
          </div>

          <SolarEnergyPanel />
          <HeatFlowPanel />

          {isOptimize ? (
            <>
              <RecommendationCard />
              <DesignComparisonTable />
              <ReliabilityPanel />
              <AnsysValidationPanel />
              <LogisticsPanel />
            </>
          ) : ansys?.ran ? (
            <AnsysValidationPanel />
          ) : null}

          {!isReal ? (
            <p className="font-body-sm text-on-surface-variant">{t("common.mockNote")}</p>
          ) : null}
        </div>
      </main>
    </main>
  );
}
