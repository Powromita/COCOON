import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-on-surface antialiased">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-between px-4 py-12 sm:px-6">
        <div className="w-full">
          <div className="mb-12 flex w-full max-w-4xl items-center justify-between text-label-caps uppercase tracking-[0.2em] text-on-surface-variant">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-tertiary-fixed-dim" />
              <span>SYS.V4.2 // HIMALAYAN ENGINE</span>
            </div>
            <div className="flex items-center gap-4 text-mono-metric-sm text-on-surface-variant">
              <span>LAT: 34.1526° N</span>
              <span>ALT: 3,500M</span>
              <span className="font-semibold text-secondary">T_AMB: -18.4°C</span>
            </div>
          </div>

          <div className="flex w-full max-w-4xl flex-col items-center">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 text-mono-metric-sm font-medium text-primary">
                <span className="text-sm">◔</span>
                <span>SUB-ZERO THERMAL ARCHITECTURE</span>
              </div>
              <h1 className="mt-2 font-display-xl tracking-tight text-primary">COCOON</h1>
              <p className="text-body-sm font-medium uppercase tracking-[0.18em] text-on-surface-variant">
                Predict. Compare. Validate.
              </p>
            </div>

            <div className="mb-10 w-full max-w-xl space-y-2 text-center">
              <h2 className="font-headline-md text-on-surface">Who&apos;s designing today?</h2>
              <p className="font-body-md text-on-surface-variant">Choose the mode that fits your need — no technical background required for either.</p>
            </div>

            <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
              <Link
                href="/individual/configure"
                className="group flex min-h-[420px] flex-col justify-between rounded-xl bg-surface-container-lowest p-card-padding shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="space-y-6 flex flex-col">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                      <span className="text-2xl">⌂</span>
                    </div>
                    <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-label-caps text-primary">
                      Simplified Presets
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline-sm text-on-surface transition-colors group-hover:text-primary">
                        Individual / Household
                      </h3>
                      <span className="text-mono-metric-sm text-outline">MOD_01</span>
                    </div>
                    <p className="text-body-sm leading-relaxed text-on-surface-variant">
                      Quick shelter comfort estimate using proven construction presets. No engineering input needed.
                    </p>
                  </div>

                  <div className="space-y-2.5 rounded-lg bg-surface-container-low p-3.5">
                    {[
                      "One-click traditional wall & roof presets (Adobe, Stone, Rammed Earth)",
                      "Plain-language glazing & heater levels (Off, Low, Med, High)",
                      "Instant 48-hr room temperature forecast with habitability zone",
                    ].map((text) => (
                      <div key={text} className="flex items-start gap-2.5 text-body-sm text-on-surface">
                        <span className="mt-0.5 shrink-0 text-sm text-tertiary-container">✓</span>
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded bg-surface-container px-3 py-2 text-mono-metric-sm text-on-surface-variant">
                    <span>ESTIMATION TIME</span>
                    <span className="font-semibold text-primary">&lt; 60 SECONDS</span>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-3 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary">
                    <span>Continue as Individual</span>
                    <span className="text-base">→</span>
                  </div>
                </div>
              </Link>

              <Link
                href="/organization"
                className="group flex min-h-[420px] flex-col justify-between rounded-xl bg-surface-container-lowest p-card-padding shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="space-y-6 flex flex-col">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                      <span className="text-2xl">▣</span>
                    </div>
                    <span className="rounded-full bg-surface-variant px-2.5 py-1 text-label-caps text-primary-container">
                      Defense &amp; CAE Grade
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline-sm text-on-surface transition-colors group-hover:text-primary">
                        Organization / Engineer
                      </h3>
                      <span className="text-mono-metric-sm text-outline">MOD_02</span>
                    </div>
                    <p className="text-body-sm leading-relaxed text-on-surface-variant">
                      Full control over material layers, thermal coefficients, and ANSYS-validated analysis for professional deployment planning.
                    </p>
                  </div>

                  <div className="space-y-2.5 rounded-lg bg-surface-container-low p-3.5">
                    {[
                      "Custom multi-layer composite envelope builder with live U-values",
                      "Advanced NASA earth-skin & heat transfer coefficients (hi/ho)",
                      "Multi-physics ANSYS Fluent 3D FEM benchmarking & audit export",
                    ].map((text) => (
                      <div key={text} className="flex items-start gap-2.5 text-body-sm text-on-surface">
                        <span className="mt-0.5 shrink-0 text-sm text-primary-container">✓</span>
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded bg-surface-container px-3 py-2 text-mono-metric-sm text-on-surface-variant">
                    <span>SOLVER ACCURACY</span>
                    <span className="font-semibold text-primary">FEM CONVERGENCE 10⁻⁴</span>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-3 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary">
                    <span>Continue as Organization</span>
                    <span className="text-base">→</span>
                  </div>
                </div>
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-2 text-body-sm text-on-surface-variant">
              <span className="text-base">◌</span>
              <span>You can switch modes anytime from the navigation bar.</span>
              <span className="rounded bg-surface-container px-1.5 py-0.5 text-[10px] font-mono-metric-sm text-on-surface">
                TAB + ENTER
              </span>
            </div>
          </div>
        </div>

        <div className="mt-12 flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 border-t border-surface-container-high pt-8 text-mono-metric-sm text-outline">
          <div className="flex items-center gap-6">
            <span>ISO 13790 DYNAMIC THERMAL</span>
            <span>ASHRAE 55 COMFORT LIMITS</span>
            <span>EN 12831 PEAK HEATING</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary-container" />
            <span>HIGH-ALTITUDE VALIDATION ACTIVE</span>
          </div>
        </div>
      </div>
    </main>
  );
}
