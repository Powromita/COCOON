"use client";

import SectionCard from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

export default function AnsysValidationPanel() {
  const t = useT();
  const { results, isReal } = useResults();
  const a = results.ansys;
  if (!a || !a.ran) return null;

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
    </SectionCard>
  );
}
