import Link from "next/link";

export default function IndividualResultsPage() {
  return (
    <main className="min-h-screen bg-surface text-on-surface antialiased">
      <header className="fixed left-0 top-0 z-50 w-full bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex h-16 w-full items-center justify-between px-space-lg">
          <div className="flex items-center gap-space-lg">
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="text-headline-md font-bold tracking-tight text-primary">COCOON</span>
                <span className="h-4 w-px bg-outline-variant" />
                <span className="font-mono-metric-sm uppercase tracking-wider text-on-surface-variant">PGML Suite</span>
              </div>
              <span className="font-label-caps tracking-wider text-on-surface-variant">Predict. Compare. Validate.</span>
            </div>
            <nav className="hidden items-center gap-space-xs md:flex">
              <Link href="/" className="rounded px-space-md py-space-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
                Home
              </Link>
              <Link href="/individual/configure" className="rounded px-space-md py-space-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
                Configure
              </Link>
              <span className="rounded bg-surface-container-high px-space-md py-space-xs text-primary">Results</span>
            </nav>
          </div>

          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs rounded-full bg-surface-container-low px-space-sm py-space-2xs shadow-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="font-mono-metric-sm font-medium text-on-surface">Individual Mode</span>
              <span className="text-outline-variant">|</span>
              <Link href="/" className="font-mono-metric-sm text-primary transition-colors hover:underline">
                Switch Mode
              </Link>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary">
              <span className="text-[18px]">◔</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full bg-surface pt-16">
        <div className="w-full border-b border-surface-container-high bg-surface-container-lowest shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-space-md px-space-lg py-space-md md:flex-row md:items-center">
            <div className="flex flex-col gap-space-2xs">
              <div className="flex items-center gap-space-xs">
                <span className="font-label-caps uppercase tracking-wider text-primary">Thermal Telemetry Evaluation</span>
                <span className="h-1.5 w-1.5 rounded-full bg-tertiary-container" />
                <span className="font-mono-metric-sm text-outline">Simulation ID: LEH-IND-2026-08A</span>
              </div>
              <h1 className="font-display-xl tracking-tight text-on-surface">48-Hour Household Thermal Assessment</h1>
              <p className="text-body-md text-on-surface-variant">
                Estimated room temperature for 6.0 × 4.0m Adobe Wall shelter in Leh winter conditions.
              </p>
            </div>
            <div className="flex items-center gap-space-sm self-start md:self-auto">
              <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high px-space-sm py-space-xs shadow-sm">
                <span className="text-primary">⌂</span>
                <span className="font-headline-sm text-body-md text-on-surface">Individual Mode</span>
                <span className="text-outline-variant">|</span>
                <Link href="/individual/configure" className="font-mono-metric-sm text-primary hover:underline">
                  Switch
                </Link>
              </div>
              <button className="rounded bg-primary px-space-md py-space-xs text-on-primary shadow-sm transition-colors hover:bg-primary-container" type="button">
                Export Summary
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-space-xl px-space-lg py-space-xl">
          <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
            <div className="inline-flex rounded bg-surface-container-high p-space-2xs shadow-sm" role="tablist">
              <button className="rounded bg-surface-container-lowest px-space-lg py-space-xs font-headline-sm text-primary shadow-sm" type="button">
                Physics Model
              </button>
              <button className="rounded px-space-lg py-space-xs font-headline-sm text-on-surface-variant" type="button">
                ML Rapid Estimate
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-space-md">
              <div className="flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-sm py-space-xs shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-secondary-container" />
                <span className="font-mono-metric-sm text-on-surface">Predicted Room Temp</span>
              </div>
              <div className="flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-sm py-space-xs shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-primary-container" />
                <span className="font-mono-metric-sm text-on-surface">Outdoor Sub-Zero Temp</span>
              </div>
              <div className="flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-sm py-space-xs shadow-sm">
                <span className="h-2.5 w-2.5 rounded bg-tertiary-fixed-dim" />
                <span className="font-mono-metric-sm text-on-surface">Comfort Zone (+16°C to +22°C)</span>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-surface-container-lowest p-space-card-padding shadow-sm">
            <div className="flex flex-col justify-between gap-space-sm pb-space-sm md:flex-row md:items-center">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-sm text-on-surface">Transient Thermal Response (0h - 48h)</span>
                <span className="rounded bg-surface-container-high px-space-xs py-space-2xs font-mono-metric-sm text-primary">Timestep: 1.0 hr</span>
              </div>
              <div className="flex items-center gap-space-md rounded bg-surface-container px-space-md py-space-xs shadow-sm" id="cursor-readout">
                <div className="flex items-center gap-space-2xs">
                  <span className="font-label-caps uppercase text-on-surface-variant">Elapsed:</span>
                  <span className="font-mono-metric-md font-semibold text-on-surface">T+18h</span>
                </div>
                <span className="text-outline-variant">|</span>
                <div className="flex items-center gap-space-2xs">
                  <span className="h-2 w-2 rounded-full bg-secondary-container" />
                  <span className="font-label-caps uppercase text-on-surface-variant">Indoor:</span>
                  <span className="font-mono-metric-md font-semibold text-secondary">+17.0°C</span>
                </div>
                <span className="text-outline-variant">|</span>
                <div className="flex items-center gap-space-2xs">
                  <span className="h-2 w-2 rounded-full bg-primary-container" />
                  <span className="font-label-caps uppercase text-on-surface-variant">Outdoor:</span>
                  <span className="font-mono-metric-md font-semibold text-primary">-22.0°C</span>
                </div>
              </div>
            </div>

            <div className="relative h-80 w-full select-none overflow-hidden pt-space-xs">
              <svg viewBox="0 0 1000 320" className="h-full w-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="comfortGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#85f8c4" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#85f8c4" stopOpacity="0.12" />
                  </linearGradient>
                  <linearGradient id="indoorGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#fe932c" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#fe932c" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <rect x="50" y="70" width="910" height="42" fill="url(#comfortGrad)" />
                <line x1="50" x2="960" y1="70" y2="70" stroke="#004a32" strokeDasharray="3 3" strokeOpacity="0.45" />
                <line x1="50" x2="960" y1="112" y2="112" stroke="#004a32" strokeDasharray="3 3" strokeOpacity="0.45" />
                <text x="965" y="74" fill="#004a32" fontSize="10" fontFamily="JetBrains Mono">+22°C</text>
                <text x="965" y="116" fill="#004a32" fontSize="10" fontFamily="JetBrains Mono">+16°C</text>
                <line x1="50" x2="960" y1="30" y2="30" stroke="#dce9ff" strokeDasharray="2 4" />
                <line x1="50" x2="960" y1="154" y2="154" stroke="#dce9ff" strokeDasharray="2 4" />
                <line x1="50" x2="960" y1="210" y2="210" stroke="#dce9ff" strokeDasharray="2 4" />
                <line x1="50" x2="960" y1="266" y2="266" stroke="#dce9ff" strokeDasharray="2 4" />
                <text x="20" y="34" fill="#757682" fontSize="10" fontFamily="JetBrains Mono">+28°C</text>
                <text x="20" y="158" fill="#757682" fontSize="10" fontFamily="JetBrains Mono">+10°C</text>
                <text x="20" y="214" fill="#757682" fontSize="10" fontFamily="JetBrains Mono">0°C (Freeze)</text>
                <text x="20" y="270" fill="#757682" fontSize="10" fontFamily="JetBrains Mono">-25°C</text>
                <line x1="50" x2="960" y1="290" y2="290" stroke="#cbd5e1" strokeWidth="1" />
                <g fill="#757682" fontSize="10" fontFamily="JetBrains Mono">
                  <text x="50" y="306">Day 1 00:00</text>
                  <text x="277" y="306">12:00 (Noon)</text>
                  <text x="505" y="306">Day 2 00:00</text>
                  <text x="732" y="306">12:00 (Noon)</text>
                  <text x="935" y="306">48:00</text>
                </g>
                <path d="M 50,268 C 120,278 180,282 250,220 C 310,165 370,185 450,272 C 530,285 620,290 710,215 C 770,160 840,190 960,268" fill="none" stroke="#1e3a8a" strokeLinecap="round" strokeWidth="2.2" />
                <path d="M 50,118 C 120,116 180,110 270,92 C 340,78 410,88 490,116 C 560,120 630,112 720,90 C 790,76 860,92 960,118 L 960,290 L 50,290 Z" fill="url(#indoorGrad)" />
                <path d="M 50,118 C 120,116 180,110 270,92 C 340,78 410,88 490,116 C 560,120 630,112 720,90 C 790,76 860,92 960,118" fill="none" stroke="#fe932c" strokeLinecap="round" strokeWidth="3" />
              </svg>
              <div className="absolute bottom-1 right-2 rounded bg-surface-container-lowest/90 px-space-xs py-space-2xs text-label-caps tracking-wider text-outline">
                Hover along graph to sample hours
              </div>
            </div>
          </div>

          <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Minimum Room Temp", value: "+15.2°C", detail: "Occurs: 05:30 AM (Coldest Exterior)", tone: "text-primary" },
              { label: "Maximum Room Temp", value: "+18.8°C", detail: "Occurs: 15:15 PM (South Glazing)", tone: "text-secondary" },
              { label: "Average Room Temp", value: "+17.1°C", detail: "ΔT vs Outdoor: +36.2°C Delta", tone: "text-primary-container" },
              { label: "Daily Fuel Equivalent", value: "~12.4 L/day", detail: "Passive envelope insulation benefit", tone: "text-on-surface" },
            ].map((card) => (
              <div key={card.label} className="rounded-lg bg-surface-container-lowest p-space-card-padding shadow-sm">
                <div className="flex items-center justify-between pb-space-xs">
                  <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">{card.label}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-high text-primary">⌂</span>
                </div>
                <div className="py-space-xs">
                  <div className={`font-mono-metric-lg font-semibold tracking-tight ${card.tone}`}>{card.value}</div>
                </div>
                <div className="mt-space-xs rounded bg-surface-container-low px-space-xs py-space-2xs font-mono-metric-sm text-outline">{card.detail}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-surface-container-lowest p-space-card-padding shadow-sm">
            <div className="flex flex-col justify-between gap-space-sm pb-space-xs md:flex-row md:items-center">
              <div className="flex items-center gap-space-xs">
                <span className="text-primary">ⓘ</span>
                <h2 className="font-headline-md text-on-surface">What This Means For Your Shelter</h2>
              </div>
              <div className="flex items-center gap-space-xs rounded-full bg-tertiary-container/10 px-space-sm py-space-2xs">
                <span className="h-2 w-2 rounded-full bg-tertiary-container" />
                <span className="font-mono-metric-sm text-tertiary-container">Safe Habitat Certified</span>
              </div>
            </div>

            <div className="mt-space-lg grid gap-space-xl lg:grid-cols-[1.5fr_0.8fr]">
              <div className="flex flex-col gap-space-md">
                <p className="text-body-lg leading-relaxed text-on-surface">
                  Your selected 600mm Adobe walls and double-glazed windows store warmth gathered during sunny daylight hours and release it gently through the sub-zero night. Even when the outside temperature drops to -24.8°C, the shelter stays comfortably above freezing without requiring dangerously heavy fuel stoves.
                </p>
                <div className="grid gap-space-sm sm:grid-cols-3">
                  {[
                    ["Frost Protected", "100% Freezing Avoidance"],
                    ["Solar Retention", "4.8 hrs passive heat storage"],
                    ["Air Quality", "Low indoor smoke dependency"],
                  ].map(([title, value]) => (
                    <div key={title} className="rounded bg-surface-container-low p-space-md">
                      <div className="flex items-start gap-space-sm">
                        <span className="mt-0.5 text-tertiary-container">✓</span>
                        <div>
                          <span className="text-headline-sm text-on-surface">{title}</span>
                          <span className="mt-1 block text-body-sm text-on-surface-variant">{value}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded bg-surface-container p-space-md">
                <div className="flex flex-col gap-space-sm">
                  <span className="font-label-caps uppercase tracking-wider text-outline">Shelter Parameters</span>
                  <div className="flex items-center justify-between py-space-2xs">
                    <span className="font-body-sm text-on-surface-variant">Footprint</span>
                    <span className="font-mono-metric-sm text-on-surface">6.0 × 4.0 m (24.0 m²)</span>
                  </div>
                  <div className="flex items-center justify-between py-space-2xs">
                    <span className="font-body-sm text-on-surface-variant">Wall Material</span>
                    <span className="font-mono-metric-sm text-on-surface">Adobe Earth (600 mm)</span>
                  </div>
                  <div className="flex items-center justify-between py-space-2xs">
                    <span className="font-body-sm text-on-surface-variant">Glazing</span>
                    <span className="font-mono-metric-sm text-on-surface">Double Pane</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </main>
  );
}
