import type { ReactNode } from "react";
import { T } from "@/lib/i18n";

type Props = {
  icon: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
};

/** Dashed placeholder panel for modules that are designed but not yet wired to data. */
export default function EmptyState({ icon, title, children, actions }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-space-sm px-space-xl py-12 rounded-xl border border-dashed border-outline-variant bg-surface-container-low">
      <span className="material-symbols-outlined text-[28px] text-on-surface-variant">{icon}</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">
        <T>{title}</T>
      </h3>
      {children && <p className="font-body-md text-body-md text-on-surface-variant max-w-md">{children}</p>}
      {actions && <div className="flex flex-wrap items-center justify-center gap-space-sm mt-space-xs">{actions}</div>}
    </div>
  );
}
