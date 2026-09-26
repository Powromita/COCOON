import type { ReactNode } from "react";
import { T } from "@/lib/i18n";

type CardProps = {
  /** Header title (Inter 13px/600). Omit for a headerless card. */
  title?: ReactNode;
  /** Right-aligned header slot — typically Badges or mono status tags. */
  actions?: ReactNode;
  /** Remove body padding (e.g. for edge-to-edge tables). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

// DESIGN.md › Data Cards: white shell, hairline border, 8px radius (rounded-xl in the Stitch scale), 40px header.
export default function Card({ title, actions, flush = false, className, bodyClassName, children }: CardProps) {
  return (
    <section
      className={["bg-surface-container-lowest border border-outline-variant rounded-xl shadow-card overflow-hidden", className]
        .filter(Boolean)
        .join(" ")}
    >
      {(title || actions) && (
        <header className="h-12 px-5 flex items-center justify-between gap-2 border-b border-surface-container">
          <h2 className="font-headline-sm text-[13px] font-semibold text-on-surface truncate">{typeof title === "string" ? <T>{title}</T> : title}</h2>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={[flush ? "" : "p-5", bodyClassName].filter(Boolean).join(" ")}>{children}</div>
    </section>
  );
}
