"use client";

import SectionCard, { Stat } from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

export default function SolarEnergyPanel() {
  const t = useT();
  const { results, isReal } = useResults();
  const s = results.features.solar;

  const daily = s.daily_MJ;
  const hourly = s.hourly_gain_kW;
  const maxD = Math.max(...daily, 1);
  const maxH = Math.max(...hourly, 0.001);
  const totalH = hourly.reduce((a, b) => a + b, 0) || 1;
  const cumPts = hourly
    .reduce<{ pts: string[]; run: number }>(
      (acc, h, i) => {
        const run = acc.run + h;
        acc.pts.push(`${(i / Math.max(hourly.length - 1, 1)) * 100},${100 - (run / totalH) * 100}`);
        return { pts: acc.pts, run };
      },
      { pts: [], run: 0 },
    )
    .pts.join(" ");

  const hourlyPts = hourly
    .map((h, i) => `${(i / Math.max(hourly.length - 1, 1)) * 100},${100 - (h / maxH) * 100}`)
    .join(" ");

  return (
    <SectionCard title={t("res.solar.title")} tag={t("res.solar.tag")}>
      {!isReal ? <MockNote className="mb-space-md" /> : null}

      <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t("res.solar.total")} value={s.total_energy_MJ.toFixed(0)} unit="MJ" />
        <Stat label={t("res.solar.peakGain")} value={s.peak_gain_W.toFixed(0)} unit="W" tone="text-secondary" />
        <Stat label={t("res.solar.peakIrr")} value={s.peak_irradiance_W_m2.toFixed(0)} unit="W/m²" />
        <Stat label={t("res.solar.capFactor")} value={s.capacity_factor_percent.toFixed(1)} unit="%" />
        <Stat label={t("res.solar.corr")} value={s.solar_temp_correlation.toFixed(2)} />
      </div>

      <div className="mt-space-lg grid gap-space-lg lg:grid-cols-2">
        <div className="rounded-lg bg-surface-container-low p-space-md">
          <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            {t("res.solar.hourlyTitle")}
          </span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-space-sm h-28 w-full">
            {/* filled area */}
            <polygon
              points={`0,100 ${hourlyPts} 100,100`}
              fill="var(--color-secondary-container, #9ecaff)"
              fillOpacity="0.35"
            />
            {/* line on top */}
            <polyline
              points={hourlyPts}
              fill="none"
              stroke="var(--color-secondary, #4a90d9)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="rounded-lg bg-surface-container-low p-space-md">
          <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            {t("res.solar.cumTitle")}
          </span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-space-sm h-28 w-full">
            <polyline points={cumPts} fill="none" stroke="#fe932c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>

      {daily.length <= 1 ? (
        <p className="mt-space-lg rounded-lg bg-surface-container-low p-space-md font-body-sm text-on-surface-variant">
          {t("res.solar.singleDay")}
        </p>
      ) : (
      <div className="mt-space-lg rounded-lg bg-surface-container-low p-space-md">
        <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
          {t("res.solar.dailyTitle")}
        </span>
        <div className="mt-space-sm flex h-24 items-end gap-space-xs">
          {daily.map((d, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-space-2xs">
              <div className="min-h-[2px] w-full rounded-t bg-secondary" style={{ height: `${(d / maxD) * 90}%` }} />
              <span className="font-mono-metric-sm text-outline">{d.toFixed(0)}</span>
            </div>
          ))}
        </div>
        <span className="mt-space-xs block font-mono-metric-sm text-outline">MJ / day</span>
      </div>
      )}
    </SectionCard>
  );
}
