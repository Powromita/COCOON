"use client";

import SectionCard from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { artifactUrl } from "@/app/_lib/api";
import { deriveWhy } from "@/app/_lib/simulation";
import { useT } from "@/app/_lib/i18n";

export default function RecommendationCard() {
  const t = useT();
  const { results, isReal } = useResults();
  const rec = results.recommendation;
  if (!rec) return null;
  const c = rec.chosen;

  // "Recommended" only when more than one design was actually ranked; a single
  // evaluated design is labelled "Evaluated Design" and never called "best".
  const evaluatedCount = rec.designs_evaluated ?? results.comparison?.length ?? 0;
  const multiple = evaluatedCount > 1;
  const why = deriveWhy(results);

  const reportHref =
    results.report_md_url && results.report_md_url !== "#mock-report"
      ? artifactUrl(results.run_id, "REPORT.md")
      : undefined;

  return (
    <SectionCard title={multiple ? t("res.rec.title") : t("res.rec.titleSingle")} tag={t("res.rec.tag")}>
      {!isReal ? <MockNote className="mb-space-md" /> : null}

      <div className="grid gap-space-lg lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-space-sm">
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="rounded-full bg-primary px-space-sm py-space-2xs font-headline-sm text-on-primary">
              {multiple ? t("res.rec.chosen") : t("res.rec.evaluated")} · #{rec.chosen_design_id}
              {rec.rank != null && multiple ? ` · rank ${rec.rank}` : ""}
            </span>
            {rec.runner_up_id != null ? (
              <span className="rounded-full bg-surface-container px-space-sm py-space-2xs font-mono-metric-sm text-on-surface-variant">
                {t("res.rec.runnerUp")} · #{rec.runner_up_id}
              </span>
            ) : null}
            <span
              className={`rounded-full px-space-sm py-space-2xs font-mono-metric-sm ${
                rec.thermal_tie ? "bg-secondary-fixed text-secondary" : "bg-tertiary-fixed text-on-tertiary-fixed"
              }`}
            >
              {rec.thermal_tie ? t("res.rec.thermalTie") : t("res.rec.clearLeader")}
            </span>
          </div>

          <dl className="grid gap-space-2xs rounded-lg bg-surface-container-low p-space-md font-mono-metric-sm">
            {[
              ["L × W × H", c.geometry_label],
              [t("cfg.layers.wall"), c.walls_label],
              [t("cfg.layers.roof"), c.roof_label],
              [t("cfg.layers.floor"), c.floor_label],
              [t("res.heat.windows"), c.windows_label],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-space-md">
                <dt className="text-on-surface-variant">{k}</dt>
                <dd className="text-right text-on-surface">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-3 gap-space-xs">
            <div className="rounded bg-surface-container-low p-space-sm">
              <span className="block font-body-sm text-on-surface-variant">{t("res.compare.score")}</span>
              <span className="font-mono-metric-md font-bold text-primary">{c.comfort_score}</span>
            </div>
            <div className="rounded bg-surface-container-low p-space-sm">
              <span className="block font-body-sm text-on-surface-variant">T_min</span>
              <span className="font-mono-metric-md font-bold text-primary">{c.T_min_C} °C</span>
            </div>
            <div className="rounded bg-surface-container-low p-space-sm">
              <span className="block font-body-sm text-on-surface-variant">{t("res.log.mass")}</span>
              <span className="font-mono-metric-md font-bold text-primary">{c.envelope_mass_t} t</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-space-md rounded-lg bg-surface-container p-space-md">
          <div>
            <span className="font-label-caps uppercase tracking-wider text-outline">
              {t("res.rec.justification")}
            </span>
            <p className="mt-space-xs font-body-md leading-relaxed text-on-surface">
              {rec.justification || t("common.notAvailable")}
            </p>
            {why.length ? (
              <ul className="mt-space-sm space-y-space-2xs">
                {why.map((line) => (
                  <li key={line} className="flex gap-space-2xs font-body-sm text-on-surface-variant">
                    <span aria-hidden className="text-tertiary-container">✓</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {rec.improvement_suggestions?.length ? (
              <div className="mt-space-sm">
                <span className="font-label-caps uppercase tracking-wider text-outline">
                  {t("res.rec.improve")}
                </span>
                <ul className="mt-space-2xs space-y-space-2xs">
                  {rec.improvement_suggestions.map((line) => (
                    <li key={line} className="flex gap-space-2xs font-body-sm text-on-surface-variant">
                      <span aria-hidden className="text-secondary">→</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <a
            href={reportHref ?? "#"}
            aria-disabled={!reportHref}
            className={`rounded px-space-md py-space-sm text-center font-body-md font-semibold ${
              reportHref
                ? "bg-primary text-on-primary hover:bg-primary-container"
                : "pointer-events-none bg-surface-container-high text-on-surface-variant"
            }`}
          >
            {t("res.rec.download")}
          </a>
        </div>
      </div>
    </SectionCard>
  );
}
