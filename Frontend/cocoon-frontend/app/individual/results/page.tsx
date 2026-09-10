"use client";

import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import ResolvedConfigStrip from "@/app/_components/ResolvedConfigStrip";
import SolarEnergyPanel from "@/app/_components/SolarEnergyPanel";
import HeatFlowPanel from "@/app/_components/HeatFlowPanel";
import TemperatureChart from "@/app/_components/TemperatureChart";
import RecommendationCard from "@/app/_components/RecommendationCard";
import { ResultsProvider, useResults } from "@/app/_components/ResultsProvider";
import RunProgress from "@/app/_components/RunProgress";
import { artifactUrl } from "@/app/_lib/api";
import { useT } from "@/app/_lib/i18n";

export default function IndividualResultsPage() {
  return (
    <ResultsProvider demoMode="optimize">
      <IndividualResultsBody />
    </ResultsProvider>
  );
}

function IndividualResultsBody() {
  const t = useT();
  const { results, isReal } = useResults();
  const temp = results.features.temperature;
  const cfg = results.config_echo;
  const heat = results.heating;
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}°C`;

  const cards = [
    { labelKey: "ires.minTemp", value: fmt(temp.T_min_C), detail: `worst hour · ${results.comfort.frost_free_pct.toFixed(0)}% frost-free`, tone: "text-primary" },
    { labelKey: "ires.maxTemp", value: fmt(temp.T_max_C), detail: "daytime solar peak", tone: "text-secondary" },
    { labelKey: "ires.avgTemp", value: fmt(temp.T_mean_C), detail: `ΔT vs outdoor ${results.features.heatflow.avg_temp_difference_C.toFixed(1)}°C`, tone: "text-primary-container" },
    { labelKey: "ires.fuel", value: `~${heat.fuel_litres_per_day.toFixed(1)} L/day`, detail: heat.fuel_note, tone: "text-on-surface" },
  ];

  const reportHref =
    results.report_md_url && !results.report_md_url.startsWith("#")
      ? artifactUrl(results.run_id, "REPORT.md")
      : undefined;

  const meansBody =
    results.recommendation?.justification ??
    `Over ${temp.hours} h the shelter holds ${fmt(temp.T_min_C)}–${fmt(temp.T_max_C)} indoors ` +
      `while the outside runs ${fmt(temp.outdoor_min_C)} to ${fmt(temp.outdoor_max_C)}. ` +
      `${results.comfort.hours_in_band_pct.toFixed(0)}% of hours sit inside the ${results.comfort.band_lo_C}–${results.comfort.band_hi_C} °C comfort band; ` +
      `holding the lower edge needs about ${heat.demand_kWh_per_day.toFixed(0)} kWh/day of supplemental heat.`;

  return (
    <main className="min-h-screen bg-surface text-on-surface antialiased">
      <SiteHeader mode="Individual" active="results" />

      <main className="w-full bg-surface pt-16">
        <div className="w-full border-b border-surface-container-high bg-surface-container-lowest shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-space-md px-space-lg py-space-md md:flex-row md:items-center">
            <div className="flex min-w-0 flex-col gap-space-2xs">
              <div className="flex items-center gap-space-xs">
                <span className="font-label-caps uppercase tracking-wider text-primary">{t("ires.eyebrow")}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary-container" />
                <span className="font-mono-metric-sm text-outline">RUN {results.run_id}</span>
              </div>
              <h1 className="font-display-xl tracking-tight text-on-surface">
                {temp.hours}-Hour Household Thermal Assessment
              </h1>
              <p className="w-full min-w-0 font-body-md text-on-surface-variant">
                {cfg.footprint_label} · {cfg.wall_label} · {cfg.glazing_label} · Leh winter
              </p>
            </div>
            <div className="flex items-center gap-space-sm self-start md:self-auto">
              <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high px-space-sm py-space-xs shadow-sm">
                <span className="text-primary">⌂</span>
                <span className="font-headline-sm font-body-md text-on-surface">{t("hdr.mode.Individual")}</span>
                <span className="text-outline-variant">|</span>
                <Link href="/individual/configure" className="font-mono-metric-sm text-primary hover:underline">
                  {t("common.switch")}
                </Link>
              </div>
              <a
                href={reportHref ?? "#"}
                aria-disabled={!reportHref}
                className={`rounded px-space-md py-space-xs shadow-sm transition-colors ${
                  reportHref
                    ? "bg-primary text-on-primary hover:bg-primary-container"
                    : "pointer-events-none bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {t("ires.download")}
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-space-xl px-space-lg py-space-xl">
          <RunProgress mode="optimize" />

          <RecommendationCard />

          <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
            <div className="inline-flex items-center gap-space-xs rounded bg-surface-container-high px-space-md py-space-xs shadow-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="font-headline-sm text-primary">{t("ires.physicsModel")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-space-md">
              <div className="flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-sm py-space-xs shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-secondary-container" />
                <span className="font-mono-metric-sm text-on-surface">{t("ires.legPredicted")}</span>
              </div>
              <div className="flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-sm py-space-xs shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-primary-container" />
                <span className="font-mono-metric-sm text-on-surface">{t("ires.legOutdoor")}</span>
              </div>
              <div className="flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-sm py-space-xs shadow-sm">
                <span className="h-2.5 w-2.5 rounded bg-tertiary-fixed-dim" />
                <span className="font-mono-metric-sm text-on-surface">{t("ires.legComfort")}</span>
              </div>
            </div>
          </div>

          <TemperatureChart />

          <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <div key={card.labelKey} className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
                <div className="flex items-center justify-between pb-space-xs">
                  <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t(card.labelKey)}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-high text-primary">⌂</span>
                </div>
                <div className="py-space-xs">
                  <div className={`font-mono-metric-lg font-semibold tracking-tight ${card.tone}`}>{card.value}</div>
                </div>
                <div className="mt-space-xs rounded bg-surface-container-low px-space-xs py-space-2xs font-mono-metric-sm text-outline">{card.detail}</div>
              </div>
            ))}
          </div>

          <ResolvedConfigStrip />
          <SolarEnergyPanel />
          <HeatFlowPanel />

          <div className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="flex flex-col justify-between gap-space-sm pb-space-xs md:flex-row md:items-center">
              <div className="flex min-w-0 items-center gap-space-xs">
                <span className="text-primary">ⓘ</span>
                <h2 className="font-headline-md text-on-surface">{t("ires.meansTitle")}</h2>
              </div>
              {results.comfort.hours_in_band_pct > 40 ? (
                <div className="flex items-center gap-space-xs rounded-full bg-tertiary-container/10 px-space-sm py-space-2xs">
                  <span className="h-2 w-2 rounded-full bg-tertiary-container" />
                  <span className="font-mono-metric-sm text-tertiary-container">{t("ires.certified")}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-space-lg grid gap-space-xl lg:grid-cols-[1.5fr_0.8fr]">
              <div className="flex flex-col gap-space-md">
                <p className="w-full font-body-lg leading-relaxed text-on-surface">{meansBody}</p>
                <div className="grid gap-space-sm sm:grid-cols-3">
                  {results.highlights.map((h) => (
                    <div key={h.key} className="rounded bg-surface-container-low p-space-md">
                      <div className="flex items-start gap-space-sm">
                        <span className="mt-0.5 text-tertiary-container">✓</span>
                        <div>
                          <span className="font-headline-sm text-on-surface">{h.title}</span>
                          <span className="mt-1 block font-body-sm text-on-surface-variant">{h.value}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded bg-surface-container p-space-md">
                <div className="flex flex-col gap-space-sm">
                  <span className="font-label-caps uppercase tracking-wider text-outline">{t("ires.shelterParams")}</span>
                  {[
                    [t("ires.footprint"), cfg.footprint_label],
                    [t("res.heat.walls"), cfg.wall_label],
                    [t("res.heat.roof"), cfg.roof_label],
                    [t("res.heat.floor"), cfg.floor_label],
                    [t("ires.glazing"), cfg.glazing_label],
                    ["ACH", String(cfg.air_changes_per_hour)],
                    [t("cfg.gain.derived"), `${cfg.internal_gain_W} W`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-space-md py-space-2xs">
                      <span className="font-body-sm text-on-surface-variant">{k}</span>
                      <span className="text-right font-mono-metric-sm text-on-surface">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {!isReal ? (
              <p className="mt-space-md font-body-sm text-on-surface-variant">{t("common.mockNote")}</p>
            ) : null}
          </div>
        </div>
      </main>
    </main>
  );
}
