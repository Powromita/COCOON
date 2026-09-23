"use client";

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "@/app/_components/SiteHeader";
import ResolvedConfigStrip from "@/app/_components/ResolvedConfigStrip";
import SolarEnergyPanel from "@/app/_components/SolarEnergyPanel";
import HeatFlowPanel from "@/app/_components/HeatFlowPanel";
import TemperatureChart from "@/app/_components/TemperatureChart";
import RecommendationCard from "@/app/_components/RecommendationCard";
import InfoTip from "@/app/_components/InfoTip";
import { ResultsProvider, useResults } from "@/app/_components/ResultsProvider";
import RunProgress from "@/app/_components/RunProgress";
import SimulationStatus from "@/app/individual/results/_components/SimulationStatus";
import AnsysComparisonSection from "@/app/individual/results/_components/AnsysComparisonSection";
import { downloadReport } from "@/app/_lib/generateReport";
import {
  deriveAnalysis,
  deriveComfort,
  deriveLocation,
  deriveMeans,
  deriveTimestamps,
} from "@/app/_lib/simulation";
import {
  fmtCoord,
  fmtDateRange,
  fmtDayTime,
  fmtDuration,
  fmtPercent,
  fmtSteps,
  fmtTemp,
  fmtTimestamp,
  NA,
} from "@/app/_lib/format";
import { useT, useTfmt } from "@/app/_lib/i18n";

export default function IndividualResultsPage() {
  return (
    <ResultsProvider demoMode="optimize">
      <IndividualResultsBody />
    </ResultsProvider>
  );
}

