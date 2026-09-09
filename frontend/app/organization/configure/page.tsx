import Link from "next/link";

import DesignFlowNavigation from "@/components/navigation/DesignFlowNavigation";

export default function OrganizationConfigurePage() {
  return (
    <main className="min-h-screen bg-background text-on-surface antialiased">
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
            <div className="hidden md:block">
              <DesignFlowNavigation mode="organization" />
            </div>
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
            <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary md:flex">
              <span className="text-[18px]">◔</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full bg-surface pt-16">
        <section className="w-full bg-surface-container-low px-space-lg py-space-sm shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-sm">
              <div className="flex items-center gap-space-2xs rounded bg-surface-container-lowest px-space-sm py-space-2xs shadow-sm">
                <span className="text-primary">▣</span>
                <span className="font-headline-sm text-primary">Organization Mode</span>
                <span className="rounded bg-surface-variant px-space-2xs py-[1px] text-[10px] font-mono-metric-sm text-on-surface">TIER-IV CALIBRATION</span>
              </div>
              <span className="font-mono-metric-sm text-outline-variant">•</span>
              <span className="font-mono-metric-sm text-on-surface-variant">Defense Infrastructure &amp; Sub-Zero Habitat Taskforce</span>
            </div>
            <div className="flex items-center gap-space-md">
              <div className="flex items-center gap-space-xs font-mono-metric-sm text-on-surface-variant">
                <span className="h-2 w-2 rounded-full bg-tertiary-container" />
                <span>PGML Solver Matrix: Synchronized</span>
              </div>
              <Link href="/" className="flex items-center gap-space-2xs rounded bg-surface-container px-space-sm py-space-2xs font-headline-sm text-on-surface transition-colors hover:bg-surface-container-high">
                <span className="text-[16px]">↻</span>
                <span>Switch Mode</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="w-full px-space-lg py-space-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-space-xl">
            <div className="flex flex-col justify-between gap-space-lg md:flex-row md:items-end">
              <div className="w-full max-w-2xl">
                <div className="flex items-center gap-space-xs">
                  <span className="font-label-caps uppercase tracking-wider text-secondary">Module 04 // Parameter Formulation</span>
                  <span className="font-mono-metric-sm text-outline-variant">ID: ENV-SUBZERO-8802</span>
                </div>
                <h1 className="mt-space-xs font-display-xl tracking-tight text-on-surface">
                  Shelter Thermal Envelope &amp; Multi-Physics Boundary Setup
                </h1>
                <p className="mt-space-xs text-body-lg text-on-surface-variant">
                  Define spatial boundary conditions, multi-layer composite thermophysics, and micro-climate baselines.
                </p>
              </div>

              <div className="flex items-center self-start rounded bg-surface-container p-1 shadow-sm md:self-auto">
                <button type="button" className="rounded px-space-md py-space-xs text-body-sm font-headline-sm text-on-surface-variant">
                  Use Construction Presets
                </button>
                <button type="button" className="flex items-center gap-space-2xs rounded bg-primary px-space-md py-space-xs text-body-sm font-headline-sm text-on-primary shadow-sm">
                  <span className="text-[16px]">▣</span>
                  Custom Layer Builder
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
              <div className="mb-space-lg flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="h-4 w-2 rounded-sm bg-primary" />
                  <h2 className="font-headline-md text-on-surface">1. Geometry &amp; Spatial Volume</h2>
                </div>
                <span className="rounded bg-surface-container px-space-xs py-space-2xs font-mono-metric-sm text-on-surface-variant">Euler Boundary Grid: Hexahedral</span>
              </div>

              <div className="grid items-center gap-space-lg lg:grid-cols-12">
                <div className="flex flex-col gap-space-md lg:col-span-6">
                  <div className="grid grid-cols-3 gap-space-sm">
                    {[
                      { label: "Length (L)", value: "6.00", unit: "m" },
                      { label: "Width (W)", value: "4.00", unit: "m" },
                      { label: "Height (H)", value: "2.80", unit: "m" },
                    ].map((field) => (
                      <div key={field.label} className="flex flex-col gap-space-2xs">
                        <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">{field.label}</label>
                        <div className="flex items-center rounded bg-surface-container-low shadow-sm">
                          <input defaultValue={field.value} className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="number" />
                          <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">{field.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-space-sm pt-space-xs">
                    {[
                      ["ENCLOSED VOL.", "67.20", "m³"],
                      ["EXT. SURFACE", "104.00", "m²"],
                      ["FORM FACTOR (A/V)", "1.55", "m⁻¹"],
                    ].map(([label, value, unit]) => (
                      <div key={label} className="rounded bg-surface-container-low p-space-sm">
                        <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
                        <span className="font-mono-metric-lg font-bold text-primary">{value}</span>
                        <span className="font-mono-metric-sm text-on-surface-variant"> {unit}</span>
                      </div>
                    ))}
                  </div>
                  <p className="font-body-sm text-on-surface-variant">
                    Aspect ratio optimization automatically feeds convection face orientation vectors to the computational aerodynamic boundary kernel.
                  </p>
                </div>

                <div className="lg:col-span-6">
                  <div className="relative min-h-[220px] overflow-hidden rounded bg-surface-container-high p-space-md">
                    <div className="absolute left-space-xs top-space-xs flex items-center gap-space-2xs text-mono-metric-sm text-on-surface-variant">
                      <span>ISO PROJECTION: AXONOMETRIC 30°</span>
                    </div>
                    <div className="absolute bottom-space-xs right-space-xs flex items-center gap-space-2xs font-mono-metric-sm text-outline">
                      <span>SOLAR AZIMUTH: 184.2° SSE</span>
                    </div>
                    <svg viewBox="0 0 320 220" className="mx-auto h-44 w-64 text-primary" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M40 180 L160 210 L280 180 L160 150 Z" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeDasharray="2 2" strokeOpacity="0.15" />
                      <path d="M160 80 L80 120 M80 120 L80 170 M80 170 L160 210" stroke="currentColor" strokeDasharray="4 4" strokeOpacity="0.3" strokeWidth="1.5" />
                      <path d="M160 40 L240 80 L160 120 L80 80 Z" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" />
                      <path d="M80 80 L80 130 L160 170 L160 120 Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2" />
                      <path d="M240 80 L240 130 L160 170 L160 120 Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
                      <circle cx="80" cy="80" r="3" fill="currentColor" />
                      <circle cx="240" cy="80" r="3" fill="currentColor" />
                      <circle cx="160" cy="170" r="3" fill="currentColor" />
                      <circle cx="160" cy="40" r="3" fill="currentColor" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
              <div className="mb-space-lg flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="h-4 w-2 rounded-sm bg-primary" />
                  <h2 className="font-headline-md text-on-surface">2. Multi-Layer Envelope (Custom Layer Builder)</h2>
                </div>
                <span className="rounded bg-surface-container px-space-xs py-space-2xs font-label-caps text-tertiary-container">1D Fourier Conduction Coupled</span>
              </div>

              <div className="flex flex-col gap-space-md">
                {[
                  ["Exterior Wall Assembly", "Sub-zero Windward Exposure", "PUF Insulation Sandwich", "150", "0.22"],
                  ["Roof / Overhead Plenum", "Solar Irradiance & Snow Load Interface", "Multi-Tier Aerogel + Metal Decking", "200", "0.18"],
                  ["Floor / Sub-grade Foundation", "Permafrost & Glacial Till Coupling", "Extruded Polystyrene (XPS) + Vapor Screed", "120", "0.28"],
                ].map(([title, subtitle, profile, thickness, uValue]) => (
                  <div key={title} className="flex flex-col justify-between gap-space-md rounded bg-surface-container-low p-space-md md:flex-row md:items-center">
                    <div className="flex min-w-[200px] items-center gap-space-md">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-surface-container-highest text-primary">▣</div>
                      <div>
                        <span className="block font-headline-sm text-on-surface">{title}</span>
                        <span className="font-body-sm text-on-surface-variant">{subtitle}</span>
                      </div>
                    </div>
                    <div className="grid flex-1 grid-cols-1 gap-space-md sm:grid-cols-12">
                      <div className="sm:col-span-6">
                        <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">Core Material</label>
                        <select className="mt-space-2xs w-full rounded bg-surface-container-lowest px-space-sm py-space-xs text-body-sm text-on-surface shadow-sm" defaultValue={0}>
                          <option>{profile}</option>
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">Total Thickness</label>
                        <div className="mt-space-2xs flex items-center rounded bg-surface-container-lowest shadow-sm">
                          <input defaultValue={thickness} className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="number" />
                          <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">mm</span>
                        </div>
                      </div>
                      <div className="sm:col-span-3">
                        <span className="font-label-caps uppercase tracking-wider text-on-surface-variant">Thermal Transmittance</span>
                        <div className="mt-1 flex items-center gap-space-2xs rounded bg-surface-container-lowest px-space-sm py-space-2xs shadow-sm">
                          <span className="h-2 w-2 rounded-full bg-tertiary-container" />
                          <span className="font-mono-metric-md font-bold text-primary">{uValue}</span>
                          <span className="font-mono-metric-sm text-on-surface-variant">W/m²·K</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-surface-container-lowest p-card-padding shadow-sm">
              <div className="mb-space-lg flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-xs">
                  <span className="h-4 w-2 rounded-sm bg-secondary-container" />
                  <div className="flex items-center gap-space-xs">
                    <h2 className="font-headline-md text-on-surface">3. Advanced Thermal Parameters</h2>
                    <span className="rounded bg-secondary-fixed px-space-xs py-space-2xs font-mono-metric-sm text-secondary">ORGANIZATION ACCESS</span>
                  </div>
                </div>
                <span className="font-label-caps uppercase tracking-wider text-outline-variant">Convective &amp; Capacitive Matrices</span>
              </div>

              <div className="grid gap-space-lg md:grid-cols-2">
                <div className="rounded bg-surface-container-low p-space-md">
                  <div className="flex items-center gap-space-xs">
                    <span className="text-primary">◫</span>
                    <span className="font-headline-sm text-on-surface">Internal Capacitance (Contents)</span>
                  </div>
                  <div className="mt-space-md grid gap-space-sm sm:grid-cols-2">
                    <div className="flex flex-col gap-space-2xs">
                      <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">Contents Mass</label>
                      <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                        <input defaultValue={2400} className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="text" />
                        <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">kg</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-space-2xs">
                      <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">Specific Heat (Cp)</label>
                      <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                        <input defaultValue={1020} className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="text" />
                        <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">J/kg·K</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-space-md font-mono-metric-sm text-on-surface-variant">Computed Thermal Time Constant (τ): <strong className="text-on-surface">64.8 hrs</strong> damping effect on freeze surges.</p>
                </div>

                <div className="rounded bg-surface-container-low p-space-md">
                  <div className="flex items-center gap-space-xs">
                    <span className="text-primary">◌</span>
                    <span className="font-headline-sm text-on-surface">Boundary Heat Transfer Coefficients</span>
                  </div>
                  <div className="mt-space-md grid gap-space-sm sm:grid-cols-2">
                    <div className="flex flex-col gap-space-2xs">
                      <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">Inside Conv. (h_i)</label>
                      <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                        <input defaultValue={8.29} className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="text" />
                        <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">W/m²·K</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-space-2xs">
                      <label className="font-label-caps uppercase tracking-wider text-on-surface-variant">Outside Conv. (h_o)</label>
                      <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                        <input defaultValue={11.8} className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="text" />
                        <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">W/m²·K</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-space-md font-mono-metric-sm text-on-surface-variant">Wind-exposed boundary convection modeled using high-altitude force coefficient correction and snow-ice roughness adjusters.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-space-md pt-space-md">
              <Link href="/organization" className="rounded bg-surface-container px-space-md py-space-sm text-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-high">
                Back
              </Link>
              <Link href="/organization/results" className="rounded bg-primary px-space-md py-space-sm text-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container">
                Run Simulation
              </Link>
            </div>
          </div>
        </section>
      </main>
    </main>
  );
}
