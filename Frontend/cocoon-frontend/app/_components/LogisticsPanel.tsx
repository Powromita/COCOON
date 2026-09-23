"use client";

import SectionCard from "@/app/_components/SectionCard";
import MockNote from "@/app/_components/MockNote";
import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

export default function LogisticsPanel() {
  const t = useT();
  const { results, isReal } = useResults();
  const rows = results.logistics ?? [];
  if (!rows.length) return null;

  return (
    <SectionCard title={t("res.log.title")} tag={t("res.log.tag")}>
      {!isReal ? <MockNote className="mb-space-md" /> : null}
      <div className="overflow-x-auto rounded-lg bg-surface-container-low">
        <table className="w-full text-left font-mono-metric-sm">
          <thead className="font-label-caps uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-space-sm py-space-xs">{t("res.compare.id")}</th>
              <th className="px-space-sm py-space-xs">{t("res.log.mass")}</th>
              <th className="px-space-sm py-space-xs">{t("res.log.cost")}</th>
              <th className="px-space-sm py-space-xs">{t("res.log.transport")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.design_id} className="border-t border-surface-container-high/50 text-on-surface">
                <td className="px-space-sm py-space-xs font-semibold">#{r.design_id}</td>
                <td className="px-space-sm py-space-xs">{r.envelope_mass_t} t</td>
                <td className="px-space-sm py-space-xs">₹ {r.material_cost_lakh_inr} lakh</td>
                <td className="px-space-sm py-space-xs">{r.transportability_1to5} / 5</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
