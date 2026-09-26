import type { ReactNode } from "react";
import { T } from "@/lib/i18n";

type Props = {
  /** Mono context tag above the title, e.g. "LIBRARY // 24 REFERENCES". */
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

/** Page title block matching the dashboard console header. */
export default function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
      <div className="flex flex-col gap-space-xs min-w-0">
        {eyebrow && <div className="flex flex-wrap items-center gap-space-sm">{eyebrow}</div>}
        <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-on-surface tracking-tight font-bold">
          <T>{title}</T>
        </h1>
        {description && (
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
            {typeof description === "string" ? <T>{description}</T> : description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-sm shrink-0">{actions}</div>}
    </div>
  );
}
