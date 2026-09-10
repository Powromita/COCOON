"use client";

import { useMemo, useState } from "react";
import SectionCard from "@/app/_components/SectionCard";
import { useT } from "@/app/_lib/i18n";

const inputCls =
  "w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none";
const labelCls = "block font-label-caps uppercase tracking-wider text-on-surface-variant";

/**
 * Optimizer run parameters. The user does NOT pick materials or
 * thicknesses here — the pipeline generates `designs` candidate envelopes
 * for the fixed box, simulates and ranks them, and returns the best
 * material combination. This block only tunes the search itself. Emits
 * `opt.spec` (designs / seed / trials / run_ansys).
 */
export default function OptimizerFields() {
  const t = useT();
  const [designs, setDesigns] = useState(50);
  const [seed, setSeed] = useState(0);
  const [trials, setTrials] = useState(400);
  const [runAnsys, setRunAnsys] = useState(false);

  const spec = useMemo(
    () => ({ designs, seed, trials, run_ansys: runAnsys, ansys_hours: 24, ansys_designs: 2 }),
    [designs, seed, trials, runAnsys],
  );

  return (
    <SectionCard title={t("opt.title")} tag={t("opt.tag")}>
      <input type="hidden" name="opt.spec" value={JSON.stringify(spec)} readOnly />

      <p className="mb-space-md font-body-sm text-on-surface-variant">{t("opt.pipelineNote")}</p>

      <div className="grid gap-space-md sm:grid-cols-3">
        <div className="space-y-space-2xs">
          <label className={labelCls}>{t("opt.designs")}</label>
          <input className={inputCls} type="number" min={5} max={200} value={designs} onChange={(e) => setDesigns(+e.target.value)} />
          <span className="font-body-sm text-on-surface-variant">{t("opt.designsHint")}</span>
        </div>
        <div className="space-y-space-2xs">
          <label className={labelCls}>{t("opt.seed")}</label>
          <input className={inputCls} type="number" min={0} value={seed} onChange={(e) => setSeed(+e.target.value)} />
          <span className="font-body-sm text-on-surface-variant">{t("opt.seedHint")}</span>
        </div>
        <div className="space-y-space-2xs">
          <label className={labelCls}>{t("opt.trials")}</label>
          <input className={inputCls} type="number" min={10} max={5000} value={trials} onChange={(e) => setTrials(+e.target.value)} />
          <span className="font-body-sm text-on-surface-variant">{t("opt.trialsHint")}</span>
        </div>
      </div>

      <label className="mt-space-lg flex items-center gap-space-sm rounded-lg bg-surface-container-low p-space-md">
        <input
          type="checkbox"
          checked={runAnsys}
          onChange={(e) => setRunAnsys(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <span>
          <span className="block font-headline-sm text-on-surface">{t("opt.runAnsys")}</span>
          <span className="block font-body-sm text-on-surface-variant">{t("opt.runAnsysHint")}</span>
        </span>
      </label>
    </SectionCard>
  );
}
