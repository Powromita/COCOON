"use client";

import { useState } from "react";
import { useT } from "@/app/_lib/i18n";
import type { MaterialId } from "@/app/_lib/types";

const MASS_MATERIALS: { id: MaterialId; label: string }[] = [
  { id: "adobe", label: "Adobe (mud brick)" },
  { id: "stone_masonry", label: "Stone masonry" },
  { id: "rammed_earth", label: "Rammed earth" },
  { id: "straw_clay", label: "Straw-clay" },
  { id: "concrete", label: "Concrete" },
  { id: "wood_timber", label: "Timber" },
];

/**
 * Simplified single-surface layer input for the Individual flow: one
 * structural material + thickness, plus an optional exterior insulation
 * layer. Emits `layers.<surface>` as JSON so buildShelterConfig reads it.
 */
export default function IndividualLayerInput({
  surface,
  defaultMaterial,
  defaultThickness,
}: {
  surface: "wall" | "roof" | "floor";
  defaultMaterial: MaterialId;
  defaultThickness: number;
}) {
  const t = useT();
  const [material, setMaterial] = useState<MaterialId>(defaultMaterial);
  const [thickness, setThickness] = useState(defaultThickness);
  const [insul, setInsul] = useState(false);
  const [insulMm, setInsulMm] = useState(80);

  const layers = [
    ...(insul ? [{ material: "puf", thickness_mm: Number(insulMm) }] : []),
    { material, thickness_mm: Number(thickness) },
  ];

  return (
    <>
      <input type="hidden" name={`layers.${surface}`} value={JSON.stringify(layers)} readOnly />

      <div className="relative">
        <select
          value={material}
          onChange={(e) => setMaterial(e.target.value as MaterialId)}
          className="w-full appearance-none truncate rounded bg-surface-container-lowest py-space-xs pl-space-sm pr-space-xl font-body-sm text-on-surface shadow-sm focus:outline-none"
        >
          {MASS_MATERIALS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-space-sm top-1/2 -translate-y-1/2 text-[18px] leading-none text-on-surface-variant">
          ⌄
        </span>
      </div>

      <div className="flex items-center gap-space-xs">
        <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">
          {t("cfg.layers.thickness")}
        </label>
        <div className="flex flex-1 items-center rounded bg-surface-container-lowest shadow-sm">
          <input
            type="number"
            value={thickness}
            onChange={(e) => setThickness(+e.target.value)}
            className="w-full bg-transparent px-space-sm py-space-2xs font-mono-metric-md text-on-surface outline-none"
          />
          <span className="px-space-xs font-mono-metric-sm text-on-surface-variant">mm</span>
        </div>
      </div>

      {insul ? (
        <div className="flex items-center gap-space-xs rounded bg-secondary-fixed/40 p-space-2xs">
          <span className="font-mono-metric-sm text-secondary">PUF</span>
          <div className="flex flex-1 items-center rounded bg-surface-container-lowest shadow-sm">
            <input
              type="number"
              value={insulMm}
              onChange={(e) => setInsulMm(+e.target.value)}
              className="w-full bg-transparent px-space-sm py-space-2xs font-mono-metric-md text-on-surface outline-none"
            />
            <span className="px-space-xs font-mono-metric-sm text-on-surface-variant">mm</span>
          </div>
          <button
            type="button"
            onClick={() => setInsul(false)}
            className="rounded px-space-2xs font-mono-metric-sm text-primary hover:underline"
          >
            {t("cfg.layers.remove")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setInsul(true)}
          className="self-start rounded bg-surface-container-lowest px-space-sm py-space-2xs font-mono-metric-sm text-primary shadow-sm hover:bg-surface-container"
        >
          {t("cfg.layers.addInsul")}
        </button>
      )}
    </>
  );
}
