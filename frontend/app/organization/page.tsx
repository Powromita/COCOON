import Link from "next/link";

const pipelineSteps = [
  { number: "STEP 01 // INPUT", title: "Geometry & Multi-layer Envelope", description: "Specify structural boundary parameters, Aerogel/VIP multi-layer R-values, occupancy convective dissipation (85W/soldier), high-altitude zenith solar incidence, and sub-zero boundary ambient baselines down to -45°C.", meta: ["Wall U-factor: 0.118 W/m²K", "Atmospheric Pressure: 54.2 kPa (Nyoma)"] },
  { number: "STEP 02 // PREDICT", title: "Physics-Guided RC Network & ML", description: "Sub-second hourly transient thermal loop solving coupled non-linear conduction, forced infiltration convection, and surface radiation differential equations via low-dimensional surrogate neural operators.", meta: ["Solver Iteration: 100 timesteps/s", "Surrogate Latency: 42 ms"] },
  { number: "STEP 03 // VALIDATE", title: "ANSYS 3D FEM Benchmarking", description: "Automated error delta mapping against full transient Navier-Stokes finite volume models. Yields continuous node-by-node validation ensuring ±0.8°C strict threshold safety compliance in habitability pockets.", meta: ["Mesh Nodes: 1.84M tetrahedral", "Confidence Index: 99.4%"] },
];

