import Link from "next/link";

export default function IndividualConfigurePage() {
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
              <span className="rounded bg-surface-container-high px-space-md py-space-xs text-primary">Configure</span>
              <Link href="/individual/results" className="rounded px-space-md py-space-xs text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
                Results
              </Link>
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
        <div className="mx-auto flex w-full max-w-7xl flex-col px-space-md py-space-xl md:px-space-xl">
          <div className="mb-space-xl flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-card-padding shadow-sm md:flex-row md:items-end md:justify-between">
            <div className="space-y-space-2xs">
              <div className="flex items-center gap-space-xs text-primary">
                <span className="font-mono-metric-sm uppercase tracking-wider">Parametric Quick-Setup</span>
                <span className="text-outline-variant">/</span>
                <span className="text-on-surface-variant">Defense Habitability Standard</span>
              </div>
              <h1 className="font-display-xl tracking-tight text-on-surface">Shelter Envelope Configuration</h1>
              <p className="w-full max-w-2xl text-body-md text-on-surface-variant">
                Quick shelter thermal assessment using proven Himalayan vernacular &amp; insulated presets.
              </p>
            </div>
            <div className="flex items-center gap-space-xs self-start rounded-full bg-surface-container-low px-space-md py-space-xs shadow-sm md:self-auto">
              <span className="text-primary">⌂</span>
              <span className="font-mono-metric-sm font-medium text-on-surface">Individual Mode</span>
              <span className="text-outline-variant">|</span>
              <Link href="/" className="font-mono-metric-sm text-primary hover:underline">
                Switch
              </Link>
            </div>
          </div>

          <section className="mb-space-xl rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="mb-space-lg flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">
                  01
                </span>
                <h2 className="font-headline-md text-on-surface">Geometry &amp; Spatial Volume</h2>
              </div>
              <span className="font-mono-metric-sm text-on-surface-variant">Cartesian Bounds (Meters)</span>
            </div>

            <div className="grid items-center gap-space-lg lg:grid-cols-12">
              <div className="grid gap-space-sm lg:col-span-6 lg:grid-cols-3">
                {[
                  { label: "Length (L)", value: "6.0", hint: "East-West" },
                  { label: "Width (W)", value: "4.0", hint: "North-South" },
                  { label: "Height (H)", value: "2.8", hint: "Clear Apex" },
                ].map((field) => (
                  <div key={field.label} className="space-y-space-2xs">
                    <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">{field.label}</label>
                    <div className="relative flex items-center">
                      <input
                        defaultValue={field.value}
                        className="w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none transition-colors focus:bg-surface-container-lowest"
                        type="number"
                      />
                      <span className="pointer-events-none absolute right-3 font-mono-metric-sm text-outline">m</span>
                    </div>
                    <span className="font-body-sm text-on-surface-variant">{field.hint}</span>
                  </div>
                ))}
              </div>

              <div className="flex min-h-[220px] flex-col justify-between gap-space-md rounded-lg bg-surface-container-low p-space-md lg:col-span-6 sm:flex-row">
                <div className="flex flex-1 items-center justify-center">
                  <svg viewBox="0 0 180 120" className="h-32 w-44 stroke-primary fill-transparent">
                    <polygon className="fill-surface-container-high/40 stroke-outline" points="30,75 90,105 150,75 90,45" />
                    <line className="stroke-primary" x1="30" x2="30" y1="75" y2="35" />
                    <line className="stroke-primary" x1="90" x2="90" y1="105" y2="65" />
                    <line className="stroke-primary" x1="150" x2="150" y1="75" y2="35" />
                    <polygon className="fill-surface-variant/40 stroke-primary" points="30,35 90,65 150,35 90,10" />
                    <text x="50" y="98" className="fill-on-surface-variant text-[9px] font-mono-metric-sm">L: 6.0m</text>
                    <text x="122" y="98" className="fill-on-surface-variant text-[9px] font-mono-metric-sm">W: 4.0m</text>
                    <text x="12" y="55" className="fill-primary text-[9px] font-mono-metric-sm">H: 2.8m</text>
                  </svg>
                </div>

                <div className="flex w-full gap-space-md sm:w-auto sm:flex-col">
                  <div className="flex-1 rounded bg-surface-container-lowest p-space-sm shadow-sm">
                    <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">Floor Area</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono-metric-lg font-semibold text-primary">24.0</span>
                      <span className="font-mono-metric-sm text-on-surface-variant">m²</span>
                    </div>
                  </div>
                  <div className="flex-1 rounded bg-surface-container-lowest p-space-sm shadow-sm">
                    <span className="block font-label-caps uppercase tracking-wider text-on-surface-variant">Enclosed Volume</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono-metric-lg font-semibold text-secondary">67.2</span>
                      <span className="font-mono-metric-sm text-on-surface-variant">m³</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-space-xl rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="mb-space-lg flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">
                  02
                </span>
                <h2 className="font-headline-md text-on-surface">Construction Presets (Simplified)</h2>
              </div>
              <span className="rounded-full bg-tertiary-fixed px-space-xs py-space-2xs font-mono-metric-sm text-on-tertiary-fixed">
                Himalayan Tested
              </span>
            </div>

            <div className="grid gap-space-md md:grid-cols-3">
              {[
                { title: "Wall Assembly", description: "Primary thermal envelope perimeter", color: "text-tertiary-container", dot: "bg-tertiary-container", label: "Passive solar retention" },
                { title: "Roof Assembly", description: "Overhead heat loss prevention", color: "text-secondary", dot: "bg-secondary", label: "Vernacular ceiling deck" },
                { title: "Floor Assembly", description: "Subgrade cold sink barrier", color: "text-tertiary-container", dot: "bg-tertiary-container", label: "Timber gap buffer" },
              ].map((preset) => (
                <div key={preset.title} className="flex flex-col justify-between space-y-space-xs rounded-lg bg-surface-container-low p-space-md">
                  <div className="space-y-space-2xs">
                    <div className="flex items-center gap-space-xs text-primary">
                      <span className="text-[20px]">▣</span>
                      <span className="font-headline-sm">{preset.title}</span>
                    </div>
                    <p className="font-body-sm text-on-surface-variant">{preset.description}</p>
                  </div>
                  <div className="relative">
                    <select className="w-full appearance-none rounded bg-surface-container-lowest px-space-sm py-space-xs text-body-sm text-on-surface shadow-sm focus:outline-none" defaultValue={0}>
                      <option>Adobe Wall (600mm) — Traditional High Thermal Mass</option>
                      <option>Stone Masonry Wall (600mm) — High-Altitude Vernacular</option>
                      <option>Rammed Earth Wall (500mm) — Natural Passive</option>
                    </select>
                    <span className="pointer-events-none absolute right-2 top-2.5 text-[18px] text-on-surface-variant">⌄</span>
                  </div>
                  <div className={`flex items-center gap-space-xs font-mono-metric-sm ${preset.color}`}>
                    <span className={`h-2 w-2 rounded-full ${preset.dot}`} />
                    <span>{preset.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-space-xl rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="mb-space-lg flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">
                  03
                </span>
                <h2 className="font-headline-md text-on-surface">Windows &amp; Daylight Glazing</h2>
              </div>
              <span className="font-mono-metric-sm text-on-surface-variant">Solar Gain Apertures</span>
            </div>

            <div className="grid gap-space-md sm:grid-cols-3">
              <div className="space-y-space-2xs">
                <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">Number of Windows</label>
                <div className="relative flex items-center">
                  <input defaultValue={2} className="w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="number" />
                  <span className="pointer-events-none absolute right-3 font-mono-metric-sm text-outline">units</span>
                </div>
                <span className="font-body-sm text-on-surface-variant">South/East facing priority</span>
              </div>

              <div className="space-y-space-2xs">
                <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">Dimensions (W x H)</label>
                <div className="grid grid-cols-2 gap-space-xs">
                  <div className="relative">
                    <input defaultValue={1.2} className="w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="number" />
                    <span className="pointer-events-none absolute right-2 top-2 text-outline">m</span>
                  </div>
                  <div className="relative">
                    <input defaultValue={1.5} className="w-full rounded bg-surface-container-low px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="number" />
                    <span className="pointer-events-none absolute right-2 top-2 text-outline">m</span>
                  </div>
                </div>
                <span className="font-body-sm text-on-surface-variant">Per aperture aperture area</span>
              </div>

              <div className="space-y-space-2xs">
                <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">Glazing Quality</label>
                <div className="relative">
                  <select className="w-full appearance-none rounded bg-surface-container-low px-space-sm py-space-xs text-body-sm text-on-surface focus:outline-none" defaultValue={1}>
                    <option>Single Glazing — Basic (Drafty)</option>
                    <option>Double Glazing — Better (Recommended)</option>
                    <option>Triple Glazing — Best Insulation (Arctic Grade)</option>
                  </select>
                  <span className="pointer-events-none absolute right-2 top-2.5 text-[18px] text-on-surface-variant">⌄</span>
                </div>
                <span className="font-body-sm text-on-surface-variant">Acoustic &amp; airtightness grade</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-surface-container-lowest p-card-padding shadow-sm">
            <div className="mb-space-lg flex items-center justify-between pb-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-sm font-mono-metric-sm font-semibold text-primary">
                  04
                </span>
                <h2 className="font-headline-md text-on-surface">Comfort &amp; Internal Heating</h2>
              </div>
              <span className="font-mono-metric-sm text-on-surface-variant">Occupancy &amp; Auxiliary Thermal</span>
            </div>

            <div className="space-y-space-lg">
              <div className="space-y-space-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-headline-sm text-on-surface">Initial Indoor Temperature</label>
                    <p className="font-body-sm text-on-surface-variant">Pre-simulation base interior shelter temperature</p>
                  </div>
                  <div className="rounded bg-surface-container-high px-space-sm py-space-2xs">
                    <span className="font-mono-metric-lg font-bold text-primary">+5.0</span>
                    <span className="font-mono-metric-sm text-primary">°C</span>
                  </div>
                </div>
                <input className="h-2 w-full cursor-pointer accent-primary" type="range" defaultValue={5} min={-10} max={22} step={0.5} />
                <div className="flex justify-between font-mono-metric-sm text-on-surface-variant">
                  <span>-10°C (Frozen)</span>
                  <span>+22°C (Warm)</span>
                </div>
              </div>

              <div className="grid gap-space-md lg:grid-cols-2">
                <div className="space-y-space-2xs rounded-lg bg-surface-container-low p-space-md">
                  <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">Hourly Occupancy Load</label>
                  <div className="flex items-center rounded bg-surface-container-lowest shadow-sm">
                    <input defaultValue={5} className="w-full bg-transparent px-space-sm py-space-xs font-mono-metric-md text-on-surface outline-none" type="number" />
                    <span className="bg-surface-container px-space-xs py-space-xs font-mono-metric-sm text-on-surface-variant">people</span>
                  </div>
                  <p className="font-body-sm text-on-surface-variant">Cumulative metabolic heat output and breathing load</p>
                </div>

                <div className="space-y-space-2xs rounded-lg bg-surface-container-low p-space-md">
                  <label className="block font-label-caps uppercase tracking-wider text-on-surface-variant">Heater Setting</label>
                  <div className="relative">
                    <select className="w-full appearance-none rounded bg-surface-container-lowest px-space-sm py-space-xs text-body-sm text-on-surface shadow-sm" defaultValue={1}>
                      <option>Off</option>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                    <span className="pointer-events-none absolute right-2 top-2.5 text-[18px] text-on-surface-variant">⌄</span>
                  </div>
                  <p className="font-body-sm text-on-surface-variant">Auxiliary heat and comfort reserve for overnight survival</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-space-md pt-space-md">
                <Link href="/" className="rounded bg-surface-container px-space-md py-space-sm text-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-high">
                  Cancel
                </Link>
                <Link href="/individual/results" className="rounded bg-primary px-space-md py-space-sm text-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container">
                  Run Simulation
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </main>
  );
}
