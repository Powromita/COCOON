"use client";

import { useId, useState } from "react";

/**
 * Small accessible tooltip for a technical term (spec §4, §10). Hover or focus
 * the trigger to reveal the description; it is also exposed via `aria-describedby`
 * so it is not colour- or hover-only.
 */
export default function InfoTip({ label, text }: { label?: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={label ? `About ${label}` : "More information"}
        aria-describedby={id}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-outline-variant text-[10px] leading-none text-on-surface-variant transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className="absolute bottom-full left-1/2 z-20 mb-1 w-56 -translate-x-1/2 rounded bg-inverse-surface px-space-sm py-space-xs font-body-sm leading-snug text-inverse-on-surface shadow-lg"
      >
        {text}
      </span>
    </span>
  );
}
