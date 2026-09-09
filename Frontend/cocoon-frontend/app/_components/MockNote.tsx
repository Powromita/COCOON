"use client";

import { useT } from "@/app/_lib/i18n";

/** Small banner marking UI that is not yet wired to the solver pipeline. */
export default function MockNote({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <div
      className={`flex items-center gap-space-xs rounded bg-tertiary-fixed/40 px-space-sm py-space-2xs font-mono-metric-sm text-on-tertiary-fixed ${className}`}
    >
      <span aria-hidden>◔</span>
      <span>{t("common.mockNote")}</span>
    </div>
  );
}
