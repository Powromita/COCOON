import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "destructive" | "ghost";
type Size = "md" | "sm";

// DESIGN.md › Buttons: 36px default / 28px compact, 4px radius, no pill shapes.
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-navy text-white border border-transparent hover:bg-navy-hover active:bg-navy-active focus-visible:shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#1E3A8A]",
  secondary:
    "bg-white text-ink border border-line hover:bg-surface-container-low hover:border-line-strong active:bg-surface-container focus-visible:shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#1E3A8A]",
  destructive:
    "bg-critical text-white border border-transparent hover:bg-critical-hover focus-visible:shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#BA1A1A]",
  ghost: "bg-transparent text-ink-body border border-transparent hover:bg-surface-container-low",
};

const SIZES: Record<Size, string> = {
  md: "h-9 px-4 gap-1.5 text-[13px]",
  sm: "h-7 px-2 gap-1 text-[12px]",
};

function classes(variant: Variant, size: Size, className?: string) {
  return [
    "inline-flex items-center justify-center rounded-lg font-sans font-medium whitespace-nowrap transition-colors outline-none disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    variant === "ghost" ? "" : "hover-lift",
    SIZES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  /** Material Symbols icon name rendered before the label. */
  icon?: string;
  children?: ReactNode;
};

type ButtonAsButton = CommonProps & Omit<ComponentProps<"button">, keyof CommonProps> & { href?: undefined };
type ButtonAsLink = CommonProps & Omit<ComponentProps<typeof Link>, keyof CommonProps> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export default function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", icon, children, className, ...rest } = props;
  const content = (
    <>
      {icon && <span className={`material-symbols-outlined ${size === "sm" ? "text-[14px]" : "text-[16px]"}`}>{icon}</span>}
      {children}
    </>
  );

  if (typeof rest.href === "string") {
    return (
      <Link {...(rest as ComponentProps<typeof Link>)} className={classes(variant, size, className)}>
        {content}
      </Link>
    );
  }
  const { type = "button", ...buttonRest } = rest as ComponentProps<"button">;
  return (
    <button type={type} {...buttonRest} className={classes(variant, size, className)}>
      {content}
    </button>
  );
}
