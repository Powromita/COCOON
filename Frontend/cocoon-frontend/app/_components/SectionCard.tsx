"use client";

import type { ReactNode } from "react";

/** Shared results/config section shell matching the existing page style. */
export default function SectionCard({
  index,
  title,
  tag,
  children,
}: {
  index?: string;
  title: string;
  tag?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
      <div className="mb-space-lg flex items-center justify-between pb-space-sm">
        <div className="flex items-center gap-space-xs">
          {index ? (
            <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">
              {index}
            </span>
          ) : (
            <span className="h-4 w-2 rounded-sm bg-primary" />
          )}
          <h2 className="font-headline-md text-on-surface">{title}</h2>
        </div>
        {tag ? (
          <span className="rounded-full bg-surface-container px-space-xs py-space-2xs font-mono-metric-sm text-on-surface-variant">
            {tag}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "text-primary",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-container-low p-space-md">
      <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className={`font-mono-metric-lg font-semibold ${tone}`}>{value}</span>
        {unit ? <span className="font-mono-metric-sm text-on-surface-variant">{unit}</span> : null}
      </div>
    </div>
  );
}
