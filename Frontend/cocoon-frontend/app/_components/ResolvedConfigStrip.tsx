"use client";

import { useResults } from "@/app/_components/ResultsProvider";
import { useT } from "@/app/_lib/i18n";

/** Post-solve derived-properties recap for the results pages. */
export default function ResolvedConfigStrip() {
  const t = useT();
  const { results } = useResults();
  const r = results.resolved;

  const items = [
    { key: "res.cfg.uWall", value: r.U_wall_W_m2K.toFixed(2), unit: "W/m²·K" },
    { key: "res.cfg.uRoof", value: r.U_roof_W_m2K.toFixed(2), unit: "W/m²·K" },
    { key: "res.cfg.uFloor", value: r.U_floor_W_m2K.toFixed(2), unit: "W/m²·K" },
    { key: "res.cfg.capacitance", value: r.C_total_MJ_per_K.toFixed(1), unit: "MJ/K" },
    { key: "res.cfg.infilUA", value: r.infiltration_UA_W_K.toFixed(1), unit: "W/K" },
    { key: "res.cfg.mass", value: r.envelope_mass_t.toFixed(1), unit: "t" },
  ];

  return (
    <div className="rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
      <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">
        {t("res.cfg.title")}
      </span>
      <div className="mt-space-sm grid gap-space-md sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.key}>
            <span className="block font-body-sm text-on-surface-variant">{t(it.key)}</span>
            <span className="font-mono-metric-md font-semibold text-primary">{it.value}</span>{" "}
            <span className="font-mono-metric-sm text-on-surface-variant">{it.unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
