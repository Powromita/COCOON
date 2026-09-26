import type { ReactNode } from "react";

export type BadgeTone = "navy" | "thermal" | "equilibrium" | "teal" | "plum" | "critical" | "neutral";

// DESIGN.md › Status Badges: 22px tall, 4px radius, mono-xs uppercase, 20% tone border.
const TONES: Record<BadgeTone, string> = {
  navy: "bg-primary-fixed text-navy border-navy/20",
  thermal: "bg-thermal-tint text-thermal border-thermal/20",
  equilibrium: "bg-equilibrium-tint text-equilibrium border-equilibrium/20",
  teal: "bg-teal-tint text-teal border-teal/20",
  plum: "bg-plum-tint text-plum border-plum/20",
  critical: "bg-critical-tint text-critical border-critical/20",
  neutral: "bg-surface-container-low text-ink-muted border-outline-variant",
};

type BadgeProps = {
  tone?: BadgeTone;
  /** Show a leading status dot (the only place circles are allowed). */
  dot?: boolean;
  className?: string;
  children: ReactNode;
};

export default function Badge({ tone = "neutral", dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 h-[22px] px-2 rounded-full border font-label-mono-sm text-[10px] leading-3 tracking-[0.02em] font-medium uppercase whitespace-nowrap",
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
