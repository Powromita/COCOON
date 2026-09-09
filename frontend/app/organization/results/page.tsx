import Link from "next/link";

import DesignFlowNavigation from "@/components/navigation/DesignFlowNavigation";

export default function OrganizationResultsPage() {
  return (
    <main className="min-h-screen bg-surface text-on-surface antialiased">
      <header className="sticky top-0 z-50 w-full border-b border-surface-container-high bg-surface-container-lowest/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-space-lg">
          <div className="flex items-center gap-space-lg">
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="text-[22px] font-bold tracking-tight text-on-surface">COCOON</span>
                <span className="hidden h-4 w-px bg-outline-variant sm:inline-block" />
                <span className="hidden text-body-sm text-outline sm:inline-block">Predict. Compare. Validate.</span>
              </div>
            </div>
            <DesignFlowNavigation mode="organization" />
          </div>

          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs rounded-full bg-surface-container-low px-space-sm py-space-2xs shadow-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="font-mono-metric-sm font-medium text-on-surface">Organization Mode</span>
              <span className="text-outline-variant">|</span>
              <Link href="/" className="font-mono-metric-sm text-primary transition-colors hover:underline">
                Switch Mode
              </Link>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary">
              <span className="text-[18px]">▣</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full flex-1 bg-surface pt-0">
        <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8">
          <div className="flex flex-col justify-between gap-space-lg pb-space-xs lg:flex-row lg:items-end">
            <div className="space-y-space-2xs">
              <div className="flex items-center gap-space-xs">
                <span className="rounded bg-surface-container px-space-xs py-0.5 font-mono-metric-sm uppercase tracking-wider text-primary">Transient Validation</span>
                <span className="text-outline">•</span>
                <span className="font-mono-metric-sm text-outline">RUN_ID: SIM-2026-LDK-48H</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">48-Hour Transient Thermal Analysis</h1>
              <p className="w-full max-w-3xl text-body-md text-on-surface-variant">
                Simulated response for 6.0 × 4.0 × 2.8m PUF Shelter • Location: Leh (-22°C Peak Solstice) • Internal Load: 850W
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-space-sm">
              <div className="inline-flex rounded-lg bg-surface-container p-1 shadow-sm">
                <button type="button" className="rounded px-space-sm py-1.5 text-body-sm font-medium text-on-surface-variant">
                  Physics (RC Network)
                </button>
                <button type="button" className="rounded px-space-sm py-1.5 text-body-sm font-medium text-on-surface-variant">
                  ML Surrogate
                </button>
                <button type="button" className="rounded bg-primary px-space-sm py-1.5 text-body-sm font-semibold text-on-primary shadow-sm">
                  ANSYS Validated (Overlay FEM)
                </button>
              </div>
              <div className="flex items-center gap-space-xs">
                <button type="button" className="rounded bg-surface-container-lowest px-space-sm py-2 text-body-sm font-medium text-on-surface shadow-sm hover:bg-surface-container">
                  Export CSV Data
                </button>
                <button type="button" className="rounded bg-primary px-space-sm py-2 text-body-sm font-medium text-on-primary shadow-sm hover:bg-primary-container">
                  Generate Defence Audit PDF
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-surface-container-high/60 bg-surface-container-lowest p-6 shadow-md">
            <div className="flex flex-col justify-between gap-space-sm pb-space-xs md:flex-row md:items-center">
              <div className="flex flex-wrap items-center gap-space-md font-body-sm text-on-surface">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-3.5 rounded-full bg-secondary-container" />
                  <span className="font-medium">Predicted Indoor (°C)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-3.5 rounded-full bg-primary-container" />
                  <span className="font-medium text-on-surface-variant">Ambient Outdoor (°C)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-3.5 border-t-2 border-dashed border-on-surface" />
                  <span className="font-medium text-on-surface">ANSYS Fluent 3D FEM (°C)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-tertiary-fixed-dim/30" />
                  <span className="font-mono-metric-sm text-tertiary">Comfort Zone (+16°C to +22°C)</span>
                </div>
              </div>

              <div className="flex items-center gap-space-xs rounded bg-surface-container-low px-space-sm py-1 font-mono-metric-sm text-on-surface" id="live-telemetry">
                <span className="text-outline">CURSOR:</span>
                <span className="font-bold text-primary">T+18h</span>
                <span className="text-outline-variant">|</span>
                <span>Amb: <strong className="text-primary-container">-24.8°C</strong></span>
                <span className="text-outline-variant">|</span>
                <span>Indoor: <strong className="text-secondary-container">+18.2°C</strong></span>
              </div>
            </div>

            <div className="relative mt-5 w-full overflow-hidden select-none" id="chart-container">
              <svg viewBox="0 0 1000 360" className="h-[360px] w-full overflow-visible" id="transient-chart">
                <g className="stroke-current text-outline-variant/40" strokeDasharray="2,4" strokeWidth="0.75">
                  <line x1="45" x2="980" y1="33" y2="33" />
                  <line x1="45" x2="980" y1="98" y2="98" />
                  <line x1="45" x2="980" y1="163" y2="163" strokeDasharray="none" strokeWidth="1.2" className="text-outline" />
                  <line x1="45" x2="980" y1="229" y2="229" />
                  <line x1="45" x2="980" y1="294" y2="294" />
                  <line x1="45" x2="45" y1="20" y2="320" />
                  <line x1="162" x2="162" y1="20" y2="320" />
                  <line x1="279" x2="279" y1="20" y2="320" />
                  <line x1="395" x2="395" y1="20" y2="320" />
                  <line x1="512" x2="512" y1="20" y2="320" />
                  <line x1="629" x2="629" y1="20" y2="320" />
                  <line x1="746" x2="746" y1="20" y2="320" />
                  <line x1="863" x2="863" y1="20" y2="320" />
                  <line x1="980" x2="980" y1="20" y2="320" />
                </g>
                <g className="fill-current text-outline font-mono-metric-sm text-[10px]">
                  <text x="36" y="37" textAnchor="end">+20°C</text>
                  <text x="36" y="60" textAnchor="end" className="fill-tertiary font-bold">+16°C</text>
                  <text x="36" y="102" textAnchor="end">+10°C</text>
                  <text x="36" y="167" textAnchor="end" className="fill-error font-bold">0°C (Freeze)</text>
                  <text x="36" y="233" textAnchor="end">-10°C</text>
                  <text x="36" y="298" textAnchor="end">-20°C</text>
                </g>
                <rect x="45" y="20" width="935" height="39" className="fill-tertiary-fixed-dim/20" />
                <line x1="45" x2="980" y1="20" y2="20" className="stroke-tertiary-fixed-dim" strokeDasharray="4,4" />
                <line x1="45" x2="980" y1="59" y2="59" className="stroke-tertiary-fixed-dim" strokeDasharray="4,4" />
                <rect x="201" y="20" width="156" height="300" className="fill-secondary-fixed/15" />
                <rect x="669" y="20" width="156" height="300" className="fill-secondary-fixed/15" />
                <path d="M 45,254 C 100,268 140,300 201,310 C 240,318 260,265 318,241 C 360,225 390,260 435,290 C 470,315 500,332 550,333 C 610,335 650,285 708,245 C 750,222 790,250 835,285 C 880,312 920,328 980,330" fill="none" stroke="#1e3a8a" strokeLinecap="round" strokeWidth="2.5" />
                <path d="M 45,45 C 100,47 140,50 201,48 C 240,46 280,36 330,35 C 380,35 430,48 480,52 C 530,55 570,54 629,51 C 680,47 720,37 780,34 C 830,32 870,42 920,47 C 950,50 970,51 980,51" fill="none" stroke="#0b1c30" strokeDasharray="5,4" strokeLinecap="round" strokeWidth="2" />
                <path d="M 45,43 C 100,45 140,49 201,47 C 240,45 280,34 330,34 C 380,34 430,47 480,51 C 530,54 570,53 629,50 C 680,46 720,35 780,33 C 830,31 870,41 920,46 C 950,49 970,50 980,50" fill="none" stroke="#fe932c" strokeLinecap="round" strokeWidth="3" />
                <g id="interactive-cursor">
                  <line x1="395" x2="395" y1="20" y2="330" className="stroke-primary" strokeDasharray="2,2" strokeWidth="1.5" />
                  <circle cx="395" cy="40" r="5" className="fill-secondary-container stroke-surface-container-lowest" strokeWidth="2" />
                  <circle cx="395" cy="42" r="4" className="fill-on-surface stroke-surface-container-lowest" strokeWidth="1.5" />
                  <circle cx="395" cy="270" r="5" className="fill-primary-container stroke-surface-container-lowest" strokeWidth="2" />
                </g>
                <g className="fill-current text-on-surface-variant font-mono-metric-sm text-[11px]">
                  <text x="45" y="348" textAnchor="middle">T+0h</text>
                  <text x="162" y="348" textAnchor="middle">T+6h</text>
                  <text x="279" y="348" textAnchor="middle">T+12h</text>
                  <text x="395" y="348" textAnchor="middle">T+18h</text>
                  <text x="512" y="348" textAnchor="middle">T+24h</text>
                  <text x="629" y="348" textAnchor="middle">T+30h</text>
                  <text x="746" y="348" textAnchor="middle">T+36h</text>
                  <text x="863" y="348" textAnchor="middle">T+42h</text>
                  <text x="980" y="348" textAnchor="middle">T+48h</text>
                </g>
              </svg>
            </div>
          </div>

          <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Min Indoor Habitat", "+16.8°C", "Safe Threshold • T+22h", "tertiary"],
              ["Max Indoor Habitat", "+19.8°C", "Controlled Solar Peak • T+38h", "secondary"],
              ["Average Regime", "+18.4°C", "Target: 18.0°C ± 1.5°C", "primary"],
              ["Total Envelope Loss", "1,240 W", "Thermal Efficiency: 91.4%", "error"],
            ].map(([label, value, sub, tone]) => (
              <div key={label} className="rounded-xl border border-surface-container-high/50 bg-surface-container-lowest p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between text-outline">
                  <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
                  <span className="text-[20px]">
                    {tone === "tertiary" ? "❄" : tone === "secondary" ? "☀" : tone === "primary" ? "◌" : "⚡"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="font-mono-metric-lg text-[28px] font-bold text-on-surface">{value}</div>
                  <div className="font-mono-metric-sm text-xs text-on-surface">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-space-lg lg:grid-cols-12">
            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-5">
              <div className="space-y-4 pl-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">Benchmark Rigor</span>
                  <span className="rounded bg-surface-container px-2.5 py-1 font-mono-metric-sm text-primary">CONVERGED</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-on-surface">±0.8°C Precision vs 3D FEM</h2>
                  <p className="mt-2 text-sm leading-normal text-on-surface-variant">Physics-guided graph neural network evaluated against finite element computational fluid dynamics.</p>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    ["MAE", "0.42°C"],
                    ["RMSE", "0.61°C"],
                    ["Correlation", "0.994"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-surface-container-high/40 bg-surface-container-low p-3.5">
                      <span className="font-label-caps text-[10px] uppercase text-outline">{label}</span>
                      <span className="mt-1.5 block font-mono-metric-md font-bold text-on-surface">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-7">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-secondary-container">◍</span>
                    <h2 className="text-xl font-bold tracking-tight text-on-surface">Why This Result: Physical Rationale &amp; Defense Logistics</h2>
                  </div>
                  <span className="font-mono-metric-sm text-xs tracking-wide text-outline">HIGH-ALTITUDE SPECS</span>
                </div>
                <p className="text-[15px] leading-7 text-on-surface-variant">
                  The high-insulation 150mm PUF sandwich envelope combined with 2,400 kJ/K internal thermal capacitance acts as a thermal flywheel. Despite outdoor ambient plunging to -26.0°C at 04:00 hrs, the 850W internal equipment load and residual solar heat storage maintain the core habitat well above the critical freezing threshold without supplemental diesel space heating.
                </p>
                <div className="rounded-lg border border-surface-container-high/40 bg-surface-container-low p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-primary">◌</span>
                    <p className="text-xs text-on-surface-variant sm:text-sm">
                      Operational Impact: Eliminates kerosene soot contamination risks in enclosed shelters and minimizes vulnerable high-mountain fuel convoys along the Zojila pass.
                    </p>
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
