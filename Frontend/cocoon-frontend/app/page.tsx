"use client";

import Link from "next/link";
import LanguageSwitcher from "@/app/_components/LanguageSwitcher";
import { useT } from "@/app/_lib/i18n";

export default function HomePage() {
  const t = useT();

  return (
    <main className="min-h-screen bg-background text-on-surface antialiased">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-between px-4 py-12 sm:px-6">
        <div className="w-full">
          <div className="mb-12 flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 font-label-caps uppercase tracking-[0.2em] text-on-surface-variant">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-tertiary-fixed-dim" />
              <span>SYS.V4.2 // HIMALAYAN ENGINE</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 font-mono-metric-sm text-on-surface-variant">
                <span>LAT: 34.1526° N</span>
                <span>ALT: 3,500M</span>
                <span className="font-semibold text-secondary">T_AMB: -18.4°C</span>
              </div>
              <LanguageSwitcher />
            </div>
          </div>

          <div className="flex w-full max-w-4xl flex-col items-center">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 font-mono-metric-sm font-medium text-primary">
                <span className="text-sm">◔</span>
                <span>{t("home.badge")}</span>
              </div>
              <h1 className="mt-2 font-display-xl tracking-tight text-primary">COCOON</h1>
              <p className="font-body-sm font-medium uppercase tracking-[0.18em] text-on-surface-variant">
                {t("hdr.tagline")}
              </p>
            </div>

            <div className="mb-10 w-full min-w-0 max-w-xl space-y-2 text-center">
              <h2 className="font-headline-md text-on-surface">{t("home.q")}</h2>
              <p className="w-full min-w-0 font-body-md text-on-surface-variant">{t("home.sub")}</p>
            </div>

            <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
              <Link
                href="/auth/individual"
                className="group flex min-h-[420px] flex-col justify-between rounded-xl bg-surface-container-lowest p-card-padding shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="space-y-6 flex flex-col">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                      <span className="text-2xl">⌂</span>
                    </div>
                    <span className="rounded-full bg-surface-container-low px-2.5 py-1 font-label-caps text-primary">
                      {t("home.ind.tag")}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline-sm text-on-surface transition-colors group-hover:text-primary">
                        {t("home.ind.title")}
                      </h3>
                      <span className="font-mono-metric-sm text-outline">MOD_01</span>
                    </div>
                    <p className="font-body-sm leading-relaxed text-on-surface-variant">{t("home.ind.desc")}</p>
                  </div>

                  <div className="space-y-2.5 rounded-lg bg-surface-container-low p-3.5">
                    {["home.ind.f1", "home.ind.f2", "home.ind.f3"].map((key) => (
                      <div key={key} className="flex items-start gap-2.5 font-body-sm text-on-surface">
                        <span className="mt-0.5 shrink-0 text-sm text-tertiary-container">✓</span>
                        <span>{t(key)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded bg-surface-container px-3 py-2 font-mono-metric-sm text-on-surface-variant">
                    <span>{t("home.ind.metric")}</span>
                    <span className="font-semibold text-primary">{t("home.ind.metricVal")}</span>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-3 font-body-md font-semibold text-on-primary transition-colors hover:bg-primary">
                    <span>{t("home.ind.cta")}</span>
                    <span className="text-base">→</span>
                  </div>
                </div>
              </Link>

              <Link
                href="/auth/organization"
                className="group flex min-h-[420px] flex-col justify-between rounded-xl bg-surface-container-lowest p-card-padding shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="space-y-6 flex flex-col">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                      <span className="text-2xl">▣</span>
                    </div>
                    <span className="rounded-full bg-surface-variant px-2.5 py-1 font-label-caps text-primary-container">
                      {t("home.org.tag")}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline-sm text-on-surface transition-colors group-hover:text-primary">
                        {t("home.org.title")}
                      </h3>
                      <span className="font-mono-metric-sm text-outline">MOD_02</span>
                    </div>
                    <p className="font-body-sm leading-relaxed text-on-surface-variant">{t("home.org.desc")}</p>
                  </div>

                  <div className="space-y-2.5 rounded-lg bg-surface-container-low p-3.5">
                    {["home.org.f1", "home.org.f2", "home.org.f3"].map((key) => (
                      <div key={key} className="flex items-start gap-2.5 font-body-sm text-on-surface">
                        <span className="mt-0.5 shrink-0 text-sm text-primary-container">✓</span>
                        <span>{t(key)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded bg-surface-container px-3 py-2 font-mono-metric-sm text-on-surface-variant">
                    <span>{t("home.org.metric")}</span>
                    <span className="font-semibold text-primary">{t("home.org.metricVal")}</span>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-3 font-body-md font-semibold text-on-primary transition-colors hover:bg-primary">
                    <span>{t("home.org.cta")}</span>
                    <span className="text-base">→</span>
                  </div>
                </div>
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-2 font-body-sm text-on-surface-variant">
              <span className="text-base">◌</span>
              <span>{t("home.switchNote")}</span>
              <span className="rounded bg-surface-container px-1.5 py-0.5 text-[10px] font-mono-metric-sm text-on-surface">
                TAB + ENTER
              </span>
            </div>
          </div>
        </div>

        <div className="mt-12 flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 border-t border-surface-container-high pt-8 font-mono-metric-sm text-outline">
          <div className="flex items-center gap-6">
            <span>{t("home.std1")}</span>
            <span>{t("home.std2")}</span>
            <span>{t("home.std3")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary-container" />
            <span>{t("home.valActive")}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
