"use client";

import SectionCard, { Stat } from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

const PATHS = [
  { k: "wall", key: "res.heat.walls", color: "bg-error/70" },
  { k: "roof", key: "res.heat.roof", color: "bg-primary-container" },
  { k: "floor", key: "res.heat.floor", color: "bg-secondary-container/60" },
  { k: "window", key: "res.heat.windows", color: "bg-tertiary-container" },
  { k: "infiltration", key: "res.heat.infil", color: "bg-primary" },
] as const;

export default function HeatFlowPanel() {
  const t = useT();
  const { results, isReal } = useResults();
  const h = results.features.heatflow;

  return (
    <SectionCard title={t("res.heat.title")} tag={t("res.heat.tag")}>
      {!isReal ? <MockNote className="mb-space-md" /> : null}

      <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t("res.heat.totalLoss")} value={(h.total_heat_loss_Wh / 1000).toFixed(0)} unit="kWh" />
        <Stat label={t("res.heat.peakLoss")} value={h.peak_hourly_loss_W.toFixed(0)} unit="W" tone="text-error" />
        <Stat label={t("res.heat.avgLoss")} value={h.avg_hourly_loss_W.toFixed(0)} unit="W" />
        <Stat label={t("res.heat.peakDt")} value={h.peak_temp_difference_C.toFixed(1)} unit="°C" tone="text-secondary" />
        <Stat label={t("res.heat.avgDt")} value={h.avg_temp_difference_C.toFixed(1)} unit="°C" />
      </div>

      <div className="mt-space-lg rounded-lg bg-surface-container-low p-space-md">
        <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
          {t("res.heat.split")}
        </span>
        <div className="mt-space-sm flex h-6 w-full overflow-hidden rounded">
          {PATHS.map((p) => (
            <div
              key={p.k}
              className={p.color}
              style={{ width: `${h.split_percent[p.k]}%` }}
              title={`${h.split_percent[p.k]}%`}
            />
          ))}
        </div>
        <div className="mt-space-sm grid gap-space-xs sm:grid-cols-3 lg:grid-cols-5">
          {PATHS.map((p) => (
            <div key={p.k} className="flex items-center gap-space-2xs font-mono-metric-sm text-on-surface">
              <span className={`h-2.5 w-2.5 rounded ${p.color}`} />
              <span>{t(p.key)}</span>
              <span className="text-on-surface-variant">{h.split_percent[p.k].toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-space-lg rounded-lg bg-surface-container-low p-space-md">
        <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
          {t("res.heat.stackTitle")}
        </span>
        {(() => {
          const by = h.hourly_by_path;
          const n = by.wall.length || 1;
          const totals = Array.from({ length: n }, (_, i) =>
            PATHS.reduce((s, p) => s + (by[p.k]?.[i] ?? 0), 0),
          );
          const max = Math.max(...totals, 1);
          return (
            <div className="mt-space-sm flex h-28 items-end gap-px">
              {Array.from({ length: n }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-full flex-1 flex-col-reverse justify-start"
                  title={`${totals[i].toFixed(0)} W`}
                >
                  {PATHS.map((p) => (
                    <div
                      key={p.k}
                      className={`${p.color} min-h-[1px]`}
                      style={{ height: `${((by[p.k]?.[i] ?? 0) / max) * 90}%` }}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
        <p className="mt-space-sm font-body-sm text-on-surface-variant">{t("res.heat.signNote")}</p>
      </div>
    </SectionCard>
  );
}
