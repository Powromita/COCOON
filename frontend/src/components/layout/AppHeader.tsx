"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS, ROUTES, isNavItemActive } from "@/lib/routes";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import { T, useT } from "@/lib/i18n";


const ACTIVE_LINK =
  "px-space-sm py-1.5 font-body-sm text-body-sm transition-colors bg-primary-container text-on-primary font-medium rounded-lg";
const IDLE_LINK =
  "px-space-sm py-1.5 font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors";

/** Station clock pinned to IST; rendered client-side only to avoid hydration mismatch. */
function useStationTime() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function AppHeader() {
  const pathname = usePathname();
  const stationTime = useStationTime();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-16 w-full px-gutter-lg flex items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-md shrink-0">
          <Link href={ROUTES.dashboard} className="flex items-center gap-space-sm">
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-headline-sm tracking-tight text-primary font-bold"><T>COCOON</T></span>
                <span className="font-label-mono-xs text-label-mono-xs bg-surface-container text-on-surface px-space-xs py-0.5 rounded-full">
                  <T>MIL-SPEC</T> <span className="font-data">v4.2</span>
                </span>
              </div>
              <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">
                <T>MIL-SPEC Thermal Platform</T>
              </span>
            </div>
          </Link>
          <div className="hidden min-[1800px]:flex items-center gap-space-xs px-space-md py-2.5 bg-surface-container-low rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
            </span>
            <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant font-medium tracking-wide">
              <T>DAULAT BEG OLDI SECTOR (</T><span className="font-data">-38.2°C</span> @ <span className="font-data">5,065m</span> <T>AMSL) • SOLVER ENGINE READY</T>
            </span>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-space-xs shrink-0" aria-label={t("Primary")}>
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active ? ACTIVE_LINK : IDLE_LINK}
              >
                <T>{item.label}</T>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-space-md shrink-0">
          <div className="hidden md:flex lg:hidden xl:flex flex-col items-end">
            <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase"><T>STATION TIME</T></span>
            <span className="font-data text-label-mono-sm text-on-surface font-semibold" suppressHydrationWarning>
              {stationTime ?? "--:--:--"} UTC+05:30
            </span>
          </div>
          <Link
            href={ROUTES.candidateTelemetry}
            className="hidden sm:flex lg:hidden 2xl:flex items-center gap-space-xs px-space-sm py-1 bg-surface-container text-on-surface rounded hover:bg-surface-container-high transition-colors hover-lift"
          >
            <span className="material-symbols-outlined text-[14px] text-secondary">sync</span>
            <span className="font-label-mono-xs text-label-mono-xs uppercase font-medium"><span className="font-data">2</span> <T>RUNS IN SOLVER QUEUE</T></span>
          </Link>
          <LanguageToggle />
          <button
            type="button"
            aria-label={t("Notifications")}
            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded-full"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <div className="flex items-center gap-space-md pl-space-sm">
            <div className="hidden min-[2200px]:flex flex-col text-right">
              <span className="font-body-sm text-body-sm text-on-surface font-semibold leading-tight">
                <T>Lt. Col. Vikramaditya Rathore</T>
              </span>
              <div className="flex items-center justify-end gap-space-xs">
                <span className="font-label-mono-xs text-label-mono-xs text-secondary font-medium">
                  <T>LEAD THERMAL ARCHITECT</T>
                </span>
              </div>
              <span className="font-label-mono-xs text-label-mono-xs text-on-surface-variant">
                <T>Directorate of High Altitude Defence Infrastructure (DHADI)</T>
              </span>
            </div>
            <Link
              href={ROUTES.login}
              title={t("Sign out")}
              className="w-10 h-10 shrink-0 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-mono-md text-label-mono-md font-bold ring-2 ring-surface-container-low hover:ring-primary-fixed transition-shadow"
            >
              <T>VR</T>
            </Link>
          </div>
          <button
            type="button"
            aria-label={t(mobileOpen ? "Close navigation" : "Open navigation")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
            className="lg:hidden p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded"
          >
            <span className="material-symbols-outlined text-[22px]">{mobileOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          aria-label={t("Primary mobile")}
          className="lg:hidden border-t border-line-sub bg-surface-container-lowest px-gutter-lg py-space-sm flex flex-col gap-1 shadow-flyout"
        >
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={active ? ACTIVE_LINK : `${IDLE_LINK} rounded-lg hover:bg-surface-container-low`}
              >
                <T>{item.label}</T>
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
