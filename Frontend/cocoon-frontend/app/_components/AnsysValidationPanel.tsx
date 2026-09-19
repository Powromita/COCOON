"use client";

import SectionCard from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

const DESIGN_COLORS = ["#4059aa", "#c0392b", "#1b7837", "#b5651d"];

/** RC vs ANSYS indoor-temperature overlay — solid = FEM, dashed = RC. */
function ValidationChart({
  series,
  maeById,
}: {
  series: NonNullable<import("@/app/_lib/types").AnsysResult["series"]>;
  maeById: Record<number, number>;
}) {
  const t = useT();
  // scale to the indoor RC/FEM curves only — that agreement is the point;
  // the outdoor line is drawn as faint context and allowed to clip
  const all: number[] = [];
  series.designs.forEach((d) => all.push(...d.rc_C, ...d.ansys_C));
  const pad = 1;
  const lo = Math.floor((Math.min(...all) - pad) / 2) * 2;
  const hi = Math.ceil((Math.max(...all) + pad) / 2) * 2;
  const n = series.t_hours.length;
  const W = 1000;
  const H = 320;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const line = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += Math.max(2, Math.round((hi - lo) / 6 / 2) * 2)) yTicks.push(v);
  const step = n <= 26 ? 6 : n <= 50 ? 12 : 24;
  const xTicks: number[] = [];
  for (let h = 0; h < n; h += step) xTicks.push(h);

  return (
    <div className="rounded-lg bg-surface-container-low p-space-md">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
          {t("res.ansys.overlayTitle")}
        </span>
        <div className="flex flex-wrap items-center gap-space-md font-mono-metric-sm text-on-surface-variant">
          <span className="flex items-center gap-space-2xs">
            <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="2" /></svg>
            {t("res.ansys.fem")}
          </span>
          <span className="flex items-center gap-space-2xs">
            <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" /></svg>
            {t("res.ansys.rc")}
          </span>
        </div>
      </div>

      <div className="mt-space-sm overflow-x-auto">
        <svg viewBox="-46 -10 1080 360" className="h-72 w-full min-w-[520px]" preserveAspectRatio="none">
          <clipPath id="ansysClip"><rect x={0} y={-10} width={W} height={H + 10} /></clipPath>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="#dce9ff" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
              <text x={-8} y={y(v) + 3} textAnchor="end" fontSize="11" fill="#757682" fontFamily="JetBrains Mono">{v}°</text>
            </g>
          ))}
          {xTicks.map((h) => (
            <text key={h} x={x(h)} y={H + 20} textAnchor="middle" fontSize="11" fill="#757682" fontFamily="JetBrains Mono">
              T+{h}h
            </text>
          ))}

          <g clipPath="url(#ansysClip)">
            {series.designs.map((d, di) => {
              const c = DESIGN_COLORS[di % DESIGN_COLORS.length];
              return (
                <g key={d.design_id}>
                  <path d={line(d.ansys_C)} fill="none" stroke={c} strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
                  <path d={line(d.rc_C)} fill="none" stroke={c} strokeWidth="2.2" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="mt-space-sm flex flex-wrap gap-space-md">
        {series.designs.map((d, di) => (
          <span key={d.design_id} className="flex items-center gap-space-2xs font-mono-metric-sm text-on-surface">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DESIGN_COLORS[di % DESIGN_COLORS.length] }} />
            #{d.design_id}
            {maeById[d.design_id] != null ? (
              <span className="text-on-surface-variant">· {t("res.ansys.gap")} {maeById[d.design_id].toFixed(2)}°C</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AnsysValidationPanel() {
  const t = useT();
  const { results, isReal } = useResults();
  const a = results.ansys;
  if (!a || (!a.ran && !a.rows?.length)) return null;

  const maeById: Record<number, number> = {};
  a.rows.forEach((r) => (maeById[r.design_id] = r.MAE_C));

  return (
    <SectionCard title={t("res.ansys.title")} tag={t("res.ansys.tag")}>
      {!isReal ? <MockNote className="mb-space-md" /> : null}

      <div className="grid gap-space-lg lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg bg-surface-container-high p-space-md">
          <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            {t("res.ansys.contour")}
          </span>
          <div className="mt-space-sm flex h-52 items-center justify-center overflow-hidden rounded bg-surface-container-lowest">
            {a.contour_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.contour_url} alt="ANSYS temperature contour" className="h-full w-full object-contain" />
            ) : (
              <svg viewBox="0 0 220 160" className="h-44">
                <defs>
                  <linearGradient id="thermGrad" x1="0" x2="1">
                    <stop offset="0" stopColor="#1e3a8a" />
                    <stop offset="0.5" stopColor="#004a32" />
                    <stop offset="0.8" stopColor="#fe932c" />
                    <stop offset="1" stopColor="#c0392b" />
                  </linearGradient>
                </defs>
                <polygon points="30,120 110,150 190,120 110,90" fill="url(#thermGrad)" opacity="0.85" stroke="#0b1c30" />
                <polygon points="30,60 110,90 110,150 30,120" fill="#1e3a8a" opacity="0.8" stroke="#0b1c30" />
                <polygon points="190,60 110,90 110,150 190,120" fill="#0b1c30" opacity="0.7" stroke="#0b1c30" />
                <polygon points="30,60 110,30 190,60 110,90" fill="#004a32" opacity="0.7" stroke="#0b1c30" />
              </svg>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg bg-surface-container-low p-space-md">
          <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            {t("res.ansys.tableTitle")}
          </span>
          <table className="mt-space-sm w-full text-left font-mono-metric-sm">
            <thead className="text-on-surface-variant">
              <tr>
                <th className="py-space-2xs pr-space-sm">{t("res.ansys.design")}</th>
                <th className="py-space-2xs px-space-2xs">RC min/mean/max</th>
                <th className="py-space-2xs px-space-2xs">ANSYS min/mean/max</th>
                <th className="py-space-2xs px-space-2xs">MAE</th>
                <th className="py-space-2xs px-space-2xs">RMSE</th>
                <th className="py-space-2xs px-space-2xs">rank</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.design_id} className="border-t border-surface-container-high/50 text-on-surface">
                  <td className="py-space-xs pr-space-sm font-semibold">#{r.design_id}</td>
                  <td className="py-space-xs px-space-2xs">{r.RC_Tmin_C} / {r.RC_Tmean_C} / {r.RC_Tmax_C}</td>
                  <td className="py-space-xs px-space-2xs">{r.ANSYS_Tmin_C} / {r.ANSYS_Tmean_C} / {r.ANSYS_Tmax_C}</td>
                  <td className="py-space-xs px-space-2xs">{r.MAE_C}</td>
                  <td className="py-space-xs px-space-2xs">{r.RMSE_C}</td>
                  <td className="py-space-xs px-space-2xs">{r.RC_rank} → {r.ANSYS_rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-space-sm rounded bg-surface-container-lowest p-space-sm font-body-sm text-on-surface">
            {a.rankings_agree ? t("res.ansys.agree") : t("res.ansys.tie")}
          </p>
        </div>
      </div>

      {a.series && a.series.designs.length ? (
        <div className="mt-space-lg">
          <ValidationChart series={a.series} maeById={maeById} />
          <p className="mt-space-sm font-body-sm text-on-surface-variant">{t("res.ansys.overlayNote")}</p>
        </div>
      ) : null}
    </SectionCard>
  );
}
