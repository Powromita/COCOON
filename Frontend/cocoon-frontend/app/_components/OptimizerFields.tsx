"use client";

import { useMemo, useState } from "react";
import SectionCard from "@/app/_components/SectionCard";
import { useT } from "@/app/_lib/i18n";
import type { MaterialId, OptimizeSpec, RatioConstraint } from "@/app/_lib/types";

const inputCls =
  "w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none";
const labelCls = "block font-label-caps uppercase tracking-wider text-on-surface-variant";

const CONSTRAINT_META: { key: RatioConstraint["factor"]; label: string; min: number; max: number }[] = [
  { key: "aspect_ratio", label: "opt.f.aspect", min: 1.0, max: 1.8 },
  { key: "av_ratio", label: "opt.f.av", min: 0.7, max: 1.3 },
  { key: "wwr_percent", label: "opt.f.wwr", min: 10, max: 20 },
  { key: "ceiling_height_m", label: "opt.f.height", min: 2.3, max: 3.0 },
  { key: "floor_area_m2", label: "opt.f.floor", min: 12, max: 32 },
];

const MATERIALS: MaterialId[] = [
  "adobe",
  "rammed_earth",
  "straw_clay",
  "stone_masonry",
  "wood_timber",
  "concrete",
  "reinforced_concrete",
  "puf",
];

/** Optimizer / inverse-design inputs (PRD Stage 6, §8.1). Emits `opt.spec`. */
export default function OptimizerFields() {
  const t = useT();
  const [designs, setDesigns] = useState(50);
  const [seed, setSeed] = useState(0);
  const [trials, setTrials] = useState(400);
  const [runAnsys, setRunAnsys] = useState(false);
  const [constraints, setConstraints] = useState<RatioConstraint[]>(
    CONSTRAINT_META.map((c) => ({ factor: c.key, min: c.min, max: c.max })),
  );
  const [materials, setMaterials] = useState<MaterialId[]>([...MATERIALS]);

  const patchConstraint = (i: number, k: "min" | "max", v: number) =>
    setConstraints((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  const toggleMaterial = (m: MaterialId) =>
    setMaterials((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));

  const spec: OptimizeSpec = useMemo(
    () => ({
      designs,
      seed,
      trials,
      constraints,
      allowed_materials: materials,
      run_ansys: runAnsys,
      ansys_hours: 24,
      ansys_designs: 2,
    }),
    [designs, seed, trials, constraints, materials, runAnsys],
  );

  return (
    <SectionCard title={t("opt.title")} tag={t("opt.tag")}>
      <input type="hidden" name="opt.spec" value={JSON.stringify(spec)} readOnly />

      <div className="grid gap-space-md sm:grid-cols-3">
        <div className="space-y-space-2xs">
          <label className={labelCls}>{t("opt.designs")}</label>
          <input className={inputCls} type="number" value={designs} onChange={(e) => setDesigns(+e.target.value)} />
        </div>
        <div className="space-y-space-2xs">
          <label className={labelCls}>{t("opt.seed")}</label>
          <input className={inputCls} type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} />
        </div>
        <div className="space-y-space-2xs">
          <label className={labelCls}>{t("opt.trials")}</label>
          <input className={inputCls} type="number" value={trials} onChange={(e) => setTrials(+e.target.value)} />
        </div>
      </div>

      <div className="mt-space-lg">
        <div className="mb-space-xs flex items-center justify-between">
          <span className={labelCls}>{t("opt.constraints")}</span>
          <span className="font-mono-metric-sm text-outline">{t("opt.constraintsHint")}</span>
        </div>
        <div className="overflow-x-auto rounded-lg bg-surface-container-low">
          <table className="w-full text-left font-body-sm">
            <thead className="font-label-caps uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-space-sm py-space-xs">{t("opt.factor")}</th>
                <th className="px-space-sm py-space-xs">{t("opt.min")}</th>
                <th className="px-space-sm py-space-xs">{t("opt.max")}</th>
              </tr>
            </thead>
            <tbody>
              {CONSTRAINT_META.map((c, i) => (
                <tr key={c.key} className="border-t border-surface-container-high/50">
                  <td className="px-space-sm py-space-xs text-on-surface">{t(c.label)}</td>
                  <td className="px-space-sm py-space-xs">
                    <input
                      className="w-20 rounded bg-surface-container-lowest px-space-xs py-space-2xs font-mono-metric-sm"
                      type="number"
                      value={constraints[i].min}
                      onChange={(e) => patchConstraint(i, "min", +e.target.value)}
                    />
                  </td>
                  <td className="px-space-sm py-space-xs">
                    <input
                      className="w-20 rounded bg-surface-container-lowest px-space-xs py-space-2xs font-mono-metric-sm"
                      type="number"
                      value={constraints[i].max}
                      onChange={(e) => patchConstraint(i, "max", +e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-space-lg">
        <span className={labelCls}>{t("opt.materials")}</span>
        <div className="mt-space-xs flex flex-wrap gap-space-xs">
          {MATERIALS.map((m) => (
            <label
              key={m}
              className="flex items-center gap-space-2xs rounded bg-surface-container-low px-space-sm py-space-2xs font-mono-metric-sm text-on-surface"
            >
              <input
                type="checkbox"
                checked={materials.includes(m)}
                onChange={() => toggleMaterial(m)}
                className="accent-primary"
              />
              {m}
            </label>
          ))}
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