export default function OrganizationLandingPage() {
  return (
    <main className="min-h-screen bg-surface text-on-surface antialiased">
      <header className="sticky top-0 z-50 w-full border-b border-surface-container-high bg-surface-container-lowest/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-space-lg">
          <div className="flex items-center gap-space-md">
            <span className="text-headline-md font-bold tracking-tight text-on-surface">COCOON</span>
            <span className="hidden h-4 w-px bg-outline-variant sm:inline-block" />
            <span className="hidden text-body-sm text-outline sm:inline-block">Predict. Compare. Validate.</span>
          </div>
          <nav className="flex items-center gap-space-xs">
            <span className="rounded bg-surface-container px-space-sm py-space-2xs text-primary">Home</span>
            <Link href="/organization/configure" className="rounded px-space-sm py-space-2xs text-on-surface-variant transition-colors hover:text-on-surface">
              Configure
            </Link>
            <Link href="/organization/results" className="rounded px-space-sm py-space-2xs text-on-surface-variant transition-colors hover:text-on-surface">
              Results
            </Link>
          </nav>
        </div>
      </header>

      <main className="w-full flex-1 bg-surface pt-0">
        <section className="relative overflow-hidden bg-surface py-space-2xl">
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <svg viewBox="0 0 100 100" className="h-full w-full text-surface-container-high" fill="none" preserveAspectRatio="none">
              <path d="M0 20 H100 M0 40 H100 M0 60 H100 M0 80 H100" stroke="currentColor" strokeDasharray="2 3" strokeWidth="0.3" />
              <path d="M20 0 V100 M40 0 V100 M60 0 V100 M80 0 V100" stroke="currentColor" strokeDasharray="2 3" strokeWidth="0.3" />
            </svg>
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-space-lg">
            <div className="flex flex-col items-start">
              <div className="inline-flex items-center gap-space-xs rounded bg-surface-container px-space-sm py-space-2xs text-mono-metric-sm font-semibold uppercase tracking-wider text-primary shadow-sm">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span>DEFENCE-GRADE CLIMATE ENGINEERING • HIMALAYAN SECTOR</span>
              </div>
              <h1 className="mt-space-md font-display-xl tracking-tight text-on-surface">
                Engineered Warmth for the World&apos;s Coldest Frontiers
              </h1>
              <p className="mt-space-md w-full max-w-3xl text-body-lg leading-relaxed text-on-surface-variant">
                Physics-Guided Machine Learning surrogate models trained on 1,000+ conjugate heat transfer scenarios, calibrated against 3D ANSYS Fluent FEM for sub-zero shelter envelope optimization.
              </p>
              <div className="mt-space-xl flex flex-wrap items-center gap-space-md">
                <Link href="/organization/configure" className="inline-flex items-center gap-space-xs rounded bg-primary px-space-lg py-space-sm text-headline-sm font-semibold text-on-primary shadow-md transition-colors hover:bg-on-primary-fixed-variant">
                  <span>Launch Simulator</span>
                  <span className="text-[18px]">→</span>
                </Link>
                <button type="button" className="inline-flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-lg py-space-sm text-body-md text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container-low">
                  <span className="text-[18px] text-outline">◍</span>
                  <span>Read Methodology (SIH 2026 Paper)</span>
                </button>
              </div>
              <div className="mt-space-xl flex flex-wrap items-center gap-space-sm rounded bg-surface-container-lowest px-space-md py-space-xs shadow-sm">
                <div className="flex items-center gap-space-2xs font-mono-metric-sm text-on-surface">
                  <span className="text-primary">◁</span>
                  <span>Validated at -35°C Ambient</span>
                </div>
                <span className="text-outline-variant">•</span>
                <div className="flex items-center gap-space-2xs font-mono-metric-sm text-on-surface">
                  <span className="text-primary">△</span>
                  <span>Ladakh / Siachen Sector Parameters</span>
                </div>
                <span className="text-outline-variant">•</span>
                <div className="flex items-center gap-space-2xs font-mono-metric-sm text-on-surface">
                  <span className="text-primary">◌</span>
                  <span>Real-time RC Network</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full bg-surface-container-low py-space-2xl">
          <div className="mx-auto max-w-7xl px-space-lg">
            <div className="mb-space-xl flex flex-col justify-between gap-space-sm md:flex-row md:items-end">
              <div>
                <span className="font-mono-metric-sm uppercase tracking-wider text-primary">Analytical Pipeline</span>
                <h2 className="mt-space-2xs font-headline-md text-on-surface">Sub-Zero Heat Flux Quantification Protocol</h2>
              </div>
              <div className="flex items-center gap-space-xs font-mono-metric-sm text-outline">
                <span>PIPELINE REVISION: PGML-2026.04</span>
                <span className="h-2 w-2 rounded-full bg-tertiary-fixed-dim" />
              </div>
            </div>

            <div className="relative grid gap-space-lg md:grid-cols-3">
              <div className="absolute left-0 right-0 top-1/2 z-0 hidden h-0.5 -translate-y-1/2 bg-surface-container-high md:block" />
              {pipelineSteps.map((step) => (
                <div key={step.number} className="relative z-10 flex flex-col rounded-lg bg-surface-container-lowest p-space-lg shadow-sm">
                  <div className="mb-space-sm flex items-center justify-between pb-space-sm">
                    <span className="rounded bg-surface-container px-space-xs py-0.5 font-mono-metric-sm font-semibold text-primary">{step.number}</span>
                    <span className="text-outline">⌂</span>
                  </div>
                  <h3 className="font-headline-sm text-on-surface">{step.title}</h3>
                  <p className="mt-space-xs flex-1 text-body-sm text-on-surface-variant">{step.description}</p>
                  <div className="mt-space-md space-y-1 rounded bg-surface-container-low p-space-xs font-mono-metric-sm text-outline">
                    {step.meta.map((item) => (
                      <div key={item} className="flex justify-between gap-space-sm">
                        <span>{item.split(":")[0]}:</span>
                        <span className="text-right text-on-surface">{item.split(":")[1]?.trim() ?? ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full bg-surface py-space-2xl">
          <div className="mx-auto max-w-7xl px-space-lg">
            <div className="grid gap-space-lg md:grid-cols-3">
              {[
                ["Convergence Metric", "±0.8°C", "Accuracy vs ANSYS FEM", "ISO 7730 / DEF-STAN"],
                ["Computational Speedup", "14,200x", "Faster than FEM", "FP32 TENSOR ACCEL"],
                ["Domain Corpus", "1,000+", "Physics Scenarios Trained On", "SYNTHETIC + IN-SITU"],
              ].map(([label, value, subtitle, tag]) => (
                <div key={label} className="rounded-lg border border-surface-container-high/60 bg-surface-container-lowest p-space-card-padding pt-space-xl shadow-sm">
                  <div className="mb-space-sm flex items-center justify-between gap-space-xs">
                    <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
                    <span className="rounded bg-surface-container px-space-xs py-0.5 font-mono-metric-sm text-primary">{tag}</span>
                  </div>
                  <div className="mt-space-xs font-mono-metric-lg font-bold tracking-tight text-on-surface">{value}</div>
                  <div className="mt-space-2xs text-headline-sm text-on-surface">{subtitle}</div>
                </div>
              ))}
            </div>

            <div className="mt-space-xl rounded-lg bg-surface-container-lowest p-space-card-padding shadow-sm">
              <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
                <div className="flex items-center gap-space-md">
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-surface-container text-primary">✦</div>
                  <div>
                    <h4 className="font-headline-sm text-on-surface">Scientific Verification Run: Siachen Forward Post #4B</h4>
                    <p className="font-mono-metric-sm text-outline">Coordinates: 35.4212° N, 77.1095° E • Elevation: 5,400m • External Ambient: -32.4°C</p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-space-sm py-1 font-mono-metric-sm text-tertiary-container">
                  <span className="h-2 w-2 rounded-full bg-tertiary-fixed-dim" />
                  SURROGATE CONVERGED (±0.34°C residual)
                </div>
              </div>

              <div className="mt-space-lg grid gap-space-md md:grid-cols-4">
                {[
                  ["Predicted Core Temp", "+19.4°C", "Target band: 18°C - 22°C"],
                  ["ANSYS Benchmark Temp", "+19.1°C", "Transient 3D mesh solution"],
                  ["Solar Flux Inflow", "682 W/m²", "South-facing glazing facade"],
                  ["Envelope Insulation", "R-8.6 m²K/W", "Composite Vacuum + PUF"],
                ].map(([label, value, sub]) => (
                  <div key={label} className="rounded bg-surface-container-low p-space-sm pt-space-xl">
                    <span className="block font-label-caps uppercase tracking-wider text-outline">{label}</span>
                    <span className="mt-0.5 block font-mono-metric-md font-bold text-on-surface">{value}</span>
                    <span className="mt-1 block text-body-sm text-outline">{sub}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </main>
  );
}
