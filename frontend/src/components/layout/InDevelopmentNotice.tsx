import type { ReactNode } from "react";
import Badge from "@/components/ui/Badge";
import { T } from "@/lib/i18n";

type Props = {
  /** Module code shown in the mono status line, e.g. "MOD-PRJ". */
  module: string;
  /** Expected milestone, e.g. "SIH 2026 · PHASE 2". */
  eta?: string;
  children: ReactNode;
};

/** Top-of-page status strip marking a screen as designed but not yet functional. */
export default function InDevelopmentNotice({ module, eta, children }: Props) {
  return (
    <div
      role="status"
      className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-card p-5 flex flex-col md:flex-row md:items-center gap-space-md"
    >
      <div className="flex items-center gap-space-sm shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-thermal opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-thermal" />
        </span>
        <Badge tone="thermal"><T>In Development</T></Badge>
        <span className="font-label-mono-xs text-label-mono-xs uppercase tracking-wider text-on-surface-variant">
          {module} <T>// COMING SOON</T>{eta ? ` · ${eta}` : ""}
        </span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant md:border-l md:border-outline-variant md:pl-space-md">{children}</p>
    </div>
  );
}
