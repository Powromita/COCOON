"use client";

import Link from "next/link";

import { useAuth } from "@/hooks/useAuth";

const stats = [
  { label: "Active designs", value: "07", detail: "2 ready to simulate" },
  { label: "Avg. comfort", value: "19.4°C", detail: "Within target band" },
  { label: "Projects saved", value: "12", detail: "Across 4 regions" },
  { label: "Simulation health", value: "98%", detail: "Stable this week" },
];

const recentDesigns = [
  { name: "Leh family shelter", status: "Ready to simulate", tag: "Individual" },
  { name: "Ladakh field lab", status: "Reviewing geometry", tag: "Organization" },
  { name: "Siachen cabin", status: "Saved yesterday", tag: "Archive" },
];

export default function HomePage() {
  const { session, logout } = useAuth();
  const userName = session?.user?.name ?? "Demo Designer";

  return (
    <main className="min-h-screen bg-background text-on-surface antialiased">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-label-caps uppercase tracking-[0.18em] text-primary">COCOON workspace</p>
              <h1 className="mt-1 font-display-lg text-on-surface">Welcome back, {userName}</h1>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/guide"
                className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-body-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-400/20"
              >
                User guide
              </Link>
              <Link
                href="/login"
                onClick={logout}
                className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-body-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
              >
                {session ? "Sign out" : "Sign in"}
              </Link>
              <Link
                href="/individual/configure"
                className="rounded-lg bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
              >
                Create New Design
              </Link>
            </div>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-4 shadow-sm">
              <p className="font-label-caps uppercase tracking-[0.16em] text-on-surface-variant">{stat.label}</p>
              <div className="mt-3 font-mono-metric-lg font-semibold text-on-surface">{stat.value}</div>
              <p className="mt-1 text-body-sm text-on-surface-variant">{stat.detail}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-headline-md text-on-surface">Quick start</h2>
              <span className="rounded-full bg-surface-container px-2 py-1 font-mono-metric-sm text-primary">
                Mock flow
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Link
                href="/individual/configure"
                className="group rounded-xl border border-surface-container-high bg-surface-container-low p-4 transition-colors hover:border-primary hover:bg-surface-container"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-on-primary">01</div>
                <p className="font-label-caps uppercase tracking-[0.16em] text-primary">Individual</p>
                <h3 className="mt-2 font-headline-sm text-on-surface">Create a shelter concept</h3>
                <p className="mt-2 text-body-sm text-on-surface-variant">
                  Start with location, climate, geometry, and materials for a quick thermal review.
                </p>
              </Link>

              <Link
                href="/organization"
                className="group rounded-xl border border-surface-container-high bg-surface-container-low p-4 transition-colors hover:border-primary hover:bg-surface-container"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary-container font-mono text-sm font-bold text-on-primary">02</div>
                <p className="font-label-caps uppercase tracking-[0.16em] text-primary">Organization</p>
                <h3 className="mt-2 font-headline-sm text-on-surface">Advanced engineering mode</h3>
                <p className="mt-2 text-body-sm text-on-surface-variant">
                  Review high-fidelity analysis, validation, and comparison workflows for field teams.
                </p>
              </Link>
            </div>
          </div>

          <aside className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-headline-md text-on-surface">Recent designs</h2>
              <Link href="/individual/configure" className="font-mono-metric-sm text-primary hover:underline">View all</Link>
            </div>

            <div className="space-y-3">
              {recentDesigns.map((design) => (
                <div key={design.name} className="rounded-lg border border-surface-container-high bg-surface-container-low p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-headline-sm text-on-surface">{design.name}</p>
                      <p className="mt-1 text-body-sm text-on-surface-variant">{design.status}</p>
                    </div>
                    <span className="rounded-full bg-surface-container px-2 py-1 font-label-caps uppercase tracking-[0.12em] text-primary">
                      {design.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