function IndividualResultsBody() {
  const t = useT();
  const tf = useTfmt();
  const { results, isReal, createdAt, phase } = useResults();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    try {
      downloadReport(results);
    } finally {
      setTimeout(() => setDownloading(false), 1500);
    }
  };
  const temp = results.features.temperature;
  const cfg = results.config_echo;
  const heat = results.heating;

  const loc = deriveLocation(results);
  const analysis = deriveAnalysis(results);
  const comfort = deriveComfort(results);
  const timestamps = deriveTimestamps(results);
  const meansLines = deriveMeans(results);

  const whenOf = (i: number | null): string =>
    i != null && timestamps?.[i]
      ? fmtDayTime(timestamps[i], loc.timezone)
      : i != null
        ? `hour ${i}`
        : NA;

  const vsBound = (v: number | null, bound: number, kind: "lo" | "hi"): string => {
    if (v == null || !Number.isFinite(v)) return "";
    if (v >= comfort.lo && v <= comfort.hi) return t("ires.withinComfort");
    const d = v - bound;
    const mag = `${Math.abs(d).toFixed(1)}°C ${d < 0 ? "below" : "above"}`;
    return tf(kind === "lo" ? "ires.vsComfortLo" : "ires.vsComfortHi", { delta: mag });
  };

  const cards: { labelKey: string; value: string; lines: string[]; tone: string }[] = [
    {
      labelKey: "ires.minTemp",
      value: fmtTemp(comfort.minC ?? temp.T_min_C, { signed: true }),
      lines: [
        comfort.minIdx != null ? tf("ires.occursAt", { when: whenOf(comfort.minIdx) }) : "",
        vsBound(comfort.minC ?? temp.T_min_C, comfort.lo, "lo"),
      ].filter(Boolean),
      tone: "text-primary",
    },
    {
      labelKey: "ires.maxTemp",
      value: fmtTemp(comfort.maxC ?? temp.T_max_C, { signed: true }),
      lines: [
        comfort.maxIdx != null ? tf("ires.occursAt", { when: whenOf(comfort.maxIdx) }) : "",
        vsBound(comfort.maxC ?? temp.T_max_C, comfort.hi, "hi"),
      ].filter(Boolean),
      tone: "text-secondary",
    },
    {
      labelKey: "ires.avgTemp",
      value: fmtTemp(temp.T_mean_C, { signed: true }),
      lines: [
        tf("ires.dtVsOutdoor", {
          delta: Number.isFinite(results.features.heatflow.avg_temp_difference_C)
            ? `${results.features.heatflow.avg_temp_difference_C.toFixed(1)}°C`
            : NA,
        }),
      ],
      tone: "text-primary-container",
    },
    {
      labelKey: "ires.comfortHours",
      value:
        comfort.comfortPct != null
          ? `${fmtPercent(comfort.comfortPct)}`
          : NA,
      lines: [
        comfort.validHours
          ? `${comfort.inBandHours} of ${comfort.validHours} valid hours`
          : t("common.awaitingSimulation"),
        comfort.longestBadRunHours
          ? `longest spell outside band ${comfort.longestBadRunHours} h`
          : "",
      ].filter(Boolean),
      tone: "text-on-surface",
    },
    {
      labelKey: "ires.dailyRange",
      value:
        comfort.meanDailyRangeC != null ? `${comfort.meanDailyRangeC.toFixed(1)}°C` : NA,
      lines: ["mean of each day's max − min"],
      tone: "text-on-surface",
    },
    {
      labelKey: "ires.fuel",
      value: Number.isFinite(heat.fuel_litres_per_day)
        ? `~${heat.fuel_litres_per_day.toFixed(1)} L/day`
        : NA,
      lines: [heat.fuel_note || ""].filter(Boolean),
      tone: "text-on-surface",
    },
  ];


  const designName =
    results.recommendation != null
      ? `Design #${results.recommendation.chosen_design_id}`
      : NA;

  const subtitleParts = [
    loc.name,
    `${fmtCoord(loc.latitude, "lat")}, ${fmtCoord(loc.longitude, "lon")}`,
    analysis.startISO && analysis.endISO
      ? fmtDateRange(analysis.startISO, analysis.endISO, loc.timezone)
      : t("common.awaitingSimulation"),
    analysis.totalHours != null ? fmtSteps(analysis.totalHours) : NA,
    designName,
    createdAt ? `updated ${fmtTimestamp(createdAt, loc.timezone)}` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-surface text-on-surface antialiased">
      <SiteHeader mode="Individual" active="results" />

      <main className="w-full bg-surface pt-16">
        <div className="w-full border-b border-surface-container-high bg-surface-container-lowest shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-space-md px-space-lg py-space-md md:flex-row md:items-start">
            <div className="flex min-w-0 flex-col gap-space-2xs">
              <div className="flex flex-wrap items-center gap-space-xs">
                <span className="font-label-caps uppercase tracking-wider text-primary">{t("ires.eyebrow")}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary-container" />
                <span className="font-mono-metric-sm text-outline">RUN {results.run_id}</span>
                <SimulationStatus />
              </div>
              <h1 className="font-display-xl tracking-tight text-on-surface">{analysis.title}</h1>
              <p className="w-full min-w-0 font-body-md text-on-surface-variant">
                {subtitleParts.join(" • ")}
              </p>
            </div>
            <div className="flex items-center gap-space-sm self-start">
              <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high px-space-sm py-space-xs shadow-sm">
                <span className="text-primary">⌂</span>
                <span className="font-headline-sm font-body-md text-on-surface">{t("hdr.mode.Individual")}</span>
                <span className="text-outline-variant">|</span>
                <Link
                  href="/individual/configure"
                  className="font-mono-metric-sm text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {t("common.switch")}
                </Link>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading || phase === "submitting" || phase === "running"}
                className={`rounded px-space-md py-space-xs shadow-sm transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  downloading
                    ? "bg-tertiary-container text-on-tertiary-container cursor-wait"
                    : phase === "submitting" || phase === "running"
                    ? "pointer-events-none bg-surface-container-high text-on-surface-variant"
                    : "bg-primary text-on-primary hover:bg-primary-container active:scale-95"
                }`}
              >
                {downloading ? "⏳ Generating…" : `⬇ ${t("ires.download")}`}
              </button>
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
                <span className="font-mono-metric-sm text-on-surface">
                  {t("ires.legComfort")} {fmtTemp(comfort.lo)}–{fmtTemp(comfort.hi)}
                </span>
              </div>
            </div>
          </div>

          <TemperatureChart />

          <AnsysComparisonSection />

          <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <div key={card.labelKey} className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
                <div className="flex items-center justify-between pb-space-xs">
                  <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">{t(card.labelKey)}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-high text-primary">⌂</span>
                </div>
                <div className="py-space-xs">
                  <div className={`font-mono-metric-lg font-semibold tracking-tight ${card.tone}`}>{card.value}</div>
                </div>
                <div className="mt-space-xs space-y-space-2xs rounded bg-surface-container-low px-space-sm py-space-xs font-body-sm text-on-surface-variant">
                  {card.lines.length ? card.lines.map((l) => <div key={l}>{l}</div>) : <div>{NA}</div>}
                </div>
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
              {comfort.comfortPct != null && comfort.comfortPct > 40 ? (
                <div className="flex items-center gap-space-xs rounded-full bg-tertiary-container/10 px-space-sm py-space-2xs">
                  <span className="h-2 w-2 rounded-full bg-tertiary-container" />
                  <span className="font-mono-metric-sm text-tertiary-container">{t("ires.certified")}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-space-lg grid gap-space-xl lg:grid-cols-[1.5fr_0.8fr]">
              <div className="flex flex-col gap-space-md">
                {meansLines.length ? (
                  <ul className="flex w-full flex-col gap-space-sm font-body-lg leading-relaxed text-on-surface">
                    {meansLines.map((line) => (
                      <li key={line} className="flex gap-space-sm">
                        <span aria-hidden className="mt-1 text-primary">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-body-lg text-on-surface-variant">{t("common.awaitingSimulation")}</p>
                )}
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
                  <span className="flex items-center gap-space-2xs font-label-caps uppercase tracking-wider text-outline">
                    {t("ires.shelterParams")}
                    <InfoTip label={t("ires.shelterParams")} text={t("common.tip.analysisPeriod")} />
                  </span>
                  {(
                    [
                      [t("ires.footprint"), cfg.footprint_label || NA],
                      [t("res.heat.walls"), cfg.wall_label || NA],
                      [t("res.heat.roof"), cfg.roof_label || NA],
                      [t("res.heat.floor"), cfg.floor_label || NA],
                      [t("ires.glazing"), cfg.glazing_label || NA],
                      [
                        t("cfg.gain.derived"),
                        Number.isFinite(cfg.internal_gain_W) ? `${cfg.internal_gain_W} W` : NA,
                      ],
                      [
                        "Analysis period",
                        analysis.startISO && analysis.endISO
                          ? `${fmtDateRange(analysis.startISO, analysis.endISO, loc.timezone)} (${fmtDuration(analysis.totalHours)})`
                          : NA,
                      ],
                      ["Weather data", loc && "weather_source" in loc ? String((loc as { weather_source?: string }).weather_source) : "NASA POWER hourly"],
                      ["Location", `${loc.name} — ${fmtCoord(loc.latitude, "lat")}, ${fmtCoord(loc.longitude, "lon")}`],
                    ] as [string, string][]
                  ).map(([k, v]) => (
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
