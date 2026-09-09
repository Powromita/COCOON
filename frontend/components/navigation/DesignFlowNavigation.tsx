"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { designFlow } from "@/navigation/routes";

type DesignFlowNavigationProps = {
  mode?: "individual" | "organization";
};

export default function DesignFlowNavigation({ mode = "individual" }: DesignFlowNavigationProps) {
  const pathname = usePathname();
  const flow = mode === "organization"
    ? designFlow.map((step) => ({
        ...step,
        href: step.href.replace("/individual", "/organization"),
      }))
    : designFlow;

  return (
    <nav aria-label="Design flow" className="flex flex-wrap items-center gap-space-xs">
      {flow.map((step, index) => {
        const isActive = pathname === step.href;

        return (
          <div key={step.href} className="flex items-center gap-space-xs">
            {index > 0 && <span aria-hidden="true" className="text-outline-variant">/</span>}
            <Link
              href={step.href}
              aria-current={isActive ? "page" : undefined}
              className={`rounded px-space-sm py-space-2xs text-body-sm transition-colors ${
                isActive
                  ? "bg-surface-container text-primary font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              {step.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
