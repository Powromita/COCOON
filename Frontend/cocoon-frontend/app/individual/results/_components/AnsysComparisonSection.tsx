"use client";

import { useMemo, useState } from "react";
import SectionCard from "@/app/_components/SectionCard";
import { useResults } from "@/app/_components/ResultsProvider";
import { artifactUrl } from "@/app/_lib/api";
import { SERIES_COLORS } from "@/app/_lib/chartColors";
import {
  ANSYS_MAE_LIMIT_C,
  deriveAnsysComparison,
  deriveStatus,
  type AnsysComparison,
} from "@/app/_lib/simulation";
import { fmtTemp, fmtTempDelta, fmtTimestamp, fmtDayTime } from "@/app/_lib/format";
import { useT } from "@/app/_lib/i18n";

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-space-md">
      <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className="mt-space-2xs block font-mono-metric-md font-semibold text-on-surface">{value}</span>
    </div>
  );
}

function OverlayChart({
  cmp,
  lo,
  hi,
  tz,
}: {
  cmp: AnsysComparison;
  lo: number;
  hi: number;
  tz: string;
}) {
  const t = useT();
  const n = cmp.n;
  const [cursor, setCursor] = useState<number | null>(null);

  const geom = useMemo(() => {
    const all = [...cmp.physics, ...cmp.ansys, lo, hi];
    const min = Math.floor((Math.min(...all) - 1) / 2) * 2;
    const max = Math.ceil((Math.max(...all) + 1) / 2) * 2;
    const W = 1000;
    const H = 300;
    const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
    const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
    const line = (arr: number[]) =>
      arr.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const yTicks: number[] = [];
    for (let v = min; v <= max; v += Math.max(2, Math.round((max - min) / 6 / 2) * 2)) yTicks.push(v);
    const step = n <= 26 ? 6 : n <= 50 ? 12 : 24;
    const xTicks: number[] = [];
    for (let i = 0; i < n; i += step) xTicks.push(i);
    return { W, H, x, y, min, max, line, yTicks, xTicks };
  }, [cmp, lo, hi, n]);

  const label = (i: number) => {
    const ts = cmp.timestamps[i];
    return ts ? fmtTimestamp(ts, tz) : `Hour ${i}`;
  };

  const c = cursor;

  return (
    <div className="rounded-lg bg-surface-container-low p-space-md">
      <div className="flex flex-wrap items-center justify-between gap-space-sm pb-space-xs">
        <div className="flex flex-wrap items-center gap-space-md font-mono-metric-sm text-on-surface-variant">
          <span className="flex items-center gap-space-2xs">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" y1="4" x2="26" y2="4" stroke={SERIES_COLORS.physics} strokeWidth="3" />
            </svg>
            {t("ires.cmp.legPhysics")}
          </span>
          <span className="flex items-center gap-space-2xs">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" y1="4" x2="26" y2="4" stroke={SERIES_COLORS.ansys} strokeWidth="3" strokeDasharray="5 3" />
              <circle cx="13" cy="4" r="2.5" fill={SERIES_COLORS.ansys} />
            </svg>
            {t("ires.cmp.legAnsys")}
          </span>
          <span className="flex items-center gap-space-2xs">
            <span className="h-2.5 w-4 rounded-sm" style={{ background: SERIES_COLORS.comfortBand, opacity: 0.35 }} />
            {t("ires.legComfort")} {fmtTemp(lo)}–{fmtTemp(hi)}
          </span>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox="-46 -10 1080 344"
          className="h-72 w-full min-w-[520px]"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Physics model versus ANSYS indoor temperature over ${n} aligned hours`}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const f = (e.clientX - r.left) / r.width;
            setCursor(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
          }}
          onMouseLeave={() => setCursor(null)}
        >
          <rect
            x={0}
            y={Math.min(geom.y(hi), geom.y(lo))}
            width={geom.W}
            height={Math.abs(geom.y(lo) - geom.y(hi))}
            fill={SERIES_COLORS.comfortBand}
            fillOpacity="0.18"
          />
          {geom.yTicks.map((v) => (
            <g key={v}>
              <line x1={0} x2={geom.W} y1={geom.y(v)} y2={geom.y(v)} stroke="#dce9ff" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
              <text x={-8} y={geom.y(v) + 3} textAnchor="end" fontSize="11" fill="#757682" fontFamily="JetBrains Mono">{v}°</text>
            </g>
          ))}
          {geom.xTicks.map((i) => (
            <text key={i} x={geom.x(i)} y={geom.H + 20} textAnchor="middle" fontSize="10" fill="#757682" fontFamily="JetBrains Mono">
              {cmp.timestamps[i] ? fmtTimestamp(cmp.timestamps[i], tz).split(",")[1]?.trim() ?? `H${i}` : `H${i}`}
            </text>
          ))}
          <path d={geom.line(cmp.physics)} fill="none" stroke={SERIES_COLORS.physics} strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <path d={geom.line(cmp.ansys)} fill="none" stroke={SERIES_COLORS.ansys} strokeWidth="2.4" strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
          {cmp.ansys.map((v, i) =>
            i % Math.max(1, Math.round(n / 24)) === 0 ? (
              <circle key={i} cx={geom.x(i)} cy={geom.y(v)} r="2.4" fill={SERIES_COLORS.ansys} />
            ) : null,
          )}
          {c != null ? (
            <line x1={geom.x(c)} x2={geom.x(c)} y1={0} y2={geom.H} stroke="#00236f" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
      </div>

      {c != null ? (
        <dl className="mt-space-sm grid gap-space-xs rounded bg-surface-container-lowest p-space-sm font-mono-metric-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-on-surface-variant">Time</dt><dd className="text-on-surface">{label(c)}</dd></div>
          <div><dt className="text-on-surface-variant">{t("ires.cmp.legPhysics")}</dt><dd style={{ color: SERIES_COLORS.physics }}>{fmtTemp(cmp.physics[c])} {cmp.physics[c] >= lo && cmp.physics[c] <= hi ? "· in band" : "· out of band"}</dd></div>
          <div><dt className="text-on-surface-variant">{t("ires.cmp.legAnsys")}</dt><dd style={{ color: SERIES_COLORS.ansys }}>{fmtTemp(cmp.ansys[c])} {cmp.ansys[c] >= lo && cmp.ansys[c] <= hi ? "· in band" : "· out of band"}</dd></div>
          <div><dt className="text-on-surface-variant">Difference</dt><dd className="text-on-surface">{fmtTempDelta(cmp.errors[c], { signed: true })}</dd></div>
          <div><dt className="text-on-surface-variant">|Difference|</dt><dd className="text-on-surface">{fmtTempDelta(Math.abs(cmp.errors[c]))}</dd></div>
        </dl>
      ) : null}

      <p className="mt-space-xs font-body-sm text-on-surface-variant">
        {cmp.alignedBy === "index" ? t("ires.cmp.alignIndex") : null} {t("ires.cmp.achNote")}
      </p>
    </div>
  );
}

export default function AnsysComparisonSection() {
  const t = useT();
  const { results, phase, status, isReal } = useResults();
  const hasSeries = (results.features?.temperature?.series?.indoor_C?.length ?? 0) > 0;
  const st = deriveStatus(phase, status, isReal, hasSeries);
  const cmp = deriveAnsysComparison(results);
  const tz = (results.location ?? { timezone: "Asia/Kolkata" }).timezone;
  const lo = results.comfort.band_lo_C;
  const hi = results.comfort.band_hi_C;

  const reportHref =
    results.report_md_url && !results.report_md_url.startsWith("#")
      ? artifactUrl(results.run_id, "REPORT.md")
      : undefined;

  let body: React.ReactNode;

  if (cmp) {
    const within = cmp.maeC <= ANSYS_MAE_LIMIT_C;
    const worstWhen = cmp.timestamps[cmp.maxAbsErrIdx]
      ? fmtDayTime(cmp.timestamps[cmp.maxAbsErrIdx], tz)
      : `hour ${cmp.maxAbsErrIdx}`;
    const interpretation = within
      ? `The Physics Model follows the ANSYS temperature trend with an MAE of ${cmp.maeC.toFixed(2)}°C across ${cmp.n} aligned hourly observations. The largest difference of ${cmp.maxAbsErrC.toFixed(2)}°C occurred on ${worstWhen}. This is within the documented single-node agreement band (≈ ${ANSYS_MAE_LIMIT_C.toFixed(2)}°C) for a deep-winter window of this length.`
      : `The Physics Model and ANSYS differ by an MAE of ${cmp.maeC.toFixed(2)}°C across ${cmp.n} aligned hourly observations, above the documented ≈ ${ANSYS_MAE_LIMIT_C.toFixed(2)}°C single-node band. The largest difference of ${cmp.maxAbsErrC.toFixed(2)}°C occurred on ${worstWhen}.`;

    body = (
      <div className="space-y-space-lg">
        <OverlayChart cmp={cmp} lo={lo} hi={hi} tz={tz} />
        <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={t("ires.cmp.physicsMean")} value={fmtTemp(cmp.physicsMeanC)} />
          <MetricCard label={t("ires.cmp.ansysMean")} value={fmtTemp(cmp.ansysMeanC)} />
          <MetricCard label={t("ires.cmp.mae")} value={fmtTempDelta(cmp.maeC)} />
          <MetricCard label={t("ires.cmp.rmse")} value={fmtTempDelta(cmp.rmseC)} />
          <MetricCard label={t("ires.cmp.maxErr")} value={fmtTempDelta(cmp.maxAbsErrC)} />
          <MetricCard label={t("ires.cmp.bias")} value={fmtTempDelta(cmp.biasC, { signed: true })} />
          <MetricCard label={t("ires.cmp.points")} value={String(cmp.n)} />
          <MetricCard label="Design" value={`#${cmp.designId}`} />
        </div>
        <p className="rounded-lg bg-surface-container-low p-space-md font-body-md leading-relaxed text-on-surface">
          {interpretation}
        </p>
      </div>
    );
  } else if (st.ansys === "running") {
    body = <p className="rounded-lg bg-surface-container-low p-space-md font-body-md text-on-surface-variant">{t("ires.cmp.running")}</p>;
  } else if (st.ansys === "queued") {
    body = <p className="rounded-lg bg-surface-container-low p-space-md font-body-md text-on-surface-variant">{t("ires.cmp.queued")}</p>;
  } else if (st.ansys === "failed") {
    body = <p className="rounded-lg bg-error/5 p-space-md font-body-md text-error">{t("ires.cmp.failed")}</p>;
  } else {
    body = (
      <div className="rounded-lg bg-surface-container-low p-space-md">
        <p className="font-body-md text-on-surface-variant">{t("ires.cmp.notRun")}</p>
        {reportHref ? (
          <a href={reportHref} className="mt-space-xs inline-block font-body-sm text-primary hover:underline">
            {t("ires.download")}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <SectionCard title={t("ires.cmp.title")}>
      <p className="mb-space-md font-body-sm text-on-surface-variant">{t("ires.cmp.subtitle")}</p>
      {body}
    </SectionCard>
  );
}
