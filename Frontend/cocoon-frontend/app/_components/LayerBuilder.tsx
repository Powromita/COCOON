"use client";

import { useRef, useState } from "react";
import { useT } from "@/app/_lib/i18n";

type Layer = { id: number; role: "structural" | "insulation"; material: string; thickness: number };

const MATERIALS = [
  "adobe",
  "rammed_earth",
  "straw_clay",
  "stone_masonry",
  "wood_timber",
  "concrete",
  "reinforced_concrete",
  "puf",
];

function AssemblyRow({
  titleKey,
  fieldName,
  seed,
}: {
  titleKey: string;
  fieldName: string;
  seed: Layer[];
}) {
  const t = useT();
  const [layers, setLayers] = useState<Layer[]>(seed);
  const nextId = useRef(1000);

  const add = (role: Layer["role"]) =>
    setLayers((ls) => [
      ...(role === "insulation"
        ? [{ id: ++nextId.current, role, material: "puf", thickness: 90 } as Layer]
        : []),
      ...ls,
      ...(role === "structural"
        ? [{ id: ++nextId.current, role, material: "stone_masonry", thickness: 300 } as Layer]
        : []),
    ]);

  const remove = (id: number) => setLayers((ls) => ls.filter((l) => l.id !== id));

  const patch = (id: number, k: keyof Layer, v: string | number) =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v } : l)));

  const totalMm = layers.reduce((s, l) => s + Number(l.thickness || 0), 0);
  // rough static U preview: thicker + more puf => lower
  const pufMm = layers.filter((l) => l.material === "puf").reduce((s, l) => s + Number(l.thickness), 0);
  const uPreview = Math.max(0.15, 1.9 / (1 + totalMm / 120 + pufMm / 25)).toFixed(2);

  return (
    <div className="rounded-lg bg-surface-container-low p-space-md">
      <input
        type="hidden"
        name={fieldName}
        value={JSON.stringify(
          layers.map((l) => ({ material: l.material, thickness_mm: Number(l.thickness) })),
        )}
        readOnly
      />
      <div className="mb-space-sm flex flex-wrap items-center justify-between gap-space-xs">
        <div className="flex items-center gap-space-xs text-primary">
          <span aria-hidden>▣</span>
          <span className="font-headline-sm">{t(titleKey)}</span>
          <span className="font-mono-metric-sm text-on-surface-variant">[{totalMm} mm]</span>
        </div>
        <div className="flex items-center gap-space-2xs rounded bg-surface-container-lowest px-space-sm py-space-2xs shadow-sm">
          <span className="h-2 w-2 rounded-full bg-tertiary-container" />
          <span className="font-mono-metric-sm text-on-surface-variant">{t("cfg.layers.assemblyU")}</span>
          <span className="font-mono-metric-md font-bold text-primary">{uPreview}</span>
          <span className="font-mono-metric-sm text-on-surface-variant">W/m²·K</span>
        </div>
      </div>

      <div className="space-y-space-xs">
        {layers.map((l) => (
          <div
            key={l.id}
            className="grid items-end gap-space-sm rounded bg-surface-container-lowest p-space-sm shadow-sm sm:grid-cols-[130px_1fr_120px_auto]"
          >
            <span
              className={`rounded px-space-xs py-space-2xs text-center font-mono-metric-sm ${
                l.role === "insulation"
                  ? "bg-secondary-fixed text-secondary"
                  : "bg-surface-container-high text-primary"
              }`}
            >
              {l.role === "insulation" ? t("cfg.layers.insulation") : t("cfg.layers.structural")}
            </span>
            <div>
              <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">
                {t("cfg.layers.material")}
              </label>
              <select
                className="mt-space-2xs w-full appearance-none rounded bg-surface-container-low px-space-sm py-space-xs font-body-sm text-on-surface"
                value={l.material}
                onChange={(e) => patch(l.id, "material", e.target.value)}
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">
                {t("cfg.layers.thickness")}
              </label>
              <div className="mt-space-2xs flex items-center rounded bg-surface-container-low">
                <input
                  type="number"
                  value={l.thickness}
                  onChange={(e) => patch(l.id, "thickness", Number(e.target.value))}
                  className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none"
                />
                <span className="px-space-xs font-mono-metric-sm text-on-surface-variant">mm</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(l.id)}
              className="rounded bg-surface-container px-space-sm py-space-xs font-mono-metric-sm text-on-surface-variant hover:bg-surface-container-high"
            >
              {t("cfg.layers.remove")}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-space-sm flex flex-wrap gap-space-xs">
        {!layers.some((l) => l.role === "insulation") && (
          <button
            type="button"
            onClick={() => add("insulation")}
            className="rounded bg-surface-container px-space-sm py-space-2xs font-mono-metric-sm text-primary hover:bg-surface-container-high"
          >
            {t("cfg.layers.addInsul")}
          </button>
        )}
        <button
          type="button"
          onClick={() => add("structural")}
          className="rounded bg-surface-container px-space-sm py-space-2xs font-mono-metric-sm text-primary hover:bg-surface-container-high"
        >
          {t("cfg.layers.addLayer")}
        </button>
      </div>
    </div>
  );
}

const SEEDS: Record<string, Layer[]> = {
  "cfg.layers.wall": [
    { id: 1, role: "insulation", material: "puf", thickness: 92 },
    { id: 2, role: "structural", material: "stone_masonry", thickness: 516 },
  ],
  "cfg.layers.roof": [
    { id: 11, role: "insulation", material: "puf", thickness: 103 },
    { id: 12, role: "structural", material: "wood_timber", thickness: 107 },
  ],
  "cfg.layers.floor": [
    { id: 21, role: "insulation", material: "puf", thickness: 81 },
    { id: 22, role: "structural", material: "concrete", thickness: 156 },
  ],
};

export default function LayerBuilder() {
  const t = useT();
  return (
    <div className="space-y-space-md">
      <AssemblyRow titleKey="cfg.layers.wall" fieldName="layers.wall" seed={SEEDS["cfg.layers.wall"]} />
      <AssemblyRow titleKey="cfg.layers.roof" fieldName="layers.roof" seed={SEEDS["cfg.layers.roof"]} />
      <AssemblyRow titleKey="cfg.layers.floor" fieldName="layers.floor" seed={SEEDS["cfg.layers.floor"]} />
      <p className="font-body-sm text-on-surface-variant">{t("cfg.layers.note")}</p>
    </div>
  );
}
