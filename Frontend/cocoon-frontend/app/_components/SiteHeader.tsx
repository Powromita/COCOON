"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/app/_components/LanguageSwitcher";
import { useT } from "@/app/_lib/i18n";
import { createClient } from "@/utils/supabase/client";

type Mode = "Individual" | "Organization";
type NavKey = "home" | "configure" | "results";

const NAV_ITEM =
  "rounded px-space-md py-space-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface";
const NAV_ITEM_ACTIVE = "rounded bg-surface-container-high px-space-md py-space-xs text-primary";

/**
 * Global application header. Rendered identically on every Individual and
 * Organization page — only the mode label and the highlighted nav item change.
 * "Home" always returns to the mode picker at `/`, in both modes, so there is
 * always a way back out of a flow.
 * The header is `fixed`, so every page places its content inside a `pt-16`
 * wrapper to clear it.
 */
export default function SiteHeader({ mode, active }: { mode: Mode; active: NavKey }) {
  const t = useT();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const base = mode === "Organization" ? "/organization" : "/individual";

  // "Switch Mode" also ends the session — you pick a mode by logging in, so
  // returning to the picker means signing out of the current one first.
  const handleSwitchMode = async () => {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  };
  const items: { key: NavKey; label: string; href: string }[] = [
    { key: "home", label: t("nav.home"), href: "/" },
    { key: "configure", label: t("nav.configure"), href: `${base}/configure` },
    { key: "results", label: t("nav.results"), href: `${base}/results` },
  ];

  return (
    <header className="fixed left-0 top-0 z-50 w-full bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex h-16 w-full items-center justify-between px-space-lg">
        <div className="flex items-center gap-space-lg">
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-md font-bold tracking-tight text-primary">COCOON</span>
              <span className="h-4 w-px bg-outline-variant" />
              <span className="font-mono-metric-sm uppercase tracking-wider text-on-surface-variant">{t("hdr.suite")}</span>
            </div>
            <span className="font-label-caps tracking-wider text-on-surface-variant">{t("hdr.tagline")}</span>
          </div>
          <nav className="hidden items-center gap-space-xs md:flex">
            {items.map((item) =>
              item.key === active ? (
                <span key={item.key} className={NAV_ITEM_ACTIVE}>
                  {item.label}
                </span>
              ) : (
                <Link key={item.key} href={item.href} className={NAV_ITEM}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="flex items-center gap-space-md">
          <LanguageSwitcher />
          <div className="flex items-center gap-space-xs rounded-full bg-surface-container-low px-space-sm py-space-2xs shadow-sm">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="font-mono-metric-sm font-medium text-on-surface">{t(`hdr.mode.${mode}`)}</span>
            <span className="text-outline-variant">|</span>
            <button
              type="button"
              onClick={handleSwitchMode}
              disabled={signingOut}
              className="font-mono-metric-sm text-primary transition-colors hover:underline disabled:opacity-60"
            >
              {signingOut ? "…" : t("hdr.switchMode")}
            </button>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary">
            <span className="text-[18px]">◔</span>
          </div>
        </div>
      </div>
    </header>
  );
}
