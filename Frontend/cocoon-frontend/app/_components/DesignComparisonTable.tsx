"use client";

import SectionCard from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

export default function DesignComparisonTable() {
  const t = useT();
  const { results, isReal } = useResults();
  const rows = results.comparison ?? [];
  if (!rows.length) return null;

  return (
    <SectionCard title={t("res.compare.title")} tag={t("res.compare.tag")}>
      {!isReal ? <MockNote className="mb-space-md" /> : null}
      <div className="overflow-x-auto rounded-lg bg-surface-container-low">
        <table className="w-full text-left font-mono-metric-sm">
          <thead className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-space-sm py-space-xs">{t("res.compare.rank")}</th>
              <th className="px-space-sm py-space-xs">{t("res.compare.id")}</th>
              <th className="px-space-sm py-space-xs">{t("res.compare.geom")}</th>
              <th className="px-space-sm py-space-xs">A/V</th>
              <th className="px-space-sm py-space-xs">WWR%</th>
              <th className="px-space-sm py-space-xs">{t("res.compare.score")}</th>
              <th className="px-space-sm py-space-xs">T_min</th>
              <th className="px-space-sm py-space-xs">T_max</th>
              <th className="px-space-sm py-space-xs">swing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.design_id}
                className={`border-t border-surface-container-high/50 ${r.shortlisted ? "bg-tertiary-container/10" : ""}`}
              >
                <td className="px-space-sm py-space-xs text-on-surface">{r.rank}</td>
                <td className="px-space-sm py-space-xs font-semibold text-on-surface">
                  #{r.design_id}
                  {r.pareto ? (
                    <span className="ml-space-2xs rounded bg-primary px-space-2xs py-[1px] text-[9px] text-on-primary">
                      {t("res.compare.pareto")}
                    </span>
                  ) : r.shortlisted ? (
                    <span className="ml-space-2xs rounded bg-tertiary-fixed px-space-2xs py-[1px] text-[9px] text-on-tertiary-fixed">
                      {t("res.compare.shortlisted")}
                    </span>
                  ) : null}
                </td>
                <td className="px-space-sm py-space-xs">{r.geometry_label}</td>
                <td className="px-space-sm py-space-xs">{r.av_ratio}</td>
                <td className="px-space-sm py-space-xs">{r.wwr_percent}</td>
                <td className="px-space-sm py-space-xs font-semibold text-primary">{r.comfort_score}</td>
                <td className="px-space-sm py-space-xs">{r.T_min_C}</td>
                <td className="px-space-sm py-space-xs">{r.T_max_C}</td>
                <td className="px-space-sm py-space-xs">{r.swing_C}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
