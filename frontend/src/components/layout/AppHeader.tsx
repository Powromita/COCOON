"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { NAV_ITEMS, ROUTES, isNavItemActive } from "@/lib/routes";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import { T, useT } from "@/lib/i18n";

export default function AppHeader({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Mock auth: there is no session to clear, just return to the login screen.
  function signOut() {
    router.replace(ROUTES.login);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-line shadow-xs transition-all">
      <div className="h-16 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        
        {/* 1. Left: Clean Brand Logo */}
        <Link
          href={ROUTES.dashboard}
          className="flex items-center gap-2.5 group focus:outline-none shrink-0"
        >
          <div className="w-9 h-9 rounded-xl bg-navy text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-[20px] text-cyan-300">shield</span>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-navy leading-none">
              COCOON
            </span>
            <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mt-0.5">
              Thermal Engineering
            </span>
          </div>
        </Link>

        {/* 2. Center: Sleek Floating Navigation Pill */}
        <nav
          className="hidden md:flex items-center gap-1 bg-surface-container-low/90 p-1 rounded-full border border-line shadow-2xs shrink-0"
          aria-label={t("Primary")}
        >
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-navy text-white shadow-xs"
                    : "text-on-surface-variant hover:text-navy hover:bg-surface-container-lowest"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    active ? "text-cyan-300" : "text-ink-muted"
                  }`}
                >
                  {item.icon}
                </span>
                <T>{item.label}</T>
              </Link>
            );
          })}
        </nav>

        {/* 3. Right: Quick Action, Language & Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          
          {/* New Simulation CTA */}
          <Link
            href={ROUTES.shelterConfigurator.step1}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-navy hover:bg-navy-hover text-white text-xs font-semibold shadow-xs hover-lift transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span><T>New Design</T></span>
          </Link>

          {/* Language Toggle */}
          <LanguageToggle className="shrink-0" />

          {/* User Profile Dropdown */}
          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-navy/20 transition-all focus:outline-none"
              title={userName}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-navy to-[#1e3a8a] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"}
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-surface-container-lowest rounded-2xl border border-line shadow-card p-4 z-50 text-xs flex flex-col gap-3 animate-fade-in">
                <div className="flex flex-col border-b border-surface-container pb-3">
                  <span className="font-bold text-navy text-sm">{userName}</span>
                  <span className="text-[10px] text-on-surface-variant mt-0.5">{userEmail}</span>
                </div>
                <div className="border-t border-surface-container pt-2">
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); void signOut(); }}
                    className="flex items-center gap-1.5 text-error hover:underline font-semibold text-xs py-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    <T>Sign Out</T>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            aria-label={t(mobileOpen ? "Close navigation" : "Open navigation")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-2 text-on-surface-variant hover:text-navy hover:bg-surface-container transition-colors rounded-xl shrink-0"
          >
            <span className="material-symbols-outlined text-[24px]">
              {mobileOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileOpen && (
        <div className="md:hidden border-t border-line bg-surface-container-lowest/98 backdrop-blur-md px-4 py-4 flex flex-col gap-3 shadow-flyout animate-fade-in">
          <nav aria-label={t("Primary mobile")} className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isNavItemActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? "bg-navy text-white shadow-xs"
                      : "text-on-surface-variant hover:text-navy hover:bg-surface-container-low"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${active ? "text-cyan-300" : "text-navy"}`}>
                    {item.icon}
                  </span>
                  <T>{item.label}</T>
                </Link>
              );
            })}
          </nav>

          <Link
            href={ROUTES.shelterConfigurator.step1}
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-navy text-white text-xs font-semibold hover:bg-navy-hover transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <T>New Design</T>
          </Link>
        </div>
      )}
    </header>
  );
}
