"use client";

import SectionCard from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

export default function ReliabilityPanel() {
  const t = useT();
  const { results, isReal } = useResults();
  const rel = results.reliability;
  if (!rel) return null;

  const sens = rel.sensitivity;
  const pts = rel.pareto_points;
  const maxSwing = Math.max(...pts.map((p) => p.swing_C), 1);
  const minT = Math.min(...pts.map((p) => p.T_min_C), 0);
  const maxT = Math.max(...pts.map((p) => p.T_min_C), 1);
  const span = maxT - minT || 1;

  return (
    <SectionCard title={t("res.rel.title")} tag={t("res.rel.tag")}>
      {!isReal ? <MockNote className="mb-space-md" /> : null}

      <div className="grid gap-space-md sm:grid-cols-3">
        <div className="rounded-lg bg-surface-container-low p-space-md">
          <span className="block font-body-sm text-on-surface-variant">{t("res.rel.verdict")}</span>
          <span className="font-headline-sm text-primary">
            {rel.verdict.split(":")[0]}
          </span>
          <p className="mt-space-2xs font-body-sm text-on-surface-variant">{rel.verdict}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low p-space-md">
          <span className="block font-body-sm text-on-surface-variant">{t("res.rel.shortlist")}</span>
          <span className="font-mono-metric-md font-semibold text-on-surface">
            [{rel.shortlist_ids.join(", ")}]
          </span>
        </div>
        <div className="rounded-lg bg-surface-container-low p-space-md">
          <span className="block font-body-sm text-on-surface-variant">{t("res.rel.weatherStable")}</span>
          <span className={`font-headline-sm ${rel.top3_stable_across_weather ? "text-tertiary-container" : "text-error"}`}>
            {rel.top3_stable_across_weather ? "✓ true" : "✕ false"}
          </span>
        </div>
      </div>

      <div className="mt-space-lg grid gap-space-lg lg:grid-cols-2">
        <div className="rounded-lg bg-surface-container-low p-space-md">
          <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            {t("res.rel.sensTitle")}
          </span>
          <div className="mt-space-sm space-y-space-xs">
            {sens.map((s) => (
              <div key={s.design_id} className="flex items-center gap-space-sm">
                <span className="w-10 font-mono-metric-sm text-on-surface-variant">#{s.design_id}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-surface-container-high">
                  <div
                    className={s.top3_pct >= 50 ? "h-full bg-tertiary-container" : "h-full bg-outline-variant"}
                    style={{ width: `${s.top3_pct}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono-metric-sm text-on-surface">{s.top3_pct}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-surface-container-low p-space-md">
          <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            {t("res.rel.paretoTitle")}
          </span>
          <svg viewBox="0 0 100 70" className="mt-space-sm h-40 w-full">
            {pts.map((p) => (
              <g key={p.design_id}>
                <circle
                  cx={(p.swing_C / maxSwing) * 88 + 6}
                  cy={62 - ((p.T_min_C - minT) / span) * 55}
                  r={p.pareto ? 3.5 : 2.5}
                  fill={p.pareto ? "#c0392b" : "#4059aa"}
                  fillOpacity={p.pareto ? 1 : 0.5}
                />
                <text
                  x={(p.swing_C / maxSwing) * 88 + 9}
                  y={62 - ((p.T_min_C - minT) / span) * 55}
                  fontSize="4"
                  fill="#757682"
                >
                  #{p.design_id}
                </text>
              </g>
            ))}
            <text x="2" y="68" fontSize="3.5" fill="#757682">swing →</text>
            <text x="2" y="6" fontSize="3.5" fill="#757682">↑ T_min</text>
          </svg>
        </div>
      </div>
    </SectionCard>
  );
}
