"use client";

import { useResults } from "@/app/_components/ResultsProvider";
import InfoTip from "@/app/_components/InfoTip";
import { fmtU, fmtCapacitanceMJ, fmtArea, fmtPercent, NA } from "@/app/_lib/format";
import { useT } from "@/app/_lib/i18n";

/** Post-solve derived-properties recap for the results pages. Calculated
 * outputs — visually distinct from the editable inputs on the configure page. */
export default function ResolvedConfigStrip() {
  const t = useT();
  const { results } = useResults();
  const r = results.resolved;

  const items: { key: string; label: string; value: string; tip?: string }[] = [
    { key: "uWall", label: t("res.cfg.uWall"), value: fmtU(r.U_wall_W_m2K), tip: t("common.tip.uValue") },
    { key: "uRoof", label: t("res.cfg.uRoof"), value: fmtU(r.U_roof_W_m2K), tip: t("common.tip.uValue") },
    { key: "uFloor", label: t("res.cfg.uFloor"), value: fmtU(r.U_floor_W_m2K), tip: t("common.tip.uValue") },
    { key: "uWindow", label: t("res.cfg.uWindow"), value: fmtU(r.U_window_W_m2K), tip: t("common.tip.uValue") },
    {
      key: "cap",
      label: t("res.cfg.capacitance"),
      value: fmtCapacitanceMJ(r.C_total_MJ_per_K),
      tip: t("common.tip.capacitance"),
    },
    {
      key: "airUA",
      label: t("res.cfg.infilUA"),
      value: Number.isFinite(r.infiltration_UA_W_K) ? `${r.infiltration_UA_W_K.toFixed(1)} W/K` : NA,
      tip: t("common.tip.airExchange"),
    },
    { key: "area", label: t("res.cfg.envArea"), value: fmtArea(r.envelope_area_m2) },
    { key: "wwr", label: t("res.cfg.wwr"), value: fmtPercent(r.window_to_wall_ratio_pct) },
    {
      key: "mass",
      label: t("res.cfg.mass"),
      value: Number.isFinite(r.envelope_mass_t) ? `${r.envelope_mass_t.toFixed(1)} t` : NA,
    },
  ];

  return (
    <div className="rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
      <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
        {t("res.cfg.title")}
      </span>
      <div className="mt-space-sm grid gap-space-md sm:grid-cols-3 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.key}>
            <span className="flex items-center gap-space-2xs font-body-sm text-on-surface-variant">
              {it.label}
              {it.tip ? <InfoTip label={it.label} text={it.tip} /> : null}
            </span>
            <span
              className={`font-mono-metric-md font-semibold ${it.value === NA ? "text-on-surface-variant" : "text-primary"}`}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
