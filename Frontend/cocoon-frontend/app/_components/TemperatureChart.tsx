"use client";

import { useMemo, useState } from "react";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

/**
 * DRDO Output 1 — plots the real indoor/outdoor hourly series from
 * `results.features.temperature.series`, with the comfort band from
 * `results.comfort`. Hover a column to read the values at that hour.
 */
export default function TemperatureChart() {
  const t = useT();
  const { results } = useResults();
  const s = results.features.temperature.series;
  const c = results.comfort;

  const n = s.t_hours.length;
  const [cursor, setCursor] = useState(Math.floor(n * 0.375));

  const { path, geom, yTicks, xTicks } = useMemo(() => {
    const all = [...s.indoor_C, ...s.outdoor_C, c.band_hi_C, c.band_lo_C];
    const lo = Math.floor(Math.min(...all) / 5) * 5;
    const hi = Math.ceil(Math.max(...all) / 5) * 5;
    const W = 1000;
    const H = 300;
    const x = (i: number) => (i / (n - 1)) * W;
    const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
    const line = (arr: number[]) =>
      arr.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

    const yTickVals: number[] = [];
    for (let v = lo; v <= hi; v += Math.max(5, Math.round((hi - lo) / 5 / 5) * 5)) yTickVals.push(v);

    const totalH = s.t_hours[n - 1] - s.t_hours[0];
    const step = totalH <= 48 ? 12 : totalH <= 96 ? 24 : 48;
    const xTickVals: { h: number; frac: number }[] = [];
    for (let h = s.t_hours[0]; h <= s.t_hours[n - 1]; h += step)
      xTickVals.push({ h, frac: (h - s.t_hours[0]) / (totalH || 1) });

    return {
      geom: { W, H, x, y, lo, hi },
      path: { indoor: line(s.indoor_C), outdoor: line(s.outdoor_C) },
      yTicks: yTickVals.map((v) => ({ v, y: y(v) })),
      xTicks: xTickVals,
    };
  }, [s, c, n]);

  const bandTop = geom.y(c.band_hi_C);
  const bandBot = geom.y(c.band_lo_C);

  return (
    <div className="relative overflow-hidden rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
      <div className="flex flex-col justify-between gap-space-sm pb-space-sm md:flex-row md:items-center">
        <div className="flex items-center gap-space-sm">
          <span className="font-headline-sm text-on-surface">{t("ires.chartTitle")}</span>
          <span className="rounded bg-surface-container-high px-space-xs py-space-2xs font-mono-metric-sm text-primary">
            {n} h · 1 h step
          </span>
        </div>
        <div className="flex items-center gap-space-md rounded bg-surface-container px-space-md py-space-xs shadow-sm">
          <span className="font-mono-metric-md font-semibold text-on-surface">T+{s.t_hours[cursor]}h</span>
          <span className="text-outline-variant">|</span>
          <span className="flex items-center gap-space-2xs">
            <span className="h-2 w-2 rounded-full bg-secondary-container" />
            <span className="font-label-caps uppercase text-on-surface-variant">{t("ires.indoor")}</span>
            <span className="font-mono-metric-md font-semibold text-secondary">
              {s.indoor_C[cursor].toFixed(1)}°C
            </span>
          </span>
          <span className="text-outline-variant">|</span>
          <span className="flex items-center gap-space-2xs">
            <span className="h-2 w-2 rounded-full bg-primary-container" />
            <span className="font-label-caps uppercase text-on-surface-variant">{t("ires.outdoor")}</span>
            <span className="font-mono-metric-md font-semibold text-primary">
              {s.outdoor_C[cursor].toFixed(1)}°C
            </span>
          </span>
        </div>
      </div>

      <div className="relative h-80 w-full">
        <svg
          viewBox="-46 -8 1090 340"
          className="h-full w-full"
          preserveAspectRatio="none"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const f = (e.clientX - r.left) / r.width;
            setCursor(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
          }}
        >
          <rect x={0} y={Math.min(bandTop, bandBot)} width={geom.W} height={Math.abs(bandBot - bandTop)} fill="#85f8c4" fillOpacity="0.22" />
          {yTicks.map((tk) => (
            <g key={tk.v}>
              <line x1={0} x2={geom.W} y1={tk.y} y2={tk.y} stroke="#dce9ff" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
              <text x={-8} y={tk.y + 3} textAnchor="end" fontSize="10" fill="#757682" fontFamily="JetBrains Mono">
                {tk.v}°C
              </text>
            </g>
          ))}
          <line x1={0} x2={geom.W} y1={geom.y(0)} y2={geom.y(0)} stroke="#c0392b" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
          {xTicks.map((tk) => (
            <text key={tk.h} x={tk.frac * geom.W} y={geom.H + 18} textAnchor="middle" fontSize="10" fill="#757682" fontFamily="JetBrains Mono">
              T+{tk.h}h
            </text>
          ))}
          <path d={path.outdoor} fill="none" stroke="#1e3a8a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={path.indoor} fill="none" stroke="#fe932c" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <line x1={(cursor / (n - 1)) * geom.W} x2={(cursor / (n - 1)) * geom.W} y1={0} y2={geom.H} stroke="#00236f" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <p className="mt-space-xs font-body-sm text-on-surface-variant">
        Comfort band {c.band_lo_C}–{c.band_hi_C} °C · {c.hours_in_band_pct.toFixed(0)}% of hours inside it
      </p>
    </div>
  );
}
